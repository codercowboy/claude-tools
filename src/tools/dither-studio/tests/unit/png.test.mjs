// Unit tests for the hand-assembled indexed PNG-8 helpers (source/logic.mjs):
// CRC32, chunk framing, IHDR (color-type 3), PLTE, filter-type-0 scanlines and
// the full assembler. The DEFLATE pass the tool performs in the browser via
// CompressionStream is stood in here by node:zlib.deflateSync (both emit a zlib
// stream), and we inflate the IDAT back to confirm the raw scanlines are sane.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import {
  crc32,
  PNG_SIGNATURE,
  pngChunk,
  buildIHDRIndexed,
  buildPLTE,
  filterIndexRows,
  concatBytes,
  assembleIndexedPng,
} from '../../source/logic.mjs';

const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

test('crc32 matches the canonical "123456789" test vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes) >>> 0, 0xcbf43926);
});

test('crc32 of the empty input is 0', () => {
  assert.equal(crc32(new Uint8Array(0)) >>> 0, 0);
});

test('PNG_SIGNATURE is the 8-byte magic', () => {
  assert.deepEqual(Array.from(PNG_SIGNATURE), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('pngChunk frames length + type + data + a CRC over type||data', () => {
  const data = new Uint8Array([1, 2, 3, 4]);
  const chunk = pngChunk('IDAT', data);
  // 4 (len) + 4 (type) + 4 (data) + 4 (crc) = 16
  assert.equal(chunk.length, 16);
  assert.equal(be32(chunk, 0), 4, 'declared length is the data length');
  assert.equal(String.fromCharCode(chunk[4], chunk[5], chunk[6], chunk[7]), 'IDAT');
  // The CRC covers type+data (bytes 4..12).
  assert.equal(be32(chunk, 12), crc32(chunk.subarray(4, 12)) >>> 0);
});

test('buildIHDRIndexed declares 8-bit color-type-3 with the given dimensions', () => {
  const ihdr = buildIHDRIndexed(7, 5);
  // strip framing: [len][type "IHDR"][13-byte data][crc]
  assert.equal(String.fromCharCode(ihdr[4], ihdr[5], ihdr[6], ihdr[7]), 'IHDR');
  const d = ihdr.subarray(8, 8 + 13);
  assert.equal(be32(d, 0), 7, 'width');
  assert.equal(be32(d, 4), 5, 'height');
  assert.equal(d[8], 8, 'bit depth 8');
  assert.equal(d[9], 3, 'color type 3 (indexed)');
  assert.deepEqual(Array.from(d.subarray(10)), [0, 0, 0], 'compression/filter/interlace');
});

test('buildPLTE emits exactly 3 bytes per palette entry', () => {
  const pal = [[0, 0, 0], [255, 128, 64], [10, 20, 30]];
  const plte = buildPLTE(pal);
  assert.equal(be32(plte, 0), pal.length * 3, 'PLTE length = 3 × entries');
  const d = plte.subarray(8, 8 + pal.length * 3);
  assert.deepEqual(Array.from(d), [0, 0, 0, 255, 128, 64, 10, 20, 30]);
});

test('filterIndexRows prepends a 0 filter byte to each scanline', () => {
  const indices = new Uint8Array([1, 2, 3, 4, 5, 6]); // 3 wide, 2 tall
  const filtered = filterIndexRows(indices, 3, 2);
  assert.equal(filtered.length, 2 * (3 + 1));
  assert.deepEqual(Array.from(filtered), [0, 1, 2, 3, 0, 4, 5, 6]);
});

// Walk the assembled PNG chunk-by-chunk and confirm the structure is valid.
function walkChunks(png) {
  assert.deepEqual(Array.from(png.subarray(0, 8)), Array.from(PNG_SIGNATURE), 'signature');
  const chunks = [];
  let off = 8;
  while (off < png.length) {
    const len = be32(png, off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const dataStart = off + 8;
    const data = png.subarray(dataStart, dataStart + len);
    const storedCrc = be32(png, dataStart + len);
    const calcCrc = crc32(png.subarray(off + 4, dataStart + len)) >>> 0;
    assert.equal(storedCrc, calcCrc, type + ' chunk CRC');
    chunks.push({ type, len, data });
    off = dataStart + len + 4;
  }
  assert.equal(off, png.length, 'chunk lengths walk exactly to EOF');
  return chunks;
}

test('assembleIndexedPng emits a structurally valid indexed PNG whose IDAT inflates back', () => {
  const width = 4, height = 3;
  const palette = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 0, 255]];
  const indices = new Uint8Array([
    0, 1, 2, 3,
    3, 2, 1, 0,
    1, 1, 2, 2,
  ]);
  const filtered = filterIndexRows(indices, width, height);
  // Stand in for the browser CompressionStream('deflate'): a zlib stream.
  const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(filtered)));
  const png = assembleIndexedPng(width, height, palette, deflated);

  const chunks = walkChunks(png);
  const types = chunks.map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'PLTE', 'IDAT', 'IEND'], 'chunk order');

  // IHDR says color-type 3 at the right size.
  const ihdr = chunks[0].data;
  assert.equal(be32(ihdr, 0), width);
  assert.equal(be32(ihdr, 4), height);
  assert.equal(ihdr[9], 3, 'color type 3');

  // PLTE entry count matches the palette.
  assert.equal(chunks[1].len, palette.length * 3, 'PLTE size matches palette');

  // IEND is a zero-length terminator.
  assert.equal(chunks[3].len, 0);

  // The IDAT payload inflates back to the exact filtered scanlines.
  const idat = chunks[2].data;
  const inflated = new Uint8Array(zlib.inflateSync(Buffer.from(idat)));
  assert.deepEqual(Array.from(inflated), Array.from(filtered), 'IDAT round-trips to the scanlines');

  // And every filter byte is 0 (filter type "none"), rows are (width+1) each.
  for (let y = 0; y < height; y++) {
    assert.equal(inflated[y * (width + 1)], 0, 'row ' + y + ' filter byte');
  }
});

test('concatBytes joins byte arrays in order', () => {
  const out = concatBytes([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
  assert.deepEqual(Array.from(out), [1, 2, 3, 4, 5]);
});
