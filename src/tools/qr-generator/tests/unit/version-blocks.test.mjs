// Version selection + block-plan unit tests: selectVersion(), getDataCodewordCount(),
// getBlockPlan(), and the version/EC lookup tables' self-consistency
// (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQr } from './_helpers.mjs';

const {
  selectVersion, getDataCodewordCount, getBlockPlan,
  TOTAL_CODEWORDS, ECC_CODEWORDS_PER_BLOCK, NUM_EC_BLOCKS,
} = await loadQr();

test('selectVersion() picks version 1 for tiny input at every EC level', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    assert.equal(selectVersion(1, level), 1);
  }
});

test('selectVersion() is monotonically non-decreasing in byte length', () => {
  let prev = 1;
  for (let n = 1; n <= 2000; n += 37) {
    const v = selectVersion(n, 'M');
    if (v === null) break;
    assert.ok(v >= prev, `version regressed at byteLength=${n}`);
    prev = v;
  }
});

// V1-L byte-mode capacity is the well-known spec spot-check of 17 bytes
// (also called out in the tool's own source comments) — independently
// re-derived here from the raw tables rather than trusting the function.
test('selectVersion(): V1-L capacity boundary is exactly 17 bytes', () => {
  const dataCodewords = TOTAL_CODEWORDS[1] - ECC_CODEWORDS_PER_BLOCK.L[1] * NUM_EC_BLOCKS.L[1];
  assert.equal(dataCodewords, 19); // 26 - 7*1
  const headerBits = 4 + 8; // mode + charCountBits(1)
  const maxBytes = Math.floor((dataCodewords * 8 - headerBits) / 8);
  assert.equal(maxBytes, 17);
  assert.equal(selectVersion(17, 'L'), 1);
  assert.equal(selectVersion(18, 'L'), 2);
});

// V40-H byte-mode capacity is the well-known spec spot-check of 1273 bytes.
test('selectVersion(): V40-H capacity boundary is exactly 1273 bytes, then null', () => {
  const dataCodewords = TOTAL_CODEWORDS[40] - ECC_CODEWORDS_PER_BLOCK.H[40] * NUM_EC_BLOCKS.H[40];
  assert.equal(dataCodewords, 1276); // 3706 - 30*81
  const headerBits = 4 + 16; // mode + charCountBits(40)
  const maxBytes = Math.floor((dataCodewords * 8 - headerBits) / 8);
  assert.equal(maxBytes, 1273);
  assert.equal(selectVersion(1273, 'H'), 40);
  assert.equal(selectVersion(1274, 'H'), null); // exceeds V40 capacity at EC=H
});

test('selectVersion(): higher EC level never yields a smaller (or equal-capacity) version for the same input', () => {
  // H has the least data capacity per version, so for a fixed byte length it
  // should never select a *smaller* version than L.
  for (let n = 10; n <= 500; n += 53) {
    const vL = selectVersion(n, 'L');
    const vH = selectVersion(n, 'H');
    if (vL === null || vH === null) continue;
    assert.ok(vH >= vL, `H(${vH}) should be >= L(${vL}) at byteLength=${n}`);
  }
});

test('getDataCodewordCount() matches getBlockPlan().totalDataCodewords', () => {
  for (let v = 1; v <= 40; v++) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      assert.equal(getDataCodewordCount(v, level), getBlockPlan(v, level).totalDataCodewords);
    }
  }
});

test('getBlockPlan(): block split + EC codewords reconstruct TOTAL_CODEWORDS for every version x EC level', () => {
  for (let v = 1; v <= 40; v++) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      const plan = getBlockPlan(v, level);
      const dataSum =
        plan.numBlocksGroup1 * plan.dataCodewordsGroup1 +
        plan.numBlocksGroup2 * plan.dataCodewordsGroup2;
      assert.equal(dataSum, plan.totalDataCodewords, `v${v} ${level}: data codewords`);

      const numBlocks = plan.numBlocksGroup1 + plan.numBlocksGroup2;
      assert.equal(numBlocks, NUM_EC_BLOCKS[level][v], `v${v} ${level}: block count`);

      const total = plan.totalDataCodewords + plan.ecCodewordsPerBlock * numBlocks;
      assert.equal(total, TOTAL_CODEWORDS[v], `v${v} ${level}: total codewords`);
    }
  }
});

test('getBlockPlan(): group-2 blocks (if any) carry exactly one extra data codeword', () => {
  for (let v = 1; v <= 40; v++) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      const plan = getBlockPlan(v, level);
      if (plan.numBlocksGroup2 > 0) {
        assert.equal(plan.dataCodewordsGroup2, plan.dataCodewordsGroup1 + 1, `v${v} ${level}`);
      } else {
        assert.equal(plan.dataCodewordsGroup2, 0, `v${v} ${level}`);
      }
    }
  }
});
