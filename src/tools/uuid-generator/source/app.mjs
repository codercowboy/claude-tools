
  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const modeGenerateBtn = document.getElementById('modeGenerateBtn');
  const modeInspectBtn = document.getElementById('modeInspectBtn');
  const generateSectionEl = document.querySelector('.generate-section');
  const inspectSectionEl = document.querySelector('.inspect-section');

  const typeToggleEl = document.querySelector('[data-testid="type-toggle"]');
  const typeButtons = Array.from(typeToggleEl.querySelectorAll('button[data-type]'));

  const countInputEl = document.getElementById('countInput');

  const optsUuidEl = document.querySelector('[data-testid="opts-uuid"]');
  const uppercaseToggleEl = document.getElementById('uppercaseToggle');
  const hyphensToggleEl = document.getElementById('hyphensToggle');
  const wrapSelectEl = document.getElementById('wrapSelect');

  const optsNanoidEl = document.querySelector('[data-testid="opts-nanoid"]');
  const nanoidSizeInputEl = document.getElementById('nanoidSizeInput');

  const optsTokenEl = document.querySelector('[data-testid="opts-token"]');
  const tokenLengthInputEl = document.getElementById('tokenLengthInput');
  const tokenAlphabetSelectEl = document.getElementById('tokenAlphabetSelect');
  const tokenUppercaseToggleEl = document.getElementById('tokenUppercaseToggle');
  const customAlphabetFieldEl = document.querySelector('[data-testid="custom-alphabet-field"]');
  const customAlphabetInputEl = document.getElementById('customAlphabetInput');

  const generateBtn = document.getElementById('generateBtn');
  const resultsCountEl = document.querySelector('[data-testid="results-count"]');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const resultsListEl = document.getElementById('resultsList');

  const inspectInputEl = document.getElementById('inspectInput');
  const inspectResultEl = document.querySelector('[data-testid="inspect-result"]');

  const helpButtonEl = document.getElementById('help-button');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtn = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  // =====================================================================
  // 2. State & persistence  (docs/conventions.md § Persist UI state)
  // Versioned key; try/catch everywhere; the generated VALUES are never
  // persisted (throwaway/derived) — only the settings that shape them.
  // =====================================================================
  const state = {
    mode: 'generate',      // 'generate' | 'inspect'
    type: 'uuidv4',        // uuidv4 | uuidv7 | ulid | nanoid | token
    count: 10,             // default bulk count for ALL id types
    uppercase: false,
    hyphens: true,
    wrap: 'plain',         // plain | quoted | braces
    nanoidSize: 21,
    tokenLength: 32,
    tokenAlphabet: 'hex',  // hex | base62 | base64url | custom
    customAlphabet: '',
    tokenUppercase: false,
    inspectText: '',
    values: [],            // NOT persisted
  };

  const STORAGE_KEY = 'uuid-generator:v1';
  const HELP_SEEN_KEY = 'uuid-generator:help-seen:v1';

  function hasSeenHelp() {
    try { return localStorage.getItem(HELP_SEEN_KEY) === '1'; }
    catch (err) { return true; }
  }
  function markHelpSeen() {
    try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch (err) { /* ignore */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        type: state.type,
        count: state.count,
        uppercase: state.uppercase,
        hyphens: state.hyphens,
        wrap: state.wrap,
        nanoidSize: state.nanoidSize,
        tokenLength: state.tokenLength,
        tokenAlphabet: state.tokenAlphabet,
        customAlphabet: state.customAlphabet,
        tokenUppercase: state.tokenUppercase,
        inspectText: state.inspectText,
      }));
    } catch (err) { /* best-effort */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return;
      const TYPES = ['uuidv4', 'uuidv7', 'ulid', 'nanoid', 'token'];
      const WRAPS = ['plain', 'quoted', 'braces'];
      const ALPHAS = ['hex', 'base62', 'base64url', 'custom'];
      if (p.mode === 'inspect') state.mode = 'inspect';
      if (TYPES.includes(p.type)) state.type = p.type;
      if (Number.isFinite(p.count)) state.count = clampInt(p.count, 1, 1000, 10);
      state.uppercase = !!p.uppercase;
      state.hyphens = p.hyphens !== false;
      if (WRAPS.includes(p.wrap)) state.wrap = p.wrap;
      if (Number.isFinite(p.nanoidSize)) state.nanoidSize = clampInt(p.nanoidSize, 1, 256, 21);
      if (Number.isFinite(p.tokenLength)) state.tokenLength = clampInt(p.tokenLength, 1, 512, 32);
      if (ALPHAS.includes(p.tokenAlphabet)) state.tokenAlphabet = p.tokenAlphabet;
      if (typeof p.customAlphabet === 'string') state.customAlphabet = p.customAlphabet;
      state.tokenUppercase = !!p.tokenUppercase;
      if (typeof p.inspectText === 'string') state.inspectText = p.inspectText;
    } catch (err) { /* start with defaults */ }
  }

  function clampInt(v, min, max, fallback) {
    let n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // =====================================================================
  // 3. Pure engine (DOM-free) — inlined by the build.
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 4. Byte source — the ONLY randomness in the tool.
  //
  // ⚠️ Uses crypto.getRandomValues (works in EVERY context). We deliberately
  // never call crypto.randomUUID() — it is secure-context-only and throws over
  // plain LAN HTTP (documented repo bug; see DESIGN.md / docs/conventions.md).
  // crypto.getRandomValues caps at 65536 bytes/call, so we chunk. A Math.random
  // fallback is used ONLY when `crypto` is entirely absent (degraded, non-crypto
  // strength — flagged in the UI when it happens).
  // =====================================================================
  const cryptoObj = (typeof crypto !== 'undefined') ? crypto : null;
  const hasSecureRandom = !!(cryptoObj && typeof cryptoObj.getRandomValues === 'function');

  function getRandomBytes(n) {
    const out = new Uint8Array(Math.max(0, n | 0));
    if (hasSecureRandom) {
      const MAX = 65536;
      for (let off = 0; off < out.length; off += MAX) {
        cryptoObj.getRandomValues(out.subarray(off, Math.min(off + MAX, out.length)));
      }
    } else {
      for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
    }
    return out;
  }

  // =====================================================================
  // 5. Generation
  // =====================================================================
  function currentTokenAlphabet() {
    if (state.tokenAlphabet === 'custom') {
      return state.customAlphabet && state.customAlphabet.length ? state.customAlphabet : TOKEN_ALPHABETS.hex;
    }
    return TOKEN_ALPHABETS[state.tokenAlphabet] || TOKEN_ALPHABETS.hex;
  }

  function applyUuidFormat(canonical) {
    let s = canonical;
    if (!state.hyphens) s = s.replace(/-/g, '');
    if (state.uppercase) s = s.toUpperCase();
    if (state.wrap === 'quoted') s = '"' + s + '"';
    else if (state.wrap === 'braces') s = '{' + s + '}';
    return s;
  }

  function generateOne(now) {
    switch (state.type) {
      case 'uuidv4':
        return applyUuidFormat(uuidV4(getRandomBytes(16)));
      case 'uuidv7':
        return applyUuidFormat(uuidV7(now, getRandomBytes(16)));
      case 'ulid':
        return ulid(now, getRandomBytes(10));
      case 'nanoid':
        return nanoid(state.nanoidSize, getRandomBytes(state.nanoidSize), NANOID_ALPHABET);
      case 'token': {
        const alpha = currentTokenAlphabet();
        let t = randomToken(state.tokenLength, alpha, getRandomBytes(state.tokenLength));
        if (state.tokenUppercase) t = t.toUpperCase();
        return t;
      }
      default:
        return '';
    }
  }

  function generateBatch() {
    const n = clampInt(countInputEl.value, 1, 1000, state.count);
    state.count = n;
    if (countInputEl.value !== String(n)) countInputEl.value = String(n);
    const now = Date.now();
    const values = new Array(n);
    for (let i = 0; i < n; i++) values[i] = generateOne(now);
    state.values = values;
    renderResults();
  }

  // =====================================================================
  // 6. Rendering — results
  // =====================================================================
  function renderResults() {
    resultsListEl.textContent = '';
    const values = state.values;
    if (!values.length) {
      resultsCountEl.textContent = '';
      copyAllBtn.disabled = true;
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.dataset.testid = 'empty-state';
      li.textContent = 'Click Generate to create IDs.';
      resultsListEl.appendChild(li);
      return;
    }
    copyAllBtn.disabled = false;
    resultsCountEl.textContent = `${values.length} ${values.length === 1 ? 'value' : 'values'}` +
      (hasSecureRandom ? '' : ' — ⚠ crypto unavailable, using non-secure Math.random fallback');

    const frag = document.createDocumentFragment();
    values.forEach((val, idx) => {
      const li = document.createElement('li');
      li.className = 'result-row';
      li.dataset.testid = 'result-row';

      const span = document.createElement('span');
      span.className = 'result-value';
      span.dataset.testid = 'result-value';
      span.textContent = val;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'result-copy-btn';
      btn.dataset.testid = 'result-copy-btn';
      btn.dataset.idx = String(idx);
      btn.title = 'Copy to clipboard';
      btn.setAttribute('aria-label', 'Copy to clipboard');
      btn.textContent = '📋';

      li.appendChild(span);
      li.appendChild(btn);
      frag.appendChild(li);
    });
    resultsListEl.appendChild(frag);
  }

  // Delegated copy for per-row buttons.
  resultsListEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.result-copy-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const val = state.values[idx];
    if (val == null) return;
    const ok = await ctCopy(val);
    if (ok) ctFlash(btn, { label: '✅', revertTo: '📋' });
  });

  copyAllBtn.addEventListener('click', async () => {
    if (!state.values.length) return;
    const ok = await ctCopy(state.values.join('\n'));
    if (ok) ctFlash(copyAllBtn, { label: 'Copied!', revertTo: 'Copy all' });
  });

  // =====================================================================
  // 7. Contextual option-group visibility
  // =====================================================================
  function updateOptionVisibility() {
    const t = state.type;
    optsUuidEl.hidden = !(t === 'uuidv4' || t === 'uuidv7');
    optsNanoidEl.hidden = t !== 'nanoid';
    optsTokenEl.hidden = t !== 'token';
    customAlphabetFieldEl.hidden = !(t === 'token' && state.tokenAlphabet === 'custom');
  }

  function setType(type) {
    state.type = type;
    typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    updateOptionVisibility();
    saveState();
    generateBatch();
  }

  // =====================================================================
  // 8. Inspect
  // =====================================================================
  function renderInspect() {
    inspectResultEl.textContent = '';
    const raw = inspectInputEl.value;
    state.inspectText = raw;
    const info = inspectUuid(raw);

    if (raw.trim() === '') {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Paste a UUID above to inspect it.';
      inspectResultEl.appendChild(p);
      return;
    }

    const status = document.createElement('div');
    status.className = 'inspect-status ' + (info.valid ? 'valid' : 'invalid');
    status.dataset.testid = 'inspect-status';
    status.textContent = info.valid ? '✓ Valid UUID' : '✕ ' + (info.error || 'Invalid UUID');
    inspectResultEl.appendChild(status);

    if (!info.valid) return;

    // Canonical form + copy.
    const canonRow = document.createElement('div');
    canonRow.className = 'ct-field canonical-row';
    const canonVal = document.createElement('span');
    canonVal.className = 'canonical-value';
    canonVal.dataset.testid = 'inspect-canonical';
    canonVal.textContent = info.canonical;
    const canonBtn = document.createElement('button');
    canonBtn.type = 'button';
    canonBtn.className = 'ct-copy-btn';
    canonBtn.dataset.testid = 'inspect-copy-btn';
    canonBtn.title = 'Copy canonical form';
    canonBtn.setAttribute('aria-label', 'Copy canonical form');
    canonBtn.textContent = '📋';
    canonBtn.addEventListener('click', async () => {
      const ok = await ctCopy(info.canonical);
      if (ok) ctFlash(canonBtn, { label: '✅', revertTo: '📋' });
    });
    canonRow.appendChild(canonVal);
    canonRow.appendChild(canonBtn);
    inspectResultEl.appendChild(canonRow);

    if (info.isNil || info.isMax) {
      const c = document.createElement('p');
      c.className = 'callout';
      c.dataset.testid = 'inspect-special';
      c.textContent = info.isNil
        ? 'This is the Nil UUID (all zeros).'
        : 'This is the Max UUID (all ones).';
      inspectResultEl.appendChild(c);
    }

    const rows = [
      ['Version', info.versionName],
      ['Variant', `${info.variantName} (${info.variantBits})`],
    ];
    if (info.timestamp && !isNaN(info.timestamp.getTime())) {
      rows.push(['Timestamp (ISO)', info.timestamp.toISOString()]);
      rows.push(['Timestamp (local)', info.timestamp.toString()]);
    } else if (info.version === 1 || info.version === 7) {
      rows.push(['Timestamp', 'unavailable']);
    }
    rows.push(['time_low', info.fields.timeLow]);
    rows.push(['time_mid', info.fields.timeMid]);
    rows.push(['time_hi_and_version', info.fields.timeHiAndVersion]);
    rows.push(['clock_seq_and_variant', info.fields.clockSeqAndVariant]);
    rows.push(['node', info.fields.node]);

    const table = document.createElement('table');
    table.className = 'breakdown';
    table.dataset.testid = 'inspect-breakdown';
    const tbody = document.createElement('tbody');
    rows.forEach(([k, v]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = k;
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    inspectResultEl.appendChild(table);
  }

  // =====================================================================
  // 9. Mode toggle
  // =====================================================================
  function setMode(mode) {
    state.mode = mode;
    const isGen = mode === 'generate';
    generateSectionEl.hidden = !isGen;
    inspectSectionEl.hidden = isGen;
    modeGenerateBtn.setAttribute('aria-pressed', String(isGen));
    modeInspectBtn.setAttribute('aria-pressed', String(!isGen));
    saveState();
    if (!isGen) inspectInputEl.focus();
  }

  // =====================================================================
  // 10. Events
  // =====================================================================
  modeGenerateBtn.addEventListener('click', () => setMode('generate'));
  modeInspectBtn.addEventListener('click', () => setMode('inspect'));

  typeButtons.forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));

  countInputEl.addEventListener('change', () => {
    state.count = clampInt(countInputEl.value, 1, 1000, state.count);
    countInputEl.value = String(state.count);
    saveState();
  });

  uppercaseToggleEl.addEventListener('change', () => { state.uppercase = uppercaseToggleEl.checked; saveState(); regenerateFormatOnly(); });
  hyphensToggleEl.addEventListener('change', () => { state.hyphens = hyphensToggleEl.checked; saveState(); regenerateFormatOnly(); });
  wrapSelectEl.addEventListener('change', () => { state.wrap = wrapSelectEl.value; saveState(); regenerateFormatOnly(); });

  nanoidSizeInputEl.addEventListener('change', () => {
    state.nanoidSize = clampInt(nanoidSizeInputEl.value, 1, 256, state.nanoidSize);
    nanoidSizeInputEl.value = String(state.nanoidSize);
    saveState();
    generateBatch();
  });

  tokenLengthInputEl.addEventListener('change', () => {
    state.tokenLength = clampInt(tokenLengthInputEl.value, 1, 512, state.tokenLength);
    tokenLengthInputEl.value = String(state.tokenLength);
    saveState();
    generateBatch();
  });
  tokenAlphabetSelectEl.addEventListener('change', () => {
    state.tokenAlphabet = tokenAlphabetSelectEl.value;
    updateOptionVisibility();
    saveState();
    generateBatch();
  });
  tokenUppercaseToggleEl.addEventListener('change', () => { state.tokenUppercase = tokenUppercaseToggleEl.checked; saveState(); generateBatch(); });
  customAlphabetInputEl.addEventListener('input', () => { state.customAlphabet = customAlphabetInputEl.value; saveState(); });
  customAlphabetInputEl.addEventListener('change', () => { generateBatch(); });

  // UUID format tweaks (uppercase/hyphens/wrap) can be re-applied to the
  // existing values without drawing fresh randomness — nicer UX and stable.
  function regenerateFormatOnly() {
    if (!(state.type === 'uuidv4' || state.type === 'uuidv7')) return;
    if (!state.values.length) { generateBatch(); return; }
    // Re-derive from the current values' canonical hex (strip any prior format).
    state.values = state.values.map((v) => {
      const hex = v.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length !== 32) return v;
      const lower = hex.toLowerCase();
      const canonical =
        lower.slice(0, 8) + '-' + lower.slice(8, 12) + '-' + lower.slice(12, 16) +
        '-' + lower.slice(16, 20) + '-' + lower.slice(20, 32);
      return applyUuidFormat(canonical);
    });
    renderResults();
  }

  generateBtn.addEventListener('click', () => {
    generateBatch();
    document.activeElement?.blur(); // dismiss mobile keyboard on commit
  });

  // Shared trailing-edge debounce (jbc-include/util.js, inlined global).
  const debounce = jbcUtil.debounce;
  const debouncedInspect = debounce(() => { renderInspect(); saveState(); }, 120);
  inspectInputEl.addEventListener('input', debouncedInspect);

  // =====================================================================
  // 11. Help modal (mirrors base64-tool)
  // =====================================================================
  let helpPreviouslyFocused = null;

  function getHelpFocusable() {
    return Array.from(
      helpDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }

  function onHelpKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeHelp(); return; }
    if (e.key !== 'Tab') return;
    const f = getHelpFocusable();
    if (f.length === 0) return;
    e.preventDefault();
    const idx = f.indexOf(document.activeElement);
    let next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0) next = f.length - 1;
    if (next >= f.length) next = 0;
    f[next].focus();
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
    e.preventDefault();
    closeHelp();
  });

  // =====================================================================
  // 12. Init — restore state, sync controls, first render.
  // =====================================================================
  (function init() {
    loadState();

    // Sync form controls to restored state.
    countInputEl.value = String(state.count);
    uppercaseToggleEl.checked = state.uppercase;
    hyphensToggleEl.checked = state.hyphens;
    wrapSelectEl.value = state.wrap;
    nanoidSizeInputEl.value = String(state.nanoidSize);
    tokenLengthInputEl.value = String(state.tokenLength);
    tokenAlphabetSelectEl.value = state.tokenAlphabet;
    tokenUppercaseToggleEl.checked = state.tokenUppercase;
    customAlphabetInputEl.value = state.customAlphabet;
    inspectInputEl.value = state.inspectText;

    typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.type)));
    updateOptionVisibility();

    // Apply mode without re-saving redundantly.
    const isGen = state.mode === 'generate';
    generateSectionEl.hidden = !isGen;
    inspectSectionEl.hidden = isGen;
    modeGenerateBtn.setAttribute('aria-pressed', String(isGen));
    modeInspectBtn.setAttribute('aria-pressed', String(!isGen));

    generateBatch();
    renderInspect();

    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  })();

  // =====================================================================
  // 13. Test hook — inert namespace for Playwright-driven tests.
  // =====================================================================
  window.__uuidGenerator = {
    // pure functions
    uuidV4, uuidV7, ulid, nanoid, randomToken, inspectUuid,
    formatUuidBytes, encodeTimeCrockford, bytesToCrockford,
    // constants
    CROCKFORD, NANOID_ALPHABET, TOKEN_ALPHABETS, VERSION_NAMES,
    // randomness (uses getRandomValues, never randomUUID)
    getRandomBytes, hasSecureRandom,
    // deterministic entry points
    setMode, setType, generateBatch, renderInspect,
    // live state
    state,
  };
