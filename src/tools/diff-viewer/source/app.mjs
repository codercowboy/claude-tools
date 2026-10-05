import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented } from '../../../lib/components/CtComponents.mjs';
import { debounce, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // 1. Pure engine (DOM-free) — inlined; also imported directly by unit tests
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 2. DOM references
  // =====================================================================
  const inputAEl = document.getElementById('inputA');
  const inputBEl = document.getElementById('inputB');
  const clearABtn = document.getElementById('clearABtn');
  const clearBBtn = document.getElementById('clearBBtn');
  const copyABtn = document.getElementById('copyABtn');
  const copyBBtn = document.getElementById('copyBBtn');
  const swapBtn = document.getElementById('swapBtn');
  const loadSampleBtn = document.getElementById('loadSampleBtn');

  const optTrimEl = document.getElementById('optTrim');
  const optAllWsEl = document.getElementById('optAllWs');
  const optCaseEl = document.getElementById('optCase');

  const viewSplitBtn = document.getElementById('viewSplitBtn');
  const viewInlineBtn = document.getElementById('viewInlineBtn');
  const copyUnifiedBtn = document.getElementById('copyUnifiedBtn');

  const statsEl = document.querySelector('[data-testid="stats"]');
  const warningEl = document.querySelector('[data-testid="size-warning"]');
  const splitEl = document.querySelector('[data-testid="diff-split"]');
  const inlineEl = document.querySelector('[data-testid="diff-inline"]');

  const helpButtonEl = document.getElementById('help-button');

  // =====================================================================
  // 3. State & persistence (single source of truth = the two inputs + opts +
  // view; the diff / stats / unified output are DERIVED and never stored)
  // =====================================================================
  const state = {
    view: 'split', // 'split' | 'inline'
    opts: {
      ignoreLeadingTrailingWhitespace: false,
      ignoreAllWhitespace: false,
      ignoreCase: false,
    },
  };

  const STORAGE_KEY = 'diff-viewer:v1';
  const HELP_SEEN_KEY = 'diff-viewer:help-seen:v1';
  const WARN_LINES = 8000; // soft warning threshold (total lines across A + B)


  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        textA: inputAEl.value,
        textB: inputBEl.value,
        view: state.view,
        opts: state.opts,
      }));
    } catch { /* best-effort; degrade to in-memory only */ }
  }

  function loadState() {
    const fallback = { textA: '', textB: '', view: 'split', opts: { ...state.opts } };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const p = JSON.parse(raw) || {};
      const o = p.opts || {};
      return {
        textA: typeof p.textA === 'string' ? p.textA : '',
        textB: typeof p.textB === 'string' ? p.textB : '',
        view: p.view === 'inline' ? 'inline' : 'split',
        opts: {
          ignoreLeadingTrailingWhitespace: !!o.ignoreLeadingTrailingWhitespace,
          ignoreAllWhitespace: !!o.ignoreAllWhitespace,
          ignoreCase: !!o.ignoreCase,
        },
      };
    } catch { return fallback; }
  }

  // =====================================================================
  // 4. Rendering helpers (all user text via textContent — never innerHTML)
  // =====================================================================
  function makeGutter(n) {
    const g = document.createElement('div');
    g.className = 'gutter';
    g.textContent = n == null ? '' : String(n);
    return g;
  }

  function makeCode(text, extraClass) {
    const c = document.createElement('div');
    c.className = 'code' + (extraClass ? ' ' + extraClass : '');
    c.textContent = text;
    return c;
  }

  // A code cell whose changed segments (from diffWords) are wrapped in spans.
  function makeWordCode(segs, side /* 'del' | 'ins' */) {
    const c = document.createElement('div');
    c.className = 'code';
    const keep = side === 'del' ? 'delete' : 'insert';
    for (const seg of segs) {
      if (seg.type === 'equal') {
        c.appendChild(document.createTextNode(seg.text));
      } else if (seg.type === keep) {
        const span = document.createElement('span');
        span.className = side === 'del' ? 'wd-del' : 'wd-ins';
        span.textContent = seg.text;
        c.appendChild(span);
      }
      // the opposite side's segments are omitted from this cell
    }
    return c;
  }

  function emptyMessage(container, msg) {
    const d = document.createElement('div');
    d.className = 'diff-empty';
    d.textContent = msg;
    container.replaceChildren(d);
  }

  // ---- side-by-side ----
  function renderSplit(ops) {
    const frag = document.createDocumentFragment();
    let aNo = 0;
    let bNo = 0;

    const addRow = (rowClass, aN, aCell, bN, bCell) => {
      const row = document.createElement('div');
      row.className = 'diff-row' + (rowClass ? ' ' + rowClass : '');
      row.appendChild(makeGutter(aN));
      row.appendChild(aCell);
      row.appendChild(makeGutter(bN));
      row.appendChild(bCell);
      frag.appendChild(row);
    };

    for (const op of ops) {
      if (op.type === 'equal') {
        for (let i = 0; i < op.aLines.length; i++) {
          addRow('', ++aNo, makeCode(op.aLines[i]), ++bNo, makeCode(op.bLines[i]));
        }
      } else if (op.type === 'delete') {
        for (const l of op.aLines) {
          addRow('r-del', ++aNo, makeCode(l), null, makeCode('', 'cell-empty'));
        }
      } else if (op.type === 'insert') {
        for (const l of op.bLines) {
          addRow('r-add', null, makeCode('', 'cell-empty'), ++bNo, makeCode(l));
        }
      } else { // replace — align pairs, word-highlight, pad the shorter side
        const n = Math.max(op.aLines.length, op.bLines.length);
        for (let i = 0; i < n; i++) {
          const aHas = i < op.aLines.length;
          const bHas = i < op.bLines.length;
          if (aHas && bHas) {
            const segs = diffWords(op.aLines[i], op.bLines[i]);
            const row = document.createElement('div');
            row.className = 'diff-row r-chg';
            row.appendChild(makeGutter(++aNo));
            row.appendChild(makeWordCode(segs, 'del'));
            row.appendChild(makeGutter(++bNo));
            row.appendChild(makeWordCode(segs, 'ins'));
            frag.appendChild(row);
          } else if (aHas) {
            addRow('r-del', ++aNo, makeCode(op.aLines[i]), null, makeCode('', 'cell-empty'));
          } else {
            addRow('r-add', null, makeCode('', 'cell-empty'), ++bNo, makeCode(op.bLines[i]));
          }
        }
      }
    }
    splitEl.replaceChildren(frag);
  }

  // ---- inline / unified ----
  function renderInline(ops) {
    const frag = document.createDocumentFragment();
    let aNo = 0;
    let bNo = 0;

    const addRow = (rowClass, aN, bN, sign, cell) => {
      const row = document.createElement('div');
      row.className = 'diff-row' + (rowClass ? ' ' + rowClass : '');
      row.appendChild(makeGutter(aN));
      row.appendChild(makeGutter(bN));
      const s = document.createElement('div');
      s.className = 'sign';
      s.textContent = sign;
      row.appendChild(s);
      row.appendChild(cell);
      frag.appendChild(row);
    };

    for (const op of ops) {
      if (op.type === 'equal') {
        for (let i = 0; i < op.aLines.length; i++) {
          addRow('', ++aNo, ++bNo, ' ', makeCode(op.aLines[i]));
        }
      } else if (op.type === 'delete') {
        for (const l of op.aLines) addRow('r-del', ++aNo, null, '−', makeCode(l));
      } else if (op.type === 'insert') {
        for (const l of op.bLines) addRow('r-add', null, ++bNo, '+', makeCode(l));
      } else { // replace: deletes (word-highlighted) then inserts
        const n = Math.max(op.aLines.length, op.bLines.length);
        for (let i = 0; i < op.aLines.length; i++) {
          const cell = i < op.bLines.length
            ? makeWordCode(diffWords(op.aLines[i], op.bLines[i]), 'del')
            : makeCode(op.aLines[i]);
          addRow('r-del', ++aNo, null, '−', cell);
        }
        for (let i = 0; i < op.bLines.length; i++) {
          const cell = i < op.aLines.length
            ? makeWordCode(diffWords(op.aLines[i], op.bLines[i]), 'ins')
            : makeCode(op.bLines[i]);
          addRow('r-add', null, ++bNo, '+', cell);
        }
        void n;
      }
    }
    inlineEl.replaceChildren(frag);
  }

  // =====================================================================
  // 5. Stats + main render (derived on every change)
  // =====================================================================
  function renderStats(stats, hasInput, identical) {
    if (!hasInput) {
      statsEl.textContent = 'Enter text in A and B to compare.';
      return;
    }
    if (identical) {
      statsEl.textContent = 'No differences.';
      return;
    }
    statsEl.replaceChildren();
    const add = document.createElement('span');
    add.className = 's-add';
    add.textContent = `${stats.added} added`;
    const del = document.createElement('span');
    del.className = 's-del';
    del.textContent = `${stats.removed} removed`;
    const chg = document.createElement('span');
    chg.className = 's-chg';
    chg.textContent = `${stats.changed} changed`;
    statsEl.append(add, document.createTextNode(' · '), del, document.createTextNode(' · '), chg);
  }

  let lastUnified = '';

  // In-field copy buttons (controls.css § in-field copy): reveal only when the
  // textarea is non-empty so an icon never floats over placeholder text.
  function syncCopyButtons() {
    copyABtn.hidden = inputAEl.value === '';
    copyBBtn.hidden = inputBEl.value === '';
  }

  function render() {
    const a = inputAEl.value;
    const b = inputBEl.value;
    const hasInput = a !== '' || b !== '';

    // soft large-input warning
    const totalLines = splitLines(a).length + splitLines(b).length;
    if (totalLines > WARN_LINES) {
      warningEl.hidden = false;
      warningEl.textContent = `Large input (${totalLines.toLocaleString()} lines) — the diff may take a moment.`;
    } else {
      warningEl.hidden = true;
      warningEl.textContent = '';
    }

    const { ops, stats } = diffLines(a, b, state.opts);
    const identical = hasInput && stats.added === 0 && stats.removed === 0 && stats.changed === 0;

    renderStats(stats, hasInput, identical);

    if (!hasInput) {
      emptyMessage(splitEl, 'The side-by-side diff will appear here.');
      emptyMessage(inlineEl, 'The inline diff will appear here.');
    } else if (identical) {
      emptyMessage(splitEl, 'The two texts are identical under the current options.');
      emptyMessage(inlineEl, 'The two texts are identical under the current options.');
    } else {
      if (state.view === 'split') {
        renderSplit(ops);
        emptyMessage(inlineEl, '');
      } else {
        renderInline(ops);
        emptyMessage(splitEl, '');
      }
    }

    lastUnified = hasInput ? toUnifiedDiff(a, b, state.opts, { aName: 'A', bName: 'B' }) : '';
    copyUnifiedBtn.disabled = lastUnified === '';
    syncCopyButtons();
  }

  // Shared trailing-edge debounce (lib/util.js, inlined as a global).
  const debouncedRender = debounce(render, 150);
  const debouncedSave = debounce(saveState, 250);

  // syncCopyButtons() runs immediately (render is debounced ~150ms; the copy
  // icon should reveal/hide the instant the field goes non-empty/empty).
  inputAEl.addEventListener('input', () => { syncCopyButtons(); debouncedRender(); debouncedSave(); });
  inputBEl.addEventListener('input', () => { syncCopyButtons(); debouncedRender(); debouncedSave(); });

  // ---- in-field copy (A / B) ----
  copyABtn.addEventListener('click', async () => {
    if (inputAEl.value === '') return;
    if (await copy(inputAEl.value)) flash(copyABtn, { label: '✅', revertTo: '📋' });
  });
  copyBBtn.addEventListener('click', async () => {
    if (inputBEl.value === '') return;
    if (await copy(inputBEl.value)) flash(copyBBtn, { label: '✅', revertTo: '📋' });
  });

  // =====================================================================
  // 6. View toggle
  // =====================================================================
  function setView(view) {
    state.view = view === 'inline' ? 'inline' : 'split';
    const isSplit = state.view === 'split';
    splitEl.hidden = !isSplit;
    inlineEl.hidden = isSplit;
    render();
    saveState();
  }
  // Shared single-select segmented control (wireSegmented): click /
  // Arrow-key select + roving tabindex + aria-pressed bookkeeping.
  const viewSeg = wireSegmented(
    document.querySelector('[data-testid="view-toggle"]'), setView);

  // =====================================================================
  // 7. Options
  // =====================================================================
  function syncOptionDisabled() {
    // "ignore all whitespace" subsumes leading/trailing — disable the latter.
    const allWs = optAllWsEl.checked;
    optTrimEl.disabled = allWs;
    optTrimEl.closest('.opt').classList.toggle('disabled', allWs);
  }

  function readOptions() {
    state.opts.ignoreAllWhitespace = optAllWsEl.checked;
    state.opts.ignoreLeadingTrailingWhitespace = optTrimEl.checked && !optAllWsEl.checked;
    state.opts.ignoreCase = optCaseEl.checked;
  }

  function onOptionChange() {
    syncOptionDisabled();
    readOptions();
    render();
    saveState();
  }
  optTrimEl.addEventListener('change', onOptionChange);
  optAllWsEl.addEventListener('change', onOptionChange);
  optCaseEl.addEventListener('change', onOptionChange);

  // programmatic option setter for the test hook
  function setOption(name, value) {
    if (name === 'ignoreAllWhitespace') optAllWsEl.checked = !!value;
    else if (name === 'ignoreLeadingTrailingWhitespace') optTrimEl.checked = !!value;
    else if (name === 'ignoreCase') optCaseEl.checked = !!value;
    onOptionChange();
  }

  // =====================================================================
  // 8. Swap + Clear
  // =====================================================================
  swapBtn.addEventListener('click', () => {
    const tmp = inputAEl.value;
    inputAEl.value = inputBEl.value;
    inputBEl.value = tmp;
    render();
    saveState();
  });

  async function clearInput(el, label) {
    if (el.value.trim() !== '') {
      const ok = await confirmDialog(`Clear ${label}? This can't be undone.`);
      if (!ok) return;
    }
    el.value = '';
    render();
    saveState();
    el.focus();
  }
  clearABtn.addEventListener('click', () => clearInput(inputAEl, 'A'));
  clearBBtn.addEventListener('click', () => clearInput(inputBEl, 'B'));

  // ---- Load sample ----
  // Fills A/B with a representative before/after (SAMPLE_A/SAMPLE_B from the
  // pure engine). Guarded by confirmDialog when either input already holds content
  // (docs/conventions.md § "Destructive actions require confirmation").
  async function loadSample() {
    if (inputAEl.value.trim() !== '' || inputBEl.value.trim() !== '') {
      const ok = await confirmDialog('Replace the current A and B with the sample? This can\'t be undone.');
      if (!ok) return;
    }
    setInputs(SAMPLE_A, SAMPLE_B);
  }
  loadSampleBtn.addEventListener('click', loadSample);

  // =====================================================================
  // 9. Copy unified diff
  // =====================================================================
  copyUnifiedBtn.addEventListener('click', async () => {
    if (!lastUnified) return;
    const ok = await copy(lastUnified);
    if (!ok) return;
    flash(copyUnifiedBtn, { label: '✅ Copied!', revertTo: '📋 Copy unified diff' });
  });

  // =====================================================================
  // 10. Help modal — the shared jbcModal primitive (lib/components/CtModal.mjs), built
  // from the hidden #help-body template. Focus-trap / Esc + backdrop close /
  // focus-return / reduced-motion / scroll-top live in that primitive.
  // `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x hooks;
  // `titleId` pins aria-labelledby; `autoOpen` rides the shared onceFlag
  // so it auto-shows once on a fresh visit and never again.
  // =====================================================================
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How Visual Diff works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // =====================================================================
  // 11. Init
  // =====================================================================
  function setInputs(a, b) {
    inputAEl.value = a == null ? '' : String(a);
    inputBEl.value = b == null ? '' : String(b);
    render();
    saveState();
  }

  (function init() {
    const loaded = loadState();
    inputAEl.value = loaded.textA;
    inputBEl.value = loaded.textB;
    state.opts = loaded.opts;
    optTrimEl.checked = loaded.opts.ignoreLeadingTrailingWhitespace;
    optAllWsEl.checked = loaded.opts.ignoreAllWhitespace;
    optCaseEl.checked = loaded.opts.ignoreCase;
    syncOptionDisabled();
    readOptions(); // reconcile (all-ws subsumes trim)
    viewSeg.select(loaded.view === 'inline' ? 'inline' : 'split'); // sets aria, then setView (render)
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // =====================================================================
  // 12. Test hook — inert namespace for Playwright-driven tests
  // =====================================================================
  window.__diffViewer = {
    // pure functions
    diffLines,
    diffWords,
    toUnifiedDiff,
    splitLines,
    normalizeLine,
    myersDiff,
    tokenizeWords,
    // deterministic entry points
    setInputs,
    setView: (v) => viewSeg.select(v === 'inline' ? 'inline' : 'split'),
    setOption,
    render,
    loadSample,
    // sample data
    SAMPLE_A,
    SAMPLE_B,
    // live state
    state,
  };
