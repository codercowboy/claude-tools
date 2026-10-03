
  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const modeEncodeBtn = document.getElementById('modeEncodeBtn');
  const modeDecodeBtn = document.getElementById('modeDecodeBtn');
  const encodeSectionEl = document.querySelector('.encode-section');
  const decodeSectionEl = document.querySelector('.decode-section');

  const encodeTextInputEl = document.getElementById('encodeTextInput');
  const dropzoneEl = document.querySelector('.dropzone');
  const encodeFileInputEl = document.getElementById('encodeFileInput');
  const encodeFileInfoEl = document.querySelector('[data-testid="encode-file-info"]');
  const encodeFileNameEl = encodeFileInfoEl.querySelector('.file-name');
  const encodeFileSizeEl = encodeFileInfoEl.querySelector('.file-size');
  const encodeFileMimeEl = encodeFileInfoEl.querySelector('.file-mime');
  const encodeRemoveFileBtn = document.querySelector('[data-testid="encode-remove-file-btn"]');
  const encodeMimeInputEl = document.getElementById('encodeMimeInput');
  const encodeTextCopyBtn = document.getElementById('encodeTextCopyBtn');
  const encodeMimeCopyBtn = document.getElementById('encodeMimeCopyBtn');
  const encodeClearBtn = document.getElementById('encodeClearBtn');
  const encodeErrorEl = document.querySelector('[data-testid="encode-error"]');
  const encodeWarningEl = document.querySelector('[data-testid="encode-warning"]');

  const encodeBase64OutputEl = document.getElementById('encodeBase64Output');
  const encodeBase64CopyBtn = document.getElementById('encodeBase64CopyBtn');
  const encodeBase64UrlOutputEl = document.getElementById('encodeBase64UrlOutput');
  const encodeBase64UrlCopyBtn = document.getElementById('encodeBase64UrlCopyBtn');
  const encodeDataUriOutputEl = document.getElementById('encodeDataUriOutput');
  const encodeDataUriCopyBtn = document.getElementById('encodeDataUriCopyBtn');
  const encodeSnippetOutputEl = document.getElementById('encodeSnippetOutput');
  const encodeSnippetCopyBtn = document.getElementById('encodeSnippetCopyBtn');

  const decodeInputEl = document.getElementById('decodeInput');
  const decodeInputCopyBtn = document.getElementById('decodeInputCopyBtn');
  const decodeClearBtn = document.getElementById('decodeClearBtn');
  const decodeErrorEl = document.querySelector('[data-testid="decode-error"]');
  const decodeDetectedMimeEl = document.querySelector('[data-testid="decode-detected-mime"]');
  const decodeTextColEl = document.querySelector('[data-testid="decode-text-col"]');
  const decodeTextOutputEl = document.getElementById('decodeTextOutput');
  const decodeTextCopyBtn = document.getElementById('decodeTextCopyBtn');
  const decodeBinaryNoteEl = document.querySelector('[data-testid="decode-binary-note"]');
  const decodeDownloadBtn = document.getElementById('decodeDownloadBtn');

  const helpButtonEl = document.getElementById('help-button');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtn = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  // =====================================================================
  // 2. State & persistence
  // =====================================================================
  const state = {
    mode: 'encode',          // 'encode' | 'decode'
    encode: {
      sourceFile: null,      // File | null — when set, its bytes win over the textarea
    },
    decode: {
      last: null,            // { mime, bytes, text, isText } | null
    },
  };

  // localStorage UI-state persistence — docs/conventions.md § "Persist UI
  // state (localStorage)" (hat-picker is the exemplar). Versioned key
  // "base64-tool:v1". We persist only the mode + the two raw text inputs
  // (encode text-input, decode input) — never the uploaded file's bytes
  // (too large / inappropriate to store) and never the four encode outputs
  // or the decoded output, which are DERIVED and get recomputed on restore.
  // Every read/write is try/catch-wrapped and degrades silently: the tool
  // must work fully with no stored state (file://, private mode, quota,
  // browser policy can all make localStorage throw).
  const STORAGE_KEY = 'base64-tool:v1';

  // First-load Help popup — docs/conventions.md § "First-load help popup
  // (all tools)". Persisted separately from STORAGE_KEY (a distinct
  // one-shot flag, not versioned UI state) under its own key, same
  // try/catch-degrade pattern. If localStorage throws, treat the popup as
  // already-seen so we don't nag every load — the ? button is always there
  // if the visitor wants it later.
  const HELP_SEEN_KEY = 'base64-tool:help-seen:v1';

  function hasSeenHelp() {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch (err) {
      return true;
    }
  }

  function markHelpSeen() {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch (err) {
      // Best-effort, same as saveState().
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        encodeText: encodeTextInputEl.value,
        decodeText: decodeInputEl.value,
      }));
    } catch (err) {
      // Best-effort: localStorage unavailable/throwing. Degrade silently to
      // in-memory only.
    }
  }

  function loadState() {
    const fallback = { mode: 'encode', encodeText: '', decodeText: '' };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        mode: parsed && parsed.mode === 'decode' ? 'decode' : 'encode',
        encodeText: parsed && typeof parsed.encodeText === 'string' ? parsed.encodeText : '',
        decodeText: parsed && typeof parsed.decodeText === 'string' ? parsed.decodeText : '',
      };
    } catch (err) {
      return fallback;
    }
  }

  // =====================================================================
  // 3. Pure core functions (no DOM access)
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 4. Mode toggle
  // =====================================================================
  function setMode(mode) {
    state.mode = mode;
    const isEncode = mode === 'encode';
    encodeSectionEl.hidden = !isEncode;
    decodeSectionEl.hidden = isEncode;
    modeEncodeBtn.setAttribute('aria-pressed', String(isEncode));
    modeDecodeBtn.setAttribute('aria-pressed', String(!isEncode));
    (isEncode ? encodeTextInputEl : decodeInputEl).focus();
    saveState();
  }
  modeEncodeBtn.addEventListener('click', () => setMode('encode'));
  modeDecodeBtn.addEventListener('click', () => setMode('decode'));

  // =====================================================================
  // 5. Encode: inputs (text, file, drag-drop), MIME field, guard
  // =====================================================================
  const MAX_ENCODE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB hard cap
  const WARN_ENCODE_FILE_BYTES = 2 * 1024 * 1024; //  2 MB soft warning

  function setEncodeFile(file) {
    state.encode.sourceFile = file || null;
    updateFileInfo();
    renderEncodeOutputs();
  }

  encodeFileInputEl.addEventListener('change', () => {
    setEncodeFile(encodeFileInputEl.files[0] || null);
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.add('drag-over'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.remove('drag-over'); })
  );
  dropzoneEl.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setEncodeFile(file);
  });

  function updateFileInfo() {
    const file = state.encode.sourceFile;
    if (file) {
      encodeFileInfoEl.hidden = false;
      encodeFileNameEl.textContent = file.name;
      encodeFileSizeEl.textContent = formatBytes(file.size);
      encodeFileMimeEl.textContent = file.type || 'application/octet-stream';
      encodeMimeInputEl.disabled = true;
    } else {
      encodeFileInfoEl.hidden = true;
      encodeMimeInputEl.disabled = false;
    }
  }

  encodeRemoveFileBtn.addEventListener('click', () => {
    encodeFileInputEl.value = ''; // so re-selecting the same filename still fires 'change'
    setEncodeFile(null);
  });

  function currentEncodeSourceByteLength() {
    const file = state.encode.sourceFile;
    if (file) return file.size;
    return new TextEncoder().encode(encodeTextInputEl.value).length;
  }

  function updateEncodeWarning() {
    const len = currentEncodeSourceByteLength();
    if (len > WARN_ENCODE_FILE_BYTES && len <= MAX_ENCODE_FILE_BYTES) {
      showEncodeWarning(`Large input (${formatBytes(len)}) — this may take a moment.`);
    } else {
      hideEncodeWarning();
    }
  }

  function showEncodeWarning(message) {
    encodeWarningEl.textContent = message;
    encodeWarningEl.hidden = false;
  }

  function hideEncodeWarning() {
    encodeWarningEl.hidden = true;
    encodeWarningEl.textContent = '';
  }

  function showEncodeError(message) {
    encodeErrorEl.textContent = message;
    encodeErrorEl.hidden = false;
  }

  function hideEncodeError() {
    encodeErrorEl.hidden = true;
    encodeErrorEl.textContent = '';
  }

  function clearEncodeOutputs() {
    encodeBase64OutputEl.value = '';
    encodeBase64UrlOutputEl.value = '';
    encodeDataUriOutputEl.value = '';
    encodeSnippetOutputEl.value = '';
  }

  // =====================================================================
  // 6. Encode: computing and rendering the four outputs
  // =====================================================================
  async function getEncodeSourceBytes() {
    const file = state.encode.sourceFile;
    if (file) {
      if (file.size > MAX_ENCODE_FILE_BYTES) {
        throw new Error(`File too large to encode (${formatBytes(file.size)}, limit ${formatBytes(MAX_ENCODE_FILE_BYTES)}).`);
      }
      return new Uint8Array(await file.arrayBuffer());
    }
    return new TextEncoder().encode(encodeTextInputEl.value);
  }

  function getEncodeMime() {
    if (state.encode.sourceFile) return state.encode.sourceFile.type || 'application/octet-stream';
    return encodeMimeInputEl.value.trim() || 'text/plain';
  }

  function jsSnippet(dataUri) {
    return [
      '// Turn this data URI back into a Blob:',
      `fetch(${JSON.stringify(dataUri)})`,
      '  .then((res) => res.blob())',
      '  .then((blob) => {',
      '    // use `blob` here, e.g.:',
      '    // const url = URL.createObjectURL(blob);',
      '  });',
    ].join('\n');
  }

  async function renderEncodeOutputs() {
    hideEncodeError();
    updateEncodeWarning();
    const hasSource = state.encode.sourceFile || encodeTextInputEl.value !== '';
    if (!hasSource) { clearEncodeOutputs(); return; }
    try {
      const bytes = await getEncodeSourceBytes();
      const mime = getEncodeMime();
      const b64 = bytesToBase64(bytes);
      const b64url = toBase64Url(b64);
      const dataUri = `data:${mime};base64,${b64}`;
      encodeBase64OutputEl.value = b64;
      encodeBase64UrlOutputEl.value = b64url;
      encodeDataUriOutputEl.value = dataUri;
      encodeSnippetOutputEl.value = jsSnippet(dataUri);
    } catch (err) {
      showEncodeError(err.message);
      clearEncodeOutputs();
    }
  }

  // `debounce` comes from lib utils/CtUtil.mjs (<<ct:module>> in the template).
  const debouncedRenderEncodeOutputs = debounce(() => { renderEncodeOutputs(); }, 150);
  // The encode text-input is persisted (per docs/conventions.md); save on
  // the same debounce cadence as the re-render. The MIME field is not
  // persisted, so it only triggers the render debounce.
  const debouncedSaveEncodeText = debounce(() => { saveState(); }, 150);
  encodeTextInputEl.addEventListener('input', debouncedRenderEncodeOutputs);
  encodeTextInputEl.addEventListener('input', debouncedSaveEncodeText);
  encodeMimeInputEl.addEventListener('input', debouncedRenderEncodeOutputs);

  // =====================================================================
  // 7. Decode: parsing, rendering, and Download
  // =====================================================================
  function showDecodeError(message) {
    decodeErrorEl.textContent = message;
    decodeErrorEl.hidden = false;
  }

  function hideDecodeError() {
    decodeErrorEl.hidden = true;
    decodeErrorEl.textContent = '';
  }

  function clearDecodeOutputs() {
    state.decode.last = null;
    decodeDetectedMimeEl.hidden = true;
    decodeDetectedMimeEl.textContent = '';
    decodeTextColEl.hidden = true;
    decodeTextOutputEl.value = '';
    decodeBinaryNoteEl.hidden = true;
    decodeDownloadBtn.disabled = true;
  }

  function renderDecodeOutput() {
    hideDecodeError();
    const raw = decodeInputEl.value;
    if (raw.trim() === '') { clearDecodeOutputs(); return; }
    let result;
    try {
      result = decodeInput(raw);
    } catch (err) {
      showDecodeError(err.message);
      clearDecodeOutputs();
      return;
    }
    state.decode.last = result;
    decodeDetectedMimeEl.hidden = false;
    decodeDetectedMimeEl.textContent = `Detected type: ${result.mime}`;
    if (result.isText) {
      decodeTextColEl.hidden = false;
      decodeTextOutputEl.value = result.text;
      decodeBinaryNoteEl.hidden = true;
    } else {
      decodeTextColEl.hidden = true;
      decodeTextOutputEl.value = '';
      decodeBinaryNoteEl.hidden = false;
    }
    decodeDownloadBtn.disabled = false;
  }

  const debouncedRenderDecodeOutput = debounce(() => { renderDecodeOutput(); }, 150);
  const debouncedSaveDecodeText = debounce(() => { saveState(); }, 150);
  decodeInputEl.addEventListener('input', debouncedRenderDecodeOutput);
  decodeInputEl.addEventListener('input', debouncedSaveDecodeText);

  function downloadDecoded() {
    const result = state.decode.last;
    if (!result) return;
    // Shared file-download helper (`downloadBlob` from lib utils/CtUtil.mjs).
    downloadBlob(result.bytes, `decoded.${extensionForMime(result.mime)}`, result.mime);
  }
  decodeDownloadBtn.addEventListener('click', downloadDecoded);

  // =====================================================================
  // 8. Copy buttons (shared pattern) — `copy`/`flash` from lib
  // components/CtClipboardUtil.mjs (<<ct:module>> in the template)
  // =====================================================================
  async function handleCopyClick(btn, text) {
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    flash(btn, { label: '✅', revertTo: '📋' });
  }

  // Always-on copies (read-only outputs live inside their .ct-field).
  encodeBase64CopyBtn.addEventListener('click', () => handleCopyClick(encodeBase64CopyBtn, encodeBase64OutputEl.value));
  encodeBase64UrlCopyBtn.addEventListener('click', () => handleCopyClick(encodeBase64UrlCopyBtn, encodeBase64UrlOutputEl.value));
  encodeDataUriCopyBtn.addEventListener('click', () => handleCopyClick(encodeDataUriCopyBtn, encodeDataUriOutputEl.value));
  encodeSnippetCopyBtn.addEventListener('click', () => handleCopyClick(encodeSnippetCopyBtn, encodeSnippetOutputEl.value));
  decodeTextCopyBtn.addEventListener('click', () => handleCopyClick(decodeTextCopyBtn, decodeTextOutputEl.value));

  // In-field copy on the EDITABLE inputs (encode text, decode input, MIME) —
  // revealed only when the field is non-empty (docs/conventions.md § "In-field
  // copy button"). CSS can't read a value, so we toggle the button's [hidden]
  // on input; refreshEditableCopy() re-syncs after a programmatic value change
  // (Clear, restore-on-load).
  encodeTextCopyBtn.addEventListener('click', () => handleCopyClick(encodeTextCopyBtn, encodeTextInputEl.value));
  decodeInputCopyBtn.addEventListener('click', () => handleCopyClick(decodeInputCopyBtn, decodeInputEl.value));
  encodeMimeCopyBtn.addEventListener('click', () => handleCopyClick(encodeMimeCopyBtn, encodeMimeInputEl.value));

  function wireEditableCopy(inputEl, btn) {
    if (!inputEl || !btn) return;
    const sync = () => { btn.hidden = inputEl.value.trim() === ''; };
    inputEl.addEventListener('input', sync);
    inputEl.__copySync = sync; // let programmatic value changes refresh it
    sync();
  }

  function refreshEditableCopy(inputEl) {
    if (inputEl && typeof inputEl.__copySync === 'function') inputEl.__copySync();
  }

  wireEditableCopy(encodeTextInputEl, encodeTextCopyBtn);
  wireEditableCopy(decodeInputEl, decodeInputCopyBtn);
  wireEditableCopy(encodeMimeInputEl, encodeMimeCopyBtn);

  // =====================================================================
  // 9. Clear buttons (no confirm dialog — DESIGN.md marks Clear low-stakes)
  // =====================================================================
  encodeClearBtn.addEventListener('click', () => {
    encodeTextInputEl.value = '';
    encodeMimeInputEl.value = 'text/plain';
    encodeMimeInputEl.disabled = false;
    encodeFileInputEl.value = '';
    state.encode.sourceFile = null;
    updateFileInfo();
    clearEncodeOutputs();
    hideEncodeError();
    hideEncodeWarning();
    refreshEditableCopy(encodeTextInputEl); // now empty → hide its copy
    refreshEditableCopy(encodeMimeInputEl); // reset to "text/plain" → show its copy
    document.activeElement?.blur();
    encodeTextInputEl.focus();
    saveState();
  });

  decodeClearBtn.addEventListener('click', () => {
    decodeInputEl.value = '';
    clearDecodeOutputs();
    hideDecodeError();
    refreshEditableCopy(decodeInputEl); // now empty → hide its copy
    document.activeElement?.blur();
    decodeInputEl.focus();
    saveState();
  });

  // =====================================================================
  // 9b. Help modal — purely informational (what the tool does + how to use
  // it), auto-shown once on first load per docs/conventions.md's "First-load
  // help popup (all tools)". Static markup in the document (shown/hidden via
  // the `hidden` attribute) rather than built/torn down per open/close.
  // Structure/focus-handling mirrors tools/hat-picker's Help modal, the
  // reference implementation for this convention.
  // =====================================================================
  let helpPreviouslyFocused = null;

  function getHelpFocusable() {
    return Array.from(
      helpDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }

  function onHelpKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getHelpFocusable();
    if (focusable.length === 0) return;
    e.preventDefault();
    const idx = focusable.indexOf(document.activeElement);
    let next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0) next = focusable.length - 1;
    if (next >= focusable.length) next = 0;
    focusable[next].focus();
  }

  function openHelp() {
    helpPreviouslyFocused = document.activeElement;
    helpOverlayEl.hidden = false;
    document.addEventListener('keydown', onHelpKeydown, true);
    helpDialogEl.scrollTop = 0;
    helpCloseXBtn.focus({ preventScroll: true });
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    document.removeEventListener('keydown', onHelpKeydown, true);
    if (helpPreviouslyFocused && typeof helpPreviouslyFocused.focus === 'function') {
      try { helpPreviouslyFocused.focus(); } catch (e) { /* ignore */ }
    }
    helpPreviouslyFocused = null;
  }

  helpButtonEl.addEventListener('click', () => openHelp());
  helpCloseXBtn.addEventListener('click', () => closeHelp());
  helpOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target !== helpOverlayEl) return;
    // Prevent the browser's default mousedown focus handling: since the
    // overlay itself isn't a focusable element, a plain click on it would
    // otherwise blur/refocus (typically to <body>) AFTER closeHelp() below
    // has already returned focus to the trigger, silently undoing it.
    e.preventDefault();
    closeHelp();
  });

  // =====================================================================
  // 10. Initial render — restore persisted mode + text inputs (if any),
  // then re-run encode/decode so the derived outputs reflect the restored
  // text, exactly as if the user had just typed it. If nothing is stored
  // (or it's unreadable), loadState() returns the same defaults as today
  // and the tool starts empty.
  // =====================================================================
  (function init() {
    const loaded = loadState();
    encodeTextInputEl.value = loaded.encodeText;
    decodeInputEl.value = loaded.decodeText;
    setMode(loaded.mode);
    renderEncodeOutputs();
    renderDecodeOutput();
    // Sync the editable in-field copy buttons to the restored values.
    refreshEditableCopy(encodeTextInputEl);
    refreshEditableCopy(decodeInputEl);
    refreshEditableCopy(encodeMimeInputEl);

    // Auto-show the Help modal once, on a genuinely fresh visit only. Marking
    // it seen right away (rather than on close) keeps this a true "once" —
    // even if the visitor navigates away without explicitly closing it, it
    // won't auto-show again next time.
    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  })();

  // =====================================================================
  // 11. Test hook — inert namespace for Playwright-driven tests
  // =====================================================================
  window.__base64Tool = {
    // pure functions (DESIGN.md's required set)
    encodeText,
    decodeText,
    bytesToBase64,
    base64ToBytes,
    toBase64Url,
    fromBase64Url,
    parseDataUri,

    // additional pure/logic helpers
    normalizeBase64,
    decodeInput,
    extensionForMime,

    // deterministic entry points
    setMode,
    renderEncodeOutputs,
    renderDecodeOutput,

    // live state
    state,
  };
