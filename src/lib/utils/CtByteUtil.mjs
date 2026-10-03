// ===== Begin CtByteUtil (ES module) =====
/*
 * CtByteUtil — byte-level utilities: CRC-32, base64/base64url, byte-size
 * formatting, and the hand-rolled hash engine.
 * ---------------------------------------------------------------------------
 * ONE module, built by merging the former crc32.js / crc32.mjs / base64.mjs /
 * formatBytes.mjs / hasher.mjs (jbc ES6 modularization · Train 35 · R4a). Every
 * function is a NAMED export defined once (single implementation); the
 * `CtByteUtil` class at the bottom is a thin aggregator whose static members
 * REFERENCE those functions — it never reimplements anything. Consumers pick
 * whichever shape they like:
 *   import { crc32 } from '../../jbc-include/CtByteUtil.mjs';
 *   import { CtByteUtil } from '../../jbc-include/CtByteUtil.mjs';  // CtByteUtil.crc32(...)
 *
 * The old crc32.js paste-in browser global is GONE: crc32.js and
 * crc32.mjs computed the identical reflected 0xedb88320 CRC-32 (proven
 * bit-identical over a vector set), so they are merged into the single `crc32`
 * below. getRandomBytes + makeId (ex util.js) live in the "random" section below (R12).
 *
 * Node-importable ES module; the single-file build inlines this module body into
 * the shipped index.html — stripping each `export` — so the shipped tool stays
 * dependency-free and file://-openable.
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// =====================================================================
// Section: crc32  (was crc32.mjs, and the retired crc32.js global)
// =====================================================================
/*
 * crc32(bytes) -> uint32
 * ---------------------------------------------------------------------------
 * CRC-32 (ISO 3309 / ITU-T V.42 / PNG / ZIP) over a byte sequence, returned as
 * an unsigned 32-bit integer. This is the standard reflected CRC with the
 * 0xedb88320 polynomial — the exact checksum the PNG chunk format and the ZIP
 * local/central records require. `bytes` is any indexed, length-bearing byte
 * source (Uint8Array or a plain array of 0..255).
 *
 * Node-importable ES-module twin of crc32.js's paste-only browser global. A
 * tool whose pure, unit-tested source/logic.mjs needs CRC-32 imports this
 * module directly (so `node --test` can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping the `export` — so the
 * shipped tool stays dependency-free and file://-openable. See the consuming
 * repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// =====================================================================
// Section: base64  (was base64.mjs — jbcBase64)
// =====================================================================
/*
 * base64 / base64url codec helpers
 * ---------------------------------------------------------------------------
 * Two small, dependency-free base64 helpers a pure, unit-tested source/logic.mjs
 * reaches for — an encoder and a base64url decoder. Both rely only on the
 * platform globals that exist in both a browser and Node >= 16 (`atob`/`btoa`,
 * `TextEncoder`/`Uint8Array`), so `node --test` can import the module directly.
 *
 *   base64UrlToBytes(input) -> Uint8Array
 *     Decode a base64url (or standard) string to raw bytes. Strips whitespace,
 *     tolerates missing padding (URL-safe/JWT segments are unpadded by spec),
 *     maps the URL-safe alphabet (`-`/`_`) onto standard (`+`/`/`), validates the
 *     alphabet + length, and throws a friendly Error otherwise. (The Error text
 *     says "segment" — its original JWT-decoding context — preserved verbatim so
 *     existing consumers' messages/tests stay byte-stable.)
 *
 *   utf8ToBase64(str) -> string
 *     Encode a JS string to STANDARD base64 (with padding), UTF-8-safe: `btoa`
 *     alone only accepts Latin1 and throws on multi-byte characters (accents,
 *     emoji), so the string is first encoded to UTF-8 bytes, turned into a
 *     Latin1-safe binary string, then `btoa`'d.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs base64 imports this module directly (so `node --test` can load it); the
 * single-file build inlines this module body into the shipped index.html —
 * stripping the `export` — so the shipped tool stays dependency-free and
 * file://-openable. See the consuming repo's build docs (§ "Build-assembled
 * tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function base64UrlToBytes(input) {
  let s = String(input == null ? '' : input).replace(/\s+/g, '');
  if (s === '') throw new Error('Empty segment.');
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const rem = s.length % 4;
  if (rem === 1) throw new Error('Invalid base64url length.');
  if (rem === 2) s += '==';
  else if (rem === 3) s += '=';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw new Error('Segment contains characters outside the base64url alphabet.');
  }
  let binary;
  try {
    binary = atob(s);
  } catch {
    throw new Error('Segment is not valid base64url.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// =====================================================================
// Section: formatBytes  (was formatBytes.mjs — jbcFormatBytes)
// =====================================================================
/*
 * formatBytes(bytes, opts?) -> string
 * ---------------------------------------------------------------------------
 * Human-readable byte count for a file/blob size readout. With NO options it is
 * the logic-layer default several tools hand-rolled: an integer count of bytes
 * with a " B" suffix below 1 KiB, otherwise one decimal place in binary (1024)
 * tiers — KB, MB, GB (capped at GB). A space separates the number and the unit
 * ("1.5 KB", "976.6 KB", "931.3 GB"). `bytes` is coerced with `Number(bytes) ||
 * 0`, so a non-numeric or NaN argument formats as "0 B". NOTE: ±Infinity is
 * truthy, so it is NOT coerced to 0 — it survives and tops out in the capped GB
 * tier ("Infinity GB" / "-Infinity B"). Pass `invalid` to show a sentinel for
 * non-finite input instead (#1014-O: this note corrects the earlier "non-finite → 0 B").
 *
 * This is THE byte formatter for the whole library (R16): the old compact app-layer variant
 * (no space, lowercase "b", two decimals, a TB tier) was removed from CtUtil, and every
 * consumer now calls this one. Callers that want a different shape pass `opts`.
 *
 * OPTIONS (all optional; the DEFAULT reproduces the historical behavior exactly,
 * so an option-free call is byte-identical to the pre-parameterization function):
 *   base      1024 (default) | 1000 — the tier divisor. Pass 1000 for a
 *             decimal-SI readout (rest-tester).
 *   decimals  1 (default) | a number | a function(value) => number — the digits
 *             after the decimal point for the scaled value. A function receives
 *             the SCALED value (the number shown before the unit) so a consumer
 *             can vary precision by magnitude, e.g. `v => v < 10 ? 2 : 1`
 *             (image-metadata).
 *   space     true (default) | false — whether a single space separates the
 *             number and the unit.
 *   units     ['KB','MB','GB'] (default) — the ascending tier labels (the last
 *             one caps growth).
 *   byteUnit  'B' (default) — the sub-`base` unit label.
 *   invalid   undefined (default: coerce a non-finite/missing input to 0 via
 *             `Number(bytes) || 0` → "0 B") | a string returned verbatim when
 *             the input is invalid. Lets a consumer show its own sentinel
 *             ("" for image-metadata, "—" for rest-tester).
 *   invalidWhen  a predicate(bytes) => boolean deciding what counts as invalid;
 *             only consulted when `invalid` is set. Defaults to
 *             `!Number.isFinite(bytes)` (catches NaN and ±Infinity, matching
 *             rest-tester). Pass `n => n == null || isNaN(n)` to mirror a
 *             null/NaN-only guard (image-metadata).
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs a byte-size readout imports this module directly (so `node --test` can
 * load it); the single-file build inlines this module body into the shipped
 * index.html — stripping the `export` — so the shipped tool stays
 * dependency-free and file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function formatBytes(bytes, opts) {
  opts = opts || {};
  const base = opts.base || 1024;
  const sep = opts.space === false ? '' : ' ';
  const units = opts.units || ['KB', 'MB', 'GB'];
  const byteUnit = opts.byteUnit || 'B';
  const decimals = opts.decimals == null ? 1 : opts.decimals;
  let n;
  if (opts.invalid != null) {
    const bad = opts.invalidWhen ? opts.invalidWhen(bytes) : !Number.isFinite(bytes);
    if (bad) return opts.invalid;
    n = Number(bytes);
  } else {
    n = Number(bytes) || 0;
  }
  if (n < base) return `${n}${sep}${byteUnit}`;
  let value = n / base;
  let i = 0;
  while (value >= base && i < units.length - 1) {
    value /= base;
    i++;
  }
  const d = (typeof decimals === 'function') ? decimals(value) : decimals;
  return `${value.toFixed(d)}${sep}${units[i]}`;
}

// =====================================================================
// Section: hasher  (was hasher.mjs — jbcHasher; its crc32 import is now the
// in-module `crc32` above, and its exports are inline)
// =====================================================================
/*
 * jbcHasher — hand-rolled hash engine (crypto + non-crypto).
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module. Every digest is hand-rolled (no
 * crypto.subtle.*, which is secure-context-only and would break over plain LAN
 * HTTP): MD5, SHA-1, SHA-256, SHA-512 (BigInt), and HMAC (RFC 2104) over any of
 * them, plus byte / hex / base64 encoders. Operates on Uint8Array; encoders are
 * hand-rolled too so the module runs unchanged under node --test. CRC-32 is
 * imported from the sibling crc32.mjs and re-exported (with the crc32Hex hex
 * wrapper) so one import covers every algorithm a hasher UI offers.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs hashing imports this
 * module directly (so node --test can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each export and
 * hoisting the crc32 dependency once — so the shipped tool stays dependency-free
 * and file://-openable. See the consuming repo's build docs (import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// --- encoders -----------------------------------------------------------

export function textToBytes(str) {
  return new TextEncoder().encode(String(str ?? ''));
}

const HEX = '0123456789abcdef';
export function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

// --- CRC32 (table-driven, IEEE polynomial 0xEDB88320) -------------------
// crc32 is imported from the shared Node-importable module instead of a local
// copy; the single-file build inlines its body into the shipped index.html
// (stripping the `export`), so runtime stays dependency-free. Re-exported via
// the export block below (with crc32Hex, which stays local) so tests/unit and
// the app hook see both.
export function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, '0');
}

// --- shared padding -----------------------------------------------------
// Append 0x80, zero-fill to a block boundary leaving room for a 64-bit
// bit-length written into the final 8 bytes of the final block. blockSize is
// 64 (MD5/SHA-1/SHA-256, 8-byte length field) or 128 (SHA-512, 16-byte length
// field). Only the low 64 bits of the length are written; SHA-512's upper 8
// bytes stay zero (fine for any real input). littleEndianLen picks MD5's LE
// length vs the SHA family's BE length.
function padMessage(msg, blockSize, littleEndianLen, lenFieldBytes) {
  const msgLen = msg.length;
  const bitLen = msgLen * 8; // exact JS number well past any file we'll hash
  let total = msgLen + 1 + lenFieldBytes;     // 0x80 + length field
  total = Math.ceil(total / blockSize) * blockSize;
  const padded = new Uint8Array(total);
  padded.set(msg);
  padded[msgLen] = 0x80;
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 0x100000000) >>> 0;
  const dv = new DataView(padded.buffer);
  if (littleEndianLen) {
    dv.setUint32(total - 8, lo, true);
    dv.setUint32(total - 4, hi, true);
  } else {
    dv.setUint32(total - 4, lo, false);
    dv.setUint32(total - 8, hi, false);
  }
  return padded;
}

// --- MD5 ----------------------------------------------------------------

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = (() => {
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  return k;
})();

function rotl32(x, c) { return ((x << c) | (x >>> (32 - c))) >>> 0; }

export function md5(msg) {
  const padded = padMessage(msg, 64, true, 8);
  const dv = new DataView(padded.buffer);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl32(F, MD5_S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
  return out;
}

// --- SHA-1 --------------------------------------------------------------

export function sha1(msg) {
  const padded = padMessage(msg, 64, false, 8);
  const dv = new DataView(padded.buffer);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (rotl32(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl32(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => odv.setUint32(i * 4, h, false));
  return out;
}

// --- SHA-256 ------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

export function sha256(msg) {
  const padded = padMessage(msg, 64, false, 8);
  const dv = new DataView(padded.buffer);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
    h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((h, i) => odv.setUint32(i * 4, h, false));
  return out;
}

// --- SHA-512 (BigInt, masked to 64 bits) --------------------------------

const MASK64 = (1n << 64n) - 1n;
const SHA512_K = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];

function rotr64(x, n) { return ((x >> n) | (x << (64n - n))) & MASK64; }

export function sha512(msg) {
  const padded = padMessage(msg, 128, false, 16);
  const dv = new DataView(padded.buffer);
  const h = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
  ];
  const w = new Array(80);
  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 16; i++) {
      const hi = BigInt(dv.getUint32(off + i * 8, false));
      const lo = BigInt(dv.getUint32(off + i * 8 + 4, false));
      w[i] = (hi << 32n) | lo;
    }
    for (let i = 16; i < 80; i++) {
      const s0 = rotr64(w[i - 15], 1n) ^ rotr64(w[i - 15], 8n) ^ (w[i - 15] >> 7n);
      const s1 = rotr64(w[i - 2], 19n) ^ rotr64(w[i - 2], 61n) ^ (w[i - 2] >> 6n);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & MASK64;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 80; i++) {
      const S1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n);
      const ch = (e & f) ^ ((~e & MASK64) & g);
      const t1 = (hh + S1 + ch + SHA512_K[i] + w[i]) & MASK64;
      const S0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & MASK64;
      hh = g; g = f; f = e; e = (d + t1) & MASK64; d = c; c = b; b = a; a = (t1 + t2) & MASK64;
    }
    h[0] = (h[0] + a) & MASK64; h[1] = (h[1] + b) & MASK64; h[2] = (h[2] + c) & MASK64;
    h[3] = (h[3] + d) & MASK64; h[4] = (h[4] + e) & MASK64; h[5] = (h[5] + f) & MASK64;
    h[6] = (h[6] + g) & MASK64; h[7] = (h[7] + hh) & MASK64;
  }
  const out = new Uint8Array(64);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    odv.setUint32(i * 8, Number((h[i] >> 32n) & 0xffffffffn), false);
    odv.setUint32(i * 8 + 4, Number(h[i] & 0xffffffffn), false);
  }
  return out;
}

// --- HMAC (RFC 2104) ----------------------------------------------------

const HMAC_ALGOS = {
  md5: { fn: md5, block: 64 },
  sha1: { fn: sha1, block: 64 },
  sha256: { fn: sha256, block: 64 },
  sha512: { fn: sha512, block: 128 },
};

function concatTwoBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function hmac(hashName, keyBytes, msgBytes) {
  const cfg = HMAC_ALGOS[hashName];
  if (!cfg) throw new Error('Unsupported hash for HMAC: ' + hashName);
  let key = keyBytes;
  if (key.length > cfg.block) key = cfg.fn(key);
  const k = new Uint8Array(cfg.block); // zero-padded to block size
  k.set(key);
  const ipad = new Uint8Array(cfg.block);
  const opad = new Uint8Array(cfg.block);
  for (let i = 0; i < cfg.block; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const inner = cfg.fn(concatTwoBytes(ipad, msgBytes));
  return cfg.fn(concatTwoBytes(opad, inner));
}

// =====================================================================
// Section: random bytes / ids  (were getRandomBytes / makeId on the util.js global)
// =====================================================================
/*
 * getRandomBytes(n):
 * - Returns a Uint8Array of `n` cryptographically-random bytes via
 *   crypto.getRandomValues (chunked past the 65536-byte per-call cap), falling
 *   back to Math.random where getRandomValues is absent. NEVER uses the native
 *   randomUUID() generator (the one on `crypto`) — it is secure-context-only and
 *   throws over file:// and plain-HTTP LAN, which these tools must run under.
 *
 * makeId():
 * - A short, collision-resistant, file://-safe id ("s_" + 16 hex chars) built
 *   from getRandomBytes. For DOM ids / object keys, not for security tokens.
 *   (Lives here, beside getRandomBytes, so CtUtil.mjs stays import-free.)
 */
export function getRandomBytes(n) {
  var out = new Uint8Array(n);
  var g = (typeof globalThis !== 'undefined' ? globalThis : window).crypto;
  if (g && typeof g.getRandomValues === 'function') {
    for (var off = 0; off < n; off += 65536) {
      g.getRandomValues(out.subarray(off, Math.min(off + 65536, n)));
    }
  } else {
    for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

export function makeId() {
  var b = getRandomBytes(8);
  var hex = '';
  for (var i = 0; i < b.length; i++) hex += (b[i] + 0x100).toString(16).slice(1);
  return 's_' + hex;
}


// =====================================================================
// Aggregator — static members REFERENCE the named functions above (single
// implementation; nothing is reimplemented here). Defined LAST so every
// function it points at already exists.
// =====================================================================
export class CtByteUtil {
  static crc32 = crc32;
  static crc32Hex = crc32Hex;
  static base64UrlToBytes = base64UrlToBytes;
  static utf8ToBase64 = utf8ToBase64;
  static formatBytes = formatBytes;
  static textToBytes = textToBytes;
  static bytesToHex = bytesToHex;
  static bytesToBase64 = bytesToBase64;
  static md5 = md5;
  static sha1 = sha1;
  static sha256 = sha256;
  static sha512 = sha512;
  static hmac = hmac;
  static getRandomBytes = getRandomBytes;
  static makeId = makeId;
}
// ===== end CtByteUtil (ES module) =====
