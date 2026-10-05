// Shared fit helpers (CtImageUtil): coverRect / containRect / coverSrcRect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coverRect, containRect, coverSrcRect, CtImageUtil } from '../../../../lib/utils/image/CtImageUtil.mjs';

test('statics reference the named exports', () => {
  assert.equal(CtImageUtil.coverRect, coverRect);
  assert.equal(CtImageUtil.containRect, containRect);
  assert.equal(CtImageUtil.coverSrcRect, coverSrcRect);
});

test('coverRect center-crops to fill the destination aspect', () => {
  assert.deepEqual(coverRect(2000, 1000, 1000, 1000), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(coverRect(1000, 2000, 1000, 1000), { sx: 0, sy: 500, sw: 1000, sh: 1000 });
});

test('containRect fits inside the destination, centered (letterbox / pillarbox)', () => {
  assert.deepEqual(containRect(2000, 1000, 1000, 1000), { x: 0, y: 250, w: 1000, h: 500 });
  assert.deepEqual(containRect(1000, 2000, 1000, 1000), { x: 250, y: 0, w: 500, h: 1000 });
  assert.deepEqual(containRect(100, 100, 400, 200), { x: 100, y: 0, w: 200, h: 200 });
});

test('containRect guards degenerate input', () => {
  const r = containRect(0, NaN, 0, -5);
  assert.ok(r.w >= 0 && r.h >= 0 && Number.isFinite(r.x) && Number.isFinite(r.y));
});

test('coverSrcRect at zoom 1 / no offset equals coverRect', () => {
  assert.deepEqual(coverSrcRect(2000, 1000, 1000, 1000), coverRect(2000, 1000, 1000, 1000));
  assert.deepEqual(coverSrcRect(2000, 1000, 1000, 1000, 1, 0, 0), coverRect(2000, 1000, 1000, 1000));
});

test('coverSrcRect zoom shrinks the window about the centre', () => {
  assert.deepEqual(coverSrcRect(1000, 1000, 100, 100, 2), { sx: 250, sy: 250, sw: 500, sh: 500 });
  // zoom < 1 is clamped to 1
  assert.deepEqual(coverSrcRect(1000, 1000, 100, 100, 0.2), { sx: 0, sy: 0, sw: 1000, sh: 1000 });
});

test('coverSrcRect pans by source-pixel offset and clamps inside the source', () => {
  assert.deepEqual(coverSrcRect(1000, 1000, 100, 100, 2, 100, -50), { sx: 350, sy: 200, sw: 500, sh: 500 });
  assert.deepEqual(coverSrcRect(1000, 1000, 100, 100, 2, 9999, 9999), { sx: 500, sy: 500, sw: 500, sh: 500 });
  assert.deepEqual(coverSrcRect(1000, 1000, 100, 100, 2, -9999, -9999), { sx: 0, sy: 0, sw: 500, sh: 500 });
  // zoom 1 on an overflowing axis can only slide along the cropped axis
  assert.deepEqual(coverSrcRect(2000, 1000, 1000, 1000, 1, 300, 300), { sx: 800, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(coverSrcRect(2000, 1000, 1000, 1000, 1, 9999, 0), { sx: 1000, sy: 0, sw: 1000, sh: 1000 });
});
