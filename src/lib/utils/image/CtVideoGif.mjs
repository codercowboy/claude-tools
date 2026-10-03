// ===== Begin jbcVideoGif (ES module) =====
/*
 * jbcVideoGif — hand-rolled GIF89a encoder engine.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module: a median-cut colour quantizer,
 * nearest / Floyd–Steinberg palette mapping, GIF variable-width LZW, and a
 * hand-rolled GIF89a assembler (global palette, NETSCAPE2.0 looping, per-frame
 * delay). No external library, no document / window / localStorage — it is fed
 * plain RGBA pixel arrays and returns GIF bytes.
 *
 * IMPORTANT: this module must contain NO template literals / backticks. Its
 * text is inlined verbatim into a Web Worker source *string* in a consuming
 * tool (a Blob-URL module worker), and a stray backtick would terminate that
 * string. Use ordinary string concatenation.
 *
 * A tool whose pure, unit-tested source/logic.mjs encodes GIFs imports this
 * module directly (so node --test can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each export, once
 * per inline site — so the shipped tool stays dependency-free and
 * file://-openable. See the consuming repo build docs (import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

'use strict';

/* ---------------------------------------------------------------------------
 * Median-cut colour quantization.
 * Builds a de-duplicated RGB histogram, then repeatedly splits the colour box
 * with the widest channel range along its longest axis at the count-weighted
 * median, until maxColors boxes exist (or nothing can be split further). Each
 * box collapses to its count-weighted average colour.
 * ------------------------------------------------------------------------- */

function clampColorCount(n) {
  n = Math.floor(n) || 0;
  if (n < 2) return 2;
  if (n > 256) return 256;
  return n;
}

// rgba: Uint8ClampedArray / Uint8Array / Array of RGBA bytes. Alpha ignored
// (video frames are opaque). Returns [{ r, g, b, count }, ...].
function buildHistogram(rgba) {
  const counts = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const colors = [];
  for (const entry of counts) {
    const key = entry[0];
    colors.push({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, count: entry[1] });
  }
  return colors;
}

function boxFromColors(colors) {
  let rMin = 255, gMin = 255, bMin = 255, rMax = 0, gMax = 0, bMax = 0, total = 0;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    if (c.r < rMin) rMin = c.r; if (c.r > rMax) rMax = c.r;
    if (c.g < gMin) gMin = c.g; if (c.g > gMax) gMax = c.g;
    if (c.b < bMin) bMin = c.b; if (c.b > bMax) bMax = c.b;
    total += c.count;
  }
  return { colors, rMin, gMin, bMin, rMax, gMax, bMax, total };
}

function boxLongestAxis(box) {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;
  const max = Math.max(rRange, gRange, bRange);
  if (max === rRange) return 'r';
  if (max === gRange) return 'g';
  return 'b';
}

function boxMaxRange(box) {
  return Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin);
}

function splitBox(box) {
  const axis = boxLongestAxis(box);
  const sorted = box.colors.slice().sort(function (a, b) { return a[axis] - b[axis]; });
  const half = box.total / 2;
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].count;
    if (acc >= half) { cut = i + 1; break; }
  }
  if (cut < 1) cut = 1;
  if (cut >= sorted.length) cut = sorted.length - 1;
  return [boxFromColors(sorted.slice(0, cut)), boxFromColors(sorted.slice(cut))];
}

function boxAverage(box) {
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < box.colors.length; i++) {
    const c = box.colors[i];
    r += c.r * c.count;
    g += c.g * c.count;
    b += c.b * c.count;
    total += c.count;
  }
  if (total === 0) return [0, 0, 0];
  return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
}

function quantize(rgbaPixels, maxColors) {
  const limit = clampColorCount(maxColors);
  const colors = buildHistogram(rgbaPixels);
  if (colors.length === 0) return [[0, 0, 0]];
  if (colors.length <= limit) {
    return colors.map(function (c) { return [c.r, c.g, c.b]; });
  }
  let boxes = [boxFromColors(colors)];
  while (boxes.length < limit) {
    // Choose the splittable box (more than one colour) with the widest range.
    let target = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length < 2) continue;
      const range = boxMaxRange(boxes[i]);
      if (range > bestRange) { bestRange = range; target = i; }
    }
    if (target === -1) break; // nothing left to split
    const parts = splitBox(boxes[target]);
    boxes.splice(target, 1, parts[0], parts[1]);
  }
  return boxes.map(boxAverage);
}

/* ---------------------------------------------------------------------------
 * Palette mapping: nearest colour, and Floyd–Steinberg error diffusion.
 * ------------------------------------------------------------------------- */

function nearestColorIndex(r, g, b, palette) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) { bestDist = dist; best = i; if (dist === 0) break; }
  }
  return best;
}

function mapToPaletteIndices(rgba, palette) {
  const count = rgba.length >> 2;
  const out = new Uint8Array(count);
  const cache = new Map();
  for (let i = 0, p = 0; p < count; i += 4, p++) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearestColorIndex(rgba[i], rgba[i + 1], rgba[i + 2], palette);
      cache.set(key, idx);
    }
    out[p] = idx;
  }
  return out;
}

function clampByte(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

function ditherFloydSteinberg(rgba, width, height, palette) {
  const count = width * height;
  const out = new Uint8Array(count);
  // Working RGB buffer in floats so quantization error can be carried forward.
  const buf = new Float32Array(count * 3);
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    buf[p * 3] = rgba[i];
    buf[p * 3 + 1] = rgba[i + 1];
    buf[p * 3 + 2] = rgba[i + 2];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const o = p * 3;
      const r = clampByte(buf[o]);
      const g = clampByte(buf[o + 1]);
      const b = clampByte(buf[o + 2]);
      const idx = nearestColorIndex(r, g, b, palette);
      out[p] = idx;
      const chosen = palette[idx];
      const er = r - chosen[0];
      const eg = g - chosen[1];
      const eb = b - chosen[2];
      // Distribute the error to the not-yet-visited neighbours.
      if (x + 1 < width) {
        const n = o + 3;
        buf[n] += er * 7 / 16; buf[n + 1] += eg * 7 / 16; buf[n + 2] += eb * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          const n = (p + width - 1) * 3;
          buf[n] += er * 3 / 16; buf[n + 1] += eg * 3 / 16; buf[n + 2] += eb * 3 / 16;
        }
        const n2 = (p + width) * 3;
        buf[n2] += er * 5 / 16; buf[n2 + 1] += eg * 5 / 16; buf[n2 + 2] += eb * 5 / 16;
        if (x + 1 < width) {
          const n3 = (p + width + 1) * 3;
          buf[n3] += er * 1 / 16; buf[n3 + 1] += eg * 1 / 16; buf[n3 + 2] += eb * 1 / 16;
        }
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * GIF variable-width LZW. Emits the raw code stream (LSB-first bit packing);
 * the caller frames it into <=255-byte sub-blocks. minCodeSize is clamped to a
 * minimum of 2 as the GIF spec requires.
 * ------------------------------------------------------------------------- */

function lzwEncode(indices, minCodeSize) {
  let min = minCodeSize | 0;
  if (min < 2) min = 2;
  const clearCode = 1 << min;
  const eoiCode = clearCode + 1;

  const out = [];
  let cur = 0;
  let curBits = 0;
  let codeSize = min + 1;

  function emit(code) {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      curBits -= 8;
    }
  }

  let dict = new Map();
  let nextCode = eoiCode + 1;
  function resetDict() {
    dict = new Map();
    nextCode = eoiCode + 1;
    codeSize = min + 1;
  }

  resetDict();
  emit(clearCode);

  if (indices.length === 0) {
    emit(eoiCode);
    if (curBits > 0) { out.push(cur & 0xff); cur = 0; curBits = 0; }
    return new Uint8Array(out);
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
    } else {
      emit(prefix);
      if (nextCode === 4096) {
        emit(clearCode);
        resetDict();
      } else {
        if (nextCode >= (1 << codeSize)) codeSize++;
        dict.set(key, nextCode);
        nextCode++;
      }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoiCode);
  if (curBits > 0) { out.push(cur & 0xff); cur = 0; curBits = 0; }
  return new Uint8Array(out);
}

/* ---------------------------------------------------------------------------
 * GIF89a block writers. Each returns a plain array of byte values.
 * ------------------------------------------------------------------------- */

function u16le(v) { return [v & 0xff, (v >> 8) & 0xff]; }

// Colour table padded to paddedSize entries (a power of two), each RGB triple.
function buildColorTable(palette, paddedSize) {
  const bytes = [];
  for (let i = 0; i < paddedSize; i++) {
    const c = i < palette.length ? palette[i] : [0, 0, 0];
    bytes.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
  }
  return bytes;
}

// Graphic Control Extension: sets the per-frame delay (centiseconds). No
// transparency, disposal method 0 (unspecified) — every frame is full-size and
// fully overwrites the previous one. Optional (delaysCs, index): when delaysCs is
// an array holding a value at index, that per-frame delay wins over the scalar.
function buildGraphicControlExtension(delayCs, delaysCs, index) {
  const per = Array.isArray(delaysCs) && index != null ? delaysCs[index] : null;
  const d = Math.max(0, Math.min(0xffff, (per == null ? delayCs : per) | 0));
  return [0x21, 0xf9, 0x04, 0x00].concat(u16le(d), [0x00, 0x00]);
}

// Image Descriptor at (0,0), full frame, no local colour table / interlace.
function buildImageDescriptor(width, height) {
  return [0x2c].concat(u16le(0), u16le(0), u16le(width), u16le(height), [0x00]);
}

// NETSCAPE2.0 Application Extension carrying the loop count (0 = infinite).
function buildNetscapeExtension(loop) {
  const l = Math.max(0, Math.min(0xffff, loop | 0));
  return [0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // NETSCAPE2.0
    0x03, 0x01].concat(u16le(l), [0x00]);
}

// Frames the LZW code stream into <=255-byte sub-blocks, terminated by 0x00.
function toSubBlocks(bytes) {
  const out = [];
  let off = 0;
  while (off < bytes.length) {
    const n = Math.min(255, bytes.length - off);
    out.push(n);
    for (let i = 0; i < n; i++) out.push(bytes[off + i]);
    off += n;
  }
  out.push(0x00);
  return out;
}

/* ---------------------------------------------------------------------------
 * GIF89a assembler. "frames" is an array of per-pixel palette-index arrays
 * (Uint8Array | number[]), each width*height long. A single global palette is
 * shared by all frames.
 * ------------------------------------------------------------------------- */

function gif89aEncode(frames, options) {
  const opts = options || {};
  const width = opts.width | 0;
  const height = opts.height | 0;
  const palette = opts.palette || [[0, 0, 0]];
  const delayCs = opts.delayCs == null ? 10 : opts.delayCs;
  const delaysCs = opts.delaysCs; // optional per-frame delays (falls back to delayCs)
  const loop = opts.loop == null ? 0 : opts.loop;

  // Smallest power-of-two table (2..256) that holds the palette.
  let sizeExp = 1; // table size field; 2^(sizeExp+1) entries
  while ((1 << (sizeExp + 1)) < palette.length && sizeExp < 7) sizeExp++;
  const paddedSize = 1 << (sizeExp + 1);
  const minCodeSize = Math.max(2, sizeExp + 1);

  const bytes = [];
  function push(arr) { for (let i = 0; i < arr.length; i++) bytes.push(arr[i] & 0xff); }

  // Header.
  push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"

  // Logical Screen Descriptor. Packed: global colour table flag (1), colour
  // resolution (sizeExp), sort flag (0), size of GCT (sizeExp).
  const packed = 0x80 | (sizeExp << 4) | sizeExp;
  push(u16le(width));
  push(u16le(height));
  push([packed, 0x00, 0x00]); // background index 0, pixel aspect ratio 0

  // Global Colour Table.
  push(buildColorTable(palette, paddedSize));

  // Looping.
  push(buildNetscapeExtension(loop));

  // Frames.
  for (let f = 0; f < frames.length; f++) {
    push(buildGraphicControlExtension(delayCs, delaysCs, f));
    push(buildImageDescriptor(width, height));
    push([minCodeSize]);
    push(toSubBlocks(lzwEncode(frames[f], minCodeSize)));
  }

  push([0x3b]); // trailer
  return new Uint8Array(bytes);
}

/* ---------------------------------------------------------------------------
 * Full pipeline used by the worker (and mirrored by the main-thread fallback).
 * Samples pixels across all frames for the shared palette, maps/dithers each
 * frame, then assembles the GIF. onProgress({ phase, frame, total }).
 * ------------------------------------------------------------------------- */

// Concatenates a bounded sample of RGBA pixels from all frames (stride chosen so
// the total stays under "cap" pixels) — keeps median-cut fast on big inputs.
function samplePixels(frames, cap) {
  const maxPixels = cap || 50000;
  let totalPixels = 0;
  for (let i = 0; i < frames.length; i++) totalPixels += frames[i].length >> 2;
  const stride = Math.max(1, Math.ceil(totalPixels / maxPixels));
  const out = [];
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const px = frame.length >> 2;
    for (let p = 0; p < px; p += stride) {
      const i = p << 2;
      out.push(frame[i], frame[i + 1], frame[i + 2], 255);
    }
  }
  return new Uint8Array(out);
}

function encodeFramesToGif(rgbaFrames, opts, onProgress) {
  const options = opts || {};
  const width = options.width | 0;
  const height = options.height | 0;
  const maxColors = clampColorCount(options.maxColors == null ? 256 : options.maxColors);
  const dither = !!options.dither;
  const delayCs = options.delayCs == null ? 10 : options.delayCs;
  const delaysCs = options.delaysCs; // optional per-frame delays
  const loop = options.loop == null ? 0 : options.loop;
  const total = rgbaFrames.length;

  if (onProgress) onProgress({ phase: 'quantize', frame: 0, total: total });
  const sample = samplePixels(rgbaFrames, options.sampleCap || 50000);
  const palette = quantize(sample, maxColors);

  const indexed = [];
  for (let i = 0; i < total; i++) {
    indexed.push(dither
      ? ditherFloydSteinberg(rgbaFrames[i], width, height, palette)
      : mapToPaletteIndices(rgbaFrames[i], palette));
    if (onProgress) onProgress({ phase: 'map', frame: i + 1, total: total });
  }

  if (onProgress) onProgress({ phase: 'encode', frame: total, total: total });
  const gif = gif89aEncode(indexed, { width: width, height: height, palette: palette, delayCs: delayCs, delaysCs: delaysCs, loop: loop });
  return { gif: gif, palette: palette };
}

/* ---------------------------------------------------------------------------
 * GIF decoder. lzwDecode inflates one image's (already de-sub-blocked) LZW byte
 * stream to palette indices; gifDecode parses a whole GIF87a/89a file and
 * composites every frame onto the logical screen honouring disposal methods
 * 0-3, transparency, image sub-rects, local colour tables and interlace.
 * ------------------------------------------------------------------------- */

// Decodes a raw LZW stream (no sub-block framing). expectedLength (optional)
// stops early / sizes the result; output is a Uint8Array of palette indices.
function lzwDecode(bytes, minCodeSize, expectedLength) {
  const min = Math.max(2, minCodeSize | 0);
  const clearCode = 1 << min;
  const eoiCode = clearCode + 1;
  const cap = expectedLength == null ? Infinity : expectedLength;
  // Dictionary as prefix/suffix chains (entry = prefix[code] + suffix[code]).
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const lengths = new Uint16Array(4096);
  let out = new Uint8Array(expectedLength == null ? 4096 : expectedLength);
  let outLen = 0;
  function emit(code) {
    const len = lengths[code];
    if (outLen + len > out.length) {
      const bigger = new Uint8Array(Math.max(out.length * 2, outLen + len));
      bigger.set(out); out = bigger;
    }
    let c = code;
    for (let i = len - 1; i >= 0; i--) { out[outLen + i] = suffix[c]; c = prefix[c]; }
    const first = out[outLen];
    outLen += len;
    return first;
  }
  for (let i = 0; i < clearCode; i++) { suffix[i] = i; prefix[i] = -1; lengths[i] = 1; }

  let codeSize = min + 1;
  let next = eoiCode + 1;
  let prev = -1;
  let acc = 0, accBits = 0, pos = 0;
  while (outLen < cap) {
    while (accBits < codeSize && pos < bytes.length) { acc |= bytes[pos++] << accBits; accBits += 8; }
    if (accBits < codeSize) break; // truncated stream
    const code = acc & ((1 << codeSize) - 1);
    acc >>>= codeSize; accBits -= codeSize;
    if (code === clearCode) { codeSize = min + 1; next = eoiCode + 1; prev = -1; continue; }
    if (code === eoiCode) break;
    if (prev === -1) {
      if (code >= clearCode) throw new Error('lzwDecode: bad first code ' + code);
      emit(code); prev = code; continue;
    }
    let first;
    if (code < next) {
      first = emit(code);
    } else if (code === next) { // KwKwK
      // entry = prev + first(prev); synthesise via the not-yet-added slot
      if (next >= 4096) throw new Error('lzwDecode: dictionary overflow');
      let c = prev; while (prefix[c] !== -1) c = prefix[c];
      prefix[next] = prev; suffix[next] = suffix[c]; lengths[next] = lengths[prev] + 1;
      first = emit(next);
      next++;
      if (next >= (1 << codeSize) && codeSize < 12) codeSize++;
      prev = code;
      continue;
    } else {
      throw new Error('lzwDecode: invalid code ' + code + ' (next=' + next + ')');
    }
    if (next < 4096) {
      prefix[next] = prev; suffix[next] = first; lengths[next] = lengths[prev] + 1;
      next++;
      if (next >= (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = code;
  }
  const result = out.slice(0, expectedLength == null ? outLen : Math.min(outLen, expectedLength));
  if (expectedLength != null && result.length < expectedLength) {
    const padded = new Uint8Array(expectedLength); padded.set(result); return padded;
  }
  return result;
}

function gifReadSubBlocks(bytes, off) {
  const chunks = [];
  let total = 0;
  for (;;) {
    if (off >= bytes.length) break;
    const n = bytes[off++];
    if (n === 0) break;
    chunks.push(bytes.subarray(off, off + n));
    total += n; off += n;
  }
  const data = new Uint8Array(total);
  let p = 0;
  for (let i = 0; i < chunks.length; i++) { data.set(chunks[i], p); p += chunks[i].length; }
  return { data: data, next: off };
}

// Parses a GIF into { width, height, palette (global, [r,g,b][] | null),
// backgroundIndex, loop (null when no NETSCAPE ext), frames }. Each frame:
// { delayCs, disposal, transparentIndex (-1 none), left, top, width, height,
//   interlaced, palette (local | null), indices (Uint8Array, sub-rect,
//   de-interlaced), rgba (Uint8ClampedArray, full-screen COMPOSITED snapshot) }.
// Undecoded/transparent canvas pixels are transparent black (0,0,0,0).
function gifDecode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const u16 = (o) => bytes[o] | (bytes[o + 1] << 8);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (magic !== 'GIF89a' && magic !== 'GIF87a') throw new Error('gifDecode: bad magic ' + JSON.stringify(magic));
  const width = u16(6), height = u16(8);
  const packed = bytes[10];
  const backgroundIndex = bytes[11];
  let off = 13;
  let palette = null;
  function readTable(size) {
    const t = [];
    for (let i = 0; i < size; i++) { t.push([bytes[off], bytes[off + 1], bytes[off + 2]]); off += 3; }
    return t;
  }
  if (packed & 0x80) palette = readTable(1 << ((packed & 7) + 1));

  let loop = null;
  const frames = [];
  let gce = null;
  let canvas = new Uint8ClampedArray(width * height * 4);
  let prevCanvas = null;   // snapshot for disposal 3
  let prevFrame = null;    // previous frame's rect + disposal, applied before drawing the next

  for (;;) {
    if (off >= bytes.length) break; // tolerate a missing trailer
    const marker = bytes[off++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[off++];
      if (label === 0xf9) {
        off++; // block size (4)
        const flags = bytes[off++];
        const delay = u16(off); off += 2;
        const tIdx = bytes[off++];
        off++; // terminator
        gce = { disposal: (flags >> 2) & 7, delayCs: delay, transparentIndex: (flags & 1) ? tIdx : -1 };
      } else if (label === 0xff) {
        const size = bytes[off++];
        const app = String.fromCharCode.apply(null, Array.from(bytes.subarray(off, off + size)));
        off += size;
        const sub = gifReadSubBlocks(bytes, off);
        if (app === 'NETSCAPE2.0' && sub.data.length >= 3 && sub.data[0] === 1) loop = sub.data[1] | (sub.data[2] << 8);
        off = sub.next;
      } else {
        off = gifReadSubBlocks(bytes, off).next;
      }
      continue;
    }
    if (marker !== 0x2c) throw new Error('gifDecode: unexpected block 0x' + marker.toString(16) + ' at ' + (off - 1));

    const left = u16(off), top = u16(off + 2), w = u16(off + 4), h = u16(off + 6);
    const lflags = bytes[off + 8];
    off += 9;
    let local = null;
    if (lflags & 0x80) local = readTable(1 << ((lflags & 7) + 1));
    const interlaced = (lflags & 0x40) !== 0;
    const minCodeSize = bytes[off++];
    const sub = gifReadSubBlocks(bytes, off);
    off = sub.next;
    let indices = lzwDecode(sub.data, minCodeSize, w * h);

    if (interlaced) {
      const rows = new Uint8Array(w * h);
      const passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
      let src = 0;
      for (let p = 0; p < passes.length; p++) {
        for (let y = passes[p][0]; y < h; y += passes[p][1]) {
          rows.set(indices.subarray(src * w, src * w + w), y * w); src++;
        }
      }
      indices = rows;
    }

    // Apply the PREVIOUS frame's disposal before drawing this one.
    if (prevFrame) {
      if (prevFrame.disposal === 2) {
        for (let y = 0; y < prevFrame.h; y++) {
          const cy = prevFrame.top + y;
          if (cy >= height) break;
          for (let x = 0; x < prevFrame.w; x++) {
            const cx = prevFrame.left + x;
            if (cx >= width) break;
            const o = (cy * width + cx) * 4;
            canvas[o] = canvas[o + 1] = canvas[o + 2] = canvas[o + 3] = 0;
          }
        }
      } else if (prevFrame.disposal === 3 && prevCanvas) {
        canvas = prevCanvas;
      }
    }
    const disposal = gce ? gce.disposal : 0;
    if (disposal === 3) prevCanvas = new Uint8ClampedArray(canvas); // state before drawing

    const table = local || palette || [];
    const tIdx = gce ? gce.transparentIndex : -1;
    for (let y = 0; y < h; y++) {
      const cy = top + y;
      if (cy >= height) break;
      for (let x = 0; x < w; x++) {
        const cx = left + x;
        if (cx >= width) break;
        const idx = indices[y * w + x];
        if (idx === tIdx) continue;
        const c = table[idx] || [0, 0, 0];
        const o = (cy * width + cx) * 4;
        canvas[o] = c[0]; canvas[o + 1] = c[1]; canvas[o + 2] = c[2]; canvas[o + 3] = 255;
      }
    }

    frames.push({
      delayCs: gce ? gce.delayCs : 0,
      disposal: disposal,
      transparentIndex: tIdx,
      left: left, top: top, width: w, height: h,
      interlaced: interlaced,
      palette: local,
      indices: indices,
      rgba: new Uint8ClampedArray(canvas),
    });
    prevFrame = { left: left, top: top, w: w, h: h, disposal: disposal };
    gce = null;
  }
  return { width: width, height: height, palette: palette, backgroundIndex: backgroundIndex, loop: loop, frames: frames };
}

export {
  quantize,
  buildHistogram,
  nearestColorIndex,
  mapToPaletteIndices,
  ditherFloydSteinberg,
  lzwEncode,
  buildColorTable,
  buildGraphicControlExtension,
  buildImageDescriptor,
  buildNetscapeExtension,
  toSubBlocks,
  gif89aEncode,
  samplePixels,
  encodeFramesToGif,
  lzwDecode,
  gifDecode,
};
