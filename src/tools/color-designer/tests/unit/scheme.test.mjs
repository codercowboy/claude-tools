// generateScheme()/roll(): scheme building from a seed, N honored (2-10),
// "Random" resolves one algorithm shared by all 5 schemes, determinism given
// an injected rng, and seed injection (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner, seqRng } from './_helpers.mjs';

const {
  generateScheme, roll, rollWith, injectSeeds, pickSeedCount, pickRandomSeeds,
  clampCount, DEFAULT_COUNT, MIN_COUNT, MAX_COUNT, ALGORITHMS, rgbToHsl,
} = await loadColorDesigner();

function isValidColor(c) {
  return Number.isInteger(c.r) && c.r >= 0 && c.r <= 255
    && Number.isInteger(c.g) && c.g >= 0 && c.g <= 255
    && Number.isInteger(c.b) && c.b >= 0 && c.b <= 255
    && typeof c.a === 'number' && c.a >= 0 && c.a <= 1;
}

test('clampCount: clamps to [2,10], rounds, and falls back to default for non-finite input', () => {
  assert.equal(clampCount(4), 4);
  assert.equal(clampCount(1), MIN_COUNT);
  assert.equal(clampCount(20), MAX_COUNT);
  assert.equal(clampCount(5.6), 6);
  assert.equal(clampCount(NaN), DEFAULT_COUNT);
  assert.equal(clampCount(undefined), DEFAULT_COUNT);
});

test('generateScheme: produces exactly N valid colors for every N in 2..10', () => {
  for (let n = 2; n <= 10; n++) {
    const rng = seqRng([0.1, 0.9, 0.3, 0.5, 0.7, 0.2, 0.6, 0.4, 0.8, 0.15, 0.55]);
    const colors = generateScheme('triadic', [], n, rng);
    assert.equal(colors.length, n);
    for (const c of colors) assert.ok(isValidColor(c), JSON.stringify(c));
  }
});

test('generateScheme: is deterministic for a fixed rng sequence', () => {
  const seed = () => seqRng([0.42, 0.1, 0.9, 0.33, 0.7, 0.2, 0.6, 0.4, 0.8, 0.15]);
  const a = generateScheme('analogous', [], 5, seed());
  const b = generateScheme('analogous', [], 5, seed());
  assert.deepEqual(a, b);
});

test('generateScheme: with no seeds, colors are still fully generated (no exception, right count)', () => {
  const rng = seqRng([0.05, 0.95, 0.25, 0.75]);
  const colors = generateScheme('monochromatic', [], 3, rng);
  assert.equal(colors.length, 3);
});

test('roll: a specific (non-random) algorithm is echoed back resolved unchanged', () => {
  const result = roll({ algorithm: 'tetradic', seeds: [], count: 4, rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5]) });
  assert.equal(result.algorithm, 'tetradic');
  assert.equal(result.schemes.length, 5);
  for (const scheme of result.schemes) assert.equal(scheme.length, 4);
});

test('roll: "random" resolves to exactly one ALGORITHMS key, used internally by all 5 schemes', () => {
  const result = roll({ algorithm: 'random', seeds: [], count: 4, rng: seqRng([0.83, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) });
  const keys = ALGORITHMS.map((a) => a.key);
  assert.ok(keys.includes(result.algorithm), `resolved algorithm ${result.algorithm} not in ${keys}`);
  assert.equal(result.schemes.length, 5);
});

test('roll: deterministic given the same rng sequence (rollWith/makeSeqRng)', () => {
  const seq = [0.83, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.15, 0.25, 0.35, 0.45];
  const a = rollWith({ algorithm: 'random', seeds: [], count: 4, rngSeq: seq });
  const b = rollWith({ algorithm: 'random', seeds: [], count: 4, rngSeq: seq });
  assert.deepEqual(a, b);
});

test('injectSeeds: places the seed color exactly into its nearest-hue slot', () => {
  // Three generated colors at hues 0 (red), 120 (green), 240 (blue).
  const colors = [
    { r: 255, g: 0, b: 0, a: 1 },   // hue 0
    { r: 0, g: 255, b: 0, a: 1 },   // hue 120
    { r: 0, g: 0, b: 255, a: 1 },   // hue 240
  ];
  const seed = { r: 10, g: 200, b: 20, a: 1 }; // greenish -> hue near 120
  const result = injectSeeds(colors.map((c) => ({ ...c })), [seed]);
  const seedHue = rgbToHsl(seed).h;
  const nearestIdx = colors
    .map((c, i) => [i, Math.abs(rgbToHsl(c).h - seedHue)])
    .sort((a, b) => a[1] - b[1])[0][0];
  assert.deepEqual(result[nearestIdx], { r: 10, g: 200, b: 20, a: 1 });
});

test('injectSeeds: multiple seeds land in distinct slots (collision-free)', () => {
  const colors = [
    { r: 255, g: 0, b: 0, a: 1 },  // hue 0
    { r: 255, g: 0, b: 0, a: 1 },  // duplicate hue 0 slot -> forces a collision test
    { r: 0, g: 0, b: 255, a: 1 },  // hue 240
  ];
  const seeds = [
    { r: 250, g: 5, b: 5, a: 1 },  // near hue 0
    { r: 245, g: 10, b: 10, a: 1 }, // also near hue 0 -> must take the OTHER hue-0 slot
  ];
  const result = injectSeeds(colors.map((c) => ({ ...c })), seeds);
  // Both seed colors must appear somewhere in the result, in two distinct slots.
  const seedKeys = new Set(seeds.map((s) => `${s.r},${s.g},${s.b}`));
  const foundKeys = result
    .map((c) => `${c.r},${c.g},${c.b}`)
    .filter((k) => seedKeys.has(k));
  assert.equal(new Set(foundKeys).size, 2, `expected both seeds placed distinctly, got ${JSON.stringify(result)}`);
});

test('injectSeeds: a seed missing alpha defaults to fully opaque', () => {
  const colors = [{ r: 0, g: 0, b: 0, a: 1 }];
  const result = injectSeeds(colors, [{ r: 9, g: 9, b: 9 }]);
  assert.equal(result[0].a, 1);
});

test('pickSeedCount: returns 0 for an empty pool, else 1..min(3, pool, count)', () => {
  assert.equal(pickSeedCount(0, 5, seqRng([0.5])), 0);
  for (const [pool, count] of [[1, 4], [2, 4], [5, 2], [5, 10]]) {
    const cap = Math.max(1, Math.min(3, pool, count));
    for (const r of [0, 0.33, 0.66, 0.99]) {
      const k = pickSeedCount(pool, count, seqRng([r]));
      assert.ok(k >= 1 && k <= cap, `pool=${pool} count=${count} r=${r} -> k=${k} (cap ${cap})`);
    }
  }
});

test('pickRandomSeeds: picks k distinct seeds without replacement', () => {
  const seeds = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const chosen = pickRandomSeeds(seeds, 3, seqRng([0.1, 0.5, 0.9]));
  assert.equal(chosen.length, 3);
  const ids = chosen.map((s) => s.id);
  assert.equal(new Set(ids).size, 3); // no duplicates
});
