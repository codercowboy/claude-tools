// Reed-Solomon error-correction codeword generation unit tests: gfMul(),
// rsGeneratorPoly(), rsComputeRemainder(), splitIntoBlocks(), interleave(),
// bytesToBits() (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQr } from './_helpers.mjs';

const { gfMul, rsGeneratorPoly, rsComputeRemainder, splitIntoBlocks, interleave, bytesToBits } = await loadQr();

test('gfMul(): zero is absorbing', () => {
  assert.equal(gfMul(0, 200), 0);
  assert.equal(gfMul(200, 0), 0);
  assert.equal(gfMul(0, 0), 0);
});

test('gfMul(): 1 is the multiplicative identity', () => {
  for (const a of [1, 2, 17, 128, 255]) {
    assert.equal(gfMul(1, a), a);
    assert.equal(gfMul(a, 1), a);
  }
});

test('gfMul(): commutative over a spread of values', () => {
  const values = [3, 7, 19, 64, 100, 200, 255];
  for (const a of values) for (const b of values) assert.equal(gfMul(a, b), gfMul(b, a));
});

test('gfMul(): distributes over GF(256) addition (XOR) — a real field-algebra invariant', () => {
  const values = [1, 2, 5, 9, 13, 50, 99, 254];
  for (const a of values) {
    for (const b of values) {
      for (const c of values) {
        assert.equal(gfMul(a, b) ^ gfMul(a, c), gfMul(a, b ^ c), `a=${a} b=${b} c=${c}`);
      }
    }
  }
});

test('rsGeneratorPoly(1) === [1, 1] (hand-derived: (x - alpha^0), alpha^0 = 1)', () => {
  assert.deepEqual(Array.from(rsGeneratorPoly(1)), [1, 1]);
});

test('rsGeneratorPoly(2) === [1, 3, 2] (hand-derived: (x-a^0)(x-a^1), a^0=1, a^1=2)', () => {
  // coefficients: [1, a^0^a^1, a^0*a^1] = [1, 1^2, gfMul(1,2)] = [1, 3, 2]
  assert.deepEqual(Array.from(rsGeneratorPoly(2)), [1, 3, 2]);
});

test('rsGeneratorPoly(): degree n poly has n+1 coefficients and a leading 1', () => {
  for (const n of [1, 5, 10, 18, 30]) {
    const poly = rsGeneratorPoly(n);
    assert.equal(poly.length, n + 1);
    assert.equal(poly[0], 1);
  }
});

test('rsGeneratorPoly(): repeated calls are consistent (cache correctness)', () => {
  assert.deepEqual(Array.from(rsGeneratorPoly(7)), Array.from(rsGeneratorPoly(7)));
});

// Independent correctness check for rsComputeRemainder(): a Reed-Solomon
// codeword (data codewords followed by its EC remainder) must evaluate to
// zero at every root alpha^0..alpha^(ecCount-1) of the generator polynomial
// (alpha = 2, the field's primitive element). This is verified here via
// direct polynomial evaluation — a completely different algorithm from the
// LFSR-style division rsComputeRemainder itself uses — so it's a real
// correctness proof, not a tautology.
function alphaPow(i) {
  let v = 1;
  for (let k = 0; k < i; k++) v = gfMul(v, 2);
  return v;
}
function evalPolyAt(coeffsHighFirst, x) {
  let result = 0;
  for (const c of coeffsHighFirst) result = gfMul(result, x) ^ c;
  return result;
}

test('rsComputeRemainder(): resulting codeword is divisible by the generator (all roots evaluate to 0)', () => {
  // Thonky.com's classic worked-example data block (13 data codewords),
  // encoded with a 10-codeword EC block — used here purely as a nontrivial,
  // fixed-length fixture, not because this tool must reproduce those exact
  // published EC bytes.
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
  const ecCount = 10;
  const remainder = rsComputeRemainder(data, ecCount);
  assert.equal(remainder.length, ecCount);
  const full = data.concat(Array.from(remainder));
  for (let i = 0; i < ecCount; i++) {
    assert.equal(evalPolyAt(full, alphaPow(i)), 0, `root alpha^${i}`);
  }
});

test('rsComputeRemainder(): all-zero data produces an all-zero remainder', () => {
  const remainder = rsComputeRemainder(new Uint8Array(5), 6);
  assert.deepEqual(Array.from(remainder), new Array(6).fill(0));
});

test('rsComputeRemainder(): ecCount=0 returns an empty remainder', () => {
  const remainder = rsComputeRemainder([1, 2, 3], 0);
  assert.equal(remainder.length, 0);
});

test('splitIntoBlocks(): splits into group-1 then group-2 blocks in order', () => {
  const data = [1, 2, 3, 4, 5, 6, 7];
  const plan = { numBlocksGroup1: 2, dataCodewordsGroup1: 2, numBlocksGroup2: 1, dataCodewordsGroup2: 3 };
  const blocks = splitIntoBlocks(data, plan);
  assert.deepEqual(blocks.map((b) => Array.from(b)), [[1, 2], [3, 4], [5, 6, 7]]);
});

test('interleave(): round-robins data codewords across blocks, then EC codewords', () => {
  const blocks = [
    { data: [1, 2], ec: [9] },
    { data: [3, 4], ec: [10] },
  ];
  assert.deepEqual(interleave(blocks), [1, 3, 2, 4, 9, 10]);
});

test('interleave(): a shorter block stops contributing once exhausted (uneven group sizes)', () => {
  const blocks = [
    { data: [1, 2], ec: [] },
    { data: [3, 4], ec: [] },
    { data: [5, 6, 7], ec: [] },
  ];
  assert.deepEqual(interleave(blocks), [1, 3, 5, 2, 4, 6, 7]);
});

test('bytesToBits(): expands each byte MSB-first into 8 bits', () => {
  assert.deepEqual(bytesToBits([0b10110001]), [1, 0, 1, 1, 0, 0, 0, 1]);
  assert.deepEqual(bytesToBits([0x00, 0xFF]), [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
});

test('bytesToBits(): empty input yields empty output', () => {
  assert.deepEqual(bytesToBits([]), []);
});
