import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, showError, hideError } from '../../../lib/components/CtComponents.mjs';
// CtUtil names used below come from logic.mjs's own import (inlined once per <<ct:inline>> site).

  // =====================================================================
  // social-card-maker — app.mjs (DOM / canvas / toBlob / persistence).
  // The pure engine is inlined below via the ct:inline logic.mjs token.
  // =====================================================================

  // ---- Pure logic (inlined) ---------------------------------------------
<<ct:inline logic.mjs>>
  // ---- DOM refs ----------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  const errorEl = $('[data-testid="error"]');

  const eyebrowInput = byId('eyebrowInput');
  const titleInput = byId('titleInput');
  const subtitleInput = byId('subtitleInput');

  const bgModeSelect = byId('bgModeSelect');
  const bgSolidEl = $('[data-testid="bg-solid"]');
  const bgGradientEl = $('[data-testid="bg-gradient"]');
  const bgImageEl = $('[data-testid="bg-image"]');
  const bgColorInput = byId('bgColorInput');
  const bgColorText = byId('bgColorText');
  const grad1Input = byId('grad1Input');
  const grad1Text = byId('grad1Text');
  const grad2Input = byId('grad2Input');
  const grad2Text = byId('grad2Text');
  const gradAngleRange = byId('gradAngleRange');
  const gradAngleValue = $('[data-testid="grad-angle-value"]');

  const bgFileInput = byId('bgFileInput');
  const bgDropzone = $('[data-testid="bg-dropzone"]');
  const bgDropLabel = $('[data-testid="bg-drop-label"]');
  const bgRemoveBtn = $('[data-testid="bg-remove-btn"]');
  const scrimColorInput = byId('scrimColorInput');
  const scrimColorText = byId('scrimColorText');
  const scrimRange = byId('scrimRange');
  const scrimValue = $('[data-testid="scrim-value"]');

  const logoFileInput = byId('logoFileInput');
  const logoDropzone = $('[data-testid="logo-dropzone"]');
  const logoDropLabel = $('[data-testid="logo-drop-label"]');
  const logoRemoveBtn = $('[data-testid="logo-remove-btn"]');
  const logoSizeRange = byId('logoSizeRange');
  const logoSizeValue = $('[data-testid="logo-size-value"]');

  const fontSelect = byId('fontSelect');
  const customFontInput = byId('customFontInput');
  const halignGroup = $('[data-testid="halign-group"]');
  const valignGroup = $('[data-testid="valign-group"]');

  const eyebrowSize = byId('eyebrowSize');
  const eyebrowColor = byId('eyebrowColor');
  const eyebrowColorText = byId('eyebrowColorText');
  const titleSize = byId('titleSize');
  const titleWeight = byId('titleWeight');
  const titleColor = byId('titleColor');
  const titleColorText = byId('titleColorText');
  const subtitleSize = byId('subtitleSize');
  const subtitleWeight = byId('subtitleWeight');
  const subtitleColor = byId('subtitleColor');
  const subtitleColorText = byId('subtitleColorText');
  const paddingRange = byId('paddingRange');
  const paddingValue = $('[data-testid="padding-value"]');

  const sizeSelect = byId('sizeSelect');
  const customSizeEl = $('[data-testid="custom-size"]');
  const customW = byId('customW');
  const customH = byId('customH');

  const formatSelect = byId('formatSelect');
  const qualityFieldEl = $('[data-testid="quality-field"]');
  const qualityRange = byId('qualityRange');
  const qualityValue = $('[data-testid="quality-value"]');
  const outputDimsEl = $('[data-testid="output-dims"]');
  const outputSizeEl = $('[data-testid="output-size"]');
  const outputTypeEl = $('[data-testid="output-type"]');
  const downloadBtn = byId('downloadBtn');
  const resetBtn = byId('resetBtn');

  const metaUrlInput = byId('metaUrlInput');
  const metaOutput = byId('metaOutput');
  const metaCopyBtn = $('[data-testid="meta-copy-btn"]');

  const canvasEl = $('[data-testid="preview-canvas"]');

  const helpButtonEl = byId('help-button');

  // ---- Defaults & state --------------------------------------------------
  const DEFAULT_OPTIONS = {
    eyebrow: '',
    title: 'Your headline goes here',
    subtitle: 'A supporting line of context for the share card',
    bgMode: 'gradient',
    bgColor: '#6d4bd8',
    grad1: '#6d4bd8',
    grad2: '#2f9ee0',
    gradAngle: 135,
    scrimColor: '#000000',
    scrimOpacity: 35,
    logoSizePct: 14,
    family: 'System UI',
    customFont: '',
    hAlign: 'center',
    vAlign: 'middle',
    eyebrowSizePx: 28,
    eyebrowColor: '#ffffff',
    titleSizePx: 72,
    titleWeight: 700,
    titleColor: '#ffffff',
    subtitleSizePx: 36,
    subtitleWeight: 400,
    subtitleColor: '#e8e6f5',
    padding: 72,
    sizePreset: 'og',
    customW: 1200,
    customH: 630,
    format: 'png',
    quality: DEFAULT_QUALITY,
    metaUrl: 'preview.png',
  };

  const state = {
    ...DEFAULT_OPTIONS,
    // transient (never persisted)
    bgImg: null,
    bgImgUrl: null,
    logoImg: null,
    logoImgUrl: null,
    lastBlob: null,
  };

  const STORAGE_KEY = 'social-card-maker:v1';
  const HELP_SEEN_KEY = 'social-card-maker:help-seen:v1';


  const PERSIST_KEYS = Object.keys(DEFAULT_OPTIONS);
  function saveOptions() {
    try {
      const out = {};
      for (const k of PERSIST_KEYS) out[k] = state[k];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch (err) { /* best-effort, in-memory only */ }
  }
  function loadOptions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_OPTIONS };
      const p = JSON.parse(raw) || {};
      const out = { ...DEFAULT_OPTIONS };
      for (const k of PERSIST_KEYS) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
      return out;
    } catch (err) {
      return { ...DEFAULT_OPTIONS };
    }
  }

  // ---- Small helpers -----------------------------------------------------
  // Shared trailing-edge debounce + blob download (shared lib utils/CtUtil.mjs, global).
  function showErrorBanner(msg) { showError(errorEl, msg); }
  function hideErrorBanner() { hideError(errorEl); errorEl.textContent = ''; }

  function normalizeHex(v) {
    let s = String(v || '').trim().toLowerCase();
    if (!s.startsWith('#')) s = '#' + s;
    // expand #rgb to #rrggbb
    if (/^#[0-9a-f]{3}$/.test(s)) {
      s = '#' + s.slice(1).split('').map((c) => c + c).join('');
    }
    return s;
  }

  function outputSize() {
    if (state.sizePreset === 'custom') return clampSize(state.customW, state.customH);
    const p = presetByKey(state.sizePreset);
    return { width: p.width, height: p.height };
  }

  // ---- Render: draw the card --------------------------------------------
  function fontSpecFor(fontSizePx, fontWeight) {
    return {
      fontSize: fontSizePx,
      fontWeight,
      family: state.family,
      customFont: state.customFont,
    };
  }

  function drawBackground(ctx, w, h) {
    if (state.bgMode === 'solid') {
      ctx.fillStyle = hexOk(state.bgColor) ? state.bgColor : '#000000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (state.bgMode === 'gradient') {
      const c = gradientLineCoords(state.gradAngle, w, h);
      const grad = ctx.createLinearGradient(c.x0, c.y0, c.x1, c.y1);
      grad.addColorStop(0, hexOk(state.grad1) ? state.grad1 : '#000000');
      grad.addColorStop(1, hexOk(state.grad2) ? state.grad2 : '#ffffff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    // image mode
    if (state.bgImg) {
      const r = coverRect(state.bgImg.naturalWidth, state.bgImg.naturalHeight, w, h);
      ctx.drawImage(state.bgImg, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(0, 0, w, h);
    }
    // scrim
    const alpha = clamp(state.scrimOpacity, 0, 100) / 100;
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hexOk(state.scrimColor) ? state.scrimColor : '#000000';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function drawContent(ctx, w, h) {
    const padding = clamp(state.padding, 0, Math.min(w, h) / 2);
    const contentWidth = Math.max(1, w - padding * 2);

    // Build wrapped text blocks in visual order.
    const specs = [
      { key: 'eyebrow', text: state.eyebrow, size: state.eyebrowSizePx, weight: 600, color: state.eyebrowColor, lineHeight: 1.25, gapAfter: num(state.eyebrowSizePx, 28) * 0.5 },
      { key: 'title',   text: state.title,   size: state.titleSizePx,   weight: state.titleWeight, color: state.titleColor, lineHeight: 1.12, gapAfter: num(state.titleSizePx, 72) * 0.32 },
      { key: 'subtitle',text: state.subtitle,size: state.subtitleSizePx,weight: state.subtitleWeight, color: state.subtitleColor, lineHeight: 1.3, gapAfter: 0 },
    ];

    const drawBlocks = [];
    const colorByKey = {};
    for (const s of specs) {
      const text = String(s.text == null ? '' : s.text);
      if (text.trim() === '') continue;
      const fontSize = Math.max(1, num(s.size, 16));
      ctx.font = canvasFontString(fontSpecFor(fontSize, s.weight));
      const lines = wrapText(text, contentWidth, (str) => ctx.measureText(str).width);
      drawBlocks.push({ key: s.key, lines, fontSize, lineHeight: s.lineHeight, gapAfter: s.gapAfter, weight: s.weight });
      colorByKey[s.key] = hexOk(s.color) ? s.color : '#ffffff';
    }

    // Logo box.
    let logoBox = null;
    if (state.logoImg) {
      const shortSide = Math.min(w, h);
      const targetH = clamp(state.logoSizePct, 1, 100) / 100 * shortSide;
      let box = scaleLogoBox(state.logoImg.naturalWidth, state.logoImg.naturalHeight, targetH);
      if (box.w > contentWidth) box = scaleLogoBox(state.logoImg.naturalWidth, state.logoImg.naturalHeight, targetH * (contentWidth / box.w));
      logoBox = box;
    }
    const logoGap = logoBox ? Math.round(Math.min(w, h) * 0.035) : 0;

    const layout = composeLayout({
      width: w,
      height: h,
      padding,
      hAlign: state.hAlign,
      vAlign: state.vAlign,
      logo: logoBox,
      logoGap,
      blocks: drawBlocks,
    });

    if (layout.logoRect && state.logoImg) {
      const lr = layout.logoRect;
      ctx.drawImage(state.logoImg, lr.x, lr.y, lr.w, lr.h);
    }

    ctx.textBaseline = 'top';
    ctx.textAlign = layout.textAlign;
    for (const block of layout.blocks) {
      const spec = drawBlocks.find((b) => b.key === block.key);
      ctx.font = canvasFontString(fontSpecFor(block.fontSize, spec ? spec.weight : 400));
      ctx.fillStyle = colorByKey[block.key] || '#ffffff';
      for (const line of block.lines) {
        ctx.fillText(line.text, line.x, line.y);
      }
    }
  }

  function render() {
    const { width, height } = outputSize();
    canvasEl.width = width;
    canvasEl.height = height;
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    drawBackground(ctx, width, height);
    drawContent(ctx, width, height);

    outputDimsEl.textContent = `${width}×${height}`;
    outputTypeEl.textContent = mimeForFormat(state.format);
    outputSizeEl.textContent = 'encoding…';

    updateMeta(width, height);
    debouncedEncode();
  }

  function updateMeta(width, height) {
    const description = state.subtitle.trim() || state.eyebrow.trim();
    metaOutput.value = buildMetaSnippet({
      title: state.title,
      description,
      imageUrl: state.metaUrl,
      width,
      height,
    });
  }

  // ---- Encode ------------------------------------------------------------
  function encode() {
    const mime = mimeForFormat(state.format);
    const quality = clampQuality(state.quality);
    try {
      canvasEl.toBlob((blob) => {
        if (!blob) {
          state.lastBlob = null;
          downloadBtn.disabled = true;
          outputSizeEl.textContent = 'unavailable';
          showErrorBanner(`This browser can't encode ${FORMATS[state.format].label} from a canvas.`);
          return;
        }
        hideErrorBanner();
        state.lastBlob = blob;
        outputSizeEl.textContent = formatBytes(blob.size);
        outputTypeEl.textContent = blob.type || mime;
        downloadBtn.disabled = false;
      }, mime, formatSupportsQuality(state.format) ? quality : undefined);
    } catch (err) {
      state.lastBlob = null;
      downloadBtn.disabled = true;
      outputSizeEl.textContent = 'unavailable';
      showErrorBanner(`Encoding failed: ${err.message}`);
    }
  }
  const debouncedEncode = debounce(encode, 180);

  // ---- Image loading (background + logo) --------------------------------
  function loadCardImage(file, kind) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) {
      showErrorBanner(`That doesn't look like an image (type: ${file.type || 'unknown'}).`);
      return;
    }
    hideErrorBanner();
    const url = URL.createObjectURL(file);
    adoptImageFromUrl(url, kind, true);
  }

  function adoptImageFromUrl(url, kind, revocable) {
    const img = new Image();
    img.onload = () => {
      if (kind === 'bg') {
        if (state.bgImgUrl) { try { URL.revokeObjectURL(state.bgImgUrl); } catch (e) {} }
        state.bgImg = img;
        state.bgImgUrl = revocable ? url : null;
        bgDropLabel.textContent = 'Background image loaded — drop another to replace';
        bgRemoveBtn.hidden = false;
      } else {
        if (state.logoImgUrl) { try { URL.revokeObjectURL(state.logoImgUrl); } catch (e) {} }
        state.logoImg = img;
        state.logoImgUrl = revocable ? url : null;
        logoDropLabel.textContent = 'Logo loaded — drop another to replace';
        logoRemoveBtn.hidden = false;
      }
      render();
    };
    img.onerror = () => {
      if (revocable) { try { URL.revokeObjectURL(url); } catch (e) {} }
      showErrorBanner('Could not decode that image — it may be corrupt or unsupported.');
    };
    img.src = url;
  }

  function removeBgImage() {
    if (state.bgImgUrl) { try { URL.revokeObjectURL(state.bgImgUrl); } catch (e) {} }
    state.bgImg = null;
    state.bgImgUrl = null;
    bgFileInput.value = '';
    bgDropLabel.textContent = 'Drop a background image, or click to choose';
    bgRemoveBtn.hidden = true;
    render();
  }
  function removeLogo() {
    if (state.logoImgUrl) { try { URL.revokeObjectURL(state.logoImgUrl); } catch (e) {} }
    state.logoImg = null;
    state.logoImgUrl = null;
    logoFileInput.value = '';
    logoDropLabel.textContent = 'Drop a logo image, or click to choose';
    logoRemoveBtn.hidden = true;
    render();
  }

  function wireLocalDropzone(dropzoneEl, fileInputEl, kind) {
    fileInputEl.addEventListener('change', () => {
      if (fileInputEl.files && fileInputEl.files[0]) loadCardImage(fileInputEl.files[0], kind);
    });
    ['dragenter', 'dragover'].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.remove('drag-over'); })
    );
    dropzoneEl.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadCardImage(file, kind);
    });
  }

  // ---- Control wiring helpers -------------------------------------------
  function bindTextArea(el, key) {
    el.addEventListener('input', () => { state[key] = el.value; saveOptions(); render(); });
  }
  function bindNumber(el, key) {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (Number.isFinite(v)) { state[key] = v; saveOptions(); render(); }
    });
  }
  function bindSelectNum(el, key) {
    el.addEventListener('change', () => { state[key] = parseFloat(el.value); saveOptions(); render(); });
  }
  function bindRange(el, key, labelEl) {
    el.addEventListener('input', () => {
      state[key] = parseFloat(el.value);
      if (labelEl) labelEl.textContent = el.value;
      saveOptions();
      render();
    });
  }
  // Wire a <input type=color> + a hex <input type=text> to one state key.
  function bindColorPair(colorEl, textEl, key) {
    colorEl.addEventListener('input', () => {
      state[key] = colorEl.value;
      textEl.value = colorEl.value;
      saveOptions();
      render();
    });
    textEl.addEventListener('input', () => {
      const norm = normalizeHex(textEl.value);
      if (hexOk(norm)) {
        state[key] = norm;
        colorEl.value = norm;
        saveOptions();
        render();
      }
    });
  }

  // ---- Wire everything ---------------------------------------------------
  // Populate the font + size selects.
  for (const f of CURATED_FONTS) {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    fontSelect.appendChild(opt);
  }
  for (const p of PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = p.label;
    sizeSelect.appendChild(opt);
  }

  bindTextArea(eyebrowInput, 'eyebrow');
  bindTextArea(titleInput, 'title');
  bindTextArea(subtitleInput, 'subtitle');
  bindTextArea(metaUrlInput, 'metaUrl'); // updates meta live (render calls updateMeta)
  bindTextArea(customFontInput, 'customFont');

  bgModeSelect.addEventListener('change', () => { setBgMode(bgModeSelect.value); });

  bindColorPair(bgColorInput, bgColorText, 'bgColor');
  bindColorPair(grad1Input, grad1Text, 'grad1');
  bindColorPair(grad2Input, grad2Text, 'grad2');
  bindColorPair(scrimColorInput, scrimColorText, 'scrimColor');
  bindColorPair(eyebrowColor, eyebrowColorText, 'eyebrowColor');
  bindColorPair(titleColor, titleColorText, 'titleColor');
  bindColorPair(subtitleColor, subtitleColorText, 'subtitleColor');

  bindRange(gradAngleRange, 'gradAngle', gradAngleValue);
  bindRange(scrimRange, 'scrimOpacity', scrimValue);
  bindRange(logoSizeRange, 'logoSizePct', logoSizeValue);
  bindRange(paddingRange, 'padding', paddingValue);

  bindNumber(eyebrowSize, 'eyebrowSizePx');
  bindNumber(titleSize, 'titleSizePx');
  bindNumber(subtitleSize, 'subtitleSizePx');
  bindNumber(customW, 'customW');
  bindNumber(customH, 'customH');

  bindSelectNum(titleWeight, 'titleWeight');
  bindSelectNum(subtitleWeight, 'subtitleWeight');

  fontSelect.addEventListener('change', () => { state.family = fontSelect.value; saveOptions(); render(); });

  bgRemoveBtn.addEventListener('click', removeBgImage);
  logoRemoveBtn.addEventListener('click', removeLogo);
  wireLocalDropzone(bgDropzone, bgFileInput, 'bg');
  wireLocalDropzone(logoDropzone, logoFileInput, 'logo');

  // Alignment segmented groups. Shared single-select control
  // (wireSegmented): click / Arrow-key select + roving tabindex +
  // aria-pressed bookkeeping.
  function wireAlignGroup(groupEl, key) {
    return wireSegmented(groupEl, (val) => {
      state[key] = val;
      saveOptions();
      render();
    });
  }
  // Render-free reflect of restored alignment (used by the reflect pass below):
  // sets state + aria only, so it does NOT fire the segmented onChange (which
  // would render mid-restore).
  function setAlign(groupEl, attr, key, val) {
    state[key] = val;
    for (const b of groupEl.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val));
    }
  }
  const halignSeg = wireAlignGroup(halignGroup, 'hAlign');
  const valignSeg = wireAlignGroup(valignGroup, 'vAlign');

  // Size preset + custom.
  sizeSelect.addEventListener('change', () => {
    state.sizePreset = sizeSelect.value;
    customSizeEl.hidden = state.sizePreset !== 'custom';
    saveOptions();
    render();
  });

  // Format + quality.
  function updateQualityVisibility() {
    qualityFieldEl.hidden = !formatSupportsQuality(state.format);
  }
  formatSelect.addEventListener('change', () => {
    state.format = FORMATS[formatSelect.value] ? formatSelect.value : 'png';
    updateQualityVisibility();
    saveOptions();
    render();
  });
  qualityRange.addEventListener('input', () => {
    state.quality = percentToQuality(qualityRange.value);
    qualityValue.textContent = String(qualityToPercent(state.quality));
    saveOptions();
    render();
  });

  // Meta copy.
  metaCopyBtn.addEventListener('click', async () => {
    const ok = await copy(metaOutput.value);
    if (ok) flash(metaCopyBtn, { label: '✓' });
  });

  // Download.
  downloadBtn.addEventListener('click', () => {
    if (!state.lastBlob) return;
    downloadBlob(state.lastBlob, outputFilename(state.title, state.format));
  });

  // Reset — confirmed (discards a composed card).
  resetBtn.addEventListener('click', async () => {
    if (typeof confirmDialog === 'function') {
      const ok = await confirmDialog('Reset all text, styles, and images to defaults?');
      if (!ok) return;
    }
    removeBgImage();
    removeLogo();
    applyOptions({ ...DEFAULT_OPTIONS });
    saveOptions();
    render();
  });

  // ---- Apply options to controls + state --------------------------------
  function setBgMode(mode) {
    state.bgMode = (mode === 'gradient' || mode === 'image') ? mode : 'solid';
    bgModeSelect.value = state.bgMode;
    bgSolidEl.hidden = state.bgMode !== 'solid';
    bgGradientEl.hidden = state.bgMode !== 'gradient';
    bgImageEl.hidden = state.bgMode !== 'image';
    saveOptions();
    render();
  }

  function applyOptions(opts) {
    for (const k of PERSIST_KEYS) if (opts[k] !== undefined) state[k] = opts[k];

    // Text
    eyebrowInput.value = state.eyebrow;
    titleInput.value = state.title;
    subtitleInput.value = state.subtitle;
    metaUrlInput.value = state.metaUrl;
    customFontInput.value = state.customFont;

    // Background
    bgColorInput.value = hexOk(state.bgColor) ? state.bgColor : '#000000';
    bgColorText.value = bgColorInput.value;
    grad1Input.value = hexOk(state.grad1) ? state.grad1 : '#000000';
    grad1Text.value = grad1Input.value;
    grad2Input.value = hexOk(state.grad2) ? state.grad2 : '#ffffff';
    grad2Text.value = grad2Input.value;
    gradAngleRange.value = String(state.gradAngle);
    gradAngleValue.textContent = String(state.gradAngle);
    scrimColorInput.value = hexOk(state.scrimColor) ? state.scrimColor : '#000000';
    scrimColorText.value = scrimColorInput.value;
    scrimRange.value = String(state.scrimOpacity);
    scrimValue.textContent = String(state.scrimOpacity);

    // Logo
    logoSizeRange.value = String(state.logoSizePct);
    logoSizeValue.textContent = String(state.logoSizePct);

    // Text style
    fontSelect.value = CURATED_BY_NAME.has(state.family) ? state.family : CURATED_FONTS[0].name;
    state.family = fontSelect.value;
    setAlign(halignGroup, 'data-halign', 'hAlign', state.hAlign);
    setAlign(valignGroup, 'data-valign', 'vAlign', state.vAlign);
    eyebrowSize.value = String(state.eyebrowSizePx);
    eyebrowColor.value = hexOk(state.eyebrowColor) ? state.eyebrowColor : '#ffffff';
    eyebrowColorText.value = eyebrowColor.value;
    titleSize.value = String(state.titleSizePx);
    titleWeight.value = String(state.titleWeight);
    titleColor.value = hexOk(state.titleColor) ? state.titleColor : '#ffffff';
    titleColorText.value = titleColor.value;
    subtitleSize.value = String(state.subtitleSizePx);
    subtitleWeight.value = String(state.subtitleWeight);
    subtitleColor.value = hexOk(state.subtitleColor) ? state.subtitleColor : '#ffffff';
    subtitleColorText.value = subtitleColor.value;
    paddingRange.value = String(state.padding);
    paddingValue.textContent = String(state.padding);

    // Size
    sizeSelect.value = presetByKey(state.sizePreset).key;
    state.sizePreset = sizeSelect.value;
    customSizeEl.hidden = state.sizePreset !== 'custom';
    customW.value = String(state.customW);
    customH.value = String(state.customH);

    // Export
    formatSelect.value = FORMATS[state.format] ? state.format : 'png';
    state.format = formatSelect.value;
    qualityRange.value = String(qualityToPercent(state.quality));
    qualityValue.textContent = String(qualityToPercent(state.quality));
    updateQualityVisibility();

    // Background mode visibility (also renders)
    setBgMode(state.bgMode);
  }

  // ---- Help modal — the shared jbcModal primitive (shared lib components/CtModal.mjs), built
  // from the hidden #help-body template. Focus-trap / Esc + backdrop close /
  // focus-return / reduced-motion / scroll-top live in that primitive; `autoOpen`
  // rides the shared onceFlag so it auto-shows once on a fresh visit.
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'About the Social Card / OG-image Maker',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // ---- Init --------------------------------------------------------------
  (function init() {
    applyOptions(loadOptions());
    render();
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // ---- Test hook (inert) -------------------------------------------------
  function loadBackgroundFromDataURL(dataUrl) { adoptImageFromUrl(dataUrl, 'bg', false); }
  function loadLogoFromDataURL(dataUrl) { adoptImageFromUrl(dataUrl, 'logo', false); }

  window.__socialCardMaker = {
    // pure logic
    FORMATS,
    mimeForFormat,
    formatSupportsQuality,
    clampQuality,
    percentToQuality,
    qualityToPercent,
    resolveFontFamily,
    canvasFontString,
    wrapText,
    PRESETS,
    presetByKey,
    clampSize,
    gradientLineCoords,
    coverRect,
    scaleLogoBox,
    composeLayout,
    buildMetaSnippet,
    slugify,
    outputFilename,
    formatBytes,
    // deterministic entry points
    render,
    loadBackgroundFromDataURL,
    loadLogoFromDataURL,
    getState: () => state,
  };
