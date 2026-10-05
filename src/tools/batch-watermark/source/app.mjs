import { createModal } from '../../../lib/components/CtModal.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireDropzone, wireSegmented, showError, hideError, showWarning, hideWarning, announce } from '../../../lib/components/CtComponents.mjs';
// el, clamp, num, clampInt, onceFlag, debounce, persistState, downloadBlob, loadImageFile, canvasToBlob, FORMATS,
// mimeForFormat, formatSupportsQuality, hexToRgb, rgbToHex, formatBytes and the layout/naming/zip helpers come
// from logic.mjs's own imports (inlined once at the site below).

<<ct:inline logic.mjs>>

  // =====================================================================
  // Batch Watermark - app (DOM / canvas / state / preview / export only).
  // Layout, fonts, naming and zip assembly live in logic.mjs. One preview canvas
  // (selected image, downscaled) and one reused work canvas for the batch.
  // Images are decoded lazily per file and never persisted.
  // =====================================================================
  const STORAGE_KEY = 'batch-watermark:v1';
  const HELP_SEEN_KEY = 'batch-watermark:help-seen:v1';
  const PREVIEW_MAX_PX = 1200;
  const THUMB_PX = 48;
  const WARN_TOTAL_BYTES = 500 * 1024 * 1024;
  const MAX_RENDER_PX = 8000; // largest pre-rendered text canvas edge

  const SETTING_KEYS = Object.keys(DEFAULTS);
  const store = persistState(STORAGE_KEY, DEFAULTS);
  const state = Object.assign({}, DEFAULTS, { items: [], selectedId: 0, logo: null, previewImg: null, previewUrl: '', busy: false, cancel: false, nextId: 1, previewId: 0 });

  const $ = (id) => document.querySelector('[data-testid="' + id + '"]');
  const els = {
    file: document.getElementById('file-input'),
    drop: $('dropzone'),
    error: $('error-message'),
    warning: $('warning-message'),
    stats: $('stats'),
    status: $('export-status'),
    imagesCard: document.getElementById('images-card'),
    list: document.getElementById('item-list'),
    count: $('image-count'),
    clear: document.getElementById('clear-all'),
    textOpts: document.getElementById('text-opts'),
    imageOpts: document.getElementById('image-opts'),
    text: document.getElementById('text-input'),
    font: document.getElementById('font-select'),
    customFont: document.getElementById('custom-font'),
    fill: document.getElementById('fill-color'),
    strokeColor: document.getElementById('stroke-color'),
    strokeLevel: document.getElementById('stroke-level'),
    shadow: document.getElementById('shadow-toggle'),
    autoContrast: document.getElementById('auto-contrast'),
    logo: document.getElementById('logo-input'),
    logoStatus: $('logo-status'),
    scale: document.getElementById('scale-input'),
    opacity: document.getElementById('opacity-input'),
    rotation: document.getElementById('rotation-input'),
    margin: document.getElementById('margin-input'),
    offX: document.getElementById('offx-input'),
    offY: document.getElementById('offy-input'),
    tile: document.getElementById('tile-toggle'),
    gap: document.getElementById('gap-input'),
    gapField: document.getElementById('gap-field'),
    canvas: document.getElementById('preview-canvas'),
    quality: document.getElementById('quality-input'),
    qualityField: document.getElementById('quality-field'),
    qualityValue: $('quality-value'),
    formatHint: $('format-hint'),
    apply: document.getElementById('apply-btn'),
    each: document.getElementById('each-btn'),
    eachHint: document.getElementById('each-hint'),
    cancel: document.getElementById('cancel-btn'),
    progress: document.getElementById('progress'),
  };

  const settings = () => { const o = {}; for (const k of SETTING_KEYS) o[k] = state[k]; return o; };
  const save = () => store.save(settings());
  const tick = () => new Promise((res) => setTimeout(res, 0));
  const readyItems = () => state.items.filter((it) => it.status !== 'error');

  // ---- watermark rendering -----------------------------------------------
  const scratch = document.createElement('canvas').getContext('2d');
  const measureFor = (s) => (str, size) => {
    scratch.font = canvasFontString({ fontSize: size, fontFamily: s.fontFamily, customFont: s.customFont });
    return scratch.measureText(str).width;
  };
  const blockOpts = (s) => ({ strokeLevel: s.strokeLevel, shadow: s.shadow });

  let textCache = { key: '', canvas: null };
  function renderTextCanvas(s, fontPx) {
    const k = Math.min(1, MAX_RENDER_PX / Math.max(1, fontPx * 12)); // keep pre-rendered canvases bounded
    const px = Math.max(1, fontPx * k);
    const key = [s.text, s.fontFamily, s.customFont, s.fill, s.strokeLevel, s.strokeColor, s.shadow, Math.round(px * 4)].join('|');
    if (textCache.key === key && textCache.canvas) return textCache.canvas;
    const m = textBlockMetrics(s.text, px, measureFor(s), blockOpts(s));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.min(MAX_RENDER_PX, m.width));
    c.height = Math.max(1, Math.min(MAX_RENDER_PX, m.height));
    const ctx = c.getContext('2d');
    ctx.font = canvasFontString({ fontSize: px, fontFamily: s.fontFamily, customFont: s.customFont });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const sh = shadowFor(px, s.shadow);
    m.lines.forEach((line, i) => {
      const x = c.width / 2, y = m.pad + m.lineH * (i + 0.5);
      let shadowSpent = false;
      const withShadow = () => { if (s.shadow && !shadowSpent) { ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur; ctx.shadowOffsetX = sh.offset; ctx.shadowOffsetY = sh.offset; shadowSpent = true; } };
      const noShadow = () => { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
      if (m.stroke > 0) { // stroke BEFORE fill so the fill stays crisp on top
        withShadow();
        ctx.lineWidth = m.stroke;
        ctx.strokeStyle = s.strokeColor;
        ctx.strokeText(line, x, y);
        noShadow();
      }
      ctx.fillStyle = s.fill;
      withShadow();
      ctx.fillText(line, x, y);
      noShadow();
    });
    textCache = { key, canvas: c };
    return c;
  }

  // Resolve the watermark source + placements for a target of W x H pixels.
  function buildWatermark(W, H, s) {
    const base = { imgW: W, imgH: H, anchor: s.anchor, offsetPct: { x: s.offsetX, y: s.offsetY }, marginPct: s.margin, scalePct: s.scale, rotation: s.rotation, tile: s.tile, gapPct: s.gap };
    if (s.mode === 'image') {
      if (!state.logo) return null;
      const placements = layoutWatermark(Object.assign({ wmW: state.logo.width, wmH: state.logo.height }, base));
      return placements.length ? { src: state.logo.img, placements } : null;
    }
    if (!String(s.text).trim()) return null;
    const m0 = textBlockMetrics(s.text, REF_FONT_PX, measureFor(s), blockOpts(s));
    const placements = layoutWatermark(Object.assign({ wmW: m0.width, wmH: m0.height }, base));
    if (!placements.length) return null;
    const fontPx = REF_FONT_PX * placements[0].w / m0.width;
    return { src: renderTextCanvas(s, fontPx), placements };
  }

  function drawWatermark(ctx, wm, opacity) {
    if (!wm) return;
    ctx.save();
    ctx.globalAlpha = clamp(num(opacity, 100), 0, 100) / 100;
    ctx.imageSmoothingQuality = 'high';
    for (const p of wm.placements) {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.drawImage(wm.src, -p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.restore();
  }

  // The ONE composition path: used by the preview (downscaled W x H) and by the export (natural size).
  function compose(canvas, img, W, H, s, lossy) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (lossy) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, W, H);
    drawWatermark(ctx, buildWatermark(W, H, s), s.opacity);
  }

  // ---- preview -------------------------------------------------------------
  function renderPreview() {
    const c = els.canvas;
    const it = state.items.find((x) => x.id === state.selectedId);
    if (!it || !state.previewImg || state.previewId !== it.id) { c.classList.add('empty'); return; }
    c.classList.remove('empty');
    const k = Math.min(1, PREVIEW_MAX_PX / Math.max(it.w, it.h));
    compose(c, state.previewImg, Math.max(1, Math.round(it.w * k)), Math.max(1, Math.round(it.h * k)), settings(), false);
    els.stats.textContent = 'Previewing ' + it.name + ' (' + it.w + ' x ' + it.h + '). These settings apply to all ' + readyItems().length + ' image(s).';
  }
  const previewDebounced = debounce(renderPreview, 40);

  async function selectItem(id) {
    const it = state.items.find((x) => x.id === id);
    state.selectedId = it ? it.id : 0;
    state.previewImg = null;
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
    state.previewId = 0;
    renderList();
    if (!it || it.status === 'error') { renderPreview(); if (!it) els.stats.textContent = 'Add images to begin.'; return; }
    try {
      const loaded = await loadImageFile(it.file);
      if (state.selectedId !== id) { URL.revokeObjectURL(loaded.url); return; } // raced by another click
      state.previewImg = loaded.img; state.previewUrl = loaded.url; state.previewId = id;
      renderPreview();
    } catch (e) {
      it.status = 'error'; it.detail = 'Could not read this file as an image.';
      renderList(); renderPreview();
    }
  }

  // ---- item list -----------------------------------------------------------
  function renderList() {
    els.list.textContent = '';
    for (const it of state.items) {
      const li = el('li', { class: 'item' + (it.id === state.selectedId ? ' selected' : '') + (it.status === 'error' ? ' error' : ''), 'data-testid': 'item-row', 'data-status': it.status });
      const thumbBtn = el('button', { type: 'button', class: 'thumb-btn', 'aria-label': 'Preview ' + it.name, 'data-testid': 'item-select' }, it.thumb ? [it.thumb] : []);
      thumbBtn.addEventListener('click', () => selectItem(it.id));
      const detail = it.detail || (it.w + ' x ' + it.h + ' - ' + formatBytes(it.size));
      const meta = el('div', { class: 'meta' }, [
        el('span', { class: 'name', textContent: it.name, title: it.name, 'data-testid': 'item-name' }),
        el('span', { class: 'detail', textContent: detail, 'data-testid': 'item-detail' }),
      ]);
      const rm = el('button', { type: 'button', class: 'remove', textContent: 'Remove', title: 'Remove ' + it.name, 'aria-label': 'Remove ' + it.name, 'data-testid': 'item-remove' });
      rm.addEventListener('click', () => removeItem(it.id));
      li.append(thumbBtn, meta, rm);
      els.list.appendChild(li);
    }
    els.imagesCard.hidden = !state.items.length;
    const n = readyItems().length;
    els.count.textContent = state.items.length ? '(' + n + ' ready' + (n < state.items.length ? ', ' + (state.items.length - n) + ' skipped' : '') + ')' : '';
    updateControls();
  }

  function removeItem(id) {
    state.items = state.items.filter((x) => x.id !== id);
    if (state.selectedId === id) selectItem(readyItems()[0] ? readyItems()[0].id : 0);
    else renderList();
  }

  function updateControls() {
    const n = readyItems().length;
    els.apply.disabled = state.busy || n === 0;
    els.each.hidden = n < 2;
    els.each.disabled = state.busy || n < 2;
    els.eachHint.hidden = n < 2;
    els.apply.textContent = n > 1 ? 'Apply to all & download .zip' : 'Apply & download';
    els.clear.disabled = state.busy;
    const fmtShown = FORMATS[state.format] ? state.format : null;
    const someLossy = readyItems().some((it) => FORMATS[formatForSource(it.mime)].lossy);
    els.qualityField.hidden = fmtShown ? !formatSupportsQuality(fmtShown) : !someLossy;
    // transparency / format hint
    const forced = FORMATS[state.format] ? state.format : null;
    if (forced === 'jpeg' && readyItems().some((it) => losesAlpha(it.mime, 'jpeg'))) {
      els.formatHint.textContent = 'JPEG has no transparency: transparent areas of PNG/WebP/GIF/SVG sources become white.';
    } else if (!forced) {
      els.formatHint.textContent = 'Each image keeps its own format (GIF, BMP and SVG become PNG).';
    } else els.formatHint.textContent = '';
  }

  // ---- loading -------------------------------------------------------------
  function makeThumb(img, w, h) {
    const k = Math.min(1, THUMB_PX / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function addFiles(files) {
    hideError(els.error);
    const list = Array.from(files || []);
    if (!list.length || state.busy) return;
    let skipped = 0, warned = '';
    for (const file of list) {
      const it = { id: state.nextId++, file, name: file.name || 'image', size: file.size, mime: file.type, w: 0, h: 0, status: 'ready', detail: '', thumb: null };
      const pre = checkImageLimits({ bytes: file.size });
      if (pre.level === 'error') { it.status = 'error'; it.detail = pre.message; skipped++; }
      else {
        try {
          const loaded = await loadImageFile(file, { revoke: true });
          it.w = loaded.width; it.h = loaded.height;
          const dim = checkImageLimits({ bytes: file.size, width: it.w, height: it.h });
          if (dim.level === 'error') { it.status = 'error'; it.detail = dim.message; skipped++; }
          else {
            if (dim.level === 'warn') warned = dim.message;
            it.thumb = makeThumb(loaded.img, it.w, it.h);
          }
        } catch (e) { it.status = 'error'; it.detail = 'Could not read this file as an image.'; skipped++; }
      }
      state.items.push(it);
    }
    hideWarning(els.warning);
    const total = state.items.reduce((a, it) => a + it.size, 0);
    if (total > WARN_TOTAL_BYTES) showWarning(els.warning, 'These images total ' + formatBytes(total) + ' - the zip is built in memory, so a large batch may be slow or fail. Consider exporting in smaller groups.');
    else if (warned) showWarning(els.warning, warned);
    if (skipped) showError(els.error, skipped + ' file(s) could not be used and will be skipped - see the list.');
    announce('Added ' + (list.length - skipped) + ' image(s).');
    const sel = state.items.find((x) => x.id === state.selectedId && x.status !== 'error');
    if (sel) renderList(); else await selectItem(readyItems()[0] ? readyItems()[0].id : 0);
  }

  async function loadLogo(file) {
    if (!file) return;
    try {
      const loaded = await loadImageFile(file);
      if (!loaded.width || !loaded.height) throw new Error('no size');
      if (state.logo && state.logo.url) URL.revokeObjectURL(state.logo.url);
      state.logo = loaded;
      els.logoStatus.textContent = file.name + ' (' + loaded.width + ' x ' + loaded.height + ')';
      hideError(els.error);
      renderPreview();
    } catch (e) {
      showError(els.error, 'Could not read that logo as an image.');
    }
  }

  // ---- export --------------------------------------------------------------
  const workCanvas = document.createElement('canvas');

  async function runExport(kind) {
    renderPreview(); // flush any pending debounced preview so the export matches the inputs
    const queue = readyItems();
    if (state.busy || !queue.length) return;
    if (state.mode === 'image' && !state.logo) { showError(els.error, 'Choose a logo image first (or switch to Text).'); return; }
    if (state.mode === 'text' && !String(state.text).trim()) { showError(els.error, 'Type some watermark text first.'); return; }
    state.busy = true; state.cancel = false;
    hideError(els.error);
    updateControls();
    els.cancel.hidden = false; els.progress.hidden = false; els.progress.max = queue.length; els.progress.value = 0;
    const s = settings();
    const used = new Set();
    const out = [];
    let failed = 0, done = 0;
    try {
      for (let i = 0; i < queue.length; i++) {
        if (state.cancel) break;
        const it = queue[i];
        els.status.textContent = 'Watermarking ' + (i + 1) + '/' + queue.length + '...';
        els.progress.value = i;
        await tick();
        try {
          const loaded = await loadImageFile(it.file, { revoke: true });
          const lim = checkImageLimits({ bytes: it.size, width: loaded.width, height: loaded.height });
          if (lim.level === 'error') throw new Error(lim.message);
          const fk = outputFormat(s.format, it.mime);
          const mime = mimeForFormat(fk);
          compose(workCanvas, loaded.img, loaded.width, loaded.height, s, FORMATS[fk].lossy);
          const blob = await canvasToBlob(workCanvas, mime, formatSupportsQuality(fk) ? s.quality / 100 : undefined);
          // A browser that cannot encode the type falls back to PNG; treat that as a failure for this file.
          if (!blob || blob.type !== mime) throw new Error('Your browser could not encode ' + FORMATS[fk].label + '.');
          const bytes = new Uint8Array(await blob.arrayBuffer());
          out.push({ name: uniqueName(it.name, FORMATS[fk].ext, used), bytes, blob });
          it.status = 'done'; it.detail = 'Done - ' + formatBytes(bytes.length);
          done++;
        } catch (e) {
          it.status = 'error'; it.detail = 'Failed: ' + (e && e.message ? e.message : 'could not process this file.');
          failed++;
        }
        renderList();
      }
      els.progress.value = queue.length;
      if (!out.length) {
        els.status.textContent = state.cancel ? 'Cancelled.' : '';
        if (!state.cancel) showError(els.error, 'No images could be watermarked - see the list for details.');
        return;
      }
      if (out.length === 1 && queue.length === 1 || kind === 'single') {
        downloadBlob(out[0].blob, out[0].name, out[0].blob.type);
      } else if (kind === 'each') {
        for (const f of out) { downloadBlob(f.blob, f.name, f.blob.type); await new Promise((r) => setTimeout(r, 200)); }
      } else {
        const zip = buildZip(out.map((f) => ({ name: f.name, bytes: f.bytes })));
        downloadBlob(new Blob([zip], { type: 'application/zip' }), zipName(), 'application/zip');
        els.status.textContent = '';
      }
      els.status.textContent = done + ' watermarked' + (failed ? ', ' + failed + ' failed' : '') + (state.cancel ? ' (cancelled)' : '') + '.';
      if (failed) showError(els.error, failed + ' file(s) failed and were left out - see the list.');
      announce('Exported ' + done + ' watermarked image(s).');
    } finally {
      state.busy = false;
      els.cancel.hidden = true; els.progress.hidden = true;
      workCanvas.width = 1; workCanvas.height = 1; // release the big backing store
      renderList();
    }
  }

  // ---- events --------------------------------------------------------------
  els.file.addEventListener('change', () => { addFiles(els.file.files); els.file.value = ''; });
  wireDropzone(els.drop, (files) => addFiles(files), { dragClass: 'drag-over' });
  els.clear.addEventListener('click', () => { state.items = []; selectItem(0); hideError(els.error); hideWarning(els.warning); els.status.textContent = ''; });
  els.apply.addEventListener('click', () => runExport('auto'));
  els.each.addEventListener('click', () => runExport('each'));
  els.cancel.addEventListener('click', () => { state.cancel = true; });
  els.logo.addEventListener('change', () => { loadLogo(els.logo.files && els.logo.files[0]); });

  const changed = () => { save(); previewDebounced(); };
  const numField = (input, key, lo, hi) => input.addEventListener('input', () => {
    if (input.value.trim() === '') return; // blank / partial typing: keep the last good value
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    state[key] = clamp(v, lo, hi);
    changed();
  });
  numField(els.scale, 'scale', 1, 100);
  numField(els.opacity, 'opacity', 0, 100);
  numField(els.rotation, 'rotation', -180, 180);
  numField(els.margin, 'margin', 0, 50);
  numField(els.offX, 'offsetX', -100, 100);
  numField(els.offY, 'offsetY', -100, 100);
  numField(els.gap, 'gap', 0, 200);
  numField(els.strokeLevel, 'strokeLevel', 0, 20);
  els.text.addEventListener('input', () => { state.text = els.text.value; changed(); });
  els.font.addEventListener('change', () => { state.fontFamily = els.font.value; changed(); });
  els.customFont.addEventListener('input', () => { state.customFont = els.customFont.value.slice(0, 80); changed(); });
  els.fill.addEventListener('input', () => { state.fill = rgbToHex(hexToRgb(els.fill.value) || [255, 255, 255]); changed(); });
  els.strokeColor.addEventListener('input', () => { state.strokeColor = rgbToHex(hexToRgb(els.strokeColor.value) || [0, 0, 0]); changed(); });
  els.shadow.addEventListener('change', () => { state.shadow = els.shadow.checked; changed(); });
  els.tile.addEventListener('change', () => { state.tile = els.tile.checked; els.gapField.hidden = !state.tile; changed(); });
  els.autoContrast.addEventListener('click', () => {
    Object.assign(state, { fill: '#ffffff', strokeColor: '#000000', strokeLevel: 5, shadow: true });
    syncInputs(); changed();
  });
  els.quality.addEventListener('input', () => { state.quality = clampInt(els.quality.value, 10, 100, 92); els.qualityValue.textContent = state.quality; save(); });

  const modeSeg = wireSegmented($('mode-seg'), (v) => {
    state.mode = v === 'image' ? 'image' : 'text';
    els.textOpts.hidden = state.mode !== 'text';
    els.imageOpts.hidden = state.mode !== 'image';
    changed();
  });
  const anchorSeg = wireSegmented($('anchor-grid'), (v) => { state.anchor = ANCHORS.includes(v) ? v : 'br'; changed(); });
  const formatSeg = wireSegmented($('format-seg'), (v) => {
    state.format = (v === 'source' || FORMATS[v]) ? v : 'source';
    updateControls(); save();
  });

  window.addEventListener('resize', debounce(renderPreview, 150));

  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How Batch Watermark works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  document.getElementById('help-button').addEventListener('click', () => help.open());

  function syncInputs() {
    els.text.value = state.text;
    els.font.value = state.fontFamily;
    els.customFont.value = state.customFont;
    els.fill.value = state.fill;
    els.strokeColor.value = state.strokeColor;
    els.strokeLevel.value = state.strokeLevel;
    els.shadow.checked = state.shadow;
    els.scale.value = state.scale; els.opacity.value = state.opacity; els.rotation.value = state.rotation;
    els.margin.value = state.margin; els.offX.value = state.offsetX; els.offY.value = state.offsetY;
    els.tile.checked = state.tile; els.gap.value = state.gap; els.gapField.hidden = !state.tile;
    els.quality.value = state.quality; els.qualityValue.textContent = state.quality;
  }

  (function init() {
    for (const f of CURATED_FONTS) els.font.appendChild(el('option', { value: f.name, textContent: f.name }));
    const s = store.load() || {};
    state.text = typeof s.text === 'string' ? s.text.slice(0, 500) : DEFAULTS.text;
    state.fontFamily = CURATED_FONTS.some((f) => f.name === s.fontFamily) ? s.fontFamily : DEFAULTS.fontFamily;
    state.customFont = typeof s.customFont === 'string' ? s.customFont.slice(0, 80) : '';
    state.fill = rgbToHex(hexToRgb(s.fill) || [255, 255, 255]);
    state.strokeColor = rgbToHex(hexToRgb(s.strokeColor) || [0, 0, 0]);
    state.strokeLevel = clamp(num(s.strokeLevel, DEFAULTS.strokeLevel), 0, 20);
    state.shadow = s.shadow === undefined ? DEFAULTS.shadow : !!s.shadow;
    state.scale = clamp(num(s.scale, DEFAULTS.scale), 1, 100);
    state.opacity = clamp(num(s.opacity, DEFAULTS.opacity), 0, 100);
    state.rotation = clamp(num(s.rotation, 0), -180, 180);
    state.margin = clamp(num(s.margin, DEFAULTS.margin), 0, 50);
    state.offsetX = clamp(num(s.offsetX, 0), -100, 100);
    state.offsetY = clamp(num(s.offsetY, 0), -100, 100);
    state.tile = !!s.tile;
    state.gap = clamp(num(s.gap, DEFAULTS.gap), 0, 200);
    state.quality = clampInt(s.quality, 10, 100, DEFAULTS.quality);
    syncInputs();
    modeSeg.select(s.mode === 'image' ? 'image' : 'text');
    anchorSeg.select(ANCHORS.includes(s.anchor) ? s.anchor : DEFAULTS.anchor);
    formatSeg.select(s.format === 'source' || FORMATS[s.format] ? s.format : 'source');
    renderList();
  })();

  // ---- test hook (inert) -----------------------------------------------------
  window.__batchWatermark = {
    state, layoutWatermark, uniqueName, outputFormat, textBlockMetrics,
    items() { return state.items.map((it) => ({ name: it.name, status: it.status, detail: it.detail, w: it.w, h: it.h })); },
  };
