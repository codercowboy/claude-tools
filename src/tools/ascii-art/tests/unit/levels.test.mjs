// Unit tests for the tone pipeline: luminance, adjustLevel
// (brightness -> contrast -> gamma -> clamp) and normLevel (adds invert +
// normalize). Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { luminance, adjustLevel, normLevel } = await loadLogic();

test('luminance uses Rec.601 weights', () => {
  assert.equal(luminance(0, 0, 0), 0);
  assert.equal(luminance(255, 255, 255), 255);
  // Pure channels weighted 0.299 / 0.587 / 0.114.
  assert.ok(Math.abs(luminance(255, 0, 0) - 0.299 * 255) < 1e-9);
  assert.ok(Math.abs(luminance(0, 255, 0) - 0.587 * 255) < 1e-9);
  assert.ok(Math.abs(luminance(0, 0, 255) - 0.114 * 255) < 1e-9);
  // Green reads brightest, blue darkest.
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
  assert.ok(luminance(255, 0, 0) > luminance(0, 0, 255));
});

test('adjustLevel with no options is the identity (within clamp)', () => {
  for (const v of [0, 64, 128, 200, 255]) assert.equal(adjustLevel(v, {}), v);
});

test('brightness adds a scaled offset and clamps to 0..255', () => {
  // +100 => +255, so everything saturates to white.
  assert.equal(adjustLevel(100, { brightness: 100 }), 255);
  // -100 => -255, so everything crushes to black.
  assert.equal(adjustLevel(200, { brightness: -100 }), 0);
});

test('brightness half-step lands where the formula says', () => {
  // v + (50/100)*255 = 50 + 127.5 = 177.5, no contrast/gamma change.
  assert.equal(adjustLevel(50, { brightness: 50 }), 177.5);
});

test('contrast scales about the 128 midpoint', () => {
  // +100 => x2 about 128: 128 stays put; extremes push out and clamp.
  assert.equal(adjustLevel(128, { contrast: 100 }), 128);
  assert.equal(adjustLevel(200, { contrast: 100 }), 255); // (200-128)*2+128=272 -> clamp
  assert.equal(adjustLevel(0, { contrast: 100 }), 0);     // (0-128)*2+128=-128 -> clamp
  // -100 => x0: everything collapses to the midpoint.
  assert.equal(adjustLevel(0, { contrast: -100 }), 128);
  assert.equal(adjustLevel(255, { contrast: -100 }), 128);
});

test('gamma > 1 brightens mid-tones, gamma < 1 darkens them', () => {
  const base = 64;
  const brightened = adjustLevel(base, { gamma: 2 });
  const darkened = adjustLevel(base, { gamma: 0.5 });
  assert.ok(brightened > base, `gamma 2 should brighten (${brightened} > ${base})`);
  assert.ok(darkened < base, `gamma 0.5 should darken (${darkened} < ${base})`);
  // Endpoints are gamma-invariant.
  assert.equal(adjustLevel(0, { gamma: 2 }), 0);
  assert.equal(adjustLevel(255, { gamma: 2 }), 255);
});

test('a non-positive or non-finite gamma is treated as neutral (1)', () => {
  assert.equal(adjustLevel(64, { gamma: 0 }), 64);
  assert.equal(adjustLevel(64, { gamma: -3 }), 64);
  assert.equal(adjustLevel(64, { gamma: NaN }), 64);
});

test('normLevel normalizes to [0,1] with 0 = dark, 1 = light', () => {
  assert.equal(normLevel(0, {}), 0);
  assert.equal(normLevel(255, {}), 1);
  assert.ok(Math.abs(normLevel(128, {}) - 128 / 255) < 1e-9);
});

test('invert flips the normalized level', () => {
  assert.equal(normLevel(0, { invert: true }), 1);
  assert.equal(normLevel(255, { invert: true }), 0);
  const t = normLevel(64, {});
  assert.ok(Math.abs(normLevel(64, { invert: true }) - (1 - t)) < 1e-9);
});
