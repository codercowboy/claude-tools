// rgbaString()/hexString(): pixel RGBA -> hex/rgba string formatting, the
// pure surface color-picker exposes (canvas pan/zoom/sampling is DOM and is
// covered only by the e2e suite) — node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorPicker } from './_helpers.mjs';

const { rgbaString, hexString } = await loadColorPicker();

test('rgbaString: opaque sampled pixel always includes alpha as "1"', () => {
  assert.equal(rgbaString({ r: 255, g: 0, b: 0, a: 1 }), 'rgba(255, 0, 0, 1)');
});

test('rgbaString: fractional alpha (partially transparent pixel) trims to <=3 decimals', () => {
  assert.equal(rgbaString({ r: 0, g: 0, b: 0, a: 0.5 }), 'rgba(0, 0, 0, 0.5)');
  assert.equal(rgbaString({ r: 10, g: 20, b: 30, a: 128 / 255 }), 'rgba(10, 20, 30, 0.502)');
});

test('rgbaString: fully transparent pixel (alpha 0) is preserved, not dropped', () => {
  assert.equal(rgbaString({ r: 1, g: 2, b: 3, a: 0 }), 'rgba(1, 2, 3, 0)');
});

test('hexString: opaque pixel is lowercase #rrggbb with no alpha byte', () => {
  assert.equal(hexString({ r: 255, g: 0, b: 0, a: 1 }), '#ff0000');
  assert.equal(hexString({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
});

test('hexString: alpha < 1 (a sampled semi-transparent pixel) appends the alpha byte', () => {
  assert.equal(hexString({ r: 255, g: 0, b: 0, a: 0.5 }), '#ff000080');
  assert.equal(hexString({ r: 18, g: 52, b: 86, a: 0 }), '#12345600');
});

test('hexString: single-digit channel bytes are zero-padded', () => {
  assert.equal(hexString({ r: 1, g: 2, b: 3, a: 1 }), '#010203');
});

test('rgbaString/hexString: every RGB channel value 0-255 formats without throwing', () => {
  for (const v of [0, 1, 15, 16, 127, 128, 254, 255]) {
    const c = { r: v, g: v, b: v, a: 1 };
    assert.doesNotThrow(() => rgbaString(c));
    assert.doesNotThrow(() => hexString(c));
    assert.match(hexString(c), /^#[0-9a-f]{6}$/);
  }
});
