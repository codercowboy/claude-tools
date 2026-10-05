import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, wireTabs, showError, hideError } from '../../../lib/components/CtComponents.mjs';
import { debounce, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // Pretty-Printer & Minifier — app (DOM wiring, render, persistence).
  // The pure engine is inlined below; nothing in logic.mjs touches the DOM
  // or localStorage.
  // =====================================================================
<<ct:inline logic.mjs>>

  // 1. Constants & state
  // =====================================================================
  const LANGS = ['json', 'yaml', 'html', 'css', 'sql', 'js'];
  const LANG_LABEL = { json: 'JSON', yaml: 'YAML', html: 'HTML', css: 'CSS', sql: 'SQL', js: 'JavaScript' };

  // Map (lang, mode) -> engine function.
  const ENGINES = {
    json: { format: formatJSON, minify: minifyJSON },
    yaml: { format: formatYAML, minify: minifyYAML },
    html: { format: formatHTML, minify: minifyHTML },
    css: { format: formatCSS, minify: minifyCSS },
    sql: { format: formatSQL, minify: minifySQL },
    js: { format: formatJS, minify: minifyJS },
  };

  const state = {
    tab: 'json',                 // active language
    mode: 'format',              // 'format' | 'minify'
    indent: '2',                 // '2' | '4' | 'tab'
    sqlKeywordCase: 'unchanged', // 'unchanged' (default) | 'upper' | 'lower'
    inputs: { json: '', yaml: '', html: '', css: '', sql: '', js: '' },
  };

  const STORAGE_KEY = 'pretty-printer:v1';
  const HELP_SEEN_KEY = 'pretty-printer:help-seen:v1';


  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tab: state.tab,
        mode: state.mode,
        indent: state.indent,
        sqlKeywordCase: state.sqlKeywordCase,
        inputs: state.inputs, // per-language text only; never the derived output
      }));
    } catch (err) {
      // Best-effort: localStorage unavailable/throwing → in-memory only.
    }
  }

  function loadState() {
    const fallback = {
      tab: 'json', mode: 'format', indent: '2', sqlKeywordCase: 'unchanged',
      inputs: { json: '', yaml: '', html: '', css: '', sql: '', js: '' },
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const p = JSON.parse(raw);
      const inputs = { ...fallback.inputs };
      if (p && p.inputs && typeof p.inputs === 'object') {
        for (const lang of LANGS) {
          if (typeof p.inputs[lang] === 'string') inputs[lang] = p.inputs[lang];
        }
      }
      return {
        tab: LANGS.includes(p && p.tab) ? p.tab : 'json',
        mode: (p && p.mode) === 'minify' ? 'minify' : 'format',
        indent: ['2', '4', 'tab'].includes(p && p.indent) ? p.indent : '2',
        sqlKeywordCase: ['upper', 'lower', 'unchanged'].includes(p && p.sqlKeywordCase) ? p.sqlKeywordCase : 'unchanged',
        inputs,
      };
    } catch (err) {
      return fallback;
    }
  }

  // =====================================================================
  // 2. DOM references
  // =====================================================================
  const tablistEl = document.querySelector('[data-testid="tablist"]');
  const tabEls = LANGS.map((lang) => document.querySelector(`[data-testid="tab-${lang}"]`));

  const modeFormatBtn = document.getElementById('mode-format');
  const modeMinifyBtn = document.getElementById('mode-minify');
  const indentFieldEl = document.querySelector('[data-testid="indent-field"]');
  const indentSelect = document.getElementById('indent-select');
  const sqlCaseFieldEl = document.querySelector('[data-testid="sql-case-field"]');
  const sqlCaseSelect = document.getElementById('sql-keyword-case');
  const loadSampleBtn = document.getElementById('load-sample');
  const clearBtn = document.getElementById('clear-input');

  const inputEl = document.getElementById('pp-input');
  const outputEl = document.getElementById('pp-output');
  const inputBytesEl = document.querySelector('[data-testid="input-bytes"]');
  const statsEl = document.querySelector('[data-testid="pp-stats"]');
  const errorEl = document.querySelector('[data-testid="pp-error"]');
  const copyBtn = document.getElementById('copy-output');
  const copyInputBtn = document.getElementById('copy-input');
  const editorPanelEl = document.getElementById('panel-editor');

  const helpButtonEl = document.getElementById('help-button');

  // =====================================================================
  // 3. Rendering
  // =====================================================================
  function humanBytes(nBytes) {
    return nBytes === 1 ? '1 byte' : `${nBytes} bytes`;
  }

  function showErrorBanner(message) { showError(errorEl, message); }
  function hideErrorBanner() { hideError(errorEl); errorEl.textContent = ''; }

  function currentEngine() {
    return ENGINES[state.tab][state.mode];
  }

  function currentOpts() {
    const indent = state.indent === 'tab' ? '\t' : Number(state.indent);
    const opts = { indent };
    if (state.tab === 'sql') opts.keywordCase = state.sqlKeywordCase;
    return opts;
  }

  // The input's in-field copy button is revealed only when the input is
  // non-empty (an editable field — CSS can't read its value, so we toggle it).
  function refreshInputCopy() {
    if (copyInputBtn) copyInputBtn.hidden = inputEl.value.length === 0;
  }

  // Run the active engine over the active input and render output + stats.
  function run() {
    const src = inputEl.value;
    state.inputs[state.tab] = src;
    refreshInputCopy();
    const inBytes = byteLength(src);
    inputBytesEl.textContent = humanBytes(inBytes);

    if (src.trim() === '') {
      outputEl.value = '';
      statsEl.textContent = '';
      hideErrorBanner();
      return;
    }

    let out;
    try {
      out = currentEngine()(src, currentOpts());
    } catch (err) {
      outputEl.value = '';
      statsEl.textContent = '';
      showErrorBanner(err && err.message ? err.message : String(err));
      return;
    }

    hideErrorBanner();
    outputEl.value = out;
    const outBytes = byteLength(out);
    if (state.mode === 'minify') {
      const saved = inBytes - outBytes;
      if (saved > 0) {
        const pct = inBytes > 0 ? Math.round((saved / inBytes) * 100) : 0;
        statsEl.innerHTML = `${humanBytes(inBytes)} → ${humanBytes(outBytes)} · <span class="saved">−${humanBytes(saved)} (${pct}%)</span>`;
      } else {
        statsEl.textContent = `${humanBytes(inBytes)} → ${humanBytes(outBytes)}`;
      }
    } else {
      statsEl.textContent = `${humanBytes(inBytes)} → ${humanBytes(outBytes)}`;
    }
  }

  // =====================================================================
  // 4. Tabs (WAI-ARIA tablist) — the shared wireTabs primitive owns the
  // aria-selected toggle, roving tabindex and Arrow/Home/End nav. All 6 language
  // tabs drive ONE shared editor panel (aria-controls="panel-editor"), which
  // wireTabs' shared-panel path keeps shown (never hidden). This onChange owns the
  // input-swap + render. The §9 restore reflects the active tab render-free and is
  // deliberately NOT routed through select() — that would run() before inputEl is
  // populated below.
  // =====================================================================
  const tabsCtl = wireTabs(tablistEl, (lang) => {
    // remember what's currently typed before switching away
    state.inputs[state.tab] = inputEl.value;
    state.tab = lang;
    editorPanelEl.setAttribute('aria-labelledby', `tab-${lang}`);
    // SQL keyword-case control only shows on the SQL tab.
    sqlCaseFieldEl.hidden = lang !== 'sql';
    inputEl.value = state.inputs[lang];
    updateControlAvailability();
    run();
    saveState();
  });

  // =====================================================================
  // 5. Mode / indent / SQL-case controls
  // =====================================================================
  function updateControlAvailability() {
    // Indent is only meaningful when formatting.
    const isFormat = state.mode === 'format';
    indentSelect.disabled = !isFormat;
    indentFieldEl.style.opacity = isFormat ? '' : '0.55';
    // SQL keyword-case applies to formatSQL only.
    sqlCaseSelect.disabled = !(state.tab === 'sql' && isFormat);
  }

  // Shared single-select segmented control (wireSegmented): click /
  // Arrow-key select + roving tabindex + aria-pressed bookkeeping.
  const modeSeg = wireSegmented(modeFormatBtn.parentElement, (mode) => {
    state.mode = mode === 'minify' ? 'minify' : 'format';
    updateControlAvailability();
    run();
    saveState();
  });
  // Public/test-hook entry point drives the control (sets aria + fires onChange).
  function setMode(mode) { modeSeg.select(mode === 'minify' ? 'minify' : 'format'); }
  function setTab(lang) { if (LANGS.includes(lang)) tabsCtl.select(lang); }

  indentSelect.addEventListener('change', () => {
    state.indent = ['2', '4', 'tab'].includes(indentSelect.value) ? indentSelect.value : '2';
    run();
    saveState();
  });

  sqlCaseSelect.addEventListener('change', () => {
    state.sqlKeywordCase = ['upper', 'lower', 'unchanged'].includes(sqlCaseSelect.value) ? sqlCaseSelect.value : 'upper';
    run();
    saveState();
  });

  // =====================================================================
  // 6. Input, Load sample, Clear
  // =====================================================================
  // Shared trailing-edge debounce (CtUtil in the shared lib, inlined as a global).
  const debouncedRun = debounce(() => { run(); saveState(); }, 150);
  inputEl.addEventListener('input', () => { refreshInputCopy(); debouncedRun(); });

  loadSampleBtn.addEventListener('click', async () => {
    // Guard only when the current input is non-empty (it would be overwritten).
    if (inputEl.value.trim() !== '') {
      const ok = await confirmDialog(`Replace the ${LANG_LABEL[state.tab]} input with the sample?`);
      if (!ok) return;
    }
    inputEl.value = SAMPLES[state.tab] || '';
    run();
    saveState();
    inputEl.focus();
  });

  // Clear is low-stakes per-language input → no confirm (documented in DESIGN).
  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    run();
    saveState();
    document.activeElement?.blur();
    inputEl.focus();
  });

  // =====================================================================
  // 7. Copy output
  // =====================================================================
  copyBtn.addEventListener('click', async () => {
    const text = outputEl.value;
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    flash(copyBtn, { label: '✅', revertTo: '📋' });
  });

  copyInputBtn.addEventListener('click', async () => {
    const text = inputEl.value;
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    flash(copyInputBtn, { label: '✅', revertTo: '📋' });
  });

  // =====================================================================
  // 8. Help modal — the shared jbcModal primitive (src/lib/components/CtModal.mjs), built
  // from the hidden #help-body template. Focus-trap / Esc + backdrop close /
  // focus-return / reduced-motion / scroll-top live in that primitive.
  // `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x hooks;
  // `titleId` pins aria-labelledby; `autoOpen` rides the shared onceFlag
  // so it auto-shows once on a fresh visit and never again.
  // =====================================================================
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'Pretty-Printer & Minifier',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // =====================================================================
  // 9. Init — restore persisted state, wire the initial view
  // =====================================================================
  (function init() {
    const loaded = loadState();
    state.mode = loaded.mode;
    state.indent = loaded.indent;
    state.sqlKeywordCase = loaded.sqlKeywordCase;
    state.inputs = loaded.inputs;
    state.tab = loaded.tab;

    indentSelect.value = state.indent;
    sqlCaseSelect.value = state.sqlKeywordCase;
    // Render-free reflect of the restored mode: aria only, so we do NOT fire the
    // segmented onChange (which would run() before inputEl.value is set below).
    modeFormatBtn.setAttribute('aria-pressed', String(state.mode === 'format'));
    modeMinifyBtn.setAttribute('aria-pressed', String(state.mode === 'minify'));

    // Reflect the active tab in the DOM and render.
    tabEls.forEach((el) => {
      const selected = el.dataset.lang === state.tab;
      el.setAttribute('aria-selected', String(selected));
      el.tabIndex = selected ? 0 : -1;
    });
    editorPanelEl.setAttribute('aria-labelledby', `tab-${state.tab}`);
    sqlCaseFieldEl.hidden = state.tab !== 'sql';
    inputEl.value = state.inputs[state.tab];
    updateControlAvailability();
    run();
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // =====================================================================
  // 10. Test hook — inert namespace for Playwright / unit-driven tests
  // =====================================================================
  window.__prettyPrinter = {
    // pure engines
    formatJSON, minifyJSON,
    parseYAML, formatYAML, minifyYAML,
    formatHTML, minifyHTML,
    formatCSS, minifyCSS,
    formatSQL, minifySQL,
    tokenizeJS, formatJS, minifyJS,
    byteLength, indentUnit, lineColFromOffset,
    SAMPLES,
    // deterministic entry points
    setTab, setMode, run,
    // live state
    state,
  };
