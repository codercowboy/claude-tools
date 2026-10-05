// =====================================================================
// Batch Watermark - pure logic (DOM-free, unit-tested)
//
// layoutWatermark({imgW,imgH,wmW,wmH,anchor,offsetPct,marginPct,scalePct,rotation,tile,gapPct})
//   -> [{x,y,w,h,rot}]   (x,y = top-left of the UNROTATED box; rotation is degrees about the
//   box centre.) Every size/offset/margin/gap is a percentage of the TARGET image's SHORT side,
//   so one setting looks identical on an 800 px and a 6000 px photo.
//
// Font helpers (CURATED_FONTS / resolveFontFamily / canvasFontString / strokeForSize) follow
// meme-maker's pattern but are a LOCAL copy trimmed to a watermark-appropriate list (Arial default).
// textBlockMetrics() lays out multi-line text with an injected `measure` so it stays DOM-free.
// Output naming + format mapping + zip assembly: the STORE-only zip writer is the SHARED
// storeZip from the shared lib (imported, not copied).
//
// app.mjs inlines this file at build time; the jbc imports below are flattened in once and
// the `export`s are stripped. Every CtUtil / CtImageUtil / CtByteUtil / CtZipUtil name
// app.mjs needs is imported HERE, and app.mjs redeclares nothing.
// =====================================================================
import { el, clampInt, num, clamp, slugify, debounce, persistState, downloadBlob, setupHiDPICanvas, onceFlag } from '../../../lib/utils/CtUtil.mjs';
import { formatBytes } from '../../../lib/utils/CtByteUtil.mjs';
import { storeZip } from '../../../lib/utils/CtZipUtil.mjs';
import { loadImageFile, canvasToBlob, FORMATS, mimeForFormat, formatSupportsQuality, makeImageLimitChecker, MAX_DIMENSION, hexToRgb, rgbToHex } from '../../../lib/utils/image/CtImageUtil.mjs';

export const MAX_TILES = 2000;
export const REF_FONT_PX = 100;
export const LINE_HEIGHT = 1.15;
export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export const DEFAULTS = {
  mode: 'text', text: 'Watermark', fontFamily: 'Arial', customFont: '', fill: '#ffffff',
  strokeLevel: 0, strokeColor: '#000000', shadow: true,
  anchor: 'br', offsetX: 0, offsetY: 0, margin: 3, scale: 30, opacity: 70, rotation: 0,
  tile: false, gap: 12, format: 'source', quality: 92,
};

export const checkImageLimits = makeImageLimitChecker({ action: 'watermarking', dimSep: 'x' });

// ---- fonts (local copy of the meme-maker pattern) ---------------------
export const CURATED_FONTS = [
  { name: 'Arial',           stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Helvetica',       stack: 'Helvetica, Arial, sans-serif' },
  { name: 'Georgia',         stack: 'Georgia, "Times New Roman", serif' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { name: 'Verdana',         stack: 'Verdana, Geneva, sans-serif' },
  { name: 'Trebuchet MS',    stack: '"Trebuchet MS", Tahoma, sans-serif' },
  { name: 'Courier New',     stack: '"Courier New", Courier, monospace' },
  { name: 'Arial Black',     stack: '"Arial Black", Gadget, sans-serif' },
  { name: 'Impact',          stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
];
const CURATED_BY_NAME = new Map(CURATED_FONTS.map((f) => [f.name, f]));

// A custom family wins (quoted when it has spaces/quotes), then the curated pick, else Arial.
export function resolveFontFamily(opts) {
  const custom = (opts && opts.customFont ? String(opts.customFont) : '').trim();
  if (custom) {
    const quoted = /[\s"']/.test(custom) ? '"' + custom.replace(/"/g, '') + '"' : custom;
    return quoted + ', Arial, sans-serif';
  }
  const pick = CURATED_BY_NAME.get(opts && opts.fontFamily);
  return (pick || CURATED_FONTS[0]).stack;
}

export function canvasFontString(opts) {
  const size = Math.max(1, num(opts && opts.fontSize, 16));
  return size + 'px ' + resolveFontFamily(opts);
}

// Meme-maker's default stroke: size / 12.
export function strokeForSize(fontSize) {
  return Math.max(1, Math.round(num(fontSize, 48) / 12));
}

// Stroke slider: level 0 = off, 5 ~= the meme-maker default (size/12), scales with font size.
export function strokeWidthFor(fontSize, level) {
  const lv = clamp(num(level, 0), 0, 20);
  if (lv <= 0) return 0;
  return Math.max(1, Math.round(num(fontSize, 48) * lv / 60));
}

export function shadowFor(fontSize, on) {
  const s = num(fontSize, 48);
  return on ? { blur: s / 12, offset: s / 24, color: 'rgba(0,0,0,0.5)' } : { blur: 0, offset: 0, color: 'rgba(0,0,0,0)' };
}

// Multi-line block metrics. measure(str, fontSize) -> width in px. Returns the pre-rendered
// canvas size (text plus enough padding for stroke and shadow) and the baseline geometry.
export function textBlockMetrics(text, fontSize, measure, opts) {
  const o = opts || {};
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const size = Math.max(1, num(fontSize, REF_FONT_PX));
  const lineH = size * LINE_HEIGHT;
  const widths = lines.map((l) => Math.max(0, num(measure(l, size), 0)));
  const textW = Math.max(1, ...widths);
  const textH = lineH * lines.length;
  const stroke = strokeWidthFor(size, o.strokeLevel);
  const sh = shadowFor(size, !!o.shadow);
  const pad = Math.ceil(stroke / 2 + (o.shadow ? sh.blur * 2 + sh.offset : 0) + 1);
  return { lines, widths, lineH, textW, textH, stroke, pad, width: Math.ceil(textW + pad * 2), height: Math.ceil(textH + pad * 2) };
}

// ---- layout -----------------------------------------------------------
function offsetPair(offsetPct) {
  if (offsetPct && typeof offsetPct === 'object') return [num(offsetPct.x, 0), num(offsetPct.y, 0)];
  const v = num(offsetPct, 0);
  return [v, v];
}

export function layoutWatermark(opts) {
  const o = opts || {};
  const imgW = Math.max(0, num(o.imgW, 0)), imgH = Math.max(0, num(o.imgH, 0));
  const wmW0 = num(o.wmW, 0), wmH0 = num(o.wmH, 0);
  if (!imgW || !imgH || wmW0 <= 0 || wmH0 <= 0) return [];
  const short = Math.min(imgW, imgH);
  const rot = num(o.rotation, 0);
  // scalePct sizes the watermark's LONGER side as a share of the image's short side.
  const f = (short * clamp(num(o.scalePct, 30), 0.1, 400) / 100) / Math.max(wmW0, wmH0);
  const w = wmW0 * f, h = wmH0 * f;
  const margin = short * clamp(num(o.marginPct, 0), 0, 50) / 100;
  const [oxPct, oyPct] = offsetPair(o.offsetPct);
  const ox = short * oxPct / 100, oy = short * oyPct / 100;

  if (o.tile) {
    const gap = short * clamp(num(o.gapPct, 10), 0, 200) / 100;
    let stepX = Math.max(1, w + gap), stepY = Math.max(1, h + gap);
    const cx = imgW / 2 + ox, cy = imgH / 2 + oy;
    const R = Math.hypot(imgW, imgH) / 2 + Math.hypot(w, h) / 2; // cover the image at any rotation
    // Keep the scan bounded even for tiny marks / zero gap: widen the step rather than loop millions.
    let cols = Math.ceil((2 * R) / stepX) + 1, rows = Math.ceil((2 * R) / stepY) + 1;
    const budget = MAX_TILES * 40;
    if (cols * rows > budget) {
      const k = Math.sqrt((cols * rows) / budget);
      stepX *= k; stepY *= k;
      cols = Math.ceil((2 * R) / stepX) + 1; rows = Math.ceil((2 * R) / stepY) + 1;
    }
    const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const out = [];
    const half = Math.hypot(w, h) / 2;
    for (let r = 0; r < rows && out.length < MAX_TILES; r++) {
      const ly = (r - (rows - 1) / 2) * stepY;
      const stagger = r % 2 ? stepX / 2 : 0; // diagonal-stagger rows
      for (let c = 0; c < cols && out.length < MAX_TILES; c++) {
        const lx = (c - (cols - 1) / 2) * stepX + stagger;
        const px = cx + lx * cos - ly * sin, py = cy + lx * sin + ly * cos;
        if (px + half < 0 || py + half < 0 || px - half > imgW || py - half > imgH) continue; // wholly off-canvas
        out.push({ x: px - w / 2, y: py - h / 2, w, h, rot });
      }
    }
    return out;
  }

  const anchor = ANCHORS.includes(o.anchor) ? o.anchor : 'br';
  const col = anchor[1], row = anchor[0]; // row: t|m|b, col: l|c|r  (anchor = row+col, e.g. 'br')
  let x = col === 'l' ? margin : col === 'r' ? imgW - margin - w : (imgW - w) / 2;
  let y = row === 't' ? margin : row === 'b' ? imgH - margin - h : (imgH - h) / 2;
  return [{ x: x + ox, y: y + oy, w, h, rot }];
}

// ---- formats / names ----------------------------------------------------
// Source MIME -> output format key. GIF/BMP/SVG/unknown fall back to PNG.
export function formatForSource(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg';
  if (m === 'image/webp') return 'webp';
  return 'png';
}

// selected: 'source' | 'png' | 'jpeg' | 'webp'
export function outputFormat(selected, sourceMime) {
  return FORMATS[selected] ? selected : formatForSource(sourceMime);
}

// Will encoding this source as `fmt` lose transparency? (JPEG has no alpha.)
export function losesAlpha(sourceMime, fmt) {
  const m = String(sourceMime || '').toLowerCase();
  return fmt === 'jpeg' && (m === 'image/png' || m === 'image/webp' || m === 'image/gif' || m === 'image/svg+xml');
}

export function baseName(filename) {
  const stem = String(filename == null ? '' : filename).replace(/\.[^./\\]*$/, '');
  return slugify(stem) || 'image';
}

// {base}-watermarked.{ext}; a collision (case-insensitive) gets -1, -2, ... `used` is a Set the caller owns.
export function uniqueName(filename, ext, used) {
  const base = baseName(filename) + '-watermarked';
  let n = 0, name = base + '.' + ext;
  while (used.has(name.toLowerCase())) { n++; name = base + '-' + n + '.' + ext; }
  used.add(name.toLowerCase());
  return name;
}

export function zipName() { return 'watermarked.zip'; }

// files = [{name, bytes}] -> Uint8Array zip (STORE), via the shared writer.
export function buildZip(files) {
  return storeZip(files);
}
