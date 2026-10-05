/* ============================================================================
 * dither-studio - pure, DOM-free image logic. Palettes, median-cut quantization
 * (approach reused from video-gif), nearest-color mapping, Floyd-Steinberg /
 * Atkinson / ordered-Bayer dithering, area-average pixel-scaling, brightness /
 * contrast LUTs, palette export, and the synchronous helpers for a hand-rolled
 * indexed PNG-8 (chunks + CRC32; the DEFLATE pass itself is done in app.mjs via
 * the browser CompressionStream). No external library. No document / window /
 * localStorage.
 *
 * IMPORTANT: no template literals / backticks in this file - it is inlined
 * verbatim into app.mjs. Use ordinary string concatenation.
 * ==========================================================================*/

'use strict';

/* --------------------------------------------------------------------------
 * Color helpers + dithering engine — imported from the shared Node-importable
 * modules instead of local copies; the single-file build inlines their bodies
 * into the shipped index.html (stripping the `export`), so runtime stays
 * dependency-free. Re-exported via the export block below so tests/unit see them.
 * CtImageUtil.mjs: clampByte (used throughout), hexToRgb/rgbToHex/parsePalette.
 * CtDither.mjs: nearestColorIndex + the Floyd–Steinberg / Atkinson / Bayer engine
 * (CtDither.mjs imports clampByte from CtImageUtil.mjs; the build dedups it to one copy).
 * ------------------------------------------------------------------------ */

import { clampByte, hexToRgb, rgbToHex, parsePalette } from '../../../lib/utils/image/CtImageUtil.mjs';
import { nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer } from '../../../lib/utils/image/CtDither.mjs';

/* --------------------------------------------------------------------------
 * Fixed palettes. Each entry: { id, name, colors: [[r,g,b], ...] }.
 * ------------------------------------------------------------------------ */

function palFromHex(hexes) { return hexes.map(function (h) { return hexToRgb(h); }); }

var PALETTES = [
  { id: 'bw', name: '1-bit Black & White', colors: palFromHex(['#000000', '#ffffff']) },
  { id: 'gameboy', name: 'Game Boy (DMG)', colors: palFromHex(['#0f380f', '#306230', '#8bac0f', '#9bbc0f']) },
  { id: 'cga4', name: 'CGA (mode 4, hi)', colors: palFromHex(['#000000', '#55ffff', '#ff55ff', '#ffffff']) },
  { id: 'eink7', name: 'e-ink 7-color', colors: palFromHex(['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff8000']) },
  { id: 'ega16', name: 'EGA 16', colors: palFromHex([
    '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
    '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff']) },
  { id: 'c64', name: 'Commodore 64', colors: palFromHex([
    '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
    '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb']) },
  { id: 'pico8', name: 'PICO-8', colors: palFromHex([
    '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa']) },
  { id: 'nes', name: 'NES (2C02)', colors: palFromHex([
    '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
    '#503000', '#007800', '#006800', '#005800', '#004058', '#000000',
    '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
    '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#787878',
    '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
    '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8',
    '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
    '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8']) },
];

function paletteById(id) {
  for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
  return null;
}

function grayscalePalette(n) {
  var levels = n | 0;
  if (levels < 2) levels = 2;
  if (levels > 256) levels = 256;
  var out = [];
  for (var i = 0; i < levels; i++) {
    var v = Math.round(i * 255 / (levels - 1));
    out.push([v, v, v]);
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Median-cut quantization (approach reused from video-gif). Builds a de-duped
 * RGB histogram, repeatedly splits the widest-range box along its longest axis
 * at the count-weighted median, and collapses each box to its weighted average.
 * ------------------------------------------------------------------------ */

function clampColorCount(n) {
  n = Math.floor(n) || 0;
  if (n < 2) return 2;
  if (n > 256) return 256;
  return n;
}

function buildHistogram(rgba) {
  var counts = new Map();
  for (var i = 0; i < rgba.length; i += 4) {
    var key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  var colors = [];
  counts.forEach(function (count, key) {
    colors.push({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, count: count });
  });
  return colors;
}

function boxFromColors(colors) {
  var rMin = 255, gMin = 255, bMin = 255, rMax = 0, gMax = 0, bMax = 0, total = 0;
  for (var i = 0; i < colors.length; i++) {
    var c = colors[i];
    if (c.r < rMin) rMin = c.r; if (c.r > rMax) rMax = c.r;
    if (c.g < gMin) gMin = c.g; if (c.g > gMax) gMax = c.g;
    if (c.b < bMin) bMin = c.b; if (c.b > bMax) bMax = c.b;
    total += c.count;
  }
  return { colors: colors, rMin: rMin, gMin: gMin, bMin: bMin, rMax: rMax, gMax: gMax, bMax: bMax, total: total };
}

function boxLongestAxis(box) {
  var rRange = box.rMax - box.rMin, gRange = box.gMax - box.gMin, bRange = box.bMax - box.bMin;
  var max = Math.max(rRange, gRange, bRange);
  if (max === rRange) return 'r';
  if (max === gRange) return 'g';
  return 'b';
}

function boxMaxRange(box) {
  return Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin);
}

function splitBox(box) {
  var axis = boxLongestAxis(box);
  var sorted = box.colors.slice().sort(function (a, b) { return a[axis] - b[axis]; });
  var half = box.total / 2, acc = 0, cut = 1;
  for (var i = 0; i < sorted.length; i++) {
    acc += sorted[i].count;
    if (acc >= half) { cut = i + 1; break; }
  }
  if (cut < 1) cut = 1;
  if (cut >= sorted.length) cut = sorted.length - 1;
  return [boxFromColors(sorted.slice(0, cut)), boxFromColors(sorted.slice(cut))];
}

function boxAverage(box) {
  var r = 0, g = 0, b = 0, total = 0;
  for (var i = 0; i < box.colors.length; i++) {
    var c = box.colors[i];
    r += c.r * c.count; g += c.g * c.count; b += c.b * c.count; total += c.count;
  }
  if (total === 0) return [0, 0, 0];
  return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
}

function medianCut(rgba, n) {
  var limit = clampColorCount(n);
  var colors = buildHistogram(rgba);
  if (colors.length === 0) return [[0, 0, 0]];
  if (colors.length <= limit) return colors.map(function (c) { return [c.r, c.g, c.b]; });
  var boxes = [boxFromColors(colors)];
  while (boxes.length < limit) {
    var target = -1, bestRange = -1;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length < 2) continue;
      var range = boxMaxRange(boxes[i]);
      if (range > bestRange) { bestRange = range; target = i; }
    }
    if (target === -1) break;
    var parts = splitBox(boxes[target]);
    boxes.splice(target, 1, parts[0], parts[1]);
  }
  return boxes.map(boxAverage);
}

/* --------------------------------------------------------------------------
 * Nearest-color mapping. (nearestColorIndex is imported from CtDither.mjs above.)
 * ------------------------------------------------------------------------ */

function nearestColor(rgb, palette) {
  return palette[nearestColorIndex(rgb[0], rgb[1], rgb[2], palette)];
}

function mapNearest(rgba, palette) {
  var count = rgba.length >> 2;
  var out = new Uint8Array(count);
  var cache = new Map();
  for (var i = 0, p = 0; p < count; i += 4, p++) {
    var key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    var idx = cache.get(key);
    if (idx === undefined) { idx = nearestColorIndex(rgba[i], rgba[i + 1], rgba[i + 2], palette); cache.set(key, idx); }
    out[p] = idx;
  }
  return out;
}

function indicesToRgba(indices, palette) {
  var out = new Uint8ClampedArray(indices.length * 4);
  for (var p = 0, o = 0; p < indices.length; p++, o += 4) {
    var c = palette[indices[p]] || [0, 0, 0];
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Error-diffusion (Floyd–Steinberg / Atkinson) and ordered (Bayer) dithering
 * are imported from CtDither.mjs above (nearestColorIndex + the four algorithms).
 * ------------------------------------------------------------------------ */

/* --------------------------------------------------------------------------
 * Pixel scaling (area-average block downscale). factor >= 1.
 * Returns { data: Uint8ClampedArray (RGBA), width, height }.
 * ------------------------------------------------------------------------ */

function pixelScale(rgba, width, height, factor) {
  var f = factor | 0;
  if (f < 1) f = 1;
  if (f === 1) return { data: rgba, width: width, height: height };
  var outW = Math.max(1, Math.ceil(width / f));
  var outH = Math.max(1, Math.ceil(height / f));
  var out = new Uint8ClampedArray(outW * outH * 4);
  for (var oy = 0; oy < outH; oy++) {
    for (var ox = 0; ox < outW; ox++) {
      var r = 0, g = 0, b = 0, a = 0, n = 0;
      for (var dy = 0; dy < f; dy++) {
        var sy = oy * f + dy;
        if (sy >= height) break;
        for (var dx = 0; dx < f; dx++) {
          var sx = ox * f + dx;
          if (sx >= width) break;
          var si = (sy * width + sx) * 4;
          r += rgba[si]; g += rgba[si + 1]; b += rgba[si + 2]; a += rgba[si + 3]; n++;
        }
      }
      var di = (oy * outW + ox) * 4;
      out[di] = Math.round(r / n); out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n); out[di + 3] = Math.round(a / n);
    }
  }
  return { data: out, width: outW, height: outH };
}

/* --------------------------------------------------------------------------
 * Brightness / contrast. brightness and contrast in [-100, 100].
 * ------------------------------------------------------------------------ */

function buildBrightnessContrastLUT(brightness, contrast) {
  var b = (brightness || 0) * 255 / 100;      // additive, +-255
  var c = (contrast || 0);                     // -100..100
  var factor = (259 * (c + 255)) / (255 * (259 - c)); // classic contrast factor
  var lut = new Uint8ClampedArray(256);
  for (var i = 0; i < 256; i++) {
    lut[i] = clampByte(factor * (i - 128) + 128 + b);
  }
  return lut;
}

function applyLUT(rgba, lut) {
  var out = new Uint8ClampedArray(rgba.length);
  for (var i = 0; i < rgba.length; i += 4) {
    out[i] = lut[rgba[i]]; out[i + 1] = lut[rgba[i + 1]]; out[i + 2] = lut[rgba[i + 2]]; out[i + 3] = rgba[i + 3];
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Palette export.
 * ------------------------------------------------------------------------ */

function paletteToHexList(palette) {
  return palette.map(function (c) { return rgbToHex(c); }).join('\n');
}

function paletteToGpl(palette, name) {
  var lines = ['GIMP Palette', 'Name: ' + (name || 'Dither Studio'), 'Columns: 16', '#'];
  for (var i = 0; i < palette.length; i++) {
    var c = palette[i];
    var r = String(clampByte(c[0])), g = String(clampByte(c[1])), b = String(clampByte(c[2]));
    while (r.length < 3) r = ' ' + r;
    while (g.length < 3) g = ' ' + g;
    while (b.length < 3) b = ' ' + b;
    lines.push(r + ' ' + g + ' ' + b + '\t' + rgbToHex(c));
  }
  return lines.join('\n') + '\n';
}

/* --------------------------------------------------------------------------
 * Indexed PNG-8 - synchronous helpers. The DEFLATE of the filtered scanlines
 * is performed in app.mjs via CompressionStream; these build the surrounding
 * structure. color type 3 (indexed), bit depth 8.
 * ------------------------------------------------------------------------ */

// CRC-32 (ISO 3309 / PNG) — imported from the shared Node-importable module
// instead of a local copy; the single-file build inlines its body into the
// shipped index.html (stripping the `export`), so runtime stays dependency-free.
// Exported (see the export block below) so tests/unit see it.
import { crc32 } from '../../../lib/utils/CtByteUtil.mjs';

var PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function u32be(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }

function pngChunk(type, data) {
  var typeBytes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
  var body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  var crc = crc32(body);
  var out = new Uint8Array(4 + body.length + 4);
  out.set(u32be(data.length), 0);
  out.set(body, 4);
  out.set(u32be(crc), 4 + body.length);
  return out;
}

function buildIHDRIndexed(width, height) {
  var d = [];
  d = d.concat(u32be(width), u32be(height));
  d.push(8);   // bit depth
  d.push(3);   // color type: indexed
  d.push(0, 0, 0); // compression, filter, interlace
  return pngChunk('IHDR', new Uint8Array(d));
}

function buildPLTE(palette) {
  var data = new Uint8Array(palette.length * 3);
  for (var i = 0; i < palette.length; i++) {
    data[i * 3] = clampByte(palette[i][0]);
    data[i * 3 + 1] = clampByte(palette[i][1]);
    data[i * 3 + 2] = clampByte(palette[i][2]);
  }
  return pngChunk('PLTE', data);
}

// Prepend a filter-type byte (0 = none) to each scanline of index bytes.
function filterIndexRows(indices, width, height) {
  var out = new Uint8Array(height * (width + 1));
  for (var y = 0; y < height; y++) {
    out[y * (width + 1)] = 0;
    out.set(indices.subarray(y * width, y * width + width), y * (width + 1) + 1);
  }
  return out;
}

function concatBytes(list) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var out = new Uint8Array(total);
  var off = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
  return out;
}

// Assemble a complete indexed PNG from an already-DEFLATED (zlib) IDAT payload.
function assembleIndexedPng(width, height, palette, idatDeflated) {
  return concatBytes([
    PNG_SIGNATURE,
    buildIHDRIndexed(width, height),
    buildPLTE(palette),
    pngChunk('IDAT', idatDeflated),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

export {
  clampByte,
  hexToRgb,
  rgbToHex,
  parsePalette,
  PALETTES,
  paletteById,
  grayscalePalette,
  medianCut,
  buildHistogram,
  nearestColorIndex,
  nearestColor,
  mapNearest,
  indicesToRgba,
  floydSteinberg,
  atkinson,
  bayerMatrix,
  bayer,
  pixelScale,
  buildBrightnessContrastLUT,
  applyLUT,
  paletteToHexList,
  paletteToGpl,
  crc32,
  PNG_SIGNATURE,
  pngChunk,
  buildIHDRIndexed,
  buildPLTE,
  filterIndexRows,
  concatBytes,
  assembleIndexedPng,
};
