  // ===== BEGIN PURE-LOGIC (unit-tested — see tests/unit/extract-inline-module.mjs) =====
  // =====================================================================
  // 3. Pure color math (no DOM)
  // =====================================================================
  function rgbToHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0, s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case rn: h = 60 * (((gn - bn) / d) % 6); break;
        case gn: h = 60 * ((bn - rn) / d + 2); break;
        default: h = 60 * ((rn - gn) / d + 4); break;
      }
      if (h < 0) h += 360;
    }
    return { h, s, l };
  }

  function hslToRgb({ h, s, l }) {
    const hh = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hh / 60) % 2 - 1));
    const m = l - c / 2;
    let r1, g1, b1;
    if (hh < 60) [r1, g1, b1] = [c, x, 0];
    else if (hh < 120) [r1, g1, b1] = [x, c, 0];
    else if (hh < 180) [r1, g1, b1] = [0, c, x];
    else if (hh < 240) [r1, g1, b1] = [0, x, c];
    else if (hh < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  // HSV — distinct from the HSL pair above; used only by the visual seed
  // color picker (saturation/value square + hue slider). h in [0,360),
  // s/v in [0,1].
  function rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case rn: h = 60 * (((gn - bn) / d) % 6); break;
        case gn: h = 60 * ((bn - rn) / d + 2); break;
        default: h = 60 * ((rn - gn) / d + 4); break;
      }
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  function hsvToRgb({ h, s, v }) {
    const hh = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs((hh / 60) % 2 - 1));
    const m = v - c;
    let r1, g1, b1;
    if (hh < 60) [r1, g1, b1] = [c, x, 0];
    else if (hh < 120) [r1, g1, b1] = [x, c, 0];
    else if (hh < 180) [r1, g1, b1] = [0, c, x];
    else if (hh < 240) [r1, g1, b1] = [0, x, c];
    else if (hh < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const RGB_COMMA_RE =
    /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i;
  const RGB_SLASH_RE =
    /^rgba?\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*\)$/i;

  function clampChannel(n) { return Math.round(Math.min(255, Math.max(0, n))); }
  function clampAlpha(n) { return Math.min(1, Math.max(0, n)); }

  function parseHex(hex) {
    const h = hex.toLowerCase();
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  function buildRgba(rStr, gStr, bStr, aStr) {
    const r = Number(rStr), g = Number(gStr), b = Number(bStr);
    if ([r, g, b].some(Number.isNaN)) return null;
    let a = 1;
    if (aStr !== undefined) {
      a = Number(aStr);
      if (Number.isNaN(a)) return null;
    }
    return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a: clampAlpha(a) };
  }

  function parseColor(str) {
    const s = String(str ?? '').trim();
    if (s === '') return null;

    const hexMatch = s.match(HEX_RE);
    if (hexMatch) return parseHex(hexMatch[1]);

    const comma = s.match(RGB_COMMA_RE);
    if (comma) return buildRgba(comma[1], comma[2], comma[3], comma[4]);

    const slash = s.match(RGB_SLASH_RE);
    if (slash) return buildRgba(slash[1], slash[2], slash[3], slash[4]);

    return null;
  }

  function rgbaString({ r, g, b, a }) {
    const alpha = Number.isInteger(a) ? a : Math.round(a * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function hexString({ r, g, b, a }) {
    const h = (n) => n.toString(16).padStart(2, '0');
    const base = `#${h(r)}${h(g)}${h(b)}`;
    return a < 1 ? `${base}${h(Math.round(a * 255))}` : base;
  }

  function relLuminance({ r, g, b }) {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(c1, c2) {
    const L1 = relLuminance(c1), L2 = relLuminance(c2);
    const lighter = Math.max(L1, L2), darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function circularHueDistance(h1, h2) {
    const d = Math.abs(h1 - h2) % 360;
    return d > 180 ? 360 - d : d;
  }

  // =====================================================================
  // 4. Harmony data + anchorHues
  // =====================================================================
  const ALGORITHMS = [
    { key: 'complementary',      label: 'Complementary' },
    { key: 'analogous',          label: 'Analogous' },
    { key: 'triadic',            label: 'Triadic' },
    { key: 'splitComplementary', label: 'Split-complementary' },
    { key: 'tetradic',           label: 'Tetradic' },
    { key: 'monochromatic',      label: 'Monochromatic' },
  ];
  const ALGO_LABELS = Object.fromEntries(ALGORITHMS.map((a) => [a.key, a.label]));

  function norm360(h) { return ((h % 360) + 360) % 360; }

  // The raw hue OFFSETS (relative to base hue H) each algorithm rotates into.
  // anchorHues() adds them to H; a mood's `spread` can scale them toward 0 to
  // keep a themed mood (Ocean, Ice, ...) clustered inside its hue arc instead
  // of flying across the wheel. Scaling the *original* offsets (not a wrapped
  // shortest-angle diff) is what preserves each harmony's geometry — e.g.
  // triadic's +240 shrinks to +96 at spread 0.4, not to -48.
  const ANCHOR_OFFSETS = {
    complementary:      [0, 180],
    analogous:          [-30, 0, 30],
    triadic:            [0, 120, 240],
    splitComplementary: [0, 150, 210],
    tetradic:           [0, 90, 180, 270],
    monochromatic:      [0],
  };

  function anchorHues(key, H, spread = 1) {
    const offsets = ANCHOR_OFFSETS[key];
    if (!offsets) throw new Error(`unknown algorithm: ${key}`);
    return offsets.map((o) => norm360(H + o * spread));
  }

  // =====================================================================
  // 5. Fill strategy: anchors -> exactly N colors (N configurable, 2-10)
  // =====================================================================
  const ROLES = [
    { name: 'shade', dL: -0.28, dS: +0.05 },  // dark shade
    { name: 'base',  dL:  0,    dS:  0    },  // anchor as generated (mid)
    { name: 'tint',  dL: +0.28, dS: -0.08 },  // light tint
    { name: 'vivid', dL: -0.06, dS: +0.20 },  // vivid, slightly darker+saturated
    { name: 'muted', dL: +0.10, dS: -0.30 },  // muted, near-neutral
  ];

  function clamp01(x) { return Math.min(1, Math.max(0, x)); }

  // =====================================================================
  // 5b. Moods — "roll of the dice" flavor layered ON TOP of the harmony.
  //
  // Harmony decides the RELATIONSHIP between hues (triadic, complementary...);
  // a mood decides the TERRITORY + TONE they're drawn in. The two compose, so
  // e.g. "Deep & moody" + Complementary lands a dark navy against a golden
  // opposite, while "Ocean" + Complementary stays within cool blue-greens.
  //
  // Each mood is pure data:
  //   hueArcs  null = any hue. Otherwise [[start,end], ...] in degrees; a base
  //            hue is picked uniformly inside one randomly-chosen arc. An arc
  //            whose end < start wraps past 360 (e.g. [335, 45] = pinks→reds→
  //            oranges). Themed moods use this to stake out a neighborhood.
  //   spread   multiplier on the harmony's hue OFFSETS (see ANCHOR_OFFSETS).
  //            1 = full harmony; themed moods use <1 so their anchors stay
  //            near/inside the arc and the palette still reads as that theme.
  //   sat      [lo,hi] base saturation range (replaces the default spread).
  //   light    [lo,hi] base lightness range.
  //   roleScale multiplier on the ROLES dL/dS deltas — <1 = gentle/soft
  //            (pastels, ice), >1 = starker light/dark swings within a scheme.
  //
  // 'any' reproduces the pre-mood behavior byte-for-byte (same rng draws, same
  // ranges), so it stays the safe default and existing rolls are unchanged.
  // =====================================================================
  const MOOD_ANY = {
    key: 'any', label: 'Any (classic)',
    hueArcs: null, spread: 1, sat: [0.55, 0.90], light: [0.45, 0.60], roleScale: 1,
  };
  const MOODS = [
    MOOD_ANY,
    // --- Tone moods: any hue, compose cleanly with every harmony ---
    { key: 'warm',    label: 'Warm',         hueArcs: [[330, 60]],  spread: 1,    sat: [0.55, 0.90], light: [0.45, 0.62], roleScale: 1 },
    { key: 'cool',    label: 'Cool',         hueArcs: [[150, 280]], spread: 1,    sat: [0.45, 0.85], light: [0.40, 0.60], roleScale: 1 },
    { key: 'pastel',  label: 'Soft pastels', hueArcs: null,         spread: 1,    sat: [0.25, 0.48], light: [0.80, 0.90], roleScale: 0.5 },
    { key: 'deep',    label: 'Deep & moody', hueArcs: null,         spread: 1,    sat: [0.60, 0.92], light: [0.32, 0.46], roleScale: 0.7 },
    { key: 'muted',   label: 'Muted',        hueArcs: null,         spread: 1,    sat: [0.18, 0.40], light: [0.42, 0.62], roleScale: 0.8 },
    { key: 'neon',    label: 'Neon',         hueArcs: null,         spread: 1,    sat: [0.90, 1.00], light: [0.50, 0.62], roleScale: 0.7 },
    // --- Theme moods: locked to a hue neighborhood (spread < 1) ---
    { key: 'ocean',   label: 'Ocean',        hueArcs: [[175, 230]], spread: 0.35, sat: [0.50, 0.85], light: [0.30, 0.60], roleScale: 1 },
    { key: 'sunset',  label: 'Sunset',       hueArcs: [[335, 45]],  spread: 0.5,  sat: [0.70, 0.95], light: [0.45, 0.66], roleScale: 1 },
    { key: 'ice',     label: 'Ice',          hueArcs: [[185, 220]], spread: 0.45, sat: [0.18, 0.42], light: [0.78, 0.92], roleScale: 0.6 },
    { key: 'forest',  label: 'Forest',       hueArcs: [[95, 150]],  spread: 0.45, sat: [0.35, 0.70], light: [0.24, 0.50], roleScale: 1.1 },
    { key: 'earthy',  label: 'Earthy',       hueArcs: [[22, 48]],   spread: 0.6,  sat: [0.30, 0.55], light: [0.42, 0.66], roleScale: 1 },
  ];
  const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.key, m]));
  const MOOD_LABELS = Object.fromEntries(MOODS.map((m) => [m.key, m.label]));
  // 'Surprise me' picks one *flavored* mood per roll (never 'any'), mirroring
  // how 'random' harmony picks one algorithm shared across the roll's schemes.
  const SURPRISE_POOL = MOODS.filter((m) => m.key !== 'any');

  // Base hue for a scheme: uniform within one of the mood's arcs, or full
  // spectrum when the mood is hue-free. For MOOD_ANY (hueArcs null) this is a
  // single rng() draw === the old `rng() * 360`, preserving determinism.
  function moodBaseHue(mood, rng) {
    if (!mood.hueArcs) return rng() * 360;
    const arc = mood.hueArcs.length === 1
      ? mood.hueArcs[0]
      : mood.hueArcs[Math.floor(rng() * mood.hueArcs.length)];
    let [a, b] = arc;
    if (b < a) b += 360; // wrapped arc (e.g. [335, 45])
    return norm360(a + rng() * (b - a));
  }

  const DEFAULT_COUNT = 4;
  const MIN_COUNT = 2;
  const MAX_COUNT = 10;
  function clampCount(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return DEFAULT_COUNT;
    return Math.min(MAX_COUNT, Math.max(MIN_COUNT, v));
  }

  // =====================================================================
  // 6. Seed injection (nearest-hue slot, collision-free)
  // =====================================================================
  function injectSeeds(colors, chosenSeedColors) {
    const used = new Set();
    for (const seed of chosenSeedColors) {
      const seedHue = rgbToHsl(seed).h;
      let bestIdx = -1, bestDist = Infinity;
      colors.forEach((c, i) => {
        if (used.has(i)) return;
        const dist = circularHueDistance(rgbToHsl(c).h, seedHue);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      used.add(bestIdx);
      colors[bestIdx] = { r: seed.r, g: seed.g, b: seed.b, a: seed.a ?? 1 };
    }
    return colors;
  }

  // =====================================================================
  // 7. generateScheme / roll — pure, rng-injectable
  // =====================================================================
  function pickSeedCount(poolSize, count, rng) {
    if (poolSize === 0) return 0;
    const cap = Math.max(1, Math.min(3, poolSize, count)); // bounded by pool size AND by N
    return 1 + Math.floor(rng() * cap); // 1..cap
  }

  function pickRandomSeeds(seeds, k, rng) {
    const remaining = seeds.slice();
    const chosen = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(rng() * remaining.length);
      chosen.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    return chosen;
  }

  function lerpRange([lo, hi], t) { return lo + t * (hi - lo); }

  function generateScheme(algorithm, seeds, count, rng, mood = MOOD_ANY) {
    const N = clampCount(count);

    // 1. base hue + base S/L. A seed can still supply the base hue, but only
    // for hue-free (tone) moods — a themed mood owns its hue territory, so its
    // arc wins there and the seed still gets woven in via injection below.
    const seedBaseWanted = seeds.length > 0 && rng() < 0.5;
    const useSeedBase = seedBaseWanted && !mood.hueArcs;
    let H;
    if (useSeedBase) {
      const idx = Math.floor(rng() * seeds.length);
      H = rgbToHsl(seeds[idx]).h;
    } else {
      H = moodBaseHue(mood, rng); // === rng()*360 for MOOD_ANY (unchanged)
    }
    const baseS = lerpRange(mood.sat, rng());   // MOOD_ANY: 0.55 + rng()*0.35
    const baseL = lerpRange(mood.light, rng()); // MOOD_ANY: 0.45 + rng()*0.15

    // 2. anchor hues — the mood's spread tightens the harmony offsets so
    // themed moods stay in their neighborhood (spread 1 = full harmony). An
    // optional `anchorBias` nudges the non-base anchors outward (+) or inward
    // (-) in degrees before the spread; bias 0 (the default for every current
    // mood) is byte-identical to plain anchorHues().
    const bias = mood.anchorBias || 0;
    const anchors = bias === 0
      ? anchorHues(algorithm, H, mood.spread)
      : ANCHOR_OFFSETS[algorithm].map(
          (o) => norm360(H + (o === 0 ? 0 : o + Math.sign(o) * bias) * mood.spread)
        );

    // 3. fill N slots — cycle anchor hues round-robin and cycle the roles table
    // round-robin (same pattern as anchors) so any N in 2..10 gets varied hue +
    // lightness/saturation coverage. roleScale softens (pastel/ice) or
    // exaggerates (deep) the in-scheme light/sat swings. A mood may override the
    // whole ROLES table via `roles`; absent, the shared default ROLES is used
    // (byte-identical to before).
    const rolesTable = mood.roles || ROLES;
    const colors = Array.from({ length: N }, (_, i) => {
      const hue = anchors[i % anchors.length];
      const role = rolesTable[i % rolesTable.length];
      const s = clamp01(baseS + role.dS * mood.roleScale);
      const l = clamp01(baseL + role.dL * mood.roleScale);
      const { r, g, b } = hslToRgb({ h: hue, s, l });
      return { r, g, b, a: 1 };
    });

    // 4. seed injection
    const k = pickSeedCount(seeds.length, N, rng);
    const chosen = pickRandomSeeds(seeds, k, rng);
    return injectSeeds(colors, chosen);
  }

  function roll({ algorithm, seeds, count, rng, mood }) {
    const resolvedAlgorithm = algorithm === 'random'
      ? ALGORITHMS[Math.floor(rng() * ALGORITHMS.length)].key
      : algorithm;
    // 'surprise' is the default and means NO mood persuasion — fully random,
    // exactly like the classic pre-mood behavior (the old 'any'). A named mood
    // applies its persuasion; anything unknown (or old stored 'any') also falls
    // back to no persuasion. Note: 'surprise' draws no extra rng, so a no-mood
    // roll is byte-identical to the classic generator for a given rng.
    const moodKey = mood || 'surprise';
    const resolvedMood = (moodKey !== 'surprise' && MOOD_MAP[moodKey]) ? moodKey : 'any';
    const moodObj = MOOD_MAP[resolvedMood];
    const schemes = [0, 1, 2, 3, 4].map(() => generateScheme(resolvedAlgorithm, seeds, count, rng, moodObj));
    return { algorithm: resolvedAlgorithm, mood: resolvedMood, schemes };
  }

  function cryptoRng() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296; // 2^32
  }

  function makeSeqRng(seq) {
    let i = 0;
    return () => { const v = seq[i % seq.length]; i++; return v; };
  }

  function rollWith({ algorithm, seeds, count, rngSeq, mood }) {
    return roll({ algorithm, seeds, count, rng: makeSeqRng(rngSeq), mood });
  }

  // =====================================================================
  // 7a. Deterministic seeded rng — a typed "roll seed" reproduces a roll and
  // makes shared links reproducible. mulberry32 over a string hashed with a
  // small FNV-ish mixer. Empty seed -> caller uses cryptoRng instead.
  // =====================================================================
  function hashStringToInt(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    let t = a >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSeededRng(seedStr) {
    return mulberry32(hashStringToInt(String(seedStr)));
  }

  // =====================================================================
  // 7e. Color-blindness (CVD) simulation — a preview transform, never applied
  // to the stored palette. Fixed Brettel/Viénot-style matrices in linear-ish
  // sRGB space (approximation good enough for a design preview).
  // =====================================================================
  const CVD_MATRICES = {
    protanopia:   [[0.567, 0.433, 0.000], [0.558, 0.442, 0.000], [0.000, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0.000], [0.700, 0.300, 0.000], [0.000, 0.300, 0.700]],
    tritanopia:   [[0.950, 0.050, 0.000], [0.000, 0.433, 0.567], [0.000, 0.475, 0.525]],
  };
  const CVD_TYPES = [
    { key: 'none',         label: 'Normal vision' },
    { key: 'protanopia',   label: 'Protanopia (red-blind)' },
    { key: 'deuteranopia', label: 'Deuteranopia (green-blind)' },
    { key: 'tritanopia',   label: 'Tritanopia (blue-blind)' },
  ];
  function simulateCVD(color, type) {
    const m = CVD_MATRICES[type];
    if (!m) return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
    const { r, g, b } = color;
    const mix = (row) => clampChannel(Math.round(row[0] * r + row[1] * g + row[2] * b));
    return { r: mix(m[0]), g: mix(m[1]), b: mix(m[2]), a: color.a ?? 1 };
  }

  // =====================================================================
  // 7b. Locked (pinned) colors — keep the swatches you love, roll the rest.
  //
  // A lock is keyed by absolute position "schemeIndex:colorIndex" -> color.
  // roll() generates all five schemes normally; applyLocks() then overwrites
  // the locked slots in place, so a pinned color survives every re-roll while
  // its neighbors change. Pure + position-based, so it's deterministic and
  // unit-testable, and locks that fall outside the current shape (a slot >= N,
  // or scheme index out of range) are simply skipped.
  // =====================================================================
  function lockKey(schemeIndex, colorIndex) { return `${schemeIndex}:${colorIndex}`; }

  function applyLocks(schemes, locked) {
    if (!locked) return schemes;
    for (const key of Object.keys(locked)) {
      const [s, c] = key.split(':').map(Number);
      if (schemes[s] && c >= 0 && c < schemes[s].length) {
        const col = locked[key];
        schemes[s][c] = { r: col.r, g: col.g, b: col.b, a: col.a ?? 1 };
      }
    }
    return schemes;
  }

  // =====================================================================
  // 7c. WCAG contrast scoring — which color pairs are actually usable as
  // text-on-background, not just which look nice together.
  // =====================================================================
  // WCAG 2.x thresholds: normal text needs >= 4.5 (AA) / 7 (AAA); large text
  // (>= ~18.66px bold or 24px) needs >= 3 (AA) / 4.5 (AAA).
  function contrastGrade(ratio) {
    return {
      ratio,
      AA: ratio >= 4.5,
      AAA: ratio >= 7,
      AALarge: ratio >= 3,
      AAALarge: ratio >= 4.5,
    };
  }

  // Short human label for the best grade a ratio earns (for a compact badge).
  function contrastLabel(ratio) {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'AA Large';
    return 'Fail';
  }

  // For a given background color index, the scheme color with the highest
  // contrast against it (excluding itself). Pure sibling of the demo's own
  // bestContrastIndex, so tests can assert pairings without the DOM.
  function bestForegroundIndex(scheme, bgIndex) {
    let best = -1, bestRatio = -1;
    scheme.forEach((c, j) => {
      if (j === bgIndex) return;
      const ratio = contrastRatio(scheme[bgIndex], c);
      if (ratio > bestRatio) { bestRatio = ratio; best = j; }
    });
    return best;
  }

  // For each color used as a background, its best foreground partner + grade.
  function scorePairs(scheme) {
    return scheme.map((_, bg) => {
      const fg = bestForegroundIndex(scheme, bg);
      const ratio = fg === -1 ? 0 : contrastRatio(scheme[bg], scheme[fg]);
      return { bg, fg, ...contrastGrade(ratio) };
    });
  }

  // =====================================================================
  // 7d. Export formats — turn a scheme into something you can paste into a
  // project. All pure string builders; the UI just picks one and copies or
  // downloads it.
  // =====================================================================
  const EXPORT_FORMATS = [
    { key: 'css',      label: 'CSS variables', ext: 'css',  mime: 'text/css' },
    { key: 'scss',     label: 'SCSS',          ext: 'scss', mime: 'text/x-scss' },
    { key: 'json',     label: 'JSON',          ext: 'json', mime: 'application/json' },
    { key: 'tailwind', label: 'Tailwind',      ext: 'js',   mime: 'text/javascript' },
    { key: 'hex',      label: 'HEX list',      ext: 'txt',  mime: 'text/plain' },
    { key: 'rgba',     label: 'RGBA list',     ext: 'txt',  mime: 'text/plain' },
  ];
  const EXPORT_FORMAT_MAP = Object.fromEntries(EXPORT_FORMATS.map((f) => [f.key, f]));

  function toCssVars(scheme) {
    const lines = scheme.map((c, i) => `  --color-${i + 1}: ${hexString(c)};`);
    return `:root {\n${lines.join('\n')}\n}`;
  }
  function toScss(scheme) {
    const vars = scheme.map((c, i) => `$color-${i + 1}: ${hexString(c)};`);
    const mapEntries = scheme.map((c, i) => `  "color-${i + 1}": ${hexString(c)}`);
    return `${vars.join('\n')}\n\n$palette: (\n${mapEntries.join(',\n')}\n);`;
  }
  function toJson(scheme) {
    return JSON.stringify(
      scheme.map((c) => ({ hex: hexString(c), rgba: rgbaString(c) })),
      null, 2
    );
  }
  function toTailwind(scheme) {
    const entries = scheme.map((c, i) => `      '${i + 1}': '${hexString(c)}',`);
    return `// tailwind.config.js — theme.extend.colors\ncolors: {\n  palette: {\n${entries.join('\n')}\n  },\n}`;
  }
  function toHexList(scheme) { return scheme.map(hexString).join('\n'); }
  function toRgbaList(scheme) { return scheme.map(rgbaString).join('\n'); }

  function exportPalette(scheme, format) {
    switch (format) {
      case 'css':      return toCssVars(scheme);
      case 'scss':     return toScss(scheme);
      case 'json':     return toJson(scheme);
      case 'tailwind': return toTailwind(scheme);
      case 'hex':      return toHexList(scheme);
      case 'rgba':     return toRgbaList(scheme);
      default:         return toHexList(scheme);
    }
  }

  export {
    rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb,
    clampChannel, clampAlpha, parseHex, buildRgba, parseColor, rgbaString, hexString,
    relLuminance, contrastRatio, circularHueDistance,
    ALGORITHMS, ALGO_LABELS, norm360, anchorHues, ANCHOR_OFFSETS,
    MOODS, MOOD_MAP, MOOD_LABELS, MOOD_ANY, SURPRISE_POOL, moodBaseHue, lerpRange,
    ROLES, clamp01, DEFAULT_COUNT, MIN_COUNT, MAX_COUNT, clampCount,
    injectSeeds, pickSeedCount, pickRandomSeeds, generateScheme, roll, makeSeqRng, rollWith,
    hashStringToInt, mulberry32, makeSeededRng,
    CVD_MATRICES, CVD_TYPES, simulateCVD,
    lockKey, applyLocks,
    contrastGrade, contrastLabel, bestForegroundIndex, scorePairs,
    EXPORT_FORMATS, EXPORT_FORMAT_MAP, toCssVars, toScss, toJson, toTailwind,
    toHexList, toRgbaList, exportPalette,
  };
  // ===== END PURE-LOGIC =====
