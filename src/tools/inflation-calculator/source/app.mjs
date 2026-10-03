
  // =====================================================================
  // Inflation Calculator — app (DOM wiring, render, persistence).
  // The pure engine is inlined below; nothing here touches localStorage or
  // the DOM inside logic.mjs. The CPI dataset is bundled into the page and
  // read from window.__INFLATION_CPI__ — no network request at runtime.
  // =====================================================================
<<ct:inline logic.mjs>>
  // ---------------------------------------------------------------------
  // 0. Bundled data
  // ---------------------------------------------------------------------
  const CPI_DOC = (typeof window !== 'undefined' && window.__INFLATION_CPI__) || { data: {} };
  const CPI = CPI_DOC.data || {};
  const RANGE = dataRange(CPI); // { minYear, maxYear }

  // ---------------------------------------------------------------------
  // 1. State & persistence
  // ---------------------------------------------------------------------
  const STORAGE_KEY = 'inflation-calculator:v1';
  const HELP_SEEN_KEY = 'inflation-calculator:help-seen:v1';

  function clampYear(y) {
    const n = Number(y);
    if (!Number.isInteger(n)) return null;
    if (n < RANGE.minYear || n > RANGE.maxYear) return null;
    return n;
  }

  const DEFAULTS = {
    amount: '100',
    // A friendly, meaningful default span: ~a generation back to the latest year.
    fromYear: clampYear(2000) || RANGE.minYear,
    toYear: RANGE.maxYear,
  };

  const state = { ...DEFAULTS };

  function hasSeenHelp() {
    try { return localStorage.getItem(HELP_SEEN_KEY) === '1'; }
    catch (err) { return true; }
  }
  function markHelpSeen() {
    try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch (err) { /* best-effort */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        amount: amountInput.value,
        fromYear: state.fromYear,
        toYear: state.toYear,
      }));
    } catch (err) { /* best-effort: in-memory only */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const p = JSON.parse(raw) || {};
      return {
        amount: typeof p.amount === 'string' ? p.amount : DEFAULTS.amount,
        fromYear: clampYear(p.fromYear) || DEFAULTS.fromYear,
        toYear: clampYear(p.toYear) || DEFAULTS.toYear,
      };
    } catch (err) {
      return { ...DEFAULTS };
    }
  }

  // ---------------------------------------------------------------------
  // 2. DOM references
  // ---------------------------------------------------------------------
  const amountInput = document.getElementById('amount-input');
  const fromSelect = document.getElementById('from-year');
  const toSelect = document.getElementById('to-year');
  const swapBtn = document.getElementById('swap-years');

  const resultValueEl = document.querySelector('[data-testid="result-value"]');
  const sentenceEl = document.querySelector('[data-testid="result-sentence"]');
  const cumulativeEl = document.querySelector('[data-testid="cumulative"]');
  const annualEl = document.querySelector('[data-testid="annual-rate"]');
  const errorEl = document.querySelector('[data-testid="error"]');
  const trendEl = document.querySelector('[data-testid="trend"]');

  const helpButtonEl = document.getElementById('help-button');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtn = helpDialogEl.querySelector('[data-testid="modal-close-x"]');
  const dataRangeEls = document.querySelectorAll('[data-testid="data-range"]');
  const lastUpdatedEl = document.querySelector('[data-testid="last-updated"]');

  // ---------------------------------------------------------------------
  // 3. Year selects
  // ---------------------------------------------------------------------
  function populateYearSelect(select) {
    select.innerHTML = '';
    for (let y = RANGE.maxYear; y >= RANGE.minYear; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      select.appendChild(opt);
    }
  }

  // ---------------------------------------------------------------------
  // 4. Trend sparkline (decorative CPI line over the selected span)
  // ---------------------------------------------------------------------
  function renderTrend() {
    const lo = Math.min(state.fromYear, state.toYear);
    const hi = Math.max(state.fromYear, state.toYear);
    if (lo === hi) { trendEl.hidden = true; trendEl.innerHTML = ''; return; }

    const W = 100, H = 28, pad = 2;
    const points = [];
    for (let y = lo; y <= hi; y++) {
      const v = CPI[y] != null ? Number(CPI[y]) : Number(CPI[String(y)]);
      if (Number.isFinite(v)) points.push([y, v]);
    }
    if (points.length < 2) { trendEl.hidden = true; trendEl.innerHTML = ''; return; }

    const ys = points.map((p) => p[1]);
    const minV = Math.min(...ys), maxV = Math.max(...ys);
    const span = maxV - minV || 1;
    const n = points.length - 1;
    const coords = points.map((p, i) => {
      const x = pad + (i / n) * (W - 2 * pad);
      const yy = H - pad - ((p[1] - minV) / span) * (H - 2 * pad);
      return `${x.toFixed(2)},${yy.toFixed(2)}`;
    });

    trendEl.hidden = false;
    trendEl.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
      `<polyline fill="none" stroke="currentColor" stroke-width="1.5" ` +
      `stroke-linejoin="round" stroke-linecap="round" points="${coords.join(' ')}"></polyline>` +
      `</svg>`;
  }

  // ---------------------------------------------------------------------
  // 5. Render
  // ---------------------------------------------------------------------
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function clearResults() {
    resultValueEl.textContent = '';
    sentenceEl.textContent = '';
    cumulativeEl.textContent = '';
    annualEl.textContent = '';
    trendEl.hidden = true;
    trendEl.innerHTML = '';
    refreshEditableCopy(amountInput);
  }

  function render() {
    refreshEditableCopy(amountInput);
    const raw = amountInput.value.trim();

    if (raw === '') { hideError(); clearResults(); return; }
    const amount = Number(raw.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount)) {
      showError('Enter a valid dollar amount.');
      clearResults();
      return;
    }

    let equivalent, cum, rate;
    try {
      equivalent = adjust(amount, state.fromYear, state.toYear, CPI);
      cum = cumulativeInflation(state.fromYear, state.toYear, CPI);
      rate = annualRate(state.fromYear, state.toYear, CPI);
    } catch (err) {
      showError(err.message);
      clearResults();
      return;
    }

    hideError();
    resultValueEl.textContent = formatUSD(equivalent);
    sentenceEl.textContent =
      `${formatUSD(amount)} in ${state.fromYear} has the same buying power as ` +
      `${formatUSD(equivalent)} in ${state.toYear}.`;
    cumulativeEl.textContent = state.fromYear === state.toYear ? '0%' : formatPercent(cum);
    annualEl.textContent = state.fromYear === state.toYear ? '0%/yr' : `${formatPercent(rate)}/yr`;
    renderTrend();
  }

  // ---------------------------------------------------------------------
  // 6. Events
  // ---------------------------------------------------------------------
  amountInput.addEventListener('input', () => { render(); saveState(); });

  fromSelect.addEventListener('change', () => {
    const y = clampYear(fromSelect.value);
    if (y != null) state.fromYear = y;
    render();
    saveState();
  });
  toSelect.addEventListener('change', () => {
    const y = clampYear(toSelect.value);
    if (y != null) state.toYear = y;
    render();
    saveState();
  });

  swapBtn.addEventListener('click', () => {
    const f = state.fromYear;
    state.fromYear = state.toYear;
    state.toYear = f;
    fromSelect.value = String(state.fromYear);
    toSelect.value = String(state.toYear);
    render();
    saveState();
  });

  // ---------------------------------------------------------------------
  // 7. Copy buttons (delegated; covers the in-field copy affordances)
  // ---------------------------------------------------------------------
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.ct-copy-btn');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-target');
    const el = document.querySelector(`[data-testid="${targetId}"]`);
    if (!el) return;
    const tag = el.tagName;
    const text = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') ? el.value : el.textContent;
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    flash(btn, { label: '✅', revertTo: '📋' });
  });

  // In-field copy on the editable amount is revealed only when non-empty.
  function wireEditableCopy(inputEl) {
    if (!inputEl) return;
    const btn = inputEl.parentElement?.querySelector('.ct-copy-btn');
    if (!btn) return;
    const sync = () => { btn.hidden = inputEl.value.trim() === ''; };
    inputEl.addEventListener('input', sync);
    inputEl.__copySync = sync;
    sync();
  }
  function refreshEditableCopy(inputEl) {
    if (inputEl && typeof inputEl.__copySync === 'function') inputEl.__copySync();
  }

  // ---------------------------------------------------------------------
  // 8. Help modal (repo modal conventions)
  // ---------------------------------------------------------------------
  let helpPreviouslyFocused = null;

  function getHelpFocusable() {
    return Array.from(
      helpDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }

  function onHelpKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeHelp(); return; }
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
    e.preventDefault();
    closeHelp();
  });

  // ---------------------------------------------------------------------
  // 9. Init
  // ---------------------------------------------------------------------
  (function init() {
    populateYearSelect(fromSelect);
    populateYearSelect(toSelect);

    const loaded = loadState();
    state.amount = loaded.amount;
    state.fromYear = loaded.fromYear;
    state.toYear = loaded.toYear;

    amountInput.value = loaded.amount;
    fromSelect.value = String(state.fromYear);
    toSelect.value = String(state.toYear);

    // Data provenance shown in the UI + Help.
    for (const el of dataRangeEls) el.textContent = `${RANGE.minYear}–${RANGE.maxYear}`;
    if (lastUpdatedEl && CPI_DOC.lastUpdated) lastUpdatedEl.textContent = CPI_DOC.lastUpdated;

    wireEditableCopy(amountInput);
    render();

    if (!hasSeenHelp()) { markHelpSeen(); openHelp(); }
  })();

  // ---------------------------------------------------------------------
  // 10. Test hook — inert namespace for Playwright / unit-driven tests
  // ---------------------------------------------------------------------
  window.__inflationCalculator = {
    // pure
    dataRange, cpiFor, adjust, cumulativeInflation, annualRate, formatUSD, formatPercent,
    // bundled data
    CPI, CPI_DOC, RANGE,
    // deterministic entry points
    setInputs({ amount, fromYear, toYear } = {}) {
      if (typeof amount === 'string') { amountInput.value = amount; }
      const f = clampYear(fromYear); if (f != null) { state.fromYear = f; fromSelect.value = String(f); }
      const t = clampYear(toYear); if (t != null) { state.toYear = t; toSelect.value = String(t); }
      render();
      saveState();
    },
    render,
    // live state
    state,
  };
