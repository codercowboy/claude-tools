// Unit tests for the half-block (▀) path: each glyph stacks the top pixel as
// fg and the bottom pixel as bg, always colored. Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, grid, gridFrom, RED, BLUE, GREEN } from './_helpers.mjs';

const { toHalfBlockCells, CHAR_HALF_BLOCK, renderCells } = await loadLogic();

test('CHAR_HALF_BLOCK is the upper half block ▀ (U+2580)', () => {
  assert.equal(CHAR_HALF_BLOCK, '▀');
  assert.equal(CHAR_HALF_BLOCK.charCodeAt(0), 0x2580);
});

test('half-block puts the top pixel in fg and the bottom pixel in bg', () => {
  // 1 wide, 2 tall: top red, bottom blue -> one glyph row.
  const g = grid(1, 2, [RED, BLUE]);
  const cells = toHalfBlockCells(g, {});
  assert.equal(cells.rows.length, 1);
  const cell = cells.rows[0][0];
  assert.equal(cell.ch, '▀');
  assert.deepEqual(cell.fg, { r: 255, g: 0, b: 0 }); // top
  assert.deepEqual(cell.bg, { r: 0, g: 0, b: 255 }); // bottom
});

test('half-block collapses two pixel rows into one glyph row', () => {
  const g = gridFrom(3, 4, (x, y) => (y % 2 === 0 ? GREEN : BLUE));
  const cells = toHalfBlockCells(g, {});
  assert.equal(cells.rows.length, 2); // 4 pixel rows -> 2 glyph rows
  assert.equal(cells.rows[0].length, 3);
  // Row 0: top=green (y0), bottom=blue (y1).
  assert.deepEqual(cells.rows[0][0].fg, { r: 0, g: 255, b: 0 });
  assert.deepEqual(cells.rows[0][0].bg, { r: 0, g: 0, b: 255 });
});

test('an odd bottom row reuses the top pixel as its own bottom (no undefined)', () => {
  const g = grid(1, 1, [RED]); // single row, no y+1
  const cell = toHalfBlockCells(g, {}).rows[0][0];
  assert.deepEqual(cell.fg, { r: 255, g: 0, b: 0 });
  assert.deepEqual(cell.bg, { r: 255, g: 0, b: 0 });
});

test('renderCells dispatches mode "halfblock" to the half-block renderer', () => {
  const g = grid(1, 2, [RED, BLUE]);
  const viaDispatch = renderCells(g, { mode: 'halfblock' });
  const direct = toHalfBlockCells(g, {});
  assert.equal(viaDispatch.rows[0][0].ch, direct.rows[0][0].ch);
  assert.deepEqual(viaDispatch.rows[0][0].fg, direct.rows[0][0].fg);
  assert.deepEqual(viaDispatch.rows[0][0].bg, direct.rows[0][0].bg);
});
