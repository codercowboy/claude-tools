// Unit tests for the dithering algorithms (source/logic.mjs): Floyd–Steinberg,
// Atkinson (both error-diffusion) and ordered Bayer. The property that matters
// for a reproducible export: each is fully DETERMINISTIC (same pixels + palette
// in → byte-identical indices out), non-mutating of the input, and only ever
// emits valid in-range palette indices.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  floydSteinberg,
  atkinson,
  bayer,
  bayerMatrix,
  nearestColorIndex,
} from '../../source/logic.mjs';

// A deterministic gradient image (width×height), RGBA opaque.
function gradient(width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const v = Math.round(((x + y) / (width + height - 2)) * 255);
      out[p] = v; out[p + 1] = 255 - v; out[p + 2] = (v * 2) % 256; out[p + 3] = 255;
    }
  }
  return out;
}

function flat(width, height, rgb) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

const PALETTE = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128]];
const BW = [[0, 0, 0], [255, 255, 255]];

// Run the same suite of invariants against each dither function that takes
// (rgba, w, h, palette).
for (const [name, fn] of [
  ['floydSteinberg', floydSteinberg],
  ['atkinson', atkinson],
  ['bayer4', (r, w, h, p) => bayer(r, w, h, p, { order: 4 })],
  ['bayer8', (r, w, h, p) => bayer(r, w, h, p, { order: 8 })],
]) {
  test(`${name}: deterministic across repeated runs`, () => {
    const img = gradient(24, 16);
    const a = fn(img, 24, 16, PALETTE);
    const b = fn(img, 24, 16, PALETTE);
    assert.deepEqual(Array.from(a), Array.from(b));
  });

  test(`${name}: does not mutate the input pixel buffer`, () => {
    const img = gradient(20, 12);
    const before = Array.from(img);
    fn(img, 20, 12, PALETTE);
    assert.deepEqual(Array.from(img), before);
  });

  test(`${name}: output is length w*h with every index in range`, () => {
    const img = gradient(30, 18);
    const out = fn(img, 30, 18, PALETTE);
    assert.ok(out instanceof Uint8Array);
    assert.equal(out.length, 30 * 18);
    for (const idx of out) {
      assert.ok(idx >= 0 && idx < PALETTE.length, name + ' index in range: ' + idx);
    }
  });

  test(`${name}: a flat in-palette color maps to that exact index`, () => {
    const img = flat(8, 8, [255, 0, 0]);
    const out = fn(img, 8, 8, PALETTE);
    const redIdx = nearestColorIndex(255, 0, 0, PALETTE);
    assert.ok(out.every((v) => v === redIdx), name + ' all pixels map to red index');
  });
}

test('error-diffusion (FS + Atkinson) on mid-grey with a B/W palette mixes both', () => {
  const img = flat(16, 16, [128, 128, 128]);
  for (const fn of [floydSteinberg, atkinson]) {
    const out = fn(img, 16, 16, BW);
    const black = out.filter((v) => v === 0).length;
    const white = out.filter((v) => v === 1).length;
    assert.ok(black > 0 && white > 0, 'both black and white appear via error diffusion');
  }
});

test('ordered Bayer on mid-grey with a B/W palette produces a crosshatch mix', () => {
  const img = flat(16, 16, [128, 128, 128]);
  const out = bayer(img, 16, 16, BW, { order: 4 });
  const black = out.filter((v) => v === 0).length;
  const white = out.filter((v) => v === 1).length;
  assert.ok(black > 0 && white > 0, 'ordered dither spreads across both palette entries');
});

// ---- Bayer matrix structure ------------------------------------------------

test('bayerMatrix(4) is 4×4 and a permutation of 0..15', () => {
  const m = bayerMatrix(4);
  assert.equal(m.length, 4);
  for (const row of m) assert.equal(row.length, 4);
  const flatVals = m.flat().sort((a, b) => a - b);
  assert.deepEqual(flatVals, Array.from({ length: 16 }, (_, i) => i));
});

test('bayerMatrix(4) matches the canonical recursive threshold matrix', () => {
  // Base [[0,2],[3,1]] expanded once via 4v+{0,2,3,1}.
  assert.deepEqual(bayerMatrix(4), [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]);
});

test('bayerMatrix(8) is 8×8 and a permutation of 0..63', () => {
  const m = bayerMatrix(8);
  assert.equal(m.length, 8);
  for (const row of m) assert.equal(row.length, 8);
  const flatVals = m.flat().sort((a, b) => a - b);
  assert.deepEqual(flatVals, Array.from({ length: 64 }, (_, i) => i));
});

test('bayerMatrix corners: top-left is the minimum threshold (0)', () => {
  assert.equal(bayerMatrix(4)[0][0], 0);
  assert.equal(bayerMatrix(8)[0][0], 0);
});

// Exact Floyd–Steinberg output vector. The tests above are PROPERTY-based
// (determinism / in-range indices / both-colours-present), so a change to the
// FS error-diffusion COEFFICIENTS (e.g. the rightward 7/16 drifting to 1/16)
// slips past them — the output stays deterministic, in-range and mixed, just
// wrong. This nails the exact index bytes for a fixed 4×4 input + B/W palette,
// so any coefficient drift changes at least one byte and turns the suite red.
// (The expected vector was captured from the shipped engine; verified to differ
// under a 7/16→1/16 mutation.)
test('Floyd–Steinberg emits an EXACT index vector for a fixed 4×4 input (coefficient lock)', () => {
  const W = 4, H = 4;
  const grays = [
    100, 130, 160, 190,
    120, 150, 110, 200,
    140, 128, 170, 90,
    115, 165, 135, 205,
  ];
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = grays[i];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  const palette = [[0, 0, 0], [255, 255, 255]];
  const out = Array.from(floydSteinberg(rgba, W, H, palette));
  assert.deepEqual(out, [0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1]);
});
