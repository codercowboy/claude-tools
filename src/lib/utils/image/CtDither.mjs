// ===== Begin jbcDither (ES module) =====
/*
 * dithering engine -> palette-index buffers (nearest / error diffusion / Bayer)
 * ---------------------------------------------------------------------------
 * The pure, DOM-free reduce-to-a-palette core an indexed-image tool needs. Every
 * function takes raw RGBA bytes + a palette ([[r,g,b], ...]) and returns a
 * Uint8Array of per-pixel palette indices — no canvas / document / window.
 *   nearestColorIndex(r,g,b,palette)          -> index of the closest palette entry
 *   floydSteinberg(rgba,w,h,palette)          -> Floyd–Steinberg error diffusion
 *   atkinson(rgba,w,h,palette)                -> Atkinson error diffusion (6/8)
 *   bayerMatrix(order)                        -> recursive ordered threshold matrix
 *   bayer(rgba,w,h,palette,opts)              -> ordered (Bayer) dithering
 *
 * clampByte (byte clamp used to snap the working buffer back into 0..255) is
 * imported from ./CtImageUtil.mjs so exactly one copy exists when a consumer inlines
 * both modules; the single-file build dedups it.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs these helpers imports this module directly (so `node --test` can load
 * it); the single-file build inlines this module body into the shipped
 * index.html — stripping the `export` — so the shipped tool stays
 * dependency-free and file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * No template literals here: a consumer may inline this module into a Web Worker
 * source *string*, where a stray backtick would terminate the string. Use
 * ordinary string concatenation.
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
import { clampByte } from './CtImageUtil.mjs';

function nearestColorIndex(r, g, b, palette) {
  var best = 0, bestDist = Infinity;
  for (var i = 0; i < palette.length; i++) {
    var p = palette[i];
    var dr = r - p[0], dg = g - p[1], db = b - p[2];
    var dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) { bestDist = dist; best = i; if (dist === 0) break; }
  }
  return best;
}

function toFloatRgb(rgba) {
  var count = rgba.length >> 2;
  var buf = new Float32Array(count * 3);
  for (var p = 0, i = 0; p < count; p++, i += 4) {
    buf[p * 3] = rgba[i]; buf[p * 3 + 1] = rgba[i + 1]; buf[p * 3 + 2] = rgba[i + 2];
  }
  return buf;
}

function floydSteinberg(rgba, width, height, palette) {
  var count = width * height;
  var out = new Uint8Array(count);
  var buf = toFloatRgb(rgba);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var p = y * width + x, o = p * 3;
      var r = clampByte(buf[o]), g = clampByte(buf[o + 1]), b = clampByte(buf[o + 2]);
      var idx = nearestColorIndex(r, g, b, palette);
      out[p] = idx;
      var chosen = palette[idx];
      var er = r - chosen[0], eg = g - chosen[1], eb = b - chosen[2];
      if (x + 1 < width) {
        var n = o + 3;
        buf[n] += er * 7 / 16; buf[n + 1] += eg * 7 / 16; buf[n + 2] += eb * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          var n2 = (p + width - 1) * 3;
          buf[n2] += er * 3 / 16; buf[n2 + 1] += eg * 3 / 16; buf[n2 + 2] += eb * 3 / 16;
        }
        var n3 = (p + width) * 3;
        buf[n3] += er * 5 / 16; buf[n3 + 1] += eg * 5 / 16; buf[n3 + 2] += eb * 5 / 16;
        if (x + 1 < width) {
          var n4 = (p + width + 1) * 3;
          buf[n4] += er * 1 / 16; buf[n4 + 1] += eg * 1 / 16; buf[n4 + 2] += eb * 1 / 16;
        }
      }
    }
  }
  return out;
}

function atkinson(rgba, width, height, palette) {
  var count = width * height;
  var out = new Uint8Array(count);
  var buf = toFloatRgb(rgba);
  // Atkinson spreads 6/8 of the error to six neighbours, 1/8 each.
  var offsets = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var p = y * width + x, o = p * 3;
      var r = clampByte(buf[o]), g = clampByte(buf[o + 1]), b = clampByte(buf[o + 2]);
      var idx = nearestColorIndex(r, g, b, palette);
      out[p] = idx;
      var chosen = palette[idx];
      var er = (r - chosen[0]) / 8, eg = (g - chosen[1]) / 8, eb = (b - chosen[2]) / 8;
      for (var k = 0; k < offsets.length; k++) {
        var nx = x + offsets[k][0], ny = y + offsets[k][1];
        if (nx < 0 || nx >= width || ny >= height) continue;
        var no = (ny * width + nx) * 3;
        buf[no] += er; buf[no + 1] += eg; buf[no + 2] += eb;
      }
    }
  }
  return out;
}

var BAYER_STRENGTH = 64; // documented general-purpose default (see DESIGN.md)

function bayerMatrix(order) {
  var o = order | 0;
  if (o <= 1) return [[0]];
  // Only powers of two are meaningful; snap 4 and 8 (the exposed choices).
  var base = [[0, 2], [3, 1]];
  var m = base;
  var size = 2;
  while (size < o) {
    var next = [];
    for (var y = 0; y < size * 2; y++) next.push(new Array(size * 2));
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        var v = m[yy][xx];
        next[yy][xx] = 4 * v + 0;
        next[yy][xx + size] = 4 * v + 2;
        next[yy + size][xx] = 4 * v + 3;
        next[yy + size][xx + size] = 4 * v + 1;
      }
    }
    m = next; size *= 2;
  }
  return m;
}

function bayer(rgba, width, height, palette, opts) {
  opts = opts || {};
  var order = opts.order || 4;
  var strength = opts.strength == null ? BAYER_STRENGTH : opts.strength;
  var matrix = bayerMatrix(order);
  var mSize = matrix.length;
  var denom = mSize * mSize;
  var count = width * height;
  var out = new Uint8Array(count);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var p = y * width + x, i = p * 4;
      var t = (matrix[y % mSize][x % mSize] + 0.5) / denom - 0.5; // [-0.5, 0.5)
      var off = t * strength;
      var r = clampByte(rgba[i] + off), g = clampByte(rgba[i + 1] + off), b = clampByte(rgba[i + 2] + off);
      out[p] = nearestColorIndex(r, g, b, palette);
    }
  }
  return out;
}

export { nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer };
// ===== end jbcDither (ES module) =====
