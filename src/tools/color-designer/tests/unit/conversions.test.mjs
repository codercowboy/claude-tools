// Pure color-conversion helpers: rgbToHsl/hslToRgb, rgbToHsv/hsvToRgb,
// relLuminance/contrastRatio, circularHueDistance, and the shared
// parseColor/rgbaString/hexString formatters (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner } from './_helpers.mjs';

const {
  rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb,
  relLuminance, contrastRatio, circularHueDistance,
  parseColor, rgbaString, hexString, clampChannel, clampAlpha,
} = await loadColorDesigner();

function closeTo(a, b, eps, msg) {
  assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${a} ~= ${b} (eps ${eps})`);
}

test('rgbToHsl: primary red/green/blue land on the expected hue', () => {
  closeTo(rgbToHsl({ r: 255, g: 0, b: 0 }).h, 0, 0.01);
  closeTo(rgbToHsl({ r: 0, g: 255, b: 0 }).h, 120, 0.01);
  closeTo(rgbToHsl({ r: 0, g: 0, b: 255 }).h, 240, 0.01);
});

test('rgbToHsl: pure white/black/gray have s=0 (achromatic)', () => {
  assert.equal(rgbToHsl({ r: 255, g: 255, b: 255 }).s, 0);
  assert.equal(rgbToHsl({ r: 0, g: 0, b: 0 }).s, 0);
  assert.equal(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0);
});

test('rgbToHsl <-> hslToRgb: round-trips for a range of colors', () => {
  const samples = [
    { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 },
    { r: 18, g: 200, b: 91 }, { r: 128, g: 128, b: 128 }, { r: 10, g: 10, b: 200 },
    { r: 255, g: 255, b: 0 }, { r: 0, g: 255, b: 255 }, { r: 255, g: 0, b: 255 },
  ];
  for (const rgb of samples) {
    const back = hslToRgb(rgbToHsl(rgb));
    closeTo(back.r, rgb.r, 1, `r for ${JSON.stringify(rgb)}`);
    closeTo(back.g, rgb.g, 1, `g for ${JSON.stringify(rgb)}`);
    closeTo(back.b, rgb.b, 1, `b for ${JSON.stringify(rgb)}`);
  }
});

test('rgbToHsv <-> hsvToRgb: round-trips for a range of colors', () => {
  const samples = [
    { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 },
    { r: 50, g: 120, b: 200 }, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 },
  ];
  for (const rgb of samples) {
    const back = hsvToRgb(rgbToHsv(rgb));
    closeTo(back.r, rgb.r, 1, `r for ${JSON.stringify(rgb)}`);
    closeTo(back.g, rgb.g, 1, `g for ${JSON.stringify(rgb)}`);
    closeTo(back.b, rgb.b, 1, `b for ${JSON.stringify(rgb)}`);
  }
});

test('rgbToHsv: value is the max channel, saturation 0 for black', () => {
  assert.equal(rgbToHsv({ r: 0, g: 0, b: 0 }).s, 0);
  closeTo(rgbToHsv({ r: 51, g: 20, b: 10 }).v, 51 / 255, 1e-9);
});

test('relLuminance: white > gray > black', () => {
  const black = relLuminance({ r: 0, g: 0, b: 0 });
  const gray = relLuminance({ r: 128, g: 128, b: 128 });
  const white = relLuminance({ r: 255, g: 255, b: 255 });
  assert.ok(black < gray);
  assert.ok(gray < white);
  assert.equal(black, 0);
  closeTo(white, 1, 1e-9);
});

test('contrastRatio: black on white is the maximum, 21:1', () => {
  closeTo(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21, 0.01);
});

test('contrastRatio: identical colors have ratio 1 and is symmetric', () => {
  const c = { r: 100, g: 150, b: 200 };
  closeTo(contrastRatio(c, c), 1, 1e-9);
  const a = { r: 255, g: 0, b: 0 };
  const b = { r: 0, g: 255, b: 0 };
  closeTo(contrastRatio(a, b), contrastRatio(b, a), 1e-9);
});

test('circularHueDistance: shortest angular distance, wraps around 360', () => {
  assert.equal(circularHueDistance(10, 20), 10);
  assert.equal(circularHueDistance(350, 10), 20); // wraps the short way
  assert.equal(circularHueDistance(0, 180), 180); // max possible distance
  assert.equal(circularHueDistance(0, 0), 0);
});

test('parseColor/rgbaString/hexString: same canonical behavior as color-converter', () => {
  assert.deepEqual(parseColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 128, 255, 0.5)'), { r: 0, g: 128, b: 255, a: 0.5 });
  assert.equal(parseColor('not a color'), null);
  assert.equal(rgbaString({ r: 1, g: 2, b: 3, a: 1 }), 'rgba(1, 2, 3, 1)');
  assert.equal(hexString({ r: 255, g: 255, b: 255, a: 1 }), '#ffffff');
  assert.equal(hexString({ r: 255, g: 0, b: 0, a: 0.5 }), '#ff000080');
  assert.equal(clampChannel(999), 255);
  assert.equal(clampAlpha(-5), 0);
});
