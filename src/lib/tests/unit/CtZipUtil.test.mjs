// Unit tests for CtZipUtil: u16le / u32le (LE writers over a DataView) and storeZip
// (hand-rolled STORE-only ZIP). Run: node --test src/lib/tests/
//
// Ported/adapted from claude-tools-dev/src/tools/{favicon-kit,sprite-packer,srcset-builder,
// tile-cutter}/tests/unit/zip.test.mjs (byte-level header asserts kept). Validity is proven by
// (a) an independent central-directory parser round-trip and (b) the system `unzip -t` when present.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { u16le, u32le, storeZip } from '../../utils/CtZipUtil.mjs';
import { crc32 } from '../../utils/CtByteUtil.mjs';

const LFH_SIG = 0x04034b50, CDH_SIG = 0x02014b50, EOCD_SIG = 0x06054b50;
const ascii = (s) => new TextEncoder().encode(s);
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join(' ');
const rd16 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(o, true);
const rd32 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);

/** Independent parser: EOCD -> central directory -> local data slice. */
function parseZip(zip) {
  const eocd = zip.length - 22;
  assert.equal(rd32(zip, eocd), EOCD_SIG, 'EOCD present at end');
  const count = rd16(zip, eocd + 10);
  let p = rd32(zip, eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(rd32(zip, p), CDH_SIG, 'central signature');
    const size = rd32(zip, p + 24), nameLen = rd16(zip, p + 28), lho = rd32(zip, p + 42);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    assert.equal(rd32(zip, lho), LFH_SIG, 'local signature at central offset');
    const lNameLen = rd16(zip, lho + 26), lExtra = rd16(zip, lho + 28);
    const start = lho + 30 + lNameLen + lExtra;
    out.push({
      name, bytes: zip.slice(start, start + size), crc: rd32(zip, p + 16),
      localCrc: rd32(zip, lho + 14), localSize: rd32(zip, lho + 18), lho, start, size,
    });
    p += 46 + nameLen;
  }
  return out;
}

const sample = () => [
  { name: 'favicon-16.png', bytes: new Uint8Array([1, 2, 3, 4, 5]) },
  { name: 'manifest.json', bytes: ascii('{"name":"x"}') },
  { name: 'head.html', bytes: ascii('<link>') },
];

// ---------------------------------------------------------------- u16le / u32le
test('u16le: writes 2 LE bytes at offset, neighbors untouched', () => {
  const b = new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
  u16le(new DataView(b.buffer), 1, 0x1234);
  assert.equal(hex(b), 'aa 34 12 aa aa');
});

test('u16le: boundary values 0, 1, 0xFF, 0xFFFF', () => {
  const cases = [[0, '00 00'], [1, '01 00'], [0xff, 'ff 00'], [0x100, '00 01'], [0xffff, 'ff ff']];
  for (const [v, want] of cases) {
    const b = new Uint8Array(2);
    u16le(new DataView(b.buffer), 0, v);
    assert.equal(hex(b), want, `value ${v}`);
  }
});

test('u16le: masks values above 16 bits', () => {
  const b = new Uint8Array(2);
  u16le(new DataView(b.buffer), 0, 0x12345);
  assert.equal(hex(b), '45 23');
});

test('u32le: PK signature 0x04034b50 -> 50 4b 03 04', () => {
  const b = new Uint8Array(4);
  u32le(new DataView(b.buffer), 0, 0x04034b50);
  assert.equal(hex(b), '50 4b 03 04');
});

test('u32le: other ZIP signatures', () => {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  u32le(v, 0, CDH_SIG);
  u32le(v, 4, EOCD_SIG);
  assert.equal(hex(b), '50 4b 01 02 50 4b 05 06');
});

test('u32le: boundary values 0, 1, 0xFF, 0xFFFF, 0xFFFFFFFF, mid', () => {
  const cases = [
    [0, '00 00 00 00'], [1, '01 00 00 00'], [0xff, 'ff 00 00 00'], [0xffff, 'ff ff 00 00'],
    [0xffffffff, 'ff ff ff ff'], [0x12345678, '78 56 34 12'], [0x80000000, '00 00 00 80'],
  ];
  for (const [val, want] of cases) {
    const b = new Uint8Array(4);
    u32le(new DataView(b.buffer), 0, val);
    assert.equal(hex(b), want, `value ${val}`);
  }
});

test('u32le: occupies exactly 4 bytes at offset; neighbors untouched', () => {
  const b = new Uint8Array(8).fill(0x55);
  u32le(new DataView(b.buffer), 2, 0xdeadbeef);
  assert.equal(hex(b), '55 55 ef be ad de 55 55');
});

test('u32le: wraps values above 32 bits and negatives via >>> 0', () => {
  const b = new Uint8Array(4);
  const v = new DataView(b.buffer);
  u32le(v, 0, 0x1_0000_0001);
  assert.equal(v.getUint32(0, true), 1);
  u32le(v, 0, -1);
  assert.equal(hex(b), 'ff ff ff ff');
});

test('u16le/u32le return undefined (they write, not return bytes)', () => {
  const v = new DataView(new ArrayBuffer(4));
  assert.equal(u16le(v, 0, 1), undefined);
  assert.equal(u32le(v, 0, 1), undefined);
});

// ---------------------------------------------------------------- storeZip structure
test('storeZip: returns a Uint8Array starting with PK\\x03\\x04', () => {
  const zip = storeZip(sample());
  assert.ok(zip instanceof Uint8Array);
  assert.equal(hex(zip.subarray(0, 4)), '50 4b 03 04');
});

test('storeZip: ends with 22-byte EOCD (PK\\x05\\x06), zero comment', () => {
  const zip = storeZip(sample());
  const e = zip.length - 22;
  assert.equal(hex(zip.subarray(e, e + 4)), '50 4b 05 06');
  assert.equal(rd16(zip, e + 4), 0, 'disk number');
  assert.equal(rd16(zip, e + 6), 0, 'cd start disk');
  assert.equal(rd16(zip, e + 20), 0, 'comment length');
});

test('storeZip: EOCD entry count (both fields) equals file count', () => {
  const files = sample();
  const zip = storeZip(files);
  const e = zip.length - 22;
  assert.equal(rd16(zip, e + 8), files.length);
  assert.equal(rd16(zip, e + 10), files.length);
});

test('storeZip: EOCD cd offset/size locate central dir (PK\\x01\\x02) ending at EOCD', () => {
  const zip = storeZip(sample());
  const e = zip.length - 22;
  const off = rd32(zip, e + 16), size = rd32(zip, e + 12);
  assert.equal(hex(zip.subarray(off, off + 4)), '50 4b 01 02');
  assert.equal(off + size, e);
});

test('storeZip: exactly one local + one central header per file (signature scan)', () => {
  const files = sample();
  const zip = storeZip(files);
  // Payloads here are tiny and signature-free, so a raw scan is exact.
  let l = 0, c = 0;
  for (let i = 0; i + 4 <= zip.length; i++) {
    const s = rd32(zip, i);
    if (s === LFH_SIG) l++; else if (s === CDH_SIG) c++;
  }
  assert.equal(l, files.length);
  assert.equal(c, files.length);
});

test('storeZip: local header fields (version 20, flags 0, STORE, time/date 0, extra 0)', () => {
  const files = sample();
  const zip = storeZip(files);
  let off = 0;
  for (const f of files) {
    assert.equal(rd32(zip, off), LFH_SIG);
    assert.equal(rd16(zip, off + 4), 20, 'version needed');
    assert.equal(rd16(zip, off + 6), 0, 'flags');
    assert.equal(rd16(zip, off + 8), 0, 'method store');
    assert.equal(rd16(zip, off + 10), 0, 'time');
    assert.equal(rd16(zip, off + 12), 0, 'date');
    assert.equal(rd32(zip, off + 14), crc32(f.bytes), 'local crc == crc32(content)');
    assert.equal(rd32(zip, off + 18), f.bytes.length, 'compressed size');
    assert.equal(rd32(zip, off + 22), f.bytes.length, 'uncompressed size');
    assert.equal(rd16(zip, off + 26), ascii(f.name).length, 'name length');
    assert.equal(rd16(zip, off + 28), 0, 'extra length');
    assert.equal(new TextDecoder().decode(zip.subarray(off + 30, off + 30 + ascii(f.name).length)), f.name);
    off += 30 + ascii(f.name).length + f.bytes.length;
  }
});

test('storeZip: central header fields + CRC cross-check + local offsets', () => {
  const files = sample();
  const zip = storeZip(files);
  const e = zip.length - 22;
  let p = rd32(zip, e + 16);
  let localOff = 0;
  for (const f of files) {
    const nl = ascii(f.name).length;
    assert.equal(rd32(zip, p), CDH_SIG);
    assert.equal(rd16(zip, p + 4), 20, 'version made by');
    assert.equal(rd16(zip, p + 6), 20, 'version needed');
    assert.equal(rd16(zip, p + 10), 0, 'method store');
    assert.equal(rd32(zip, p + 16), crc32(f.bytes), 'central crc == crc32(content)');
    assert.equal(rd32(zip, p + 20), f.bytes.length);
    assert.equal(rd32(zip, p + 24), f.bytes.length);
    assert.equal(rd16(zip, p + 28), nl);
    assert.equal(rd16(zip, p + 30), 0, 'extra');
    assert.equal(rd16(zip, p + 32), 0, 'comment');
    assert.equal(rd32(zip, p + 42), localOff, 'local header offset');
    localOff += 30 + nl + f.bytes.length;
    p += 46 + nl;
  }
  assert.equal(p, e, 'central records tile exactly up to EOCD');
});

test('storeZip: total length = sum(30+name+data) + sum(46+name) + 22', () => {
  const files = sample();
  const expected = files.reduce((n, f) => n + 30 + ascii(f.name).length + f.bytes.length + 46 + ascii(f.name).length, 22);
  assert.equal(storeZip(files).length, expected);
});

test('storeZip: known CRCs (123456789 -> 0xCBF43926)', () => {
  const zip = storeZip([{ name: 'a.txt', bytes: ascii('123456789') }]);
  assert.equal(rd32(zip, 14), 0xcbf43926);
});

test('storeZip: deterministic (same input -> identical bytes)', () => {
  assert.deepEqual(storeZip(sample()), storeZip(sample()));
});

// ---------------------------------------------------------------- edge cases + round-trip
test('storeZip: single file round-trips', () => {
  const files = [{ name: 'one.txt', bytes: ascii('hello') }];
  const got = parseZip(storeZip(files));
  assert.equal(got.length, 1);
  assert.equal(got[0].name, 'one.txt');
  assert.deepEqual(got[0].bytes, files[0].bytes);
});

test('storeZip: multiple files round-trip in order, CRCs match', () => {
  const files = sample();
  const got = parseZip(storeZip(files));
  assert.deepEqual(got.map((g) => g.name), files.map((f) => f.name));
  files.forEach((f, i) => {
    assert.deepEqual(got[i].bytes, f.bytes);
    assert.equal(got[i].crc, crc32(f.bytes));
    assert.equal(got[i].localCrc, got[i].crc, 'local == central crc');
    assert.equal(got[i].localSize, f.bytes.length);
  });
});

test('storeZip: empty file (zero bytes): crc 0, size 0, round-trips', () => {
  const zip = storeZip([{ name: 'empty.txt', bytes: new Uint8Array(0) }, { name: 'after.txt', bytes: ascii('x') }]);
  const got = parseZip(zip);
  assert.equal(got[0].size, 0);
  assert.equal(got[0].crc, 0);
  assert.equal(got[0].bytes.length, 0);
  assert.deepEqual(got[1].bytes, ascii('x'));
});

test('storeZip: empty archive is exactly the 22-byte EOCD', () => {
  const zip = storeZip([]);
  assert.equal(zip.length, 22);
  assert.equal(hex(zip.subarray(0, 4)), '50 4b 05 06');
  assert.equal(rd16(zip, 8), 0);
  assert.equal(rd16(zip, 10), 0);
  assert.equal(rd32(zip, 12), 0, 'cd size');
  assert.equal(rd32(zip, 16), 0, 'cd offset');
  assert.deepEqual(parseZip(zip), []);
});

test('storeZip: binary content (all 256 byte values, incl. PK-like bytes) round-trips', () => {
  const bin = new Uint8Array(1024);
  for (let i = 0; i < bin.length; i++) bin[i] = i & 0xff;
  bin.set([0x50, 0x4b, 0x03, 0x04], 100); // embedded fake local-header signature
  const got = parseZip(storeZip([{ name: 'bin.dat', bytes: bin }]));
  assert.deepEqual(got[0].bytes, bin);
  assert.equal(got[0].crc, crc32(bin));
});

test('storeZip: accepts plain array / ArrayBuffer-like bytes', () => {
  const got = parseZip(storeZip([{ name: 'arr.bin', bytes: [9, 8, 7] }]));
  assert.deepEqual(Array.from(got[0].bytes), [9, 8, 7]);
});

test('storeZip: unicode filename is UTF-8 encoded, length in bytes, round-trips', () => {
  const name = 'héllo-世界-🙂.txt';
  const nameBytes = new TextEncoder().encode(name);
  assert.ok(nameBytes.length > name.length, 'multi-byte name');
  const zip = storeZip([{ name, bytes: ascii('u') }]);
  assert.equal(rd16(zip, 6), 0x0800, 'UTF-8 general-purpose bit 11 set for non-ASCII name [#1014-O]');
  assert.equal(rd16(zip, 26), nameBytes.length, 'local name length is byte length');
  assert.equal(hex(zip.subarray(30, 30 + nameBytes.length)), hex(nameBytes));
  const got = parseZip(zip);
  assert.equal(got[0].name, name);
  assert.deepEqual(got[0].bytes, ascii('u'));
});

test('storeZip: paths with directories in names preserved verbatim', () => {
  const got = parseZip(storeZip([{ name: 'icons/16/a.png', bytes: new Uint8Array([1]) }]));
  assert.equal(got[0].name, 'icons/16/a.png');
});

test('storeZip: larger payload offsets stay consistent', () => {
  const big = new Uint8Array(70000).map((_, i) => (i * 7) & 0xff);
  const files = [{ name: 'big.bin', bytes: big }, { name: 's.txt', bytes: ascii('s') }];
  const got = parseZip(storeZip(files));
  assert.deepEqual(got[0].bytes, big);
  assert.deepEqual(got[1].bytes, ascii('s'));
  assert.equal(got[1].lho, 30 + 7 + big.length);
});

test('storeZip: output is a valid archive per system unzip -t (skipped if unavailable)', (t) => {
  const probe = spawnSync('unzip', ['-v']);
  if (probe.error || probe.status !== 0) return t.skip('unzip not available');
  const files = [...sample(), { name: 'empty.txt', bytes: new Uint8Array(0) }, { name: 'ü.txt', bytes: ascii('ü') }];
  const dir = mkdtempSync(join(tmpdir(), 'ctzip-'));
  const f = join(dir, 'a.zip');
  writeFileSync(f, storeZip(files));
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No errors detected/);
  const cat = spawnSync('unzip', ['-p', f, 'manifest.json']);
  assert.equal(cat.stdout.toString(), '{"name":"x"}');
  assert.equal(readFileSync(f).length, storeZip(files).length);
});
