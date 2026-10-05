// Unit tests for the ASCII ramp path: charForLevel mapping, toAscii of known
// grids, custom ramps, and per-cell color. Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, grid, gridFrom, BLACK, WHITE, RED } from './_helpers.mjs';

const {
  RAMPS, DEFAULT_RAMP, charForLevel, clampRamp,
  toAscii, toAsciiCells, cellsToText,
} = await loadLogic();

test('DEFAULT_RAMP is the standard ramp, ordered dark -> light', () => {
  assert.equal(DEFAULT_RAMP, RAMPS.standard);
  assert.equal(DEFAULT_RAMP, '@%#*+=-:. ');
  // First char is the darkest ink; last char is the lightest (a space).
  assert.equal(DEFAULT_RAMP[0], '@');
  assert.equal(DEFAULT_RAMP[DEFAULT_RAMP.length - 1], ' ');
});

test('toAscii of a 2x1 black/white grid is "@ "', () => {
  // Pixel 0 black (darkest -> ramp[0] = "@"), pixel 1 white (lightest -> ramp last = " ").
  const g = grid(2, 1, [BLACK, WHITE]);
  assert.equal(toAscii(g), '@ ');
});

test('charForLevel maps t=0 -> ramp[0] (darkest) and t=1 -> ramp[last] (lightest)', () => {
  assert.equal(charForLevel(0, DEFAULT_RAMP), '@');
  assert.equal(charForLevel(1, DEFAULT_RAMP), ' ');
  // Midpoint rounds to the middle of the ramp.
  const mid = charForLevel(0.5, DEFAULT_RAMP);
  assert.equal(mid, DEFAULT_RAMP[Math.round(0.5 * (DEFAULT_RAMP.length - 1))]);
});

test('charForLevel clamps out-of-range t into [0,1]', () => {
  assert.equal(charForLevel(-5, DEFAULT_RAMP), '@');
  assert.equal(charForLevel(9, DEFAULT_RAMP), ' ');
});

test('a dark pixel maps to ramp[0] and a light pixel to ramp[last] (both directions)', () => {
  const darkRow = toAscii(grid(1, 1, [BLACK]));
  const lightRow = toAscii(grid(1, 1, [WHITE]));
  assert.equal(darkRow, DEFAULT_RAMP[0]);
  assert.equal(lightRow, DEFAULT_RAMP[DEFAULT_RAMP.length - 1]);
});

test('a custom ramp is honored (dark -> first char, light -> last char)', () => {
  const g = grid(2, 1, [BLACK, WHITE]);
  assert.equal(toAscii(g, { ramp: 'AB' }), 'AB');
  assert.equal(toAscii(g, { ramp: 'XO.' }), 'X.'); // black->X, white->last '.'
});

test('an empty ramp falls back to the default ramp (clampRamp)', () => {
  assert.equal(clampRamp(''), DEFAULT_RAMP);
  assert.equal(clampRamp(null), DEFAULT_RAMP);
  assert.equal(clampRamp('#'), '#');
});

test('a single-char ramp renders every cell as that char', () => {
  const g = gridFrom(3, 2, () => [128, 128, 128]);
  assert.equal(toAscii(g, { ramp: '#' }), '###\n###');
});

test('toAsciiCells carries per-cell fg color only when color is on', () => {
  const g = grid(1, 1, [RED]);
  const mono = toAsciiCells(g, {});
  assert.equal(mono.rows[0][0].fg, null);

  const colored = toAsciiCells(g, { color: true });
  assert.deepEqual(colored.rows[0][0].fg, { r: 255, g: 0, b: 0 });
  assert.equal(colored.rows[0][0].bg, null);
});

test('toAsciiCells preserves grid dimensions and cellsToText round-trips rows', () => {
  const g = grid(2, 2, [BLACK, WHITE, WHITE, BLACK]);
  const cells = toAsciiCells(g, {});
  assert.equal(cells.width, 2);
  assert.equal(cells.rows.length, 2);
  assert.equal(cellsToText(cells.rows), '@ \n @');
});
