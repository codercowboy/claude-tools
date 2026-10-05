import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireSegmented, wireCopyButtons, showWarning, hideWarning, announce } from '../../../lib/components/CtComponents.mjs';
import { onceFlag, persistState, debounce, el } from '../../../lib/utils/CtUtil.mjs';

<<ct:inline logic.mjs>>

  // =====================================================================
  // Invisible Chars \u2014 app (DOM wiring only). All detection/cleaning lives in
  // logic.mjs. The input is untrusted: everything is rendered with el() /
  // textContent, never innerHTML. The input text is NEVER persisted; only the
  // option toggles are.
  // =====================================================================
  const STORAGE_KEY = 'invisible-chars:v1';
  const HELP_SEEN_KEY = 'invisible-chars:help-seen:v1';
  const REVEAL_CHIP_CAP = 5000;
  const TABLE_CAP = 500;

  const STRIP_KEYS = ['zerowidth', 'bidi', 'format', 'variation', 'tag', 'filler', 'control', 'vs1to16'];
  const defaults = defaultCleanOptions();
  const store = persistState(STORAGE_KEY, {
    normalize: defaults.normalize,
    spaces: defaults.spaces,
    separators: defaults.separators,
    replaceConfusables: defaults.replaceConfusables,
    preserveEmoji: defaults.preserveEmoji,
    collapse: defaults.collapse,
    trim: defaults.trim,
    showConfusables: true,
    ...Object.fromEntries(STRIP_KEYS.map((k) => ['strip_' + k, defaults.strip[k]])),
  });

  const state = {
    input: '',
    opts: defaults,
    showConfusables: true,
    scan: scan(''),
    selected: -1, // index into the *visible* item list
    visible: [],
  };

  const $ = (id) => document.querySelector('[data-testid="' + id + '"]');
  const els = {
    input: document.getElementById('input'),
    summary: $('summary'),
    statsGrid: $('stats-grid'),
    mixedBanner: $('mixed-banner'),
    hiddenBanner: $('hidden-banner'),
    reveal: $('reveal'),
    revealNote: $('reveal-note'),
    inspEmpty: $('inspector-empty'),
    inspGrid: $('inspector-grid'),
    flagBody: $('flag-body'),
    normalizeBanner: $('normalize-banner'),
    confusableWarning: $('confusable-warning'),
    output: $('clean-output'),
    cleanStats: $('clean-stats'),
    showConfusables: document.getElementById('show-confusables'),
    spaces: document.getElementById('opt-spaces'),
    separators: document.getElementById('opt-separators'),
    replaceConfusables: document.getElementById('opt-confusables'),
    preserveEmoji: document.getElementById('opt-preserve-emoji'),
    collapse: document.getElementById('opt-collapse'),
    trim: document.getElementById('opt-trim'),
    stripBoxes: Array.from(document.querySelectorAll('[data-strip]')),
  };
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function saveOptions() {
    store.save({
      normalize: state.opts.normalize,
      spaces: state.opts.spaces,
      separators: state.opts.separators,
      replaceConfusables: state.opts.replaceConfusables,
      preserveEmoji: state.opts.preserveEmoji,
      collapse: state.opts.collapse,
      trim: state.opts.trim,
      showConfusables: state.showConfusables,
      ...Object.fromEntries(STRIP_KEYS.map((k) => ['strip_' + k, state.opts.strip[k]])),
    });
  }

  function readOptions() {
    const o = state.opts;
    o.spaces = els.spaces.checked;
    o.separators = els.separators.checked;
    o.replaceConfusables = els.replaceConfusables.checked;
    o.preserveEmoji = els.preserveEmoji.checked;
    o.collapse = els.collapse.checked;
    o.trim = els.trim.checked;
    for (const box of els.stripBoxes) o.strip[box.dataset.strip] = box.checked;
    state.showConfusables = els.showConfusables.checked;
  }

  // ---- summary / stats --------------------------------------------------
  function renderStats() {
    const { counts, mixedScript } = state.scan;
    const sus = counts.flagged;
    els.summary.textContent = '';
    if (state.input === '') {
      els.summary.append('Paste some text to inspect it.');
    } else if (sus === 0 && mixedScript.length === 0) {
      els.summary.append(el('span', { class: 'badge clean', 'data-testid': 'badge', text: 'Clean' }),
        ' No invisible or suspicious characters found in ' + plural(counts.total, 'character') + '.');
    } else {
      els.summary.append(el('span', { class: 'badge', 'data-testid': 'badge', text: sus + ' suspicious' }),
        ' ' + plural(counts.flagged, 'flagged character') + ' in ' + plural(counts.total, 'character') +
        (mixedScript.length ? ' · ' + plural(mixedScript.length, 'mixed-script word') : ''));
    }
    els.statsGrid.textContent = '';
    const tile = (label, value, cls, testid) => el('div', { class: 'stat-tile' + (cls ? ' ' + cls : '') }, [
      el('span', { class: 'stat-value', 'data-testid': testid, text: String(value) }),
      el('span', { class: 'stat-label', text: label }),
    ]);
    els.statsGrid.append(tile('Characters (code points)', counts.total, '', 'stat-total'), tile('Flagged', counts.flagged, '', 'stat-flagged'));
    for (const c of CATEGORIES) {
      const n = counts.byCategory[c.id];
      if (n > 0) els.statsGrid.append(tile(c.label, n, 'cat-' + c.id, 'stat-' + c.id));
    }

    if (mixedScript.length) {
      showWarning(els.mixedBanner, 'Mixed-script ' + (mixedScript.length === 1 ? 'word' : 'words') + ' (Latin with Cyrillic or Greek, a common homograph trick): ' +
        mixedScript.slice(0, 5).map((m) => m.word).join(', ') + (mixedScript.length > 5 ? ', ...' : ''));
    } else hideWarning(els.mixedBanner);

    if (state.scan.hiddenAscii) {
      showWarning(els.hiddenBanner, 'Hidden ASCII in tag characters decodes to: "' + state.scan.hiddenAscii + '"');
    } else hideWarning(els.hiddenBanner);
  }

  // ---- reveal -------------------------------------------------------------
  function chipLabel(it) {
    return it.category === 'confusable' ? it.ch + ' ' + it.hex + ' ~ ' + it.confusable.latin : it.tag + ' ' + it.hex;
  }

  function renderReveal() {
    const text = state.input;
    const items = state.visible;
    const root = els.reveal;
    root.textContent = '';
    let p = 0; // next un-rendered UTF-16 offset
    let k = 0; // next chip
    const shown = Math.min(items.length, REVEAL_CHIP_CAP);

    function renderRange(parent, to) {
      while (k < shown && items[k].index < to) {
        const it = items[k];
        if (it.index > p) parent.append(text.slice(p, it.index));
        const idx = k;
        const titleParts = [it.name, it.hex];
        if (it.decoded) titleParts.push('hidden ASCII "' + it.decoded + '"');
        if (it.inEmoji) titleParts.push('part of an emoji sequence');
        parent.append(el('button', {
          type: 'button',
          class: 'chip cat-' + it.category + (it.inEmoji ? ' legit' : ''),
          'data-testid': 'chip',
          'data-index': String(idx),
          'data-category': it.category,
          title: titleParts.join(' - '),
          'aria-label': it.name + ', ' + it.hex,
          'aria-pressed': idx === state.selected ? 'true' : 'false',
          text: chipLabel(it),
        }));
        p = it.index + it.ch.length;
        k++;
      }
      if (to > p) { parent.append(text.slice(p, to)); p = to; }
    }

    for (const m of state.scan.mixedScript) {
      renderRange(root, m.start);
      const span = el('span', { class: 'mixed', 'data-testid': 'mixed-word', title: 'Mixed-script word' });
      root.append(span);
      renderRange(span, m.end);
    }
    renderRange(root, text.length);

    if (items.length > REVEAL_CHIP_CAP) {
      els.revealNote.textContent = 'Showing the first ' + REVEAL_CHIP_CAP + ' of ' + items.length + ' chips; the rest of the text is shown plain. Cleaning still covers everything.';
      els.revealNote.hidden = false;
    } else {
      els.revealNote.hidden = true;
    }
  }

  // ---- all-flagged table ------------------------------------------------
  function renderTable() {
    els.flagBody.textContent = '';
    state.visible.slice(0, TABLE_CAP).forEach((it, i) => {
      const tr = el('tr', { tabIndex: 0, 'data-testid': 'flag-row', 'data-index': String(i) }, [
        el('td', { text: it.line + ':' + it.column }),
        el('td', { text: it.hex }),
        el('td', { text: it.tag }),
        el('td', { text: it.name }),
        el('td', { text: catById[it.category].label }),
      ]);
      els.flagBody.append(tr);
    });
  }

  // ---- inspector ---------------------------------------------------------
  function renderInspector() {
    const it = state.visible[state.selected];
    els.inspGrid.textContent = '';
    if (!it) {
      els.inspEmpty.hidden = false;
      els.inspGrid.hidden = true;
      return;
    }
    els.inspEmpty.hidden = true;
    els.inspGrid.hidden = false;
    const row = (label, value, testid) => els.inspGrid.append(
      el('dt', { text: label }), el('dd', { 'data-testid': testid, text: value }));
    row('Character', it.category === 'confusable' ? it.ch : '[' + it.tag + ']', 'insp-char');
    row('Name', it.name, 'insp-name');
    row('Code point', it.hex, 'insp-hex');
    row('UTF-8 bytes', it.utf8 === null ? '(invalid: unpaired surrogate)' : it.utf8, 'insp-utf8');
    row('UTF-16 units', it.utf16.join(' '), 'insp-utf16');
    row('General category', it.gc, 'insp-gc');
    row('Tool category', catById[it.category].label + (it.strip ? ' (removed by default)' : ''), 'insp-category');
    row('Position', 'index ' + it.index + ' (UTF-16), line ' + it.line + ', column ' + it.column, 'insp-pos');
    if (it.confusable) row('Looks like', '"' + it.confusable.latin + '" (' + it.confusable.script + ')', 'insp-confusable');
    if (it.decoded !== null) row('Hidden ASCII', it.decoded, 'insp-decoded');
    if (it.inEmoji) row('Note', 'Part of an emoji sequence (kept by default)', 'insp-note');
  }

  function select(i) {
    state.selected = state.visible[i] ? i : -1;
    for (const chip of els.reveal.querySelectorAll('.chip')) {
      chip.setAttribute('aria-pressed', Number(chip.dataset.index) === state.selected ? 'true' : 'false');
    }
    renderInspector();
  }

  els.reveal.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) select(Number(chip.dataset.index));
  });
  els.flagBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) select(Number(tr.dataset.index));
  });
  els.flagBody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    e.preventDefault();
    select(Number(tr.dataset.index));
  });

  // ---- clean --------------------------------------------------------------
  function renderClean() {
    const o = state.opts;
    const counts = state.scan.counts.byCategory;
    // Live per-option counts.
    const setCount = (testid, n) => { const e = $(testid); if (e) e.textContent = n > 0 ? '(' + n + ')' : ''; };
    setCount('count-space', counts.space);
    setCount('count-separator', counts.separator);
    setCount('count-confusable', counts.confusable);
    for (const k of STRIP_KEYS) {
      let n;
      if (k === 'variation') n = state.scan.items.filter((it) => it.category === 'variation' && it.cp > 0xFE0F).length;
      else if (k === 'vs1to16') n = state.scan.items.filter((it) => it.category === 'variation' && it.cp <= 0xFE0F).length;
      else n = counts[k];
      setCount('strip-count-' + k, n);
    }

    const result = clean(state.input, o);
    els.output.value = result.text;
    state.lastResult = result;
    els.cleanStats.textContent = state.input === '' ? '' :
      'Removed ' + result.removed + ' · converted ' + result.converted + ' · replaced ' + result.replaced +
      ' · ' + plural([...result.text].length, 'character') + ' in the output';

    if (o.normalize !== 'none' && result.normalizedChanged > 0) {
      showWarning(els.normalizeBanner, o.normalize + ' normalization changed ' + plural(result.normalizedChanged, 'code point') + '.');
    } else hideWarning(els.normalizeBanner);

    if (o.replaceConfusables && hasLegitNonLatin(state.input)) {
      showWarning(els.confusableWarning, 'This text contains whole words in Cyrillic or Greek. Replacing confusables will turn those letters into Latin look-alikes and damage them.');
    } else hideWarning(els.confusableWarning);
  }

  function render() {
    state.scan = scan(state.input);
    state.visible = state.showConfusables ? state.scan.items : state.scan.items.filter((it) => it.category !== 'confusable');
    state.selected = -1;
    renderStats();
    renderReveal();
    renderTable();
    renderInspector();
    renderClean();
  }
  const renderSoon = debounce(render, 60);

  // ---- wiring ---------------------------------------------------------------
  els.input.addEventListener('input', () => { state.input = els.input.value; renderSoon(); });

  document.getElementById('load-sample').addEventListener('click', () => setInput(SAMPLE_TEXT));
  document.getElementById('input-clear').addEventListener('click', () => { setInput(''); els.input.focus(); });

  function setInput(text) {
    state.input = String(text == null ? '' : text);
    els.input.value = state.input;
    render();
  }

  function onOptionChange() {
    readOptions();
    saveOptions();
    // Showing/hiding confusable chips changes the reveal; everything else only the clean panel.
    state.visible = state.showConfusables ? state.scan.items : state.scan.items.filter((it) => it.category !== 'confusable');
    state.selected = -1;
    renderReveal();
    renderTable();
    renderInspector();
    renderClean();
  }
  for (const e of [els.spaces, els.separators, els.replaceConfusables, els.preserveEmoji, els.collapse, els.trim, els.showConfusables, ...els.stripBoxes]) {
    e.addEventListener('change', onOptionChange);
  }

  const seg = wireSegmented($('normalize-seg'), (value) => {
    state.opts.normalize = value;
    saveOptions();
    renderClean();
  });

  document.getElementById('clean-and-copy').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    renderClean();
    const r = state.lastResult;
    const ok = await copy(r.text);
    announce('Cleaned: removed ' + r.removed + ', converted ' + r.converted + ', replaced ' + r.replaced + (ok ? '. Copied to clipboard.' : '.'));
    if (ok) flash(btn, { label: 'Copied!', revertTo: 'Clean & copy' });
  });

  wireCopyButtons(document, { copy, flash, selector: '.ct-copy-btn', revertTo: '📋' });

  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How Invisible Chars works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  document.getElementById('help-button').addEventListener('click', () => help.open());

  // ---- init: restore OPTIONS only (never the text) -------------------------
  (function init() {
    const s = store.load();
    const o = state.opts;
    o.normalize = ['none', 'NFC', 'NFKC'].includes(s.normalize) ? s.normalize : 'none';
    o.spaces = s.spaces; o.separators = s.separators; o.replaceConfusables = s.replaceConfusables;
    o.preserveEmoji = s.preserveEmoji; o.collapse = s.collapse; o.trim = s.trim;
    for (const k of STRIP_KEYS) o.strip[k] = s['strip_' + k];
    state.showConfusables = s.showConfusables;
    els.spaces.checked = o.spaces; els.separators.checked = o.separators;
    els.replaceConfusables.checked = o.replaceConfusables; els.preserveEmoji.checked = o.preserveEmoji;
    els.collapse.checked = o.collapse; els.trim.checked = o.trim;
    els.showConfusables.checked = state.showConfusables;
    for (const box of els.stripBoxes) box.checked = !!o.strip[box.dataset.strip];
    // select() fires onChange once, which just re-saves the same value.
    seg.select(o.normalize);
    render();
  })();

  // ---- test hook (inert) -----------------------------------------------------
  window.__invisibleChars = {
    scan, clean, normalizeText, cpLabel, decodeTag, findMixedScript, SAMPLE_TEXT,
    setInput,
    render,
    state,
  };
