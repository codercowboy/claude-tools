// Unit tests for CtByteUtil encoders / formatBytes / ids:
// bytesToBase64, base64UrlToBytes, utf8ToBase64, textToBytes, bytesToHex,
// formatBytes, getRandomBytes, makeId, and the CtByteUtil aggregator.
// Run: node --test src/lib/tests/
//
// Hashing is owned by Phase 03 (CtByteUtil.hashing.test.mjs) and crc32 by Phase 01
// (CtByteUtil.crc32.test.mjs) - deliberately not covered here.
//
// API notes (confirmed from src/lib/utils/CtByteUtil.mjs):
//  - bytesToBase64(bytes) -> STANDARD base64 ('+' '/' and '=' padding).
//  - base64UrlToBytes(str) -> Uint8Array; accepts base64url AND standard base64, padded or
//    unpadded, strips whitespace; throws on empty input, length%4==1, or bad characters.
//  - utf8ToBase64(str) -> standard base64 of the UTF-8 bytes.
//  - formatBytes expectations follow the #1008-approved NEW format (the same cases the
//    base64-tool's own unit tests assert): "0 B", "1023 B", "1.0 KB", "1.5 KB", MB/GB tiers,
//    capped at GB, space-separated. NOT the removed old compact format ("1.50kb", TB tier).
//  - Expected strings are literals (RFC 4648 vectors / known values), never derived from the
//    code under test; independent checks use node:buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesToBase64, base64UrlToBytes, utf8ToBase64, textToBytes, bytesToHex,
  formatBytes, getRandomBytes, makeId, CtByteUtil,
} from '../../utils/CtByteUtil.mjs';

const ascii = (s) => new TextEncoder().encode(s);
const u8 = (...a) => Uint8Array.from(a);
const eqBytes = (actual, expected, msg) => {
  assert.ok(actual instanceof Uint8Array, 'is Uint8Array');
  assert.deepEqual(Array.from(actual), Array.from(expected), msg);
};

// ---------------------------------------------------------------- bytesToBase64
test('bytesToBase64: RFC 4648 section 10 vectors', () => {
  const v = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
  for (const [s, b] of v) assert.equal(bytesToBase64(ascii(s)), b, JSON.stringify(s));
});

test('bytesToBase64: canonical "Man" -> "TWFu" and padding boundaries 0/1/2/3 bytes', () => {
  assert.equal(bytesToBase64(ascii('Man')), 'TWFu');
  assert.equal(bytesToBase64(u8()), '');
  assert.equal(bytesToBase64(u8(0x00)), 'AA==');
  assert.equal(bytesToBase64(u8(0x00, 0x00)), 'AAA=');
  assert.equal(bytesToBase64(u8(0x00, 0x00, 0x00)), 'AAAA');
});

test('bytesToBase64: binary 0x00 / 0xFF bytes and standard alphabet (+ and /)', () => {
  assert.equal(bytesToBase64(u8(0xff)), '/w==');
  assert.equal(bytesToBase64(u8(0xff, 0xff)), '//8=');
  assert.equal(bytesToBase64(u8(0xff, 0xff, 0xff)), '////');
  assert.equal(bytesToBase64(u8(0xfb, 0xef, 0xbe)), '++++');
  assert.equal(bytesToBase64(u8(0xfb)), '+w==');
  assert.equal(bytesToBase64(u8(0x00, 0x10, 0x83)), 'ABCD');
});

test('bytesToBase64: matches Buffer for every length 0..40 and all-256-byte input', () => {
  for (let n = 0; n <= 40; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'), `len ${n}`);
  }
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(bytesToBase64(all), Buffer.from(all).toString('base64'));
});

test('bytesToBase64: accepts plain array and Buffer input; output never contains URL-safe chars', () => {
  assert.equal(bytesToBase64([77, 97, 110]), 'TWFu');
  assert.equal(bytesToBase64(Buffer.from('Man')), 'TWFu');
  assert.doesNotMatch(bytesToBase64(u8(0xfb, 0xff, 0xfe)), /[-_]/);
});

// -------------------------------------------------------------- base64UrlToBytes
test('base64UrlToBytes: known decodes (padded and unpadded)', () => {
  eqBytes(base64UrlToBytes('TWFu'), ascii('Man'));
  eqBytes(base64UrlToBytes('AA=='), u8(0));
  eqBytes(base64UrlToBytes('AA'), u8(0));
  eqBytes(base64UrlToBytes('AAA='), u8(0, 0));
  eqBytes(base64UrlToBytes('AAA'), u8(0, 0));
  eqBytes(base64UrlToBytes('Zm9vYg'), ascii('foob'));
  eqBytes(base64UrlToBytes('Zm9vYmE'), ascii('fooba'));
});

test('base64UrlToBytes: base64url alphabet (- _) and standard alphabet (+ /) decode identically', () => {
  eqBytes(base64UrlToBytes('-_8'), u8(0xfb, 0xff));
  eqBytes(base64UrlToBytes('+/8='), u8(0xfb, 0xff));
  eqBytes(base64UrlToBytes('-_8='), u8(0xfb, 0xff));
  eqBytes(base64UrlToBytes('____'), u8(0xff, 0xff, 0xff));
  eqBytes(base64UrlToBytes('////'), u8(0xff, 0xff, 0xff));
  eqBytes(base64UrlToBytes('-w'), u8(0xfb));
});

test('base64UrlToBytes: ignores embedded whitespace / newlines', () => {
  eqBytes(base64UrlToBytes(' Zm9v\nYmFy\t'), ascii('foobar'));
});

test('base64UrlToBytes: throws on empty / null / undefined input', () => {
  assert.throws(() => base64UrlToBytes(''), /Empty segment/);
  assert.throws(() => base64UrlToBytes('   '), /Empty segment/);
  assert.throws(() => base64UrlToBytes(null), /Empty segment/);
  assert.throws(() => base64UrlToBytes(undefined), /Empty segment/);
});

test('base64UrlToBytes: throws on impossible length (len % 4 == 1) and bad characters', () => {
  assert.throws(() => base64UrlToBytes('A'), /Invalid base64url length/);
  assert.throws(() => base64UrlToBytes('AAAAA'), /Invalid base64url length/);
  assert.throws(() => base64UrlToBytes('AA!A'), /outside the base64url alphabet/);
  assert.throws(() => base64UrlToBytes('Zm9v*mFy'), /outside the base64url alphabet/);
  assert.throws(() => base64UrlToBytes('A=AA'), /outside the base64url alphabet/);
});

test('base64UrlToBytes: round-trips bytesToBase64 for lengths 0..64 (empty excepted: it throws)', () => {
  for (let n = 1; n <= 64; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 53 + 7) & 0xff);
    eqBytes(base64UrlToBytes(bytesToBase64(b)), b, `len ${n}`);
  }
  // unpadded + url-safe form of the same data also round-trips
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const url = bytesToBase64(all).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  eqBytes(base64UrlToBytes(url), all);
});

test('base64UrlToBytes: the empty byte array does NOT round-trip (encodes to "", decode throws)', () => {
  assert.equal(bytesToBase64(u8()), '');
  assert.throws(() => base64UrlToBytes(bytesToBase64(u8())), /Empty segment/);
});

// ------------------------------------------------------------------ utf8ToBase64
test('utf8ToBase64: ASCII and empty', () => {
  assert.equal(utf8ToBase64(''), '');
  assert.equal(utf8ToBase64('Man'), 'TWFu');
  assert.equal(utf8ToBase64('foobar'), 'Zm9vYmFy');
  assert.equal(utf8ToBase64('Hello, World!'), 'SGVsbG8sIFdvcmxkIQ==');
});

test('utf8ToBase64: unicode is encoded as UTF-8 bytes first', () => {
  assert.equal(utf8ToBase64('é'), 'w6k=');          // C3 A9
  assert.equal(utf8ToBase64('€'), '4oKs');          // E2 82 AC
  assert.equal(utf8ToBase64('日本語'), '5pel5pys6Kqe');
  assert.equal(utf8ToBase64('🚀'), '8J+agA==');     // F0 9F 9A 80
  assert.equal(utf8ToBase64('✓'), '4pyT');
});

test('utf8ToBase64: agrees with Buffer and round-trips through base64UrlToBytes + TextDecoder', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'héllo wörld ✓ 日本語 🚀', 'é', '\u0000\u0001', 'line1\nline2\r\n']) {
    assert.equal(utf8ToBase64(s), Buffer.from(s, 'utf8').toString('base64'), JSON.stringify(s));
    if (s !== '') assert.equal(new TextDecoder().decode(base64UrlToBytes(utf8ToBase64(s))), s);
  }
});

test('utf8ToBase64 equals bytesToBase64(textToBytes(x))', () => {
  for (const s of ['', 'x', 'héllo 🚀', '日本語']) assert.equal(utf8ToBase64(s), bytesToBase64(textToBytes(s)));
});

// ------------------------------------------------------------------- textToBytes
test('textToBytes: ASCII and empty', () => {
  eqBytes(textToBytes('Man'), u8(0x4d, 0x61, 0x6e));
  eqBytes(textToBytes(''), u8());
  assert.equal(textToBytes('').length, 0);
});

test('textToBytes: multi-byte UTF-8 (2/3/4-byte code points), emoji, combining chars', () => {
  eqBytes(textToBytes('é'), u8(0xc3, 0xa9));
  eqBytes(textToBytes('€'), u8(0xe2, 0x82, 0xac));
  eqBytes(textToBytes('🚀'), u8(0xf0, 0x9f, 0x9a, 0x80));
  eqBytes(textToBytes('é'), u8(0x65, 0xcc, 0x81));       // e + combining acute = 3 bytes
  assert.equal(textToBytes('é').length, 2);                // precomposed differs from decomposed
  assert.notDeepEqual(Array.from(textToBytes('é')), Array.from(textToBytes('é')));
  eqBytes(textToBytes('👨‍👩‍👧'), Buffer.from('👨‍👩‍👧', 'utf8')); // ZWJ sequence
  eqBytes(textToBytes('\u0000'), u8(0));
});

test('textToBytes: null / undefined -> empty; non-strings are stringified', () => {
  eqBytes(textToBytes(null), u8());
  eqBytes(textToBytes(undefined), u8());
  eqBytes(textToBytes(123), ascii('123'));
  eqBytes(textToBytes(false), ascii('false'));
});

test('textToBytes: round-trips with TextDecoder', () => {
  for (const s of ['', 'abc', 'héllo wörld ✓ 日本語 🚀', 'é', 'a\u0000b']) {
    assert.equal(new TextDecoder().decode(textToBytes(s)), s);
  }
});

// ------------------------------------------------------------------- bytesToHex
test('bytesToHex: known pairs and empty', () => {
  assert.equal(bytesToHex(u8()), '');
  assert.equal(bytesToHex(u8(0x00)), '00');
  assert.equal(bytesToHex(u8(0xff)), 'ff');
  assert.equal(bytesToHex(u8(0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef)), '0123456789abcdef');
  assert.equal(bytesToHex(ascii('Man')), '4d616e');
  assert.equal(bytesToHex(ascii('foobar')), '666f6f626172');
  assert.equal(bytesToHex(u8(0x0a, 0xa0, 0x0f, 0xf0)), '0aa00ff0'); // nibble padding
});

test('bytesToHex: lowercase only, exactly 2 chars per byte, all 256 values', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const hex = bytesToHex(all);
  assert.equal(hex.length, 512);
  assert.match(hex, /^[0-9a-f]+$/);
  assert.equal(hex, Buffer.from(all).toString('hex'));
  for (let n = 0; n < 20; n++) assert.equal(bytesToHex(new Uint8Array(n)).length, n * 2);
});

test('bytesToHex: accepts plain array and Buffer; round-trips via independent hex parse', () => {
  assert.equal(bytesToHex([0, 15, 16, 255]), '000f10ff');
  assert.equal(bytesToHex(Buffer.from([0xde, 0xad, 0xbe, 0xef])), 'deadbeef');
  const b = getRandomBytes(32);
  eqBytes(Uint8Array.from(Buffer.from(bytesToHex(b), 'hex')), b);
});

// ------------------------------------------------------------------- formatBytes
// Expectations trace to #1008 (NEW format; mirrors src/tools/base64-tool/tests/unit/misc.test.mjs).
test('formatBytes #1008: sub-1024 values are integer bytes, "<n> B"', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1), '1 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1023), '1023 B');
});

test('formatBytes #1008: KB tier, one decimal, space-separated', () => {
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1024 * 1024 - 1), '1024.0 KB'); // toFixed rounds up at the tier edge
  assert.equal(formatBytes(1000000), '976.6 KB');
});

test('formatBytes #1008: MB and GB tiers, capped at GB (no TB tier)', () => {
  assert.equal(formatBytes(1024 ** 2), '1.0 MB');
  assert.equal(formatBytes(1.5 * 1024 ** 2), '1.5 MB');
  assert.equal(formatBytes(1024 ** 3), '1.0 GB');
  assert.equal(formatBytes(1e9), '953.7 MB');
  assert.equal(formatBytes(1024 ** 4), '1024.0 GB');
  assert.equal(formatBytes(1024 ** 5), '1048576.0 GB');
  assert.doesNotMatch(formatBytes(1024 ** 6), /TB/);
});

test('formatBytes #1008: output is the NEW shape - never the removed compact format', () => {
  for (const n of [0, 1023, 1024, 1536, 1024 ** 2, 1024 ** 3]) {
    const s = formatBytes(n);
    assert.match(s, /^\d+(\.\d)? (B|KB|MB|GB)$/, s);
    assert.doesNotMatch(s, /\d(b|kb|mb|gb|tb)$/); // old: no space, lowercase
  }
});

test('formatBytes: negative numbers fall under the sub-base branch (printed as-is with " B")', () => {
  assert.equal(formatBytes(-1), '-1 B');
  assert.equal(formatBytes(-1024), '-1024 B');
});

test('formatBytes: NaN / null / undefined / non-numeric coerce to "0 B"; fractional bytes pass through', () => {
  assert.equal(formatBytes(NaN), '0 B');
  assert.equal(formatBytes(null), '0 B');
  assert.equal(formatBytes(undefined), '0 B');
  assert.equal(formatBytes('abc'), '0 B');
  assert.equal(formatBytes(), '0 B');
  assert.equal(formatBytes('2048'), '2.0 KB');
  assert.equal(formatBytes(1.5), '1.5 B');
});

test('formatBytes: Infinity (no invalid opt) is not coerced - tops out in the GB tier', () => {
  assert.equal(formatBytes(Infinity), 'Infinity GB');
  assert.equal(formatBytes(-Infinity), '-Infinity B');
});

test('formatBytes: deterministic and pure (same input -> same output, opts not mutated)', () => {
  const opts = Object.freeze({ units: Object.freeze(['k', 'm']), decimals: 2 });
  for (const n of [0, 1023, 1024, 123456789]) {
    assert.equal(formatBytes(n), formatBytes(n));
    assert.equal(formatBytes(n, opts), formatBytes(n, opts));
  }
});

test('formatBytes opts: base 1000 (decimal SI divisor)', () => {
  assert.equal(formatBytes(999, { base: 1000 }), '999 B');
  assert.equal(formatBytes(1000, { base: 1000 }), '1.0 KB');
  assert.equal(formatBytes(1500000, { base: 1000 }), '1.5 MB');
  assert.equal(formatBytes(1024, { base: 1000 }), '1.0 KB');
});

test('formatBytes opts: decimals as number and as function of the scaled value', () => {
  assert.equal(formatBytes(1536, { decimals: 0 }), '2 KB');
  assert.equal(formatBytes(1536, { decimals: 2 }), '1.50 KB');
  assert.equal(formatBytes(1024, { decimals: 3 }), '1.000 KB');
  const f = (v) => (v < 10 ? 2 : 1);
  assert.equal(formatBytes(1536, { decimals: f }), '1.50 KB');
  assert.equal(formatBytes(20 * 1024, { decimals: f }), '20.0 KB');
  // decimals do not affect the sub-base byte branch
  assert.equal(formatBytes(500, { decimals: 3 }), '500 B');
});

test('formatBytes opts: space:false drops the separator (including for bytes)', () => {
  assert.equal(formatBytes(1536, { space: false }), '1.5KB');
  assert.equal(formatBytes(10, { space: false }), '10B');
  assert.equal(formatBytes(1536, { space: true }), '1.5 KB');
});

test('formatBytes opts: custom units / byteUnit; last unit caps growth', () => {
  assert.equal(formatBytes(10, { byteUnit: 'b' }), '10 b');
  assert.equal(formatBytes(1536, { units: ['kb', 'mb'] }), '1.5 kb');
  assert.equal(formatBytes(1024 ** 3, { units: ['kb', 'mb'] }), '1024.0 mb');
  assert.equal(formatBytes(1024 ** 4, { units: ['KB', 'MB', 'GB', 'TB'] }), '1.0 TB');
});

test('formatBytes opts: invalid sentinel returned verbatim for non-finite input', () => {
  assert.equal(formatBytes(NaN, { invalid: '' }), '');
  assert.equal(formatBytes(NaN, { invalid: '—' }), '—');
  assert.equal(formatBytes(Infinity, { invalid: '—' }), '—');
  assert.equal(formatBytes(-Infinity, { invalid: 'n/a' }), 'n/a');
  assert.equal(formatBytes(undefined, { invalid: '?' }), '?');
  assert.equal(formatBytes(null, { invalid: '?' }), '?');   // isFinite(null) is Number.isFinite -> false
  assert.equal(formatBytes('12', { invalid: '?' }), '?');   // Number.isFinite('12') is false (no coercion)
  assert.equal(formatBytes(2048, { invalid: '—' }), '2.0 KB'); // valid input unaffected
  assert.equal(formatBytes(0, { invalid: '—' }), '0 B');
});

test('formatBytes opts: invalidWhen predicate only consulted when invalid is set', () => {
  const guard = (n) => n == null || Number.isNaN(n);
  assert.equal(formatBytes(null, { invalid: '', invalidWhen: guard }), '');
  assert.equal(formatBytes(NaN, { invalid: '', invalidWhen: guard }), '');
  assert.equal(formatBytes(Infinity, { invalid: '', invalidWhen: guard }), 'Infinity GB'); // not "bad" per guard
  assert.equal(formatBytes(1024, { invalid: '', invalidWhen: guard }), '1.0 KB');
  assert.equal(formatBytes(NaN, { invalidWhen: () => true }), '0 B'); // ignored without `invalid`
});

// --------------------------------------------------------------- getRandomBytes
test('getRandomBytes: returns Uint8Array of exactly n bytes, including n=0', () => {
  for (const n of [0, 1, 2, 8, 16, 255, 256, 1000]) {
    const b = getRandomBytes(n);
    assert.ok(b instanceof Uint8Array, `n=${n}`);
    assert.equal(b.length, n);
  }
  assert.equal(getRandomBytes(0).length, 0);
});

test('getRandomBytes: fills past the 65536-byte getRandomValues chunk boundary', () => {
  for (const n of [65535, 65536, 65537, 140000]) {
    const b = getRandomBytes(n);
    assert.equal(b.length, n);
    // a 64-byte tail of zeros from an unfilled chunk would be astronomically unlikely
    assert.ok(b.subarray(n - 64).some((x) => x !== 0), `tail filled n=${n}`);
  }
});

test('getRandomBytes: distinct across calls (shape/uniqueness, not statistical randomness)', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(bytesToHex(getRandomBytes(16)));
  assert.equal(seen.size, 50);
  assert.notEqual(bytesToHex(getRandomBytes(32)), bytesToHex(getRandomBytes(32)));
});

test('getRandomBytes: returns a fresh buffer each call (no shared backing array)', () => {
  const a = getRandomBytes(8); const snapshot = bytesToHex(a);
  getRandomBytes(8);
  assert.equal(bytesToHex(a), snapshot);
  assert.notEqual(a.buffer, getRandomBytes(8).buffer);
});

// ----------------------------------------------------------------------- makeId
test('makeId: "s_" + 16 lowercase hex chars (18 total)', () => {
  for (let i = 0; i < 20; i++) {
    const id = makeId();
    assert.equal(typeof id, 'string');
    assert.match(id, /^s_[0-9a-f]{16}$/);
    assert.equal(id.length, 18);
  }
});

test('makeId: unique across many calls', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(makeId());
  assert.equal(seen.size, 1000);
});

// ------------------------------------------------------------------- aggregator
test('CtByteUtil aggregator: static members reference the same named functions', () => {
  assert.equal(CtByteUtil.bytesToBase64, bytesToBase64);
  assert.equal(CtByteUtil.base64UrlToBytes, base64UrlToBytes);
  assert.equal(CtByteUtil.utf8ToBase64, utf8ToBase64);
  assert.equal(CtByteUtil.textToBytes, textToBytes);
  assert.equal(CtByteUtil.bytesToHex, bytesToHex);
  assert.equal(CtByteUtil.formatBytes, formatBytes);
  assert.equal(CtByteUtil.getRandomBytes, getRandomBytes);
  assert.equal(CtByteUtil.makeId, makeId);
  assert.equal(CtByteUtil.bytesToHex(CtByteUtil.textToBytes('Man')), '4d616e');
  assert.equal(CtByteUtil.formatBytes(1536), '1.5 KB');
});
