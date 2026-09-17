// rgbaString()/hexString()/parseColor() round-trips — the same canonical
// formatting contract as color-converter/color-picker, exercised here on
// color-designer's own copy of the helpers (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner } from './_helpers.mjs';

const { parseColor, rgbaString, hexString } = await loadColorDesigner();

const SAMPLES = [
  { r: 0, g: 0, b: 0, a: 1 },
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 18, g: 52, b: 86, a: 1 },
  { r: 255, g: 0, b: 128, a: 0.5 },
];

for (const color of SAMPLES) {
  test(`round-trip via rgbaString: ${JSON.stringify(color)}`, () => {
    assert.deepEqual(parseColor(rgbaString(color)), color);
  });

  test(`round-trip via hexString: ${JSON.stringify(color)}`, () => {
    const reparsed = parseColor(hexString(color));
    assert.equal(reparsed.r, color.r);
    assert.equal(reparsed.g, color.g);
    assert.equal(reparsed.b, color.b);
  });
}

test('parseColor: shorthand + alpha hex, invalid input', () => {
  assert.deepEqual(parseColor('#f00'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('#ff000080'), { r: 255, g: 0, b: 0, a: 128 / 255 });
  assert.equal(parseColor('garbage'), null);
  assert.equal(parseColor(''), null);
});
