// bytes <-> Base64 unit tests: bytesToBase64(), base64ToBytes()
// (node --test, no browser/DOM). Cross-checked against Node's built-in
// Buffer base64 codec as an independent reference encoder/decoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { loadBase64Tool } from './_helpers.mjs';

const { bytesToBase64, base64ToBytes } = await loadBase64Tool();

function bytesOf(...vals) {
  return new Uint8Array(vals);
}

test('bytesToBase64(): known vector — single byte 0x41 ("A")', () => {
  assert.equal(bytesToBase64(bytesOf(0x41)), 'QQ==');
});

test('bytesToBase64(): known vector — "hello" ASCII bytes', () => {
  assert.equal(bytesToBase64(bytesOf(104, 101, 108, 108, 111)), 'aGVsbG8=');
});

test('bytesToBase64(): empty input encodes to an empty string', () => {
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
});

test('bytesToBase64(): matches Node Buffer (independent reference codec) across varied sizes, including across the internal 32k chunk boundary', () => {
  const sizes = [0, 1, 2, 3, 16, 255, 256, 32767, 32768, 32769, 65536, 100003];
  for (const size of sizes) {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 37 + 11) % 256;
    const expected = Buffer.from(bytes).toString('base64');
    assert.equal(bytesToBase64(bytes), expected, `size=${size}`);
  }
});

test('base64ToBytes(): known vector round-trips "aGVsbG8=" -> "hello" bytes', () => {
  assert.deepEqual(Array.from(base64ToBytes('aGVsbG8=')), [104, 101, 108, 108, 111]);
});

test('base64ToBytes(): empty string decodes to an empty Uint8Array', () => {
  assert.equal(base64ToBytes('').length, 0);
});

test('base64ToBytes(): matches Node Buffer (independent reference codec) across varied encoded sizes', () => {
  const sizes = [0, 1, 5, 100, 1000, 32768, 40000];
  for (const size of sizes) {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 53 + 7) % 256;
    const b64 = Buffer.from(bytes).toString('base64');
    assert.deepEqual(Array.from(base64ToBytes(b64)), Array.from(bytes), `size=${size}`);
  }
});

test('bytesToBase64() and base64ToBytes() round-trip identity across random binary data', () => {
  for (let trial = 0; trial < 25; trial++) {
    const size = trial * 13 + 1;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 97 + trial * 211) % 256;
    const roundTripped = base64ToBytes(bytesToBase64(bytes));
    assert.deepEqual(Array.from(roundTripped), Array.from(bytes), `trial=${trial}`);
  }
});

test('base64ToBytes(): throws a friendly error on invalid Base64 input', () => {
  assert.throws(() => base64ToBytes('!!!not-base64!!!'), /Invalid Base64 input/);
});
