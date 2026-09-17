// Matrix construction + masking + BCH info-code unit tests:
// getAlignmentPatternPositions(), MASK_FNS, applyMask(), scorePenalty(),
// computeFormatBits(), computeVersionBits(), buildFunctionPatterns(),
// selectBestMask() (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQr } from './_helpers.mjs';

const {
  getAlignmentPatternPositions, MASK_FNS, applyMask, scorePenalty,
  computeFormatBits, computeVersionBits, buildFunctionPatterns, placeData,
  writeFormatInfo, writeVersionInfo, selectBestMask,
} = await loadQr();

// ---- Alignment pattern positions ----
// These exact vectors are the ones the tool's own source comments claim to
// have verified against thonky.com's published table — re-asserted here so
// a future edit that breaks the algorithmic derivation is caught.
test('getAlignmentPatternPositions(): known vectors', () => {
  assert.deepEqual(getAlignmentPatternPositions(1), []);
  assert.deepEqual(getAlignmentPatternPositions(2), [6, 18]);
  assert.deepEqual(getAlignmentPatternPositions(7), [6, 22, 38]);
  assert.deepEqual(getAlignmentPatternPositions(23), [6, 30, 54, 78, 102]);
  assert.deepEqual(getAlignmentPatternPositions(32), [6, 34, 60, 86, 112, 138]); // special-cased step=26
});

// ---- Mask formulas (ISO/IEC 18004 Table 10), spot-checked by hand ----
test('MASK_FNS: all 8 formulas agree with hand-derived values at (r=1, c=2)', () => {
  const expected = [false, false, false, true, true, false, true, false];
  expected.forEach((exp, i) => assert.equal(MASK_FNS[i](1, 2), exp, `mask ${i}`));
});

test('MASK_FNS: all 8 formulas are true at the origin (r=0, c=0)', () => {
  MASK_FNS.forEach((fn, i) => assert.equal(fn(0, 0), true, `mask ${i}`));
});

test('MASK_FNS has exactly 8 functions', () => {
  assert.equal(MASK_FNS.length, 8);
});

// ---- applyMask ----
test('applyMask(): flips non-function modules per the mask formula, leaves function modules untouched', () => {
  const raw = [[false, false, false], [false, false, false], [false, false, false]];
  const isFunction = [[true, false, false], [false, false, false], [false, false, false]];
  const out = applyMask(raw, isFunction, 0, 3); // mask 0: (r+c)%2===0
  assert.deepEqual(out, [
    [false, false, true],
    [false, true, false],
    [true, false, true],
  ]);
});

// ---- scorePenalty ----
test('scorePenalty(): exact hand-computed value for a 1x1 dark grid (rule 4 only applies)', () => {
  // dark=100%; prevMultipleOf5=100; a=|100-50|/5=10, b=|105-50|/5=11; min*10=100
  assert.equal(scorePenalty([[true]], 1), 100);
});

test('scorePenalty(): exact hand-computed value for a 1x1 light grid', () => {
  // dark=0%; prevMultipleOf5=0; a=|0-50|/5=10, b=|5-50|/5=9; min*10=90
  assert.equal(scorePenalty([[false]], 1), 90);
});

test('scorePenalty(): exact hand-computed value for a 2x2 all-dark grid (rule 2 + rule 4)', () => {
  // rule 2: one 2x2 same-color block -> +3. rule 4: 100% dark -> +100. total 103.
  assert.equal(scorePenalty([[true, true], [true, true]], 2), 103);
});

test('scorePenalty(): a uniform block scores worse than a checkerboard at realistic QR size (21x21)', () => {
  const size = 21;
  const uniform = Array.from({ length: size }, () => new Array(size).fill(true));
  const checker = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (r + c) % 2 === 0));
  assert.ok(scorePenalty(uniform, size) > scorePenalty(checker, size));
});

// ---- BCH format/version info: independently verified by GF(2) polynomial
// long division (bit-XOR based), a different algorithm from the LFSR-style
// loop the source itself uses to compute these values. A valid BCH
// codeword must be exactly divisible (remainder 0) by its generator.
function gf2Remainder(value, genPoly) {
  const degreeOf = (v) => (v === 0 ? -1 : 31 - Math.clz32(v));
  const genDegree = degreeOf(genPoly);
  let v = value;
  let vDegree = degreeOf(v);
  while (vDegree >= genDegree && v !== 0) {
    v ^= genPoly << (vDegree - genDegree);
    vDegree = degreeOf(v);
  }
  return v;
}

const FORMAT_GEN = 0b10100110111; // degree-10, matches the source's GEN constant
const FORMAT_MASK = 0b101010000010010;
const VERSION_GEN = 0b1111100100101; // degree-12

test('computeFormatBits(): all 32 (ecLevel, mask) format strings are valid BCH codewords', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let mask = 0; mask < 8; mask++) {
      const bits15 = computeFormatBits(level, mask);
      const unmasked = bits15 ^ FORMAT_MASK; // undo the fixed XOR mask (self-inverse)
      assert.equal(gf2Remainder(unmasked, FORMAT_GEN), 0, `${level} mask=${mask}`);
    }
  }
});

test('computeVersionBits(): all 34 version strings (v7-40) are valid BCH codewords', () => {
  for (let v = 7; v <= 40; v++) {
    const bits18 = computeVersionBits(v);
    assert.equal(gf2Remainder(bits18, VERSION_GEN), 0, `v${v}`);
    assert.equal(bits18 >>> 12, v, `v${v}: top 6 bits preserve the version number`);
  }
});

test('computeFormatBits(): distinct (ecLevel, mask) pairs produce distinct 15-bit codewords', () => {
  const seen = new Set();
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let mask = 0; mask < 8; mask++) {
      const bits = computeFormatBits(level, mask);
      assert.ok(!seen.has(bits), `duplicate format bits for ${level}/${mask}`);
      seen.add(bits);
    }
  }
  assert.equal(seen.size, 32);
});

// ---- selectBestMask: verify it truly picks the minimum-penalty candidate
// (not just *a* candidate), by independently recomputing the penalty of
// all 8 masks the same way selectBestMask does internally (mask -> write
// format/version info -> scorePenalty) and checking selectBestMask's
// chosen mask matches the argmin, with ties broken to the lowest index.
test('selectBestMask(): chosen mask has the minimum penalty among all 8 candidates', () => {
  const version = 3;
  const size = 17 + 4 * version;
  const { modules: rawModules, isFunction } = buildFunctionPatterns(size, version);
  // Fill non-function modules with a fixed, non-trivial bit pattern so masks
  // produce genuinely different penalty scores (not all-zero data).
  const bits = [];
  for (let i = 0; i < size * size; i++) bits.push((i * 7 + 3) % 5 === 0 ? 1 : 0);
  placeData(rawModules, isFunction, bits, size);

  const penalties = [];
  for (let m = 0; m < 8; m++) {
    const candidate = applyMask(rawModules, isFunction, m, size);
    writeFormatInfo(candidate, 'M', m, size);
    penalties.push(scorePenalty(candidate, size));
  }
  const minPenalty = Math.min(...penalties);
  const expectedMask = penalties.indexOf(minPenalty); // first (lowest-index) minimum

  const result = selectBestMask(rawModules, isFunction, size, version, 'M');
  assert.equal(result.mask, expectedMask);
  assert.equal(scorePenalty(result.modules, size), minPenalty);
});
