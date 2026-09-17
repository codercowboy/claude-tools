
  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const pasteInputEl = document.getElementById('pasteInput');
  const convertBtn = document.getElementById('convertBtn');
  const clearPasteBtn = document.getElementById('clearPasteBtn');
  const parseSummaryEl = document.getElementById('parseSummary');

  const rowsList = document.getElementById('rowsList');
  const addRowBtn = document.getElementById('addRowBtn');
  const removeAllBtn = document.getElementById('removeAllBtn');

  const rgbaOutputEl = document.getElementById('rgbaOutput');
  const hexOutputEl = document.getElementById('hexOutput');
  const rgbaCopyAllBtn = document.getElementById('rgbaCopyAllBtn');
  const hexCopyAllBtn = document.getElementById('hexCopyAllBtn');
  const rgbaOutputCopyBtn = document.getElementById('rgbaOutputCopyBtn');
  const hexOutputCopyBtn = document.getElementById('hexOutputCopyBtn');

  const helpButton = document.getElementById('help-button');
  const helpOverlay = document.querySelector('[data-testid="help-overlay"]');
  const helpDialog = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXButton = helpDialog.querySelector('[data-testid="modal-close-x"]');

  // =====================================================================
  // 2. State
  // =====================================================================
  let nextId = 1;

  const state = {
    rows: [
      // { id, rawText, parsed: {r,g,b,a} | null }
    ],
  };

  // Versioned localStorage key — docs/conventions.md § "Persist UI state
  // (localStorage)" (hat-picker is the exemplar). Bump the version if the
  // stored shape ever changes.
  const STORAGE_KEY = 'color-converter:v1';

  // First-load Help popup — docs/conventions.md § "First-load help popup
  // (all tools)". Separate versioned key from STORAGE_KEY so bumping one
  // never affects the other.
  const HELP_SEEN_KEY = 'color-converter:help-seen:v1';

  // Per-row DOM references, keyed by row object, so live typing can update
  // just this row's visuals without a full renderRows() (which would steal
  // focus from the input the user is actively typing in).
  const rowEls = new WeakMap(); // row -> { li, input, swatch, hexOutput, rgbaOutput, hexField, rgbaField }

<<ct:inline logic.mjs>>
  // =====================================================================
  // 5. Persistence (localStorage) — docs/conventions.md § "Persist UI state
  // (localStorage)". The rows are the single source of truth (see DESIGN.md),
  // so only each row's raw text and the paste-box text are persisted — the
  // parsed color and the two derived output textareas are DERIVED and are
  // recomputed from rawText on restore, never stored. Best-effort: every
  // read/write is try/catch-wrapped and failures degrade silently — the tool
  // works fully with no stored (or unreadable/corrupt) state.
  // =====================================================================
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        rows: state.rows.map((r) => r.rawText),
        paste: pasteInputEl.value,
      }));
    } catch { /* localStorage unavailable/throwing (file://, private mode, quota, policy) — in-memory only */ }
  }

  // Reads + validates the stored blob. Always returns a usable
  // { rows: string[], paste: string } shape — {rows: [], paste: ''} for
  // missing/unreadable/malformed storage, so callers never need a fallback.
  function restoreState() {
    const fallback = { rows: [], paste: '' };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      const rows = Array.isArray(parsed.rows) ? parsed.rows.filter((r) => typeof r === 'string') : [];
      const paste = typeof parsed.paste === 'string' ? parsed.paste : '';
      return { rows, paste };
    } catch {
      return fallback; // localStorage unavailable/throwing, or corrupt JSON
    }
  }

  // Whether the visitor has already dismissed the Help modal at least once.
  // If localStorage throws/is unavailable, treat it as already-seen so we
  // don't nag on every load — the least-annoying safe fallback (the ? button
  // is always there if they want the modal later).
  function hasSeenHelp() {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch {
      return true;
    }
  }

  function markHelpSeen() {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      // Best-effort, same as saveState().
    }
  }

  // =====================================================================
  // 6. Row management
  // =====================================================================
  function addRow(rawText = '') {
    const row = { id: nextId++, rawText, parsed: parseColor(rawText) };
    state.rows.push(row); // append — newest at the bottom (reading order)
    renderRows();
    renderOutputs();
    saveState();
    return row;
  }

  function removeRow(id) {
    state.rows = state.rows.filter((r) => r.id !== id);
    renderRows();
    renderOutputs();
    saveState();
  }

  function removeAllRows() {
    state.rows = [];
    renderRows();
    renderOutputs();
    saveState();
  }

  function updateRemoveAllDisabled() {
    removeAllBtn.disabled = state.rows.length === 0;
  }

  // =====================================================================
  // 7. Row rendering
  // =====================================================================
  function renderRows() {
    rowsList.innerHTML = '';
    for (const row of state.rows) {
      rowsList.appendChild(buildRow(row));
    }
    updateRemoveAllDisabled();
  }

  function buildRow(row) {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.testid = 'color-row';
    li.dataset.id = String(row.id);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'row-input';
    input.dataset.testid = 'row-input';
    input.setAttribute('aria-label', 'Color (rgba or hex)');
    input.value = row.rawText;
    input.addEventListener('input', () => onRowInput(row, input));
    li.appendChild(input);

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.dataset.testid = 'row-swatch';
    li.appendChild(swatch);

    const hexField = buildField('hex-field', 'row-hex-output', 'row-hex-copy', 'Copy hex value', 'Hex output');
    const rgbaField = buildField('rgba-field', 'row-rgba-output', 'row-rgba-copy', 'Copy rgba value', 'RGBA output');
    li.appendChild(hexField.wrap);
    li.appendChild(rgbaField.wrap);

    const trashBtn = document.createElement('button');
    trashBtn.type = 'button';
    trashBtn.className = 'trash-btn';
    trashBtn.dataset.testid = 'row-trash';
    trashBtn.setAttribute('aria-label', 'Remove row');
    trashBtn.title = 'Remove row';
    trashBtn.textContent = '🗑';
    // UI path goes through the shared ctConfirm dialog;
    // window.__colorConverter.removeRow remains a direct, non-modal function
    // for programmatic/test use (and is what this handler calls on confirm).
    trashBtn.addEventListener('click', async () => {
      if (await ctConfirm('Remove this color?')) removeRow(row.id);
    });
    li.appendChild(trashBtn);

    rowEls.set(row, {
      li,
      input,
      swatch,
      hexOutput: hexField.input,
      rgbaOutput: rgbaField.input,
    });

    updateRowVisuals(row);
    return li;
  }

  // Per-color value field: read-only <input> wrapped in a `.ct-field` with an
  // in-field `.ct-copy-btn` at its right edge (docs/conventions.md § "Standard
  // control height & in-field copy — controls.css"). These are OUTPUT fields,
  // so the copy button shows always (no reveal-when-non-empty toggle).
  function buildField(fieldClass, inputTestId, copyTestId, copyLabel, fieldLabel) {
    const wrap = document.createElement('div');
    wrap.className = `ct-field ${fieldClass}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.dataset.testid = inputTestId;
    input.setAttribute('aria-label', fieldLabel);
    wrap.appendChild(input);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ct-copy-btn';
    copyBtn.dataset.testid = copyTestId;
    copyBtn.setAttribute('aria-label', copyLabel);
    copyBtn.title = copyLabel;
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => handleCopyClick(copyBtn, input.value));
    wrap.appendChild(copyBtn);

    return { wrap, input };
  }

  // Debounced live-parse on input. Deliberately does NOT call renderRows()
  // (full rebuild) — that would destroy/recreate the input mid-keystroke and
  // lose focus/cursor position. Instead mutate row state directly and touch
  // only this row's cached elements.
  // Shared trailing-edge debounce (jbc-include/util.js, inlined as a global).
  // Each row keeps its own debounced handler so an input only defers its own row.
  const debounce = jbcUtil.debounce;
  function onRowInput(row, inputEl) {
    if (!row._debouncedInput) {
      row._debouncedInput = debounce(() => {
        row.rawText = inputEl.value;
        row.parsed = parseColor(row.rawText);
        updateRowVisuals(row);
        renderOutputs(); // cheap full recompute, safe every debounced input
        saveState();
      }, 150);
    }
    row._debouncedInput();
  }

  function updateRowVisuals(row) {
    const els = rowEls.get(row);
    if (!els) return;
    const { li, swatch, hexOutput, rgbaOutput } = els;

    const isEmpty = row.rawText.trim() === '';
    const isInvalid = !isEmpty && row.parsed === null;

    li.classList.toggle('invalid', isInvalid);

    if (isEmpty) {
      swatch.className = 'swatch empty';
      swatch.style.removeProperty('--swatch-color');
      hexOutput.value = '';
      rgbaOutput.value = '';
    } else if (isInvalid) {
      swatch.className = 'swatch invalid';
      swatch.style.removeProperty('--swatch-color');
      hexOutput.value = '';
      rgbaOutput.value = '';
    } else {
      swatch.className = row.parsed.a < 1 ? 'swatch alpha' : 'swatch';
      swatch.style.setProperty('--swatch-color', rgbaString(row.parsed));
      hexOutput.value = hexString(row.parsed);
      rgbaOutput.value = rgbaString(row.parsed);
    }
  }

  addRowBtn.addEventListener('click', () => {
    const row = addRow('');
    const els = rowEls.get(row);
    if (els) els.input.focus();
  });

  // =====================================================================
  // 8. Derived outputs (RGBA-per-line, HEX-per-line)
  // =====================================================================
  // Invalid-line placeholder: a literal token that can't collide with a
  // real color value, keeping the original text visible so the user can
  // find and fix the offending row. Documented in the README.
  function invalidLine(rawText) {
    return `INVALID: ${rawText}`;
  }

  function rowToRgbaLine(row) {
    if (row.rawText.trim() === '') return '';
    return row.parsed ? rgbaString(row.parsed) : invalidLine(row.rawText);
  }

  function rowToHexLine(row) {
    if (row.rawText.trim() === '') return '';
    return row.parsed ? hexString(row.parsed) : invalidLine(row.rawText);
  }

  function rgbaOutput() {
    return state.rows.map(rowToRgbaLine).join('\n');
  }

  function hexOutput() {
    return state.rows.map(rowToHexLine).join('\n');
  }

  function renderOutputs() {
    rgbaOutputEl.value = rgbaOutput();
    hexOutputEl.value = hexOutput();
  }

  // =====================================================================
  // 9. Copy (per-field + copy-all) — shared ctCopy/ctFlash (tools/include/
  // copy.js, pasted above as a classic <script>)
  // =====================================================================
  async function handleCopyClick(btn, text) {
    if (!text) return; // nothing to copy on an empty/invalid row's output field
    const ok = await ctCopy(text);
    if (!ok) return;
    const current = btn.dataset.ctcFlashOriginal ?? btn.textContent;
    ctFlash(btn, { label: current === 'Copy all' ? 'Copied!' : '✅' });
  }

  rgbaCopyAllBtn.addEventListener('click', () => handleCopyClick(rgbaCopyAllBtn, rgbaOutputEl.value));
  hexCopyAllBtn.addEventListener('click', () => handleCopyClick(hexCopyAllBtn, hexOutputEl.value));

  // In-field copy buttons pinned to each "one per line" output textarea's
  // top-right (docs/conventions.md § controls.css in-field copy; textareas use
  // .ct-field--multiline). Outputs, so they show always; they copy the whole
  // textarea and complement the standalone "Copy all" buttons below.
  rgbaOutputCopyBtn.addEventListener('click', () => handleCopyClick(rgbaOutputCopyBtn, rgbaOutputEl.value));
  hexOutputCopyBtn.addEventListener('click', () => handleCopyClick(hexOutputCopyBtn, hexOutputEl.value));

  // =====================================================================
  // 9b. Help modal — purely informational (what the tool does + how to use
  // it), so it's its own small dedicated dialog rather than ctConfirm (which
  // is a yes/no destructive-action confirm). Markup is static in the
  // document (shown/hidden via [hidden]) rather than built/torn down per
  // open/close. Structure/focus-handling mirrors tools/hat-picker's Help
  // modal, the reference implementation for this convention (see
  // docs/conventions.md "First-load help popup (all tools)").
  // =====================================================================
  let helpPreviouslyFocused = null;

  function getHelpFocusable() {
    return Array.from(
      helpDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
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
    helpOverlay.hidden = false;
    document.addEventListener('keydown', onHelpKeydown, true);
    helpDialog.scrollTop = 0;
    helpCloseXButton.focus({ preventScroll: true });
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
    document.removeEventListener('keydown', onHelpKeydown, true);
    if (helpPreviouslyFocused && typeof helpPreviouslyFocused.focus === 'function') {
      try { helpPreviouslyFocused.focus(); } catch { /* ignore */ }
    }
    helpPreviouslyFocused = null;
  }

  helpButton.addEventListener('click', () => openHelp());
  helpCloseXButton.addEventListener('click', () => closeHelp());
  helpOverlay.addEventListener('mousedown', (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  // =====================================================================
  // 10. Bulk convert
  // =====================================================================
  // REPLACE semantics: Convert first erases all current rows (which, via
  // renderOutputs(), also clears both derived output textareas), then
  // regenerates rows fresh from the given text. It does not accumulate
  // across repeated calls — a second Convert reflects only the latest paste
  // contents, not the union of every past Convert.
  function bulkConvert(text) {
    state.rows = [];
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    let invalidCount = 0;
    for (const line of lines) {
      const row = { id: nextId++, rawText: line, parsed: parseColor(line) };
      if (row.parsed === null) invalidCount++;
      state.rows.push(row);
    }
    renderRows();
    renderOutputs();
    showParseSummary(lines.length, invalidCount);
    saveState();
    return { added: lines.length, invalid: invalidCount };
  }

  function showParseSummary(generated, invalid) {
    parseSummaryEl.textContent =
      invalid > 0
        ? `Generated ${generated} row${generated === 1 ? '' : 's'} — ${invalid} couldn't be parsed.`
        : `Generated ${generated} row${generated === 1 ? '' : 's'}.`;
  }

  convertBtn.addEventListener('click', () => {
    bulkConvert(pasteInputEl.value);
    // Paste text is intentionally left in place (only "Clear" empties it) so
    // the user can cross-check what was just converted. The paste box is the
    // source of truth for regeneration, not something Convert consumes.
    // Convert is this tool's commit/submit action: dismiss the mobile
    // keyboard on a successful run by blurring the active element (the paste
    // textarea) — docs/conventions.md § Responsive & mobile.
    document.activeElement?.blur();
  });

  // Clear (paste box), per-row trash, and Remove all are the three
  // destructive actions in this tool. Each is guarded by the shared
  // ctConfirm dialog (tools/include/confirm.js, pasted above) with an
  // action-specific message; the underlying mutation only runs if the user
  // confirms. Per-row trash is wired in buildRow() above.
  clearPasteBtn.addEventListener('click', async () => {
    if (await ctConfirm('Clear the paste box?')) {
      pasteInputEl.value = ''; // clears only the paste box, never rows
      saveState();
    }
  });

  removeAllBtn.addEventListener('click', async () => {
    if (state.rows.length === 0) return; // defensive; button is disabled when empty
    if (await ctConfirm('Remove all rows?')) removeAllRows();
  });

  // The paste box's own draft text is persisted independently of rows/
  // Convert — it's part of "where the user left off", not something Convert
  // consumes (Convert leaves it in place; only Clear empties it).
  pasteInputEl.addEventListener('input', () => saveState());

  // =====================================================================
  // 11. Initial render + restore
  // =====================================================================
  // Restore-on-load: rows (and the derived output textareas) are rebuilt
  // from each stored row's raw text, re-parsing/re-deriving fresh rather
  // than trusting any stored derived data (there is none — only rawText is
  // persisted). Missing/unreadable/corrupt storage falls back to today's
  // behavior: start empty.
  (function init() {
    const restored = restoreState();
    pasteInputEl.value = restored.paste;
    state.rows = restored.rows.map((rawText) => ({ id: nextId++, rawText, parsed: parseColor(rawText) }));
    renderRows();
    renderOutputs();

    // Auto-show the Help modal once, on a genuinely fresh visit only.
    // Marking it seen right away (rather than on close) keeps this a true
    // "once" — even if the visitor navigates away without explicitly closing
    // it, it won't auto-show again next time.
    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  })();

  // =====================================================================
  // 12. Test hook
  // =====================================================================
  // Inert namespace for Playwright-driven tests: pure formatters, action
  // functions, live (non-cloned) state, and derived-output getters.
  window.__colorConverter = {
    parseColor,
    rgbaString,
    hexString,
    addRow,
    bulkConvert,
    removeRow,
    removeAllRows,
    state,
    rgbaOutput,
    hexOutput,
  };
