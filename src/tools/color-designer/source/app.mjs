
  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const harmonySelectEl = document.getElementById('harmonySelect');
  const moodSelectEl = document.getElementById('moodSelect');
  const countSelectEl = document.getElementById('countSelect');
  const rollBtn = document.getElementById('rollBtn');
  const rollBackBtn = document.getElementById('rollBackBtn');
  const rollForwardBtn = document.getElementById('rollForwardBtn');
  const algorithmUsedLabelEl = document.getElementById('algorithmUsedLabel');
  const rollAnnounceEl = document.getElementById('rollAnnounce');

  const rollSeedInputEl = document.getElementById('rollSeedInput');
  const cvdSelectEl = document.getElementById('cvdSelect');
  const demoSpeedSelectEl = document.getElementById('demoSpeedSelect');
  const shareLinkBtn = document.getElementById('shareLinkBtn');
  const savePaletteBtn = document.getElementById('savePaletteBtn');
  const toolAnnounceEl = document.getElementById('toolAnnounce');
  const savedSectionEl = document.querySelector('[data-testid="saved-section"]');
  const savedShelfEl = document.getElementById('savedShelf');

  const seedInputEl = document.getElementById('seedInput');
  const seedAddBtn = document.getElementById('seedAddBtn');
  const seedErrorEl = document.getElementById('seedError');
  const seedListEl = document.getElementById('seedList');

  const seedPickerTriggerEl = document.getElementById('seedPickerTrigger');
  const seedPickerTriggerSwatchEl = document.querySelector('[data-testid="seed-picker-trigger-swatch"]');
  const seedPickerEl = document.getElementById('seedPicker');
  const svSquareEl = document.getElementById('svSquare');
  const svThumbEl = document.getElementById('svThumb');
  const hueSliderEl = document.getElementById('hueSlider');
  const hueThumbEl = document.getElementById('hueThumb');
  const alphaSliderEl = document.getElementById('alphaSlider');
  const alphaThumbEl = document.getElementById('alphaThumb');

  const schemesListEl = document.getElementById('schemesList');

  const helpButtonEl = document.getElementById('helpButton');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtnEl = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  // =====================================================================
  // 2. State
  // =====================================================================
  const STORAGE_KEY = 'color-designer:v1';
  const HELP_SEEN_KEY = 'color-designer:help-seen:v1';
  const state = {
    algorithmSelect: 'random',   // current harmony <select> value
    moodSelect: 'surprise',      // current mood <select> value ('surprise' = no persuasion, or a mood key)
    count: 6,                    // current colors-per-scheme (N), 2-10, default 6
    seeds: [],                   // [{ id, raw, color: {r,g,b,a} }]
    rollResult: null,            // { algorithm, mood, schemes: Color[5][N] } — 5 schemes per roll, N colors each
    expandedIndex: 0,            // index (0-4) of the open scheme, or null
    isInitialLoad: true,         // true only for the render produced by the very first roll (auto-roll on load)
    demo: { schemeIndex: null, intervalId: null, pairingIndex: 0, isPlaying: false },
    seedPicker: { open: false, h: 180, s: 1, v: 1, a: 1 }, // visual HSV seed-color picker — live H/S/V/A + open state
    locked: {},                  // { "schemeIndex:colorIndex": {r,g,b,a} } — pinned swatches kept across re-rolls
    rollSeed: '',                // optional "roll seed" string; '' => cryptoRng (non-deterministic)
    cvd: 'none',                 // color-blindness preview mode ('none' | protanopia | deuteranopia | tritanopia)
    demoSpeed: 'normal',         // live-demo cycle speed ('slow' | 'normal' | 'fast')
    history: [],                 // bounded stack of past { rollResult, ...settings } for back/forward
    historyIndex: -1,            // pointer into history; -1 = none yet
  };
  let nextSeedId = 1;
  let hasRolledOnce = false;

<<ct:inline logic.mjs>>
  // =====================================================================
  // 8. Seed actions + seed list UI
  // =====================================================================
  function addSeed(str) {
    const color = parseColor(str);
    if (!color) return null; // caller shows the inline error; input left untouched
    const seed = { id: nextSeedId++, raw: String(str).trim(), color };
    state.seeds.push(seed);
    renderSeeds();
    saveState();
    triggerRollWiggle(); // attention nudge: a new seed was added, roll again to see it mixed in
    return seed;
  }

  // Add a seed straight from a generated swatch's "+" button. Same effect as
  // typing/​picking a seed (chip appears up top, roll-button wiggles) but with
  // a color object already in hand. Deduped by canonical rgba() so clicking the
  // same swatch twice doesn't stack identical seeds — but it still wiggles, so
  // the nudge to roll fires either way. Never rerolls on its own.
  // Returns 'added' | 'duplicate'.
  function addSeedFromColor(color) {
    const c = { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
    const raw = rgbaString(c);
    const dup = state.seeds.some((s) => rgbaString(s.color) === raw);
    if (!dup) {
      state.seeds.push({ id: nextSeedId++, raw: hexString(c), color: c });
      renderSeeds();
      saveState();
    }
    triggerRollWiggle();
    rollAnnounceEl.textContent = dup
      ? `${hexString(c)} is already a seed color`
      : `Added ${hexString(c)} as a seed color`;
    return dup ? 'duplicate' : 'added';
  }

  // Wiggle nudge on the Roll-again button — plays once per added seed.
  // Honors prefers-reduced-motion via the CSS media query on .roll-btn.wiggle
  // (the class itself is still applied so it's assertable in tests).
  let wiggleTimeoutId = null;
  function triggerRollWiggle() {
    rollBtn.classList.remove('wiggle');
    void rollBtn.offsetWidth; // force reflow so the animation restarts if it's already mid-wiggle
    rollBtn.classList.add('wiggle');
    clearTimeout(wiggleTimeoutId);
    wiggleTimeoutId = setTimeout(() => rollBtn.classList.remove('wiggle'), 500);
  }

  function removeSeed(id) {
    state.seeds = state.seeds.filter((s) => s.id !== id);
    renderSeeds();
    saveState();
  }

  function clearSeedsDirect() {
    state.seeds = [];
    renderSeeds();
    saveState();
  }

  function buildSeedChip(seed) {
    const li = document.createElement('li');
    li.className = 'seed-chip';
    li.dataset.testid = 'seed-chip';
    li.dataset.id = String(seed.id);

    const swatch = document.createElement('span');
    swatch.className = 'chip-swatch';
    swatch.dataset.testid = 'seed-chip-swatch';
    swatch.style.setProperty('--swatch-color', rgbaString(seed.color));
    li.appendChild(swatch);

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.dataset.testid = 'seed-chip-label';
    label.textContent = hexString(seed.color);
    li.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.dataset.testid = 'seed-chip-remove';
    removeBtn.setAttribute('aria-label', `Remove seed ${hexString(seed.color)}`);
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    // Per-chip remove is low-stakes single-item removal — direct, no modal.
    removeBtn.addEventListener('click', () => removeSeed(seed.id));
    li.appendChild(removeBtn);

    return li;
  }

  function renderSeeds() {
    seedListEl.innerHTML = '';
    state.seeds.forEach((seed) => seedListEl.appendChild(buildSeedChip(seed)));
  }

  function handleAddSeed() {
    const seed = addSeed(seedInputEl.value);
    if (seed) {
      seedInputEl.value = '';
      seedErrorEl.textContent = '';
      // Successful commit: dismiss the mobile keyboard (docs/conventions.md
      // § Responsive & mobile — blur follows focus, there's no dedicated API).
      seedInputEl.blur();
      updateTriggerSwatch(); // input just cleared -> trigger goes back to its neutral/checkerboard state
    } else {
      seedErrorEl.textContent = 'Not a valid color — use hex (#3366ff) or rgba(51,102,255,1).';
      // Rejected commit: keep focus in the input so the user can fix the value.
      seedInputEl.focus();
    }
  }

  seedAddBtn.addEventListener('click', handleAddSeed);
  seedInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddSeed(); }
  });

  // (Bulk seed clearing now lives as "Restore defaults" in the Settings panel;
  // per-chip × still removes one seed directly. clearSeedsDirect is kept for the
  // test API and any programmatic callers.)

  // =====================================================================
  // 8b. Seed color picker (visual HSV) — trigger swatch + popup with a
  // saturation/value square, a hue slider, and an alpha slider. Two-way
  // synced with seedInputEl via parseColor/rgbaString/hexString (the
  // canonical formatters from section 3) — never a separate source of
  // truth for the color itself.
  // =====================================================================
  const DEFAULT_PICKER_HSVA = { h: 180, s: 1, v: 1, a: 1 }; // mid hue, full sat/val, opaque — used when the text input is empty/invalid on open

  function snapAlpha(a) {
    let v = clamp01(a);
    v = Math.round(v * 100) / 100; // 2-decimal precision keeps rgba() output tidy
    if (v > 0.995) v = 1;   // snap-to-opaque near the top of the slider
    if (v < 0.005) v = 0;   // snap-to-fully-transparent near the bottom
    return v;
  }

  // Reflects seedInputEl's current (live-parsed) value — called on every
  // keystroke and after any programmatic write to the input. Empty/invalid
  // -> --trigger-color falls back to transparent -> the checkerboard shows.
  function updateTriggerSwatch() {
    const color = parseColor(seedInputEl.value);
    seedPickerTriggerSwatchEl.style.setProperty('--trigger-color', color ? rgbaString(color) : 'transparent');
  }

  function currentPickerRgb() {
    const { h, s, v } = state.seedPicker;
    return hsvToRgb({ h, s, v });
  }

  function renderSeedPicker() {
    const { h, s, v, a } = state.seedPicker;
    const rgb = currentPickerRgb();

    svSquareEl.style.setProperty('--picker-hue-color', `hsl(${h}, 100%, 50%)`);
    svThumbEl.style.left = `${s * 100}%`;
    svThumbEl.style.top = `${(1 - v) * 100}%`;
    svSquareEl.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    svSquareEl.setAttribute('aria-valuetext', `saturation ${Math.round(s * 100)}%, value ${Math.round(v * 100)}%`);

    hueThumbEl.style.left = `${(h / 360) * 100}%`;
    hueSliderEl.setAttribute('aria-valuenow', String(Math.round(h)));

    alphaSliderEl.style.setProperty('--picker-alpha-from', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
    alphaSliderEl.style.setProperty('--picker-alpha-to', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    alphaThumbEl.style.left = `${a * 100}%`;
    alphaSliderEl.setAttribute('aria-valuenow', String(a));
  }

  // The one place the picker writes back to the canonical text input — hex
  // when opaque, rgba() when alpha < 1, using the same rgbaString/hexString
  // every other part of the tool uses (single source of truth for format).
  function writeSeedPickerToInput() {
    const rgb = currentPickerRgb();
    const color = { r: rgb.r, g: rgb.g, b: rgb.b, a: state.seedPicker.a };
    seedInputEl.value = state.seedPicker.a >= 1 ? hexString(color) : rgbaString(color);
    seedErrorEl.textContent = '';
    updateTriggerSwatch();
  }

  // Central write path for every interaction (drag, keyboard nudge, and the
  // window.__colorDesigner test hook) — one function, one place that updates
  // state + re-renders + syncs the text input.
  function setSeedPickerHSVA(partial) {
    const p = state.seedPicker;
    if (partial.h !== undefined) p.h = norm360(Math.round(partial.h * 1000) / 1000);
    if (partial.s !== undefined) p.s = clamp01(Math.round(partial.s * 1000) / 1000);
    if (partial.v !== undefined) p.v = clamp01(Math.round(partial.v * 1000) / 1000);
    if (partial.a !== undefined) p.a = snapAlpha(partial.a);
    renderSeedPicker();
    writeSeedPickerToInput();
    return { h: p.h, s: p.s, v: p.v, a: p.a };
  }

  // Re-parses the text input (per DESIGN.md: "opening starts on whatever
  // valid color the text box currently holds") every time the picker opens.
  function initSeedPickerFromInput() {
    const color = parseColor(seedInputEl.value);
    const hsva = color ? { ...rgbToHsv(color), a: color.a } : DEFAULT_PICKER_HSVA;
    state.seedPicker.h = hsva.h;
    state.seedPicker.s = hsva.s;
    state.seedPicker.v = hsva.v;
    state.seedPicker.a = hsva.a;
  }

  function clampPopupPosition(rect, popupW, popupH) {
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
    if (left < 8) left = 8;
    if (top + popupH > window.innerHeight - 8) {
      const above = rect.top - popupH - 6;
      top = above < 8 ? 8 : above; // flip above the trigger when there's no room below; clamp to the top edge
    }
    return { left, top };
  }

  function positionSeedPicker() {
    const rect = seedPickerTriggerEl.getBoundingClientRect();
    const popupW = seedPickerEl.offsetWidth || 260;
    const popupH = seedPickerEl.offsetHeight || 300;
    const { left, top } = clampPopupPosition(rect, popupW, popupH);
    seedPickerEl.style.left = `${left}px`;
    seedPickerEl.style.top = `${top}px`;
  }

  function onSeedPickerDocPointerDown(e) {
    if (seedPickerEl.contains(e.target) || seedPickerTriggerEl.contains(e.target)) return;
    closeSeedPicker();
  }

  function onSeedPickerKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSeedPicker();
    }
  }

  function closeSeedPickerOnScroll() { closeSeedPicker(); }

  function openSeedPicker() {
    if (state.seedPicker.open) return;
    initSeedPickerFromInput();
    renderSeedPicker();
    seedPickerEl.hidden = false;
    seedPickerTriggerEl.setAttribute('aria-expanded', 'true');
    state.seedPicker.open = true;
    positionSeedPicker();
    svSquareEl.focus();
    document.addEventListener('pointerdown', onSeedPickerDocPointerDown, true);
    document.addEventListener('keydown', onSeedPickerKeydown, true);
    window.addEventListener('scroll', closeSeedPickerOnScroll, true);
    window.addEventListener('resize', closeSeedPicker);
  }

  function closeSeedPicker() {
    if (!state.seedPicker.open) return;
    seedPickerEl.hidden = true;
    seedPickerTriggerEl.setAttribute('aria-expanded', 'false');
    state.seedPicker.open = false;
    document.removeEventListener('pointerdown', onSeedPickerDocPointerDown, true);
    document.removeEventListener('keydown', onSeedPickerKeydown, true);
    window.removeEventListener('scroll', closeSeedPickerOnScroll, true);
    window.removeEventListener('resize', closeSeedPicker);
    seedPickerTriggerEl.focus(); // focus returns to the trigger on close
  }

  seedPickerTriggerEl.addEventListener('click', () => {
    if (state.seedPicker.open) closeSeedPicker();
    else openSeedPicker();
  });

  // Shared Pointer Events drag wiring (mouse + touch) for the three
  // draggable controls — each supplies a fraction-of-box -> HSVA mapping.
  function attachPickerDrag(el, onFraction) {
    let pointerId = null;
    function fractionFromEvent(e) {
      const rect = el.getBoundingClientRect();
      const x = rect.width ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0;
      const y = rect.height ? Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) : 0;
      return { x, y };
    }
    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      onFraction(fractionFromEvent(e));
    }
    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      try { el.releasePointerCapture(pointerId); } catch { /* already released */ }
      pointerId = null;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    }
    el.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      try { el.setPointerCapture(pointerId); } catch { /* unsupported in this environment */ }
      el.focus();
      onFraction(fractionFromEvent(e));
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      e.preventDefault();
    });
  }

  attachPickerDrag(svSquareEl, ({ x, y }) => setSeedPickerHSVA({ s: x, v: 1 - y }));
  attachPickerDrag(hueSliderEl, ({ x }) => setSeedPickerHSVA({ h: x * 360 }));
  attachPickerDrag(alphaSliderEl, ({ x }) => setSeedPickerHSVA({ a: x }));

  // Arrow-key nudging when a control is focused; Shift = a bigger step.
  svSquareEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSeedPickerHSVA({ s: state.seedPicker.s - step }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSeedPickerHSVA({ s: state.seedPicker.s + step }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSeedPickerHSVA({ v: state.seedPicker.v + step }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSeedPickerHSVA({ v: state.seedPicker.v - step }); }
  });
  hueSliderEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSeedPickerHSVA({ h: state.seedPicker.h - step }); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSeedPickerHSVA({ h: state.seedPicker.h + step }); }
  });
  alphaSliderEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSeedPickerHSVA({ a: state.seedPicker.a - step }); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSeedPickerHSVA({ a: state.seedPicker.a + step }); }
  });

  seedInputEl.addEventListener('input', updateTriggerSwatch);
  updateTriggerSwatch(); // initial paint — empty input -> neutral/checkerboard state

  // =====================================================================
  // 8c. Persistence (localStorage) — docs/conventions.md § "Persist UI
  // state". Persists the harmony select, colors-per-scheme (N), the seed
  // colors, and the last-generated roll (its schemes + which algorithm was
  // used + which scheme was expanded). A roll is random and can't be
  // deterministically recomputed, so "restore where the user left off"
  // means persisting the actual rolled colors, not just the inputs that
  // produced them. Best-effort: every read/write is try/catch-wrapped and
  // failures degrade silently — restoreState() returning false just makes
  // init() fall back to the normal fresh auto-roll, so the tool works fully
  // with no stored state (or unreadable/corrupt state).
  // =====================================================================
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        algorithmSelect: state.algorithmSelect,
        moodSelect: state.moodSelect,
        count: state.count,
        seeds: state.seeds.map((s) => ({ raw: s.raw, color: s.color })),
        rollResult: state.rollResult,
        expandedIndex: state.expandedIndex,
        locked: state.locked,
        rollSeed: state.rollSeed,
        cvd: state.cvd,
        demoSpeed: state.demoSpeed,
        history: state.history,
        historyIndex: state.historyIndex,
      }));
    } catch { /* localStorage unavailable/throwing (file://, private mode, quota, policy) — in-memory only */ }
  }

  function isStoredColor(c) {
    return !!c && typeof c === 'object'
      && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b) && Number.isFinite(c.a);
  }

  // A stored/shared rollResult is only "usable" if fully well-formed: 5 schemes
  // of exactly `count` valid colors each. Used by restore + share-link decode.
  function isValidStoredRoll(rr, count) {
    return rr && typeof rr.algorithm === 'string' && Array.isArray(rr.schemes)
      && rr.schemes.length === 5
      && rr.schemes.every((s) => Array.isArray(s) && s.length === count && s.every(isStoredColor));
  }

  // Keep only well-formed { "s:c": color } lock entries within the given count.
  function sanitizeLocked(raw, count) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(raw)) {
      const m = /^([0-4]):(\d+)$/.exec(key);
      if (m && Number(m[2]) < count && isStoredColor(raw[key])) {
        const c = raw[key];
        out[key] = { r: c.r, g: c.g, b: c.b, a: c.a };
      }
    }
    return out;
  }

  const VALID_ALGORITHM_KEYS = new Set(['random', ...ALGORITHMS.map((a) => a.key)]);
  const VALID_MOOD_KEYS = new Set(['surprise', ...MOODS.map((m) => m.key)]);
  const VALID_CVD_KEYS = new Set(CVD_TYPES.map((t) => t.key));
  const VALID_DEMO_SPEEDS = new Set(['slow', 'normal', 'fast']);

  // Reads + validates the stored blob and, where valid, writes it into the
  // live `state`/`nextSeedId`/`hasRolledOnce`. Returns true only when a
  // usable rolled palette was restored (so init() can render it instead of
  // auto-rolling); false for missing/unreadable/malformed storage.
  function restoreState() {
    let parsed;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      parsed = JSON.parse(raw);
    } catch {
      return false; // localStorage unavailable/throwing, or corrupt JSON
    }
    if (!parsed || typeof parsed !== 'object') return false;

    if (typeof parsed.algorithmSelect === 'string' && VALID_ALGORITHM_KEYS.has(parsed.algorithmSelect)) {
      state.algorithmSelect = parsed.algorithmSelect;
    }
    if (typeof parsed.moodSelect === 'string' && VALID_MOOD_KEYS.has(parsed.moodSelect)) {
      // 'any' was retired from the dropdown; it now lives on as 'surprise' (both
      // mean "no mood persuasion"). Map old stored 'any' forward.
      state.moodSelect = parsed.moodSelect === 'any' ? 'surprise' : parsed.moodSelect;
    }
    if (Number.isFinite(parsed.count)) {
      state.count = clampCount(parsed.count);
    }
    if (Array.isArray(parsed.seeds)) {
      parsed.seeds.forEach((s) => {
        if (s && typeof s.raw === 'string' && isStoredColor(s.color)) {
          state.seeds.push({ id: nextSeedId++, raw: s.raw, color: s.color });
        }
      });
    }
    if (typeof parsed.rollSeed === 'string') state.rollSeed = parsed.rollSeed;
    if (typeof parsed.cvd === 'string' && VALID_CVD_KEYS.has(parsed.cvd)) state.cvd = parsed.cvd;
    if (typeof parsed.demoSpeed === 'string' && VALID_DEMO_SPEEDS.has(parsed.demoSpeed)) state.demoSpeed = parsed.demoSpeed;
    state.locked = sanitizeLocked(parsed.locked, state.count);

    // Roll history: keep only well-formed entries (each with a usable roll).
    if (Array.isArray(parsed.history)) {
      state.history = parsed.history
        .filter((e) => e && isValidStoredRoll(e.rollResult, clampCount(e.count)))
        .map((e) => ({
          rollResult: e.rollResult,
          algorithmSelect: VALID_ALGORITHM_KEYS.has(e.algorithmSelect) ? e.algorithmSelect : 'random',
          moodSelect: (VALID_MOOD_KEYS.has(e.moodSelect) && e.moodSelect !== 'any') ? e.moodSelect : 'surprise',
          count: clampCount(e.count),
          locked: sanitizeLocked(e.locked, clampCount(e.count)),
          rollSeed: typeof e.rollSeed === 'string' ? e.rollSeed : '',
        }))
        .slice(-HISTORY_CAP);
      const hi = parsed.historyIndex;
      state.historyIndex = (Number.isInteger(hi) && hi >= 0 && hi < state.history.length)
        ? hi : state.history.length - 1;
    }

    // A roll is random, so only a *complete, well-formed* stored roll counts
    // as "usable" — anything else falls back to a fresh auto-roll rather
    // than rendering a partial/corrupt palette.
    const rr = parsed.rollResult;
    if (!isValidStoredRoll(rr, state.count)) return false;

    state.rollResult = rr;
    hasRolledOnce = true;
    const ei = parsed.expandedIndex;
    state.expandedIndex = (Number.isInteger(ei) && ei >= 0 && ei < rr.schemes.length) ? ei : null;
    return true;
  }

  // Whether the visitor has already dismissed the Help modal at least once.
  // If localStorage throws/is unavailable, treat it as already-seen so we
  // don't nag on every load — the least-annoying safe fallback (the ?
  // button is always there if they want the modal later).
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
  // 8d. Help modal -- purely informational (what the tool does + how to use
  // it), so it's its own small dedicated dialog rather than confirmDialog
  // (which is a yes/no destructive-action confirm). Markup is static in the
  // document (shown/hidden via [hidden]) rather than built/torn down per
  // open/close. Structure/focus-handling mirrors tools/hat-picker's Help
  // modal, the reference pattern for this convention (see
  // docs/conventions.md "First-load help popup (all tools)").
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
    helpCloseXBtnEl.focus({ preventScroll: true });
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    document.removeEventListener('keydown', onHelpKeydown, true);
    if (helpPreviouslyFocused && typeof helpPreviouslyFocused.focus === 'function') {
      try { helpPreviouslyFocused.focus(); } catch { /* ignore */ }
    }
    helpPreviouslyFocused = null;
  }

  helpButtonEl.addEventListener('click', () => openHelp());
  helpCloseXBtnEl.addEventListener('click', () => closeHelp());
  helpOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === helpOverlayEl) closeHelp();
  });

  // =====================================================================
  // 8b. Settings modal (harmony, colors-per-scheme, vision, demo speed,
  //     roll seed + the copy-link / save-palette actions). The controls
  //     inside apply LIVE (their existing change handlers still run), so the
  //     schemes update behind the open panel; "Save" simply keeps them and
  //     "Cancel" (also ✕ / Esc / backdrop) reverts to the snapshot taken on
  //     open. Mirrors the Help modal's focus/keyboard handling.
  // =====================================================================
  const settingsBtnEl = document.getElementById('settingsBtn');
  const settingsOverlayEl = document.querySelector('[data-testid="settings-overlay"]');
  const settingsDialogEl = document.querySelector('[data-testid="settings-modal"]');
  const settingsCloseXEl = settingsDialogEl.querySelector('[data-testid="settings-close-x"]');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  let settingsPreviouslyFocused = null;
  let settingsSnapshot = null;

  function getSettingsFocusable() {
    return Array.from(
      settingsDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }
  function onSettingsKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSettings(true); return; }
    if (e.key !== 'Tab') return;
    const focusable = getSettingsFocusable();
    if (focusable.length === 0) return;
    e.preventDefault();
    const idx = focusable.indexOf(document.activeElement);
    let next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0) next = focusable.length - 1;
    if (next >= focusable.length) next = 0;
    focusable[next].focus();
  }
  function openSettings() {
    settingsPreviouslyFocused = document.activeElement;
    settingsSnapshot = { // what to restore if the user Cancels
      algorithmSelect: state.algorithmSelect, count: state.count,
      cvd: state.cvd, demoSpeed: state.demoSpeed, rollSeed: state.rollSeed,
    };
    settingsBtnEl.setAttribute('aria-expanded', 'true');
    settingsOverlayEl.hidden = false;
    document.addEventListener('keydown', onSettingsKeydown, true);
    settingsDialogEl.scrollTop = 0;
    settingsCloseXEl.focus({ preventScroll: true });
  }
  function closeSettings(revert) {
    if (settingsOverlayEl.hidden) return;
    if (revert && settingsSnapshot) {
      // Restore each control to its snapshot value and re-fire its handler so
      // state, side effects (repaint / demo restart / lock prune) and the
      // persisted copy all roll back together.
      const s = settingsSnapshot;
      const fire = (el, val, type) => { if (el.value !== String(val)) { el.value = String(val); el.dispatchEvent(new Event(type)); } };
      fire(harmonySelectEl, s.algorithmSelect, 'change');
      fire(countSelectEl, s.count, 'change');
      fire(cvdSelectEl, s.cvd, 'change');
      fire(demoSpeedSelectEl, s.demoSpeed, 'change');
      fire(rollSeedInputEl, s.rollSeed, 'input');
    }
    settingsSnapshot = null;
    settingsBtnEl.setAttribute('aria-expanded', 'false');
    settingsOverlayEl.hidden = true;
    document.removeEventListener('keydown', onSettingsKeydown, true);
    if (settingsPreviouslyFocused && typeof settingsPreviouslyFocused.focus === 'function') {
      try { settingsPreviouslyFocused.focus(); } catch { /* ignore */ }
    }
    settingsPreviouslyFocused = null;
  }
  settingsBtnEl.addEventListener('click', () => openSettings());
  settingsCloseXEl.addEventListener('click', () => closeSettings(true));
  settingsCancelBtn.addEventListener('click', () => closeSettings(true));
  settingsSaveBtn.addEventListener('click', () => closeSettings(false));
  settingsOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === settingsOverlayEl) closeSettings(true);
  });

  // Restore defaults: confirm, wipe this device's stored state (settings, seeds,
  // pins, roll history, saved palettes) and reload into a clean default colony —
  // reload is the simplest way to guarantee every default (mood 'surprise',
  // harmony 'random', N=6, no seeds) is applied consistently.
  const restoreDefaultsBtn = document.getElementById('restoreDefaultsBtn');
  restoreDefaultsBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Restore all defaults? This clears your seed colors, saved palettes, pins, roll history, and settings on this device. This can\'t be undone.');
    if (!ok) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SAVED_KEY);
    } catch { /* best-effort */ }
    // Drop the share hash too, so a reload can't re-import an old palette.
    try { location.hash = ''; } catch { /* ignore */ }
    location.reload();
  });

  // =====================================================================
  // 9. performRoll + accordion + scheme-row rendering
  // =====================================================================
  // Badge/announce text for a completed roll: "Mood · Harmony", dropping the
  // mood half when it was 'any' (or absent, e.g. older stored rolls) so the
  // classic default reads just as the algorithm name like before.
  function schemeBadgeText(rr) {
    const algo = ALGO_LABELS[rr.algorithm] || rr.algorithm;
    const moodKey = rr.mood || 'any';
    return moodKey === 'any' ? algo : `${MOOD_LABELS[moodKey] || moodKey} · ${algo}`;
  }

  // ---- Roll history (back/forward through past rolls) ----
  const HISTORY_CAP = 20;

  // A typed roll seed makes the roll reproducible (mulberry32 over the string);
  // an empty seed rolls non-deterministically via crypto.
  function chooseRng() {
    return state.rollSeed ? makeSeededRng(state.rollSeed) : cryptoRng;
  }

  // Push a completed roll + the settings that produced it. A new roll after
  // navigating Back truncates the "forward" tail (standard undo-stack shape).
  function pushHistory(result) {
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push({
      rollResult: result,
      algorithmSelect: state.algorithmSelect,
      moodSelect: state.moodSelect,
      count: state.count,
      locked: { ...state.locked },
      rollSeed: state.rollSeed,
    });
    if (state.history.length > HISTORY_CAP) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  function updateHistoryNav() {
    rollBackBtn.disabled = state.historyIndex <= 0;
    rollForwardBtn.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
  }

  // Restore a past (or forward) roll without generating a new one.
  function goHistory(delta) {
    const next = state.historyIndex + delta;
    if (next < 0 || next >= state.history.length) return;
    const entry = state.history[next];
    state.historyIndex = next;
    state.rollResult = entry.rollResult;
    state.algorithmSelect = entry.algorithmSelect;
    state.moodSelect = entry.moodSelect;
    state.count = clampCount(entry.count);
    state.locked = { ...(entry.locked || {}) };
    state.rollSeed = entry.rollSeed || '';
    harmonySelectEl.value = state.algorithmSelect;
    moodSelectEl.value = state.moodSelect;
    countSelectEl.value = String(state.count);
    rollSeedInputEl.value = state.rollSeed;
    state.expandedIndex = null;
    renderSchemes();
    algorithmUsedLabelEl.textContent = schemeBadgeText(state.rollResult);
    rollAnnounceEl.textContent = `Roll ${next + 1} of ${state.history.length} — ${schemeBadgeText(state.rollResult)}`;
    stopDemoCycle();
    updateHistoryNav();
    saveState();
  }

  function performRoll() {
    const isInitial = !hasRolledOnce;
    hasRolledOnce = true;

    pruneLocks();
    const seedColors = state.seeds.map((s) => s.color);
    const result = roll({ algorithm: state.algorithmSelect, seeds: seedColors, count: state.count, rng: chooseRng(), mood: state.moodSelect });
    applyLocks(result.schemes, state.locked); // pinned swatches survive the re-roll
    state.rollResult = result;
    state.isInitialLoad = isInitial;
    // Initial load: first scheme auto-expands. Every subsequent re-roll: all
    // schemes collapse (none auto-open) so the user picks which to open.
    state.expandedIndex = isInitial ? 0 : null;
    pushHistory(result);
    updateHistoryNav();
    renderSchemes();
    algorithmUsedLabelEl.textContent = schemeBadgeText(result);
    rollAnnounceEl.textContent = `New palette — ${schemeBadgeText(result)}`;
    if (isInitial) {
      startDemoCycle(0);
    } else {
      stopDemoCycle();
    }
    saveState();
  }

  rollBtn.addEventListener('click', performRoll);
  rollBackBtn.addEventListener('click', () => goHistory(-1));
  rollForwardBtn.addEventListener('click', () => goHistory(1));
  harmonySelectEl.addEventListener('change', () => {
    state.algorithmSelect = harmonySelectEl.value; // takes effect on next Roll
    saveState();
  });
  moodSelectEl.addEventListener('change', () => {
    state.moodSelect = moodSelectEl.value; // takes effect on next Roll
    saveState();
  });
  countSelectEl.addEventListener('change', () => {
    state.count = clampCount(countSelectEl.value); // takes effect on next Roll
    pruneLocks(); // a smaller N drops locks whose slot no longer exists
    saveState();
  });
  rollSeedInputEl.addEventListener('input', () => {
    state.rollSeed = rollSeedInputEl.value.trim();
    saveState();
  });
  cvdSelectEl.addEventListener('change', () => {
    state.cvd = cvdSelectEl.value; // preview-only repaint; palette data is untouched
    renderSchemes();
    if (state.expandedIndex !== null) startDemoCycle(state.expandedIndex);
    updateCvdBadge();
    saveState();
  });

  // Vision-preview badge: a persistent, dismissable notice whenever a non-normal
  // vision mode is active — so a simulated preview (which can flatten distinct
  // colors together) is never mistaken for the real palette.
  const cvdBadgeEl = document.getElementById('cvdBadge');
  const CVD_LABELS = {
    protanopia: 'Protanopia (red-blind)',
    deuteranopia: 'Deuteranopia (green-blind)',
    tritanopia: 'Tritanopia (blue-blind)',
  };
  function updateCvdBadge() {
    if (!cvdBadgeEl) return;
    if (state.cvd && state.cvd !== 'none') {
      cvdBadgeEl.innerHTML =
        `<span class="cvd-badge-text">👁 Colorblind preview: <strong>${CVD_LABELS[state.cvd] || state.cvd}</strong> — swatches are simulated, not your real colors.</span>` +
        `<button type="button" class="tool-btn cvd-badge-reset" data-testid="cvd-badge-reset">Back to normal vision</button>`;
      cvdBadgeEl.hidden = false;
      cvdBadgeEl.querySelector('.cvd-badge-reset').addEventListener('click', () => {
        cvdSelectEl.value = 'none';
        cvdSelectEl.dispatchEvent(new Event('change')); // repaint + persist + hide badge
      });
    } else {
      cvdBadgeEl.hidden = true;
      cvdBadgeEl.innerHTML = '';
    }
  }
  demoSpeedSelectEl.addEventListener('change', () => {
    state.demoSpeed = demoSpeedSelectEl.value;
    // Restart a running cycle so the new interval takes effect immediately.
    if (state.demo.isPlaying && state.demo.schemeIndex !== null) {
      pauseDemoCycle();
      playDemoCycle();
    }
    saveState();
  });
  shareLinkBtn.addEventListener('click', handleShareLink);
  savePaletteBtn.addEventListener('click', handleSavePalette);

  // Restore-on-load: if a usable roll is stored, render it (and its
  // expanded scheme) instead of auto-rolling — a fresh roll would discard
  // exactly the "where I left off" state this feature exists to keep.
  // Nothing stored (or unreadable) -> normal auto-roll, unchanged.
  function init() {
    loadSavedFromStorage();
    renderSavedShelf();

    // A shared-link hash wins over stored state; strip it afterward so later
    // edits persist to localStorage instead of a stale URL.
    const fromHash = applyHashState();
    if (fromHash) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* best-effort */ }
    }
    const restored = fromHash || restoreState();

    harmonySelectEl.value = state.algorithmSelect;
    moodSelectEl.value = state.moodSelect;
    countSelectEl.value = String(state.count);
    rollSeedInputEl.value = state.rollSeed;
    cvdSelectEl.value = state.cvd;
    demoSpeedSelectEl.value = state.demoSpeed;
    renderSeeds();
    updateCvdBadge(); // surface a restored non-normal vision mode

    if (restored) {
      state.isInitialLoad = true;
      if (state.history.length === 0) pushHistory(state.rollResult); // seed history from the restored roll
      updateHistoryNav();
      renderSchemes();
      algorithmUsedLabelEl.textContent = schemeBadgeText(state.rollResult);
      if (fromHash) saveState(); // persist the shared state as the new local baseline
      if (state.expandedIndex !== null) startDemoCycle(state.expandedIndex);
    } else {
      performRoll(); // nothing usable stored — fall back to the normal auto-roll
    }

    // Auto-show the Help modal once, on a genuinely fresh visit only.
    // Marking it seen right away (rather than on close) keeps this a true
    // "once" -- even if the visitor navigates away without explicitly
    // closing it, it won't auto-show again next time.
    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  }
  window.addEventListener('DOMContentLoaded', init);

  function getDetailEl(i) { return document.getElementById(`scheme-detail-${i}`); }
  function getToggleEl(i) { return document.getElementById(`scheme-toggle-${i}`); }

  function closeDetail(i) {
    const detail = getDetailEl(i);
    const toggle = getToggleEl(i);
    if (detail) { detail.innerHTML = ''; detail.hidden = true; }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function setExpanded(index) {
    const prev = state.expandedIndex;
    if (prev !== null && prev !== index) closeDetail(prev);

    state.expandedIndex = index;
    saveState();
    if (index === null) {
      stopDemoCycle();
      return;
    }
    const detail = getDetailEl(index);
    const toggle = getToggleEl(index);
    if (detail) {
      buildDetailContent(detail, index);
      detail.hidden = false;
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    startDemoCycle(index);
  }

  function handleToggleClick(i) {
    setExpanded(state.expandedIndex === i ? null : i);
  }

  // Color as shown on screen — passed through the CVD simulation when a
  // vision-preview mode is active. Never mutates state; the palette itself
  // (hex labels, copy output, exports) always uses the true color.
  function previewColor(c) {
    return state.cvd && state.cvd !== 'none' ? simulateCVD(c, state.cvd) : c;
  }

  function buildMiniSwatch(c, colorIdx, schemeIdx, countPerScheme) {
    const key = lockKey(schemeIdx, colorIdx);
    const isLocked = Object.prototype.hasOwnProperty.call(state.locked, key);

    const box = document.createElement('div');
    box.className = 'swatch-mini fade-in-el' + (isLocked ? ' locked' : '');
    box.dataset.testid = 'scheme-swatch';
    box.dataset.colorIndex = String(colorIdx);
    box.style.setProperty('--swatch-color', rgbaString(previewColor(c)));
    box.style.setProperty('--i', String(schemeIdx * countPerScheme + colorIdx)); // global stagger index

    // The color block is a real element (not a ::before) so it can host the
    // hover/focus overlay buttons (lock top-right, add-as-seed bottom-right).
    const swatchBox = document.createElement('span');
    swatchBox.className = 'swatch-box';

    // Lock/pin — keeps this exact color in this slot across re-rolls.
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'swatch-lock-btn';
    lockBtn.dataset.testid = 'scheme-swatch-lock-btn';
    lockBtn.setAttribute('aria-pressed', String(isLocked));
    lockBtn.setAttribute('aria-label', `${isLocked ? 'Unpin' : 'Pin'} ${hexString(c)} across re-rolls`);
    lockBtn.title = isLocked ? 'Pinned — kept on re-roll (click to unpin)' : 'Pin this color across re-rolls';
    lockBtn.textContent = isLocked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // clicking the lock must not expand/collapse the row
      toggleLock(schemeIdx, colorIdx, c);
    });
    swatchBox.appendChild(lockBtn);

    const seedBtn = document.createElement('button');
    seedBtn.type = 'button';
    seedBtn.className = 'swatch-seed-btn';
    seedBtn.dataset.testid = 'scheme-swatch-seed-btn';
    seedBtn.setAttribute('aria-label', `Add ${hexString(c)} as a seed color`);
    seedBtn.title = 'Add as a seed color';
    seedBtn.textContent = '+';
    seedBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // clicking + must not expand/collapse the scheme row
      addSeedFromColor(c);
      // brief ✓ flash on the button so the click has local feedback too
      seedBtn.classList.remove('added');
      void seedBtn.offsetWidth;
      seedBtn.classList.add('added');
      clearTimeout(seedBtn._addedT);
      seedBtn._addedT = setTimeout(() => seedBtn.classList.remove('added'), 900);
    });
    swatchBox.appendChild(seedBtn);
    box.appendChild(swatchBox);

    const hex = document.createElement('span');
    hex.className = 'swatch-hex';
    hex.dataset.testid = 'scheme-swatch-hex';
    hex.textContent = hexString(c);
    box.appendChild(hex);

    return box;
  }

  // Toggle a pin for one swatch. Locking stores the exact color at its absolute
  // position so re-rolls preserve it; unlocking removes it. No re-roll happens.
  function toggleLock(schemeIdx, colorIdx, color) {
    const key = lockKey(schemeIdx, colorIdx);
    if (Object.prototype.hasOwnProperty.call(state.locked, key)) {
      delete state.locked[key];
    } else {
      state.locked[key] = { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
    }
    saveState();
    renderSchemes();
    if (state.expandedIndex !== null) startDemoCycle(state.expandedIndex);
  }

  // Drop any locks whose slot no longer exists (e.g. after N shrinks).
  function pruneLocks() {
    for (const key of Object.keys(state.locked)) {
      const [s, cc] = key.split(':').map(Number);
      if (s > 4 || cc >= state.count) delete state.locked[key];
    }
  }

  function buildSchemeRow(i, scheme) {
    const wrap = document.createElement('div');
    wrap.className = 'scheme';
    wrap.dataset.testid = 'scheme-row';
    wrap.dataset.index = String(i);

    const isOpen = state.expandedIndex === i;

    // Header is a div[role=button] (not a <button>) so each swatch can carry
    // its own real "add as seed" <button> — a <button> nested inside a
    // <button> is invalid HTML. Keyboard support (Enter/Space) is wired below
    // to keep the whole strip toggle-able without a mouse.
    const toggle = document.createElement('div');
    toggle.className = 'scheme-header';
    toggle.dataset.testid = 'scheme-toggle';
    toggle.id = `scheme-toggle-${i}`;
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-controls', `scheme-detail-${i}`);
    toggle.setAttribute('aria-label', `Scheme ${i + 1}`);

    const strip = document.createElement('div');
    strip.className = 'swatch-strip';
    strip.dataset.testid = 'scheme-swatches';
    scheme.forEach((c, colorIdx) => strip.appendChild(buildMiniSwatch(c, colorIdx, i, scheme.length)));
    toggle.appendChild(strip);
    toggle.addEventListener('click', () => handleToggleClick(i));
    toggle.addEventListener('keydown', (e) => {
      // Only the header itself responds to Enter/Space. Keystrokes that bubble
      // up from a focused child control (e.g. a swatch's "+" add-as-seed
      // button) must reach that control's own activation — preventDefault-ing
      // them here would swallow the "+" keyboard action and toggle the row
      // instead. A role="button" container guards its keys with e.target.
      if (e.target !== toggle) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleClick(i); }
    });
    wrap.appendChild(toggle);

    const detail = document.createElement('div');
    detail.className = 'scheme-detail';
    detail.dataset.testid = 'scheme-detail';
    detail.id = `scheme-detail-${i}`;
    if (isOpen) {
      buildDetailContent(detail, i);
    } else {
      detail.hidden = true;
    }
    wrap.appendChild(detail);

    return wrap;
  }

  function renderSchemes() {
    schemesListEl.innerHTML = '';
    if (!state.rollResult) return;
    state.rollResult.schemes.forEach((scheme, i) => {
      schemesListEl.appendChild(buildSchemeRow(i, scheme));
    });
  }

  // =====================================================================
  // 10. Scheme detail panel (demo + color rows + copy-all)
  // =====================================================================
  function bestContrastIndex(scheme, bgIndex) {
    let best = -1, bestRatio = -1;
    scheme.forEach((c, j) => {
      if (j === bgIndex) return;
      const ratio = contrastRatio(scheme[bgIndex], c);
      if (ratio > bestRatio) { bestRatio = ratio; best = j; }
    });
    return best;
  }

  // Base ~7.5s between auto-cycle steps (DESIGN.md: "auto-cycles slowly").
  // The demo-speed control scales this: slow = 12s, normal = 7.5s, fast = 3.5s.
  const DEMO_SPEED_MS = { slow: 12000, normal: 7500, fast: 3500 };
  function demoCycleMs() { return DEMO_SPEED_MS[state.demoSpeed] || DEMO_SPEED_MS.normal; }

  function normIndex(i, N) { return ((i % N) + N) % N; }

  function renderDemo(detailEl, scheme, pairingIndex) {
    const N = scheme.length;
    // Colors as painted — CVD preview passes them through the simulation, but
    // pairing choices and hex labels still use the true palette.
    const shown = (state.cvd && state.cvd !== 'none') ? scheme.map((c) => simulateCVD(c, state.cvd)) : scheme;
    const bgIndex = normIndex(pairingIndex, N);
    const textIndex = bestContrastIndex(scheme, bgIndex);
    const accentIndex = (bgIndex + Math.min(2, N - 1)) % N;
    const accentTextIndex = bestContrastIndex(scheme, accentIndex);

    // Hero demo card — heading/paragraph/button, the primary pairing.
    const card = detailEl.querySelector('[data-testid="scheme-demo-card"]');
    if (card) {
      card.style.setProperty('--demo-bg', rgbaString(shown[bgIndex]));
      card.style.setProperty('--demo-fg', rgbaString(shown[textIndex]));
      card.style.setProperty('--demo-accent-bg', rgbaString(shown[accentIndex]));
      card.style.setProperty('--demo-accent-fg', rgbaString(shown[accentTextIndex]));
    }

    // Sample lines — one per scheme color used as a background (rotated so
    // the current pairing leads), each with its own best-contrast text, so
    // ALL N colors are visible together, not just the ~4 the hero card uses.
    const linesEl = detailEl.querySelector('[data-testid="scheme-demo-lines"]');
    if (linesEl) {
      const lineEls = linesEl.querySelectorAll('[data-testid="scheme-demo-line"]');
      for (let k = 0; k < N; k++) {
        const idx = (bgIndex + k) % N;
        const lineEl = lineEls[k];
        if (!lineEl) continue;
        const fgIdx = bestContrastIndex(scheme, idx);
        lineEl.style.setProperty('--line-bg', rgbaString(shown[idx]));
        lineEl.style.setProperty('--line-fg', rgbaString(shown[fgIdx]));
        lineEl.dataset.colorIndex = String(idx);
        const hexEl = lineEl.querySelector('[data-testid="scheme-demo-line-hex"]');
        if (hexEl) hexEl.textContent = hexString(scheme[idx]);
      }
    }

    // Swatch column — every color EXCEPT the current background, painted
    // against the current background so the user can eyeball the pairing.
    const swatchColEl = detailEl.querySelector('[data-testid="scheme-demo-swatches"]');
    if (swatchColEl) {
      swatchColEl.style.setProperty('--demo-bg', rgbaString(shown[bgIndex]));
      const swatchEls = swatchColEl.querySelectorAll('[data-testid="scheme-demo-swatch"]');
      let si = 0;
      for (let idx = 0; idx < N; idx++) {
        if (idx === bgIndex) continue;
        const swEl = swatchEls[si];
        si += 1;
        if (!swEl) continue;
        swEl.style.setProperty('--swatch-color', rgbaString(shown[idx]));
        swEl.dataset.colorIndex = String(idx);
      }
    }
  }

  function updateDemoToggleUI(detailEl) {
    const btn = detailEl && detailEl.querySelector('[data-testid="scheme-demo-toggle"]');
    if (!btn) return;
    const playing = state.demo.isPlaying;
    const label = playing ? 'Pause' : 'Play';
    btn.textContent = playing ? '⏸' : '▶';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(playing));
  }

  function stopDemoCycle() {
    if (state.demo.intervalId) clearInterval(state.demo.intervalId);
    state.demo = { schemeIndex: null, intervalId: null, pairingIndex: 0, isPlaying: false };
  }

  // Pauses the auto-cycle interval only — keeps the open scheme/pairing so
  // prev/next and Play still work afterward (unlike stopDemoCycle, which
  // tears everything down when a panel collapses).
  function pauseDemoCycle() {
    if (state.demo.intervalId) {
      clearInterval(state.demo.intervalId);
      state.demo.intervalId = null;
    }
    state.demo.isPlaying = false;
    updateDemoToggleUI(getDetailEl(state.demo.schemeIndex));
  }

  function playDemoCycle() {
    if (!state.rollResult || state.demo.schemeIndex === null) return;
    if (state.demo.intervalId) return; // already running
    state.demo.isPlaying = true;
    state.demo.intervalId = setInterval(() => { stepDemo(1); }, demoCycleMs());
    updateDemoToggleUI(getDetailEl(state.demo.schemeIndex));
  }

  function toggleDemoPlayback() {
    if (state.demo.isPlaying) pauseDemoCycle(); else playDemoCycle();
  }

  // Manual step (prev = -1, next = +1). Works regardless of play/pause
  // state or prefers-reduced-motion — only the automatic interval honors
  // reduced motion, per DESIGN.md.
  function stepDemo(delta) {
    if (!state.rollResult || state.demo.schemeIndex === null) return;
    const detailEl = getDetailEl(state.demo.schemeIndex);
    const scheme = state.rollResult.schemes[state.demo.schemeIndex];
    if (!detailEl || !scheme) return;
    state.demo.pairingIndex = normIndex(state.demo.pairingIndex + delta, scheme.length);
    renderDemo(detailEl, scheme, state.demo.pairingIndex);
  }

  function demoNext() { stepDemo(1); }
  function demoPrev() { stepDemo(-1); }

  function startDemoCycle(index) {
    stopDemoCycle();
    if (!state.rollResult) return;
    const detailEl = getDetailEl(index);
    const scheme = state.rollResult.schemes[index];
    if (!detailEl || !scheme) return;
    state.demo = { schemeIndex: index, intervalId: null, pairingIndex: 0, isPlaying: false };
    renderDemo(detailEl, scheme, 0);
    updateDemoToggleUI(detailEl);
    if (prefersReducedMotion()) return; // start paused, no auto-cycle; prev/next still work
    playDemoCycle();
  }

  // A read-only value field with the shared in-field copy button
  // (docs/conventions.md § "Standard control height & in-field copy"): a
  // .ct-field wrapper holding the <input> plus a .ct-copy-btn pinned inside its
  // right edge. The 'field' class is kept for the color-row's flex sizing.
  function buildField(inputTestId, copyTestId, copyLabel, fieldLabel, value) {
    const wrap = document.createElement('div');
    wrap.className = 'ct-field field';

    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.dataset.testid = inputTestId;
    input.setAttribute('aria-label', fieldLabel);
    input.value = value;
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

  function buildColorRow(c, idx) {
    const li = document.createElement('li');
    li.className = 'color-row';
    li.dataset.testid = 'scheme-color-row';
    li.dataset.colorIndex = String(idx);

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.dataset.testid = 'scheme-color-swatch';
    swatch.style.setProperty('--swatch-color', rgbaString(c));
    li.appendChild(swatch);

    const rgbaField = buildField('scheme-color-rgba', 'scheme-color-rgba-copy', 'Copy RGBA value', 'RGBA value', rgbaString(c));
    const hexField = buildField('scheme-color-hex', 'scheme-color-hex-copy', 'Copy hex value', 'Hex value', hexString(c));
    li.appendChild(rgbaField.wrap);
    li.appendChild(hexField.wrap);

    return li;
  }

  function rgbaOutput(i) {
    return state.rollResult.schemes[i].map(rgbaString).join('\n');
  }

  function hexOutput(i) {
    return state.rollResult.schemes[i].map(hexString).join('\n');
  }

  function buildOutputCol(colTestId, labelText, textareaTestId, copyBtnTestId, value, uniqueId) {
    const wrap = document.createElement('div');
    wrap.className = 'output-col';
    wrap.dataset.testid = colTestId;

    const label = document.createElement('label');
    label.setAttribute('for', uniqueId);
    label.textContent = labelText;

    const textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.id = uniqueId;
    textarea.dataset.testid = textareaTestId;
    textarea.value = value;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.dataset.testid = copyBtnTestId;
    copyBtn.setAttribute('aria-label', `Copy all ${labelText}`);
    copyBtn.title = `Copy all ${labelText}`;
    copyBtn.textContent = 'Copy all';
    copyBtn.addEventListener('click', () => handleCopyClick(copyBtn, textarea.value));

    wrap.append(label, textarea, copyBtn);
    return { wrap, textarea, copyBtn };
  }

  // ---- Download helpers (Blob + object URL; works from file://) ----
  function downloadText(filename, mime, text) {
    try {
      // Shared file-download helper (jbc-include/util.js, inlined as a global).
      downloadBlob(text, filename, mime);
    } catch { /* download blocked (rare) — copy is the always-available path */ }
  }

  // ---- PNG metadata (tEXt chunks) ----
  // Embeds attribution/provenance into the exported PNG as standard tEXt chunks
  // (readable via `exiftool`, macOS Preview's inspector, etc.). Vanilla: build
  // each chunk (len + "tEXt" + keyword\0text + CRC32) and splice them in before
  // the final IEND chunk.
  // Shared CRC-32 (crc32 from the inlined CtByteUtil module).
  function pngTextChunk(keyword, text) {
    const enc = new TextEncoder();
    // tEXt is Latin-1; strip anything outside it so the chunk stays valid.
    const kw = enc.encode(String(keyword).replace(/[^\x20-\x7E]/g, ''));
    const tx = enc.encode(String(text).replace(/[^\x20-\x7E]/g, ' '));
    const data = new Uint8Array(kw.length + 1 + tx.length);
    data.set(kw, 0); data[kw.length] = 0; data.set(tx, kw.length + 1);
    const chunk = new Uint8Array(12 + data.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74; // "tEXt"
    chunk.set(data, 8);
    dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
    return chunk;
  }
  function addPngMetadata(bytes, entries) {
    // Valid PNGs end with a 12-byte IEND chunk; insert our chunks right before it.
    if (bytes.length < 12) return bytes;
    const chunks = entries.map(([k, v]) => pngTextChunk(k, v));
    const extra = chunks.reduce((s, c) => s + c.length, 0);
    const iendStart = bytes.length - 12;
    const out = new Uint8Array(bytes.length + extra);
    out.set(bytes.subarray(0, iendStart), 0);
    let off = iendStart;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    out.set(bytes.subarray(iendStart), off);
    return out;
  }
  function pngMetadataEntries(scheme) {
    const hexes = scheme.map(hexString).join(', ');
    return [
      ['Title', 'Color palette — Color Designer'],
      ['Software', 'Color Designer · claude-tools'],
      ['Source', 'https://github.com/codercowboy/claude-tools'],
      ['Author', 'Code by Claude (Anthropic); concept & direction by Jason (codercowboy)'],
      ['Copyright', 'Made with claude-tools — github.com/codercowboy/claude-tools'],
      ['Description', `A color palette generated with Color Designer (claude-tools). Colors: ${hexes}`],
      ['Creation Time', new Date().toISOString()],
    ];
  }

  function downloadSchemePng(scheme) {
    const N = scheme.length;
    const cell = 120, labelH = 34, W = cell * N, H = cell + labelH;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    scheme.forEach((c, i) => {
      ctx.fillStyle = hexString(c);
      ctx.fillRect(i * cell, 0, cell, cell);
      // hex label with contrast-appropriate ink under each swatch
      ctx.fillStyle = '#333333';
      ctx.fillText(hexString(c), i * cell + cell / 2, cell + labelH / 2);
    });
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        let outBlob = blob;
        // Embed attribution/provenance as PNG tEXt chunks; if anything fails,
        // fall back to the plain image so the download always works.
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          outBlob = new Blob([addPngMetadata(bytes, pngMetadataEntries(scheme))], { type: 'image/png' });
        } catch { outBlob = blob; }
        // Shared file-download helper (jbc-include/util.js, inlined as a global).
        downloadBlob(outBlob, 'palette.png');
      }, 'image/png');
    } catch { /* toBlob unsupported — silently no-op */ }
  }

  // ---- Export subsection (format select + textarea + copy/download/PNG) ----
  function buildExportSection(scheme) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-block export-block';
    wrap.dataset.testid = 'scheme-export';

    const heading = document.createElement('h4');
    heading.className = 'tool-block-title';
    heading.textContent = 'Export';
    wrap.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'export-controls';

    const select = document.createElement('select');
    select.dataset.testid = 'scheme-export-format';
    select.setAttribute('aria-label', 'Export format');
    EXPORT_FORMATS.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.key;
      opt.textContent = f.label;
      select.appendChild(opt);
    });
    select.value = 'hex'; // default export format is the plain HEX list
    row.appendChild(select);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'tool-btn';
    copyBtn.dataset.testid = 'scheme-export-copy-btn';
    copyBtn.textContent = 'Copy';

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'tool-btn';
    dlBtn.dataset.testid = 'scheme-export-download-btn';
    dlBtn.textContent = 'Download';

    const pngBtn = document.createElement('button');
    pngBtn.type = 'button';
    pngBtn.className = 'tool-btn';
    pngBtn.dataset.testid = 'scheme-export-png-btn';
    pngBtn.textContent = 'PNG';

    row.append(copyBtn, dlBtn, pngBtn);
    wrap.appendChild(row);

    // The export output is a read-only value, so it gets the shared in-field
    // copy button too (docs/conventions.md § "Standard control height & in-field
    // copy" — .ct-field--multiline pins the button to the textarea's top-right).
    // The Copy button in the controls row above stays as well.
    const taField = document.createElement('div');
    taField.className = 'ct-field ct-field--multiline';

    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.className = 'export-output';
    ta.dataset.testid = 'scheme-export-output';
    ta.setAttribute('aria-label', 'Export output');
    taField.appendChild(ta);

    const inFieldCopyBtn = document.createElement('button');
    inFieldCopyBtn.type = 'button';
    inFieldCopyBtn.className = 'ct-copy-btn';
    inFieldCopyBtn.dataset.testid = 'scheme-export-output-copy';
    inFieldCopyBtn.setAttribute('aria-label', 'Copy export output');
    inFieldCopyBtn.title = 'Copy export output';
    inFieldCopyBtn.textContent = '📋';
    taField.appendChild(inFieldCopyBtn);

    wrap.appendChild(taField);

    const refresh = () => { ta.value = exportPalette(scheme, select.value); };
    refresh();
    select.addEventListener('change', refresh);
    copyBtn.addEventListener('click', () => handleCopyClick(copyBtn, ta.value));
    inFieldCopyBtn.addEventListener('click', () => handleCopyClick(inFieldCopyBtn, ta.value));
    dlBtn.addEventListener('click', () => {
      const fmt = EXPORT_FORMAT_MAP[select.value] || EXPORT_FORMAT_MAP.hex;
      downloadText(`palette.${fmt.ext}`, fmt.mime, ta.value);
    });
    pngBtn.addEventListener('click', () => downloadSchemePng(scheme));

    return wrap;
  }

  // ---- Contrast subsection (WCAG best-pairing per background) ----
  function buildContrastSection(scheme) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-block contrast-block';
    wrap.dataset.testid = 'scheme-contrast';

    const heading = document.createElement('h4');
    heading.className = 'tool-block-title';
    heading.textContent = 'Contrast (best text on each color)';
    wrap.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'contrast-grid';
    scorePairs(scheme).forEach((row) => {
      const chip = document.createElement('div');
      chip.className = 'contrast-row';
      chip.dataset.testid = 'scheme-contrast-row';
      const bg = scheme[row.bg];
      const fg = row.fg === -1 ? bg : scheme[row.fg];
      chip.style.setProperty('--c-bg', rgbaString(previewColor(bg)));
      chip.style.setProperty('--c-fg', rgbaString(previewColor(fg)));
      const label = contrastLabel(row.ratio);
      chip.classList.add(row.AA ? 'pass' : (row.AALarge ? 'warn' : 'fail'));

      const sample = document.createElement('span');
      sample.className = 'contrast-sample';
      sample.textContent = 'Aa';
      const meta = document.createElement('span');
      meta.className = 'contrast-meta';
      meta.textContent = `${row.ratio.toFixed(1)}:1 · ${label}`;
      chip.append(sample, meta);
      chip.title = `${hexString(fg)} on ${hexString(bg)} — ${row.ratio.toFixed(2)}:1 (${label})`;
      grid.appendChild(chip);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  // ---- "Explain this scheme" hue wheel (inline SVG, theme-aware) ----
  function buildHueWheel(scheme, algorithm) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-block wheel-block';
    wrap.dataset.testid = 'scheme-wheel';

    const heading = document.createElement('h4');
    heading.className = 'tool-block-title';
    heading.textContent = `Hue wheel — ${ALGO_LABELS[algorithm] || algorithm}`;
    wrap.appendChild(heading);

    const size = 180, cx = size / 2, cy = size / 2, R = 74;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Hue wheel showing this scheme's ${algorithm} geometry`);
    svg.classList.add('hue-wheel-svg');

    // Faint hue ring: 36 colored ticks around the circle.
    for (let d = 0; d < 360; d += 10) {
      const a = (d - 90) * Math.PI / 180;
      const x1 = cx + Math.cos(a) * (R - 6), y1 = cy + Math.sin(a) * (R - 6);
      const x2 = cx + Math.cos(a) * (R + 6), y2 = cy + Math.sin(a) * (R + 6);
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', x1.toFixed(1)); tick.setAttribute('y1', y1.toFixed(1));
      tick.setAttribute('x2', x2.toFixed(1)); tick.setAttribute('y2', y2.toFixed(1));
      const { r, g, b } = hslToRgb({ h: d, s: 0.7, l: 0.55 });
      tick.setAttribute('stroke', `rgb(${r},${g},${b})`);
      tick.setAttribute('stroke-width', '3');
      tick.setAttribute('opacity', '0.5');
      svg.appendChild(tick);
    }

    // Each scheme color plotted at its hue (radius fixed), filled with the color.
    scheme.forEach((c) => {
      const { h } = rgbToHsl(c);
      const a = (h - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', '8');
      dot.setAttribute('fill', hexString(previewColor(c)));
      dot.setAttribute('stroke', 'var(--wheel-dot-stroke, #fff)');
      dot.setAttribute('stroke-width', '2');
      const spoke = document.createElementNS(svgNS, 'line');
      spoke.setAttribute('x1', cx); spoke.setAttribute('y1', cy);
      spoke.setAttribute('x2', x.toFixed(1)); spoke.setAttribute('y2', y.toFixed(1));
      spoke.setAttribute('stroke', 'var(--wheel-spoke, rgba(128,128,128,0.35))');
      spoke.setAttribute('stroke-width', '1');
      svg.append(spoke, dot);
    });

    const scroller = document.createElement('div');
    scroller.className = 'wheel-scroll';
    scroller.appendChild(svg);
    wrap.appendChild(scroller);
    return wrap;
  }

  function buildDemoLine() {
    const li = document.createElement('li');
    li.className = 'demo-line';
    li.dataset.testid = 'scheme-demo-line';

    const text = document.createElement('span');
    text.textContent = 'The quick brown fox jumps.';
    li.appendChild(text);

    const hex = document.createElement('span');
    hex.className = 'demo-line-hex';
    hex.dataset.testid = 'scheme-demo-line-hex';
    li.appendChild(hex);

    return li;
  }

  function buildDemoSwatch() {
    const span = document.createElement('span');
    span.className = 'demo-swatch';
    span.dataset.testid = 'scheme-demo-swatch';
    return span;
  }

  function buildDemoControlBtn(testId, initialLabel, initialIcon, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'demo-control-btn';
    btn.dataset.testid = testId;
    btn.title = initialLabel;
    btn.setAttribute('aria-label', initialLabel);
    btn.textContent = initialIcon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildDetailContent(detailEl, i) {
    const scheme = state.rollResult.schemes[i];
    const N = scheme.length;
    detailEl.innerHTML = '';

    // Live demo
    const demo = document.createElement('div');
    demo.className = 'demo';
    demo.dataset.testid = 'scheme-demo';

    const main = document.createElement('div');
    main.className = 'demo-main';

    const content = document.createElement('div');
    content.className = 'demo-content';

    // Hero card — heading/paragraph/button using the current pairing.
    const card = document.createElement('div');
    card.className = 'demo-card';
    card.dataset.testid = 'scheme-demo-card';

    const heading = document.createElement('h3');
    heading.dataset.testid = 'scheme-demo-heading';
    heading.textContent = 'Sample heading';

    const para = document.createElement('p');
    para.dataset.testid = 'scheme-demo-paragraph';
    para.textContent = 'The quick brown fox jumps over the lazy dog.';

    const demoBtn = document.createElement('button');
    demoBtn.type = 'button';
    demoBtn.dataset.testid = 'scheme-demo-button';
    demoBtn.textContent = 'Call to action';

    card.append(heading, para, demoBtn);
    // Freeze-on-hover: pause the auto-cycle while the pointer is over the hero
    // card so you can study a pairing, then resume when it leaves.
    card.addEventListener('mouseenter', () => {
      if (state.demo.isPlaying) { card._resumeOnLeave = true; pauseDemoCycle(); }
    });
    card.addEventListener('mouseleave', () => {
      if (card._resumeOnLeave) { card._resumeOnLeave = false; playDemoCycle(); }
    });
    content.appendChild(card);

    // Sample lines — one per color (N), each its own background + best-
    // contrast text pairing, so all N colors are visible together.
    const lines = document.createElement('ul');
    lines.className = 'demo-lines';
    lines.dataset.testid = 'scheme-demo-lines';
    for (let k = 0; k < N; k++) lines.appendChild(buildDemoLine());
    content.appendChild(lines);

    main.appendChild(content);

    // Swatch column — the scheme's non-background colors (N-1), against the
    // current demo background.
    const swatches = document.createElement('div');
    swatches.className = 'demo-swatches';
    swatches.dataset.testid = 'scheme-demo-swatches';
    for (let k = 0; k < N - 1; k++) swatches.appendChild(buildDemoSwatch());
    main.appendChild(swatches);

    demo.appendChild(main);

    // Playback controls — pause/play toggle + prev/next manual stepping.
    const controls = document.createElement('div');
    controls.className = 'demo-controls';
    controls.dataset.testid = 'scheme-demo-controls';
    controls.append(
      buildDemoControlBtn('scheme-demo-prev', 'Previous', '⏮', demoPrev),
      buildDemoControlBtn('scheme-demo-toggle', 'Play', '▶', toggleDemoPlayback),
      buildDemoControlBtn('scheme-demo-next', 'Next', '⏭', demoNext)
    );
    demo.appendChild(controls);

    detailEl.appendChild(demo);

    // Per-color rows
    const list = document.createElement('ul');
    list.className = 'color-rows';
    list.dataset.testid = 'scheme-color-rows';
    scheme.forEach((c, idx) => list.appendChild(buildColorRow(c, idx)));
    detailEl.appendChild(list);

    // Copy-all textareas (derived — single source of truth: state.rollResult)
    const copyAllSection = document.createElement('div');
    copyAllSection.className = 'copy-all-section';
    const rgbaCol = buildOutputCol(
      'scheme-rgba-output-col', 'RGBA (one per line)', 'scheme-rgba-output',
      'scheme-rgba-copy-all-btn', rgbaOutput(i), `scheme-rgba-output-${i}`
    );
    const hexCol = buildOutputCol(
      'scheme-hex-output-col', 'HEX (one per line)', 'scheme-hex-output',
      'scheme-hex-copy-all-btn', hexOutput(i), `scheme-hex-output-${i}`
    );
    copyAllSection.append(rgbaCol.wrap, hexCol.wrap);
    detailEl.appendChild(copyAllSection);

    // Per-scheme tools: contrast check, export, and the hue-wheel explainer.
    detailEl.appendChild(buildContrastSection(scheme));
    detailEl.appendChild(buildExportSection(scheme));
    detailEl.appendChild(buildHueWheel(scheme, state.rollResult.algorithm));

    // Demo colors render immediately with defaults; startDemoCycle (called by
    // the caller right after) sets the real cycling custom properties.
    renderDemo(detailEl, scheme, state.demo.schemeIndex === i ? state.demo.pairingIndex : 0);
    updateDemoToggleUI(detailEl);
  }

  // =====================================================================
  // 11. Copy helper (per-color copy + both copy-all buttons) — shared
  // copy/flash (from the inlined CtClipboardUtil module)
  // =====================================================================
  async function handleCopyClick(btn, text) {
    if (!text) return;
    const ok = await copy(text);
    if (!ok) return;
    const current = btn.dataset.ctcFlashOriginal ?? btn.textContent;
    flash(btn, { label: current === 'Copy all' ? 'Copied!' : '✅' });
  }

  // =====================================================================
  // 11b. Shareable links — encode the whole state into location.hash and copy
  // the URL. On load, a valid hash takes precedence over localStorage; the
  // hash is then stripped so later edits persist normally via localStorage.
  // =====================================================================
  const SHARE_VERSION = 1;

  function encodeShareState() {
    const payload = {
      v: SHARE_VERSION,
      a: state.algorithmSelect,
      m: state.moodSelect,
      n: state.count,
      sd: state.rollSeed || '',
      seeds: state.seeds.map((s) => hexString(s.color)),
      schemes: state.rollResult ? state.rollResult.schemes.map((sc) => sc.map(hexString)) : [],
      ra: state.rollResult ? state.rollResult.algorithm : state.algorithmSelect,
      rm: state.rollResult ? (state.rollResult.mood || 'any') : state.moodSelect,
      lk: Object.fromEntries(Object.entries(state.locked).map(([k, c]) => [k, hexString(c)])),
      ei: state.expandedIndex,
    };
    return btoa(encodeURIComponent(JSON.stringify(payload)));
  }

  // Decode + apply a hash payload into state. Returns true only for a complete,
  // well-formed roll; anything malformed is ignored (caller falls back).
  function applyHashState() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return false;
    let payload;
    try { payload = JSON.parse(decodeURIComponent(atob(hash))); } catch { return false; }
    if (!payload || payload.v !== SHARE_VERSION) return false;

    const count = clampCount(payload.n);
    const schemes = Array.isArray(payload.schemes)
      ? payload.schemes.map((sc) => Array.isArray(sc) ? sc.map((h) => parseColor(h)) : null)
      : null;
    if (!schemes || schemes.some((sc) => !sc || sc.some((c) => !c))) return false;
    const rr = {
      algorithm: VALID_ALGORITHM_KEYS.has(payload.ra) ? payload.ra : (payload.a || 'random'),
      mood: VALID_MOOD_KEYS.has(payload.rm) ? payload.rm : 'any',
      schemes,
    };
    if (!isValidStoredRoll(rr, count)) return false;

    state.count = count;
    state.algorithmSelect = VALID_ALGORITHM_KEYS.has(payload.a) ? payload.a : 'random';
    state.moodSelect = VALID_MOOD_KEYS.has(payload.m) ? payload.m : 'any';
    state.rollSeed = typeof payload.sd === 'string' ? payload.sd : '';
    if (Array.isArray(payload.seeds)) {
      payload.seeds.forEach((h) => {
        const col = parseColor(h);
        if (col) state.seeds.push({ id: nextSeedId++, raw: hexString(col), color: col });
      });
    }
    const lk = {};
    if (payload.lk && typeof payload.lk === 'object') {
      for (const [k, h] of Object.entries(payload.lk)) {
        const col = parseColor(h);
        if (/^[0-4]:\d+$/.test(k) && col && Number(k.split(':')[1]) < count) lk[k] = col;
      }
    }
    state.locked = lk;
    state.rollResult = rr;
    hasRolledOnce = true;
    const ei = payload.ei;
    state.expandedIndex = (Number.isInteger(ei) && ei >= 0 && ei < 5) ? ei : null;
    pushHistory(rr);
    return true;
  }

  function handleShareLink() {
    try { location.hash = encodeShareState(); } catch { /* URL update best-effort */ }
    handleCopyClick(shareLinkBtn, location.href);
    toolAnnounceEl.textContent = 'Shareable link copied to the clipboard.';
  }

  // =====================================================================
  // 11c. Saved-palette shelf — a small named library in its own localStorage
  // key. "Save" stores the open scheme; "Load" shows it as scheme 1 (with its
  // companions re-generated) so you can keep working from it; "Delete" is
  // guarded by confirmDialog. Names are editable inline (no modal prompt).
  // =====================================================================
  const SAVED_KEY = 'color-designer:saved:v1';
  let savedPalettes = [];

  function loadSavedFromStorage() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      savedPalettes = Array.isArray(arr)
        ? arr.filter((e) => e && Array.isArray(e.colors) && e.colors.length >= MIN_COUNT && e.colors.every(isStoredColor))
        : [];
    } catch { savedPalettes = []; }
  }

  function persistSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedPalettes)); } catch { /* best-effort */ }
  }

  function handleSavePalette() {
    if (!state.rollResult) return;
    const i = state.expandedIndex !== null ? state.expandedIndex : 0;
    const scheme = state.rollResult.schemes[i];
    if (!scheme) return;
    const rr = state.rollResult;
    const defaultName = `${schemeBadgeText(rr)} · ${scheme.length}`;
    savedPalettes.unshift({
      id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: defaultName,
      colors: scheme.map((c) => ({ r: c.r, g: c.g, b: c.b, a: c.a ?? 1 })),
      algorithm: rr.algorithm,
      mood: rr.mood || 'any',
      savedAt: Date.now(),
    });
    persistSaved();
    renderSavedShelf();
    toolAnnounceEl.textContent = `Saved palette “${defaultName}”.`;
  }

  function loadSavedPalette(entry) {
    const colors = entry.colors.map((c) => ({ r: c.r, g: c.g, b: c.b, a: c.a ?? 1 }));
    state.count = clampCount(colors.length);
    state.algorithmSelect = VALID_ALGORITHM_KEYS.has(entry.algorithm) ? entry.algorithm : 'random';
    state.moodSelect = VALID_MOOD_KEYS.has(entry.mood) ? entry.mood : 'any';
    harmonySelectEl.value = state.algorithmSelect;
    moodSelectEl.value = state.moodSelect;
    countSelectEl.value = String(state.count);
    // Re-generate companions with the saved settings, then drop the saved
    // palette into scheme 1 so it's shown live and can be rolled around.
    const result = roll({ algorithm: state.algorithmSelect, seeds: state.seeds.map((s) => s.color), count: state.count, rng: chooseRng(), mood: state.moodSelect });
    result.schemes[0] = colors.slice(0, state.count);
    state.rollResult = result;
    state.locked = {};
    state.expandedIndex = 0;
    hasRolledOnce = true;
    pushHistory(result);
    updateHistoryNav();
    renderSchemes();
    algorithmUsedLabelEl.textContent = schemeBadgeText(result);
    startDemoCycle(0);
    saveState();
    toolAnnounceEl.textContent = `Loaded palette “${entry.name}”.`;
  }

  async function deleteSavedPalette(id) {
    const entry = savedPalettes.find((e) => e.id === id);
    if (entry && await confirmDialog(`Delete saved palette “${entry.name}”?`)) {
      savedPalettes = savedPalettes.filter((e) => e.id !== id);
      persistSaved();
      renderSavedShelf();
    }
  }

  function buildSavedItem(entry) {
    const li = document.createElement('div');
    li.className = 'saved-item';
    li.dataset.testid = 'saved-item';
    li.dataset.id = entry.id;

    const strip = document.createElement('div');
    strip.className = 'saved-item-strip';
    entry.colors.forEach((c) => {
      const sw = document.createElement('span');
      sw.className = 'saved-item-swatch';
      sw.style.setProperty('--swatch-color', rgbaString(c));
      strip.appendChild(sw);
    });
    li.appendChild(strip);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'saved-item-name';
    nameInput.dataset.testid = 'saved-item-name';
    nameInput.value = entry.name;
    nameInput.setAttribute('aria-label', 'Palette name');
    nameInput.addEventListener('change', () => {
      entry.name = nameInput.value.trim() || entry.name;
      nameInput.value = entry.name;
      persistSaved();
    });
    li.appendChild(nameInput);

    const actions = document.createElement('div');
    actions.className = 'saved-item-actions';
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'tool-btn';
    loadBtn.dataset.testid = 'saved-item-load';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadSavedPalette(entry));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'tool-btn tool-btn-danger';
    delBtn.dataset.testid = 'saved-item-delete';
    delBtn.setAttribute('aria-label', `Delete ${entry.name}`);
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteSavedPalette(entry.id));
    actions.append(loadBtn, delBtn);
    li.appendChild(actions);

    return li;
  }

  function renderSavedShelf() {
    savedShelfEl.innerHTML = '';
    savedSectionEl.hidden = savedPalettes.length === 0;
    savedPalettes.forEach((entry) => savedShelfEl.appendChild(buildSavedItem(entry)));
  }

  // =====================================================================
  // 11d. Keyboard shortcuts — global, ignored while typing or a dialog is open.
  // r = reroll, 1-5 = expand scheme, ? = help, ←/→ = demo prev/next, Esc =
  // collapse the open scheme.
  // =====================================================================
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
  }
  function anyDialogOpen() {
    return !helpOverlayEl.hidden
      || !settingsOverlayEl.hidden
      || (state.seedPicker && state.seedPicker.open)
      || document.querySelector('.ctc-overlay') !== null;
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target) || anyDialogOpen()) return;
    const k = e.key;
    if (k === 'r' || k === 'R') { e.preventDefault(); performRoll(); }
    else if (k >= '1' && k <= '5') {
      const idx = Number(k) - 1;
      if (state.rollResult && idx < state.rollResult.schemes.length) { e.preventDefault(); setExpanded(idx); }
    } else if (k === '?') { e.preventDefault(); openHelp(); }
    else if (k === 'ArrowLeft') { if (state.expandedIndex !== null) { e.preventDefault(); demoPrev(); } }
    else if (k === 'ArrowRight') { if (state.expandedIndex !== null) { e.preventDefault(); demoNext(); } }
    else if (k === 'Escape') { if (state.expandedIndex !== null) { e.preventDefault(); setExpanded(null); } }
  });

  // =====================================================================
  // 12. Test hook — inert for normal users
  // =====================================================================
  window.__colorDesigner = {
    // pure color math
    parseColor, rgbaString, hexString, rgbToHsl, hslToRgb,
    relLuminance, contrastRatio, circularHueDistance,
    rgbToHsv, hsvToRgb,

    // seed color picker actions (deterministic hooks — see DESIGN.md § Seed
    // color picker). state.seedPicker (below) is the live H/S/V/A/open
    // readback.
    openSeedPicker,
    closeSeedPicker,
    setSeedPickerHSVA,

    // pure harmony/generation
    anchorHues,
    generateScheme,
    roll,
    rollWith,
    makeSeqRng,
    cryptoRng,
    clampCount,

    // moods (pure data + helpers)
    MOODS,
    MOOD_MAP,
    moodBaseHue,

    // v10 pure helpers
    makeSeededRng, hashStringToInt, mulberry32,
    simulateCVD, CVD_TYPES,
    lockKey, applyLocks,
    contrastGrade, contrastLabel, bestForegroundIndex, scorePairs,
    EXPORT_FORMATS, exportPalette,
    crc32, pngMetadataEntries, addPngMetadata,

    // seed actions
    addSeed,
    addSeedFromColor,
    removeSeed,
    clearSeeds: clearSeedsDirect,

    // UI actions
    performRoll,
    goHistory,
    toggleLock,
    handleShareLink,
    handleSavePalette,
    loadSavedPalette,
    encodeShareState,
    getSavedPalettes: () => savedPalettes,

    // live demo playback hooks — deterministic prev/next/toggle so tests can
    // drive/read the demo without waiting on the auto-cycle timer. Current
    // pairing index and play state are also readable live off
    // state.demo.pairingIndex / state.demo.isPlaying (below).
    demoNext,
    demoPrev,
    demoTogglePlayback: toggleDemoPlayback,
    demoPlay: playDemoCycle,
    demoPause: pauseDemoCycle,

    // live state
    state,

    // per-scheme derived output getters
    rgbaOutput,
    hexOutput,
  };
