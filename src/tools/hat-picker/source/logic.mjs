    // ===== BEGIN PURE-LOGIC (unit-tested by tests/unit/*.test.mjs via
    // tests/unit/extract-inline-module.mjs — keep this region free of
    // document/window/localStorage access; see that file for the convention) =====
    // =====================================================================
    // 1. Constants
    // =====================================================================
    const MAX_LEN = 80;
    const STORAGE_KEY = 'hat-picker:v1';
    const HELP_SEEN_KEY = 'hat-picker:help-seen:v1';
    const CYCLE_DURATION_MS = 2000;
    const CYCLE_MIN_STEP_MS = 40;
    const CYCLE_MAX_STEP_MS = 260;
    const SHAKE_DURATION_MS = 320;
    const CONFETTI_COLORS = ['#ff6f59', '#4ecdc4', '#ffd166', '#ef476f', '#06d6a0', '#7b61ff'];
    const CONFETTI_PARTICLE_COUNT = 110;

    // =====================================================================
    // 2. Pure functions
    // =====================================================================

    // Pure, testable, no side effects, no closures over app state.
    // rng() must return a float in [0, 1).
    function pickIndex(count, rng = defaultRng) {
      if (count <= 0) throw new RangeError('pickIndex: count must be > 0');
      return Math.floor(rng() * count);
    }

    // Default rng backed by crypto.getRandomValues. Dividing a uniform Uint32
    // by 2^32 then flooring by `count` has a theoretical modulo-bias only when
    // `count` doesn't evenly divide 2^32; at the small entry counts a hat
    // picker realistically has, that bias is far below any measurable
    // threshold — the same accepted tradeoff Math.random()-based code makes,
    // just backed by a CSPRNG. Not worth full rejection sampling here.
    function defaultRng() {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 4294967296; // 2^32
    }

    function isBlank(text) {
      return text.trim().length === 0;
    }

    // Trims and hard-caps to MAX_LEN. Used both by addEntry (defense in depth
    // against paste bypassing the input's maxlength) and by the live counter.
    function clampText(text) {
      return text.trim().slice(0, MAX_LEN);
    }

    // Exact-text duplicate check against the current entry list. Used by
    // addEntry() to reject a second entry with identical (already-clamped)
    // text.
    function isDuplicateText(entries, text) {
      return entries.some((e) => e.text === text);
    }

    // Pure list transformation: returns a NEW array with the entry matching
    // `id` removed (does not mutate `entries`). Used by both removeEntry()
    // (the trash-button/confirm path) and draw()'s "remove winner after
    // draw" no-repeat behavior.
    function removeEntryById(entries, id) {
      return entries.filter((e) => e.id !== id);
    }

    // Test-only export surface — inert in the browser (nothing in this page
    // imports this module, so `export` here is a no-op) except when
    // tests/unit/*.test.mjs extract this region and dynamically import it in
    // Node. See tests/unit/extract-inline-module.mjs.
    export {
      MAX_LEN, pickIndex, defaultRng, isBlank, clampText, isDuplicateText, removeEntryById,
    };
    // ===== END PURE-LOGIC =====
