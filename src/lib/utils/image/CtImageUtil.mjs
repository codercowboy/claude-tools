// ===== Begin CtImageUtil (ES module) =====
/*
 * CtImageUtil — colour helpers, canvas-format registry, large-image guard, crop-rect gizmo geometry, fit helpers, crop-rect interaction, image/canvas runtime helpers.
 * ---------------------------------------------------------------------------
 * One module, five titled sections (the first four concatenated verbatim from the former
 * color.mjs, canvasFormats.mjs, checkImageLimits.mjs and rectGizmo.mjs):
 * "jbcColor", "jbcCanvasFormats", "jbcCheckImageLimits", "jbcRectGizmo", plus the
 * "image / canvas helpers" carved from util.js (loadImageFile, canvasToBlob, canvasToPngBytes).
 * Every function/constant is a named export AND a static on the `CtImageUtil`
 * class at the bottom (statics REFERENCE the named bindings — single implementation).
 * Depends on formatBytes from ../CtByteUtil.mjs (the build dedups it when a
 * consumer also imports CtByteUtil directly).
 */
import { formatBytes } from '../CtByteUtil.mjs';

// ----- Section: jbcColor (formerly color.mjs) -----
/*
 * colour helpers -> hex <-> rgb, byte clamp, palette parsing
 * ---------------------------------------------------------------------------
 * The pure, DOM-free colour primitives an indexed-image / palette tool needs:
 *   clampByte(v)       -> integer 0..255 (truncates fractionals via |0; a
 *                         non-numeric argument becomes 0)
 *   hexToRgb(hex)      -> [r,g,b] | null ("#abc" or "#aabbcc", case-insensitive;
 *                         a non-string or malformed value yields null)
 *   rgbToHex([r,g,b])  -> "#rrggbb"      (each channel clamped to a byte)
 *   parsePalette(list) -> [[r,g,b], ...] (accepts hex strings and/or [r,g,b]
 *                         triples, dropping anything unparseable)
 *
 * No canvas / document / window: a colour value in, a colour value out.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs these colour helpers imports this module directly (so `node --test` can
 * load it); the single-file build inlines this module body into the shipped
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
function clampByte(v) { return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  var s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function toHex2(v) {
  var h = clampByte(v).toString(16);
  return h.length === 1 ? '0' + h : h;
}

function rgbToHex(rgb) {
  return '#' + toHex2(rgb[0]) + toHex2(rgb[1]) + toHex2(rgb[2]);
}

function parsePalette(list) {
  // Accepts an array of [r,g,b] or hex strings; returns clean [[r,g,b],...].
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (typeof c === 'string') { var rgb = hexToRgb(c); if (rgb) out.push(rgb); }
    else if (c && c.length >= 3) out.push([clampByte(c[0]), clampByte(c[1]), clampByte(c[2])]);
  }
  return out;
}

export { clampByte, hexToRgb, rgbToHex, parsePalette };

// ----- Section: jbcCanvasFormats (formerly canvasFormats.mjs) -----
/*
 * canvasFormats -> the raster formats a browser <canvas> can natively encode
 * ---------------------------------------------------------------------------
 * A tiny, DOM-free registry of the encoders `canvas.toBlob(mime, quality)`
 * actually supports, plus the two lookups image tools hand-roll around it:
 *   FORMATS                 -> { png, jpeg, webp }, each { mime, ext, label, lossy }
 *   mimeForFormat(fmt)      -> the MIME for a format key (falls back to PNG's)
 *   formatSupportsQuality(fmt) -> true for the lossy formats that honour `quality`
 *
 * PNG (lossless, alpha), JPEG (lossy, no alpha), WebP (lossy, alpha). AVIF is
 * deliberately absent — canvas.toBlob('image/avif') is not a supported encoder,
 * so offering it would silently fall back to PNG. Animated GIF authoring is out
 * of scope too (it needs a hand-rolled LZW encoder). No canvas / document /
 * window here: this is only the format metadata; the actual toBlob call lives at
 * the call site.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs this registry imports this module directly (so `node --test` can load
 * it); the single-file build inlines this module body into the shipped
 * index.html — stripping the `export` — so the shipped tool stays
 * dependency-free and file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
const FORMATS = {
  png:  { mime: 'image/png',  ext: 'png',  label: 'PNG',  lossy: false },
  jpeg: { mime: 'image/jpeg', ext: 'jpg',  label: 'JPEG', lossy: true  },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true  },
};

function mimeForFormat(fmt) {
  const f = FORMATS[String(fmt).toLowerCase()];
  return f ? f.mime : FORMATS.png.mime;
}

// JPEG/WebP honor the quality argument to toBlob; PNG ignores it (lossless).
function formatSupportsQuality(fmt) {
  const f = FORMATS[String(fmt).toLowerCase()];
  return !!(f && f.lossy);
}

export { FORMATS, mimeForFormat, formatSupportsQuality };

// ----- Section: jbcCheckImageLimits (formerly checkImageLimits.mjs) -----
/*
 * makeImageLimitChecker(opts) -> checkImageLimits({bytes,width,height}) -> {level,message}
 * ---------------------------------------------------------------------------
 * The large-image guard several image tools share: a soft "warn" and a hard
 * "error" threshold on both file size and pixel dimensions. Byte sizes are
 * rendered with the shared formatBytes.
 *
 * The one part that differs per tool — the verb in the warn copy ("converting" /
 * "cropping" / "generating many widths") and the separator in the dimension
 * message (× vs a plain x) — is injected via opts at configuration time, so the
 * pure guard logic + thresholds are shared while each consumer keeps its exact
 * wording. This mirrors wrapText's injected `measure`: the variable part lives at
 * the call site, the logic in the module.
 *   makeImageLimitChecker({ action, dimSep }) -> a bound checkImageLimits(dims)
 *     action  (default 'processing') fills "Large image — <action> may take a moment…"
 *     dimSep  (default '×')          joins the W and H in the too-large message
 *
 * Thresholds (exported): WARN_FILE_BYTES 8 MB (soft), MAX_FILE_BYTES 40 MB (hard),
 * WARN_PIXELS ~24 MP (soft), MAX_DIMENSION 20000 px/side (hard). Every comparison
 * is a strict >, so a value exactly at a threshold does not trip it. The
 * file-size hard cap is checked first, then the dimension cap, then the soft
 * warns — so an error always wins over a warn.
 *
 * Node-importable ES module (imports formatBytes from ./CtByteUtil.mjs; the
 * build dedups formatBytes when a consumer also imports it). A tool whose pure,
 * unit-tested source/logic.mjs needs this guard imports this module directly (so
 * `node --test` can load it); the single-file build inlines this module body
 * into the shipped index.html — stripping the `export` — so the shipped tool
 * stays dependency-free and file://-openable. See the consuming repo's build
 * docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */

const WARN_FILE_BYTES = 8 * 1024 * 1024;   //  8 MB — soft warning
const MAX_FILE_BYTES = 40 * 1024 * 1024;   // 40 MB — hard reject
const WARN_PIXELS = 24 * 1000 * 1000;      // ~24 MP — soft warning
const MAX_DIMENSION = 20000;               // px per side — hard reject

function makeImageLimitChecker(opts = {}) {
  const action = (opts && opts.action) || 'processing';
  const dimSep = (opts && opts.dimSep) || '×';
  // checkImageLimits({ bytes, width, height }) -> { level, message }
  //   level: 'ok' | 'warn' | 'error'. width/height are optional (unknown until
  //   decode); bytes is known at file-drop time.
  return function checkImageLimits({ bytes = 0, width = 0, height = 0 } = {}) {
    const b = Number(bytes) || 0;
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (b > MAX_FILE_BYTES) {
      return { level: 'error', message: 'Image too large (' + formatBytes(b) + ') — limit is ' + formatBytes(MAX_FILE_BYTES) + '.' };
    }
    if ((w && w > MAX_DIMENSION) || (h && h > MAX_DIMENSION)) {
      return { level: 'error', message: 'Image dimensions too large (' + w + dimSep + h + ') — limit is ' + MAX_DIMENSION + 'px per side.' };
    }
    const pixels = w * h;
    if (b > WARN_FILE_BYTES || (pixels && pixels > WARN_PIXELS)) {
      return { level: 'warn', message: 'Large image — ' + action + ' may take a moment and use extra memory.' };
    }
    return { level: 'ok', message: '' };
  };
}

export { makeImageLimitChecker, WARN_FILE_BYTES, MAX_FILE_BYTES, WARN_PIXELS, MAX_DIMENSION };

// ----- Section: jbcRectGizmo (formerly rectGizmo.mjs) -----
/*
 * rectGizmo -> crop/selection rectangle geometry: normalize, handles, hit-test
 * ---------------------------------------------------------------------------
 * The pure, DOM-free geometry behind an interactive crop/selection rectangle —
 * the resize-handle layout and the pointer hit-test a canvas tool drives from
 * pointer events. All coordinates are plain numbers in one shared space (image
 * or screen); no canvas / document / window.
 *   normalizeRect(rect)          -> {x,y,w,h} with non-negative w,h (a handle
 *                                   dragged past the opposite edge flips sign)
 *   HANDLE_IDS                   -> ['nw','n','ne','e','se','s','sw','w']
 *   oppositeHandle(id)           -> the handle diagonally/axis-opposite (the
 *                                   fixed anchor when the named handle is dragged)
 *   handlePoints(rect)           -> { nw,n,ne,e,se,s,sw,w,center } -> {x,y}
 *   hitTestHandle(rect,px,py,tol)-> nearest handle id within tol, else 'move'
 *                                   when inside the rect, else null
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs this gizmo imports this module directly (so `node --test` can load it);
 * the single-file build inlines this module body into the shipped index.html —
 * stripping the `export` — so the shipped tool stays dependency-free and
 * file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */

// Normalise a rect so w,h are non-negative (handles that cross past the
// opposite edge flip sign); returns a fresh object.
function normalizeRect(rect) {
  let { x, y, w, h } = rect;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function oppositeHandle(id) {
  const map = {
    nw: 'se', n: 's', ne: 'sw', e: 'w',
    se: 'nw', s: 'n', sw: 'ne', w: 'e',
    move: 'center', center: 'center',
  };
  return map[id] || 'center';
}

// The 8 handle points (plus center) for a rect, in the rect's own space.
function handlePoints(rect) {
  const { x, y, w, h } = normalizeRect(rect);
  const cx = x + w / 2, cy = y + h / 2;
  return {
    nw: { x,        y        }, n: { x: cx,    y        }, ne: { x: x + w, y        },
    w:  { x,        y: cy    },                            e:  { x: x + w, y: cy    },
    sw: { x,        y: y + h }, s: { x: cx,    y: y + h }, se: { x: x + w, y: y + h },
    center: { x: cx, y: cy },
  };
}

// Nearest handle within `tol` of (px,py); else 'move' if inside the rect;
// else null. px/py and rect must be in the same coordinate space.
function hitTestHandle(rect, px, py, tol = 10) {
  const pts = handlePoints(rect);
  let best = null, bestD = tol;
  for (const id of HANDLE_IDS) {
    const d = Math.hypot(pts[id].x - px, pts[id].y - py);
    if (d <= bestD) { bestD = d; best = id; }
  }
  if (best) return best;
  const n = normalizeRect(rect);
  if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) return 'move';
  return null;
}

export { normalizeRect, HANDLE_IDS, oppositeHandle, handlePoints, hitTestHandle };

// ----- Section: image / canvas helpers (carved from util.js) -----
/*
 * loadImageFile(file, opts?):
 * - Validate -> decode -> hand back a decoded <img>. Rejects if `file` is missing
 *   or its type fails `opts.accept` (a RegExp or predicate; default /^image\//),
 *   and rejects if the browser cannot decode it. On success resolves
 *   { img, url, width, height } where width/height are naturalWidth/Height and
 *   `url` is the object URL. The CALLER owns `url`: revoke it when done (or keep
 *   it as a thumbnail), or pass opts.revoke=true to auto-revoke right after decode.
 * canvasToBlob(canvas, type?, quality?):
 * - Promisified canvas.toBlob that never rejects: resolves the Blob, or null when
 *   toBlob yields null or throws (unsupported type). `type`/`quality` pass through.
 * canvasToPngBytes(canvas):
 * - Resolves a Uint8Array of the canvas encoded as PNG (canvasToBlob +
 *   blob.arrayBuffer). Rejects if the canvas could not be encoded.
 * Runtime-only (DOM: Image / URL / canvas) — never exercised by node --test.
 */
function loadImageFile(file, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('No file')); return; }
    var accept = opts.accept || /^image\//;
    var typeOk = (typeof accept === 'function') ? accept(file) : accept.test(file.type || '');
    if (!typeOk) { reject(new Error('Unsupported file type')); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var res = { img: img, url: url, width: img.naturalWidth, height: img.naturalHeight };
      if (opts.revoke) URL.revokeObjectURL(url);
      resolve(res);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve) {
    try {
      canvas.toBlob(function (blob) { resolve(blob || null); }, type, quality);
    } catch (e) { resolve(null); }
  });
}

function canvasToPngBytes(canvas) {
  return canvasToBlob(canvas, 'image/png').then(function (blob) {
    if (!blob) throw new Error('canvas.toBlob returned null');
    return blob.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  });
}

export { loadImageFile, canvasToBlob, canvasToPngBytes };

// ----- Section: image fit helpers (carved from social-card-maker) -----
/*
 * coverRect(srcW, srcH, dstW, dstH)  -> { sx, sy, sw, sh }
 *   Source sub-rect that "covers" a dst box: scale-to-fill, center-crop the
 *   overflow. Draw it into the full dst with drawImage(img,sx,sy,sw,sh,0,0,dw,dh).
 *   Non-finite / <1 inputs are guarded to at least 1.
 * containRect(srcW, srcH, dstW, dstH) -> { x, y, w, h }
 *   Dst-space rect that "contains" the source: scale-to-fit, centered
 *   (letterbox / pillarbox). Draw the whole source into it.
 * coverSrcRect(srcW, srcH, dstW, dstH, zoom = 1, ox = 0, oy = 0) -> { sx, sy, sw, sh }
 *   Pan/zoom variant of coverRect. The window is the cover window divided by
 *   `zoom` (zoom clamped to >= 1; 1 === coverRect). ox/oy are the window
 *   centre's offset from the source centre, in SOURCE pixels, clamped so the
 *   window never leaves the source.
 */
function _fitNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function coverRect(srcW, srcH, dstW, dstH) {
  const sw0 = Math.max(1, _fitNum(srcW, 1));
  const sh0 = Math.max(1, _fitNum(srcH, 1));
  const dw = Math.max(1, _fitNum(dstW, 1));
  const dh = Math.max(1, _fitNum(dstH, 1));
  const srcAspect = sw0 / sh0;
  const dstAspect = dw / dh;
  let sw, sh;
  if (srcAspect > dstAspect) {
    // source is wider — crop the sides
    sh = sh0;
    sw = sh0 * dstAspect;
  } else {
    // source is taller — crop top/bottom
    sw = sw0;
    sh = sw0 / dstAspect;
  }
  return { sx: (sw0 - sw) / 2, sy: (sh0 - sh) / 2, sw, sh };
}

function containRect(srcW, srcH, dstW, dstH) {
  const sw0 = Math.max(1, _fitNum(srcW, 1));
  const sh0 = Math.max(1, _fitNum(srcH, 1));
  const dw = Math.max(1, _fitNum(dstW, 1));
  const dh = Math.max(1, _fitNum(dstH, 1));
  const scale = Math.min(dw / sw0, dh / sh0);
  const w = sw0 * scale, h = sh0 * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

function coverSrcRect(srcW, srcH, dstW, dstH, zoom = 1, ox = 0, oy = 0) {
  const sw0 = Math.max(1, _fitNum(srcW, 1));
  const sh0 = Math.max(1, _fitNum(srcH, 1));
  const base = coverRect(srcW, srcH, dstW, dstH);
  const z = Math.max(1, _fitNum(zoom, 1));
  const sw = base.sw / z, sh = base.sh / z;
  const cx = Math.min(Math.max(sw0 / 2 + _fitNum(ox, 0), sw / 2), sw0 - sw / 2);
  const cy = Math.min(Math.max(sh0 / 2 + _fitNum(oy, 0), sh / 2), sh0 - sh / 2);
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

export { coverRect, containRect, coverSrcRect };

// ----- Section: crop-rect interaction (carved from image-cropper) -----
/*
 * Builds on the rect gizmo geometry above (normalizeRect / oppositeHandle).
 * ASPECT_PRESETS                -> [{ id, label, ratio }] (ratio = landscape w/h; null = free/custom)
 * aspectRatioFor(id, cw, ch, portrait=false) -> w/h ratio | null (free / bad custom)
 * clampRectToImage(rect, iw, ih)-> rect forced inside [0,0,iw,ih] (min 1px)
 * constrainRectToAspect(rect, ratio, anchor='nw') -> rect with w/h === ratio, `anchor`
 *                                  handle (or 'center') held fixed
 * resizeRaw(handleId, rect0, p) -> raw (unclamped, possibly negative w/h) rect when
 *                                  dragging handle `handleId` to point p, with the
 *                                  opposite edges of rect0 fixed.
 */
const ASPECT_PRESETS = [
  { id: 'free',   label: 'Free',        ratio: null      },
  { id: '1x1',    label: '1:1 (square)', ratio: 1        },
  { id: '4x3',    label: '4:3',          ratio: 4 / 3    },
  { id: '3x2',    label: '3:2',          ratio: 3 / 2    },
  { id: '16x9',   label: '16:9',         ratio: 16 / 9   },
  { id: '9x16',   label: '9:16',         ratio: 9 / 16   },
  { id: '5x7',    label: '5:7 (print)',  ratio: 5 / 7    },
  { id: '8x10',   label: '8:10 (print)', ratio: 8 / 10   },
  { id: '4x6',    label: '4:6 (print)',  ratio: 4 / 6    },
  { id: 'custom', label: 'Custom W:H',   ratio: null     },
];

function aspectRatioFor(presetId, customW, customH, portrait = false) {
  if (presetId === 'custom') {
    const w = Number(customW), h = Number(customH);
    if (!(w > 0) || !(h > 0)) return null;
    const r = w / h;
    return portrait ? 1 / r : r;
  }
  const p = ASPECT_PRESETS.find((x) => x.id === presetId);
  if (!p || p.ratio == null) return null;
  return portrait ? 1 / p.ratio : p.ratio;
}

function _isPosFinite(n) { return Number.isFinite(n) && n > 0; }

function clampRectToImage(rect, iw, ih) {
  const bw = _isPosFinite(iw) ? iw : 1;
  const bh = _isPosFinite(ih) ? ih : 1;
  let { x, y, w, h } = normalizeRect(rect);
  w = Math.min(Math.max(w, 1), bw);
  h = Math.min(Math.max(h, 1), bh);
  x = Math.min(Math.max(x, 0), bw - w);
  y = Math.min(Math.max(y, 0), bh - h);
  return { x, y, w, h };
}

// Corner + horizontal-edge anchors drive by width (h = w/ratio); vertical-edge
// anchors (n/s) drive by height (w = h*ratio). The free axis grows about the
// fixed edge's centre line.
function constrainRectToAspect(rect, ratio, anchor = 'nw') {
  if (!_isPosFinite(ratio)) return normalizeRect(rect);
  const n = normalizeRect(rect);
  const L = n.x, T = n.y, R = n.x + n.w, B = n.y + n.h;
  let w = n.w, h = n.h;

  // 'center' contains both 'e' and 'n', so test it explicitly (else misread as 'ne').
  const horiz = anchor === 'center' ? 'c' : anchor.includes('w') ? 'w' : anchor.includes('e') ? 'e' : 'c';
  const vert  = anchor === 'center' ? 'c' : anchor.includes('n') ? 'n' : anchor.includes('s') ? 's' : 'c';
  const drivenByHeight = (horiz === 'c' && vert !== 'c');

  if (drivenByHeight) { w = h * ratio; } else { h = w / ratio; }
  w = Math.max(w, 1);
  h = Math.max(h, 1);

  let x;
  if (horiz === 'w') x = L;
  else if (horiz === 'e') x = R - w;
  else x = (L + R) / 2 - w / 2;

  let y;
  if (vert === 'n') y = T;
  else if (vert === 's') y = B - h;
  else y = (T + B) / 2 - h / 2;

  return { x, y, w, h };
}

function resizeRaw(id, rect0, p) {
  // Only the 8 edge/corner handles resize. Guard other ids (e.g. 'move'/'center') so the substring
  // checks below don't misread 'move' as the east handle via its 'e' — return the rect unchanged (#1014-N).
  if (!HANDLE_IDS.includes(id)) return { x: rect0.x, y: rect0.y, w: rect0.w, h: rect0.h };
  let L = rect0.x, T = rect0.y, R = rect0.x + rect0.w, B = rect0.y + rect0.h;
  if (id.includes('n')) T = p.y;
  if (id.includes('s')) B = p.y;
  if (id.includes('w')) L = p.x;
  if (id.includes('e')) R = p.x;
  return { x: L, y: T, w: R - L, h: B - T };
}

export { ASPECT_PRESETS, aspectRatioFor, clampRectToImage, constrainRectToAspect, resizeRaw };

// ----- Aggregator -----
export class CtImageUtil {
  static clampByte = clampByte;
  static hexToRgb = hexToRgb;
  static rgbToHex = rgbToHex;
  static parsePalette = parsePalette;
  static FORMATS = FORMATS;
  static mimeForFormat = mimeForFormat;
  static formatSupportsQuality = formatSupportsQuality;
  static makeImageLimitChecker = makeImageLimitChecker;
  static WARN_FILE_BYTES = WARN_FILE_BYTES;
  static MAX_FILE_BYTES = MAX_FILE_BYTES;
  static WARN_PIXELS = WARN_PIXELS;
  static MAX_DIMENSION = MAX_DIMENSION;
  static normalizeRect = normalizeRect;
  static HANDLE_IDS = HANDLE_IDS;
  static oppositeHandle = oppositeHandle;
  static handlePoints = handlePoints;
  static hitTestHandle = hitTestHandle;
  static loadImageFile = loadImageFile;
  static canvasToBlob = canvasToBlob;
  static canvasToPngBytes = canvasToPngBytes;
  static coverRect = coverRect;
  static containRect = containRect;
  static coverSrcRect = coverSrcRect;
  static ASPECT_PRESETS = ASPECT_PRESETS;
  static aspectRatioFor = aspectRatioFor;
  static clampRectToImage = clampRectToImage;
  static constrainRectToAspect = constrainRectToAspect;
  static resizeRaw = resizeRaw;
}
// ===== end CtImageUtil (ES module) =====
