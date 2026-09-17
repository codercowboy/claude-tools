// parse ∘ format round-trips: formatting a parsed color and re-parsing the
// formatted string must yield the same color (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorConverter } from './_helpers.mjs';

const { parseColor, rgbaString, hexString } = await loadColorConverter();

const SAMPLES = [
  { r: 0, g: 0, b: 0, a: 1 },
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 18, g: 52, b: 86, a: 1 },
  { r: 255, g: 0, b: 128, a: 0.5 },
  { r: 1, g: 2, b: 3, a: 0 },
  { r: 200, g: 100, b: 50, a: 0.333 },
];

for (const color of SAMPLES) {
  test(`round-trip via rgbaString: ${JSON.stringify(color)}`, () => {
    const reparsed = parseColor(rgbaString(color));
    assert.equal(reparsed.r, color.r);
    assert.equal(reparsed.g, color.g);
    assert.equal(reparsed.b, color.b);
    assert.ok(Math.abs(reparsed.a - color.a) < 0.01);
  });

  test(`round-trip via hexString: ${JSON.stringify(color)}`, () => {
    const reparsed = parseColor(hexString(color));
    assert.equal(reparsed.r, color.r);
    assert.equal(reparsed.g, color.g);
    assert.equal(reparsed.b, color.b);
    // hex alpha loses precision to 1/255 steps; hexString(...) itself already
    // rounds to the nearest byte, so re-parsing that byte must match exactly.
    const expectedA = color.a < 1 ? Math.round(color.a * 255) / 255 : 1;
    assert.ok(Math.abs(reparsed.a - expectedA) < 1e-9);
  });
}

test('hex -> rgba -> hex is stable (idempotent formatting)', () => {
  const c = parseColor('#1a2b3cff');
  assert.equal(hexString(parseColor(rgbaString(c))), hexString(c));
});
