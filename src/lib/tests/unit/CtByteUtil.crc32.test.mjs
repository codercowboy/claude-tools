// Unit tests for CtByteUtil.crc32 / crc32Hex (IEEE 802.3 / ISO 3309 / PNG / ZIP CRC-32,
// reflected, polynomial 0xEDB88320). Run: node --test src/lib/tests/
//
// Vector sources (ported from the dev repo, imports adapted to the ct module):
//  - claude-tools-dev/src/tools/hasher/tests/unit/crc32.test.mjs   (check value, a/abc/fox, hex padding)
//  - claude-tools-dev/src/tools/favicon-kit/tests/unit/crc32.test.mjs (0xFF -> 0xFF000000, plain array, order)
//  - claude-tools-dev/src/tools/apng-maker/tests/unit/crc32.test.mjs  (0x00 -> 0xD202EF8D)
// The canonical CRC catalog check value CRC32("123456789") = 0xCBF43926.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, crc32Hex } from '../../utils/CtByteUtil.mjs';

const ascii = (s) => new TextEncoder().encode(s);

test('crc32: empty input is 0', () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32([]), 0);
});

test('crc32: canonical check value "123456789" = 0xCBF43926', () => {
  assert.equal(crc32(ascii('123456789')), 0xcbf43926);
});

test('crc32: published vectors (a, abc, quick brown fox)', () => {
  assert.equal(crc32Hex(ascii('a')), 'e8b7be43');
  assert.equal(crc32Hex(ascii('abc')), '352441c2');
  assert.equal(crc32Hex(ascii('The quick brown fox jumps over the lazy dog')), '414fa339');
});

test('crc32: bytes input - Uint8Array, plain array and Buffer agree', () => {
  const nine = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
  assert.equal(crc32(nine), 0xcbf43926);
  assert.equal(crc32(Uint8Array.from(nine)), 0xcbf43926);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('crc32: single-byte vectors, returned unsigned (high bit set)', () => {
  assert.equal(crc32(new Uint8Array([0xff])), 0xff000000);
  assert.equal(crc32(new Uint8Array([0])), 0xd202ef8d);
  for (const v of [crc32([0xff]), crc32([0]), crc32(ascii('abc'))]) {
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
  }
});

test('crc32: deterministic, order-sensitive, does not mutate input', () => {
  const buf = ascii('abc');
  const a = crc32(buf);
  assert.equal(crc32(buf), a);
  assert.notEqual(crc32(ascii('cba')), a);
  assert.deepEqual([...buf], [0x61, 0x62, 0x63]);
});

test('crc32: handles a large input (all 256 byte values, repeated)', () => {
  const big = new Uint8Array(4096).map((_, i) => i & 0xff);
  const v = crc32(big);
  assert.ok(v >= 0 && v <= 0xffffffff);
  assert.equal(crc32(big), v);
  assert.notEqual(v, crc32(big.subarray(1)));
});

test('crc32Hex: 8 lowercase hex chars, zero-padded, matches crc32', () => {
  assert.equal(crc32Hex(ascii('123456789')), 'cbf43926');
  assert.equal(crc32Hex(new Uint8Array(0)), '00000000');
  assert.equal(crc32Hex([0xff]), 'ff000000');
  const h = crc32Hex(new Uint8Array([0, 0, 0, 0]));
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(parseInt(h, 16), crc32(new Uint8Array(4)));
});
