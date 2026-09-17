// Unit tests for UUID v7 (source/logic.mjs). node --test, no browser/DOM.
// v7 packs a 48-bit big-endian Unix-ms timestamp into the high bits; version
// nibble 7; variant 10xx. Time + bytes are both injected → exact output, and
// inspectUuid must round-trip the encoded time exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, ramp, fill, bareHex } from './_helpers.mjs';

const { uuidV7, inspectUuid } = await loadLogic();

const CANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('uuidV7: time=1ms + ramp bytes → exact canonical string', () => {
  // First 6 bytes = 48-bit BE ms (1 → 00 00 00 00 00 01); b[6]=(0x06&0x0f)|0x70,
  // b[8]=(0x08&0x3f)|0x80; remaining bytes untouched.
  assert.equal(uuidV7(1, ramp(16)), '00000000-0001-7607-8809-0a0b0c0d0e0f');
});

test('uuidV7: shape, version nibble 7, variant 10xx', () => {
  const u = uuidV7(1700000000000, ramp(16));
  assert.match(u, CANON_RE);
  const hex = bareHex(u);
  assert.equal(hex[12], '7');
  assert.ok('89ab'.includes(hex[16]));
});

test('uuidV7: the high 48 bits are exactly the timestamp (big-endian ms)', () => {
  for (const time of [0, 1, 1000, 1700000000000, 0xffffffffffff]) {
    const hex = bareHex(uuidV7(time, fill(16, 0xff)));
    // First 12 hex chars = 48-bit timestamp.
    assert.equal(parseInt(hex.slice(0, 12), 16), time, `time ${time}`);
  }
});

test('uuidV7: version/variant nibbles hold even with all-0xff randomness', () => {
  const hex = bareHex(uuidV7(1700000000000, fill(16, 0xff)));
  assert.equal(hex[12], '7');
  assert.ok('89ab'.includes(hex[16]));
});

test('inspectUuid round-trips the v7 timestamp exactly', () => {
  for (const time of [0, 1, 1000, 1700000000000, 1893456000000]) {
    const u = uuidV7(time, ramp(16));
    const info = inspectUuid(u);
    assert.equal(info.valid, true);
    assert.equal(info.version, 7);
    assert.ok(info.timestamp instanceof Date);
    assert.equal(info.timestamp.getTime(), time, `time ${time}`);
  }
});

test('uuidV7: max 48-bit timestamp encodes to all-f time field', () => {
  const hex = bareHex(uuidV7(0xffffffffffff, fill(16, 0x00)));
  assert.equal(hex.slice(0, 12), 'ffffffffffff');
});

test('uuidV7: negative / non-finite time is clamped to 0', () => {
  assert.equal(bareHex(uuidV7(-5, fill(16, 0))).slice(0, 12), '000000000000');
  assert.equal(bareHex(uuidV7(NaN, fill(16, 0))).slice(0, 12), '000000000000');
});
