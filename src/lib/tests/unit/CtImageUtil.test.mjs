// Unit tests for CtImageUtil.mjs -- the PURE helpers (colour, formats, limits, rect gizmo, fit,
// crop-aspect, aggregator). Zero-dep (node:test + node:assert/strict). Run: node --test src/lib/tests/
//
// Strategy: every computed expectation (fit rects, aspect/anchor results, limit tiers) is HAND-COMPUTED
// in the comment above its test, NOT taken from the lib's output. Where float division makes the exact
// bits unstable (e.g. 400 / (16/9)) a tiny-epsilon comparison is used instead of ===.
// DEFERRED (DOM/canvas, no faked canvas): loadImageFile, canvasToBlob, canvasToPngBytes -> e2e.
// Note: clampByte TRUNCATES fractionals (v|0), it does not round -- tests pin the real behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ns from '../../utils/image/CtImageUtil.mjs';
import {
  CtImageUtil,
  clampByte, hexToRgb, rgbToHex, parsePalette,
  FORMATS, mimeForFormat, formatSupportsQuality,
  makeImageLimitChecker, WARN_FILE_BYTES, MAX_FILE_BYTES, WARN_PIXELS, MAX_DIMENSION,
  normalizeRect, HANDLE_IDS, oppositeHandle, handlePoints, hitTestHandle,
  coverRect, containRect, coverSrcRect,
  ASPECT_PRESETS, aspectRatioFor, clampRectToImage, constrainRectToAspect, resizeRaw,
} from '../../utils/image/CtImageUtil.mjs';

const EPS = 1e-9;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, (msg || '') + ' expected ' + b + ' got ' + a);
const nearObj = (got, want) => {
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
  for (const k of Object.keys(want)) near(got[k], want[k], k);
};
const MB = 1024 * 1024;

// ------------------------------------------------------------------ colour
test('clampByte: clamps to 0..255, truncates fractionals, non-numeric -> 0', () => {
  const rows = [
    [0, 0], [255, 255], [128, 128], [-5, 0], [-0.1, 0], [300, 255], [255.9, 255], [1e10, 255],
    [127.9, 127], [0.99, 0], [Infinity, 255], [-Infinity, 0],
    [NaN, 0], ['abc', 0], ['7', 7], [undefined, 0], [null, 0],
  ];
  for (const [inp, want] of rows) assert.equal(clampByte(inp), want, 'clampByte(' + String(inp) + ')');
});

test('hexToRgb: 6-digit, 3-digit expansion, case, # optional, whitespace trimmed', () => {
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('00FF80'), [0, 255, 128]);
  assert.deepEqual(hexToRgb('#abc'), [170, 187, 204]); // aa bb cc
  assert.deepEqual(hexToRgb('#000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('  #FfF  '), [255, 255, 255]);
});

test('hexToRgb: bad input -> null', () => {
  for (const bad of ['', '#', '#abcd', '#12345', '#1234567', '#ggg', '#12345z', 'xyz', 123, null, undefined, {}, ['#fff']]) {
    assert.equal(hexToRgb(bad), null, 'hexToRgb(' + JSON.stringify(bad) + ')');
  }
});

test('rgbToHex: pads, clamps, truncates', () => {
  assert.equal(rgbToHex([0, 0, 0]), '#000000');
  assert.equal(rgbToHex([255, 255, 255]), '#ffffff');
  assert.equal(rgbToHex([255, 0, 128]), '#ff0080');
  assert.equal(rgbToHex([1, 2, 3]), '#010203');
  assert.equal(rgbToHex([300, -1, 15.9]), '#ff000f'); // 300->255, -1->0, 15.9->15 (0x0f)
});

test('hexToRgb/rgbToHex round-trip', () => {
  for (const hex of ['#000000', '#ffffff', '#123456', '#abcdef', '#0a0b0c', '#fe01ff']) {
    assert.equal(rgbToHex(hexToRgb(hex)), hex);
  }
  for (const rgb of [[0, 0, 0], [255, 128, 7], [9, 99, 199]]) {
    assert.deepEqual(hexToRgb(rgbToHex(rgb)), rgb);
  }
});

test('parsePalette: hex strings + triples, drops unparseable, clamps triples', () => {
  const out = parsePalette(['#f00', [1, 2, 3], 'bad', [300, -4, 5.7, 99], null, [1, 2], 'abc', 42]);
  // '#f00'->[255,0,0]; [1,2,3]; 'bad' is valid 3-digit hex -> bb aa dd = [187,170,221];
  // [300,-4,5.7,99] -> [255,0,5]; null and the 2-element [1,2] and 42 dropped; 'abc' -> [170,187,204]
  assert.deepEqual(out, [[255, 0, 0], [1, 2, 3], [187, 170, 221], [255, 0, 5], [170, 187, 204]]);
  assert.deepEqual(parsePalette([]), []);
  assert.deepEqual(parsePalette(['zzz', '#12']), []);
});

// ------------------------------------------------------------------ formats
test('FORMATS: shape and values', () => {
  assert.deepEqual(Object.keys(FORMATS), ['png', 'jpeg', 'webp']);
  assert.deepEqual(FORMATS.png,  { mime: 'image/png',  ext: 'png',  label: 'PNG',  lossy: false });
  assert.deepEqual(FORMATS.jpeg, { mime: 'image/jpeg', ext: 'jpg',  label: 'JPEG', lossy: true });
  assert.deepEqual(FORMATS.webp, { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true });
});

test('mimeForFormat: known (case-insensitive) + PNG fallback', () => {
  assert.equal(mimeForFormat('png'), 'image/png');
  assert.equal(mimeForFormat('jpeg'), 'image/jpeg');
  assert.equal(mimeForFormat('WEBP'), 'image/webp');
  for (const unk of ['avif', 'gif', 'jpg', '', undefined, null, 5]) assert.equal(mimeForFormat(unk), 'image/png');
});

test('formatSupportsQuality: lossy true, png/unknown false', () => {
  assert.equal(formatSupportsQuality('jpeg'), true);
  assert.equal(formatSupportsQuality('WebP'), true);
  assert.equal(formatSupportsQuality('png'), false);
  for (const unk of ['avif', '', undefined, null]) assert.equal(formatSupportsQuality(unk), false);
});

// ------------------------------------------------------------------ limits
test('limit constants', () => {
  assert.equal(WARN_FILE_BYTES, 8388608);   // 8 * 1024 * 1024
  assert.equal(MAX_FILE_BYTES, 41943040);   // 40 * 1024 * 1024
  assert.equal(WARN_PIXELS, 24000000);
  assert.equal(MAX_DIMENSION, 20000);
});

test('limits: STRICT > -- exactly AT each threshold does not trip', () => {
  const chk = makeImageLimitChecker();
  assert.equal(chk({ bytes: WARN_FILE_BYTES }).level, 'ok');            // 8MB exactly: no warn
  assert.equal(chk({ bytes: MAX_FILE_BYTES }).level, 'warn');           // 40MB exactly: not error (but > 8MB -> warn)
  assert.equal(chk({ width: 6000, height: 4000 }).level, 'ok');         // 24,000,000 px exactly: no warn
  assert.equal(chk({ width: 20000, height: 1200 }).level, 'ok');        // 20000 wide OK; 24,000,000 px exactly
  assert.equal(chk({ width: 1000, height: 20000 }).level, 'ok');        // 20000 tall OK; 20M px
});

test('limits: just-over each threshold trips', () => {
  const chk = makeImageLimitChecker();
  assert.equal(chk({ bytes: WARN_FILE_BYTES + 1 }).level, 'warn');
  assert.equal(chk({ bytes: MAX_FILE_BYTES + 1 }).level, 'error');
  assert.equal(chk({ width: 6000, height: 4001 }).level, 'warn');       // 24,006,000 px
  assert.equal(chk({ width: 20000, height: 1201 }).level, 'warn');      // 24,020,000 px
  assert.equal(chk({ width: 20001, height: 1 }).level, 'error');
  assert.equal(chk({ width: 1, height: 20001 }).level, 'error');
});

test('limits: exact messages (defaults)', () => {
  const chk = makeImageLimitChecker();
  // formatBytes(40MB+1) = "40.0 MB"; formatBytes(41*MB) = "41.0 MB"
  assert.deepEqual(chk({ bytes: 41 * MB }), { level: 'error', message: 'Image too large (41.0 MB) — limit is 40.0 MB.' });
  assert.deepEqual(chk({ width: 20001, height: 5 }), { level: 'error', message: 'Image dimensions too large (20001×5) — limit is 20000px per side.' });
  assert.deepEqual(chk({ bytes: 9 * MB }), { level: 'warn', message: 'Large image — processing may take a moment and use extra memory.' });
  assert.deepEqual(chk({ bytes: 1, width: 10, height: 10 }), { level: 'ok', message: '' });
});

test('limits: injected action + dimSep surface in messages', () => {
  const chk = makeImageLimitChecker({ action: 'cropping', dimSep: 'x' });
  assert.equal(chk({ width: 30000, height: 40 }).message, 'Image dimensions too large (30000x40) — limit is 20000px per side.');
  assert.equal(chk({ bytes: 9 * MB }).message, 'Large image — cropping may take a moment and use extra memory.');
  // action does not leak into the file-size error
  assert.equal(chk({ bytes: 41 * MB }).message, 'Image too large (41.0 MB) — limit is 40.0 MB.');
  // falsy opts fall back to defaults
  for (const o of [undefined, null, {}, { action: '', dimSep: '' }]) {
    const c = makeImageLimitChecker(o);
    assert.match(c({ bytes: 9 * MB }).message, /^Large image — processing may/);
    assert.match(c({ width: 20001, height: 2 }).message, /\(20001×2\)/);
  }
});

test('limits: precedence file-hard > dim-hard > warns; error > warn', () => {
  const chk = makeImageLimitChecker();
  // file-hard beats dim-hard
  const both = chk({ bytes: MAX_FILE_BYTES + 1, width: 30000, height: 30000 });
  assert.equal(both.level, 'error');
  assert.match(both.message, /^Image too large/);
  // dim-hard beats a soft file warn (9MB) and a pixel warn
  const dimOverWarn = chk({ bytes: 9 * MB, width: 30000, height: 1 });
  assert.equal(dimOverWarn.level, 'error');
  assert.match(dimOverWarn.message, /^Image dimensions too large/);
  // file-hard beats the soft warns too
  assert.equal(chk({ bytes: 50 * MB, width: 6000, height: 5000 }).level, 'error');
  // both warn tiers independently -> same warn
  assert.equal(chk({ bytes: 9 * MB, width: 10, height: 10 }).level, 'warn');
  assert.equal(chk({ bytes: 1, width: 6000, height: 5000 }).level, 'warn');   // 30M px
});

test('limits: missing / non-numeric inputs are treated as 0', () => {
  const chk = makeImageLimitChecker();
  assert.deepEqual(chk(), { level: 'ok', message: '' });
  assert.deepEqual(chk({}), { level: 'ok', message: '' });
  assert.equal(chk({ bytes: 'abc', width: 'x', height: null }).level, 'ok');
  assert.equal(chk({ bytes: '50000000' }).level, 'error');           // numeric string coerced: 50,000,000 > 41,943,040
  assert.equal(chk({ width: 100000 }).level, 'error');               // height unknown, width alone trips
  assert.equal(chk({ width: 10000 }).level, 'ok');                   // pixels = 10000*0 = 0 -> no warn
});

// ------------------------------------------------------------------ rect gizmo
test('normalizeRect: flips negative w/h, fresh object, positive untouched', () => {
  assert.deepEqual(normalizeRect({ x: 10, y: 20, w: 30, h: 40 }), { x: 10, y: 20, w: 30, h: 40 });
  assert.deepEqual(normalizeRect({ x: 50, y: 20, w: -30, h: 40 }), { x: 20, y: 20, w: 30, h: 40 });
  assert.deepEqual(normalizeRect({ x: 50, y: 70, w: -30, h: -40 }), { x: 20, y: 30, w: 30, h: 40 });
  assert.deepEqual(normalizeRect({ x: 5, y: 5, w: 0, h: 0 }), { x: 5, y: 5, w: 0, h: 0 });
  const r = { x: 1, y: 2, w: 3, h: 4 };
  assert.notEqual(normalizeRect(r), r);
});

test('HANDLE_IDS: the 8 handles in order', () => {
  assert.deepEqual(HANDLE_IDS, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
});

test('oppositeHandle: full map + move/center/unknown -> center', () => {
  const map = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', move: 'center', center: 'center' };
  for (const [k, v] of Object.entries(map)) assert.equal(oppositeHandle(k), v, k);
  assert.equal(oppositeHandle('bogus'), 'center');
  assert.equal(oppositeHandle(undefined), 'center');
  for (const id of HANDLE_IDS) assert.equal(oppositeHandle(oppositeHandle(id)), id); // involution
});

// rect {x:10,y:20,w:100,h:60}: right=110, bottom=80, cx=60, cy=50
const GR = { x: 10, y: 20, w: 100, h: 60 };
test('handlePoints: 8 handles + center', () => {
  assert.deepEqual(handlePoints(GR), {
    nw: { x: 10, y: 20 }, n: { x: 60, y: 20 }, ne: { x: 110, y: 20 },
    w: { x: 10, y: 50 }, e: { x: 110, y: 50 },
    sw: { x: 10, y: 80 }, s: { x: 60, y: 80 }, se: { x: 110, y: 80 },
    center: { x: 60, y: 50 },
  });
});

test('handlePoints: negative-size rect is normalised first', () => {
  assert.deepEqual(handlePoints({ x: 110, y: 80, w: -100, h: -60 }), handlePoints(GR));
});

test('hitTestHandle: nearest handle within tol', () => {
  assert.equal(hitTestHandle(GR, 12, 22), 'nw');      // d = sqrt(8) ~ 2.83
  assert.equal(hitTestHandle(GR, 108, 78), 'se');
  assert.equal(hitTestHandle(GR, 60, 18), 'n');
  assert.equal(hitTestHandle(GR, 112, 50), 'e');
  assert.equal(hitTestHandle(GR, 8, 50), 'w');         // outside the rect but within tol of a handle
  assert.equal(hitTestHandle(GR, 5, 15), 'nw');        // d = sqrt(50) ~ 7.07 <= 10, outside rect
  assert.equal(hitTestHandle(GR, 10, 20, 0), 'nw');    // tol 0: exact hit only
});

test('hitTestHandle: tolerance boundary is inclusive (<=)', () => {
  assert.equal(hitTestHandle(GR, 20, 20), 'nw');       // d = 10 exactly == default tol
  assert.equal(hitTestHandle(GR, 21, 20), 'move');     // d = 11 > tol, inside rect
  assert.equal(hitTestHandle(GR, 21, 20, 11), 'nw');   // custom tol 11
});

test('hitTestHandle: inside -> move, else null', () => {
  assert.equal(hitTestHandle(GR, 60, 50), 'move');     // center is 30 from n, nothing within 10
  assert.equal(hitTestHandle(GR, 200, 200), null);
  assert.equal(hitTestHandle(GR, 60, 30, 5), 'move');  // 10 below n handle, tol 5
  assert.equal(hitTestHandle(GR, 60, 100, 5), null);   // below the rect, away from handles
  // negative-size rect behaves like its normalised form
  assert.equal(hitTestHandle({ x: 110, y: 80, w: -100, h: -60 }, 60, 50), 'move');
});

test('hitTestHandle: equidistant ties go to the LATER handle in HANDLE_IDS order (d <= best)', () => {
  // rect 10x10 at origin; point (5,5): n,e,s,w all exactly 5 away; nw..corners 7.07. Last of tie = 'w'.
  assert.equal(hitTestHandle({ x: 0, y: 0, w: 10, h: 10 }, 5, 5), 'w');
});

// ------------------------------------------------------------------ fit
// coverRect: src aspect > dst aspect -> sh=srcH, sw=srcH*dstAspect (crop sides); else sw=srcW, sh=srcW/dstAspect.
test('coverRect: wide source into a square (crop sides)', () => {
  // 200x100 -> 100x100: srcAspect 2 > 1: sh=100, sw=100*1=100; sx=(200-100)/2=50, sy=0
  assert.deepEqual(coverRect(200, 100, 100, 100), { sx: 50, sy: 0, sw: 100, sh: 100 });
  // 1600x900 -> 100x100: sh=900, sw=900; sx=350, sy=0
  assert.deepEqual(coverRect(1600, 900, 100, 100), { sx: 350, sy: 0, sw: 900, sh: 900 });
});

test('coverRect: tall source into a square (crop top/bottom)', () => {
  // 100x200 -> 100x100: srcAspect .5 < 1: sw=100, sh=100; sx=0, sy=(200-100)/2=50
  assert.deepEqual(coverRect(100, 200, 100, 100), { sx: 0, sy: 50, sw: 100, sh: 100 });
});

test('coverRect: non-square destination', () => {
  // 400x300 (1.333) -> 160x90 (1.778): source taller-ish: sw=400, sh=400/(16/9)=225, sy=(300-225)/2=37.5
  nearObj(coverRect(400, 300, 160, 90), { sx: 0, sy: 37.5, sw: 400, sh: 225 });
  // 1000x100 -> 50x100 (aspect .5): src wider: sh=100, sw=50; sx=475
  assert.deepEqual(coverRect(1000, 100, 50, 100), { sx: 475, sy: 0, sw: 50, sh: 100 });
});

test('coverRect: equal aspect -> whole source', () => {
  assert.deepEqual(coverRect(300, 200, 30, 20), { sx: 0, sy: 0, sw: 300, sh: 200 });
});

test('coverRect: non-finite / <1 inputs guarded to >= 1', () => {
  // all guarded to 1 -> aspects 1 == 1 -> else branch: sw=1, sh=1/1=1
  assert.deepEqual(coverRect(NaN, 0, -5, 'x'), { sx: 0, sy: 0, sw: 1, sh: 1 });
  assert.deepEqual(coverRect(Infinity, undefined, null, 0), { sx: 0, sy: 0, sw: 1, sh: 1 });
  // src 0x0 guarded to 1x1; dst 100x50 (aspect 2): 1 < 2 -> else: sw=1, sh=1/2=.5; sy=(1-.5)/2=.25
  assert.deepEqual(coverRect(0, 0, 100, 50), { sx: 0, sy: 0.25, sw: 1, sh: 0.5 });
});

test('containRect: letterbox (wide source) and pillarbox (tall source)', () => {
  // 200x100 -> 100x100: scale=min(.5,1)=.5 -> w=100,h=50; x=0, y=(100-50)/2=25
  assert.deepEqual(containRect(200, 100, 100, 100), { x: 0, y: 25, w: 100, h: 50 });
  // 100x200 -> 100x100: scale=min(1,.5)=.5 -> w=50,h=100; x=25,y=0
  assert.deepEqual(containRect(100, 200, 100, 100), { x: 25, y: 0, w: 50, h: 100 });
});

test('containRect: upscale, exact fit, guards', () => {
  // 100x100 -> 400x200: scale=min(4,2)=2 -> 200x200; x=(400-200)/2=100, y=0
  assert.deepEqual(containRect(100, 100, 400, 200), { x: 100, y: 0, w: 200, h: 200 });
  assert.deepEqual(containRect(50, 50, 50, 50), { x: 0, y: 0, w: 50, h: 50 });
  // 400x300 -> 160x90: scale=min(.4,.3)=.3 -> w=120,h=90; x=20,y=0
  nearObj(containRect(400, 300, 160, 90), { x: 20, y: 0, w: 120, h: 90 });
  // all-garbage -> 1x1 into 1x1
  assert.deepEqual(containRect(NaN, -1, 'q', 0), { x: 0, y: 0, w: 1, h: 1 });
});

test('coverSrcRect: zoom=1, no offset === coverRect', () => {
  for (const [a, b, c, d] of [[200, 100, 100, 100], [100, 200, 100, 100], [1600, 900, 100, 100], [300, 200, 30, 20]]) {
    assert.deepEqual(coverSrcRect(a, b, c, d), coverRect(a, b, c, d));
  }
});

test('coverSrcRect: zoom>1 shrinks the window about the centre', () => {
  // base for 200x100 -> 100x100 = {50,0,100,100}; zoom 2 -> sw=sh=50. cx=100 (clamp [25,175]) -> sx=75; cy=50 (clamp [25,75]) -> sy=25
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 2), { sx: 75, sy: 25, sw: 50, sh: 50 });
  // zoom 4 -> 25x25: sx=100-12.5=87.5, sy=50-12.5=37.5
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 4), { sx: 87.5, sy: 37.5, sw: 25, sh: 25 });
});

test('coverSrcRect: offsets pan the window; clamped so it never leaves the source', () => {
  // zoom 2 (window 50x50, centre range x:[25,175], y:[25,75])
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 2, 30, -10), { sx: 105, sy: 15, sw: 50, sh: 50 });   // cx=130->sx=105; cy=40->sy=15
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 2, 1000, 1000), { sx: 150, sy: 50, sw: 50, sh: 50 }); // cx->175, cy->75
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 2, -1000, -1000), { sx: 0, sy: 0, sw: 50, sh: 50 }); // cx->25, cy->25
  // zoom 1: window is the full height, so vertical offset has no room; horizontal range x:[50,150]
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 1, 30, 40), { sx: 80, sy: 0, sw: 100, sh: 100 });
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 1, 999, 0), { sx: 100, sy: 0, sw: 100, sh: 100 });
});

test('coverSrcRect: zoom < 1 / non-finite clamps to 1; bad offsets -> 0', () => {
  const base = coverRect(200, 100, 100, 100);
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 0.5), base);
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, NaN), base);
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, -3), base);
  assert.deepEqual(coverSrcRect(200, 100, 100, 100, 2, NaN, 'z'), coverSrcRect(200, 100, 100, 100, 2, 0, 0));
});

// ------------------------------------------------------------------ crop-aspect
test('ASPECT_PRESETS: ids, ratios', () => {
  assert.deepEqual(ASPECT_PRESETS.map((p) => p.id), ['free', '1x1', '4x3', '3x2', '16x9', '9x16', '5x7', '8x10', '4x6', 'custom']);
  const ratios = { free: null, '1x1': 1, '4x3': 4 / 3, '3x2': 1.5, '16x9': 16 / 9, '9x16': 9 / 16, '5x7': 5 / 7, '8x10': 0.8, '4x6': 4 / 6, custom: null };
  for (const p of ASPECT_PRESETS) assert.equal(p.ratio, ratios[p.id], p.id);
});

test('aspectRatioFor: presets, portrait inversion', () => {
  assert.equal(aspectRatioFor('1x1'), 1);
  near(aspectRatioFor('4x3'), 4 / 3);
  near(aspectRatioFor('16x9'), 16 / 9);
  assert.equal(aspectRatioFor('3x2'), 1.5);
  assert.equal(aspectRatioFor('8x10'), 0.8);
  near(aspectRatioFor('4x3', 0, 0, true), 0.75);       // 1/(4/3)
  near(aspectRatioFor('16x9', 0, 0, true), 9 / 16);
  near(aspectRatioFor('9x16', 0, 0, true), 16 / 9);
  assert.equal(aspectRatioFor('1x1', 0, 0, true), 1);
});

test('aspectRatioFor: custom W:H, portrait, bad -> null', () => {
  assert.equal(aspectRatioFor('custom', 3, 2), 1.5);
  assert.equal(aspectRatioFor('custom', '3', '2'), 1.5);                // numeric strings coerce
  near(aspectRatioFor('custom', 3, 2, true), 2 / 3);
  assert.equal(aspectRatioFor('custom', 5, 5), 1);
  assert.equal(aspectRatioFor('custom', 21, 9), 21 / 9);
  for (const [w, h] of [[0, 5], [5, 0], [-1, 5], [5, -1], ['a', 5], [5, NaN], [undefined, undefined], [null, 3]]) {
    assert.equal(aspectRatioFor('custom', w, h), null, 'custom ' + String(w) + ':' + String(h));
    assert.equal(aspectRatioFor('custom', w, h, true), null);
  }
});

test('aspectRatioFor: free / unknown id -> null', () => {
  assert.equal(aspectRatioFor('free'), null);
  assert.equal(aspectRatioFor('free', 3, 2), null);       // custom args ignored for non-custom
  assert.equal(aspectRatioFor('nope'), null);
  assert.equal(aspectRatioFor(undefined), null);
});

test('clampRectToImage: forced inside [0,0,iw,ih]', () => {
  // image 100x80
  assert.deepEqual(clampRectToImage({ x: 10, y: 10, w: 20, h: 20 }, 100, 80), { x: 10, y: 10, w: 20, h: 20 });
  assert.deepEqual(clampRectToImage({ x: -10, y: -5, w: 50, h: 50 }, 100, 80), { x: 0, y: 0, w: 50, h: 50 });
  // x=min(90, 100-50=50)=50 ; y=min(70, 80-50=30)=30
  assert.deepEqual(clampRectToImage({ x: 90, y: 70, w: 50, h: 50 }, 100, 80), { x: 50, y: 30, w: 50, h: 50 });
  // oversize -> whole image
  assert.deepEqual(clampRectToImage({ x: 0, y: 0, w: 500, h: 500 }, 100, 80), { x: 0, y: 0, w: 100, h: 80 });
});

test('clampRectToImage: min 1px, normalises negatives, guards bad bounds', () => {
  assert.deepEqual(clampRectToImage({ x: 5, y: 5, w: 0, h: 0 }, 100, 80), { x: 5, y: 5, w: 1, h: 1 });
  // negative size normalised: {60,60,-20,-20} -> {40,40,20,20}
  assert.deepEqual(clampRectToImage({ x: 60, y: 60, w: -20, h: -20 }, 100, 80), { x: 40, y: 40, w: 20, h: 20 });
  // bad iw/ih -> bounds 1x1: w,h->1; x=min(max(5,0),0)=0
  assert.deepEqual(clampRectToImage({ x: 5, y: 5, w: 50, h: 50 }, NaN, 0), { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(clampRectToImage({ x: 5, y: 5, w: 50, h: 50 }, -10, Infinity), { x: 0, y: 0, w: 1, h: 1 });
});

// constrainRectToAspect. Square rect S={10,10,100,100} (L10 T10 R110 B110, centre 60,60), ratio 2 (w/h).
// Width-driven anchors: h = w/2 = 50. Height-driven anchors (n/s): w = h*2.
const S = { x: 10, y: 10, w: 100, h: 100 };
test('constrainRectToAspect: corner anchors are width-driven, anchor corner fixed', () => {
  assert.deepEqual(constrainRectToAspect(S, 2, 'nw'), { x: 10, y: 10, w: 100, h: 50 });   // x=L, y=T
  assert.deepEqual(constrainRectToAspect(S, 2, 'ne'), { x: 10, y: 10, w: 100, h: 50 });   // x=R-w=10, y=T
  assert.deepEqual(constrainRectToAspect(S, 2, 'sw'), { x: 10, y: 60, w: 100, h: 50 });   // x=L, y=B-h=60
  assert.deepEqual(constrainRectToAspect(S, 2, 'se'), { x: 10, y: 60, w: 100, h: 50 });   // x=R-w, y=B-h
  assert.deepEqual(constrainRectToAspect(S, 2), constrainRectToAspect(S, 2, 'nw'));        // default anchor
  // ne vs nw differ when width changes: rect 100 wide, anchor e keeps R. Use a non-square rect {0,0,100,10}, ratio 1:
  // width-driven h=100; 'ne': x=R-w=0, y=T=0 -> {0,0,100,100}; 'se': y=B-h=10-100=-90
  assert.deepEqual(constrainRectToAspect({ x: 0, y: 0, w: 100, h: 10 }, 1, 'se'), { x: 0, y: -90, w: 100, h: 100 });
});

test('constrainRectToAspect: e / w edge anchors are width-driven, y centred on the rect centre line', () => {
  assert.deepEqual(constrainRectToAspect(S, 2, 'e'), { x: 10, y: 35, w: 100, h: 50 });    // x=R-w=10; y=60-25=35
  assert.deepEqual(constrainRectToAspect(S, 2, 'w'), { x: 10, y: 35, w: 100, h: 50 });    // x=L=10; y=35
  // rect {0,0,100,60} ratio 1: h=w=100 ; 'e': x=R-w=0, y=30-50=-20 ; 'w': x=0
  assert.deepEqual(constrainRectToAspect({ x: 20, y: 0, w: 100, h: 60 }, 1, 'e'), { x: 20, y: -20, w: 100, h: 100 });
});

test('constrainRectToAspect: n / s edge anchors are HEIGHT-driven, x centred', () => {
  // S ratio 2: w = h*2 = 200 ; x = cx - w/2 = 60-100 = -40 ; n: y=T=10 ; s: y=B-h=10
  assert.deepEqual(constrainRectToAspect(S, 2, 'n'), { x: -40, y: 10, w: 200, h: 100 });
  assert.deepEqual(constrainRectToAspect(S, 2, 's'), { x: -40, y: 10, w: 200, h: 100 });
  // rect {0,0,100,60} ratio 1.5: w = 60*1.5 = 90 ; x = 50-45 = 5 ; n: y=0 ; s: y=60-60=0
  assert.deepEqual(constrainRectToAspect({ x: 0, y: 0, w: 100, h: 60 }, 1.5, 'n'), { x: 5, y: 0, w: 90, h: 60 });
  // s with different y: {0,100,100,60}: s -> y=B-h=160-60=100
  assert.deepEqual(constrainRectToAspect({ x: 0, y: 100, w: 100, h: 60 }, 1.5, 's'), { x: 5, y: 100, w: 90, h: 60 });
});

test('constrainRectToAspect: center is width-driven and grows about the centre (not misread as ne)', () => {
  // S ratio 2: h=w/2=50 ; x = 60-50 = 10 ; y = 60-25 = 35
  assert.deepEqual(constrainRectToAspect(S, 2, 'center'), { x: 10, y: 35, w: 100, h: 50 });
  // ne would give y=10; center must differ
  assert.notDeepEqual(constrainRectToAspect(S, 2, 'center'), constrainRectToAspect(S, 2, 'ne'));
  // ratio 0.5: h = 200 ; y = 60-100 = -40
  assert.deepEqual(constrainRectToAspect(S, 0.5, 'center'), { x: 10, y: -40, w: 100, h: 200 });
});

test('constrainRectToAspect: result ratio === requested; negative rect normalised; 1px floor; bad ratio passthrough', () => {
  const r = constrainRectToAspect({ x: 110, y: 110, w: -100, h: -100 }, 2, 'nw'); // normalises to S
  assert.deepEqual(r, { x: 10, y: 10, w: 100, h: 50 });
  assert.equal(r.w / r.h, 2);
  // 1px floor: {0,0,1,1} ratio 100 nw -> h=1/100=.01 -> 1
  assert.deepEqual(constrainRectToAspect({ x: 0, y: 0, w: 1, h: 1 }, 100, 'nw'), { x: 0, y: 0, w: 1, h: 1 });
  // n with w = h*ratio = 1*.5 = .5 -> 1 ; x = 5 - .5 = 4.5
  assert.deepEqual(constrainRectToAspect({ x: 0, y: 0, w: 10, h: 1 }, 0.5, 'n'), { x: 4.5, y: 0, w: 1, h: 1 });
  // invalid ratio -> just the normalised rect
  for (const bad of [0, -1, NaN, Infinity, null, undefined, 'x']) {
    assert.deepEqual(constrainRectToAspect({ x: 110, y: 110, w: -100, h: -100 }, bad, 'se'), S);
  }
});

// resizeRaw: rect0 {x:10,y:20,w:100,h:60} -> L10 T20 R110 B80 ; drag to p=(50,40). Only the dragged edges move.
test('resizeRaw: per-handle edge moves', () => {
  const R0 = { x: 10, y: 20, w: 100, h: 60 };
  const p = { x: 50, y: 40 };
  const want = {
    nw: { x: 50, y: 40, w: 60, h: 40 },   // L=50,T=40
    n:  { x: 10, y: 40, w: 100, h: 40 },  // T=40
    ne: { x: 10, y: 40, w: 40, h: 40 },   // T=40,R=50
    e:  { x: 10, y: 20, w: 40, h: 60 },   // R=50
    se: { x: 10, y: 20, w: 40, h: 20 },   // R=50,B=40
    s:  { x: 10, y: 20, w: 100, h: 20 },  // B=40
    sw: { x: 50, y: 20, w: 60, h: 20 },   // L=50,B=40
    w:  { x: 50, y: 20, w: 60, h: 60 },   // L=50
  };
  for (const id of HANDLE_IDS) assert.deepEqual(resizeRaw(id, R0, p), want[id], id);
  // #1014-N: a non-edge id ('move'/'center'/unknown) no longer misreads 'e' in "move" — returns rect unchanged
  for (const id of ['move', 'center', 'bogus']) assert.deepEqual(resizeRaw(id, R0, p), { x: 10, y: 20, w: 100, h: 60 }, id);
});

test('resizeRaw: dragging past the opposite edge yields raw negative w/h (unclamped)', () => {
  const R0 = { x: 10, y: 20, w: 100, h: 60 };
  assert.deepEqual(resizeRaw('e', R0, { x: 0, y: 999 }), { x: 10, y: 20, w: -10, h: 60 });   // R=0 -> w=-10
  assert.deepEqual(resizeRaw('s', R0, { x: 999, y: 10 }), { x: 10, y: 20, w: 100, h: -10 }); // B=10 -> h=-10
  // and normalizeRect recovers a valid rect
  assert.deepEqual(normalizeRect(resizeRaw('e', R0, { x: 0, y: 0 })), { x: 0, y: 20, w: 10, h: 60 });
});

// ------------------------------------------------------------------ aggregator
test('CtImageUtil aggregator: spot-check statics === named exports', () => {
  assert.equal(CtImageUtil.clampByte, clampByte);
  assert.equal(CtImageUtil.hitTestHandle, hitTestHandle);
  assert.equal(CtImageUtil.coverRect, coverRect);
  assert.equal(CtImageUtil.FORMATS, FORMATS);
  assert.equal(CtImageUtil.MAX_DIMENSION, 20000);
  assert.equal(CtImageUtil.constrainRectToAspect, constrainRectToAspect);
});

test('CtImageUtil aggregator: every named export is mirrored as a static', () => {
  const names = Object.keys(ns).filter((k) => k !== 'CtImageUtil');
  assert.equal(names.length, 28);
  for (const k of names) assert.equal(CtImageUtil[k], ns[k], k);
  // the DOM/canvas trio is exposed (but not exercised here)
  for (const k of ['loadImageFile', 'canvasToBlob', 'canvasToPngBytes']) assert.equal(typeof CtImageUtil[k], 'function');
});
