// Base64 <-> Base64URL unit tests: toBase64Url(), fromBase64Url()
// (node --test, no browser/DOM). Cross-checked against Node's built-in
// 'base64url' Buffer encoding as an independent reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { loadBase64Tool } from './_helpers.mjs';

const { toBase64Url, fromBase64Url, bytesToBase64, base64ToBytes } = await loadBase64Tool();

test('toBase64Url(): known vector — strips padding, no +/- to translate', () => {
  assert.equal(toBase64Url('aGVsbG8='), 'aGVsbG8');
});

test('toBase64Url(): translates "+" -> "-" and "/" -> "_" and strips all padding', () => {
  assert.equal(toBase64Url('a+b/c+d/=='), 'a-b_c-d_');
});

test('toBase64Url(): matches Node Buffer base64url encoding (independent reference) across random binary data', () => {
  for (let trial = 0; trial < 20; trial++) {
    const size = trial * 9 + 1;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 61 + trial * 17) % 256;
    const std = bytesToBase64(bytes);
    const expected = Buffer.from(bytes).toString('base64url');
    assert.equal(toBase64Url(std), expected, `trial=${trial}`);
  }
});

test('fromBase64Url(): known vector — restores standard alphabet + padding', () => {
  assert.equal(fromBase64Url('aGVsbG8'), 'aGVsbG8=');
  assert.equal(fromBase64Url('a-b_c-d_'), 'a+b/c+d/'); // len 8, rem 0 -> no padding added
});

test('fromBase64Url(): restores the correct padding for each length-mod-4 remainder', () => {
  // remainder 0 -> no padding added
  assert.equal(fromBase64Url('YWJj'), 'YWJj'); // len 4, rem 0
  // remainder 2 -> "==" added
  assert.equal(fromBase64Url('YQ'), 'YQ=='); // len 2, rem 2
  // remainder 3 -> "=" added
  assert.equal(fromBase64Url('YWI'), 'YWI='); // len 3, rem 3
});

test('fromBase64Url(): throws on a length-mod-4 remainder of 1 (structurally invalid Base64)', () => {
  assert.throws(() => fromBase64Url('Y'), /Invalid Base64URL length/);
});

test('toBase64Url() / fromBase64Url() round-trip through base64ToBytes() recovers the original bytes', () => {
  for (let trial = 0; trial < 15; trial++) {
    const size = trial * 11 + 1;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 89 + trial * 5) % 256;
    const std = bytesToBase64(bytes);
    const url = toBase64Url(std);
    const restored = fromBase64Url(url);
    assert.deepEqual(Array.from(base64ToBytes(restored)), Array.from(bytes), `trial=${trial}`);
  }
});
