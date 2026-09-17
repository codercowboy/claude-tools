// Unit tests for ULID + Crockford helpers (source/logic.mjs).
// node --test, no browser/DOM. Time + bytes injected → exact output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, fill } from './_helpers.mjs';

const { ulid, CROCKFORD, encodeTimeCrockford, bytesToCrockford } = await loadLogic();

test('CROCKFORD alphabet: 32 chars, excludes I L O U', () => {
  assert.equal(CROCKFORD, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.equal(CROCKFORD.length, 32);
  for (const c of 'ILOU') assert.ok(!CROCKFORD.includes(c), `contains ${c}`);
});

test('ulid: is exactly 26 chars', () => {
  assert.equal(ulid(0, fill(10, 0)).length, 26);
  assert.equal(ulid(1700000000000, fill(10, 0xff)).length, 26);
});

test('ulid: uses only Crockford characters (uppercase, no I/L/O/U)', () => {
  const s = ulid(1700000000000, fill(10, 0xab));
  for (const c of s) assert.ok(CROCKFORD.includes(c), `non-Crockford char ${c}`);
  assert.equal(s, s.toUpperCase());
});

test('ulid: time=0 + zero bytes → all zeros', () => {
  assert.equal(ulid(0, fill(10, 0x00)), '0'.repeat(26));
});

test('ulid: time=1 + 0xff bytes → exact output (10-char time + 16 Zs)', () => {
  // encodeTimeCrockford(1,10) = "0000000001"; 80 bits of 1 → 16 × 'Z'.
  assert.equal(ulid(1, fill(10, 0xff)), '0000000001' + 'Z'.repeat(16));
});

test('ulid: the 10-char time prefix is monotonic (lexicographic == chronological)', () => {
  const times = [0, 1, 1000, 1700000000000, 1893456000000];
  const prefixes = times.map((t) => ulid(t, fill(10, 0)).slice(0, 10));
  const sorted = [...prefixes].sort();
  assert.deepEqual(prefixes, sorted);
  // Strictly increasing for strictly increasing times.
  for (let i = 1; i < prefixes.length; i++) {
    assert.ok(prefixes[i] > prefixes[i - 1], `${prefixes[i]} !> ${prefixes[i - 1]}`);
  }
});

test('encodeTimeCrockford: big-endian, most-significant char first', () => {
  assert.equal(encodeTimeCrockford(0, 10), '0000000000');
  assert.equal(encodeTimeCrockford(1, 10), '0000000001');
  assert.equal(encodeTimeCrockford(31, 10), '000000000Z'); // 31 → 'Z'
  assert.equal(encodeTimeCrockford(32, 10), '0000000010'); // 32 → "10"
});

test('bytesToCrockford: 80 bits of 0xff → 16 Zs; 80 bits of 0x00 → 16 zeros', () => {
  assert.equal(bytesToCrockford(fill(10, 0xff), 16), 'Z'.repeat(16));
  assert.equal(bytesToCrockford(fill(10, 0x00), 16), '0'.repeat(16));
});

test('bytesToCrockford: pads/truncates to the requested char count', () => {
  assert.equal(bytesToCrockford(fill(10, 0xff), 16).length, 16);
  assert.equal(bytesToCrockford(fill(1, 0xff), 16).length, 16); // padded
});
