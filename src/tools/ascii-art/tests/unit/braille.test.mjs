// Unit tests for the braille path: packBraille bit packing, inkMap
// thresholding/dithering (deterministic), and toBrailleCells color averaging.
// Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, grid, gridFrom, BLACK, WHITE, RED } from './_helpers.mjs';

const {
  BRAILLE_BASE, packBraille, inkMap, toBrailleCells, toBraille,
} = await loadLogic();

// bits[col][row]: col 0..1, row 0..3. Dot numbering / bit values:
//   dot1=(0,0) dot4=(1,0)
//   dot2=(0,1) dot5=(1,1)
//   dot3=(0,2) dot6=(1,2)
//   dot7=(0,3) dot8=(1,3)
const NONE = [[false, false, false, false], [false, false, false, false]];
function bitsWith(...set) {
  const b = [[false, false, false, false], [false, false, false, false]];
  for (const [col, row] of set) b[col][row] = true;
  return b;
}

test('BRAILLE_BASE is U+2800', () => {
  assert.equal(BRAILLE_BASE, 0x2800);
});

test('packBraille with no dots is U+2800 (blank braille cell)', () => {
  assert.equal(packBraille(NONE), '⠀');
  assert.equal(packBraille(NONE).charCodeAt(0), 0x2800);
});

test('packBraille dot1 + dot8 is U+2881', () => {
  // dot1 = (col 0, row 0) = 0x01; dot8 = (col 1, row 3) = 0x80; OR = 0x81.
  const ch = packBraille(bitsWith([0, 0], [1, 3]));
  assert.equal(ch.charCodeAt(0), 0x2881);
  assert.equal(ch, String.fromCharCode(0x2881));
});

test('packBraille with all 8 dots is U+28FF', () => {
  const all = [[true, true, true, true], [true, true, true, true]];
  assert.equal(packBraille(all).charCodeAt(0), 0x28ff);
  assert.equal(packBraille(all), '⣿');
});

test('packBraille individual dots set the documented bits', () => {
  const cases = [
    [[0, 0], 0x01], [[0, 1], 0x02], [[0, 2], 0x04], [[0, 3], 0x40],
    [[1, 0], 0x08], [[1, 1], 0x10], [[1, 2], 0x20], [[1, 3], 0x80],
  ];
  for (const [[col, row], bit] of cases) {
    assert.equal(packBraille(bitsWith([col, row])).charCodeAt(0), 0x2800 + bit);
  }
});

test('inkMap: threshold mode inks dark pixels (dark => dot), and invert flips it', () => {
  const g = grid(2, 1, [BLACK, WHITE]);
  const { ink, w, h } = inkMap(g, { threshold: 128, dither: 'none' });
  assert.equal(w, 2);
  assert.equal(h, 1);
  assert.deepEqual(Array.from(ink), [1, 0]); // black inks, white does not

  const inv = inkMap(g, { threshold: 128, dither: 'none', invert: true }).ink;
  assert.deepEqual(Array.from(inv), [0, 1]);
});

test('inkMap threshold value moves the on/off boundary', () => {
  const gray = grid(1, 1, [[100, 100, 100]]); // luma 100
  assert.deepEqual(Array.from(inkMap(gray, { threshold: 128 }).ink), [1]); // 100 < 128 => on
  assert.deepEqual(Array.from(inkMap(gray, { threshold: 50 }).ink), [0]);  // 100 !< 50 => off
});

test('inkMap is deterministic across dither modes (same input => same ink)', () => {
  const g = gridFrom(8, 8, (x, y) => {
    const v = ((x + y) * 16) & 255;
    return [v, v, v];
  });
  for (const dither of ['none', 'bayer', 'floyd']) {
    const a = Array.from(inkMap(g, { dither }).ink);
    const b = Array.from(inkMap(g, { dither }).ink);
    assert.deepEqual(a, b, `inkMap should be deterministic for dither=${dither}`);
    assert.equal(a.length, 64);
    assert.ok(a.every((n) => n === 0 || n === 1));
  }
});

test('inkMap Bayer dither produces a mix on a flat mid-gray (ordered pattern)', () => {
  const g = gridFrom(4, 4, () => [128, 128, 128]);
  const flat = Array.from(inkMap(g, { dither: 'none', threshold: 128 }).ink);
  const bayer = Array.from(inkMap(g, { dither: 'bayer' }).ink);
  // Flat threshold gives a uniform field; Bayer breaks it into a dot pattern.
  assert.ok(new Set(flat).size === 1);
  assert.ok(new Set(bayer).size === 2, 'Bayer should ink some cells and not others');
});

test('toBrailleCells: a fully black 2x4 cell packs to a solid glyph (U+28FF)', () => {
  const g = gridFrom(2, 4, () => BLACK); // every dot inks
  const cells = toBrailleCells(g, { threshold: 128, dither: 'none' });
  assert.equal(cells.rows.length, 1);
  assert.equal(cells.rows[0].length, 1);
  assert.equal(cells.rows[0][0].ch, '⣿');
});

test('toBrailleCells: a fully white cell is blank (U+2800)', () => {
  const g = gridFrom(2, 4, () => WHITE);
  const cells = toBrailleCells(g, { threshold: 128, dither: 'none' });
  assert.equal(cells.rows[0][0].ch, '⠀');
});

test('toBrailleCells averages the inked pixels for the cell color', () => {
  // Top row red (inks, dark-ish? luma 76 < 128 so yes), rest white (no ink).
  const g = gridFrom(2, 4, (x, y) => (y === 0 ? RED : WHITE));
  const cells = toBrailleCells(g, { color: true, threshold: 128, dither: 'none' });
  // Only the two red pixels ink, so the average color is red.
  assert.deepEqual(cells.rows[0][0].fg, { r: 255, g: 0, b: 0 });
});

test('toBraille (plain text) of a black cell is the solid braille glyph', () => {
  const g = gridFrom(2, 4, () => BLACK);
  assert.equal(toBraille(g), '⣿');
});
