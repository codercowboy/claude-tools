import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { wireTabs, wireSegmented, wireCopyButtons, announce } from '../../../lib/components/CtComponents.mjs';
import { el, debounce, persistState, downloadBlob, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // http-headers — app (DOM wiring only). The parser, knowledge base,
  // checklist, builder, and redaction live in logic.mjs (inlined below);
  // nothing there touches the DOM or localStorage.
  // =====================================================================
<<ct:inline logic.mjs>>

  const byId = (id) => document.querySelector(`[data-testid="${id}"]`);
  const STORAGE_KEY = 'http-headers:v1';
  const HELP_SEEN_KEY = 'http-headers:help-seen:v1';

  // ---- state & persistence --------------------------------------------
  const store = persistState(STORAGE_KEY, { input: '', tab: 'input', kind: 'auto', filter: 'all', fmt: 'raw', build: '' });
  const saved = store.load();
  const TABS = ['input', 'explain', 'checklist', 'build'];

  const state = {
    input: saved.input,
    tab: TABS.includes(saved.tab) ? saved.tab : 'input',
    kind: ['auto', 'request', 'response'].includes(saved.kind) ? saved.kind : 'auto',
    filter: saved.filter === 'issues' ? 'issues' : 'all',
    fmt: SNIPPET_FORMATS.includes(saved.fmt) ? saved.fmt : 'raw',
    block: -1,           // -1 = last message (not persisted)
    build: loadBuild(saved.build),
  };

  function loadBuild(json) {
    try {
      const o = JSON.parse(json || '{}');
      return o && typeof o === 'object' ? { customHeaders: [], ...o } : { customHeaders: [] };
    } catch { return { customHeaders: [] }; }
  }

  function save() {
    const build = { ...state.build, customHeaders: (state.build.customHeaders || []).filter((r) => !isSensitiveHeader(r.name)) };
    store.save({
      input: redactForStorage(state.input), // never persist secret header values
      tab: state.tab, kind: state.kind, filter: state.filter, fmt: state.fmt,
      build: JSON.stringify(build),
    });
  }

  // ---- elements --------------------------------------------------------
  const rawInput = byId('raw-input');
  const parseSummary = byId('parse-summary');
  const parseBanner = byId('parse-banner');
  const parseIssues = byId('parse-issues');
  const blockWrap = byId('block-wrap');
  const blockSelect = byId('block-select');
  const cardsEl = byId('cards');
  const explainEmpty = byId('explain-empty');
  const checklistSummary = byId('checklist-summary');
  const checklistEmpty = byId('checklist-empty');
  const checklistList = byId('checklist-list');
  const lintList = byId('lint-list');
  const buildForm = byId('build-form');
  const customList = byId('custom-list');
  const buildOut = byId('build-out');

  let analysis = null;
  let uid = 0;

  // ---- render: input tab ----------------------------------------------
  function levelItems(list, issues) {
    list.replaceChildren(...issues.map((i) => el('li', { 'data-level': i.level, text: i.msg })));
  }

  function renderAll() {
    const parsed = parseHeaderBlock(state.input, { block: state.block < 0 ? undefined : state.block });
    analysis = analyze(parsed, { kind: state.kind });

    // Message selector (only when the paste holds several messages)
    blockWrap.hidden = parsed.blocks.length < 2;
    if (parsed.blocks.length >= 2) {
      blockSelect.replaceChildren(...parsed.blocks.map((b) => el('option', {
        value: String(b.index),
        text: `#${b.index + 1}: ${b.startLine || b.kind} (${b.headerCount} headers)`,
      })));
      blockSelect.value = String(parsed.blockIndex);
    }

    const n = parsed.headers.length;
    if (!state.input.trim()) parseSummary.textContent = 'Paste a header block above, or load a sample.';
    else {
      const what = analysis.kind === 'unknown' ? 'headers' : analysis.kind;
      const start = parsed.startLine ? ` (${parsed.startLine})` : '';
      parseSummary.textContent = `Parsed ${n} header${n === 1 ? '' : 's'} as ${what}${start}.`;
    }
    const errs = parsed.issues.filter((i) => i.level === 'error').length;
    if (errs) { parseBanner.textContent = `${errs} header line${errs === 1 ? '' : 's'} would be rejected by a strict server.`; parseBanner.hidden = false; }
    else parseBanner.hidden = true;
    levelItems(parseIssues, parsed.issues);

    renderCards();
    renderChecklist();
    renderBuild();
  }

  // ---- render: explain tab --------------------------------------------
  function renderCards() {
    const cards = analysis.cards.filter((c) => state.filter === 'all' || c.issues.length);
    explainEmpty.hidden = analysis.cards.length > 0;
    cardsEl.replaceChildren(...cards.map((c) => {
      const rawId = `card-raw-${++uid}`;
      const rawLine = c.value.split('\n').map((v) => `${c.name}: ${v}`).join('\n');
      const rows = [
        el('div', { class: 'card-head' }, [
          el('h3', { text: c.name }),
          el('span', { class: 'badge', text: c.cat }),
          el('span', { class: 'badge', text: c.dir === 'both' ? 'request + response' : c.dir === 'req' ? 'request' : 'response' }),
          c.deprecated ? el('span', { class: 'badge dep', text: 'deprecated' }) : null,
          c.count > 1 ? el('span', { class: 'badge', text: `x${c.count}` }) : null,
        ]),
        el('div', { class: 'ct-field ct-field--multiline' }, [
          el('pre', { class: 'code-out', id: rawId, 'data-testid': rawId, text: rawLine }),
          el('button', { type: 'button', class: 'ct-copy-btn', 'data-copy-target': rawId, 'data-testid': 'copy-card', title: `Copy ${c.name}`, 'aria-label': `Copy ${c.name} header`, text: '\u{1F4CB}' }),
        ]),
        el('p', {}, [el('span', { class: 'lbl', text: 'What it does ' }), c.purpose]),
        c.example ? el('p', {}, [el('span', { class: 'lbl', text: 'Example ' }), el('code', { text: c.example })]) : null,
        c.pitfalls ? el('p', {}, [el('span', { class: 'lbl', text: 'Pitfalls ' }), c.pitfalls]) : null,
        c.ref ? el('p', { class: 'ref', text: `Ref: ${c.ref}` }) : null,
      ];
      if (c.issues.length) {
        rows.push(el('ul', { class: 'notes' }, c.issues.map((i) => el('li', { 'data-level': i.level, text: i.msg }))));
      }
      return el('article', { class: 'card', 'data-testid': 'card', 'data-header': c.lower, 'data-known': String(c.known), 'data-has-issues': String(c.issues.length > 0) }, rows);
    }));
  }

  // ---- render: checklist tab ------------------------------------------
  function renderChecklist() {
    const items = analysis.checklist;
    const s = analysis.summary;
    checklistList.replaceChildren(...items.map((it) => {
      const children = [
        el('div', { class: 'check-head' }, [
          el('span', { class: 'status', 'data-status': it.status, 'data-testid': 'check-status', text: it.status }),
          el('strong', { text: it.header }),
        ]),
        el('p', { text: it.msg }),
      ];
      if (it.fix) {
        const fixId = `fix-${++uid}`;
        children.push(el('div', { class: 'ct-field ct-field--multiline' }, [
          el('pre', { class: 'code-out', id: fixId, 'data-testid': fixId, text: it.fix }),
          el('button', { type: 'button', class: 'ct-copy-btn', 'data-copy-target': fixId, 'data-testid': 'copy-fix', title: 'Copy suggested fix', 'aria-label': `Copy suggested fix for ${it.header}`, text: '\u{1F4CB}' }),
        ]));
      }
      return el('li', { class: 'check-item', 'data-testid': 'check-item', 'data-check': it.id, 'data-status': it.status }, children);
    }));
    if (analysis.kind === 'request') {
      checklistEmpty.textContent = 'The security checklist applies to responses. This paste looks like a request; use the "Treat as" control on the Input tab to override.';
      checklistEmpty.hidden = false;
      checklistSummary.textContent = '';
    } else if (!state.input.trim()) {
      checklistEmpty.textContent = 'Nothing to check yet - paste response headers on the Input tab.';
      checklistEmpty.hidden = false;
      checklistSummary.textContent = '';
    } else {
      checklistEmpty.hidden = true;
      checklistSummary.textContent = `${s.pass} pass · ${s.warn} warn · ${s.fail} fail · ${s.info} info`;
    }
    if (!state.input.trim() || analysis.kind === 'request') checklistList.replaceChildren();
    levelItems(lintList, analysis.lint);
  }

  // ---- render: build tab ----------------------------------------------
  function buildBlock() { return buildHeaderBlock(state.build); }

  function renderBuildOutput() {
    const block = buildBlock();
    buildOut.textContent = block ? formatSnippet(block, state.fmt) : '';
  }

  function syncBuildControls() {
    for (const opt of BUILD_OPTIONS) {
      const ctl = byId(`opt-${opt.id}`);
      if (!ctl) continue;
      const v = state.build[opt.id];
      if (opt.type === 'bool') ctl.checked = v === true;
      else ctl.value = v == null ? '' : String(v);
    }
  }

  function renderCustom() {
    const rows = state.build.customHeaders || [];
    customList.replaceChildren(...rows.map((r, i) => el('div', { class: 'kv-row' }, [
      Object.assign(el('input', { type: 'text', placeholder: 'Header-Name', 'aria-label': 'Custom header name', 'data-testid': 'custom-name', autocomplete: 'off' }), { value: r.name || '' }),
      Object.assign(el('input', { type: 'text', placeholder: 'value', 'aria-label': 'Custom header value', 'data-testid': 'custom-value', autocomplete: 'off' }), { value: r.value || '' }),
      el('button', { type: 'button', class: 'row-remove', 'data-testid': 'custom-remove', 'aria-label': 'Remove header', title: 'Remove', text: '×' }),
    ])));
    [...customList.children].forEach((row, i) => {
      const [n, v, rm] = row.children;
      n.addEventListener('input', () => { state.build.customHeaders[i].name = n.value; onBuildChange(); });
      v.addEventListener('input', () => { state.build.customHeaders[i].value = v.value; onBuildChange(); });
      rm.addEventListener('click', () => { state.build.customHeaders.splice(i, 1); renderCustom(); onBuildChange(); });
    });
  }

  function renderBuild() { syncBuildControls(); renderBuildOutput(); }

  function buildFormOnce() {
    buildForm.replaceChildren(...BUILD_OPTIONS.map((opt) => {
      const id = `opt-${opt.id}`;
      if (opt.type === 'bool') {
        const cb = el('input', { type: 'checkbox', 'data-testid': id, id });
        cb.addEventListener('change', () => { state.build[opt.id] = cb.checked; onBuildChange(); });
        return el('div', { class: 'field' }, [el('label', { class: 'checkbox', for: id }, [cb, opt.label])]);
      }
      const ctl = opt.type === 'select'
        ? el('select', { id, 'data-testid': id }, opt.options.map((o) => el('option', { value: o, text: o === '' ? '(omit)' : o })))
        : el('input', { type: 'text', id, 'data-testid': id, autocomplete: 'off' });
      ctl.addEventListener(opt.type === 'select' ? 'change' : 'input', () => { state.build[opt.id] = ctl.value; onBuildChange(); });
      return el('div', { class: 'field' }, [el('label', { for: id, text: opt.label }), ctl]);
    }));
  }

  function onBuildChange() { renderBuildOutput(); save(); }

  function applyPreset(name) {
    const custom = state.build.customHeaders || [];
    state.build = { ...(name ? JSON.parse(JSON.stringify(PRESETS[name].selection)) : {}), customHeaders: custom };
    syncBuildControls();
    renderBuildOutput();
    save();
    announce(name ? `${PRESETS[name].label} preset applied` : 'Builder cleared');
  }

  // ---- wiring ----------------------------------------------------------
  const onInput = debounce(() => { state.input = rawInput.value; state.block = -1; renderAll(); save(); }, 120);
  rawInput.addEventListener('input', onInput);

  function setInput(text) {
    rawInput.value = text;
    state.input = text;
    state.block = -1;
    renderAll();
    save();
  }
  byId('load-sample-response').addEventListener('click', () => { setInput(SAMPLES.response); announce('Sample response loaded'); });
  byId('load-sample-request').addEventListener('click', () => { setInput(SAMPLES.request); announce('Sample request loaded'); });
  byId('clear-input').addEventListener('click', () => { setInput(''); announce('Input cleared'); rawInput.focus(); });
  blockSelect.addEventListener('change', () => { state.block = Number(blockSelect.value); renderAll(); });

  const kindSeg = wireSegmented(byId('kind-group'), (v) => { state.kind = v; renderAll(); save(); });
  const filterSeg = wireSegmented(byId('filter-group'), (v) => { state.filter = v; renderCards(); save(); });
  const fmtSeg = wireSegmented(byId('fmt-group'), (v) => { state.fmt = v; renderBuildOutput(); save(); });
  const tabs = wireTabs(byId('tabs'), (v) => { state.tab = v; save(); });

  for (const name of Object.keys(PRESETS)) byId(`preset-${name}`).addEventListener('click', () => applyPreset(name));
  byId('preset-clear').addEventListener('click', () => applyPreset(null));
  byId('add-custom').addEventListener('click', () => { (state.build.customHeaders ||= []).push({ name: '', value: '' }); renderCustom(); });
  byId('build-download').addEventListener('click', () => {
    const out = buildOut.textContent;
    if (out) downloadBlob(out + '\n', state.fmt === 'raw' ? 'headers.txt' : `headers-${state.fmt}.txt`, 'text/plain');
  });
  byId('build-analyze').addEventListener('click', () => {
    const block = buildBlock();
    if (!block) { announce('Nothing to analyze: the builder is empty'); return; }
    setInput(block);
    tabs.select('checklist');
  });

  wireCopyButtons(document, { copy, flash });

  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'HTTP Header Explainer',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  byId('help-button').addEventListener('click', () => help.open());

  // ---- init --------------------------------------------------------------
  buildFormOnce();
  renderCustom();
  rawInput.value = state.input;
  kindSeg.select(state.kind, false);
  filterSeg.select(state.filter, false);
  fmtSeg.select(state.fmt, false);
  renderAll();
  tabs.select(state.tab);

  // Test hook (read-only view of state; the e2e suite drives the real UI).
  window.__httpHeaders = {
    getState: () => ({ input: state.input, tab: state.tab, kind: state.kind, summary: analysis.summary, headers: analysis.cards.map((c) => c.lower) }),
  };
