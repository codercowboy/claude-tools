// Byte-mode segment encoding unit tests: utf8Bytes(), charCountBits(),
// BitWriter, buildByteModeSegmentBits(), padToCapacity() (node --test, no
// browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQr } from './_helpers.mjs';

const { utf8Bytes, charCountBits, BitWriter, buildByteModeSegmentBits, padToCapacity } = await loadQr();

test('utf8Bytes() encodes ASCII 1:1', () => {
  assert.deepEqual(Array.from(utf8Bytes('A')), [0x41]);
  assert.deepEqual(Array.from(utf8Bytes('AB')), [0x41, 0x42]);
});

test('utf8Bytes() on empty string returns zero-length', () => {
  assert.equal(utf8Bytes('').length, 0);
});

test('utf8Bytes() handles multi-byte UTF-8 (accents, CJK, astral emoji)', () => {
  assert.deepEqual(Array.from(utf8Bytes('€')), [0xE2, 0x82, 0xAC]); // Euro sign, 3 bytes
  assert.deepEqual(Array.from(utf8Bytes('é')), [0xC3, 0xA9]); // 'é', 2 bytes
  assert.equal(utf8Bytes('\u{1F600}').length, 4); // astral emoji, 4-byte UTF-8
});

test('charCountBits() is 8 for versions 1-9 and 16 for versions 10-40', () => {
  assert.equal(charCountBits(1), 8);
  assert.equal(charCountBits(9), 8);
  assert.equal(charCountBits(10), 16);
  assert.equal(charCountBits(40), 16);
});

test('BitWriter writes MSB-first and reconstructs exact bytes', () => {
  const w = new BitWriter();
  w.writeBits(0b1011, 4);
  w.writeBits(0b0001, 4);
  assert.equal(w.bitLength, 8);
  assert.deepEqual(w.toBitArray(), [1, 0, 1, 1, 0, 0, 0, 1]);
  assert.deepEqual(Array.from(w.toBytes()), [0b10110001]);
});

test('BitWriter.toBytes() on multiple bytes preserves order', () => {
  const w = new BitWriter();
  w.writeBits(0xAB, 8);
  w.writeBits(0xCD, 8);
  assert.deepEqual(Array.from(w.toBytes()), [0xAB, 0xCD]);
});

test('buildByteModeSegmentBits() writes mode indicator + char-count + byte bits', () => {
  // version 1 -> charCountBits = 8. Single byte 0x41 ('A').
  const seg = buildByteModeSegmentBits(new Uint8Array([0x41]), 1);
  // 4 (mode 0100) + 8 (count=1) + 8 (byte) = 20 bits.
  assert.equal(seg.bitLength, 20);
  assert.deepEqual(seg.toBitArray(), [
    0, 1, 0, 0, // mode indicator: byte mode
    0, 0, 0, 0, 0, 0, 0, 1, // char count = 1 (8 bits, version <= 9)
    0, 1, 0, 0, 0, 0, 0, 1, // 0x41
  ]);
});

test('buildByteModeSegmentBits() uses 16-bit char count for version >= 10', () => {
  const seg = buildByteModeSegmentBits(new Uint8Array([]), 10);
  assert.equal(seg.bitLength, 4 + 16); // mode + 16-bit count, no byte data
});

test('padToCapacity() adds terminator + byte-align padding, no filler bytes needed when already byte-aligned', () => {
  const w = new BitWriter();
  w.writeBits(0b1010, 4); // 4 bits used
  padToCapacity(w, 1); // capacity = 1 codeword = 8 bits
  assert.equal(w.bitLength, 8);
  // 4 data bits + 4 terminator zero bits (min(4, 8-4)) = 8 bits exactly;
  // no room left for byte-align padding or filler codewords.
  assert.deepEqual(Array.from(w.toBytes()), [0b10100000]);
});

test('padToCapacity() fills remaining capacity with alternating 0xEC/0x11 pad codewords', () => {
  const w = new BitWriter(); // 0 bits used
  padToCapacity(w, 3); // capacity = 3 codewords = 24 bits
  // terminator: min(4, 24-0) = 4 zero bits -> bitLength 4
  // byte-align padding: (8 - 4%8)%8 = 4 zero bits -> bitLength 8 (one all-zero byte)
  // filler: 0xEC, then 0x11, alternating, until 24 bits
  assert.equal(w.bitLength, 24);
  assert.deepEqual(Array.from(w.toBytes()), [0x00, 0xEC, 0x11]);
});

test('padToCapacity() throws when the segment already exceeds capacity', () => {
  const w = new BitWriter();
  w.writeBits(0xFF, 8);
  w.writeBits(0xFF, 8); // 16 bits used
  assert.throws(() => padToCapacity(w, 1), /exceeds capacity/); // capacity = 8 bits
});
