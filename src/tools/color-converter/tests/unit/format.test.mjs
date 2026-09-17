// rgbaString()/hexString() formatters: docs/conventions.md § "Color
// formatting (tools that emit colors)" — rgba() always carries alpha
// (trimmed), hex is lowercase #rrggbb and only grows an alpha byte when
// alpha < 1 (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorConverter } from './_helpers.mjs';

const { rgbaString, hexString } = await loadColorConverter();

test('rgbaString: opaque color always includes alpha as "1"', () => {
  assert.equal(rgbaString({ r: 255, g: 0, b: 0, a: 1 }), 'rgba(255, 0, 0, 1)');
});

test('rgbaString: fractional alpha is trimmed to at most 3 decimal places', () => {
  assert.equal(rgbaString({ r: 0, g: 0, b: 0, a: 0.5 }), 'rgba(0, 0, 0, 0.5)');
  assert.equal(rgbaString({ r: 0, g: 0, b: 0, a: 1 / 3 }), 'rgba(0, 0, 0, 0.333)');
});

test('rgbaString: alpha of 0 is preserved, not dropped', () => {
  assert.equal(rgbaString({ r: 1, g: 2, b: 3, a: 0 }), 'rgba(1, 2, 3, 0)');
});

test('hexString: opaque color is lowercase #rrggbb with no alpha byte', () => {
  assert.equal(hexString({ r: 255, g: 0, b: 0, a: 1 }), '#ff0000');
  assert.equal(hexString({ r: 10, g: 200, b: 3, a: 1 }), '#0ac803');
});

test('hexString: alpha < 1 appends an #rrggbbaa byte', () => {
  assert.equal(hexString({ r: 255, g: 0, b: 0, a: 0.5 }), '#ff000080');
});

test('hexString: single-digit channel bytes are zero-padded', () => {
  assert.equal(hexString({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
  assert.equal(hexString({ r: 1, g: 2, b: 3, a: 1 }), '#010203');
});
