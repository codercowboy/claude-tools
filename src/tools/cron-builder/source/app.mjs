
  // =====================================================================
  // Cron Builder — app (DOM wiring, render, persistence).
  // The pure engine is inlined below; nothing here touches localStorage or
  // the DOM inside logic.mjs.
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 1. Constants & UI field specs
  // =====================================================================
  const STORAGE_KEY = 'cron-builder:v1';
  const HELP_SEEN_KEY = 'cron-builder:help-seen:v1';
  const DEFAULT_FLAVOR = 'standard';

  // Presets are standard 5-field expressions; picking one switches to the
  // Standard / Unix flavor (like the pre-flavor seconds toggle behavior).
  const PRESETS = [
    { label: 'Every minute',            expr: '* * * * *' },
    { label: 'Every 5 minutes',         expr: '*/5 * * * *' },
    { label: 'Every 15 minutes',        expr: '*/15 * * * *' },
    { label: 'Every hour (on the hour)',expr: '0 * * * *' },
    { label: 'Every day at midnight',   expr: '0 0 * * *' },
    { label: 'Weekdays at 9:00 AM',     expr: '0 9 * * 1-5' },
    { label: 'Every Sunday at midnight',expr: '0 0 * * 0' },
    { label: '1st of the month, midnight', expr: '0 0 1 * *' },
    { label: 'Every New Year (Jan 1)',  expr: '0 0 1 1 *' },
  ];

  // Per-field UI metadata for the CURRENT flavor. `kind:'enum'` fields (month,
  // dow) use named checkboxes/selects; `kind:'num'` fields use number/text
  // inputs. Rebuilt on every flavor change (dow numbering + labels differ).
  let UI_FIELDS = {};

  function buildUiFields(flavorId) {
    const specs = specsForFlavor(flavorId);
    const dow = specs.dow;
    const dowUnix = flavorId !== 'quartz' && flavorId !== 'aws';
    // dow option value = the flavor's LITERAL cron number (SUN=0 unix, SUN=1 quartz).
    const dowOptions = DOW_ABBR.map((abbr, jsDay) => ({
      value: jsDay + (dow.dowOffset || 0),
      label: abbr,
    }));
    return {
      second: { key: 'second', label: 'Seconds',      min: 0, max: 59, kind: 'num' },
      minute: { key: 'minute', label: 'Minutes',      min: 0, max: 59, kind: 'num' },
      hour:   { key: 'hour',   label: 'Hours',        min: 0, max: 23, kind: 'num' },
      dom:    { key: 'dom',    label: 'Day of month', min: 1, max: 31, kind: 'num' },
      month:  { key: 'month',  label: 'Month',        min: 1, max: 12, kind: 'enum',
                options: MONTH_ABBR.map((abbr, i) => ({ value: i, label: abbr })).filter((o) => o.value >= 1) },
      dow:    { key: 'dow',    label: 'Day of week',  min: dow.min, max: dow.validMax, kind: 'enum',
                dowWrap7: dowUnix, options: dowOptions },
      year:   { key: 'year',   label: 'Year',         min: 1970, max: 2199, kind: 'num' },
    };
  }

  const MODE_OPTIONS = [
    { value: 'every',    label: 'Every' },
    { value: 'step',     label: 'Every N (step)' },
    { value: 'range',    label: 'Range' },
    { value: 'specific', label: 'Specific' },
    { value: 'custom',   label: 'Custom' },
  ];

  // =====================================================================
  // 2. State & persistence
  // =====================================================================
  const state = { expr: DEFAULTS[DEFAULT_FLAVOR], flavor: DEFAULT_FLAVOR };

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
        expr: state.expr,
        flavor: state.flavor,
      }));
    } catch (err) { /* best-effort */ }
  }

  function loadState() {
    const fallback = { expr: DEFAULTS[DEFAULT_FLAVOR], flavor: DEFAULT_FLAVOR };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const p = JSON.parse(raw) || {};
      // Flavor, with back-compat for the pre-flavor `{ seconds:true }` shape.
      let flavor = (typeof p.flavor === 'string' && FLAVORS[p.flavor]) ? p.flavor
        : (p.seconds === true ? 'unixSeconds' : DEFAULT_FLAVOR);
      let expr = (typeof p.expr === 'string' && p.expr.trim()) ? p.expr.trim() : '';
      if (!expr) expr = DEFAULTS[flavor];
      return { expr, flavor };
    } catch (err) {
      return fallback;
    }
  }

  // =====================================================================
  // 3. DOM references
  // =====================================================================
  const helpButtonEl = document.getElementById('help-button');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtn = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  const flavorSelect = document.getElementById('flavor-select');
  const presetSelect = document.getElementById('preset-select');
  const cronInput = document.getElementById('cron-input');
  const fieldLegendEl = document.querySelector('[data-testid="field-legend"]');
  const errorEl = document.querySelector('[data-testid="cron-error"]');
  const fieldGridEl = document.querySelector('[data-testid="field-grid"]');
  const descriptionEl = document.querySelector('[data-testid="cron-description"]');
  const domDowNoteEl = document.querySelector('[data-testid="dom-dow-note"]');
  const runsListEl = document.querySelector('[data-testid="next-runs"]');
  const runsEmptyEl = document.querySelector('[data-testid="runs-empty"]');
  const tzNoteEl = document.querySelector('[data-testid="tz-note"]');
  const runsCopyAllBtn = document.getElementById('runs-copy-all');

  // fieldReaders[key]() -> current field text from that editor card.
  const fieldReaders = {};
  let lastModel = null;

  // =====================================================================
  // 4. Error display
  // =====================================================================
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function hideError() { errorEl.hidden = true; errorEl.textContent = ''; }

  // =====================================================================
  // 5. Render pipeline
  //    Source of truth = the raw expression string. Everything else is
  //    derived: parse -> model -> editors / explainer / next-runs.
  // =====================================================================
  // The field order for the current view: the last successfully-parsed model's
  // order when available (Quartz may be 6 or 7 fields), else the flavor default.
  function currentOrder() {
    if (lastModel && lastModel.flavor === state.flavor && Array.isArray(lastModel.order)) {
      return lastModel.order;
    }
    return orderForFlavor(state.flavor);
  }

  function updateLegend() {
    // A monospace legend that lines up field names under the expression.
    fieldLegendEl.textContent = currentOrder().join('  ');
  }

  function renderFromRaw({ rerenderEditors = true } = {}) {
    let model;
    try {
      model = parseCron(cronInput.value.trim(), { flavor: state.flavor });
    } catch (err) {
      showError(err.message);
      return;
    }
    hideError();
    lastModel = model;
    updateLegend();
    if (rerenderEditors) renderEditors(model);
    renderExplainer(model);
    renderNextRuns(model);
  }

  // Set a new canonical expression (from preset / seconds toggle / editors).
  function applyExpr(expr, { rerenderEditors = true } = {}) {
    cronInput.value = expr;
    state.expr = expr;
    renderFromRaw({ rerenderEditors });
    saveState();
  }

  // =====================================================================
  // 6. Field editors
  // =====================================================================
  function makeSelect(options, value, testid) {
    const sel = document.createElement('select');
    if (testid) sel.setAttribute('data-testid', testid);
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    if (value != null) sel.value = String(value);
    return sel;
  }

  function renderEditors(model) {
    UI_FIELDS = buildUiFields(state.flavor);
    fieldGridEl.innerHTML = '';
    for (const key in fieldReaders) delete fieldReaders[key];
    for (const key of (model.order || currentOrder())) {
      const card = createFieldEditor(UI_FIELDS[key], model[key]);
      fieldGridEl.appendChild(card);
    }
  }

  function createFieldEditor(ui, field) {
    const card = document.createElement('div');
    card.className = 'field-card';
    card.setAttribute('data-testid', `fieldcard-${ui.key}`);

    const head = document.createElement('div');
    head.className = 'field-card-head';
    const title = document.createElement('span');
    title.className = 'field-card-title';
    title.textContent = ui.label;
    const range = document.createElement('span');
    range.className = 'field-card-range';
    range.textContent = `${ui.min}–${ui.max}`;
    head.append(title, range);

    const modeSel = makeSelect(MODE_OPTIONS, null, `mode-${ui.key}`);
    modeSel.setAttribute('aria-label', `${ui.label} mode`);

    const body = document.createElement('div');
    body.className = 'field-body';

    let em = fieldEditorMode(field);
    // The enum range picker can only offer values that exist as options — and
    // day-of-week's options are SUN–SAT (0–6), with no entry for 7 (the Sunday
    // alias). A range endpoint outside the option set (e.g. dow `5-7` or `7-7`,
    // both valid per the spec) therefore can't be shown as a range without
    // silently blanking the <select> and corrupting the assembled expression.
    // Fall such a field back to the Custom editor, which round-trips the raw
    // field text verbatim.
    if (em.mode === 'range' && ui.kind === 'enum') {
      const optVals = new Set(ui.options.map((o) => o.value));
      if (!optVals.has(em.from) || !optVals.has(em.to)) {
        em = { mode: 'custom', text: buildField(field) };
      }
    }
    modeSel.value = em.mode;

    // buildBody renders inputs for the current mode and wires their change ->
    // onEditorChange. It also (re)registers fieldReaders[ui.key].
    function buildBody(mode, params) {
      body.innerHTML = '';
      body.classList.remove('row');
      if (mode === 'every') {
        const p = document.createElement('span');
        p.className = 'field-hint';
        p.textContent = `Every value (${ui.key === 'dom' || ui.key === 'dow' ? '* — no restriction' : '*'})`;
        body.appendChild(p);
        fieldReaders[ui.key] = () => '*';
      } else if (mode === 'step') {
        body.classList.add('row');
        const lbl = document.createElement('span');
        lbl.className = 'inline-label';
        lbl.textContent = 'Every';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '1';
        inp.max = String(ui.max);
        inp.value = String(params && params.step != null ? params.step : 1);
        inp.setAttribute('data-testid', `step-${ui.key}`);
        inp.setAttribute('aria-label', `${ui.label} step`);
        inp.addEventListener('input', onEditorChange);
        const suffix = document.createElement('span');
        suffix.className = 'inline-label';
        suffix.textContent = unitPlural(ui.key);
        body.append(lbl, inp, suffix);
        fieldReaders[ui.key] = () => {
          const n = parseInt(inp.value, 10);
          return `*/${Number.isFinite(n) && n >= 1 ? n : 1}`;
        };
      } else if (mode === 'range') {
        body.classList.add('row');
        const fromSel = makeRangeControl(ui, (params && params.from != null) ? params.from : ui.min, `range-from-${ui.key}`, `${ui.label} range from`);
        const dash = document.createElement('span');
        dash.className = 'inline-label';
        dash.textContent = 'to';
        const toSel = makeRangeControl(ui, (params && params.to != null) ? params.to : ui.max, `range-to-${ui.key}`, `${ui.label} range to`);
        body.append(fromSel.el, dash, toSel.el);
        fieldReaders[ui.key] = () => `${fromSel.read()}-${toSel.read()}`;
      } else if (mode === 'specific') {
        if (ui.kind === 'enum') {
          const grid = buildCheckboxGrid(ui, (params && params.values) || []);
          body.appendChild(grid.el);
          fieldReaders[ui.key] = () => {
            const vals = grid.read();
            return vals.length ? vals.join(',') : '*';
          };
        } else {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.autocomplete = 'off';
          inp.spellcheck = false;
          inp.placeholder = 'e.g. 0,15,30';
          inp.value = (params && params.values) ? params.values.join(',') : '';
          inp.setAttribute('data-testid', `specific-${ui.key}`);
          inp.setAttribute('aria-label', `${ui.label} specific values`);
          inp.addEventListener('input', onEditorChange);
          body.appendChild(inp);
          const hint = document.createElement('span');
          hint.className = 'field-hint';
          hint.textContent = 'Comma-separated values.';
          body.appendChild(hint);
          fieldReaders[ui.key] = () => {
            const v = inp.value.trim();
            return v === '' ? '*' : v.replace(/\s+/g, '');
          };
        }
      } else { // custom
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.placeholder = 'raw field, e.g. 1-5/2';
        inp.value = params && params.text != null ? params.text : '*';
        inp.setAttribute('data-testid', `custom-${ui.key}`);
        inp.setAttribute('aria-label', `${ui.label} custom expression`);
        inp.addEventListener('input', onEditorChange);
        body.appendChild(inp);
        fieldReaders[ui.key] = () => {
          const v = inp.value.trim();
          return v === '' ? '*' : v.replace(/\s+/g, '');
        };
      }
    }

    modeSel.addEventListener('change', () => {
      buildBody(modeSel.value, null);
      onEditorChange();
    });

    buildBody(em.mode, em);

    card.append(head, modeSel, body);
    return card;
  }

  function unitPlural(key) {
    return ({ second: 'seconds', minute: 'minutes', hour: 'hours', dom: 'days', month: 'months', dow: 'days', year: 'years' })[key] || 'values';
  }

  // A range endpoint control: enum fields use a named <select>, numeric fields
  // a number input.
  function makeRangeControl(ui, value, testid, ariaLabel) {
    if (ui.kind === 'enum') {
      const sel = makeSelect(ui.options, value, testid);
      sel.setAttribute('aria-label', ariaLabel);
      sel.addEventListener('change', onEditorChange);
      return { el: sel, read: () => sel.value };
    }
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = String(ui.min);
    inp.max = String(ui.max);
    inp.className = 'num-narrow';
    inp.value = String(value);
    inp.setAttribute('data-testid', testid);
    inp.setAttribute('aria-label', ariaLabel);
    inp.addEventListener('input', onEditorChange);
    return { el: inp, read: () => inp.value.trim() };
  }

  function buildCheckboxGrid(ui, selected) {
    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';
    grid.setAttribute('data-testid', `specific-grid-${ui.key}`);
    const selSet = new Set(selected.map((v) => (ui.dowWrap7 && v === 7 ? 0 : v)));
    const boxes = [];
    for (const o of ui.options) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(o.value);
      cb.checked = selSet.has(o.value);
      cb.setAttribute('data-testid', `spec-${ui.key}-${o.value}`);
      cb.addEventListener('change', onEditorChange);
      const span = document.createElement('span');
      span.textContent = o.label;
      label.append(cb, span);
      grid.appendChild(label);
      boxes.push(cb);
    }
    return {
      el: grid,
      read: () => boxes.filter((b) => b.checked).map((b) => parseInt(b.value, 10)),
    };
  }

  function assembleExprFromEditors() {
    return currentOrder().map((key) => fieldReaders[key] ? fieldReaders[key]() : '*').join(' ');
  }

  // Editor input -> new expression. Don't rebuild the editors (keep focus),
  // just re-derive the raw box + explainer + next-runs.
  function onEditorChange() {
    const expr = assembleExprFromEditors();
    cronInput.value = expr;
    state.expr = expr;
    renderFromRaw({ rerenderEditors: false });
    saveState();
  }

  // =====================================================================
  // 7. Explainer
  // =====================================================================
  function renderExplainer(model) {
    descriptionEl.textContent = describeCron(model);
    const both = isRestricted(model.dom) && isRestricted(model.dow);
    domDowNoteEl.hidden = !both;
  }

  // =====================================================================
  // 8. Next runs
  // =====================================================================
  function relativeText(date, now) {
    const diff = date.getTime() - now.getTime();
    const sec = Math.round(Math.abs(diff) / 1000);
    if (sec < 45) return 'in under a minute';
    const units = [
      ['year', 31536000], ['month', 2592000], ['day', 86400],
      ['hour', 3600], ['minute', 60],
    ];
    for (const [name, s] of units) {
      if (sec >= s) {
        const v = Math.floor(sec / s);
        return `in ${v} ${name}${v === 1 ? '' : 's'}`;
      }
    }
    return 'soon';
  }

  function renderNextRuns(model) {
    const now = new Date();
    const runs = nextRuns(model, now, 5);
    runsListEl.innerHTML = '';
    if (runs.length === 0) {
      runsEmptyEl.hidden = false;
    } else {
      runsEmptyEl.hidden = true;
      runs.forEach((r, i) => {
        const li = document.createElement('li');
        li.setAttribute('data-testid', `next-run-${i}`);
        const t = document.createElement('span');
        t.className = 'run-time';
        t.textContent = formatRunTime(r, model.seconds);
        const rel = document.createElement('span');
        rel.className = 'run-rel';
        rel.textContent = relativeText(r, now);
        li.append(t, rel);
        runsListEl.appendChild(li);
      });
    }
    let tz = 'local time';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* ignore */ }
    tzNoteEl.textContent = `Times shown in your local time zone (${tz}).`;
  }

  function formatRunTime(date, withSeconds) {
    const opts = {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    };
    if (withSeconds) opts.second = '2-digit';
    try { return date.toLocaleString(undefined, opts); }
    catch (e) { return date.toString(); }
  }

  // =====================================================================
  // 9. Controls: seconds toggle, presets, raw input
  // =====================================================================
  flavorSelect.addEventListener('change', () => {
    const from = state.flavor;
    const to = FLAVORS[flavorSelect.value] ? flavorSelect.value : DEFAULT_FLAVOR;
    if (to === from) return;
    // Convert the current expression to the new flavor (field count, dow
    // numbering, `?`-rule) — pure + tested. Reset lastModel so currentOrder()
    // uses the new flavor's default order until the reparse sets a real one.
    const converted = convertExpr(cronInput.value.trim(), from, to);
    state.flavor = to;
    lastModel = null;
    updateLegend();
    applyExpr(converted, { rerenderEditors: true });
  });

  presetSelect.addEventListener('change', () => {
    const val = presetSelect.value;
    if (!val) return;
    // Presets are standard 5-field; switch to the Standard / Unix flavor to
    // apply them cleanly.
    if (state.flavor !== 'standard') {
      state.flavor = 'standard';
      flavorSelect.value = 'standard';
      lastModel = null;
      updateLegend();
    }
    applyExpr(val, { rerenderEditors: true });
    presetSelect.value = '';
  });

  cronInput.addEventListener('input', () => {
    state.expr = cronInput.value;
    renderFromRaw({ rerenderEditors: true });
    saveState();
  });

  runsCopyAllBtn.addEventListener('click', async () => {
    const lines = [];
    for (const li of runsListEl.querySelectorAll('li')) {
      const t = li.querySelector('.run-time')?.textContent.trim();
      if (t) lines.push(t);
    }
    if (lines.length === 0) return;
    const ok = await copy(lines.join('\n'));
    if (!ok) return;
    flash(runsCopyAllBtn, { label: 'Copied!', revertTo: 'Copy all' });
  });

  // Delegated copy for the expression copy button (and any future ones).
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-target');
    const el = document.querySelector(`[data-testid="${targetId}"]`);
    if (!el) return;
    const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') ? el.value : el.textContent;
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    flash(btn, { label: '✅', revertTo: '📋' });
  });

  // =====================================================================
  // 10. Presets menu population
  // =====================================================================
  function populatePresets() {
    for (const p of PRESETS) {
      const opt = document.createElement('option');
      opt.value = p.expr;
      opt.textContent = `${p.label}  (${p.expr})`;
      presetSelect.appendChild(opt);
    }
  }

  // Flavor <select> options (Standard / Unix is the default first entry).
  const FLAVOR_LABELS = {
    standard:    'Standard / Unix (5-field)',
    unixSeconds: 'Unix with seconds (6-field)',
    quartz:      'Quartz / Java (6–7-field)',
    spring:      'Spring @Scheduled (6-field)',
    aws:         'AWS EventBridge (6-field, year)',
  };

  function populateFlavors() {
    flavorSelect.innerHTML = '';
    for (const id of FLAVOR_IDS) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = FLAVOR_LABELS[id] || id;
      flavorSelect.appendChild(opt);
    }
  }

  // =====================================================================
  // 11. Help modal (mirrors dev-converter pattern)
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

  // =====================================================================
  // 12. Init
  // =====================================================================
  (function init() {
    populateFlavors();
    populatePresets();
    const loaded = loadState();
    state.flavor = loaded.flavor;
    state.expr = loaded.expr;
    flavorSelect.value = state.flavor;
    updateLegend();

    cronInput.value = state.expr;
    // If stored state won't parse (shouldn't normally happen), fall back.
    try {
      parseCron(state.expr, { flavor: state.flavor });
    } catch (err) {
      state.expr = DEFAULTS[state.flavor] || DEFAULTS[DEFAULT_FLAVOR];
      cronInput.value = state.expr;
    }
    renderFromRaw({ rerenderEditors: true });
    saveState();

    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  })();

  // =====================================================================
  // 13. Test hook — inert namespace for tests
  // =====================================================================
  window.__cronBuilder = {
    // pure
    parseCron, buildCron, describeCron, nextRuns, convertExpr,
    parseField, buildField, fieldEditorMode, isRestricted, dayMatches,
    FIELD_SPECS, MONTH_NAMES, DOW_NAMES, fieldOrder, orderForFlavor,
    specsForFlavor, FLAVORS, FLAVOR_IDS, DEFAULTS,
    // entry points
    applyExpr, renderFromRaw, assembleExprFromEditors, openHelp, closeHelp,
    // live state
    state,
  };
