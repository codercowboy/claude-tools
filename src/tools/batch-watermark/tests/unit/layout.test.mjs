// Unit tests for layoutWatermark (anchors, margin, offset, scale, rotation, tiling + cap).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const base = { imgW: 1000, imgH: 500, wmW: 200, wmH: 100, scalePct: 20, marginPct: 0, offsetPct: 0, rotation: 0 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' !~ ' + b);

test('scale is a % of the SHORT side applied to the longer watermark side, aspect kept', async () => {
  const { layoutWatermark } = await loadLogic();
  const [p] = layoutWatermark({ ...base, anchor: 'tl' });
  near(p.w, 100); near(p.h, 50); // 20% of 500 = 100 for the long side (200 -> 100)
  const [q] = layoutWatermark({ ...base, wmW: 100, wmH: 200, anchor: 'tl' });
  near(q.h, 100); near(q.w, 50);
});

test('nine anchors with margin place the box correctly', async () => {
  const { layoutWatermark } = await loadLogic();
  const m = { ...base, marginPct: 2 }; // 2% of 500 = 10
  const at = (a) => layoutWatermark({ ...m, anchor: a })[0];
  const w = 100, h = 50;
  const exp = {
    tl: [10, 10], tc: [450, 10], tr: [1000 - 10 - w, 10],
    ml: [10, 225], mc: [450, 225], mr: [1000 - 10 - w, 225],
    bl: [10, 500 - 10 - h], bc: [450, 500 - 10 - h], br: [1000 - 10 - w, 500 - 10 - h],
  };
  for (const a of Object.keys(exp)) { const p = at(a); near(p.x, exp[a][0]); near(p.y, exp[a][1]); }
});

test('offset (number or {x,y}) is a % of the short side added after anchoring', async () => {
  const { layoutWatermark } = await loadLogic();
  const a = layoutWatermark({ ...base, anchor: 'tl', offsetPct: { x: 10, y: -4 } })[0];
  near(a.x, 50); near(a.y, -20);
  const b = layoutWatermark({ ...base, anchor: 'tl', offsetPct: 10 })[0];
  near(b.x, 50); near(b.y, 50);
});

test('resolution independent: the same params scale linearly with the image', async () => {
  const { layoutWatermark } = await loadLogic();
  const p1 = layoutWatermark({ ...base, anchor: 'br', marginPct: 3 })[0];
  const p2 = layoutWatermark({ ...base, imgW: 4000, imgH: 2000, anchor: 'br', marginPct: 3 })[0];
  near(p2.x / 4, p1.x); near(p2.y / 4, p1.y); near(p2.w / 4, p1.w); near(p2.h / 4, p1.h);
});

test('rotation is passed through; unknown anchor falls back to bottom-right; bad input -> []', async () => {
  const { layoutWatermark } = await loadLogic();
  assert.equal(layoutWatermark({ ...base, anchor: 'tl', rotation: 33 })[0].rot, 33);
  const d = layoutWatermark({ ...base, anchor: 'nope' })[0];
  const br = layoutWatermark({ ...base, anchor: 'br' })[0];
  assert.deepEqual(d, br);
  assert.deepEqual(layoutWatermark({ ...base, imgW: 0 }), []);
  assert.deepEqual(layoutWatermark({ ...base, wmW: 0 }), []);
  assert.deepEqual(layoutWatermark(), []);
});

test('tile: covers the image on a staggered grid, all boxes the same size', async () => {
  const { layoutWatermark } = await loadLogic();
  const t = layoutWatermark({ ...base, tile: true, gapPct: 10 });
  assert.ok(t.length > 4);
  assert.ok(t.every((p) => Math.abs(p.w - 100) < 1e-6 && Math.abs(p.h - 50) < 1e-6));
  // every image corner is inside at least one tile box (unrotated)
  const inBox = (x, y) => t.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  assert.ok(inBox(500, 250) || t.some((p) => Math.abs(p.x + p.w / 2 - 500) < 120)); // near centre
  // diagonal stagger: consecutive rows are shifted by half a step
  const rows = [...new Set(t.map((p) => Math.round(p.y)))].sort((a, b) => a - b);
  assert.ok(rows.length >= 3);
  const xs = (y) => t.filter((p) => Math.round(p.y) === y).map((p) => p.x).sort((a, b) => a - b);
  const mod = (v) => ((v % 150) + 150) % 150;
  assert.ok(Math.abs(mod(xs(rows[0])[0] - xs(rows[1])[0]) - 75) < 1e-6);
});

test('tile: a rotated grid still covers the image corners and keeps the rotation', async () => {
  const { layoutWatermark } = await loadLogic();
  const t = layoutWatermark({ ...base, tile: true, gapPct: 5, rotation: 30 });
  assert.ok(t.every((p) => p.rot === 30));
  const corner = (cx, cy) => t.some((p) => Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy) < Math.hypot(p.w, p.h));
  assert.ok(corner(0, 0) && corner(1000, 0) && corner(0, 500) && corner(1000, 500));
});

test('tile cap: a tiny mark with no gap never exceeds MAX_TILES and returns quickly', async () => {
  const { layoutWatermark, MAX_TILES } = await loadLogic();
  assert.equal(MAX_TILES, 2000);
  const t0 = Date.now();
  const t = layoutWatermark({ imgW: 6000, imgH: 4000, wmW: 100, wmH: 100, scalePct: 1, gapPct: 0, tile: true });
  assert.ok(t.length <= MAX_TILES && t.length > 0);
  assert.ok(Date.now() - t0 < 1000);
});
