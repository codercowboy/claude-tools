// Unit tests for the geometry + layout engine (source/logic.mjs): gradient
// endpoints, cover-fit crop, logo scaling, presets/size guards, and the core
// composeLayout stack math. Pure, DOM-free — hand-computed expected values.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gradientLineCoords,
  coverRect,
  scaleLogoBox,
  PRESETS,
  presetByKey,
  clampSize,
  MIN_SIDE,
  MAX_SIDE,
  composeLayout,
} from '../../source/logic.mjs';

// Float-tolerant equality for trig results.
function approx(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: expected ≈${expected}, got ${actual}`);
}

// ---- gradientLineCoords ------------------------------------------------------
// CSS convention: 0deg points UP (toward the top), 90deg points RIGHT. The
// returned line runs through the box center out to the edges/corners.
test('gradientLineCoords: 0deg runs bottom→top through the center', () => {
  const c = gradientLineCoords(0, 1000, 1000);
  approx(c.x0, 500, 'x0'); approx(c.y0, 1000, 'y0'); // start at bottom-center
  approx(c.x1, 500, 'x1'); approx(c.y1, 0, 'y1');    // end at top-center
});

test('gradientLineCoords: 90deg runs left→right through the center', () => {
  const c = gradientLineCoords(90, 1000, 1000);
  approx(c.x0, 0, 'x0'); approx(c.y0, 500, 'y0');
  approx(c.x1, 1000, 'x1'); approx(c.y1, 500, 'y1');
});

test('gradientLineCoords: 180deg runs top→bottom', () => {
  const c = gradientLineCoords(180, 1000, 1000);
  approx(c.x0, 500, 'x0'); approx(c.y0, 0, 'y0');
  approx(c.x1, 500, 'x1'); approx(c.y1, 1000, 'y1');
});

test('gradientLineCoords: 270deg runs right→left', () => {
  const c = gradientLineCoords(270, 1000, 1000);
  approx(c.x0, 1000, 'x0'); approx(c.y0, 500, 'y0');
  approx(c.x1, 0, 'x1'); approx(c.y1, 500, 'y1');
});

test('gradientLineCoords: 45deg on a square runs corner→corner (bottom-left→top-right)', () => {
  const c = gradientLineCoords(45, 1000, 1000);
  approx(c.x0, 0, 'x0'); approx(c.y0, 1000, 'y0');
  approx(c.x1, 1000, 'x1'); approx(c.y1, 0, 'y1');
});

test('gradientLineCoords: the endpoints are symmetric about the box center', () => {
  for (const angle of [0, 30, 90, 137, 200, 359]) {
    const c = gradientLineCoords(angle, 1200, 630);
    approx((c.x0 + c.x1) / 2, 600, `center x @${angle}`);
    approx((c.y0 + c.y1) / 2, 315, `center y @${angle}`);
  }
});

test('gradientLineCoords normalizes out-of-range and negative angles (mod 360)', () => {
  const a = gradientLineCoords(90, 800, 600);
  const b = gradientLineCoords(450, 800, 600);  // 450 - 360 = 90
  const c = gradientLineCoords(-270, 800, 600); // -270 + 360 = 90
  for (const k of ['x0', 'y0', 'x1', 'y1']) {
    approx(b[k], a[k], `450 vs 90 [${k}]`);
    approx(c[k], a[k], `-270 vs 90 [${k}]`);
  }
});

// ---- coverRect ---------------------------------------------------------------
test('coverRect crops the sides when the source is wider than the destination', () => {
  // src 2000×1000 (aspect 2) into 1000×1000 (aspect 1): keep full height, crop width.
  assert.deepEqual(coverRect(2000, 1000, 1000, 1000), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
});

test('coverRect crops top/bottom when the source is taller than the destination', () => {
  // src 1000×2000 (aspect .5) into 1000×1000: keep full width, crop height.
  assert.deepEqual(coverRect(1000, 2000, 1000, 1000), { sx: 0, sy: 500, sw: 1000, sh: 1000 });
});

test('coverRect uses the whole source when aspect ratios already match', () => {
  // src 1000×500 (aspect 2) into 1200×600 (aspect 2): no crop.
  assert.deepEqual(coverRect(1000, 500, 1200, 600), { sx: 0, sy: 0, sw: 1000, sh: 500 });
});

test('coverRect center-crops an OG landscape source into a story portrait box', () => {
  // src 1200×630 into 1080×1920 (tall): destination is taller/narrower, so keep
  // full source height, crop the width. dstAspect = 1080/1920 = 0.5625.
  const r = coverRect(1200, 630, 1080, 1920);
  approx(r.sh, 630, 'sh (full height)');
  approx(r.sw, 630 * (1080 / 1920), 'sw');       // 354.375
  approx(r.sx, (1200 - r.sw) / 2, 'sx centered');
  approx(r.sy, 0, 'sy');
});

test('coverRect guards degenerate (zero/negative) inputs to at least 1px', () => {
  const r = coverRect(0, 0, 0, 0);
  assert.ok(r.sw >= 1 && r.sh >= 1);
});

// ---- scaleLogoBox ------------------------------------------------------------
test('scaleLogoBox scales to a target height, preserving aspect ratio', () => {
  assert.deepEqual(scaleLogoBox(400, 200, 100), { w: 200, h: 100 }); // 2:1
  assert.deepEqual(scaleLogoBox(200, 200, 50), { w: 50, h: 50 });    // square
  assert.deepEqual(scaleLogoBox(100, 400, 80), { w: 20, h: 80 });    // tall
});

test('scaleLogoBox guards zero/negative naturals to avoid divide-by-zero', () => {
  const b = scaleLogoBox(0, 0, 100);
  assert.equal(b.h, 100);
  assert.ok(Number.isFinite(b.w) && b.w > 0);
});

// ---- presets + clampSize -----------------------------------------------------
test('PRESETS carries the documented sizes keyed correctly', () => {
  assert.deepEqual(presetByKey('og'), { key: 'og', label: 'OG landscape (1200×630)', width: 1200, height: 630 });
  assert.equal(presetByKey('square').width, 1200);
  assert.equal(presetByKey('square').height, 1200);
  assert.equal(presetByKey('story').width, 1080);
  assert.equal(presetByKey('story').height, 1920);
  assert.equal(presetByKey('custom').width, 1200);
  assert.equal(presetByKey('custom').height, 630);
});

test('presetByKey falls back to the first preset (OG) for an unknown key', () => {
  assert.equal(presetByKey('nope'), PRESETS[0]);
  assert.equal(presetByKey(undefined).key, 'og');
});

test('clampSize rounds and bounds each side to [MIN_SIDE, MAX_SIDE]', () => {
  assert.equal(MIN_SIDE, 64);
  assert.equal(MAX_SIDE, 4096);
  assert.deepEqual(clampSize(1200, 630), { width: 1200, height: 630 });
  assert.deepEqual(clampSize(10, 10), { width: 64, height: 64 });       // below MIN
  assert.deepEqual(clampSize(5000, 9999), { width: 4096, height: 4096 }); // above MAX
  assert.deepEqual(clampSize(800.4, 600.6), { width: 800, height: 601 }); // rounded
  assert.deepEqual(clampSize('x', 'y'), { width: 64, height: 64 });      // garbage → MIN
});

// ---- composeLayout -----------------------------------------------------------
test('composeLayout: centered/middle single block gives the expected content box + line positions', () => {
  const out = composeLayout({
    width: 1200, height: 630, padding: 100,
    hAlign: 'center', vAlign: 'middle',
    logo: null,
    blocks: [{ key: 'title', lines: ['Hello', 'World'], fontSize: 100, lineHeight: 1.0, gapAfter: 0 }],
  });
  assert.deepEqual(out.contentBox, { x: 100, y: 100, w: 1000, h: 430 });
  assert.equal(out.textAlign, 'center');
  assert.equal(out.anchorX, 600);               // 100 + 1000/2
  assert.equal(out.stackHeight, 200);           // 2 lines × 100 × 1.0
  assert.equal(out.logoRect, null);
  // top = 100 + (430 - 200)/2 = 215
  const t = out.blocks[0];
  assert.equal(t.key, 'title');
  assert.deepEqual(t.lines[0], { text: 'Hello', x: 600, y: 215 });
  assert.deepEqual(t.lines[1], { text: 'World', x: 600, y: 315 });
});

test('composeLayout: top/left with a logo stacks logo → gap → blocks with left anchor', () => {
  const out = composeLayout({
    width: 1000, height: 1000, padding: 0,
    hAlign: 'left', vAlign: 'top',
    logo: { w: 200, h: 100 }, logoGap: 50,
    blocks: [
      { key: 'title', lines: ['A'], fontSize: 100, lineHeight: 1.0, gapAfter: 20 },
      { key: 'sub', lines: ['B', 'C'], fontSize: 50, lineHeight: 1.0, gapAfter: 0 },
    ],
  });
  // stack = logo(100) + gap(50) + title(100) + gapAfter(20) + sub(100) = 370
  assert.equal(out.stackHeight, 370);
  assert.equal(out.textAlign, 'left');
  assert.equal(out.anchorX, 0);
  assert.deepEqual(out.logoRect, { x: 0, y: 0, w: 200, h: 100 });
  // title starts after logo+gap at y=150
  assert.deepEqual(out.blocks[0].lines[0], { text: 'A', x: 0, y: 150 });
  // sub starts after title(100)+gapAfter(20) → y=270, then +50 for second line
  assert.deepEqual(out.blocks[1].lines[0], { text: 'B', x: 0, y: 270 });
  assert.deepEqual(out.blocks[1].lines[1], { text: 'C', x: 0, y: 320 });
});

test('composeLayout: bottom/right places the stack against the bottom-right of the content box', () => {
  const out = composeLayout({
    width: 1000, height: 1000, padding: 100,
    hAlign: 'right', vAlign: 'bottom',
    logo: { w: 300, h: 100 }, logoGap: 0,
    blocks: [{ key: 'title', lines: ['X'], fontSize: 100, lineHeight: 1.0, gapAfter: 0 }],
  });
  // content box: x=100,y=100,w=800,h=800. stack = 100(logo)+100(title)=200.
  assert.equal(out.stackHeight, 200);
  assert.equal(out.anchorX, 900);   // cx + cw = 100 + 800
  assert.equal(out.textAlign, 'right');
  // bottom: top = cy + ch - stack = 100 + 800 - 200 = 700
  // logo right-aligned: lx = cx + cw - lw = 100 + 800 - 300 = 600
  assert.deepEqual(out.logoRect, { x: 600, y: 700, w: 300, h: 100 });
  // title after logo at y = 700 + 100 = 800
  assert.deepEqual(out.blocks[0].lines[0], { text: 'X', x: 900, y: 800 });
});

test('composeLayout: a logo with non-positive height is ignored (no logoRect, no gap)', () => {
  const out = composeLayout({
    width: 1000, height: 1000, padding: 0,
    hAlign: 'center', vAlign: 'top',
    logo: { w: 200, h: 0 }, logoGap: 40,
    blocks: [{ key: 'title', lines: ['A'], fontSize: 100, lineHeight: 1.0, gapAfter: 0 }],
  });
  assert.equal(out.logoRect, null);
  assert.equal(out.stackHeight, 100);           // just the title, no logo/gap
  assert.deepEqual(out.blocks[0].lines[0], { text: 'A', x: 500, y: 0 });
});

test('composeLayout: gapAfter is applied only between blocks, not after the last', () => {
  const out = composeLayout({
    width: 1000, height: 1000, padding: 0,
    hAlign: 'left', vAlign: 'top',
    logo: null,
    blocks: [
      { key: 'a', lines: ['a'], fontSize: 100, lineHeight: 1.0, gapAfter: 30 },
      { key: 'b', lines: ['b'], fontSize: 100, lineHeight: 1.0, gapAfter: 999 },
    ],
  });
  // 100 + 30 (between) + 100 = 230; the trailing gapAfter(999) is NOT counted.
  assert.equal(out.stackHeight, 230);
});

test('composeLayout: defaults invalid alignments to center/middle', () => {
  const out = composeLayout({
    width: 600, height: 600, padding: 0,
    hAlign: 'bogus', vAlign: 'bogus',
    blocks: [{ key: 't', lines: ['x'], fontSize: 100, lineHeight: 1.0, gapAfter: 0 }],
  });
  assert.equal(out.textAlign, 'center');
  assert.equal(out.anchorX, 300);
  // middle: top = (600 - 100)/2 = 250
  assert.equal(out.blocks[0].lines[0].y, 250);
});
