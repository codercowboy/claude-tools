// Unit tests for UUID v4 (source/logic.mjs). node --test, no browser/DOM.
// Randomness is INJECTED: we feed fixed bytes and assert EXACT deterministic
// output — version nibble 4, variant bits 10xx, canonical 8-4-4-4-12.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, ramp, fill, bareHex } from './_helpers.mjs';

const { uuidV4, formatUuidBytes } = await loadLogic();

const CANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('uuidV4: all-zero bytes → version 4 + variant 10xx, exact output', () => {
  // b[6] = 0x40, b[8] = 0x80; everything else zero.
  assert.equal(uuidV4(fill(16, 0x00)), '00000000-0000-4000-8000-000000000000');
});

test('uuidV4: all-0xff bytes → version nibble stays 4, variant nibble becomes b', () => {
  // b[6] = (0xff & 0x0f) | 0x40 = 0x4f; b[8] = (0xff & 0x3f) | 0x80 = 0xbf.
  assert.equal(uuidV4(fill(16, 0xff)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('uuidV4: ramp bytes 0..15 → exact canonical string', () => {
  // b[6]=(0x06&0x0f)|0x40=0x46, b[8]=(0x08&0x3f)|0x80=0x88.
  assert.equal(uuidV4(ramp(16)), '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('uuidV4: matches canonical 8-4-4-4-12 shape and is lowercase', () => {
  const u = uuidV4(ramp(16));
  assert.match(u, CANON_RE);
  assert.equal(u, u.toLowerCase());
});

test('uuidV4: version nibble (13th hex digit) is always 4', () => {
  for (const v of [0x00, 0x11, 0x7f, 0xa5, 0xff]) {
    const hex = bareHex(uuidV4(fill(16, v)));
    assert.equal(hex[12], '4', `byte-fill ${v} produced version ${hex[12]}`);
  }
});

test('uuidV4: variant bits are 10xx (17th hex digit ∈ {8,9,a,b})', () => {
  for (const v of [0x00, 0x11, 0x7f, 0xa5, 0xff]) {
    const hex = bareHex(uuidV4(fill(16, v)));
    assert.ok('89ab'.includes(hex[16]), `byte-fill ${v} produced variant ${hex[16]}`);
  }
});

test('uuidV4: preserves the non-version/variant bytes exactly', () => {
  const hex = bareHex(uuidV4(ramp(16)));
  // Every position except idx 12 (version) and idx 16 (variant) is untouched.
  assert.equal(hex.slice(0, 12), '000102030405'); // bytes 0..5 untouched
  assert.equal(hex.slice(13, 16), '607');          // byte 6 low nibble + byte 7
  assert.equal(hex.slice(17, 32), '8090a0b0c0d0e0f'); // byte 8 low nibble + bytes 9..15
});

test('uuidV4: does not mutate the caller-supplied byte array', () => {
  const bytes = ramp(16);
  const copy = Uint8Array.from(bytes);
  uuidV4(bytes);
  assert.deepEqual(Array.from(bytes), Array.from(copy));
});

test('uuidV4: short/undefined byte arrays degrade to zeros (no NaN)', () => {
  assert.equal(uuidV4(new Uint8Array(0)), '00000000-0000-4000-8000-000000000000');
  assert.equal(uuidV4(undefined), '00000000-0000-4000-8000-000000000000');
});

test('formatUuidBytes: pure 16-byte → hyphenated hex (no version/variant forcing)', () => {
  assert.equal(formatUuidBytes(ramp(16)), '00010203-0405-0607-0809-0a0b0c0d0e0f');
});
