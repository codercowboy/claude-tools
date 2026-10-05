import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, showError, hideError, showWarning, hideWarning, announce } from '../../../lib/components/CtComponents.mjs';
// CtUtil / CtImageUtil names used below (el, debounce, persistState, onceFlag, downloadBlob,
// clampInt, canvasToBlob) come from logic.mjs's own imports (inlined once at the site below).

<<ct:inline logic.mjs>>

  // =====================================================================
  // Barcode Generator - app (DOM wiring only). All encoding and geometry
  // live in logic.mjs. The preview is the SAME string as the SVG export,
  // parsed with DOMParser (no innerHTML); the PNG is drawn on a canvas at an
  // integer pixel width per module (no SVG-to-Image, no smoothing).
  // =====================================================================
  const STORAGE_KEY = 'barcode-generator:v1';
  const HELP_SEEN_KEY = 'barcode-generator:help-seen:v1';
  const MAX_CANVAS_SIDE = 16000;
  const MAX_CANVAS_AREA = 100000000;
  const HINTS = {
    code128: 'Any ASCII text (0-127). Code sets A/B/C are chosen automatically.',
    ean13: '12 digits (check digit added) or 13 digits (check digit verified).',
    upca: '11 digits (check digit added) or 12 digits (check digit verified).',
    code39: '0-9, A-Z, space and - . $ / + % (lowercase is upper-cased).',
  };

  const store = persistState(STORAGE_KEY, { symbology: 'code128', scale: 2, height: 60, quiet: '', showText: true, fg: '#000000', bg: '#ffffff', c39check: false, c39star: false });
  const state = { symbology: 'code128', scale: 2, height: 60, quiet: '', showText: true, fg: '#000000', bg: '#ffffff', c39check: false, c39star: false, enc: null, svg: '', lastSample: '' };

  const $ = (id) => document.querySelector('[data-testid="' + id + '"]');
  const els = {
    input: document.getElementById('barcode-input'),
    hint: $('input-hint'),
    check: $('check-digit'),
    error: $('error-message'),
    warning: $('contrast-warning'),
    stats: $('stats'),
    preview: $('preview'),
    scale: document.getElementById('scale-input'),
    height: document.getElementById('height-input'),
    quiet: document.getElementById('quiet-zone-input'),
    showText: document.getElementById('show-text'),
    fg: document.getElementById('fg-color'),
    bg: document.getElementById('bg-color'),
    c39opts: document.getElementById('code39-opts'),
    c39check: document.getElementById('c39-check'),
    c39star: document.getElementById('c39-star'),
    png: document.getElementById('download-png'),
    svg: document.getElementById('download-svg'),
    copySvg: document.getElementById('copy-svg'),
  };

  const save = () => store.save({ symbology: state.symbology, scale: state.scale, height: state.height, quiet: state.quiet, showText: state.showText, fg: state.fg, bg: state.bg, c39check: state.c39check, c39star: state.c39star });
  const renderOpts = () => ({ scale: state.scale, height: state.height, quietLeft: state.quiet, quietRight: state.quiet, showText: state.showText, fg: state.fg, bg: state.bg });
  const sampleFor = (id) => SYMBOLOGIES.find((s) => s.id === id).sample;

  function showPreview(svgString) {
    els.preview.textContent = '';
    if (!svgString) return;
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    if (doc.documentElement && doc.documentElement.localName === 'svg') els.preview.appendChild(document.importNode(doc.documentElement, true));
  }

  function update() {
    const enc = encode(state.symbology, els.input.value, { check: state.c39check, star: state.c39star });
    state.enc = enc;
    state.svg = toSvg(enc, renderOpts());
    const ok = !enc.error;
    if (ok) hideError(els.error); else showError(els.error, enc.error);
    els.check.textContent = ok && enc.checkDigit !== '' ? enc.checkDigit : '-';
    showPreview(state.svg);
    const warn = contrastWarning(state.fg, state.bg);
    if (warn) showWarning(els.warning, warn); else hideWarning(els.warning);
    if (ok) {
      const g = layout(enc, renderOpts());
      els.stats.textContent = enc.modules.length + ' modules, image ' + (g.W * g.scale) + ' x ' + (g.H * g.scale) + ' px';
    } else els.stats.textContent = '';
    els.png.disabled = !ok;
    els.svg.disabled = !ok;
    els.copySvg.disabled = !ok;
    if (ok) announce('Barcode updated.');
  }
  const updateDebounced = debounce(update, 80);

  // ---- PNG export: integer pixels per module, no smoothing --------------------------------
  function renderBarcodeCanvas(enc, opts) {
    const g = layout(enc, opts);
    const width = g.W * g.scale;
    const height = g.H * g.scale;
    if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = g.fg;
    for (const r of g.runs) ctx.fillRect(r.x * g.scale, 0, r.w * g.scale, g.height * g.scale);
    const align = { start: 'left', middle: 'center', end: 'right' };
    ctx.textBaseline = 'alphabetic';
    for (const t of g.texts) {
      ctx.font = (t.size * g.scale) + 'px ' + SVG_FONT;
      ctx.textAlign = align[t.anchor] || 'center';
      ctx.fillText(t.s, t.x * g.scale, t.y * g.scale);
    }
    return canvas;
  }

  const fileBase = () => {
    const slug = (state.enc && state.enc.text ? state.enc.text : 'barcode').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'barcode';
    return 'barcode-' + state.symbology + '-' + slug;
  };

  els.png.addEventListener('click', async () => {
    if (!state.enc || state.enc.error) return;
    const canvas = renderBarcodeCanvas(state.enc, renderOpts());
    if (!canvas) { showError(els.error, 'That image would be too large. Lower the module width or bar height.'); return; }
    const blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) { showError(els.error, 'Could not create the PNG in this browser.'); return; }
    downloadBlob(blob, fileBase() + '.png', 'image/png');
    announce('PNG downloaded.');
  });
  els.svg.addEventListener('click', () => {
    if (!state.svg) return;
    downloadBlob(state.svg, fileBase() + '.svg', 'image/svg+xml');
    announce('SVG downloaded.');
  });
  els.copySvg.addEventListener('click', async () => {
    if (!state.svg) return;
    const ok = await copy(state.svg);
    announce(ok ? 'Copied SVG.' : 'Copy failed.');
    if (ok) flash(els.copySvg, { label: 'Copied!', revertTo: 'Copy SVG' });
  });

  // ---- controls ----------------------------------------------------------------------
  els.input.addEventListener('input', updateDebounced);
  els.scale.addEventListener('input', () => { state.scale = clampInt(els.scale.value, BARCODE_LIMITS.scale[0], BARCODE_LIMITS.scale[1], 2); save(); updateDebounced(); });
  els.height.addEventListener('input', () => { state.height = clampInt(els.height.value, BARCODE_LIMITS.height[0], BARCODE_LIMITS.height[1], 60); save(); updateDebounced(); });
  els.quiet.addEventListener('input', () => {
    const v = clampInt(els.quiet.value, BARCODE_LIMITS.quiet[0], BARCODE_LIMITS.quiet[1], null);
    state.quiet = v === null ? '' : v;
    save();
    updateDebounced();
  });
  els.showText.addEventListener('change', () => { state.showText = els.showText.checked; save(); update(); });
  els.fg.addEventListener('input', () => { state.fg = normalizeHex(els.fg.value, DEFAULT_FG); save(); updateDebounced(); });
  els.bg.addEventListener('input', () => { state.bg = normalizeHex(els.bg.value, DEFAULT_BG); save(); updateDebounced(); });
  els.c39check.addEventListener('change', () => { state.c39check = els.c39check.checked; save(); update(); });
  els.c39star.addEventListener('change', () => { state.c39star = els.c39star.checked; save(); update(); });

  function applySymbology(id, fire) {
    state.symbology = id;
    els.hint.textContent = HINTS[id];
    els.c39opts.hidden = id !== 'code39';
    if (els.input.value === '' || els.input.value === state.lastSample) {
      els.input.value = sampleFor(id);
      state.lastSample = els.input.value;
    }
    els.quiet.placeholder = 'auto (' + defaultQuiet(id).left + (defaultQuiet(id).left === defaultQuiet(id).right ? '' : ' / ' + defaultQuiet(id).right) + ')';
    if (fire) { save(); update(); }
  }
  const symSeg = wireSegmented($('symbology-seg'), (v) => applySymbology(v, true));

  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How Barcode Generator works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  document.getElementById('help-button').addEventListener('click', () => help.open());

  (function init() {
    const s = store.load();
    state.symbology = SYMBOLOGIES.some((x) => x.id === s.symbology) ? s.symbology : 'code128';
    state.scale = clampInt(s.scale, BARCODE_LIMITS.scale[0], BARCODE_LIMITS.scale[1], 2);
    state.height = clampInt(s.height, BARCODE_LIMITS.height[0], BARCODE_LIMITS.height[1], 60);
    const q = clampInt(s.quiet, BARCODE_LIMITS.quiet[0], BARCODE_LIMITS.quiet[1], null);
    state.quiet = q === null ? '' : q;
    state.showText = !!s.showText;
    state.fg = normalizeHex(s.fg, DEFAULT_FG);
    state.bg = normalizeHex(s.bg, DEFAULT_BG);
    state.c39check = !!s.c39check;
    state.c39star = !!s.c39star;
    els.scale.value = state.scale;
    els.height.value = state.height;
    els.quiet.value = state.quiet;
    els.showText.checked = state.showText;
    els.fg.value = state.fg;
    els.bg.value = state.bg;
    els.c39check.checked = state.c39check;
    els.c39star.checked = state.c39star;
    symSeg.select(state.symbology);
    applySymbology(state.symbology, false);
    update();
  })();

  // ---- test hook (inert) --------------------------------------------------------------
  window.__barcodeGenerator = {
    encode, layout, toSvg, contrastWarning, state,
    setInput(text) { els.input.value = text; update(); },
    renderCanvas() { return state.enc && !state.enc.error ? renderBarcodeCanvas(state.enc, renderOpts()) : null; },
  };
