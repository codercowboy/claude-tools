// binary.mjs — pure, standalone binary fixtures + INDEPENDENT readers for e2e
// tests. Deliberately shares no code with the tools under test, so it can verify
// what they generate. Dependency-free (node:zlib only).
import zlib from 'node:zlib';

/** Reference CRC-32 (IEEE, as used by PNG/ZIP). Accepts Buffer/Uint8Array. */
export function refCrc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
export const crc32 = refCrc32;

export const u16le = (b, o) => b[o] | (b[o + 1] << 8);
export const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

export function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(refCrc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Valid 8-bit RGBA PNG. `paint` is either a [r,g,b,a] array (solid) or
 * (x,y) => [r,g,b,a] (called row-major). Default: [200,60,120,255].
 */
export function makePng(width, height, paint = [200, 60, 120, 255]) {
  const fn = typeof paint === 'function' ? paint : () => paint;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rowLen = width * 4;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    const off = y * (rowLen + 1); // filter byte 0 = none
    for (let x = 0; x < width; x++) {
      const px = fn(x, y);
      const p = off + 1 + x * 4;
      raw[p] = px[0]; raw[p + 1] = px[1]; raw[p + 2] = px[2]; raw[p + 3] = px[3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Deterministic noise painter (LCG) — opaque, non-flat pixels, e.g. for LSB carriers. */
export function noisePaint(seed = 0x1234) {
  let s = seed >>> 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 8) & 0xff; };
  return () => [next(), next(), next(), 255];
}

/** A 1x1 opaque PNG (fixed bytes). */
export const TINY_PNG_BUFFER = makePng(1, 1, [255, 0, 255, 255]);

/**
 * Independent ZIP reader: EOCD -> central directory -> local headers.
 * Returns [{name, method, crc, compSize, size, localOffset, data}] where `data`
 * is the stored (method 0) or inflated (method 8) content. Throws on malformed input.
 */
export function readStoreZip(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32le(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP: end-of-central-directory not found');
  const count = u16le(b, eocd + 10);
  let off = u32le(b, eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (u32le(b, off) !== 0x02014b50) throw new Error('ZIP: bad central header at ' + off);
    const method = u16le(b, off + 10);
    const crc = u32le(b, off + 16);
    const compSize = u32le(b, off + 20);
    const size = u32le(b, off + 24);
    const nameLen = u16le(b, off + 28);
    const extraLen = u16le(b, off + 30);
    const commentLen = u16le(b, off + 32);
    const localOffset = u32le(b, off + 42);
    const name = b.toString('utf8', off + 46, off + 46 + nameLen);
    if (u32le(b, localOffset) !== 0x04034b50) throw new Error('ZIP: bad local header for ' + name);
    const dataStart = localOffset + 30 + u16le(b, localOffset + 26) + u16le(b, localOffset + 28);
    const stored = b.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? stored : method === 8 ? zlib.inflateRawSync(stored) : null;
    entries.push({ name, method, crc, compSize, size, localOffset, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
