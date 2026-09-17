// parseColor() + parseHex()/buildRgba() helpers: intermixed rgba()/hex input
// parsing, alpha handling, shorthand hex, clamping, and invalid input
// (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorConverter } from './_helpers.mjs';

const { parseColor, parseHex, buildRgba, clampChannel, clampAlpha } = await loadColorConverter();

test('parseColor: 6-digit hex, with and without leading #', () => {
  assert.deepEqual(parseColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('ff0000'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('#00FF00'), { r: 0, g: 255, b: 0, a: 1 }); // case-insensitive
});

test('parseColor: 3-digit shorthand hex expands each nibble', () => {
  assert.deepEqual(parseColor('#f00'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('#0af'), { r: 0, g: 170, b: 255, a: 1 });
});

test('parseColor: 8-digit hex carries alpha; 4-digit shorthand alpha expands', () => {
  assert.deepEqual(parseColor('#ff000080'), { r: 255, g: 0, b: 0, a: 128 / 255 });
  assert.deepEqual(parseColor('#f008'), { r: 255, g: 0, b: 0, a: 136 / 255 }); // 8 -> 0x88
  assert.deepEqual(parseColor('#ffffffff'), { r: 255, g: 255, b: 255, a: 1 });
});

test('parseColor: rgb()/rgba() comma form, alpha optional', () => {
  assert.deepEqual(parseColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(255, 0, 0, 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgba(10,20,30,1)'), { r: 10, g: 20, b: 30, a: 1 }); // no spaces
});

test('parseColor: modern slash form rgb(r g b / a) requires alpha', () => {
  assert.deepEqual(parseColor('rgb(255 0 0 / 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgba(1 2 3 / 1)'), { r: 1, g: 2, b: 3, a: 1 });
});

test('parseColor: mixing comma and slash syntax matches neither form', () => {
  assert.equal(parseColor('rgb(255, 0, 0 / 0.5)'), null);
  assert.equal(parseColor('rgb(255 0 0, 0.5)'), null);
});

test('parseColor: percentage channels are out of scope and fail to parse', () => {
  assert.equal(parseColor('rgb(50%, 0%, 0%)'), null);
});

test('parseColor: whitespace-only or empty string is null, not a throw', () => {
  assert.equal(parseColor(''), null);
  assert.equal(parseColor('   '), null);
  assert.equal(parseColor(undefined), null);
  assert.equal(parseColor(null), null);
});

test('parseColor: garbage input returns null', () => {
  assert.equal(parseColor('not a color'), null);
  assert.equal(parseColor('#gggggg'), null);
  assert.equal(parseColor('rgb(1,2)'), null); // too few channels
  assert.equal(parseColor('rgba(1,2,3,4,5)'), null); // too many args
});

test('parseColor: out-of-range rgb() channels are clamped, not rejected', () => {
  assert.deepEqual(parseColor('rgb(300, -10, 128)'), { r: 255, g: 0, b: 128, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 2)'), { r: 0, g: 0, b: 0, a: 1 }); // alpha clamps to 1
  assert.deepEqual(parseColor('rgba(0, 0, 0, -1)'), { r: 0, g: 0, b: 0, a: 0 }); // alpha clamps to 0
});

test('parseColor: fractional rgb() channels round to the nearest integer', () => {
  assert.deepEqual(parseColor('rgb(1.4, 1.5, 1.6)'), { r: 1, g: 2, b: 2, a: 1 });
});

test('parseColor: a non-numeric channel/alpha fails to parse (NaN guard)', () => {
  assert.equal(buildRgba('nope', '0', '0'), null);
  assert.equal(buildRgba('0', '0', '0', 'nope'), null);
});

test('clampChannel: clamps to [0,255] and rounds', () => {
  assert.equal(clampChannel(-5), 0);
  assert.equal(clampChannel(300), 255);
  assert.equal(clampChannel(127.6), 128);
});

test('clampAlpha: clamps to [0,1]', () => {
  assert.equal(clampAlpha(-1), 0);
  assert.equal(clampAlpha(2), 1);
  assert.equal(clampAlpha(0.5), 0.5);
});

test('parseHex: 4-digit shorthand alpha maps 0x0-0xf correctly', () => {
  assert.deepEqual(parseHex('0000'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseHex('ffff'), { r: 255, g: 255, b: 255, a: 1 });
});
