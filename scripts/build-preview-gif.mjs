#!/usr/bin/env node
/*
 * build-preview-gif.mjs — assemble docs/images/tools-preview.gif from every
 * tool's preview.png.
 *
 * Finds each src/tools/<tool>/preview.png (the 1200x630 preview cards), scales a
 * copy of each down to 600x315, and stitches them into one looping animated GIF
 * with one frame per tool, one second per frame.
 *
 * Vanilla Node, zero dependencies: PNG decode uses the built-in node:zlib
 * inflate; the GIF89a assembler (median-cut quantizer, Floyd-Steinberg dither,
 * variable-width LZW) is hand-rolled below — ported from the claude-tools
 * video-gif tool's encoder, adapted to write a per-frame LOCAL colour table so
 * each differently-coloured card keeps its own 256 colours.
 *
 * Wired into `npx ct build`. Run directly with: node scripts/build-preview-gif.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(SCRIPTS);
const TOOLS = join(REPO, 'src', 'tools');
const OUT_DIR = join(REPO, 'docs', 'images');
const OUT = join(OUT_DIR, 'tools-preview.gif');
const TARGET_W = 600;
const TARGET_H = 315;
const FRAME_DELAY_CS = 100; // centiseconds -> 1 second per frame

/* ---------------------------------------------------------------------------
 * PNG decode (8-bit, non-interlaced). Handles colour types 0/2/3/4/6.
 * ------------------------------------------------------------------------- */
function decodePng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('ascii', off, off + 4); off += 4;
    const data = buf.subarray(off, off + len); off += len;
    off += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error('unsupported PNG bit depth ' + bitDepth + ' (need 8)');
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported PNG colour type ' + colorType);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;             // bytes per pixel at 8-bit
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);  // zero row above the first
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const rb = raw[rp++];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rb; break;
        case 1: v = rb + a; break;
        case 2: v = rb + b; break;
        case 3: v = rb + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad PNG filter byte ' + filter);
      }
      row[x] = v & 0xff;
    }
    prev = row;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const si = p * bpp, di = p * 4;
    let r, g, b, a = 255;
    if (colorType === 2) { r = out[si]; g = out[si + 1]; b = out[si + 2]; }
    else if (colorType === 6) { r = out[si]; g = out[si + 1]; b = out[si + 2]; a = out[si + 3]; }
    else if (colorType === 0) { r = g = b = out[si]; }
    else if (colorType === 4) { r = g = b = out[si]; a = out[si + 1]; }
    else { const ix = out[si]; r = plte[ix * 3]; g = plte[ix * 3 + 1]; b = plte[ix * 3 + 2]; if (trns && ix < trns.length) a = trns[ix]; }
    rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b; rgba[di + 3] = a;
  }
  return { width, height, rgba };
}

// Area-average downscale of an RGBA buffer to (dw, dh). Exact 2x2 box for a
// 1200x630 -> 600x315 halving; averages the covered source region otherwise.
function downscale(rgba, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = Math.floor(dy * sh / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor((dy + 1) * sh / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = Math.floor(dx * sw / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor((dx + 1) * sw / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * sw + sx) * 4;
          r += rgba[si]; g += rgba[si + 1]; b += rgba[si + 2]; a += rgba[si + 3]; n++;
        }
      }
      const di = (dy * dw + dx) * 4;
      out[di] = Math.round(r / n); out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n); out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * GIF89a encoder — median-cut quantize + Floyd-Steinberg dither + LZW.
 * Ported verbatim from src/tools/video-gif/source/logic.mjs, with a local
 * colour table per frame added in gifEncodeLocal below.
 * ------------------------------------------------------------------------- */
function buildHistogram(rgba) {
  const counts = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const colors = [];
  for (const [key, count] of counts) colors.push({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, count });
  return colors;
}
function boxFromColors(colors) {
  let rMin = 255, gMin = 255, bMin = 255, rMax = 0, gMax = 0, bMax = 0, total = 0;
  for (const c of colors) {
    if (c.r < rMin) rMin = c.r; if (c.r > rMax) rMax = c.r;
    if (c.g < gMin) gMin = c.g; if (c.g > gMax) gMax = c.g;
    if (c.b < bMin) bMin = c.b; if (c.b > bMax) bMax = c.b;
    total += c.count;
  }
  return { colors, rMin, gMin, bMin, rMax, gMax, bMax, total };
}
function boxLongestAxis(box) {
  const r = box.rMax - box.rMin, g = box.gMax - box.gMin, b = box.bMax - box.bMin;
  const m = Math.max(r, g, b);
  return m === r ? 'r' : m === g ? 'g' : 'b';
}
function boxMaxRange(box) { return Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin); }
function splitBox(box) {
  const axis = boxLongestAxis(box);
  const sorted = box.colors.slice().sort((a, b) => a[axis] - b[axis]);
  const half = box.total / 2;
  let acc = 0, cut = 1;
  for (let i = 0; i < sorted.length; i++) { acc += sorted[i].count; if (acc >= half) { cut = i + 1; break; } }
  if (cut < 1) cut = 1;
  if (cut >= sorted.length) cut = sorted.length - 1;
  return [boxFromColors(sorted.slice(0, cut)), boxFromColors(sorted.slice(cut))];
}
function boxAverage(box) {
  let r = 0, g = 0, b = 0, total = 0;
  for (const c of box.colors) { r += c.r * c.count; g += c.g * c.count; b += c.b * c.count; total += c.count; }
  return total === 0 ? [0, 0, 0] : [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
}
function quantize(rgba, maxColors) {
  const limit = Math.max(2, Math.min(256, maxColors | 0));
  const colors = buildHistogram(rgba);
  if (colors.length === 0) return [[0, 0, 0]];
  if (colors.length <= limit) return colors.map((c) => [c.r, c.g, c.b]);
  let boxes = [boxFromColors(colors)];
  while (boxes.length < limit) {
    let target = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length < 2) continue;
      const range = boxMaxRange(boxes[i]);
      if (range > best) { best = range; target = i; }
    }
    if (target === -1) break;
    const parts = splitBox(boxes[target]);
    boxes.splice(target, 1, parts[0], parts[1]);
  }
  return boxes.map(boxAverage);
}
function nearestColorIndex(r, g, b, palette) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; if (d === 0) break; }
  }
  return best;
}
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function ditherFloydSteinberg(rgba, width, height, palette) {
  const count = width * height;
  const out = new Uint8Array(count);
  const buf = new Float32Array(count * 3);
  for (let p = 0, i = 0; p < count; p++, i += 4) { buf[p * 3] = rgba[i]; buf[p * 3 + 1] = rgba[i + 1]; buf[p * 3 + 2] = rgba[i + 2]; }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, o = p * 3;
      const r = clampByte(buf[o]), g = clampByte(buf[o + 1]), b = clampByte(buf[o + 2]);
      const idx = nearestColorIndex(r, g, b, palette);
      out[p] = idx;
      const chosen = palette[idx];
      const er = r - chosen[0], eg = g - chosen[1], eb = b - chosen[2];
      if (x + 1 < width) { const n = o + 3; buf[n] += er * 7 / 16; buf[n + 1] += eg * 7 / 16; buf[n + 2] += eb * 7 / 16; }
      if (y + 1 < height) {
        if (x > 0) { const n = (p + width - 1) * 3; buf[n] += er * 3 / 16; buf[n + 1] += eg * 3 / 16; buf[n + 2] += eb * 3 / 16; }
        const n2 = (p + width) * 3; buf[n2] += er * 5 / 16; buf[n2 + 1] += eg * 5 / 16; buf[n2 + 2] += eb * 5 / 16;
        if (x + 1 < width) { const n3 = (p + width + 1) * 3; buf[n3] += er * 1 / 16; buf[n3 + 1] += eg * 1 / 16; buf[n3 + 2] += eb * 1 / 16; }
      }
    }
  }
  return out;
}
function lzwEncode(indices, minCodeSize) {
  let min = minCodeSize | 0; if (min < 2) min = 2;
  const clearCode = 1 << min, eoiCode = clearCode + 1;
  const out = [];
  let cur = 0, curBits = 0, codeSize = min + 1;
  function emit(code) { cur |= code << curBits; curBits += codeSize; while (curBits >= 8) { out.push(cur & 0xff); cur >>>= 8; curBits -= 8; } }
  let dict = new Map(), nextCode = eoiCode + 1;
  function reset() { dict = new Map(); nextCode = eoiCode + 1; codeSize = min + 1; }
  reset(); emit(clearCode);
  if (indices.length === 0) { emit(eoiCode); if (curBits > 0) out.push(cur & 0xff); return new Uint8Array(out); }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, found = dict.get(key);
    if (found !== undefined) { prefix = found; }
    else {
      emit(prefix);
      if (nextCode === 4096) { emit(clearCode); reset(); }
      else { if (nextCode >= (1 << codeSize)) codeSize++; dict.set(key, nextCode); nextCode++; }
      prefix = k;
    }
  }
  emit(prefix); emit(eoiCode);
  if (curBits > 0) out.push(cur & 0xff);
  return new Uint8Array(out);
}
function u16le(v) { return [v & 0xff, (v >> 8) & 0xff]; }
function colorTableBytes(palette, paddedSize) {
  const bytes = [];
  for (let i = 0; i < paddedSize; i++) { const c = i < palette.length ? palette[i] : [0, 0, 0]; bytes.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff); }
  return bytes;
}
function graphicControlExtension(delayCs) { return [0x21, 0xf9, 0x04, 0x00].concat(u16le(Math.max(0, Math.min(0xffff, delayCs | 0))), [0x00, 0x00]); }
function netscapeExtension(loop) {
  return [0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01]
    .concat(u16le(Math.max(0, Math.min(0xffff, loop | 0))), [0x00]);
}
function toSubBlocks(bytes) {
  const out = [];
  let off = 0;
  while (off < bytes.length) { const n = Math.min(255, bytes.length - off); out.push(n); for (let i = 0; i < n; i++) out.push(bytes[off + i]); off += n; }
  out.push(0x00);
  return out;
}

// Assemble the animated GIF. Each frame is quantized to its own local colour
// table (no global table), so distinct cards keep their own colours.
function gifEncodeLocal(rgbaFrames, opts) {
  const width = opts.width | 0, height = opts.height | 0;
  const delayCs = opts.delayCs == null ? 100 : opts.delayCs;
  const loop = opts.loop == null ? 0 : opts.loop;
  const maxColors = opts.maxColors == null ? 256 : opts.maxColors;
  const dither = !!opts.dither;

  const bytes = [];
  const push = (arr) => { for (let i = 0; i < arr.length; i++) bytes.push(arr[i] & 0xff); };

  push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);   // "GIF89a"
  push(u16le(width)); push(u16le(height));
  push([0x00, 0x00, 0x00]);                      // packed: no global colour table; bg 0; aspect 0
  push(netscapeExtension(loop));                 // loop forever (0)

  for (const frame of rgbaFrames) {
    const palette = quantize(frame, maxColors);
    const indices = dither ? ditherFloydSteinberg(frame, width, height, palette) : (() => {
      const out = new Uint8Array(width * height);
      const cache = new Map();
      for (let p = 0, i = 0; p < out.length; p++, i += 4) {
        const key = (frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2];
        let idx = cache.get(key);
        if (idx === undefined) { idx = nearestColorIndex(frame[i], frame[i + 1], frame[i + 2], palette); cache.set(key, idx); }
        out[p] = idx;
      }
      return out;
    })();
    let sizeExp = 0;
    while ((1 << (sizeExp + 1)) < palette.length && sizeExp < 7) sizeExp++;
    const paddedSize = 1 << (sizeExp + 1);
    const minCodeSize = Math.max(2, sizeExp + 1);

    push(graphicControlExtension(delayCs));
    // Image Descriptor with the local-colour-table flag (0x80) + table size bits.
    push([0x2c].concat(u16le(0), u16le(0), u16le(width), u16le(height), [0x80 | (sizeExp & 0x07)]));
    push(colorTableBytes(palette, paddedSize));
    push([minCodeSize]);
    push(toSubBlocks(lzwEncode(indices, minCodeSize)));
  }

  push([0x3b]); // trailer
  return new Uint8Array(bytes);
}

/* ------------------------------------------------------------------------- */
function main() {
  if (!existsSync(TOOLS)) { console.error('build-preview-gif: no src/tools directory'); process.exit(1); }
  const tools = readdirSync(TOOLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(join(TOOLS, name, 'preview.png')))
    .sort();
  if (tools.length === 0) { console.error('build-preview-gif: no src/tools/*/preview.png files found'); process.exit(1); }

  const frames = [];
  for (const name of tools) {
    const png = decodePng(readFileSync(join(TOOLS, name, 'preview.png')));
    const scaled = png.width === TARGET_W && png.height === TARGET_H
      ? png.rgba
      : downscale(png.rgba, png.width, png.height, TARGET_W, TARGET_H);
    frames.push(scaled);
    console.log('  + ' + name + '/preview.png (' + png.width + 'x' + png.height + ' -> ' + TARGET_W + 'x' + TARGET_H + ')');
  }

  const gif = gifEncodeLocal(frames, { width: TARGET_W, height: TARGET_H, maxColors: 256, dither: true, delayCs: FRAME_DELAY_CS, loop: 0 });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, gif);
  console.log('build-preview-gif: wrote ' + frames.length + '-frame gif -> docs/images/tools-preview.gif (' +
    gif.length + ' bytes, ' + TARGET_W + 'x' + TARGET_H + ', ' + (FRAME_DELAY_CS / 100) + 's/frame, loops forever)');
}

main();
