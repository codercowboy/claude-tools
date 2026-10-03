// ===== Begin CtUtil (ES module) =====
/*
 * CtUtil — tiny, dependency-free runtime helpers for single-file tools (ES module;
 * was the classic-script window-global in util.js, plus the posAt /
 * slugify / wrapText modules, absorbed here — jbc ES6 modularization · Train 37 · R12).
 * ---------------------------------------------------------------------------
 *     import { onceFlag, downloadBlob, debounce } from '<rel>/jbc-include/CtUtil.mjs';
 *     // (or `CtUtil.onceFlag` etc. via the aggregator class at the bottom — the
 *     //  statics REFERENCE the named bindings, single implementation.)
 *
 * Bodies are moved VERBATIM from util.js (and posAt.mjs / slugify.mjs / wrapText.mjs);
 * only the access path changed (the old util.js global's `X` -> named import `X`). SELF-CONTAINED: no
 * imports (so flattening never drags another module's top-level names into a page).
 * Where each former util.js helper went:
 *   - getRandomBytes + makeId      -> CtByteUtil.mjs (makeId rides with getRandomBytes so
 *                                      this module needs no import of CtByteUtil)
 *   - showWarning / hideError / hideWarning / showBanner / hideBanner
 *                                  -> components/CtComponents.mjs (next to showError)
 *   - iconButton / wireTabs / ... / announce  -> components/CtComponents.mjs (R11)
 *   - loadImageFile / canvasToBlob / canvasToPngBytes -> image/CtImageUtil.mjs
 *
 * These are the browser/DOM-facing idioms every tool re-rolled by hand. Most touch
 * runtime-only surfaces (document / URL / localStorage / setTimeout) but only inside
 * function bodies, so the module is safe to import from Node (the pure helpers —
 * clamp/num/escape*, posAt/slugify/wrapText — are usable in a unit-tested logic.mjs).
 *
 * downloadBlob(data, filename, mime?):
 * - Triggers a file download. `data` may be a Blob, a string, or a Uint8Array
 *   (anything the Blob constructor accepts). A Blob is used as-is; anything
 *   else is wrapped in a Blob (with `mime` as its type when given).
 * - Creates an object URL, clicks a temporary hidden <a download>, then revokes
 *   the URL on a short timeout so the download has time to start.
 *
 * debounce(fn, ms):
 * - Returns a trailing-edge debounced wrapper: repeated calls reset the timer,
 *   and `fn` runs once, `ms` after the last call, with the latest args and `this`.
 *
 * (formatBytes is NOT here: the single formatBytes(bytes, opts) lives in CtByteUtil.mjs. The old
 *   compact util.js variant — no space, lowercase "b", 2 decimals — was removed; callers use
 *   CtByteUtil.formatBytes, which prints "1.5 KB" style.)
 *
 * clamp(n, lo, hi):  Coerces `n` to a number and clamps it to [lo, hi]. Non-finite -> `lo`.
 * num(v, fallback?): Coerces `v` to a finite number, else `fallback` (default 0).
 * clampInt(v, lo, hi, fallback): parseInt(v, 10) then clamps to [lo, hi]; non-integer -> `fallback`.
 *
 * escapeHtml(s): Escapes & < > (safe for a text node; quotes left as-is).
 * escapeAttr(s): escapeHtml plus " -> &quot; and ' -> &#39; (for attribute values).
 * (escapeXml is NOT here: the canonical escapeXml(text, strict?) lives in formats/CtEscaper.mjs.
 *   The old util.js escapeXml / escapeXmlBasic was folded into it.)
 *
 * persistState(key, defaults):
 * - Versioned, best-effort localStorage persistence driven by a `defaults` shape.
 *   Put a version in the key (e.g. "mytool:v1"). Returns { load, save }. `load()`
 *   overlays stored values on the defaults, coercing by the default's TYPE and
 *   dropping non-finite numbers; `save(state)` stores ONLY the keys in `defaults`.
 *   All access is try/catch-guarded (private mode / disabled storage degrade silently).
 *
 * onceFlag(key):
 * - A one-shot "have they seen this?" flag on `key`. Returns { seen, mark }.
 *   `seen()` is true once `mark()` has run; a storage throw is treated as
 *   already-seen (never re-nag). Used for first-load help auto-open.
 *
 * el(tag, props?, children?):
 * - Hyperscript element factory. `props` keys: `class`/`className`, `text`/
 *   `textContent`, `html`/`innerHTML`, any `data-*`/`aria-*` + `role`/`title`/
 *   `for`/`type`/`value`/`name`/`href`/`id`/`placeholder` (set as attributes),
 *   everything else assigned as a property; null/undefined values are skipped.
 *   `children` is a node, a string/number (-> text node), or an array of those;
 *   null/false entries are skipped.
 *
 * prefersReducedMotion(): True when the user asked for reduced motion (false if unavailable).
 * restartAnimation(el, cls): remove `cls`, force reflow (`void el.offsetWidth`), re-add `cls`.
 *
 * setupHiDPICanvas(canvas, opts?):
 * - Sizes a canvas' backing store for crisp rendering on high-DPR displays. CSS
 *   size is opts.width/opts.height (CSS px) or the canvas' current
 *   clientWidth/clientHeight. dpr = devicePixelRatio (capped at opts.maxDpr when
 *   given). Sets canvas.width/height = round(css * dpr); sets the CSS pixel size
 *   via style unless opts.style===false; gets the 2d context (unless
 *   opts.context===false) and applies setTransform(dpr,0,0,dpr,0,0) unless
 *   opts.transform===false. Returns { dpr, cssW, cssH, ctx }.
 *
 * posAt(text, index) / slugify(str, opts?) / wrapText(text, maxWidth, measure):
 * - Pure text helpers (ex posAt.mjs / slugify.mjs / wrapText.mjs); full doc blocks
 *   at their sections below.
 *
 * This is a shared component inlined by the build (import-inlining; no globals).
 * Edit the canonical copy, re-vendor, run `npm run build`. Canonical source:
 * html-single-file/assets/CtUtil.mjs
 */

// =====================================================================
// Section: downloadBlob / debounce / clamp / num / clampInt
// =====================================================================
export function downloadBlob(data, filename, mime) {
  var blob = (data instanceof Blob)
    ? data
    : new Blob([data], mime ? { type: mime } : undefined);
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename == null ? '' : String(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

export function debounce(fn, ms) {
  var t;
  return function () {
    var self = this, args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

export function clamp(n, lo, hi) {
  var v = Number(n);
  // NaN has no position on the number line → lo. ±Infinity DO: +Infinity clamps to hi,
  // -Infinity to lo via the normal comparison below (#1014-O).
  if (Number.isNaN(v)) return lo;
  return v < lo ? lo : (v > hi ? hi : v);
}

export function num(v, fallback) {
  var n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

export function clampInt(v, lo, hi, fallback) {
  var n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

// =====================================================================
// Section: escapeHtml / escapeAttr  (escapeXml lives in CtEscaper)
// =====================================================================
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =====================================================================
// Section: persistState / onceFlag
// =====================================================================
export function persistState(key, defaults) {
  function load() {
    var out = {};
    for (var k in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    }
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return out;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return out;
      for (var k2 in defaults) {
        if (!Object.prototype.hasOwnProperty.call(defaults, k2)) continue;
        if (p[k2] === undefined) continue;
        var d = defaults[k2];
        if (typeof d === 'boolean') out[k2] = !!p[k2];
        else if (typeof d === 'number') { var nn = Number(p[k2]); if (Number.isFinite(nn)) out[k2] = nn; }
        else out[k2] = String(p[k2]);
      }
    } catch (e) { /* ignore malformed / disabled storage */ }
    return out;
  }
  function save(state) {
    var toStore = {};
    for (var k in defaults) {
      if (!Object.prototype.hasOwnProperty.call(defaults, k)) continue;
      if (state && state[k] !== undefined) toStore[k] = state[k];
    }
    try { localStorage.setItem(key, JSON.stringify(toStore)); } catch (e) { /* best-effort */ }
  }
  return { load: load, save: save };
}

export function onceFlag(key) {
  return {
    seen: function () { try { return localStorage.getItem(key) === '1'; } catch (e) { return true; } },
    mark: function () { try { localStorage.setItem(key, '1'); } catch (e) { /* best-effort */ } }
  };
}

// =====================================================================
// Section: el (hyperscript factory)
// =====================================================================
var ATTR_KEYS = { role: 1, title: 1, 'for': 1, type: 1, value: 1, name: 1, href: 1, id: 1, placeholder: 1 };
export function el(tag, props, children) {
  var node = document.createElement(tag);
  if (props) {
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null) continue;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'text' || k === 'textContent') node.textContent = v;
      else if (k === 'html' || k === 'innerHTML') node.innerHTML = v;
      else if (k.indexOf('data-') === 0 || k.indexOf('aria-') === 0 || ATTR_KEYS[k]) node.setAttribute(k, v);
      else node[k] = v;
    }
  }
  var kids = (children == null) ? [] : (Array.isArray(children) ? children : [children]);
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c == null || c === false) continue;
    node.appendChild((typeof c === 'string' || typeof c === 'number') ? document.createTextNode(String(c)) : c);
  }
  return node;
}

// =====================================================================
// Section: prefersReducedMotion / restartAnimation / setupHiDPICanvas
// =====================================================================
export function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { return false; }
}

export function restartAnimation(elm, cls) {
  if (!elm) return;
  if (cls) elm.classList.remove(cls);
  void elm.offsetWidth;
  if (cls) elm.classList.add(cls);
}

export function setupHiDPICanvas(canvas, opts) {
  opts = opts || {};
  var cssW = (opts.width != null) ? opts.width : (canvas.clientWidth || 0);
  var cssH = (opts.height != null) ? opts.height : (canvas.clientHeight || 0);
  var dpr = window.devicePixelRatio || 1;
  if (opts.maxDpr != null) dpr = Math.min(dpr, opts.maxDpr);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (opts.style !== false) {
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  var ctx = (opts.context === false) ? null : canvas.getContext('2d');
  if (ctx && opts.transform !== false) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { dpr: dpr, cssW: cssW, cssH: cssH, ctx: ctx };
}

// =====================================================================
// Section: posAt  (was posAt.mjs — jbcPosAt)
// =====================================================================
/*
 * posAt(text, index) -> { line, column }
 * ---------------------------------------------------------------------------
 * Map a 0-based character offset into `text` to a 1-based { line, column }
 * position — the readout a parser wants when reporting where an error occurred.
 * Lines are split on `\n`; `column` counts characters from the line start
 * (1-based). `index` is clamped to `text.length`, so an offset at or past the
 * end returns the position just after the final character. Every other character
 * (including `\r` and `\t`) advances the column by one.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs offset->line/column imports this module directly (so `node --test` can
 * load it); the single-file build inlines this module body into the shipped
 * index.html — stripping the `export` — so the shipped tool stays
 * dependency-free and file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function posAt(text, index) {
  let line = 1;
  let col = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') { line++; col = 1; } else { col++; }
  }
  return { line, column: col };
}

// =====================================================================
// Section: slugify  (was slugify.mjs — jbcSlugify)
// =====================================================================
/*
 * slugify(str, opts?) -> string
 * ---------------------------------------------------------------------------
 * Turn arbitrary text into a filename-safe ASCII slug: trim, lowercase, drop
 * straight/curly-free quotes, collapse every run of non-alphanumeric characters
 * to a single hyphen, strip leading/trailing hyphens, and cap the result at 60
 * characters. `null`/`undefined` become `''`. This is the conservative, ASCII
 * form used for download filenames (e.g. "My Card!" -> "my-card").
 *
 * With NO options this is exactly the historical ASCII slugifier, so an
 * option-free call is byte-identical to the pre-parameterization function.
 *
 * DIACRITIC-AWARE VARIANT — `slugify(str, { diacritics: true, cap? })`. Some
 * tools need "Café Menu" -> "cafe-menu" (the default ASCII form drops the
 * accented letters). Passing `diacritics: true` selects a different pipeline
 * that (1) NFKD-normalizes and strips combining diacritical marks (U+0300–U+036F)
 * so "é" -> "e", then (2) splits into words with a camelCase / acronym / digit-
 * run-aware splitter (the text-toolkit word model: "fooBar" -> foo, Bar;
 * "HTMLParser" -> HTML, Parser; "foo2bar" -> foo, 2, bar), lowercases each, and
 * joins with '-'. This is NOT the same word model as the default (which collapses
 * every non-alphanumeric run) — it is the diacritic slug several text tools rolled
 * by hand. `opts.cap` (a number) caps the length; omitted / null leaves it
 * UNCAPPED (text-toolkit's slug is uncapped).
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs a slug imports this module directly (so `node --test` can load it); the
 * single-file build inlines this module body into the shipped index.html —
 * stripping the `export` — so the shipped tool stays dependency-free and
 * file://-openable. See the consuming repo's build docs (§ "Build-assembled
 * tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function slugify(str, opts) {
  opts = opts || {};
  if (opts.diacritics) {
    if (str == null) return '';
    const stripped = String(str).normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const words = stripped.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z][a-z]+|[A-Z]+|[a-z]+|[0-9]+/g) || [];
    const slug = words.map((w) => w.toLowerCase()).join('-');
    // Strip a trailing hyphen the cap may have left mid-separator (#1014-O).
    return opts.cap == null ? slug : slug.slice(0, opts.cap).replace(/-+$/g, '');
  }
  return String(str == null ? '' : str)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, ''); // the 60-char cap can land mid-separator, re-stripping a trailing hyphen (#1014-O)
}

// =====================================================================
// Section: wrapText  (was wrapText.mjs — jbcWrapText)
// =====================================================================
/*
 * wrapText(text, maxWidth, measure) -> string[]
 * ---------------------------------------------------------------------------
 * Greedy word-wrap of `text` to a maximum width, returning an array of lines
 * (always at least one, possibly `''`). Explicit newlines are honored as hard
 * breaks first; within a paragraph, words are packed greedily and a single word
 * wider than `maxWidth` is kept whole on its own line (never dropped or split).
 *
 * Width is measured by the injected `measure(str) -> number` callback — the
 * pure wrapping logic lives here; the canvas/DOM text-measurement stays at the
 * call site (pass `ctx.measureText(s).width`). `maxWidth` is coerced to a finite
 * number (non-finite -> 0); a limit of 0 (or less) disables width-wrapping, so
 * only explicit newlines break the text and `measure` is never called.
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * wraps text imports this module directly (so `node --test` can load it, feeding
 * a deterministic `measure`); the single-file build inlines this module body
 * into the shipped index.html — stripping the `export` — so the shipped tool
 * stays dependency-free and file://-openable. See the consuming repo's build
 * docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function wrapText(text, maxWidth, measure) {
  const src = text == null ? '' : String(text);
  const mw = Number(maxWidth);
  const limit = Number.isFinite(mw) ? mw : 0;
  const paras = src.split('\n');
  const out = [];
  for (const para of paras) {
    const words = para.split(/(\s+)/).filter((t) => t.length > 0);
    if (words.length === 0) { out.push(''); continue; }
    let line = '';
    for (const token of words) {
      const isSpace = /^\s+$/.test(token);
      const candidate = line + token;
      if (line === '') {
        line = isSpace ? '' : token;
        continue;
      }
      if (limit > 0 && measure(candidate) > limit && !isSpace) {
        out.push(line.replace(/\s+$/, ''));
        line = token;
      } else {
        line = candidate;
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.length ? out : [''];
}

// =====================================================================
// Aggregator — static members REFERENCE the named functions above (single
// implementation; nothing is reimplemented here). Defined LAST.
// =====================================================================
export class CtUtil {
  static downloadBlob = downloadBlob;
  static debounce = debounce;
  static clamp = clamp;
  static num = num;
  static clampInt = clampInt;
  static escapeHtml = escapeHtml;
  static escapeAttr = escapeAttr;
  static persistState = persistState;
  static onceFlag = onceFlag;
  static el = el;
  static prefersReducedMotion = prefersReducedMotion;
  static restartAnimation = restartAnimation;
  static setupHiDPICanvas = setupHiDPICanvas;
  static posAt = posAt;
  static slugify = slugify;
  static wrapText = wrapText;
}
// ===== end CtUtil (ES module) =====
