// Decode-flow unit tests: normalizeBase64() and the decodeInput() entry
// point (node --test, no browser/DOM). Covers raw Base64, Base64URL, data:
// URIs, padding handling, and error paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBase64Tool } from './_helpers.mjs';

const {
  normalizeBase64, decodeInput, bytesToBase64, toBase64Url, MAX_DECODE_B64_CHARS,
} = await loadBase64Tool();

// ---- normalizeBase64() ----

test('normalizeBase64(): strips whitespace/newlines and restores dropped padding', () => {
  assert.equal(normalizeBase64(' aGV sbG8\n='), 'aGVsbG8=');
  assert.equal(normalizeBase64('aGVsbG8'), 'aGVsbG8='); // unpadded, rem 3 -> one '=' added
});

test('normalizeBase64(): accepts the URL-safe alphabet and converts it to standard, padded Base64', () => {
  const bytes = new Uint8Array([251, 255, 191, 1, 2, 3]);
  const std = bytesToBase64(bytes);
  const urlSafe = toBase64Url(std);
  assert.equal(normalizeBase64(urlSafe), std);
});

test('normalizeBase64(): throws on empty input', () => {
  assert.throws(() => normalizeBase64(''), /No input to decode/);
  assert.throws(() => normalizeBase64('   '), /No input to decode/);
});

test('normalizeBase64(): rejects a mix of standard and URL-safe characters (ambiguous)', () => {
  assert.throws(() => normalizeBase64('ab+/cd-_ef'), /Mixed standard and URL-safe/);
});

test('normalizeBase64(): rejects a structurally invalid length (mod 4 === 1)', () => {
  assert.throws(() => normalizeBase64('abcde'), /Invalid Base64 length/);
});

test('normalizeBase64(): rejects characters outside the Base64 alphabet', () => {
  assert.throws(() => normalizeBase64('ab$%'), /outside the Base64 alphabet/);
});

// ---- decodeInput() ----

test('decodeInput(): plain Base64 (no data: wrapper) decodes text with a default octet-stream mime', () => {
  const result = decodeInput('aGVsbG8=');
  assert.equal(result.mime, 'application/octet-stream');
  assert.equal(result.isText, true);
  assert.equal(result.text, 'hello');
  assert.deepEqual(Array.from(result.bytes), [104, 101, 108, 108, 111]);
});

test('decodeInput(): Base64URL input decodes identically to its standard Base64 equivalent', () => {
  const url = toBase64Url('aGVsbG8=');
  const result = decodeInput(url);
  assert.equal(result.text, 'hello');
  assert.equal(result.isText, true);
});

test('decodeInput(): a full data: URI carries its declared mime through', () => {
  const result = decodeInput('data:text/plain;base64,aGVsbG8=');
  assert.equal(result.mime, 'text/plain');
  assert.equal(result.text, 'hello');
});

test('decodeInput(): a non-base64 data: URI is rejected', () => {
  assert.throws(() => decodeInput('data:text/plain,hello'), /Only base64-encoded data: URIs are supported/);
});

test('decodeInput(): binary (non-UTF-8) payload sets isText=false and text=null', () => {
  const result = decodeInput(bytesToBase64(new Uint8Array([0xFF, 0xFE, 0x00, 0x01])));
  assert.equal(result.isText, false);
  assert.equal(result.text, null);
  assert.deepEqual(Array.from(result.bytes), [0xFF, 0xFE, 0x00, 0x01]);
});

test('decodeInput(): empty or whitespace-only input throws', () => {
  assert.throws(() => decodeInput(''), /Nothing to decode/);
  assert.throws(() => decodeInput('   \n  '), /Nothing to decode/);
});

test('decodeInput(): enforces the documented decode size limit', () => {
  // One character over the limit throws with a message naming both the
  // actual length and the limit; the limit itself is exported so this test
  // doesn't need to allocate tens of megabytes to exercise the boundary.
  assert.equal(typeof MAX_DECODE_B64_CHARS, 'number');
  const oversized = 'A'.repeat(MAX_DECODE_B64_CHARS + 4); // +4 keeps it a multiple of 4
  assert.throws(() => decodeInput(oversized), /too large to decode/i);
});

test('decodeInput() round-trips whatever bytesToBase64() produced, for arbitrary binary data', () => {
  for (let trial = 0; trial < 10; trial++) {
    const size = trial * 17 + 3;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 41 + trial) % 256;
    const result = decodeInput(bytesToBase64(bytes));
    assert.deepEqual(Array.from(result.bytes), Array.from(bytes), `trial=${trial}`);
  }
});
