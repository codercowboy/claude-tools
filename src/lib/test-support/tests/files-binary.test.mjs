// jason-code-side coverage for files.mjs + binary.mjs (fake page/download objects).
// Run: node --test conventions/tools/test-support/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAGIC, sniffType, expectMagic, captureDownload, readDownloadBytes, downloadBytes,
  uploadFile, countChangedPixels, canvasSignature,
} from '../files.mjs';
import {
  refCrc32, crc32, u16le, u32le, ascii, makePng, pngChunk, noisePaint, TINY_PNG_BUFFER, readStoreZip,
} from '../binary.mjs';

// Tiny independent STORE-zip writer for the test (single entry, method 0 or 8).
function zipOf(entries) {
  const locals = []; const cds = []; let off = 0;
  for (const { name, data, deflate } of entries) {
    const nm = Buffer.from(name); const comp = deflate ? zlib.deflateRawSync(data) : data;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(refCrc32(data), 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(refCrc32(data), 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(off, 42);
    locals.push(lh, nm, comp); cds.push(cd, nm); off += 30 + nm.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

test('refCrc32 matches the standard check value; crc32 alias', () => {
  const v = Buffer.from('123456789');
  assert.equal(refCrc32(v), 0xcbf43926);
  assert.equal(crc32, refCrc32);
});

test('u16le/u32le/ascii read little-endian and text', () => {
  const b = Buffer.from([0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0x41, 0x42]);
  assert.equal(u16le(b, 0), 0x1234);
  assert.equal(u32le(b, 2), 0x12345678);
  assert.equal(u32le(Buffer.from([255, 255, 255, 255]), 0), 0xffffffff);
  assert.equal(ascii(b, 6, 2), 'AB');
});

test('makePng builds a valid PNG: signature, IHDR dims, chunk CRCs, pixel round-trip', () => {
  const png = makePng(3, 2, (x, y) => [x * 50, y * 100, 7, 255]);
  assert.deepEqual(Array.from(png.subarray(0, 8)), MAGIC.PNG);
  assert.equal(png.readUInt32BE(16), 3); assert.equal(png.readUInt32BE(20), 2);
  let off = 8; const types = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off); const type = png.toString('ascii', off + 4, off + 8);
    const crc = png.readUInt32BE(off + 8 + len);
    assert.equal(crc, refCrc32(png.subarray(off + 4, off + 8 + len)), type + ' crc');
    types.push(type);
    if (type === 'IDAT') {
      const raw = zlib.inflateSync(png.subarray(off + 8, off + 8 + len));
      assert.equal(raw.length, (3 * 4 + 1) * 2);
      assert.deepEqual(Array.from(raw.subarray(1 + 4, 1 + 8)), [50, 0, 7, 255]); // x=1,y=0
      assert.deepEqual(Array.from(raw.subarray(13 + 1 + 8, 13 + 1 + 12)), [100, 100, 7, 255]); // x=2,y=1
    }
    off += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  assert.deepEqual(makePng(1, 1), makePng(1, 1, [200, 60, 120, 255])); // default solid
  assert.equal(pngChunk('IEND', Buffer.alloc(0)).length, 12);
  assert.equal(TINY_PNG_BUFFER.readUInt32BE(16), 1);
});

test('noisePaint is deterministic, opaque and non-flat', () => {
  const a = noisePaint(); const b = noisePaint();
  const pa = [a(), a(), a()]; const pb = [b(), b(), b()];
  assert.deepEqual(pa, pb);
  assert.ok(pa.every((p) => p[3] === 255));
  assert.notDeepEqual(pa[0], pa[1]);
});

test('readStoreZip walks EOCD -> central -> local for stored and deflated entries', () => {
  const zip = zipOf([
    { name: 'a.txt', data: Buffer.from('hello') },
    { name: 'dir/b.bin', data: Buffer.from('x'.repeat(200)), deflate: true },
  ]);
  const e = readStoreZip(zip);
  assert.deepEqual(e.map((x) => x.name), ['a.txt', 'dir/b.bin']);
  assert.equal(e[0].data.toString(), 'hello');
  assert.equal(e[0].crc, refCrc32(Buffer.from('hello')));
  assert.equal(e[1].method, 8);
  assert.equal(e[1].data.toString(), 'x'.repeat(200));
  assert.throws(() => readStoreZip(Buffer.from('nope')), /end-of-central/);
});

test('sniffType / expectMagic recognise PNG JPEG GIF PDF ZIP WEBP and reject others', () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.equal(sniffType(makePng(1, 1)), 'png');
  assert.equal(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniffType(Buffer.from('GIF89a')), 'gif');
  assert.equal(sniffType(Buffer.from('%PDF-1.7')), 'pdf');
  assert.equal(sniffType(Buffer.from([0x50, 0x4b, 3, 4])), 'zip');
  assert.equal(sniffType(webp), 'webp');
  assert.equal(sniffType(Buffer.from('RIFFxxxxWAVE')), null);
  expectMagic(webp, 'webp');
  assert.throws(() => expectMagic(makePng(1, 1), 'jpeg'), /expected jpeg.*got png/);
});

test('captureDownload / readDownloadBytes / downloadBytes', async () => {
  const tmp = path.join(os.tmpdir(), 'jbc-files-test-' + process.pid + '.bin');
  fs.writeFileSync(tmp, 'abc');
  try {
    const dl = { path: async () => tmp, suggestedFilename: () => 'x.bin', failure: async () => null };
    let clicked = false; let waitArgs;
    const page = { waitForEvent: async (...a) => { waitArgs = a; return dl; } };
    const got = await captureDownload(page, async () => { clicked = true; });
    assert.equal(got, dl); assert.ok(clicked); assert.equal(waitArgs[0], 'download');
    assert.equal((await readDownloadBytes(dl)).toString(), 'abc');
    const r = await downloadBytes(page, async () => {});
    assert.equal(r.filename, 'x.bin'); assert.equal(r.bytes.toString(), 'abc');
    await assert.rejects(readDownloadBytes({ path: async () => null, failure: async () => 'canceled' }), /canceled/);
  } finally { fs.rmSync(tmp, { force: true }); }
});

test('uploadFile accepts a testid or a locator', async () => {
  const calls = [];
  const loc = { setInputFiles: async (f) => calls.push(f) };
  const page = { getByTestId: (id) => { calls.push(id); return loc; } };
  const buffer = Buffer.from('z');
  await uploadFile(page, 'file-input', { name: 'a.png', mimeType: 'image/png', buffer });
  await uploadFile(page, loc, { name: 'b.png', mimeType: 'image/png', buffer });
  assert.equal(calls[0], 'file-input');
  assert.equal(calls[1].name, 'a.png'); assert.equal(calls[2].name, 'b.png');
});

test('uploadFile passes arrays and path strings straight through', async () => {
  const calls = [];
  const loc = { setInputFiles: async (f) => calls.push(f) };
  const page = { getByTestId: () => loc };
  const b = Buffer.from('z');
  const many = [{ name: 'a.png', mimeType: 'image/png', buffer: b }, { name: 'b.png', mimeType: 'image/png', buffer: b }];
  await uploadFile(page, 'x', many);
  await uploadFile(page, 'x', '/tmp/a.png');
  assert.equal(calls[0].length, 2); assert.equal(calls[1], '/tmp/a.png');
});

test('countChangedPixels counts differing RGBA pixels and rejects length mismatch', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8]; const b = [1, 2, 3, 4, 5, 6, 7, 9];
  assert.equal(countChangedPixels(a, a), 0);
  assert.equal(countChangedPixels(a, b), 1);
  assert.throws(() => countChangedPixels(a, [1]), /mismatch/);
});

test('canvasSignature forwards the selector to page.evaluate', async () => {
  let arg;
  const page = { evaluate: async (fn, sel) => { arg = sel; return { w: 1 }; } };
  assert.deepEqual(await canvasSignature(page, '#c'), { w: 1 });
  assert.equal(arg, '#c');
});
