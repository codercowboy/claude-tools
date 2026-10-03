// Unit tests for CtDither.mjs (palette dithering engine). Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: every error-diffusion / ordered-dither expectation below is HAND-COMPUTED (the walk is in
// the comment above each test), NOT copied from the lib's output -- so a wrong-but-deterministic
// result would fail. Palette is black [0,0,0] (idx 0) / white [255,255,255] (idx 1) throughout.
// Nearest-colour threshold on gray g: white iff (255-g)^2 < g^2  <=>  g > 127.5 (127 -> black, 128 -> white).
// clampByte truncates (v|0), so a working value 72.4375 is read as 72, 159.5 as 159, etc.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer,
} from '../../utils/image/CtDither.mjs';

const BW = [[0, 0, 0], [255, 255, 255]];
// flat RGBA buffer of gray pixels (alpha 255)
const gray = (...vals) => {
  const a = new Uint8Array(vals.length * 4);
  vals.forEach((v, i) => { a[i * 4] = v; a[i * 4 + 1] = v; a[i * 4 + 2] = v; a[i * 4 + 3] = 255; });
  return a;
};

// ------------------------------------------------------------ nearestColorIndex
test('nearestColorIndex: grayscale thresholds at 127.5', () => {
  assert.equal(nearestColorIndex(0, 0, 0, BW), 0);
  assert.equal(nearestColorIndex(127, 127, 127, BW), 0); // 3*127^2 < 3*128^2
  assert.equal(nearestColorIndex(128, 128, 128, BW), 1);
  assert.equal(nearestColorIndex(255, 255, 255, BW), 1);
});

test('nearestColorIndex: RGB picks the closest primary', () => {
  const pal = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  assert.equal(nearestColorIndex(200, 30, 30, pal), 0);
  assert.equal(nearestColorIndex(10, 220, 40, pal), 1);
  assert.equal(nearestColorIndex(0, 0, 90, pal), 2);
});

test('nearestColorIndex: uses SQUARED distance (not Manhattan)', () => {
  // target (0,0,0): A=[6,0,0] d2=36 (manhattan 6); B=[4,4,0] d2=32 (manhattan 8).
  // Squared distance prefers B (idx 1); a Manhattan metric would prefer A.
  assert.equal(nearestColorIndex(0, 0, 0, [[6, 0, 0], [4, 4, 0]]), 1);
});

test('nearestColorIndex: exact tie picks the FIRST index', () => {
  // (1,0,0) is distance^2 = 1 from both [0,0,0] and [2,0,0]
  assert.equal(nearestColorIndex(1, 0, 0, [[0, 0, 0], [2, 0, 0]]), 0);
  assert.equal(nearestColorIndex(1, 0, 0, [[2, 0, 0], [0, 0, 0]]), 0);
});

test('nearestColorIndex: exact match stops at the first identical entry', () => {
  assert.equal(nearestColorIndex(5, 5, 5, [[5, 5, 5], [5, 5, 5]]), 0);
  assert.equal(nearestColorIndex(10, 20, 30, [[0, 0, 0], [10, 20, 30], [255, 255, 255]]), 1);
});

test('nearestColorIndex: single-entry palette -> 0; empty palette -> 0 (default best)', () => {
  assert.equal(nearestColorIndex(9, 9, 9, [[200, 200, 200]]), 0);
  assert.equal(nearestColorIndex(9, 9, 9, []), 0);
});

// ------------------------------------------------------------ bayerMatrix
test('bayerMatrix: order <= 1 -> [[0]]', () => {
  assert.deepEqual(bayerMatrix(1), [[0]]);
  assert.deepEqual(bayerMatrix(0), [[0]]);
  assert.deepEqual(bayerMatrix(-3), [[0]]);
});

test('bayerMatrix(2) is the base matrix', () => {
  assert.deepEqual(bayerMatrix(2), [[0, 2], [3, 1]]);
});

test('bayerMatrix(4) is the exact canonical 4x4', () => {
  // from base via next[y][x]=4v, [y][x+s]=4v+2, [y+s][x]=4v+3, [y+s][x+s]=4v+1
  assert.deepEqual(bayerMatrix(4), [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]);
});

test('bayerMatrix(8): 8x8 permutation of 0..63, top-left quadrant = 4*bayer4, anchors', () => {
  const m = bayerMatrix(8);
  assert.equal(m.length, 8);
  assert.ok(m.every((r) => r.length === 8));
  const flat = m.flat().slice().sort((a, b) => a - b);
  assert.deepEqual(flat, Array.from({ length: 64 }, (_, i) => i));
  const b4 = bayerMatrix(4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    assert.equal(m[y][x], 4 * b4[y][x]);          // quadrant (0,0): 4v
    assert.equal(m[y][x + 4], 4 * b4[y][x] + 2);  // quadrant (0,1): 4v+2
    assert.equal(m[y + 4][x], 4 * b4[y][x] + 3);  // quadrant (1,0): 4v+3
    assert.equal(m[y + 4][x + 4], 4 * b4[y][x] + 1); // quadrant (1,1): 4v+1
  }
  assert.deepEqual(m[0], [0, 32, 8, 40, 2, 34, 10, 42]); // hand-expanded first row
});

test('bayerMatrix: non-power-of-two rounds up to the next power; fractional order is truncated', () => {
  assert.deepEqual(bayerMatrix(3), bayerMatrix(4)); // size 2 < 3 -> doubles to 4
  assert.deepEqual(bayerMatrix(4.9), bayerMatrix(4)); // order|0 = 4
});

// ------------------------------------------------------------ floydSteinberg
// 3x1 row of gray 128, B/W palette (only the "right" 7/16 term applies; no row below):
//   p0: 128 -> white(1); err = 128-255 = -127; p1 += -127*7/16 = -55.5625  -> 72.4375
//   p1: clamp 72 -> black(0); err = 72-0 = 72;  p2 += 72*7/16 = 31.5        -> 159.5
//   p2: clamp 159 -> white(1)
test('floydSteinberg: 3x1 gray128 -> [1,0,1] (hand-walked)', () => {
  const out = floydSteinberg(gray(128, 128, 128), 3, 1, BW);
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out), [1, 0, 1]);
});

// 2x2 gray 128 (w=2,h=2). Order p00,p10,p01,p11.
//   p00: 128 -> W; err -127. right p10 += -55.5625 -> 72.4375; down p01 += -127*5/16 = -39.6875 -> 88.3125;
//        down-right p11 += -127/16 = -7.9375 -> 120.0625   (down-left: x=0, none)
//   p10: 72 -> B; err 72. down-left p01 += 72*3/16 = 13.5 -> 101.8125; down p11 += 72*5/16 = 22.5 -> 142.5625
//        (right/down-right: x+1 out of range, none)
//   p01: 101 -> B; err 101. right p11 += 101*7/16 = 44.1875 -> 186.75
//   p11: 186 -> W
test('floydSteinberg: 2x2 gray128 -> [1,0,0,1] (hand-walked, all four taps)', () => {
  assert.deepEqual(Array.from(floydSteinberg(gray(128, 128, 128, 128), 2, 2, BW)), [1, 0, 0, 1]);
});

test('floydSteinberg: flat extremes map to the matching palette entry', () => {
  assert.deepEqual(Array.from(floydSteinberg(gray(0, 0, 0, 0), 2, 2, BW)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(floydSteinberg(gray(255, 255, 255, 255), 2, 2, BW)), [1, 1, 1, 1]);
});

test('floydSteinberg: exact palette colours produce zero error (no bleed)', () => {
  // 0,255,0,255 : each pixel exactly on palette -> err 0 -> unchanged
  assert.deepEqual(Array.from(floydSteinberg(gray(0, 255, 0, 255), 4, 1, BW)), [0, 1, 0, 1]);
});

test('floydSteinberg: deterministic, does not mutate the input, output length = w*h', () => {
  const src = gray(10, 200, 90, 128, 64, 190);
  const copy = src.slice();
  const a = floydSteinberg(src, 3, 2, BW);
  const b = floydSteinberg(src, 3, 2, BW);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.deepEqual(Array.from(src), Array.from(copy));
  assert.equal(a.length, 6);
});

// ------------------------------------------------------------ atkinson
// offsets (dx,dy): (1,0),(2,0),(-1,1),(0,1),(1,1),(0,2); each gets err/8; out-of-range taps skipped.
// 3x1 row of gray 128 (only (1,0) and (2,0) land inside the image):
//   p0: 128 -> W; err = -127/8 = -15.875; p1 += -15.875 -> 112.125; p2 += -15.875 -> 112.125
//   p1: clamp 112 -> B; err = 112/8 = 14;  p2 += 14 -> 126.125   ((2,0) from x=1 is x=3, out)
//   p2: clamp 126 -> B   (126 < 127.5)
// Note FS gives [1,0,1] for the same input, so this also proves the two algorithms differ.
test('atkinson: 3x1 gray128 -> [1,0,0] (hand-walked)', () => {
  const out = atkinson(gray(128, 128, 128), 3, 1, BW);
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out), [1, 0, 0]);
});

// 2x2 gray 128:
//   p00: W; e=-15.875. taps: (1,0)->p10 112.125 ; (2,0) out ; (-1,1) out ; (0,1)->p01 112.125 ; (1,1)->p11 112.125 ;
//        (0,2) ny=2>=h skipped
//   p10: 112 -> B; e=14. taps: (2,0),(1,1) out of x ; (-1,1)->p01 += 14 -> 126.125 ; (0,1)->p11 += 14 -> 126.125
//   p01: 126 -> B; e=126/8=15.75. tap (1,0)->p11 += 15.75 -> 141.875 ; others out
//   p11: 141 -> W
test('atkinson: 2x2 gray128 -> [1,0,0,1] (hand-walked, vertical taps)', () => {
  assert.deepEqual(Array.from(atkinson(gray(128, 128, 128, 128), 2, 2, BW)), [1, 0, 0, 1]);
});

// 1x3 column of gray 128: taps (0,1) and (0,2) land inside.
//   p0: W; e=-15.875 -> p1 112.125, p2 112.125 ; p1: 112 -> B; e=14 -> (0,1) p2 += 14 -> 126.125 ; ((0,2) out)
//   p2: 126 -> B   => [1,0,0]
test('atkinson: 1x3 column gray128 -> [1,0,0] (exercises the (0,1)/(0,2) taps)', () => {
  assert.deepEqual(Array.from(atkinson(gray(128, 128, 128), 1, 3, BW)), [1, 0, 0]);
});

test('atkinson: flat extremes + exact palette colours; deterministic', () => {
  assert.deepEqual(Array.from(atkinson(gray(0, 0, 0, 0), 2, 2, BW)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(atkinson(gray(255, 255, 255, 255), 2, 2, BW)), [1, 1, 1, 1]);
  const src = gray(10, 200, 90, 128);
  assert.deepEqual(Array.from(atkinson(src, 2, 2, BW)), Array.from(atkinson(src, 2, 2, BW)));
});

// ------------------------------------------------------------ bayer
// order 4 (denom 16), strength 64: off = ((m+0.5)/16 - 0.5)*64 = 4m - 30.
// 4x2 of gray 128; matrix rows [0,8,2,10] / [12,4,14,6]:
//   row0 off: -30,+2,-22,+10 -> 98,130,106,138 -> B,W,B,W
//   row1 off: +18,-14,+26,-6 -> 146,114,154,122 -> W,B,W,B
test('bayer: 4x2 gray128, default order 4 / strength 64 -> exact (hand-derived)', () => {
  const out = bayer(gray(128, 128, 128, 128, 128, 128, 128, 128), 4, 2, BW);
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out), [0, 1, 0, 1, 1, 0, 1, 0]);
});

test('bayer: explicit opts {order:4,strength:64} equals the defaults', () => {
  const src = gray(128, 128, 128, 128, 128, 128, 128, 128);
  assert.deepEqual(Array.from(bayer(src, 4, 2, BW, { order: 4, strength: 64 })),
    Array.from(bayer(src, 4, 2, BW)));
});

// order 2 (denom 4), strength 64: off = ((m+0.5)/4 - 0.5)*64 = 16m - 24 ; matrix [[0,2],[3,1]]
//   offs: -24,+8 / +24,-8 on gray128 -> 104 B, 136 W / 152 W, 120 B
test('bayer: order 2, 2x2 gray128 -> [0,1,1,0]', () => {
  assert.deepEqual(Array.from(bayer(gray(128, 128, 128, 128), 2, 2, BW, { order: 2 })), [0, 1, 1, 0]);
});

test('bayer: strength 0 degenerates to plain nearest-colour', () => {
  assert.deepEqual(Array.from(bayer(gray(127, 128, 0, 255), 4, 1, BW, { strength: 0 })), [0, 1, 0, 1]);
});

test('bayer: matrix tiles across a larger image (x,y wrap modulo matrix size)', () => {
  // 8x1 gray128: row0 pattern repeats every 4 pixels -> [0,1,0,1,0,1,0,1]
  const out = bayer(gray(128, 128, 128, 128, 128, 128, 128, 128), 8, 1, BW);
  assert.deepEqual(Array.from(out), [0, 1, 0, 1, 0, 1, 0, 1]);
});

test('bayer: deterministic; input untouched', () => {
  const src = gray(30, 100, 160, 220, 128, 64, 192, 255);
  const copy = src.slice();
  assert.deepEqual(Array.from(bayer(src, 4, 2, BW)), Array.from(bayer(src, 4, 2, BW)));
  assert.deepEqual(Array.from(src), Array.from(copy));
});

// =====================================================================================
// r2: WEIGHT-SENSITIVE cases. Each is a non-128 input chosen so that changing any single
// diffusion weight/divisor/tap (or the bayer default order/strength/+0.5) flips at least one
// downstream pixel. Walks below are hand-computed (working value -> read = trunc -> index -> err).
// =====================================================================================
const rgbaOf = (...px) => {
  const a = new Uint8Array(px.length * 4);
  px.forEach((p, i) => { a[i * 4] = p[0]; a[i * 4 + 1] = p[1]; a[i * 4 + 2] = p[2]; a[i * 4 + 3] = 255; });
  return a;
};

test('floydSteinberg: 3x3 non-128 gray -> [1,0,1, 0,0,1, 1,0,1] (pins 7/3/5/1 over 16)', () => {
  // input rows: [192,120,127] [130,64,120] [192,96,120]; B=0, W=255; err = read - chosen
  // (0,0) 192 ->W err -63 : (1,0)+=-63*7/16=-27.5625 ; (0,1)+=-63*5/16=-19.6875 ; (1,1)+=-63/16=-3.9375
  // (1,0) 92.4375 ->92 B err 92 : (2,0)+=40.25 ; (0,1)+=92*3/16=17.25 ; (1,1)+=28.75 ; (2,1)+=5.75
  // (2,0) 167.25 ->167 W err -88 : (1,1)+=-88*3/16=-16.5 ; (2,1)+=-27.5
  // (0,1) 130-19.6875+17.25=127.5625 ->127 B err 127 : (1,1)+=55.5625 ; (0,2)+=39.6875 ; (1,2)+=7.9375
  // (1,1) 64-3.9375+28.75-16.5+55.5625=127.875 ->127 B err 127 : (2,1)+=55.5625 ; (0,2)+=23.8125 ; (1,2)+=39.6875 ; (2,2)+=7.9375
  // (2,1) 120+5.75-27.5+55.5625=153.8125 ->153 W err -102 : (1,2)+=-19.125 ; (2,2)+=-31.875
  // (0,2) 192+39.6875+23.8125=255.5 ->255 W err 0
  // (1,2) 96+7.9375+39.6875-19.125=124.5 ->124 B err 124 : (2,2)+=124*7/16=54.25
  // (2,2) 120+7.9375-31.875+54.25=150.3125 ->150 W
  // (every single-weight change among 7/3/5/1 flips a read across 127.5 -- see HANDOFF-r2 mutation proof)
  const out = floydSteinberg(gray(192, 120, 127, 130, 64, 120, 192, 96, 120), 3, 3, BW);
  assert.deepEqual(Array.from(out), [1, 0, 1, 0, 0, 1, 1, 0, 1]);
});

test('floydSteinberg: 3x2 colour (R,G,B,black palette) -> [2,0,2,1,2,1] (per-channel error + clamp)', () => {
  // palette: 0=R[255,0,0] 1=G[0,255,0] 2=B[0,0,255] 3=black
  // pixels row0: (90,150,180) (200,150,150) (0,60,200) ; row1: (90,150,90) (128,150,200) (150,60,150)
  // (0,0) read (90,150,180): d2 R=165^2+150^2+180^2, G=90^2+105^2+180^2, B=90^2+150^2+75^2=36225 -> B(2); err (90,150,-75)
  //   (1,0)+=7/16*err=(39.375,65.625,-32.8125) -> (239.375,215.625,117.1875) ; (0,1)+=5/16: (28.125,46.875,-23.4375) ; (1,1)+=1/16
  // (1,0) read (239,215,117) -> R(0) (d2 = 16^2+215^2+117^2=60,170 vs G 239^2+40^2+117^2=72,... larger) err (-16,215,117)
  //   (2,0)+=7/16 ; (0,1)+=3/16 ; (1,1)+=5/16 ; (2,1)+=1/16
  // (2,0) work (-7,154.0625,251.1875) read (0,154,251) -> B(2) err (0,154,-4)
  // (0,1) work (115.125,237.1875,88.5) read (115,237,88) -> G(1) err (115,-18,88)
  // (1,1) work (178.9375,247.5625,269.625) read (178,247,255 <- clamp) -> B(2) err (178,247,0)
  // (2,1) work (226.875,229.625,156.0625) read (226,229,156) -> G(1)
  const pal = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 0]];
  const img = rgbaOf([90, 150, 180], [200, 150, 150], [0, 60, 200], [90, 150, 90], [128, 150, 200], [150, 60, 150]);
  assert.deepEqual(Array.from(floydSteinberg(img, 3, 2, pal)), [2, 0, 2, 1, 2, 1]);
});

test('atkinson: 3x3 non-128 gray -> [1,1,1, 0,0,1, 1,1,0] (pins /8 and the six taps)', () => {
  // input rows: [128,192,160] [64,140,140] [127,160,160]; each tap gets err/8
  // taps (dx,dy): (1,0)(2,0)(-1,1)(0,1)(1,1)(0,2), each gets err/8; off-image taps skipped. Walk (read -> idx, err):
  // (0,0) 128 W err -127 (-15.875/tap): (1,0)=176.125 (2,0)=144.125 (0,1)=48.125 (1,1)=124.125 (0,2)=111.125
  // (1,0) 176 W err -79 (-9.875/tap): (2,0)=134.25 (0,1)=38.25 (1,1)=114.25 (2,1)=130.125 (1,2)=150.125
  // (2,0) 134 W err -121 (-15.125/tap): (1,1)=99.125 (2,1)=115 (2,2)=144.875
  // (0,1) 38 B err 38 (+4.75/tap): (1,1)=103.875 (2,1)=119.75 (0,2)=115.875 (1,2)=154.875
  // (1,1) 103 B err 103 (+12.875/tap): (2,1)=132.625 (0,2)=128.75 (1,2)=167.75 (2,2)=157.75
  // (2,1) 132 W err -123 (-15.375/tap): (1,2)=152.375 (2,2)=142.375
  // (0,2) 128 W err -127 (-15.875/tap): (1,2)=136.5 (2,2)=126.5
  // (1,2) 136 W err -119 (-14.875/tap): (2,2)=111.625 ; (2,2) 111 B
  const out = atkinson(gray(128, 192, 160, 64, 140, 140, 127, 160, 160), 3, 3, BW);
  assert.deepEqual(Array.from(out), [1, 1, 1, 0, 0, 1, 1, 1, 0]);
});

test('atkinson: 3x2 colour (R,G,B,black palette) -> [2,1,2,0,1,3] (per-channel error)', () => {
  // palette 0=R 1=G 2=B 3=black ; pixels row0 (150,128,200) (60,128,150) (128,128,150); row1 (200,180,60) (0,128,0) (90,60,0)
  // (0,0) (150,128,200) -> B(2) err (150,128,-55) ; per tap /8 = (18.75,16,-6.875) to (1,0),(2,0),(0,1),(1,1)  [(-1,1) off-edge]
  // (1,0) work (78.75,144,143.125) read (78,144,143) -> G(1) err (78,-111,143)
  // (2,0) work (156.5,130.125,161) read (156,130,161) -> B(2) err (156,130,-94)
  // (0,1) work (228.5,182.125,71) read (228,182,71) -> R(0)
  // (1,1) work (44.625,169.125,8.125) read (44,169,8) -> G(1)
  // (2,1) work (121.375,74.375,16) read (121,74,16) -> black(3)
  const pal = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 0]];
  const img = rgbaOf([150, 128, 200], [60, 128, 150], [128, 128, 150], [200, 180, 60], [0, 128, 0], [90, 60, 0]);
  assert.deepEqual(Array.from(atkinson(img, 3, 2, pal)), [2, 1, 2, 0, 1, 3]);
});

test('bayer: default order 4 / strength 64 / +0.5, near-threshold 4x2 -> [1,1,1,0, 1,1,0,1]', () => {
  // order 4, strength 64: off = ((m+0.5)/16 - 0.5)*64 = 4m - 30 ; white iff trunc(g+off) >= 128
  // row0 m=[0,8,2,10] off=[-30,+2,-22,+10] g=[158,126,150,117] -> [128,128,128,127] -> [W,W,W,B]
  // row1 m=[12,4,14,6] off=[+18,-14,+26,-6]  g=[110,142,101,134] -> [128,128,127,128] -> [W,W,B,W]
  // (dropping +0.5 gives off=4m-32 and flips pixels; order 8/2 and strength 60/100 change offsets too)
  const g = gray(158, 126, 150, 117, 110, 142, 101, 134);
  assert.deepEqual(Array.from(bayer(g, 4, 2, BW)), [1, 1, 1, 0, 1, 1, 0, 1]);
  assert.deepEqual(Array.from(bayer(g, 4, 2, BW, { order: 4, strength: 64 })), [1, 1, 1, 0, 1, 1, 0, 1]);
});

test('bayer: strength discriminator at the matrix extremes (m=0 and m=15)', () => {
  // 4x4 order, strength 64: m=0 off=-30 ; m=15 off=+30.  Row y=0 x=0 is m=0; row y=3 x=0 is m=15.
  // g=158,m=0: 128 -> W.  g=98,m=15: 128 -> W.  (strength 60: 129.875-> still W for 158? 158-28.125=129 W; but
  //  g=157,m=0: 127 B @64 vs 128.875->128 W @60 ; g=99,m=15: 129 W @64 vs 99+3.75*15-28.125=127.1 B @60)
  const img = new Uint8Array(4 * 4 * 4).fill(255);
  const set = (x, y, v) => { const i = (y * 4 + x) * 4; img[i] = v; img[i + 1] = v; img[i + 2] = v; };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, 0);
  set(0, 0, 157); // m=0  -> 127 B at strength 64
  set(0, 3, 99);  // m=15 -> 129 W at strength 64
  const out = bayer(img, 4, 4, BW);
  assert.equal(out[0], 0);
  assert.equal(out[3 * 4 + 0], 1);
  // explicit strength 60 (hand: m=0 -> 157-28.125=128.875 W; m=15 -> 99+28.125=127.125 B) flips both
  const o60 = bayer(img, 4, 4, BW, { strength: 60 });
  assert.equal(o60[0], 1);
  assert.equal(o60[3 * 4 + 0], 0);
});

test('bayer: non-default order 2 + strength 128 on 2x2 (hand-computed)', () => {
  // order 2 matrix [[0,2],[3,1]], denom 4: off = ((m+0.5)/4 - 0.5)*128 = 32m - 48
  // m=[0,2;3,1] off=[-48,+16;+48,-16] ; g=[176,112;80,144] -> [128,128;128,128] -> all W
  // (strength 64 would give off=[-24,8;24,-8] -> [152,120;104,136] -> [W,B;B,W])
  const g = gray(176, 112, 80, 144);
  assert.deepEqual(Array.from(bayer(g, 2, 2, BW, { order: 2, strength: 128 })), [1, 1, 1, 1]);
  assert.deepEqual(Array.from(bayer(g, 2, 2, BW, { order: 2, strength: 64 })), [1, 0, 0, 1]);
});
