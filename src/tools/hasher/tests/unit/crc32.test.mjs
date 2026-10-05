// CRC32 (IEEE 802.3, polynomial 0xEDB88320) known-answer tests.
// The canonical check value CRC32("123456789") = 0xCBF43926 is the standard
// used by every CRC catalog to identify this exact algorithm.
//
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHasher } from './_helpers.mjs';

const { crc32, crc32Hex, textToBytes } = await loadHasher();

test('crc32(): canonical check value for "123456789"', () => {
  assert.equal(crc32Hex(textToBytes('123456789')), 'cbf43926');
  assert.equal(crc32(textToBytes('123456789')) >>> 0, 0xcbf43926);
});

test('crc32(): empty input is 0', () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32Hex(new Uint8Array(0)), '00000000');
});

test('crc32(): more published vectors', () => {
  assert.equal(crc32Hex(textToBytes('a')), 'e8b7be43');
  assert.equal(crc32Hex(textToBytes('abc')), '352441c2');
  assert.equal(
    crc32Hex(textToBytes('The quick brown fox jumps over the lazy dog')),
    '414fa339',
  );
});

test('crc32Hex(): always zero-padded to 8 lowercase hex chars', () => {
  // "\0\0\0\0" gives a small-ish value; ensure padding to 8 chars holds.
  const hex = crc32Hex(new Uint8Array([0, 0, 0, 0]));
  assert.equal(hex.length, 8);
  assert.match(hex, /^[0-9a-f]{8}$/);
});

test('crc32(): returns an unsigned 32-bit number', () => {
  // A value with the high bit set must come back positive (unsigned).
  const v = crc32(textToBytes('123456789'));
  assert.equal(typeof v, 'number');
  assert.ok(v >= 0 && v <= 0xffffffff);
});
