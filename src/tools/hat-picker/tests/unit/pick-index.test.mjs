// pickIndex() / defaultRng() unit tests (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHatPicker, mulberry32 } from './_helpers.mjs';

const { pickIndex, defaultRng } = await loadHatPicker();

test('pickIndex() maps rng()=0 to index 0', () => {
  assert.equal(pickIndex(5, () => 0), 0);
});

test('pickIndex() maps an rng() just under 1 to the last index', () => {
  assert.equal(pickIndex(5, () => 0.999999), 4);
});

test('pickIndex() floors the scaled rng value into range for a mid value', () => {
  assert.equal(pickIndex(4, () => 0.5), 2); // floor(0.5 * 4) = 2
  assert.equal(pickIndex(10, () => 0.35), 3); // floor(0.35 * 10) = 3
});

test('pickIndex() with count=1 always returns 0 regardless of rng()', () => {
  assert.equal(pickIndex(1, () => 0), 0);
  assert.equal(pickIndex(1, () => 0.999), 0);
});

test('pickIndex() throws a RangeError for count <= 0', () => {
  assert.throws(() => pickIndex(0, () => 0.5), RangeError);
  assert.throws(() => pickIndex(-3, () => 0.5), RangeError);
});

test('pickIndex() defaults to defaultRng() when no rng is given', () => {
  // Just assert it returns a valid index in range — defaultRng is
  // non-deterministic (crypto-backed) by design.
  for (let i = 0; i < 20; i++) {
    const idx = pickIndex(7);
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 7, `idx=${idx} out of range`);
  }
});

test('pickIndex() is deterministic and reproducible with a seeded rng', () => {
  const rngA = mulberry32(42);
  const rngB = mulberry32(42);
  const seqA = Array.from({ length: 20 }, () => pickIndex(6, rngA));
  const seqB = Array.from({ length: 20 }, () => pickIndex(6, rngB));
  assert.deepEqual(seqA, seqB);
});

test('pickIndex() with a seeded rng produces indexes that land across the whole range over many draws', () => {
  const rng = mulberry32(7);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(pickIndex(6, rng));
  assert.equal(seen.size, 6, 'expected all 6 indexes to appear at least once');
});

test('defaultRng() returns a float in [0, 1)', () => {
  for (let i = 0; i < 50; i++) {
    const v = defaultRng();
    assert.ok(v >= 0 && v < 1, `defaultRng() returned ${v}`);
  }
});
