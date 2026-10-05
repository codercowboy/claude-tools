// Unit tests for palettes, grayscale ramps and nearest-color mapping
// (source/logic.mjs). Pure, DOM-free — imported directly, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTES,
  paletteById,
  grayscalePalette,
  hexToRgb,
  rgbToHex,
  parsePalette,
  nearestColor,
  nearestColorIndex,
  mapNearest,
  indicesToRgba,
} from '../../source/logic.mjs';

test('every fixed preset is well-formed: id, name, and [0,255] RGB triples', () => {
  assert.ok(Array.isArray(PALETTES) && PALETTES.length > 0);
  const ids = new Set();
  for (const p of PALETTES) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    assert.ok(!ids.has(p.id), 'unique id: ' + p.id);
    ids.add(p.id);
    assert.ok(Array.isArray(p.colors) && p.colors.length >= 2);
    for (const c of p.colors) {
      assert.equal(c.length, 3);
      for (const ch of c) {
        assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, p.id + ' channel in range: ' + ch);
      }
    }
  }
});

test('known preset color counts match the documented palettes', () => {
  const counts = Object.fromEntries(PALETTES.map((p) => [p.id, p.colors.length]));
  assert.equal(counts.bw, 2);
  assert.equal(counts.gameboy, 4);
  assert.equal(counts.cga4, 4);
  assert.equal(counts.eink7, 7);
  assert.equal(counts.ega16, 16);
  assert.equal(counts.c64, 16);
  assert.equal(counts.pico8, 16);
  assert.equal(counts.nes, 55);
});

test('paletteById returns the matching entry or null', () => {
  assert.equal(paletteById('gameboy').name, 'Game Boy (DMG)');
  assert.equal(paletteById('nope'), null);
});

test('hexToRgb / rgbToHex round-trip and normalize case + shorthand', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
  assert.deepEqual(hexToRgb('FFF'), [255, 255, 255]);        // shorthand, no hash
  assert.equal(rgbToHex([255, 128, 0]), '#ff8000');          // lowercase out
  assert.equal(hexToRgb('not-a-color'), null);
  assert.equal(hexToRgb('#12'), null);
});

test('parsePalette accepts hex strings and RGB arrays, dropping junk', () => {
  const out = parsePalette(['#000000', [255, 255, 255], 'garbage', [300, -5, 10]]);
  assert.deepEqual(out, [[0, 0, 0], [255, 255, 255], [255, 0, 10]]);
});

test('grayscalePalette(N): endpoints are pure black and pure white, N entries, monotonic', () => {
  for (const n of [2, 3, 4, 16, 64]) {
    const ramp = grayscalePalette(n);
    assert.equal(ramp.length, n);
    assert.deepEqual(ramp[0], [0, 0, 0], 'black endpoint at N=' + n);
    assert.deepEqual(ramp[n - 1], [255, 255, 255], 'white endpoint at N=' + n);
    for (const c of ramp) assert.ok(c[0] === c[1] && c[1] === c[2], 'gray triple');
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(ramp[i][0] > ramp[i - 1][0], 'strictly increasing gray');
    }
  }
});

test('grayscalePalette clamps degenerate N to at least 2 levels', () => {
  assert.equal(grayscalePalette(1).length, 2);
  assert.equal(grayscalePalette(0).length, 2);
});

test('nearestColorIndex snaps to the correct palette index', () => {
  const pal = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
  assert.equal(nearestColorIndex(10, 10, 10, pal), 0);      // near black
  assert.equal(nearestColorIndex(250, 250, 250, pal), 1);   // near white
  assert.equal(nearestColorIndex(200, 20, 20, pal), 2);     // near red
  assert.equal(nearestColorIndex(20, 200, 20, pal), 3);     // near green
  assert.equal(nearestColorIndex(20, 20, 200, pal), 4);     // near blue
});

test('an exact palette color maps to its own index (distance 0)', () => {
  const pal = [[10, 20, 30], [200, 100, 50], [0, 0, 0]];
  assert.equal(nearestColorIndex(200, 100, 50, pal), 1);
  assert.deepEqual(nearestColor([10, 20, 30], pal), [10, 20, 30]);
});

test('mapNearest returns in-range indices, one per pixel, without dithering', () => {
  const pal = [[0, 0, 0], [255, 255, 255]];
  // 2x1 image: dark pixel, light pixel.
  const rgba = new Uint8ClampedArray([30, 30, 30, 255, 220, 220, 220, 255]);
  const idx = mapNearest(rgba, pal);
  assert.ok(idx instanceof Uint8Array);
  assert.equal(idx.length, 2);
  assert.equal(idx[0], 0);
  assert.equal(idx[1], 1);
});

test('indicesToRgba expands indices back through the palette with opaque alpha', () => {
  const pal = [[10, 20, 30], [40, 50, 60]];
  const rgba = indicesToRgba(new Uint8Array([0, 1]), pal);
  assert.deepEqual(Array.from(rgba), [10, 20, 30, 255, 40, 50, 60, 255]);
});
