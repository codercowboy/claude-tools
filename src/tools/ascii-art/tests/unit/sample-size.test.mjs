// Unit tests for computeSampleSize: per-mode pixel-grid sizing and the
// char-aspect correction that keeps the art from looking squashed. Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { computeSampleSize, WIDTH_MIN, WIDTH_MAX } = await loadLogic();

test('ascii: one pixel per char cell, rows corrected by char aspect', () => {
  // Square image, width 100, aspect 2 -> rows = round(100 * 1 / 2) = 50.
  const s = computeSampleSize('ascii', 100, 100, 100, 2);
  assert.equal(s.cols, 100);
  assert.equal(s.pixW, 100);
  assert.equal(s.rows, 50);
  assert.equal(s.pixH, 50);
});

test('ascii: char aspect 1 doubles the rows vs aspect 2 (aspect correction)', () => {
  const a2 = computeSampleSize('ascii', 100, 100, 100, 2);
  const a1 = computeSampleSize('ascii', 100, 100, 100, 1);
  assert.equal(a1.rows, 100);
  assert.equal(a1.rows, a2.rows * 2);
});

test('ascii: a wider-than-tall image yields fewer rows (aspect preserved)', () => {
  // 200x100 (2:1), width 100, aspect 2 -> ratio 0.5 -> rows = round(100*0.5/2) = 25.
  const s = computeSampleSize('ascii', 200, 100, 100, 2);
  assert.equal(s.rows, 25);
});

test('halfblock: samples 2 stacked pixels per char row (pixH even, cols wide)', () => {
  // Square, width 100, aspect 2 -> pixH = round(100 * 1 * (2/2)) = 100, rows = 50.
  const s = computeSampleSize('halfblock', 100, 100, 100, 2);
  assert.equal(s.pixW, 100);
  assert.equal(s.cols, 100);
  assert.equal(s.rows, 50);
  assert.equal(s.pixH, 100);
  assert.equal(s.pixH % 2, 0, 'half-block pixel height must be even');
});

test('braille: samples a 2x4 dot grid per char (pixW = 2*cols, pixH multiple of 4)', () => {
  // Square, width 100, aspect 2 -> pixW = 200, pixH = round(200 * 1 * (2/2)) = 200, rows = 50.
  const s = computeSampleSize('braille', 100, 100, 100, 2);
  assert.equal(s.pixW, 200);
  assert.equal(s.cols, 100);
  assert.equal(s.rows, 50);
  assert.equal(s.pixH, 200);
  assert.equal(s.pixH % 4, 0, 'braille pixel height must be a multiple of 4');
});

test('width is clamped to [WIDTH_MIN, WIDTH_MAX]', () => {
  assert.equal(computeSampleSize('ascii', 100, 100, 5, 2).cols, WIDTH_MIN);
  assert.equal(computeSampleSize('ascii', 100, 100, 99999, 2).cols, WIDTH_MAX);
});

test('a non-positive char aspect falls back to 2 (default)', () => {
  const fallback = computeSampleSize('ascii', 100, 100, 100, 0);
  const explicit = computeSampleSize('ascii', 100, 100, 100, 2);
  assert.equal(fallback.rows, explicit.rows);
});

test('degenerate image dimensions do not divide by zero', () => {
  const s = computeSampleSize('ascii', 0, 0, 100, 2);
  assert.ok(Number.isFinite(s.rows) && s.rows >= 1);
  assert.ok(Number.isFinite(s.pixH));
});

test('an unknown mode is treated as ascii', () => {
  const unknown = computeSampleSize('nope', 100, 100, 100, 2);
  const ascii = computeSampleSize('ascii', 100, 100, 100, 2);
  assert.deepEqual(unknown, ascii);
});
