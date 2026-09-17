// anchorHues(): color-theory hue offsets per DESIGN.md's harmony table
// (Complementary/Analogous/Triadic/Split-complementary/Tetradic/
// Monochromatic) — node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner } from './_helpers.mjs';

const { anchorHues, norm360, ALGORITHMS, ALGO_LABELS } = await loadColorDesigner();

test('norm360: wraps into [0, 360)', () => {
  assert.equal(norm360(0), 0);
  assert.equal(norm360(360), 0);
  assert.equal(norm360(370), 10);
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(-370), 350);
});

test('anchorHues: complementary is H and H+180', () => {
  assert.deepEqual(anchorHues('complementary', 0), [0, 180]);
  assert.deepEqual(anchorHues('complementary', 90), [90, 270]);
  assert.deepEqual(anchorHues('complementary', 270), [270, 90]); // wraps
});

test('anchorHues: analogous is H-30, H, H+30', () => {
  assert.deepEqual(anchorHues('analogous', 60), [30, 60, 90]);
  assert.deepEqual(anchorHues('analogous', 0), [330, 0, 30]); // wraps below 0
});

test('anchorHues: triadic is H, H+120, H+240', () => {
  assert.deepEqual(anchorHues('triadic', 0), [0, 120, 240]);
  assert.deepEqual(anchorHues('triadic', 200), [200, 320, 80]); // 440 wraps to 80
});

test('anchorHues: split-complementary is H, H+150, H+210', () => {
  assert.deepEqual(anchorHues('splitComplementary', 0), [0, 150, 210]);
  assert.deepEqual(anchorHues('splitComplementary', 200), [200, 350, 50]); // 410 wraps to 50
});

test('anchorHues: tetradic is H, H+90, H+180, H+270', () => {
  assert.deepEqual(anchorHues('tetradic', 0), [0, 90, 180, 270]);
  assert.deepEqual(anchorHues('tetradic', 300), [300, 30, 120, 210]); // wraps
});

test('anchorHues: monochromatic is just H', () => {
  assert.deepEqual(anchorHues('monochromatic', 123), [123]);
});

test('anchorHues: unknown algorithm throws', () => {
  assert.throws(() => anchorHues('nonsense', 0));
});

test('anchorHues: every hue produced is normalized into [0, 360)', () => {
  for (const algo of ALGORITHMS.map((a) => a.key)) {
    for (const H of [-500, -10, 0, 45, 359, 720]) {
      for (const h of anchorHues(algo, H)) {
        assert.ok(h >= 0 && h < 360, `${algo} at H=${H} produced out-of-range hue ${h}`);
      }
    }
  }
});

test('ALGORITHMS/ALGO_LABELS: every algorithm key has a label and is covered by anchorHues', () => {
  assert.ok(ALGORITHMS.length >= 6);
  for (const { key, label } of ALGORITHMS) {
    assert.equal(ALGO_LABELS[key], label);
    assert.doesNotThrow(() => anchorHues(key, 0));
  }
});
