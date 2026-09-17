// Moods: the "roll of the dice" flavor layered on top of the harmony —
// hue-arc territory, saturation/lightness ranges, harmony-offset spread, and
// role scaling. Verifies moods compose with harmony, that 'any' is a no-op
// (byte-identical to the pre-mood behavior), and that roll() resolves mood
// keys (incl. 'surprise') the way it resolves 'random' harmony.
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner, seqRng } from './_helpers.mjs';

const {
  anchorHues, ANCHOR_OFFSETS, norm360,
  MOODS, MOOD_MAP, MOOD_ANY, SURPRISE_POOL, moodBaseHue, lerpRange,
  generateScheme, roll, rollWith, rgbToHsl,
} = await loadColorDesigner();

test('lerpRange: interpolates a [lo,hi] range', () => {
  assert.equal(lerpRange([0.55, 0.90], 0), 0.55);
  assert.equal(lerpRange([0.55, 0.90], 1), 0.90);
  assert.ok(Math.abs(lerpRange([0.45, 0.60], 0.5) - 0.525) < 1e-9);
});

test('anchorHues: spread=1 is unchanged; spread<1 scales the ORIGINAL offsets toward the base', () => {
  // spread 1 == the classic behavior other tests already lock in
  assert.deepEqual(anchorHues('triadic', 0, 1), [0, 120, 240]);
  // spread 0.5 halves each offset (240 -> 120, NOT the wrapped -120 -> -60)
  assert.deepEqual(anchorHues('triadic', 0, 0.5), [0, 60, 120]);
  // default arg is spread=1
  assert.deepEqual(anchorHues('complementary', 30), anchorHues('complementary', 30, 1));
  // 0 spread collapses every anchor onto the base hue (monochrome)
  assert.deepEqual(anchorHues('tetradic', 100, 0), [100, 100, 100, 100]);
});

test('ANCHOR_OFFSETS: matches the DESIGN.md harmony table', () => {
  assert.deepEqual(ANCHOR_OFFSETS.complementary, [0, 180]);
  assert.deepEqual(ANCHOR_OFFSETS.analogous, [-30, 0, 30]);
  assert.deepEqual(ANCHOR_OFFSETS.triadic, [0, 120, 240]);
  assert.deepEqual(ANCHOR_OFFSETS.splitComplementary, [0, 150, 210]);
  assert.deepEqual(ANCHOR_OFFSETS.tetradic, [0, 90, 180, 270]);
  assert.deepEqual(ANCHOR_OFFSETS.monochromatic, [0]);
});

test('moodBaseHue: MOOD_ANY draws a single rng()*360 (hue-free)', () => {
  assert.equal(moodBaseHue(MOOD_ANY, seqRng([0.5])), 180);
  assert.equal(moodBaseHue(MOOD_ANY, seqRng([0])), 0);
});

test('moodBaseHue: a single-arc mood picks a hue inside its arc', () => {
  const ocean = MOOD_MAP.ocean; // [[175, 230]]
  for (const t of [0, 0.25, 0.5, 0.75, 0.999]) {
    const h = moodBaseHue(ocean, seqRng([t]));
    assert.ok(h >= 175 && h <= 230, `hue ${h} outside ocean arc for t=${t}`);
  }
});

test('moodBaseHue: a wrapped arc (end < start) stays within the wrapped span', () => {
  const sunset = MOOD_MAP.sunset; // [[335, 45]] wraps through 360
  for (const t of [0, 0.3, 0.6, 0.999]) {
    const h = moodBaseHue(sunset, seqRng([t]));
    const inArc = (h >= 335 && h <= 360) || (h >= 0 && h <= 45);
    assert.ok(inArc, `hue ${h} outside wrapped sunset arc for t=${t}`);
  }
});

test('generateScheme: passing MOOD_ANY explicitly === omitting mood (no behavior change)', () => {
  const seq = [0.42, 0.1, 0.9, 0.33, 0.7, 0.2, 0.6, 0.4, 0.8, 0.15, 0.55];
  const withDefault = generateScheme('analogous', [], 5, seqRng(seq));
  const withAny = generateScheme('analogous', [], 5, seqRng(seq), MOOD_ANY);
  assert.deepEqual(withAny, withDefault);
});

test('generateScheme: a themed mood keeps its base hue in the mood arc', () => {
  // No seeds, so the base hue comes straight from the mood arc. The FIRST
  // color uses offset 0 (base hue itself) for every algorithm, so its hue must
  // land inside the ocean arc regardless of harmony.
  const ocean = MOOD_MAP.ocean;
  for (const algo of ['complementary', 'triadic', 'tetradic', 'monochromatic']) {
    const scheme = generateScheme(algo, [], 4, seqRng([0.9, 0.4, 0.6, 0.2, 0.7]), ocean);
    const h0 = rgbToHsl(scheme[0]).h;
    assert.ok(h0 >= 170 && h0 <= 235, `${algo}: base hue ${h0} not oceanic`);
  }
});

test('generateScheme: every mood produces N valid colors for a range of N', () => {
  for (const mood of MOODS) {
    for (const n of [2, 4, 7, 10]) {
      const scheme = generateScheme('triadic', [], n, seqRng([0.3, 0.6, 0.1, 0.8, 0.45, 0.2, 0.9, 0.5]), mood);
      assert.equal(scheme.length, n, `${mood.key} n=${n}`);
      for (const c of scheme) {
        assert.ok(Number.isInteger(c.r) && c.r >= 0 && c.r <= 255, `${mood.key} r`);
        assert.ok(Number.isInteger(c.g) && c.g >= 0 && c.g <= 255, `${mood.key} g`);
        assert.ok(Number.isInteger(c.b) && c.b >= 0 && c.b <= 255, `${mood.key} b`);
      }
    }
  }
});

test('roll: an explicit mood is echoed back on the result, unchanged', () => {
  const result = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: seqRng([0.1, 0.2, 0.3, 0.4]), mood: 'ocean' });
  assert.equal(result.mood, 'ocean');
});

test('roll: omitting mood (and the pre-mood call shape) resolves to "any"', () => {
  const result = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: seqRng([0.1, 0.2, 0.3, 0.4]) });
  assert.equal(result.mood, 'any');
});

test('roll: an unknown mood key falls back to "any" (covers stale stored state)', () => {
  const result = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: seqRng([0.1, 0.2]), mood: 'bogus' });
  assert.equal(result.mood, 'any');
});

test('roll: "surprise" (the default) means NO mood persuasion — resolves to "any" every time', () => {
  for (const first of [0, 0.34, 0.67, 0.999]) {
    const result = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: seqRng([first, 0.2, 0.6, 0.4, 0.8]), mood: 'surprise' });
    assert.equal(result.mood, 'any', `surprise should be no-persuasion, got ${result.mood}`);
  }
});

test('roll: "surprise" draws no extra rng — a no-mood roll matches an omitted-mood roll for the same rng', () => {
  const seq = [0.7, 0.1, 0.9, 0.33, 0.6, 0.25, 0.5, 0.4, 0.8];
  const surprise = rollWith({ algorithm: 'triadic', seeds: [], count: 4, rngSeq: seq, mood: 'surprise' });
  const omitted = rollWith({ algorithm: 'triadic', seeds: [], count: 4, rngSeq: seq });
  assert.deepEqual(surprise.schemes, omitted.schemes);
  assert.equal(surprise.mood, 'any');
});

test('roll: mood is deterministic given the same rng sequence (rollWith)', () => {
  const seq = [0.7, 0.1, 0.9, 0.33, 0.6, 0.25, 0.5, 0.4, 0.8];
  const a = rollWith({ algorithm: 'random', seeds: [], count: 4, rngSeq: seq, mood: 'surprise' });
  const b = rollWith({ algorithm: 'random', seeds: [], count: 4, rngSeq: seq, mood: 'surprise' });
  assert.equal(a.mood, b.mood);
  assert.equal(a.algorithm, b.algorithm);
  assert.deepEqual(a.schemes, b.schemes);
});

test('MOOD_MAP: every mood has well-formed ranges and MOOD_ANY is the classic default', () => {
  assert.equal(MOOD_ANY.key, 'any');
  assert.equal(MOOD_ANY.hueArcs, null);
  assert.deepEqual(MOOD_ANY.sat, [0.55, 0.90]);
  assert.deepEqual(MOOD_ANY.light, [0.45, 0.60]);
  for (const mood of MOODS) {
    assert.ok(mood.sat[0] <= mood.sat[1], `${mood.key} sat range`);
    assert.ok(mood.light[0] <= mood.light[1], `${mood.key} light range`);
    assert.ok(mood.spread >= 0 && mood.spread <= 1, `${mood.key} spread`);
    assert.equal(MOOD_MAP[mood.key], mood);
  }
});
