import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireDropzone, showError, hideError, showWarning, hideWarning } from '../../../lib/components/CtComponents.mjs';
import { clampInt, debounce, downloadBlob, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // dither-studio — app.mjs (DOM / canvas / pipeline / export / persistence).
  // The pure engine is inlined below via the ct:inline logic.mjs token.
  // =====================================================================

  // ---- Pure logic (inlined) ---------------------------------------------
<<ct:inline logic.mjs>>

  // ---- 1. DOM refs -------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const fileInputEl = document.getElementById('fileInput');
  const dropzoneEl = document.querySelector('.dropzone');
  const errorEl = $('[data-testid="error"]');
  const warningEl = $('[data-testid="warning"]');

  const loadedSectionEl = $('[data-testid="loaded-section"]');
  const originalNameEl = $('[data-testid="original-name"]');
  const originalDimsEl = $('[data-testid="original-dims"]');
  const removeFileBtn = $('[data-testid="remove-file-btn"]');

  const paletteModeEl = document.getElementById('paletteMode');
  const presetFieldEl = $('[data-testid="preset-field"]');
  const presetSelectEl = document.getElementById('presetSelect');
  const grayscaleFieldEl = $('[data-testid="grayscale-field"]');
  const grayscaleRangeEl = document.getElementById('grayscaleRange');
  const grayscaleValueEl = $('[data-testid="grayscale-value"]');
  const autoFieldEl = $('[data-testid="auto-field"]');
  const autoRangeEl = document.getElementById('autoRange');
  const autoValueEl = $('[data-testid="auto-value"]');
  const customFieldEl = $('[data-testid="custom-field"]');
  const swatchTableEl = $('[data-testid="swatch-table"]');
  const addSwatchBtn = $('[data-testid="add-swatch-btn"]');
  const loadCurrentBtn = $('[data-testid="load-current-btn"]');
  const removeAllBtn = $('[data-testid="remove-all-btn"]');

  const ditherSelectEl = document.getElementById('ditherSelect');
  const pixelRangeEl = document.getElementById('pixelRange');
  const pixelValueEl = $('[data-testid="pixel-value"]');
  const brightnessRangeEl = document.getElementById('brightnessRange');
  const brightnessValueEl = $('[data-testid="brightness-value"]');
  const contrastRangeEl = document.getElementById('contrastRange');
  const contrastValueEl = $('[data-testid="contrast-value"]');

  const outputDimsEl = $('[data-testid="output-dims"]');
  const outputColorsEl = $('[data-testid="output-colors"]');
  const exportPngBtn = document.getElementById('exportPngBtn');
  const exportIndexedBtn = document.getElementById('exportIndexedBtn');
  const copyPaletteBtn = document.getElementById('copyPaletteBtn');
  const downloadGplBtn = document.getElementById('downloadGplBtn');
  const resetBtn = document.getElementById('resetBtn');
  const indexedNoteEl = $('[data-testid="indexed-note"]');

  const compareEl = $('[data-testid="compare"]');
  const afterCanvasEl = $('[data-testid="after-canvas"]');
  const beforeCanvasEl = $('[data-testid="before-canvas"]');
  const beforeWrapEl = $('[data-testid="before-wrap"]');
  const splitRangeEl = document.getElementById('splitRange');
  const paletteStripEl = $('[data-testid="palette-strip"]');

  const helpButtonEl = document.getElementById('help-button');

  const CAN_DEFLATE = typeof CompressionStream === 'function';

  // ---- 2. State & persistence -------------------------------------------
  const DEFAULT_OPTIONS = {
    mode: 'preset', preset: 'gameboy', grayN: 4, autoN: 16,
    custom: ['#000000', '#ffffff'], dither: 'fs', pixel: 1,
    brightness: 0, contrast: 0, split: 50,
  };

  const state = {
    img: null, natW: 0, natH: 0, fileName: '', objectUrl: null,
    srcImageData: null,           // ImageData at natural resolution
    // options (persisted)
    mode: DEFAULT_OPTIONS.mode,
    preset: DEFAULT_OPTIONS.preset,
    grayN: DEFAULT_OPTIONS.grayN,
    autoN: DEFAULT_OPTIONS.autoN,
    custom: DEFAULT_OPTIONS.custom.slice(),
    dither: DEFAULT_OPTIONS.dither,
    pixel: DEFAULT_OPTIONS.pixel,
    brightness: DEFAULT_OPTIONS.brightness,
    contrast: DEFAULT_OPTIONS.contrast,
    split: DEFAULT_OPTIONS.split,
    // last processed (transient)
    lastIndices: null, lastPalette: null, procW: 0, procH: 0,
  };

  const STORAGE_KEY = 'dither-studio:v1';
  const HELP_SEEN_KEY = 'dither-studio:help-seen:v1';


  function saveOptions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode, preset: state.preset, grayN: state.grayN, autoN: state.autoN,
        custom: state.custom, dither: state.dither, pixel: state.pixel,
        brightness: state.brightness, contrast: state.contrast, split: state.split,
      }));
    } catch (e) {}
  }

  // Numeric guard from lib/util.js: parseInt(v,10) then clamp to [lo,hi],
  // returning the fallback for non-integer input.

  function loadOptions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_OPTIONS };
      const p = JSON.parse(raw) || {};
      const custom = Array.isArray(p.custom)
        ? p.custom.filter((h) => hexToRgb(h)).map((h) => rgbToHex(hexToRgb(h)))
        : DEFAULT_OPTIONS.custom.slice();
      const validDither = { none: 1, fs: 1, atkinson: 1, bayer4: 1, bayer8: 1 };
      const validMode = { preset: 1, auto: 1, custom: 1 };
      return {
        mode: validMode[p.mode] ? p.mode : DEFAULT_OPTIONS.mode,
        preset: (p.preset === 'grayscale' || paletteById(p.preset)) ? p.preset : DEFAULT_OPTIONS.preset,
        grayN: clampInt(p.grayN, 2, 64, DEFAULT_OPTIONS.grayN),
        autoN: clampInt(p.autoN, 2, 256, DEFAULT_OPTIONS.autoN),
        custom: custom,
        dither: validDither[p.dither] ? p.dither : DEFAULT_OPTIONS.dither,
        pixel: clampInt(p.pixel, 1, 16, DEFAULT_OPTIONS.pixel),
        brightness: clampInt(p.brightness, -100, 100, 0),
        contrast: clampInt(p.contrast, -100, 100, 0),
        split: clampInt(p.split, 0, 100, 50),
      };
    } catch (e) { return { ...DEFAULT_OPTIONS }; }
  }

  // ---- 3. Small helpers --------------------------------------------------
  // Shared trailing-edge debounce (lib/util.js, inlined as a global).
  function showErrorBanner(msg) { showError(errorEl, msg); }
  function hideErrorBanner() { hideError(errorEl); errorEl.textContent = ''; }
  function showWarningBanner(msg) { showWarning(warningEl, msg); }
  function hideWarningBanner() { hideWarning(warningEl); warningEl.textContent = ''; }

  // ---- 4. Image loading --------------------------------------------------
  function loadFile(file) {
    if (!file) return;
    hideErrorBanner();
    if (file.type && !/^image\//.test(file.type)) {
      showErrorBanner("That doesn't look like an image (type: " + (file.type || 'unknown') + ').');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => adoptImage(img, url, file.name || 'image');
    img.onerror = () => { URL.revokeObjectURL(url); showErrorBanner('Could not decode that image — it may be corrupt or unsupported.'); };
    img.src = url;
  }

  // Test entry point: load a known image from a data URL (no file dialog).
  function loadImageFromDataURL(dataUrl, name) {
    hideErrorBanner();
    const img = new Image();
    img.onload = () => adoptImage(img, null, name || 'image.png');
    img.onerror = () => showErrorBanner('Could not decode that image.');
    img.src = dataUrl;
  }

  function adoptImage(img, objectUrl, name) {
    if (state.objectUrl) { try { URL.revokeObjectURL(state.objectUrl); } catch (e) {} }
    state.img = img;
    state.objectUrl = objectUrl;
    state.natW = img.naturalWidth;
    state.natH = img.naturalHeight;
    state.fileName = name || 'image';

    // Read source pixels once, at natural resolution.
    const c = document.createElement('canvas');
    c.width = state.natW; c.height = state.natH;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    try {
      state.srcImageData = cx.getImageData(0, 0, state.natW, state.natH);
    } catch (e) {
      showErrorBanner('Could not read image pixels (the image may be cross-origin).');
      return;
    }

    // Draw the untouched original into the "before" canvas.
    beforeCanvasEl.width = state.natW; beforeCanvasEl.height = state.natH;
    beforeCanvasEl.getContext('2d').drawImage(img, 0, 0);

    originalNameEl.textContent = state.fileName;
    originalDimsEl.textContent = state.natW + '×' + state.natH;
    loadedSectionEl.hidden = false;

    setDisplaySize();
    process();
  }

  fileInputEl.addEventListener('change', () => {
    if (fileInputEl.files && fileInputEl.files[0]) loadFile(fileInputEl.files[0]);
  });
  wireDropzone(dropzoneEl, (files) => {
    const file = files[0];
    if (file) loadFile(file);
  }, { dragClass: 'drag-over' });

  // ---- 5. Palette resolution --------------------------------------------
  function customPalette() { return parsePalette(state.custom); }

  // Resolve the active palette. procData used only for auto (median-cut).
  function activePalette(procData) {
    if (state.mode === 'auto') return medianCut(procData, state.autoN);
    if (state.mode === 'custom') return customPalette();
    if (state.preset === 'grayscale') return grayscalePalette(state.grayN);
    const pal = paletteById(state.preset);
    return pal ? pal.colors : PALETTES[0].colors;
  }

  // ---- 6. Processing pipeline -------------------------------------------
  function ditherToIndices(rgba, w, h, palette) {
    switch (state.dither) {
      case 'fs': return floydSteinberg(rgba, w, h, palette);
      case 'atkinson': return atkinson(rgba, w, h, palette);
      case 'bayer4': return bayer(rgba, w, h, palette, { order: 4 });
      case 'bayer8': return bayer(rgba, w, h, palette, { order: 8 });
      default: return mapNearest(rgba, palette);
    }
  }

  function process() {
    if (!state.srcImageData) return;
    hideErrorBanner();

    // 1. brightness / contrast LUT
    let adjusted = state.srcImageData.data;
    if (state.brightness !== 0 || state.contrast !== 0) {
      adjusted = applyLUT(adjusted, buildBrightnessContrastLUT(state.brightness, state.contrast));
    }
    // 2. pixel scale (area-average downscale)
    const scaled = pixelScale(adjusted, state.natW, state.natH, state.pixel);
    // 3. palette
    const palette = activePalette(scaled.data);
    if (!palette || palette.length === 0) {
      showWarningBanner('Add at least one color to the custom palette.');
      disableExports();
      return;
    }
    hideWarningBanner();
    if (scaled.width * scaled.height > 4000000) {
      showWarningBanner('Large image — raise the pixel scale if processing feels slow.');
    }
    // 4. dither → indices
    const indices = ditherToIndices(scaled.data, scaled.width, scaled.height, palette);
    // 5. indices → rgba → after canvas (backing store = processed resolution)
    const rgba = indicesToRgba(indices, palette);
    afterCanvasEl.width = scaled.width; afterCanvasEl.height = scaled.height;
    afterCanvasEl.getContext('2d').putImageData(new ImageData(rgba, scaled.width, scaled.height), 0, 0);

    state.lastIndices = indices; state.lastPalette = palette;
    state.procW = scaled.width; state.procH = scaled.height;

    renderPaletteStrip(palette);
    outputDimsEl.textContent = (scaled.width * state.pixel) + '×' + (scaled.height * state.pixel);
    outputColorsEl.textContent = palette.length + (palette.length === 1 ? ' color' : ' colors');
    enableExports(palette.length);
    setDisplaySize();
  }
  const debouncedProcess = debounce(process, 120);

  function renderPaletteStrip(palette) {
    paletteStripEl.textContent = '';
    const max = Math.min(palette.length, 256);
    for (let i = 0; i < max; i++) {
      const s = document.createElement('span');
      s.style.background = rgbToHex(palette[i]);
      s.title = rgbToHex(palette[i]);
      paletteStripEl.appendChild(s);
    }
  }

  // Size both canvases to one shared display box so the wipe aligns.
  function setDisplaySize() {
    if (!state.natW) return;
    const containerW = Math.max(80, compareEl.clientWidth || 320);
    const dispW = Math.min(containerW, state.natW);
    const dispH = Math.round(dispW * state.natH / state.natW);
    [afterCanvasEl, beforeCanvasEl].forEach((c) => {
      c.style.width = dispW + 'px';
      c.style.height = dispH + 'px';
    });
  }

  // ---- 7. Before / after split ------------------------------------------
  function setSplit(pct, persist) {
    pct = Math.max(0, Math.min(100, pct));
    state.split = pct;
    compareEl.style.setProperty('--split', pct + '%');
    splitRangeEl.value = String(Math.round(pct));
    if (persist) saveOptions();
  }
  splitRangeEl.addEventListener('input', () => setSplit(parseFloat(splitRangeEl.value), true));

  let dragging = false;
  function splitFromEvent(e) {
    const rect = compareEl.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    setSplit((x / rect.width) * 100, true);
  }
  compareEl.addEventListener('pointerdown', (e) => { dragging = true; compareEl.setPointerCapture(e.pointerId); splitFromEvent(e); });
  compareEl.addEventListener('pointermove', (e) => { if (dragging) splitFromEvent(e); });
  compareEl.addEventListener('pointerup', () => { dragging = false; });
  compareEl.addEventListener('pointercancel', () => { dragging = false; });

  // ---- 8. Exports --------------------------------------------------------
  function enableExports(paletteLen) {
    exportPngBtn.disabled = false;
    copyPaletteBtn.disabled = false;
    downloadGplBtn.disabled = false;
    exportIndexedBtn.disabled = !(CAN_DEFLATE && paletteLen <= 256);
  }
  function disableExports() {
    exportPngBtn.disabled = true; exportIndexedBtn.disabled = true;
    copyPaletteBtn.disabled = true; downloadGplBtn.disabled = true;
  }

  function baseName() { return (state.fileName || 'image').replace(/\.[^.]+$/, '') || 'image'; }

  // Shared blob/objectURL download trigger (lib/util.js, global).

  // Nearest-neighbour upscale of the processed index buffer by the pixel factor.
  function upscaleIndices(indices, w, h, factor) {
    if (factor <= 1) return { data: indices, width: w, height: h };
    const outW = w * factor, outH = h * factor;
    const out = new Uint8Array(outW * outH);
    for (let y = 0; y < outH; y++) {
      const sy = (y / factor) | 0;
      for (let x = 0; x < outW; x++) {
        out[y * outW + x] = indices[sy * w + ((x / factor) | 0)];
      }
    }
    return { data: out, width: outW, height: outH };
  }

  // Export the visible (upscaled, chunky) result as a true-color PNG.
  exportPngBtn.addEventListener('click', () => {
    if (!state.lastIndices) return;
    const outW = state.procW * state.pixel, outH = state.procH * state.pixel;
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(afterCanvasEl, 0, 0, outW, outH);
    c.toBlob((blob) => { if (blob) downloadBlob(blob, baseName() + '-dithered.png'); }, 'image/png');
  });

  async function deflate(bytes) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(bytes); writer.close();
    const ab = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(ab);
  }

  // Assemble an indexed PNG-8 (async — uses the browser DEFLATE for IDAT).
  async function encodeIndexedPng(indices, w, h, palette) {
    const filtered = filterIndexRows(indices, w, h);
    const deflated = await deflate(filtered);
    return assembleIndexedPng(w, h, palette, deflated);
  }

  exportIndexedBtn.addEventListener('click', async () => {
    if (!state.lastIndices || !CAN_DEFLATE) return;
    exportIndexedBtn.disabled = true;
    try {
      const ups = upscaleIndices(state.lastIndices, state.procW, state.procH, state.pixel);
      const png = await encodeIndexedPng(ups.data, ups.width, ups.height, state.lastPalette);
      downloadBlob(new Blob([png], { type: 'image/png' }), baseName() + '-indexed.png');
    } catch (e) {
      showErrorBanner('Indexed PNG export failed: ' + e.message);
    } finally {
      exportIndexedBtn.disabled = !(CAN_DEFLATE && state.lastPalette && state.lastPalette.length <= 256);
    }
  });

  copyPaletteBtn.addEventListener('click', async () => {
    if (!state.lastPalette) return;
    const ok = await copy(paletteToHexList(state.lastPalette));
    if (ok) flash(copyPaletteBtn, { label: 'Copied!', revertTo: 'Copy palette' });
  });

  downloadGplBtn.addEventListener('click', () => {
    if (!state.lastPalette) return;
    const gpl = paletteToGpl(state.lastPalette, baseName());
    downloadBlob(new Blob([gpl], { type: 'text/plain' }), baseName() + '.gpl');
  });

  // ---- 9. Custom palette table ------------------------------------------
  function renderSwatchTable() {
    swatchTableEl.textContent = '';
    if (state.custom.length === 0) {
      const p = document.createElement('p');
      p.className = 'swatch-empty';
      p.textContent = 'No colors yet — add one, or click “Load current”.';
      swatchTableEl.appendChild(p);
      return;
    }
    state.custom.forEach((hex, i) => {
      const row = document.createElement('div');
      row.className = 'swatch-row';

      const color = document.createElement('input');
      color.type = 'color'; color.value = hex; color.setAttribute('aria-label', 'Color ' + (i + 1));
      color.dataset.testid = 'swatch-color-' + i;

      const text = document.createElement('input');
      text.type = 'text'; text.value = hex; text.setAttribute('aria-label', 'Hex ' + (i + 1));
      text.dataset.testid = 'swatch-hex-' + i;

      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'swatch-remove'; remove.textContent = '✕';
      remove.title = 'Remove color'; remove.setAttribute('aria-label', 'Remove color ' + (i + 1));
      remove.dataset.testid = 'swatch-remove-' + i;

      color.addEventListener('input', () => {
        state.custom[i] = color.value; text.value = color.value;
        saveOptions(); if (state.mode === 'custom') debouncedProcess();
      });
      text.addEventListener('input', () => {
        const rgb = hexToRgb(text.value);
        if (rgb) { const h = rgbToHex(rgb); state.custom[i] = h; color.value = h;
          saveOptions(); if (state.mode === 'custom') debouncedProcess(); }
      });
      // Single-swatch remove is trivially reversible → no confirm (per DESIGN.md).
      remove.addEventListener('click', () => {
        state.custom.splice(i, 1); saveOptions(); renderSwatchTable();
        if (state.mode === 'custom') process();
      });

      row.appendChild(color); row.appendChild(text); row.appendChild(remove);
      swatchTableEl.appendChild(row);
    });
  }

  addSwatchBtn.addEventListener('click', () => {
    state.custom.push('#000000'); saveOptions(); renderSwatchTable();
    if (state.mode === 'custom') process();
  });
  loadCurrentBtn.addEventListener('click', () => {
    const pal = state.lastPalette || activePalette(state.srcImageData ? state.srcImageData.data : new Uint8ClampedArray(4));
    state.custom = pal.slice(0, 256).map((c) => rgbToHex(c));
    saveOptions(); renderSwatchTable();
    if (state.mode === 'custom') process();
  });
  removeAllBtn.addEventListener('click', async () => {
    if (state.custom.length === 0) return;
    if (typeof confirmDialog === 'function') {
      const ok = await confirmDialog('Remove all custom colors?');
      if (!ok) return;
    }
    state.custom = []; saveOptions(); renderSwatchTable();
    if (state.mode === 'custom') process();
  });

  // ---- 10. Control wiring -----------------------------------------------
  function updateModeVisibility() {
    presetFieldEl.hidden = state.mode !== 'preset';
    grayscaleFieldEl.hidden = !(state.mode === 'preset' && state.preset === 'grayscale');
    autoFieldEl.hidden = state.mode !== 'auto';
    customFieldEl.hidden = state.mode !== 'custom';
  }

  paletteModeEl.addEventListener('change', () => {
    state.mode = paletteModeEl.value; updateModeVisibility(); saveOptions(); process();
  });
  presetSelectEl.addEventListener('change', () => {
    state.preset = presetSelectEl.value; updateModeVisibility(); saveOptions(); process();
  });
  grayscaleRangeEl.addEventListener('input', () => {
    state.grayN = parseInt(grayscaleRangeEl.value, 10);
    grayscaleValueEl.textContent = String(state.grayN); saveOptions(); debouncedProcess();
  });
  autoRangeEl.addEventListener('input', () => {
    state.autoN = parseInt(autoRangeEl.value, 10);
    autoValueEl.textContent = String(state.autoN); saveOptions(); debouncedProcess();
  });
  ditherSelectEl.addEventListener('change', () => {
    state.dither = ditherSelectEl.value; saveOptions(); process();
  });
  pixelRangeEl.addEventListener('input', () => {
    state.pixel = parseInt(pixelRangeEl.value, 10);
    pixelValueEl.textContent = String(state.pixel); saveOptions(); debouncedProcess();
  });
  brightnessRangeEl.addEventListener('input', () => {
    state.brightness = parseInt(brightnessRangeEl.value, 10);
    brightnessValueEl.textContent = String(state.brightness); saveOptions(); debouncedProcess();
  });
  contrastRangeEl.addEventListener('input', () => {
    state.contrast = parseInt(contrastRangeEl.value, 10);
    contrastValueEl.textContent = String(state.contrast); saveOptions(); debouncedProcess();
  });

  // ---- 11. Remove / reset -----------------------------------------------
  function clearImage() {
    if (state.objectUrl) { try { URL.revokeObjectURL(state.objectUrl); } catch (e) {} }
    state.img = null; state.objectUrl = null; state.srcImageData = null;
    state.natW = state.natH = 0; state.fileName = '';
    state.lastIndices = null; state.lastPalette = null; state.procW = state.procH = 0;
    fileInputEl.value = '';
    loadedSectionEl.hidden = true;
    hideWarningBanner(); hideErrorBanner();
    disableExports();
    outputDimsEl.textContent = '—'; outputColorsEl.textContent = '—';
  }

  // File ✕ removes the image (obvious inverse of loading) — no confirm.
  removeFileBtn.addEventListener('click', () => clearImage());

  // Reset = discard image AND restore default options — confirmed.
  resetBtn.addEventListener('click', async () => {
    if (state.img && typeof confirmDialog === 'function') {
      const ok = await confirmDialog('Remove the loaded image and reset all options?');
      if (!ok) return;
    }
    clearImage();
    applyOptions({ ...DEFAULT_OPTIONS, custom: DEFAULT_OPTIONS.custom.slice() });
    saveOptions();
  });

  // ---- 12. Apply options to controls ------------------------------------
  function buildPresetOptions() {
    presetSelectEl.textContent = '';
    PALETTES.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name + ' (' + p.colors.length + ')';
      presetSelectEl.appendChild(o);
    });
    const g = document.createElement('option');
    g.value = 'grayscale'; g.textContent = 'Grayscale (N levels)';
    presetSelectEl.appendChild(g);
  }

  function applyOptions(opts) {
    state.mode = opts.mode; state.preset = opts.preset;
    state.grayN = opts.grayN; state.autoN = opts.autoN;
    state.custom = opts.custom.slice(); state.dither = opts.dither;
    state.pixel = opts.pixel; state.brightness = opts.brightness;
    state.contrast = opts.contrast; state.split = opts.split;

    paletteModeEl.value = state.mode;
    presetSelectEl.value = state.preset;
    grayscaleRangeEl.value = String(state.grayN); grayscaleValueEl.textContent = String(state.grayN);
    autoRangeEl.value = String(state.autoN); autoValueEl.textContent = String(state.autoN);
    ditherSelectEl.value = state.dither;
    pixelRangeEl.value = String(state.pixel); pixelValueEl.textContent = String(state.pixel);
    brightnessRangeEl.value = String(state.brightness); brightnessValueEl.textContent = String(state.brightness);
    contrastRangeEl.value = String(state.contrast); contrastValueEl.textContent = String(state.contrast);
    setSplit(state.split, false);
    updateModeVisibility();
    renderSwatchTable();
  }

  // ---- 13. Help modal — the shared jbcModal primitive (lib/components/CtModal.mjs),
  //    built from the hidden #help-body template. Focus-trap / Esc + backdrop
  //    close / focus return / reduced-motion all live in the primitive.
  //    `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x
  //    hooks; `titleId` pins aria-labelledby; `autoOpen` rides the shared
  //    onceFlag so Help auto-shows once on a fresh visit.
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'About the Dither & Retro-Palette Studio',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // ---- 14. Init ----------------------------------------------------------
  (function init() {
    buildPresetOptions();
    applyOptions(loadOptions());
    disableExports();
    if (!CAN_DEFLATE) {
      indexedNoteEl.textContent = 'Indexed PNG-8 needs the browser CompressionStream (unavailable here) — use Export PNG.';
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => setDisplaySize()).observe(compareEl);
    }
    window.addEventListener('resize', setDisplaySize);
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // ---- 15. Test hook (inert) --------------------------------------------
  window.__ditherStudio = {
    PALETTES, paletteById, grayscalePalette, medianCut,
    nearestColor, nearestColorIndex, mapNearest, indicesToRgba,
    floydSteinberg, atkinson, bayer, bayerMatrix, pixelScale,
    buildBrightnessContrastLUT, applyLUT, hexToRgb, rgbToHex,
    paletteToHexList, paletteToGpl, crc32, assembleIndexedPng, filterIndexRows,
    loadImageFromDataURL, process, encodeIndexedPng,
    activePalette, getState: () => state,
  };
