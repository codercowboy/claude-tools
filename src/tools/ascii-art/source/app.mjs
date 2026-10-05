import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, wireDropzone, showError, hideError } from '../../../lib/components/CtComponents.mjs';
import { debounce, downloadBlob, onceFlag } from '../../../lib/utils/CtUtil.mjs';
import { formatBytes } from '../../../lib/utils/CtByteUtil.mjs';

  // =====================================================================
  // ascii-art — app.mjs (DOM / canvas downsampling / persistence / export).
  // The pure engine is inlined below via the ct:inline logic.mjs token.
  // =====================================================================

  // ---- 1. Pure logic (inlined) ------------------------------------------
<<ct:inline logic.mjs>>
  // ---- 2. DOM refs -------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const byTest = (id) => document.querySelector(`[data-testid="${id}"]`);

  const fileInputEl = document.getElementById('fileInput');
  const dropzoneEl = document.querySelector('.dropzone');
  const errorEl = byTest('error');

  const loadedSectionEl = byTest('loaded-section');
  const originalNameEl = byTest('original-name');
  const originalDimsEl = byTest('original-dims');
  const originalSizeEl = byTest('original-size');
  const originalTypeEl = byTest('original-type');
  const removeFileBtn = byTest('remove-file-btn');

  const modeSegEl = byTest('mode-seg');
  const modeButtons = Array.from(modeSegEl.querySelectorAll('button[data-mode]'));
  const modeNoteEl = byTest('mode-note');

  const rampFieldEl = byTest('ramp-field');
  const rampPresetEl = byTest('ramp-preset');
  const rampTextEl = byTest('ramp-text');

  const brailleFieldEl = byTest('braille-field');
  const thresholdRangeEl = byTest('threshold-range');
  const thresholdValueEl = byTest('threshold-value');
  const ditherSelectEl = byTest('dither-select');

  const colorToggleEl = byTest('color-toggle');
  const ansiDepthEl = byTest('ansi-depth');

  const widthRangeEl = byTest('width-range');
  const widthValueEl = byTest('width-value');

  const brightnessRangeEl = byTest('brightness-range');
  const brightnessValueEl = byTest('brightness-value');
  const contrastRangeEl = byTest('contrast-range');
  const contrastValueEl = byTest('contrast-value');
  const gammaRangeEl = byTest('gamma-range');
  const gammaValueEl = byTest('gamma-value');
  const aspectRangeEl = byTest('aspect-range');
  const aspectValueEl = byTest('aspect-value');
  const invertToggleEl = byTest('invert-toggle');

  const resetBtn = byTest('reset-btn');

  const outputStatsEl = byTest('output-stats');
  const lightPreviewEl = byTest('light-preview-toggle');
  const previewBoxEl = byTest('preview-box');

  const copyTxtBtn = byTest('copy-txt-btn');
  const downloadTxtBtn = byTest('download-txt-btn');
  const copyHtmlBtn = byTest('copy-html-btn');
  const downloadHtmlBtn = byTest('download-html-btn');
  const copyAnsiBtn = byTest('copy-ansi-btn');
  const downloadAnsiBtn = byTest('download-ansi-btn');

  const helpButtonEl = document.getElementById('help-button');

  // ---- 3. State & persistence -------------------------------------------
  const STORAGE_KEY = 'ascii-art:v1';
  const HELP_SEEN_KEY = 'ascii-art:help-seen:v1';

  const DEFAULT_OPTIONS = {
    mode: DEFAULTS.mode,
    color: DEFAULTS.color,
    ansiDepth: DEFAULTS.ansiDepth,
    width: DEFAULTS.width,
    ramp: DEFAULTS.ramp,
    rampPreset: 'standard',
    invert: DEFAULTS.invert,
    brightness: DEFAULTS.brightness,
    contrast: DEFAULTS.contrast,
    gamma: DEFAULTS.gamma,
    threshold: DEFAULTS.threshold,
    dither: DEFAULTS.dither,
    charAspect: DEFAULTS.charAspect,
    lightPreview: false,
  };

  const state = {
    // image (never persisted)
    img: null,
    naturalW: 0,
    naturalH: 0,
    fileName: '',
    fileType: '',
    fileBytes: 0,
    objectUrl: null,
    // options (persisted)
    ...DEFAULT_OPTIONS,
    // derived / transient
    lastResult: null, // { width, rows }
  };


  function saveOptions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        color: state.color,
        ansiDepth: state.ansiDepth,
        width: state.width,
        ramp: state.ramp,
        rampPreset: state.rampPreset,
        invert: state.invert,
        brightness: state.brightness,
        contrast: state.contrast,
        gamma: state.gamma,
        threshold: state.threshold,
        dither: state.dither,
        charAspect: state.charAspect,
        lightPreview: state.lightPreview,
      }));
    } catch (err) { /* best-effort, in-memory only */ }
  }

  function loadOptions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_OPTIONS };
      const p = JSON.parse(raw) || {};
      const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      return {
        mode: MODES[p.mode] ? p.mode : DEFAULT_OPTIONS.mode,
        color: p.color === true,
        ansiDepth: p.ansiDepth === 'truecolor' ? 'truecolor' : '256',
        width: clampPlain(Math.round(num(p.width, DEFAULT_OPTIONS.width)), 16, 300),
        ramp: typeof p.ramp === 'string' && p.ramp.length ? p.ramp : DEFAULT_OPTIONS.ramp,
        rampPreset: RAMPS[p.rampPreset] || p.rampPreset === 'custom' ? p.rampPreset : 'standard',
        invert: p.invert === true,
        brightness: clampPlain(num(p.brightness, 0), -100, 100),
        contrast: clampPlain(num(p.contrast, 0), -100, 100),
        gamma: clampPlain(num(p.gamma, 1), 0.2, 3),
        threshold: clampPlain(num(p.threshold, 128), 0, 255),
        dither: ['none', 'bayer', 'floyd'].includes(p.dither) ? p.dither : 'none',
        charAspect: clampPlain(num(p.charAspect, 2), 1, 3),
        lightPreview: p.lightPreview === true,
      };
    } catch (err) {
      return { ...DEFAULT_OPTIONS };
    }
  }

  // ---- 4. Helpers --------------------------------------------------------
  // Shared trailing-edge debounce & byte formatter (CtUtil, imported above).
  function showErrorBanner(msg) { showError(errorEl, msg); }
  function hideErrorBanner() { hideError(errorEl); errorEl.textContent = ''; }


  function currentColorOn() {
    return state.mode === 'halfblock' ? true : state.color;
  }
  function previewColors() {
    return state.lightPreview
      ? { background: '#ffffff', foreground: '#111111' }
      : { background: '#0b0b0e', foreground: '#d6d6da' };
  }

  // ---- 5. Offscreen sampling canvas -------------------------------------
  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

  function sampleGrid(pixW, pixH) {
    sampleCanvas.width = pixW;
    sampleCanvas.height = pixH;
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.clearRect(0, 0, pixW, pixH);
    sampleCtx.drawImage(state.img, 0, 0, pixW, pixH);
    const imgData = sampleCtx.getImageData(0, 0, pixW, pixH);
    return { width: imgData.width, height: imgData.height, data: imgData.data };
  }

  // ---- 6. Render ---------------------------------------------------------
  function render() {
    if (!state.img) return;
    hideErrorBanner();

    const size = computeSampleSize(state.mode, state.naturalW, state.naturalH, state.width, state.charAspect);
    let grid;
    try {
      grid = sampleGrid(size.pixW, size.pixH);
    } catch (err) {
      showErrorBanner(`Could not read image pixels: ${err.message}`);
      return;
    }

    const opts = {
      mode: state.mode,
      color: currentColorOn(),
      ramp: state.ramp,
      invert: state.invert,
      brightness: state.brightness,
      contrast: state.contrast,
      gamma: state.gamma,
      threshold: state.threshold,
      dither: state.dither,
      ansiDepth: state.ansiDepth,
    };

    const result = renderCells(grid, opts);
    state.lastResult = result;

    paint();
    updateStats(result);
    setExportsEnabled(true);
  }
  const debouncedRender = debounce(render, 120);

  function paint() {
    const res = state.lastResult;
    const box = previewBoxEl;
    if (!res || res.rows.length === 0) {
      box.classList.add('is-empty');
      box.textContent = 'Load an image to see the art.';
      return;
    }
    box.classList.remove('is-empty');
    const pc = previewColors();
    box.style.background = pc.background;

    if (currentColorOn()) {
      box.innerHTML = cellsToHtml(res.rows, {
        background: pc.background,
        foreground: pc.foreground,
        fontSize: 10,
      });
    } else {
      const pre = document.createElement('pre');
      pre.textContent = cellsToText(res.rows);
      pre.style.color = pc.foreground;
      box.replaceChildren(pre);
    }
  }

  function updateStats(res) {
    const cols = res.rows[0] ? res.rows[0].length : 0;
    const lines = res.rows.length;
    const chars = res.rows.reduce((n, r) => n + r.length, 0);
    outputStatsEl.textContent = `${cols} × ${lines} chars (${chars.toLocaleString()} total)`;
  }

  function setExportsEnabled(on) {
    [copyTxtBtn, downloadTxtBtn, copyHtmlBtn, downloadHtmlBtn, copyAnsiBtn, downloadAnsiBtn]
      .forEach((b) => { b.disabled = !on; });
  }

  // ---- 7. Image loading --------------------------------------------------
  function loadFile(file) {
    if (!file) return;
    hideErrorBanner();
    if (file.type && !/^image\//.test(file.type)) {
      showErrorBanner(`That doesn't look like an image (type: ${file.type || 'unknown'}).`);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => adoptImage(img, url, file.name, file.type || 'image/*', file.size);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showErrorBanner('Could not decode that image — it may be corrupt or an unsupported format.');
    };
    img.src = url;
  }

  // Test entry point: load a known image from a data URL (no file dialog).
  function loadImageFromDataURL(dataUrl, name = 'image.png') {
    hideErrorBanner();
    const img = new Image();
    img.onload = () => {
      const mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || 'image/png';
      adoptImage(img, null, name, mime, 0);
    };
    img.onerror = () => showErrorBanner('Could not decode that image.');
    img.src = dataUrl;
  }

  function adoptImage(img, objectUrl, name, type, bytes) {
    if (state.objectUrl) { try { URL.revokeObjectURL(state.objectUrl); } catch (e) {} }
    state.img = img;
    state.objectUrl = objectUrl;
    state.naturalW = img.naturalWidth;
    state.naturalH = img.naturalHeight;
    state.fileName = name || 'image';
    state.fileType = type || 'image/*';
    state.fileBytes = bytes || 0;

    originalNameEl.textContent = state.fileName;
    originalDimsEl.textContent = `${state.naturalW}×${state.naturalH}`;
    originalSizeEl.textContent = state.fileBytes ? formatBytes(state.fileBytes) : '—';
    originalTypeEl.textContent = state.fileType;

    loadedSectionEl.hidden = false;
    render();
  }

  fileInputEl.addEventListener('change', () => {
    if (fileInputEl.files && fileInputEl.files[0]) loadFile(fileInputEl.files[0]);
  });
  wireDropzone(dropzoneEl, (files) => {
    const file = files[0];
    if (file) loadFile(file);
  }, { dragClass: 'drag-over' });

  // ---- 8. Controls wiring ------------------------------------------------
  function updateModeVisibility() {
    rampFieldEl.hidden = state.mode !== 'ascii';
    brailleFieldEl.hidden = state.mode !== 'braille';
    // Half-block is always colored: force + lock the toggle there.
    if (state.mode === 'halfblock') {
      colorToggleEl.checked = true;
      colorToggleEl.disabled = true;
    } else {
      colorToggleEl.disabled = false;
      colorToggleEl.checked = state.color;
    }
    const notes = {
      ascii: 'One character per pixel from the ramp — dense char = dark pixel.',
      halfblock: 'Each ▀ stacks two vertical pixels as two colors — doubles vertical resolution.',
      braille: 'Each ⠿ packs a 2×4 dot cell — highest resolution; tune threshold / dither.',
    };
    modeNoteEl.textContent = notes[state.mode] || '';
  }

  function setMode(mode) {
    state.mode = MODES[mode] ? mode : 'ascii';
    updateModeVisibility();
    saveOptions();
    render();
  }
  // Shared single-select segmented control (wireSegmented): click /
  // Arrow-key select + roving tabindex + aria-pressed bookkeeping. The restore
  // path (applyOptions) reflects aria directly to avoid re-rendering mid-apply.
  const modeSeg = wireSegmented(modeSegEl, setMode, { selector: 'button[data-mode]' });

  rampPresetEl.addEventListener('change', () => {
    const preset = rampPresetEl.value;
    state.rampPreset = preset;
    if (preset !== 'custom' && RAMPS[preset]) {
      state.ramp = RAMPS[preset];
      rampTextEl.value = state.ramp;
    }
    saveOptions();
    render();
  });
  rampTextEl.addEventListener('input', () => {
    state.ramp = rampTextEl.value.length ? rampTextEl.value : DEFAULT_RAMP;
    state.rampPreset = 'custom';
    rampPresetEl.value = 'custom';
    saveOptions();
    debouncedRender();
  });

  thresholdRangeEl.addEventListener('input', () => {
    state.threshold = Number(thresholdRangeEl.value);
    thresholdValueEl.textContent = String(state.threshold);
    saveOptions();
    debouncedRender();
  });
  ditherSelectEl.addEventListener('change', () => {
    state.dither = ditherSelectEl.value;
    saveOptions();
    render();
  });

  colorToggleEl.addEventListener('change', () => {
    if (state.mode === 'halfblock') return; // locked on
    state.color = colorToggleEl.checked;
    saveOptions();
    render();
  });
  ansiDepthEl.addEventListener('change', () => {
    state.ansiDepth = ansiDepthEl.value === 'truecolor' ? 'truecolor' : '256';
    saveOptions();
    // ANSI depth only affects the ANSI export, not the preview — no re-render needed.
  });

  widthRangeEl.addEventListener('input', () => {
    state.width = Number(widthRangeEl.value);
    widthValueEl.textContent = String(state.width);
    saveOptions();
    debouncedRender();
  });

  function wireSlider(el, valEl, key, fmt) {
    el.addEventListener('input', () => {
      state[key] = Number(el.value);
      valEl.textContent = fmt(state[key]);
      saveOptions();
      debouncedRender();
    });
  }
  wireSlider(brightnessRangeEl, brightnessValueEl, 'brightness', (v) => String(v));
  wireSlider(contrastRangeEl, contrastValueEl, 'contrast', (v) => String(v));
  wireSlider(gammaRangeEl, gammaValueEl, 'gamma', (v) => v.toFixed(1));
  wireSlider(aspectRangeEl, aspectValueEl, 'charAspect', (v) => v.toFixed(1));

  invertToggleEl.addEventListener('change', () => {
    state.invert = invertToggleEl.checked;
    saveOptions();
    render();
  });

  lightPreviewEl.addEventListener('change', () => {
    state.lightPreview = lightPreviewEl.checked;
    saveOptions();
    paint(); // preview-only; no re-sample needed
  });

  // ---- 9. Exports --------------------------------------------------------
  function buildText() { return state.lastResult ? cellsToText(state.lastResult.rows) : ''; }
  function buildHtml() {
    if (!state.lastResult) return '';
    return htmlDocument(state.lastResult.rows, previewColors());
  }
  function buildAnsi() {
    if (!state.lastResult) return '';
    return cellsToAnsi(state.lastResult.rows, { ansiDepth: state.ansiDepth });
  }

  function outBase() {
    const n = String(state.fileName || 'ascii-art');
    const dot = n.lastIndexOf('.');
    const base = dot > 0 ? n.slice(0, dot) : n;
    return (base || 'ascii-art') + '-' + state.mode;
  }
  // Shared file-download helper (utils/CtUtil.mjs, inlined as a global).

  async function copyAndFlash(btn, text) {
    if (!text) return;
    const ok = await copy(text);
    if (ok) flash(btn, { label: 'Copied!' });
  }

  copyTxtBtn.addEventListener('click', () => copyAndFlash(copyTxtBtn, buildText()));
  downloadTxtBtn.addEventListener('click', () => downloadBlob(buildText(), outBase() + '.txt', 'text/plain;charset=utf-8'));
  copyHtmlBtn.addEventListener('click', () => copyAndFlash(copyHtmlBtn, buildHtml()));
  downloadHtmlBtn.addEventListener('click', () => downloadBlob(buildHtml(), outBase() + '.html', 'text/html;charset=utf-8'));
  copyAnsiBtn.addEventListener('click', () => copyAndFlash(copyAnsiBtn, buildAnsi()));
  downloadAnsiBtn.addEventListener('click', () => downloadBlob(buildAnsi(), outBase() + '.ans', 'text/plain;charset=utf-8'));

  // ---- 10. Remove / Reset ------------------------------------------------
  function clearImage() {
    if (state.objectUrl) { try { URL.revokeObjectURL(state.objectUrl); } catch (e) {} }
    state.img = null;
    state.objectUrl = null;
    state.naturalW = state.naturalH = 0;
    state.fileName = state.fileType = '';
    state.fileBytes = 0;
    state.lastResult = null;
    fileInputEl.value = '';
    loadedSectionEl.hidden = true;
    hideErrorBanner();
    setExportsEnabled(false);
    outputStatsEl.textContent = '—';
    previewBoxEl.classList.add('is-empty');
    previewBoxEl.textContent = 'Load an image to see the art.';
    previewBoxEl.style.background = '';
  }

  // ✕ removes just the image (obvious inverse of loading; options untouched).
  removeFileBtn.addEventListener('click', () => { clearImage(); });

  // Reset = discard image AND restore default options — confirmed if an image is loaded.
  resetBtn.addEventListener('click', async () => {
    const hadImage = !!state.img;
    if (hadImage && typeof confirmDialog === 'function') {
      const ok = await confirmDialog('Remove the loaded image and reset all options?');
      if (!ok) return;
    }
    clearImage();
    applyOptions({ ...DEFAULT_OPTIONS });
    saveOptions();
  });

  // ---- 11. Apply options to UI ------------------------------------------
  function applyOptions(opts) {
    state.mode = MODES[opts.mode] ? opts.mode : DEFAULT_OPTIONS.mode;
    state.color = opts.color === true;
    state.ansiDepth = opts.ansiDepth === 'truecolor' ? 'truecolor' : '256';
    state.width = clampPlain(Math.round(Number(opts.width) || DEFAULT_OPTIONS.width), 16, 300);
    state.ramp = typeof opts.ramp === 'string' && opts.ramp.length ? opts.ramp : DEFAULT_RAMP;
    state.rampPreset = RAMPS[opts.rampPreset] || opts.rampPreset === 'custom' ? opts.rampPreset : 'standard';
    state.invert = opts.invert === true;
    state.brightness = clampPlain(Number(opts.brightness) || 0, -100, 100);
    state.contrast = clampPlain(Number(opts.contrast) || 0, -100, 100);
    state.gamma = clampPlain(Number(opts.gamma) || 1, 0.2, 3);
    state.threshold = clampPlain(Number(opts.threshold) || 128, 0, 255);
    state.dither = ['none', 'bayer', 'floyd'].includes(opts.dither) ? opts.dither : 'none';
    state.charAspect = clampPlain(Number(opts.charAspect) || 2, 1, 3);
    state.lightPreview = opts.lightPreview === true;

    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    rampPresetEl.value = state.rampPreset;
    rampTextEl.value = state.ramp;
    colorToggleEl.checked = state.color;
    ansiDepthEl.value = state.ansiDepth;
    widthRangeEl.value = String(state.width);
    widthValueEl.textContent = String(state.width);
    thresholdRangeEl.value = String(state.threshold);
    thresholdValueEl.textContent = String(state.threshold);
    ditherSelectEl.value = state.dither;
    brightnessRangeEl.value = String(state.brightness);
    brightnessValueEl.textContent = String(state.brightness);
    contrastRangeEl.value = String(state.contrast);
    contrastValueEl.textContent = String(state.contrast);
    gammaRangeEl.value = String(state.gamma);
    gammaValueEl.textContent = state.gamma.toFixed(1);
    aspectRangeEl.value = String(state.charAspect);
    aspectValueEl.textContent = state.charAspect.toFixed(1);
    invertToggleEl.checked = state.invert;
    lightPreviewEl.checked = state.lightPreview;

    updateModeVisibility();
  }

  // ---- 12. Help modal (focus-trap pattern) ------------------------------
  // The Help dialog is the shared jbcModal primitive (lib/components/CtModal.mjs),
  // built from the hidden #help-body template. Focus-trap / Esc + backdrop
  // close / focus return / reduced-motion all live in the primitive.
  // `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x hooks;
  // `titleId` pins aria-labelledby; `autoOpen` rides the shared onceFlag
  // so Help auto-shows once on a fresh visit.
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'About the ASCII / Unicode Art Converter',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // ---- 13. Init ----------------------------------------------------------
  (function init() {
    applyOptions(loadOptions());
    setExportsEnabled(false);
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // ---- 14. Test hook (inert) --------------------------------------------
  window.__asciiArt = {
    // pure logic
    RAMPS,
    DEFAULTS,
    luminance,
    adjustLevel,
    normLevel,
    charForLevel,
    clampRamp,
    packBraille,
    renderCells,
    toAscii,
    toBraille,
    toAsciiCells,
    toHalfBlockCells,
    toBrailleCells,
    cellsToText,
    cellsToHtml,
    htmlDocument,
    cellsToAnsi,
    rgbToAnsi256,
    computeSampleSize,
    // deterministic entry points
    loadImageFromDataURL,
    render,
    getState: () => state,
  };
