import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, wireDropzone, wireCopyButtons } from '../../../lib/components/CtComponents.mjs';
import { debounce, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const modeTextBtn = document.getElementById('modeTextBtn');
  const modeFileBtn = document.getElementById('modeFileBtn');
  const textSectionEl = document.querySelector('.text-section');
  const fileSectionEl = document.querySelector('.file-section');

  const textInputEl = document.getElementById('textInput');
  const textCopyBtn = document.querySelector('[data-testid="text-input-copy"]');
  const clearTextBtn = document.getElementById('clearTextBtn');

  const dropzoneEl = document.querySelector('.dropzone');
  const fileInputEl = document.getElementById('fileInput');
  const fileInfoEl = document.querySelector('[data-testid="file-info"]');
  const fileNameEl = fileInfoEl.querySelector('.file-name');
  const fileSizeEl = fileInfoEl.querySelector('.file-size');
  const removeFileBtn = document.querySelector('[data-testid="remove-file-btn"]');
  const fileWarningEl = document.querySelector('[data-testid="file-warning"]');
  const fileErrorEl = document.querySelector('[data-testid="file-error"]');

  const base64ToggleEl = document.getElementById('base64Toggle');
  const hmacKeyEl = document.getElementById('hmacKey');

  const plainResultsEl = document.getElementById('plainResults');
  const hmacResultsEl = document.getElementById('hmacResults');
  const resultsStatusEl = document.querySelector('[data-testid="results-status"]');
  const copyAllBtn = document.getElementById('copyAllBtn');

  const helpButtonEl = document.getElementById('help-button');

  // =====================================================================
  // 2. Constants & algorithm metadata
  // =====================================================================
  // Every algorithm is always computed and shown — no picking which appear.
  const PLAIN_ORDER = ['md5', 'sha1', 'sha256', 'sha512', 'crc32'];
  const HMAC_ORDER = ['md5', 'sha1', 'sha256', 'sha512']; // CRC32 has no HMAC
  const ALGO_LABEL = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512', crc32: 'CRC32' };
  const SHA_FAMILY = new Set(['sha1', 'sha256', 'sha512']); // Base64 shown for these
  const HASH_FN = { md5: null, sha1: null, sha256: null, sha512: null }; // filled after logic inline

  const WARN_FILE_BYTES = 5 * 1024 * 1024;   //  5 MB soft warning
  const MAX_FILE_BYTES = 50 * 1024 * 1024;   // 50 MB hard cap

  const EMPTY_PLACEHOLDER = '—';

  // =====================================================================
  // 3. State & persistence
  // =====================================================================
  // The HMAC key and any file bytes are SECRETS / transient — held in memory
  // only, NEVER persisted (docs/conventions.md § "Persist UI state"). Only
  // mode, input text, and the Base64 toggle are written to localStorage.
  const state = {
    mode: 'text',        // 'text' | 'file'
    sourceFile: null,    // File | null
    fileBytes: null,     // Uint8Array | null (cached bytes for the current file)
    hmacKey: '',         // in-memory only — SECRET
  };

  const STORAGE_KEY = 'hasher:v1';
  const HELP_SEEN_KEY = 'hasher:help-seen:v1';


  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        inputText: textInputEl.value,
        showBase64: base64ToggleEl.checked,
      }));
    } catch (err) { /* best-effort: degrade to in-memory only */ }
  }

  function loadState() {
    const fallback = { mode: 'text', inputText: '', showBase64: false };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const p = JSON.parse(raw);
      return {
        mode: p && p.mode === 'file' ? 'file' : 'text',
        inputText: p && typeof p.inputText === 'string' ? p.inputText : '',
        showBase64: !!(p && p.showBase64),
      };
    } catch (err) {
      return fallback;
    }
  }

  // =====================================================================
  // 4. Pure core functions (no DOM access) — inlined at build time; the unit
  // tests import the same source/logic.mjs directly.
  // =====================================================================
<<ct:inline logic.mjs>>
  HASH_FN.md5 = md5; HASH_FN.sha1 = sha1; HASH_FN.sha256 = sha256; HASH_FN.sha512 = sha512;

  // =====================================================================
  // 5. Mode toggle
  // =====================================================================
  function setMode(mode) {
    state.mode = mode;
    const isText = mode === 'text';
    textSectionEl.hidden = !isText;
    fileSectionEl.hidden = isText;
    saveState();
    recompute();
  }
  // Shared single-select segmented control: click / Arrow-key select, roving
  // tabindex + aria-pressed bookkeeping handled by wireSegmented.
  const modeSeg = wireSegmented(
    document.querySelector('[data-testid="mode-toggle"]'), setMode);

  // =====================================================================
  // 6. File input (choose / drag-drop / remove) + size guard
  // =====================================================================
  // Shared human byte-size formatter (../claude-tools/src/lib/utils/CtUtil.mjs, inlined global).
  const fmtBytes = (n) => formatBytes(n); // JbcByteUtil.formatBytes, flattened in via logic.mjs's JbcByteUtil import

  function showFileError(msg) { fileErrorEl.textContent = msg; fileErrorEl.hidden = false; }
  function hideFileError() { fileErrorEl.hidden = true; fileErrorEl.textContent = ''; }
  function showFileWarning(msg) { fileWarningEl.textContent = msg; fileWarningEl.hidden = false; }
  function hideFileWarning() { fileWarningEl.hidden = true; fileWarningEl.textContent = ''; }

  async function setFile(file) {
    hideFileError();
    hideFileWarning();
    state.sourceFile = file || null;
    state.fileBytes = null;
    if (!file) {
      fileInfoEl.hidden = true;
      recompute();
      return;
    }
    fileInfoEl.hidden = false;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = fmtBytes(file.size);
    if (file.size > MAX_FILE_BYTES) {
      showFileError(`File too large to hash (${fmtBytes(file.size)}, limit ${fmtBytes(MAX_FILE_BYTES)}).`);
      recompute();
      return;
    }
    if (file.size > WARN_FILE_BYTES) {
      showFileWarning(`Large file (${fmtBytes(file.size)}) — hashing may take a moment.`);
    }
    try {
      state.fileBytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      showFileError('Could not read the file.');
    }
    recompute();
  }

  fileInputEl.addEventListener('change', () => { setFile(fileInputEl.files[0] || null); });

  wireDropzone(dropzoneEl, (files) => {
    const file = files[0];
    if (file) setFile(file);
  }, { dragClass: 'drag-over' });

  removeFileBtn.addEventListener('click', () => {
    fileInputEl.value = '';
    setFile(null);
  });

  // =====================================================================
  // 7. Options wiring
  // =====================================================================
  base64ToggleEl.addEventListener('change', () => { saveState(); recompute(); });
  hmacKeyEl.addEventListener('input', () => {
    state.hmacKey = hmacKeyEl.value; // in-memory only, NEVER persisted
    debouncedRecompute();            // live HMAC update as the key is typed
  });

  // =====================================================================
  // 8. Compute + render
  // =====================================================================
  function currentSourceBytes() {
    if (state.mode === 'file') return state.fileBytes; // may be null (none/too big/unread)
    return textToBytes(textInputEl.value);
  }

  function hasSource() {
    if (state.mode === 'file') return state.fileBytes !== null;
    return textInputEl.value.length > 0;
  }

  // Build the model for one algorithm digest.
  // Returns { testidBase, label, hex, base64 } where:
  //   hex     — string, or null for the neutral placeholder
  //   base64  — string / null (placeholder) when a Base64 field should show,
  //             or undefined when no Base64 field for this algorithm.
  function plainEntry(algo, bytes) {
    const wantB64 = base64ToggleEl.checked && SHA_FAMILY.has(algo);
    const entry = { testidBase: algo, label: ALGO_LABEL[algo], hex: null, base64: wantB64 ? null : undefined };
    if (!bytes) return entry;
    if (algo === 'crc32') {
      entry.hex = crc32Hex(bytes);
    } else {
      const digest = HASH_FN[algo](bytes);
      entry.hex = bytesToHex(digest);
      if (wantB64) entry.base64 = bytesToBase64(digest);
    }
    return entry;
  }

  function hmacEntry(algo, bytes, keyBytes) {
    const wantB64 = base64ToggleEl.checked && SHA_FAMILY.has(algo);
    const entry = { testidBase: 'hmac-' + algo, label: 'HMAC-' + ALGO_LABEL[algo], hex: null, base64: wantB64 ? null : undefined };
    if (!bytes || !keyBytes) return entry;
    const digest = hmac(algo, keyBytes, bytes);
    entry.hex = bytesToHex(digest);
    if (wantB64) entry.base64 = bytesToBase64(digest);
    return entry;
  }

  // Render one labeled read-only field (with an always-shown in-field copy).
  function appendField(container, item, encLabel, testid, value) {
    const wrap = document.createElement('div');
    wrap.className = 'result-field';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = encLabel;
    label.setAttribute('for', testid);

    const field = document.createElement('div');
    field.className = 'ct-field';

    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.id = testid;
    input.dataset.testid = testid;
    input.className = 'value-input';
    if (value == null) {
      input.value = '';
      input.placeholder = EMPTY_PLACEHOLDER;
      input.classList.add('placeholder');
    } else {
      input.value = value;
    }

    const copyTestid = testid.replace('value-', 'copy-');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ct-copy-btn';
    btn.setAttribute('data-copy-target', testid);
    btn.dataset.testid = copyTestid;
    btn.title = `Copy ${encLabel}`;
    btn.setAttribute('aria-label', `Copy ${encLabel}`);
    btn.textContent = '📋';

    field.append(input, btn);
    wrap.append(label, field);
    item.appendChild(wrap);
  }

  function renderEntries(container, entries) {
    container.textContent = '';
    for (const e of entries) {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.dataset.testid = 'result-' + e.testidBase;

      appendField(item, item, e.label + ' · Hex', 'value-' + e.testidBase + '-hex', e.hex);
      if (e.base64 !== undefined) {
        appendField(item, item, e.label + ' · Base64', 'value-' + e.testidBase + '-base64', e.base64);
      }
      container.appendChild(item);
    }
  }

  let lastResults = []; // computed entries (hex !== null) for Copy all

  function recompute() {
    const bytes = hasSource() ? currentSourceBytes() : null;
    const key = hmacKeyEl.value;
    const keyBytes = key.length > 0 ? textToBytes(key) : null;

    const plain = PLAIN_ORDER.map((a) => plainEntry(a, bytes));
    const hmacs = HMAC_ORDER.map((a) => hmacEntry(a, bytes, keyBytes));

    renderEntries(plainResultsEl, plain);
    renderEntries(hmacResultsEl, hmacs);

    lastResults = [...plain, ...hmacs].filter((e) => e.hex !== null);
    copyAllBtn.disabled = lastResults.length === 0;

    if (lastResults.length > 0) {
      const n = lastResults.length;
      resultsStatusEl.textContent = `Computed ${n} digest${n === 1 ? '' : 's'}.`;
    } else {
      resultsStatusEl.textContent = '';
    }
  }

  // Shared trailing-edge debounce (../claude-tools/src/lib/utils/CtUtil.mjs, inlined global).
  const debouncedRecompute = debounce(recompute, 150);
  const debouncedSaveAndRecompute = debounce(() => { saveState(); recompute(); }, 150);
  textInputEl.addEventListener('input', () => { syncTextCopy(); debouncedSaveAndRecompute(); });

  // =====================================================================
  // 9. Copy buttons (copy / flash from JbcClipboardUtil.mjs)
  // =====================================================================
  // Delegated: every in-field copy button carries data-copy-target pointing at
  // the value field's data-testid; copy its current value. Routed through the
  // shared wireCopyButtons (JbcComponents) — one listener on document,
  // resolves target by [data-testid] then id, copies value/text, flashes.
  wireCopyButtons(document, { copy, flash, revertTo: '📋' });

  // The editable text input reveals its in-field copy only when non-empty.
  function syncTextCopy() {
    textCopyBtn.hidden = textInputEl.value.length === 0;
  }

  copyAllBtn.addEventListener('click', async () => {
    if (lastResults.length === 0) return;
    const lines = [];
    for (const r of lastResults) {
      lines.push(`${r.label}: ${r.hex}`);
      if (typeof r.base64 === 'string') lines.push(`${r.label} (Base64): ${r.base64}`);
    }
    const ok = await copy(lines.join('\n'));
    if (ok) flash(copyAllBtn, { label: 'Copied!', revertTo: 'Copy all' });
  });

  // =====================================================================
  // 10. Clear (low-stakes — no confirm, per DESIGN.md carve-out)
  // =====================================================================
  clearTextBtn.addEventListener('click', () => {
    textInputEl.value = '';
    document.activeElement?.blur();
    textInputEl.focus();
    syncTextCopy();
    saveState();
    recompute();
  });

  // =====================================================================
  // 11. Help modal — the shared jbcModal primitive (../claude-tools/src/lib/components/CtModal.mjs),
  // built from the hidden #help-body template. Focus-trap / Esc + backdrop
  // close / focus-return / reduced-motion / scroll-top live in that primitive.
  // `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x hooks;
  // `titleId` pins aria-labelledby; `autoOpen` rides the shared onceFlag
  // so it auto-shows once on a fresh visit and never again.
  // =====================================================================
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How Hasher works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // =====================================================================
  // 12. Init — restore persisted state, then compute
  // =====================================================================
  (function init() {
    const loaded = loadState();
    textInputEl.value = loaded.inputText;
    base64ToggleEl.checked = loaded.showBase64;
    syncTextCopy();
    modeSeg.select(loaded.mode); // sets aria-pressed, then setMode (saveState + recompute)
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // =====================================================================
  // 13. Test hook — inert namespace for Playwright-driven tests
  // =====================================================================
  window.__hasher = {
    // pure functions
    textToBytes, bytesToHex, bytesToBase64,
    md5, sha1, sha256, sha512, crc32, crc32Hex, hmac,
    // deterministic entry points
    setMode: (m) => modeSeg.select(m), recompute,
    // live state
    state,
  };
