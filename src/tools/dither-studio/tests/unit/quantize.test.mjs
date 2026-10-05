// Unit tests for median-cut quantization, area-average pixel scaling and the
// brightness/contrast LUT (source/logic.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  medianCut,
  buildHistogram,
  pixelScale,
  buildBrightnessContrastLUT,
  applyLUT,
} from '../../source/logic.mjs';

// Build an RGBA buffer from a flat list of [r,g,b] pixels.
function rgba(pixels) {
  const out = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    out[i * 4] = pixels[i][0]; out[i * 4 + 1] = pixels[i][1];
    out[i * 4 + 2] = pixels[i][2]; out[i * 4 + 3] = 255;
  }
  return out;
}

test('buildHistogram de-dupes colors and counts occurrences', () => {
  const hist = buildHistogram(rgba([[10, 20, 30], [10, 20, 30], [40, 50, 60]]));
  assert.equal(hist.length, 2);
  const byKey = Object.fromEntries(hist.map((c) => [c.r + ',' + c.g + ',' + c.b, c.count]));
  assert.equal(byKey['10,20,30'], 2);
  assert.equal(byKey['40,50,60'], 1);
});

test('medianCut yields at most N colors, all channels in [0,255]', () => {
  // 8 distinct colors spread across the cube.
  const pixels = [
    [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255],
    [255, 255, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255],
  ];
  for (const n of [2, 3, 4, 5, 8]) {
    const pal = medianCut(rgba(pixels), n);
    assert.ok(pal.length <= n, `≤${n} colors (got ${pal.length})`);
    assert.ok(pal.length >= 1);
    for (const c of pal) {
      assert.equal(c.length, 3);
      for (const ch of c) {
        assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, 'channel in range: ' + ch);
      }
    }
  }
});

test('medianCut returns the exact colors when the image has fewer than N', () => {
  const pal = medianCut(rgba([[10, 20, 30], [200, 100, 50]]), 16);
  const set = new Set(pal.map((c) => c.join(',')));
  assert.equal(pal.length, 2);
  assert.ok(set.has('10,20,30'));
  assert.ok(set.has('200,100,50'));
});

test('medianCut is deterministic across runs', () => {
  const pixels = rgba([
    [12, 34, 56], [200, 10, 10], [10, 200, 10], [10, 10, 200],
    [120, 120, 120], [240, 240, 10], [30, 200, 200], [90, 20, 160],
  ]);
  const a = medianCut(pixels, 4);
  const b = medianCut(pixels, 4);
  assert.deepEqual(a, b);
});

test('medianCut splits a black/white image into distinct dark and light colors', () => {
  // 32 black + 32 white pixels → two clusters.
  const pixels = [];
  for (let i = 0; i < 32; i++) pixels.push([0, 0, 0]);
  for (let i = 0; i < 32; i++) pixels.push([255, 255, 255]);
  const pal = medianCut(rgba(pixels), 2);
  assert.equal(pal.length, 2);
  const lum = pal.map((c) => c[0]).sort((a, b) => a - b);
  assert.ok(lum[0] < 40, 'a dark cluster');
  assert.ok(lum[1] > 215, 'a light cluster');
});

test('medianCut on an empty buffer degrades to a single black color', () => {
  const pal = medianCut(new Uint8ClampedArray(0), 4);
  assert.deepEqual(pal, [[0, 0, 0]]);
});

// ---- Pixel scale -----------------------------------------------------------

test('pixelScale factor 1 is a pass-through (same buffer, same dims)', () => {
  const src = rgba([[1, 2, 3], [4, 5, 6]]);
  const out = pixelScale(src, 2, 1, 1);
  assert.equal(out.width, 2);
  assert.equal(out.height, 1);
  assert.equal(out.data, src);
});

test('pixelScale area-averages a 2×2 block down to one averaged pixel', () => {
  // 2×2: (0,0,0),(100,100,100) / (200,200,200),(60,60,60) → average 90.
  const src = rgba([[0, 0, 0], [100, 100, 100], [200, 200, 200], [60, 60, 60]]);
  const out = pixelScale(src, 2, 2, 2);
  assert.equal(out.width, 1);
  assert.equal(out.height, 1);
  assert.equal(out.data[0], 90);
  assert.equal(out.data[3], 255);
});

test('pixelScale ceils output dims for non-divisible factors', () => {
  const src = rgba(Array.from({ length: 9 }, () => [128, 128, 128])); // 3×3
  const out = pixelScale(src, 3, 3, 2);
  assert.equal(out.width, 2);  // ceil(3/2)
  assert.equal(out.height, 2);
});

// ---- Brightness / contrast LUT --------------------------------------------

test('a zero brightness/contrast LUT is the identity', () => {
  const lut = buildBrightnessContrastLUT(0, 0);
  assert.equal(lut.length, 256);
  for (let i = 0; i < 256; i++) assert.equal(lut[i], i);
});

test('positive brightness lifts every value and clamps at 255', () => {
  const lut = buildBrightnessContrastLUT(50, 0);
  assert.ok(lut[10] > 10);
  assert.equal(lut[255], 255);
});

test('negative brightness lowers values and clamps at 0', () => {
  const lut = buildBrightnessContrastLUT(-50, 0);
  assert.ok(lut[240] < 240);
  assert.equal(lut[0], 0);
});

test('positive contrast pushes values away from the 128 midpoint', () => {
  const lut = buildBrightnessContrastLUT(0, 60);
  assert.ok(lut[40] < 40, 'darks get darker');
  assert.ok(lut[220] > 220, 'lights get lighter');
  assert.equal(lut[128], 128, 'the midpoint is a fixed point');
});

test('applyLUT maps RGB channels and leaves alpha untouched', () => {
  const lut = buildBrightnessContrastLUT(0, 0);
  const src = new Uint8ClampedArray([10, 20, 30, 128]);
  const out = applyLUT(src, lut);
  assert.deepEqual(Array.from(out), [10, 20, 30, 128]);
  // A non-identity LUT still preserves the alpha byte.
  const bright = applyLUT(src, buildBrightnessContrastLUT(40, 0));
  assert.equal(bright[3], 128);
});
