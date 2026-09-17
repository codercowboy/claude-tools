# color-designer — Implementation Plan

Author: Claude (planner). Implements `DESIGN.md` strictly. Every architectural
decision DESIGN.md leaves open (fill strategy, rng call order, seed-injection
tie-breaking, demo-cycle role assignment, animation constants) is pinned down
concretely below — the worker should not need to re-decide any of it, only
wire up DOM/CSS and fill in visual polish. Cross-reference for canonical
parsing/formatting shape (re-implement, do not import — single-file rule):
`tools/color-converter/DESIGN.md` and its `PLAN.md`.

**v2 revision note:** this plan has been updated for the v2 round —
Seed colors now render above the controls bar; the controls bar is one row
ordered Roll again → harmony select → algorithm-used label → colors-per-scheme
select; the Roll button reads `Roll again` + two `&nbsp;` + 🎲 from initial
load; the color count per scheme (`N`) is now configurable (2–10, default 4,
not a fixed 5) via `generateScheme(algorithm, seeds, count, rng)` /
`roll({ algorithm, seeds, count, rng })`; collapsed swatch strips are
horizontally centered; adding a seed wiggles the Roll button; and the
accordion only auto-expands scheme 0 on the very first (initial-load) roll —
every subsequent re-roll collapses all schemes. Sections below are updated in
place rather than left describing the old (fixed-5, controls-bar-first,
auto-expand-every-roll) behavior.

**v3 revision note:** this plan now also covers the visual seed color picker
(a custom, vanilla HSV saturation/value-square + hue-slider + alpha-slider
popup, driven by Pointer Events) that replaces the plain-text-only seed input
as the primary way to choose a seed color — see the new section 8b. The seed
input stays a fully usable text field; the picker and the text field are kept
in two-way sync. Everything else in this plan (harmony/generation engine,
accordion, scheme detail, N, wiggle) is unchanged from v2.

## 1. Overall file structure

One `index.html`:

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Color Designer</title>
  <style> ... all CSS, incl. fade-in keyframes + reduced-motion overrides ... </style>
</head>
<body>
  <header class="app-header">...title + one-line description...</header>

  <section class="seeds-section" data-testid="seeds-section">
    ...seed input + Add, seed error, seed chip list, Clear seeds...
  </section>

  <section class="controls-bar" data-testid="controls-bar">
    ...Roll again button, harmony select, algorithm-used label,
       colors-per-scheme select, roll-announce (sr live region)...
  </section>

  <section class="schemes-section" data-testid="schemes-section">
    <div class="schemes-list" data-testid="schemes-list">
      ...5x (scheme-row + inline scheme-detail)...
    </div>
  </section>

  <!------ Begin Footer HASH: a97df085179a11175786e1d57d6c2a99 ---->
  <style>...</style>
  <footer class="ct-footer">...</footer>
  <!---- end footer -->

  <script>
    // ===== Begin ctConfirm HASH: 3fe0e7648c094461cf01e8b3e524dbc7 =====
    ... pasted verbatim from tools/include/confirm.js ...
    // ===== end ctConfirm =====
  </script>

  <script type="module">
    // see section 13 for internal organization
  </script>
</body>
</html>
```

**Placement rules:**
- Footer HTML is pasted verbatim (with its sentinels) as static markup, right
  before the two `<script>` tags at the bottom of `<body>` — same spot as
  every other tool.
- `ctConfirm` is pasted verbatim (sentinels included) as a **classic**
  `<script>` (not `type="module"`) immediately before the module script, so
  `window.ctConfirm` exists before any module code that might call it runs.
  Do not modify its contents; if it's ever edited, the HASH must be
  recomputed (not expected for this tool — paste as-is).
- All app logic lives in the single `<script type="module">` at the very end.

### DOM skeleton (key elements — full `data-testid` list in section 13)

```html
<header class="app-header">
  <h1>Color Designer</h1>
  <p class="subtitle">Roll color-theory schemes, optionally seeded with your own colors.</p>
</header>

<section class="seeds-section" data-testid="seeds-section">
  <label for="seedInput">Add a seed color (hex or rgba)</label>
  <div class="seed-add-row">
    <!-- Trigger = swatch + eyedropper — FIRST control in the row (section 8b) -->
    <button type="button" id="seedPickerTrigger" class="seed-picker-trigger" data-testid="seed-picker-trigger"
            aria-label="Pick a color" title="Pick a color" aria-haspopup="dialog" aria-expanded="false">
      <span class="trigger-fill" data-testid="seed-picker-trigger-swatch"></span>
      <span class="trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">...eyedropper path...</svg></span>
    </button>
    <input type="text" id="seedInput" data-testid="seed-input" placeholder="#3366ff or rgba(51,102,255,1)">
    <button type="button" id="seedAddBtn" data-testid="seed-add-btn">Add</button>
  </div>
  <!-- Popup — position: fixed, hidden until openSeedPicker() (section 8b) -->
  <div id="seedPicker" class="seed-picker-popup" data-testid="seed-picker-popup" role="dialog" aria-label="Color picker" hidden>
    <div id="svSquare" class="sv-square" data-testid="seed-picker-sv-square" tabindex="0" role="slider" aria-label="Saturation and value">
      <div id="svThumb" class="sv-thumb" data-testid="seed-picker-sv-thumb"></div>
    </div>
    <div id="hueSlider" class="hue-slider" data-testid="seed-picker-hue-slider" tabindex="0" role="slider" aria-label="Hue">
      <div id="hueThumb" class="hue-thumb" data-testid="seed-picker-hue-thumb"></div>
    </div>
    <div id="alphaSlider" class="alpha-slider" data-testid="seed-picker-alpha-slider" tabindex="0" role="slider" aria-label="Alpha">
      <div id="alphaThumb" class="alpha-thumb" data-testid="seed-picker-alpha-thumb"></div>
    </div>
  </div>
  <p id="seedError" data-testid="seed-error" role="status" aria-live="polite"></p>
  <ul class="seed-list" data-testid="seed-list"></ul>
  <button type="button" id="clearSeedsBtn" data-testid="clear-seeds-btn" hidden>Clear seeds</button>
</section>

<section class="controls-bar" data-testid="controls-bar">
  <!-- Left-to-right: Roll again, harmony select, algorithm-used label, then
       colors-per-scheme at the right end. All in one row, box-top-aligned
       (v4: .controls-bar { align-items: flex-start }) — the Roll button gets
       a spacer label so its box matches the selects' box tops (section 8). -->
  <div class="control roll-control">
    <label class="spacer-label" aria-hidden="true">&nbsp;</label>
    <button type="button" id="rollBtn" class="roll-btn btn-primary" data-testid="roll-btn">Roll again&nbsp;&nbsp;🎲</button>
  </div>
  <div class="control">
    <label for="harmonySelect">Harmony</label>
    <select id="harmonySelect" data-testid="harmony-select">
      <option value="random" selected>Random</option>
      <option value="complementary">Complementary</option>
      <option value="analogous">Analogous</option>
      <option value="triadic">Triadic</option>
      <option value="splitComplementary">Split-complementary</option>
      <option value="tetradic">Tetradic</option>
      <option value="monochromatic">Monochromatic</option>
    </select>
  </div>
  <p id="algorithmUsedLabel" data-testid="algorithm-used-label" aria-hidden="false"></p>
  <div class="control count-control">
    <label for="countSelect">Colors per scheme</label>
    <select id="countSelect" data-testid="count-select">
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4" selected>4</option>
      <option value="5">5</option>
      <option value="6">6</option>
      <option value="7">7</option>
      <option value="8">8</option>
      <option value="9">9</option>
      <option value="10">10</option>
    </select>
  </div>
  <p id="rollAnnounce" data-testid="roll-announce" role="status" aria-live="polite" class="sr-only"></p>
</section>

<section class="schemes-section" data-testid="schemes-section">
  <div class="schemes-list" data-testid="schemes-list"></div>
</section>
```

- **Roll button label** is literal HTML `Roll again&nbsp;&nbsp;🎲` (two
  non-breaking spaces between the text and the dice), set once in the static
  markup — it never changes at runtime (unlike the algorithm-used label),
  including on the very first auto-roll on load. Stays styled as `.roll-btn`
  (purple/primary), and is the tool's **only** Roll button — there is no
  second roll control near the seeds section (superseded by the wiggle nudge,
  section 6.1/8).
- **Colors-per-scheme (`countSelect`)** — a plain `<select>`, options `2`–`10`,
  `4` selected by default. Changing it only updates `state.count`; it takes
  effect on the *next* Roll (same "changing a control doesn't auto-reroll"
  rule as the harmony select).

Seed chip template (built in JS, `renderSeeds()`):

```html
<li class="seed-chip" data-testid="seed-chip" data-id="1">
  <span class="chip-swatch" data-testid="seed-chip-swatch" style="--swatch-color: rgba(51,102,255,1)"></span>
  <span class="chip-label" data-testid="seed-chip-label">#3366ff</span>
  <button type="button" class="chip-remove" data-testid="seed-chip-remove"
          aria-label="Remove seed #3366ff" title="Remove">×</button>
</li>
```

- Adding a seed (`addSeed` succeeding) also calls `triggerRollWiggle()`
  (section 8) — the "Roll again" nudge — every time, regardless of whether
  `addSeed` was invoked from the UI or the test namespace.

Scheme row template (built in JS, `renderSchemes()`) — one per scheme index
`i` (0–4, always 5 schemes per roll), each with `N` swatches (`N` =
`state.count`, 2–10):

```html
<div class="scheme" data-testid="scheme-row" data-index="0">
  <button type="button" class="scheme-header" data-testid="scheme-toggle"
          aria-expanded="true" aria-controls="scheme-detail-0" id="scheme-toggle-0">
    <div class="swatch-strip" data-testid="scheme-swatches">
      <!-- swatch-strip is horizontally centered: .swatch-strip { justify-content: center } -->
      <div class="swatch-mini fade-in-el" data-testid="scheme-swatch" data-color-index="0"
           style="--swatch-color: rgba(...); --i: 0;">
        <span class="swatch-hex" data-testid="scheme-swatch-hex">#rrggbb</span>
      </div>
      <!-- xN total (N = state.count), --i: schemeIndex * N + colorIndex
           (see section 10 for the global stagger index) -->
    </div>
  </button>
  <div class="scheme-detail" data-testid="scheme-detail" id="scheme-detail-0" hidden>
    <!-- see section 9 -->
  </div>
</div>
```

Scheme detail template (rendered only for the expanded scheme; other rows'
`.scheme-detail` stay empty + `hidden` — see section 8 for single-open
accordion semantics):

```html
<div class="scheme-detail" data-testid="scheme-detail" id="scheme-detail-0">
  <div class="demo" data-testid="scheme-demo">
    <div class="demo-main">
      <div class="demo-content">
        <div class="demo-card" data-testid="scheme-demo-card">
          <h3 data-testid="scheme-demo-heading">Sample heading</h3>
          <p data-testid="scheme-demo-paragraph">The quick brown fox jumps over the lazy dog.</p>
          <button type="button" data-testid="scheme-demo-button">Call to action</button>
        </div>
        <!-- v4: one sample line per color (N total), each its own bg+text pairing -->
        <ul class="demo-lines" data-testid="scheme-demo-lines">
          <li class="demo-line" data-testid="scheme-demo-line" style="--line-bg: rgba(...); --line-fg: rgba(...)" data-color-index="0">
            <span>The quick brown fox jumps.</span>
            <span class="demo-line-hex" data-testid="scheme-demo-line-hex">#rrggbb</span>
          </li>
          <!-- xN -->
        </ul>
      </div>
      <!-- v4: swatch column — every color EXCEPT the current background, on the current background -->
      <div class="demo-swatches" data-testid="scheme-demo-swatches" style="--demo-bg: rgba(...)">
        <span class="demo-swatch" data-testid="scheme-demo-swatch" style="--swatch-color: rgba(...)" data-color-index="1"></span>
        <!-- x(N-1) -->
      </div>
    </div>
    <!-- v4: playback controls -->
    <div class="demo-controls" data-testid="scheme-demo-controls">
      <button type="button" class="demo-control-btn" data-testid="scheme-demo-prev" title="Previous" aria-label="Previous pairing">⏮</button>
      <button type="button" class="demo-control-btn" data-testid="scheme-demo-toggle" title="Pause" aria-label="Pause" aria-pressed="true">⏸</button>
      <button type="button" class="demo-control-btn" data-testid="scheme-demo-next" title="Next" aria-label="Next pairing">⏭</button>
    </div>
  </div>
  <ul class="color-rows" data-testid="scheme-color-rows">
    <li class="color-row" data-testid="scheme-color-row" data-color-index="0">
      <span class="swatch" data-testid="scheme-color-swatch" style="--swatch-color: rgba(...)"></span>
      <div class="field">
        <input type="text" readonly data-testid="scheme-color-rgba" aria-label="RGBA value" value="rgba(...)">
        <button type="button" data-testid="scheme-color-rgba-copy" aria-label="Copy RGBA value" title="Copy RGBA value">📋</button>
      </div>
      <div class="field">
        <input type="text" readonly data-testid="scheme-color-hex" aria-label="Hex value" value="#rrggbb">
        <button type="button" data-testid="scheme-color-hex-copy" aria-label="Copy hex value" title="Copy hex value">📋</button>
      </div>
    </li>
    <!-- xN (N = state.count) -->
  </ul>
  <div class="copy-all-section">
    <div class="output-col" data-testid="scheme-rgba-output-col">
      <label>RGBA (one per line)</label>
      <textarea readonly data-testid="scheme-rgba-output"></textarea>
      <button type="button" data-testid="scheme-rgba-copy-all-btn" title="Copy all RGBA (one per line)">Copy all</button>
    </div>
    <div class="output-col" data-testid="scheme-hex-output-col">
      <label>HEX (one per line)</label>
      <textarea readonly data-testid="scheme-hex-output"></textarea>
      <button type="button" data-testid="scheme-hex-copy-all-btn" title="Copy all HEX (one per line)">Copy all</button>
    </div>
  </div>
</div>
```

## 2. State shape

```js
const state = {
  algorithmSelect: 'random',   // current <select> value: 'random' | one of the 6 keys
  count: 4,                    // colors-per-scheme (N), 2-10, default 4 — from countSelect
  seeds: [],                   // [{ id, raw, color: {r,g,b,a} }]
  rollResult: null,            // { algorithm, schemes: Color[5][N] } — null until first roll completes
  expandedIndex: 0,            // index (0-4) of the open scheme, or null if none open
  isInitialLoad: true,         // true only for the render produced by the very first roll (auto-roll on load)
  demo: { schemeIndex: null, intervalId: null, pairingIndex: 0, isPlaying: false }, // live demo state for the open scheme (v4)
};
let nextSeedId = 1;
let hasRolledOnce = false;     // internal flag performRoll() uses to derive isInitialLoad
```

- `state.seeds[i].color` is the parsed `{r,g,b,a}` — the seed chip's canonical
  color, independent of how the user typed it (`raw` keeps the original
  input text for the chip label / re-display, but `color` is what's actually
  used by `generateScheme`).
- `state.count` is set from `countSelectEl`'s `change` handler
  (`clampCount(countSelectEl.value)`) and only takes effect on the next
  `performRoll()` — mirrors the harmony select's "doesn't auto-reroll" rule.
- `state.isInitialLoad` reflects whether the **most recent** `performRoll()`
  was the very first one (auto-roll on load) — `true` for that one render
  only, `false` for every subsequent re-roll. `performRoll()` derives it from
  the module-level `hasRolledOnce` flag (`isInitial = !hasRolledOnce`) so the
  accordion auto-expand rule (section 8) and any test assertion can read it
  straight off `state` without re-deriving anything.
- `state.rollResult` is the single source of truth for everything the
  schemes UI renders (swatch strips, detail panel, both copy-all textareas).
  No separate cached per-scheme output state — `rgbaOutput(i)`/`hexOutput(i)`
  (section 9) always derive fresh from `state.rollResult.schemes[i]`.
- Adding/removing a seed does **not** auto-reroll — it only changes what the
  *next* Roll click will mix in. This matches the "roll on demand" model and
  avoids surprising the user by silently reshuffling colors they're currently
  looking at while they're still composing their seed list.

## 3. Pure color math

All of this lives in one no-DOM section near the top of the module script,
in this order (later sections depend on earlier ones):

### 3.1 `rgbToHsl({r,g,b}) -> {h,s,l}`

`h` in degrees `[0, 360)`, `s`/`l` in `[0, 1]`.

```js
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
```

### 3.2 `hslToRgb({h,s,l}) -> {r,g,b}` (ints 0–255; caller adds `a`)

```js
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
```

### 3.3 `parseColor(str) -> {r,g,b,a} | null`

Identical shape/behavior to `color-converter`'s `parseColor` (re-implemented
here, not imported). Trim first; empty → `null`. Case-insensitive, whole
trimmed string must match (anchored).

```js
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COMMA_RE =
  /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i;
const RGB_SLASH_RE =
  /^rgba?\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*\)$/i;

function clampChannel(n) { return Math.round(Math.min(255, Math.max(0, n))); }
function clampAlpha(n) { return Math.min(1, Math.max(0, n)); }

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
```

No named CSS colors, no `hsl()`, no percentage channels — out of scope, same
as `color-converter`.

### 3.4 `rgbaString` / `hexString` (canonical, matching siblings exactly)

```js
function rgbaString({ r, g, b, a }) {
  const alpha = Number.isInteger(a) ? a : Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexString({ r, g, b, a }) {
  const h = (n) => n.toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a < 1 ? `${base}${h(Math.round(a * 255))}` : base;
}
```

### 3.5 Relative luminance + contrast ratio (for demo text color)

Standard WCAG formulas:

```js
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
```

### 3.6 Circular hue distance (for seed injection, section 6)

```js
function circularHueDistance(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}
```

## 4. Harmony algorithms & anchor hues

Six algorithm keys, in the exact `<select>` order (Random is a UI-only mode,
not itself an anchor function):

```js
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

function anchorHues(key, H) {
  switch (key) {
    case 'complementary':      return [H, H + 180].map(norm360);
    case 'analogous':          return [H - 30, H, H + 30].map(norm360);
    case 'triadic':            return [H, H + 120, H + 240].map(norm360);
    case 'splitComplementary': return [H, H + 150, H + 210].map(norm360);
    case 'tetradic':           return [H, H + 90, H + 180, H + 270].map(norm360);
    case 'monochromatic':      return [H].map(norm360);
    default: throw new Error(`unknown algorithm: ${key}`);
  }
}
```

This exactly matches DESIGN.md's table (anchor counts: complementary=2,
analogous=3, triadic=3, splitComplementary=3, tetradic=4, monochromatic=1).
`anchorHues` is pure and exposed on the test namespace so anchor-hue math is
directly assertable per algorithm.

## 5. Fill strategy: anchors → exactly N colors (N configurable, 2–10)

**The concrete, deterministic rule** (generalizes DESIGN.md's triadic
example — "3 anchors → 3 anchor colors + 2 tint/shade variants" — uniformly
to every algorithm regardless of anchor count, and to every `N` in 2–10):

- There are `N` slots, indices `0..N-1`, where `N = clampCount(count)` (round,
  then clamp to `[2, 10]`; `undefined`/non-finite → default `4`).
- Slot `i`'s **anchor hue** is `anchors[i % anchors.length]` — anchors cycle
  round-robin across the `N` slots. (1 anchor → all `N` slots reuse it, varied
  only by role; 2 anchors → roughly half/half; 3 anchors → cycles through 3
  repeatedly for larger `N`; etc. — same round-robin rule as the original
  fixed-5 case, just generalized to any `N`.)
- Slot `i`'s **role** is `ROLES[i % ROLES.length]` — cycled round-robin **the
  same way anchors are**, from the same fixed 5-entry roles table used in v1
  (unchanged, still exactly 5 roles regardless of `N`):

```js
const ROLES = [
  { name: 'shade', dL: -0.28, dS: +0.05 },  // dark shade
  { name: 'base',  dL:  0,    dS:  0    },  // anchor as generated (mid)
  { name: 'tint',  dL: +0.28, dS: -0.08 },  // light tint
  { name: 'vivid', dL: -0.06, dS: +0.20 },  // vivid, slightly darker+saturated
  { name: 'muted', dL: +0.10, dS: -0.30 },  // muted, near-neutral
];

const DEFAULT_COUNT = 4;
const MIN_COUNT = 2;
const MAX_COUNT = 10;
function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, v));
}

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
```

- Slot `i`'s final `{h,s,l}` = `{ h: anchors[i % anchors.length], s:
  clamp01(baseS + ROLES[i % ROLES.length].dS), l: clamp01(baseL +
  ROLES[i % ROLES.length].dL) }`, converted via `hslToRgb`, with `a: 1`
  (generated colors are always opaque; only a seed injected later, section 6,
  can bring alpha `< 1`).
- `baseS`/`baseL` come from step 1 of `generateScheme` (section 7) — drawn
  once per scheme, shared by all `N` slots before role deltas are applied.
- This is a **minimal, deliberate generalization**: instead of a fixed 5-slot
  array, both the anchor cycle and the role cycle are indexed `i % length`
  the same way — so at `N=5` this is byte-identical to the v1 rule (the
  worked example below still holds), and at any other `N` in 2–10 the same
  round-robin math just runs for more or fewer slots. No new role table or
  interpolation formula was introduced.

Worked example (triadic, `H=200`, so `anchors = [200, 320, 80]`, `N=5`):
slot0 = hue200/shade, slot1 = hue320/base, slot2 = hue80/tint, slot3 =
hue200/vivid (2nd variant of anchor0), slot4 = hue320/muted (2nd variant of
anchor1) — 3 distinct anchor hues + 2 extra role-variants, exactly matching
DESIGN.md's description. At `N=4` (the new default), slot3 (`vivid`) is
dropped: slot0=hue200/shade, slot1=hue320/base, slot2=hue80/tint,
slot3=hue200/vivid — 3 anchor hues, one repeated with a different role. At
`N=10`, both the anchor cycle (`i % 3`) and the role cycle (`i % 5`) wrap
around twice.

## 6. Seed handling

### 6.1 Add / parse / remove / clear

```js
function addSeed(str) {
  const color = parseColor(str);
  if (!color) return null; // caller shows the inline error, input is left untouched
  const seed = { id: nextSeedId++, raw: String(str).trim(), color };
  state.seeds.push(seed);
  renderSeeds();
  return seed;
}

function removeSeed(id) {
  state.seeds = state.seeds.filter((s) => s.id !== id);
  renderSeeds();
}

function clearSeedsDirect() {
  state.seeds = [];
  renderSeeds();
}
```

- **Add button / Enter in the seed input** calls `addSeed(seedInputEl.value)`.
  On success: clear the input, clear `seedError`, then call
  `seedInputEl.blur()` — a successful commit dismisses the mobile on-screen
  keyboard per `docs/conventions.md` § Responsive & mobile (there's no
  dedicated dismiss API; the keyboard follows focus). On failure (`null`):
  set `seedError.textContent = "Not a valid color — use hex (#3366ff) or
  rgba(51,102,255,1)."`, leave the input's text untouched, and call
  `seedInputEl.focus()` so the user can fix it without the keyboard
  disappearing. `seedError` is a static `role="status" aria-live="polite"`
  paragraph (like `parseSummary` in `color-converter`), text cleared on the
  next successful add.
- **Per-chip remove (×)** calls `removeSeed(id)` **directly, no modal** — per
  DESIGN.md, low-stakes single-item removal.
- **Clear seeds** (visible only when `state.seeds.length > 0`, toggled in
  `renderSeeds()`) is the one **destructive bulk** action here, guarded by
  `ctConfirm`:

```js
clearSeedsBtn.addEventListener('click', async () => {
  if (await ctConfirm('Clear all seed colors?')) clearSeedsDirect();
});
```

  `clearSeedsDirect()` itself stays a direct, non-modal function (exposed on
  the test namespace as `clearSeeds`), matching the `removeAllRows` pattern
  in `color-converter`.

### 6.2 Injecting seeds into a generated scheme (nearest-hue slot)

Given the `N` generated colors for a scheme and a list of `k` chosen seed
colors (section 7 decides `k` and which seeds — bounded by both the seed-pool
size and `N`), inject each seed into the
generated color whose hue is circularly nearest — **excluding slots already
claimed by an earlier seed in this same injection pass**, so `k` seeds always
land in `k` distinct slots (this is the concrete tie/collision rule
DESIGN.md leaves open):

```js
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
```

- On a hue tie (e.g. monochromatic schemes, where all `N` generated colors
  share the same anchor hue), the first eligible slot in array order
  (`0..N-1`) wins — deterministic, and for monochromatic this means multiple
  seeds fill slots `0, 1, 2, ...` in order.
- Because `used` excludes already-claimed slots, `k` seeds always produce
  exactly `k` distinct injected colors in the final `N` — this is what makes
  "a scheme uses 1–3 seeds when seeds exist" directly assertable in tests
  (count how many of the `N` final colors exactly equal one of the chosen
  seed colors).

## 7. `generateScheme` / `roll` — pure, rng-injectable

### 7.1 `generateScheme(algorithm, seeds, count, rng) -> Color[N]`

`seeds` here is a plain array of `{r,g,b,a}` (already-parsed seed colors, not
the chip objects). `count` is the requested colors-per-scheme (clamped to
2–10 inside the function via `clampCount`, section 5; `undefined` defaults to
4). `rng` is a function: each call `rng()` returns a float in `[0, 1)`.
**Exact, ordered steps** (the call order matters for `rollWith`/`rngSeq`
determinism — document/preserve this order exactly):

```js
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

function generateScheme(algorithm, seeds, count, rng) {
  const N = clampCount(count);

  // 1. base hue + base S/L
  const useSeedBase = seeds.length > 0 && rng() < 0.5;
  let H;
  if (useSeedBase) {
    const idx = Math.floor(rng() * seeds.length);
    H = rgbToHsl(seeds[idx]).h;
  } else {
    H = rng() * 360;
  }
  const baseS = 0.55 + rng() * 0.35; // [0.55, 0.90)
  const baseL = 0.45 + rng() * 0.15; // [0.45, 0.60)

  // 2. anchor hues
  const anchors = anchorHues(algorithm, H);

  // 3. fill N slots (section 5) — anchors AND roles both cycle round-robin
  const colors = Array.from({ length: N }, (_, i) => {
    const hue = anchors[i % anchors.length];
    const role = ROLES[i % ROLES.length];
    const { r, g, b } = hslToRgb({ h: hue, s: clamp01(baseS + role.dS), l: clamp01(baseL + role.dL) });
    return { r, g, b, a: 1 };
  });

  // 4. seed injection
  const k = pickSeedCount(seeds.length, N, rng);
  const chosen = pickRandomSeeds(seeds, k, rng);
  return injectSeeds(colors, chosen);
}
```

Rng call order per `generateScheme` call is **unchanged from v1** —
`clampCount(count)` is a pure computation on the `count` argument, it never
calls `rng()`: `[useSeedBase decision]`, then `[seed index]` **only if**
`useSeedBase` was true, then `baseS`, then `baseL`, then `pickSeedCount`'s one
call, then `pickRandomSeeds`'s `k` calls (0 when there are no seeds). This is
fully deterministic given a fixed `rng` sequence *and* a fixed `count`, and
documented here so the worker doesn't reorder anything and
`rollWith`/`rngSeq`-based tests get reproducible exact colors for any `N`.

### 7.2 `roll({ algorithm, seeds, count, rng }) -> { algorithm, schemes }`

```js
function roll({ algorithm, seeds, count, rng }) {
  const resolved = algorithm === 'random'
    ? ALGORITHMS[Math.floor(rng() * ALGORITHMS.length)].key
    : algorithm;
  const schemes = [0, 1, 2, 3, 4].map(() => generateScheme(resolved, seeds, count, rng));
  return { algorithm: resolved, schemes };
}
```

`count` is passed straight through to every `generateScheme` call — `roll()`
itself doesn't clamp it (that's `generateScheme`'s job via `clampCount`), so
all 5 schemes in one roll always share the exact same (clamped) `N`.

**THE KEY RULE:** when `algorithm === 'random'`, `rng()` is called **once**,
up front, to pick a single concrete algorithm key — then all 5
`generateScheme` calls use that same `resolved` key (only base hue / seed mix
differ, since each call draws its own fresh values from the *same* rng
stream that continues from where the algorithm pick left off). A specific
(non-`'random'`) selection skips that pick entirely and every scheme uses it
directly. `roll()`'s returned `algorithm` is always a concrete key (never
`'random'` itself) — this is what the UI's algorithm-used label and the
`aria-live` roll announcement display.

### 7.3 Default rng + deterministic test entry points

```js
function cryptoRng() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296; // 2^32
}

function makeSeqRng(seq) {
  let i = 0;
  return () => { const v = seq[i % seq.length]; i++; return v; };
}

function rollWith({ algorithm, seeds, count, rngSeq }) {
  return roll({ algorithm, seeds, count, rng: makeSeqRng(rngSeq) });
}
```

- Production code calls `roll({ algorithm: state.algorithmSelect, seeds:
  state.seeds.map((s) => s.color), count: state.count, rng: cryptoRng })`.
- Tests use `rollWith({ algorithm, seeds, count, rngSeq })` (or `makeSeqRng`
  directly with `generateScheme`/`roll`) to get fully reproducible exact
  colors and to assert the Random-mode "all 5 schemes share one algorithm"
  rule and arbitrary `count` deterministically (e.g. a crafted `rngSeq` whose
  first value selects a known algorithm index).
- Both `cryptoRng` and `makeSeqRng` are exposed on the test namespace
  (section 13), as is `clampCount`.

## 8. Layout & accordion behavior

- **Section order (top to bottom): Header → Seed colors → Controls bar →
  Schemes accordion → Footer.** Seed colors moved above the controls bar in
  v2 (was: controls bar, then seeds) — see the DOM skeleton in section 1.
- **Controls bar**, one row, left→right: the **"Roll again" button**, the
  harmony `<select>` (defaults to `random`), the **algorithm-used label**,
  then the **colors-per-scheme `<select>`** (right end), plus a
  visually-hidden `aria-live` roll announcement anywhere in the row (order
  irrelevant, it's `sr-only`). `.controls-bar { display: flex; align-items:
  flex-start; flex-wrap: wrap; gap: ... }` — **v4 change:** `align-items`
  moved from `center` to `flex-start` so every control's *box* top-aligns
  (see "Alignment" below); `.algo-badge` opts back into vertical centering
  via `align-self: center` since it isn't a form control and doesn't need to
  align with the select/button boxes. Lets everything wrap on narrow
  screens. Changing either `<select>` only updates `state.algorithmSelect` /
  `state.count` — neither **auto-rerolls**; the user clicks Roll to see
  either take effect (keeps rolls an explicit, deliberate action, and
  matches "auto-roll on load" being the *only* automatic roll).
- **Roll button**: static HTML `Roll again&nbsp;&nbsp;🎲` (two literal
  `&nbsp;` between the text and the dice) — this is its label from the very
  first render (before any click), since the page auto-rolls on load, so
  there's no separate "Roll" vs. "Roll again" wording to switch between.
  Stays styled `.roll-btn.btn-primary` (purple/primary — `.btn-primary` is
  new in v4, see "Purple primary button hover" below). It is the **only**
  roll control in the tool.
- **Purple primary button hover (v4 fix)**: the old `.roll-btn:hover`
  (`filter: brightness(1.08)`) was harmless on its own, but the *base*
  `button:hover:not(:disabled) { background: #f1ecfc; }` rule has higher
  specificity than `.roll-btn { background: var(--accent); ... }` (a plain
  class vs. an element+pseudo-class selector), so on hover the button's fill
  silently fell back to that near-white `background: #f1ecfc` while its text
  stayed `var(--accent-contrast)` (white) — white-on-white, an invisible
  label. Fixed by giving purple primary buttons their own class,
  `.btn-primary`, with a same-specificity-family hover override that
  **inverts** rather than fades:

```css
.btn-primary { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: #fff; color: var(--accent); border-color: var(--accent); }
```

  `.btn-primary:hover:not(:disabled)` has 3 class-level selectors vs. the
  base rule's 2, so it always wins regardless of source order. The border
  stays purple in both states; only fill and text swap. Reusable for any
  future purple primary button — not tied to `#rollBtn` specifically.
- **Alignment via spacer label (v4)**: the harmony `<select>` and
  colors-per-scheme `<select>` each sit in a `.control` (`display: flex;
  flex-direction: column;`) under a real, visible `<label>`, which pushes
  their *box* down by one label-line-height + gap relative to a label-less
  control at the same flex row position. The Roll button is label-less, so
  under the new `align-items: flex-start` it would sit noticeably higher
  than the selects. Fixed with a **spacer label** — an empty-but-non-empty
  (`&nbsp;`) label above it, Bootstrap-5-style, wrapped in its own
  `.control.roll-control`:

```html
<div class="control roll-control">
  <label class="spacer-label" aria-hidden="true">&nbsp;</label>
  <button type="button" id="rollBtn" class="roll-btn btn-primary" data-testid="roll-btn">Roll again&nbsp;&nbsp;🎲</button>
</div>
```

  The `&nbsp;` gives the label the same line-height as a real label (so the
  button's box top matches the select's box top) while rendering as blank
  space; `aria-hidden="true"` keeps it out of the accessibility tree so
  assistive tech never announces an empty label. Any other label-less
  control added to this row later should get the same treatment.
- **Wiggle nudge**: every time `addSeed()` succeeds (UI Add button/Enter, or
  the test namespace calling it directly), it calls `triggerRollWiggle()`:

```js
let wiggleTimeoutId = null;
function triggerRollWiggle() {
  rollBtn.classList.remove('wiggle');
  void rollBtn.offsetWidth; // force reflow so the animation restarts if already mid-wiggle
  rollBtn.classList.add('wiggle');
  clearTimeout(wiggleTimeoutId);
  wiggleTimeoutId = setTimeout(() => rollBtn.classList.remove('wiggle'), 500);
}
```

  CSS: a short (~420ms) rotate keyframe on `.roll-btn.wiggle`, neutralized
  under `prefers-reduced-motion: reduce` (the class is still applied/removed
  either way — reduced motion only removes the *visual* animation via CSS,
  so `classList.contains('wiggle')` stays assertable in tests regardless of
  the motion preference). This **replaces** the earlier idea of a second
  "Roll again" button placed next to Clear seeds — there is exactly one Roll
  button in the tool (see above).
- **`performRoll()`** — the single function wired to the Roll button and to
  the initial auto-roll:

```js
function performRoll() {
  const isInitial = !hasRolledOnce;
  hasRolledOnce = true;

  const seedColors = state.seeds.map((s) => s.color);
  const result = roll({ algorithm: state.algorithmSelect, seeds: seedColors, count: state.count, rng: cryptoRng });
  state.rollResult = result;
  state.isInitialLoad = isInitial;
  // Initial load: first scheme auto-expands. Every subsequent re-roll: all
  // schemes collapse (none auto-open) so the user picks which to open.
  state.expandedIndex = isInitial ? 0 : null;
  renderSchemes();          // full rebuild of .schemes-list, incl. fade-in (section 10)
  algorithmUsedLabelEl.textContent = ALGO_LABELS[result.algorithm];
  rollAnnounceEl.textContent = `New palette — ${ALGO_LABELS[result.algorithm]}`;
  if (isInitial) {
    startDemoCycle(0);
  } else {
    stopDemoCycle(); // nothing is open after a re-roll, so no demo runs until the user opens one
  }
}
rollBtn.addEventListener('click', performRoll);
harmonySelectEl.addEventListener('change', () => { state.algorithmSelect = harmonySelectEl.value; });
countSelectEl.addEventListener('change', () => { state.count = clampCount(countSelectEl.value); });
window.addEventListener('DOMContentLoaded', performRoll); // auto-roll on load, zero seeds is fine
```

  **v2 change from v1:** v1 reset `expandedIndex` to `0` on *every* roll,
  including re-rolls. v2 changes this per the updated DESIGN.md: only the
  render produced by the very **first** `performRoll()` call (the auto-roll
  on load, `isInitial === true`) auto-expands scheme 0; every subsequent
  re-roll (Roll button click) sets `expandedIndex = null` so **all** schemes
  render collapsed and the user explicitly picks which one to open.
  `hasRolledOnce` (module-level) is what distinguishes "this is the first
  roll" from "this is a re-roll" — `state.isInitialLoad` exposes the same
  boolean on the live state for tests/inspection (section 2).

- **Accordion single-open**: clicking a `scheme-toggle` button:
  - if its index `!== state.expandedIndex`: set `state.expandedIndex` to
    that index, collapse whatever was open.
  - if its index `=== state.expandedIndex` (clicking the already-open one):
    collapse it, `state.expandedIndex = null`. (Zero-open is a valid state
    of "at most one open"; this is standard accordion UX and doesn't violate
    "single-open". Zero-open is also the state immediately after every
    re-roll, per above.)
  - Re-render: only the two affected `.scheme-detail` panels need their
    content/`hidden` attribute and their toggle's `aria-expanded` updated
    (no need to rebuild the swatch strips) — implement as
    `setExpanded(index)` that closes the previous panel and opens the new
    one, building the newly-opened panel's detail DOM on demand (see
    section 9) and tearing down (clearing textContent, stopping the demo
    interval) the previously-open one.
  - `aria-expanded` on each `scheme-toggle` reflects `state.expandedIndex`;
    `aria-controls` points at that scheme's `scheme-detail-{i}` id.
- **Swatch strip** (collapsed row): `N` `.swatch-mini` (~50×50, `border-radius`
  to taste) each with `--swatch-color: rgba(...)` and a hex string beneath
  (`.swatch-hex`, `data-testid="scheme-swatch-hex"`). `.swatch-strip {
  display: flex; flex-wrap: wrap; justify-content: center; gap: ... }` —
  **centered** horizontally within the row (v2 addition), and still wraps
  rather than overflowing the page on narrow screens at any `N` up to 10.

## 8b. Seed color picker (visual HSV) — trigger + popup, two-way synced

Everything here is new in v3. See the DOM skeleton in section 1 for the
trigger button (`seedPickerTrigger`) and popup (`seedPicker`) markup, and
section 13 for the `data-testid`/`window.__colorDesigner` surface.

### 8b.1 `rgbToHsv` / `hsvToRgb` (HSV — distinct from the HSL pair in section 3)

```js
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
```

Both are pure (no DOM), placed in the script alongside `rgbToHsl`/`hslToRgb`
(section 3) even though they're only consumed by the picker.

### 8b.2 State + defaults

`state.seedPicker = { open: false, h: 180, s: 1, v: 1, a: 1 }` (added to the
main `state` object, section 2) — the live H/S/V/A + open flag, and the
test-namespace readback (no separate getter needed, same pattern as
`state.demo`).

`DEFAULT_PICKER_HSVA = { h: 180, s: 1, v: 1, a: 1 }` — mid hue, full
saturation/value, opaque — used whenever the text input is empty/invalid at
open time.

### 8b.3 Trigger swatch (live-parsed from the text input)

```js
function updateTriggerSwatch() {
  const color = parseColor(seedInputEl.value);
  seedPickerTriggerSwatchEl.style.setProperty('--trigger-color', color ? rgbaString(color) : 'transparent');
}
seedInputEl.addEventListener('input', updateTriggerSwatch);
updateTriggerSwatch(); // initial paint
```

The trigger button (`.seed-picker-trigger`) carries a checkerboard
`background-image` itself; its child `.trigger-fill` span paints
`background-color: var(--trigger-color, transparent)` on top — empty/invalid
text leaves the variable unset, falling back to `transparent`, so the
checkerboard shows through (the neutral/empty state). `updateTriggerSwatch()`
is also called explicitly after any programmatic write to the input
(`handleAddSeed`'s success path, `writeSeedPickerToInput()` below) since
setting `.value` doesn't fire an `input` event.

### 8b.4 Rendering the popup from state

```js
function renderSeedPicker() {
  const { h, s, v, a } = state.seedPicker;
  const rgb = hsvToRgb({ h, s, v });

  svSquareEl.style.setProperty('--picker-hue-color', `hsl(${h}, 100%, 50%)`);
  svThumbEl.style.left = `${s * 100}%`;
  svThumbEl.style.top = `${(1 - v) * 100}%`;

  hueThumbEl.style.left = `${(h / 360) * 100}%`;

  alphaSliderEl.style.setProperty('--picker-alpha-from', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
  alphaSliderEl.style.setProperty('--picker-alpha-to', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
  alphaThumbEl.style.left = `${a * 100}%`;
}
```

CSS backgrounds (fixed, not JS-driven, except the two custom properties
above):
- `.sv-square { background-image: linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, var(--picker-hue-color)); }`
  — white→hue horizontal, transparent→black vertical, per DESIGN.md.
- `.hue-slider { background-image: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }` — a fixed 7-stop rainbow, never recomputed.
- `.alpha-slider { background-image: linear-gradient(to right, var(--picker-alpha-from), var(--picker-alpha-to)), <checkerboard layers>; }` — current-opaque-color→transparent over a checkerboard.

### 8b.5 Central write path: `setSeedPickerHSVA` + `writeSeedPickerToInput`

Every interaction (drag, keyboard nudge, and the `window.__colorDesigner`
hook) funnels through **one** function so there is exactly one place that
updates state, re-renders, and syncs the text input:

```js
function snapAlpha(a) {
  let v = clamp01(a);
  v = Math.round(v * 100) / 100; // keep rgba() output tidy
  if (v > 0.995) v = 1;
  if (v < 0.005) v = 0;
  return v;
}

function writeSeedPickerToInput() {
  const rgb = hsvToRgb(state.seedPicker);
  const color = { r: rgb.r, g: rgb.g, b: rgb.b, a: state.seedPicker.a };
  seedInputEl.value = state.seedPicker.a >= 1 ? hexString(color) : rgbaString(color);
  seedErrorEl.textContent = '';
  updateTriggerSwatch();
}

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
```

This reuses the tool's canonical `hexString`/`rgbaString` (section 3) — the
picker is never a second source of truth for color formatting. `norm360`/
`clamp01` are the existing helpers from sections 4–5.

### 8b.6 Opening: re-parse the input every time

```js
function initSeedPickerFromInput() {
  const color = parseColor(seedInputEl.value);
  const hsva = color ? { ...rgbToHsv(color), a: color.a } : DEFAULT_PICKER_HSVA;
  state.seedPicker.h = hsva.h; state.seedPicker.s = hsva.s;
  state.seedPicker.v = hsva.v; state.seedPicker.a = hsva.a;
}
```

`openSeedPicker()` calls this, then `renderSeedPicker()`, unhides the popup,
sets `aria-expanded="true"` on the trigger, positions the popup (8b.7), moves
focus into the sv-square, and registers the close listeners (8b.8).
`closeSeedPicker()` reverses all of it and returns focus to the trigger.
Both are idempotent (`open` guards re-entry) and are the exact functions
wired to the trigger's click handler AND exposed on the test namespace — same
"one function, both paths" pattern as `performRoll`/`clearSeedsDirect`
elsewhere in this tool.

### 8b.7 Positioning (viewport-clamped, flips above when needed)

```js
function clampPopupPosition(rect, popupW, popupH) {
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  if (left < 8) left = 8;
  if (top + popupH > window.innerHeight - 8) {
    const above = rect.top - popupH - 6;
    top = above < 8 ? 8 : above;
  }
  return { left, top };
}
```

The popup is `position: fixed`, 260px wide (`max-width: calc(100vw -
1.5rem)` so it still fits a ~360px screen), so viewport coordinates from
`getBoundingClientRect()` can be used directly without adding scroll
offsets.

### 8b.8 Closing: Esc, click-outside, resize/scroll

While open, three listeners are registered (and removed on close):
- `document` `pointerdown` (capture phase) — closes unless the target is
  inside the popup or the trigger.
- `document` `keydown` (capture phase) — `Escape` closes.
- `window` `scroll` (capture phase) and `resize` — close the popup rather
  than trying to keep a `position: fixed` popup glued to a trigger that may
  have moved (a deliberate simplification: reopening is one click).

### 8b.9 Dragging: shared Pointer Events wiring + arrow-key nudging

```js
function attachPickerDrag(el, onFraction) {
  let pointerId = null;
  function fractionFromEvent(e) {
    const rect = el.getBoundingClientRect();
    const x = rect.width ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0;
    const y = rect.height ? Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) : 0;
    return { x, y };
  }
  // pointerdown: setPointerCapture + apply the starting position immediately;
  // pointermove/pointerup (added only while dragging) track/finish the drag.
}
attachPickerDrag(svSquareEl, ({ x, y }) => setSeedPickerHSVA({ s: x, v: 1 - y }));
attachPickerDrag(hueSliderEl, ({ x }) => setSeedPickerHSVA({ h: x * 360 }));
attachPickerDrag(alphaSliderEl, ({ x }) => setSeedPickerHSVA({ a: x }));
```

One Pointer Events listener factory covers mouse and touch identically (no
`touchstart`/`mousedown` branching) — this is what satisfies "Pointer Events
(mouse + touch)" from DESIGN.md. `touch-action: none` on all three draggable
elements (CSS) prevents the browser from also scrolling the page during a
touch drag.

Arrow-key nudging (each control's own `keydown` listener, only while
focused): sv-square ArrowLeft/Right adjust `s`, ArrowUp/Down adjust `v` (±0.02,
Shift → ±0.1); hue slider ArrowLeft/Down and ArrowRight/Up adjust `h` (±1°,
Shift → ±10°); alpha slider ArrowLeft/Down and ArrowRight/Up adjust `a`
(±0.01, Shift → ±0.1). All calls funnel through `setSeedPickerHSVA`, so
keyboard and pointer paths stay identical past that point.

## 9. Scheme detail panel

Built into a scheme's `.scheme-detail` element only while it is the expanded
one (see section 8); torn down (interval cleared, `innerHTML = ''`, `hidden
= true`) when it collapses.

### 9.1 Live demo (v4: all-N sample lines + swatch column + playback controls)

**v4 change from v3:** the old demo only ever showed 4 colors at once (the
hero card's bg/fg/accent-bg/accent-fg). v4 adds a full-palette view — one
sample line per color (`N` lines total) plus a swatch column of the
non-background colors — and replaces the fixed always-on 2.5s auto-cycle
with a slower, user-controllable one (play/pause + prev/next).

Given `scheme = state.rollResult.schemes[i]` (array of `N` `Color`, `N =
state.count`) and a `pairingIndex` (the current pairing, `0..N-1`,
replacing v3's unbounded `cycleStep`):

```js
const DEMO_CYCLE_MS = 7500; // ~1/3 the old 2500ms cadence (DESIGN.md: ~7-8s)

function normIndex(i, N) { return ((i % N) + N) % N; }

function bestContrastIndex(scheme, bgIndex) {
  let best = -1, bestRatio = -1;
  scheme.forEach((c, j) => {
    if (j === bgIndex) return;
    const ratio = contrastRatio(scheme[bgIndex], c);
    if (ratio > bestRatio) { bestRatio = ratio; best = j; }
  });
  return best;
}

function renderDemo(detailEl, scheme, pairingIndex) {
  const N = scheme.length;
  const bgIndex = normIndex(pairingIndex, N);
  const textIndex = bestContrastIndex(scheme, bgIndex);
  const accentIndex = (bgIndex + Math.min(2, N - 1)) % N;
  const accentTextIndex = bestContrastIndex(scheme, accentIndex);

  // Hero card — unchanged from v3, still the primary pairing.
  const card = detailEl.querySelector('[data-testid="scheme-demo-card"]');
  card.style.setProperty('--demo-bg', rgbaString(scheme[bgIndex]));
  card.style.setProperty('--demo-fg', rgbaString(scheme[textIndex]));
  card.style.setProperty('--demo-accent-bg', rgbaString(scheme[accentIndex]));
  card.style.setProperty('--demo-accent-fg', rgbaString(scheme[accentTextIndex]));

  // Sample lines (new in v4) — ALL N colors, each as its own background with
  // its own best-contrast text, rotated so the current pairing leads.
  const lineEls = detailEl.querySelectorAll('[data-testid="scheme-demo-line"]');
  for (let k = 0; k < N; k++) {
    const idx = (bgIndex + k) % N;
    const fgIdx = bestContrastIndex(scheme, idx);
    lineEls[k].style.setProperty('--line-bg', rgbaString(scheme[idx]));
    lineEls[k].style.setProperty('--line-fg', rgbaString(scheme[fgIdx]));
    lineEls[k].dataset.colorIndex = String(idx);
    lineEls[k].querySelector('[data-testid="scheme-demo-line-hex"]').textContent = hexString(scheme[idx]);
  }

  // Swatch column (new in v4) — every color EXCEPT the current background,
  // painted against the current background (--demo-bg on the column itself).
  const swatchCol = detailEl.querySelector('[data-testid="scheme-demo-swatches"]');
  swatchCol.style.setProperty('--demo-bg', rgbaString(scheme[bgIndex]));
  const swatchEls = swatchCol.querySelectorAll('[data-testid="scheme-demo-swatch"]');
  let si = 0;
  for (let idx = 0; idx < N; idx++) {
    if (idx === bgIndex) continue;
    swatchEls[si].style.setProperty('--swatch-color', rgbaString(scheme[idx]));
    swatchEls[si].dataset.colorIndex = String(idx);
    si += 1;
  }
}
```

- `N` sample-line elements and `N-1` swatch elements are built once (in
  `buildDetailContent`, section 9) when the panel opens; `renderDemo` only
  updates their CSS custom properties/`dataset.colorIndex` on every step —
  this keeps the crossfade transition working (elements aren't recreated)
  and keeps counts stable regardless of `pairingIndex`.
- `accentIndex`'s offset is `Math.min(2, N - 1)` rather than a flat `2` so
  it stays a valid distinct index even at `N = 2`.

CSS: `.demo-card`, `.demo-line`, and `.demo-swatches`/`.demo-swatch` all
`transition: background-color 600ms ease, color 600ms ease` (or just
`background-color` for the swatches) — this transition is what produces the
"crossfade" (no JS animation needed, just a CSS-transitioned custom-property
swap). `.demo-main { display: flex; gap: ...; }` lays the sample-lines
column and the swatch column side by side, stacking under `.demo-main {
flex-direction: column; }` at `max-width: 600px` (the swatch column becomes
a horizontal row of small chips).

**Cycling (v4: pauseable, steppable)**: only the currently-expanded scheme's
demo runs a timer (there's only ever one expanded panel, by construction).
`state.demo.isPlaying` tracks whether the interval is currently running;
`playDemoCycle`/`pauseDemoCycle`/`toggleDemoPlayback` control it, and
`stepDemo(delta)` (wrapped as `demoNext`/`demoPrev`) advances/rewinds
`pairingIndex` and re-renders — used by both the auto-cycle interval and the
prev/next buttons, so manual stepping and auto-cycling share one code path:

```js
function stepDemo(delta) {
  const detailEl = getDetailEl(state.demo.schemeIndex);
  const scheme = state.rollResult.schemes[state.demo.schemeIndex];
  state.demo.pairingIndex = normIndex(state.demo.pairingIndex + delta, scheme.length);
  renderDemo(detailEl, scheme, state.demo.pairingIndex);
}
function demoNext() { stepDemo(1); }
function demoPrev() { stepDemo(-1); }

function playDemoCycle() {
  if (state.demo.intervalId) return; // already running
  state.demo.isPlaying = true;
  state.demo.intervalId = setInterval(() => stepDemo(1), DEMO_CYCLE_MS);
  updateDemoToggleUI(getDetailEl(state.demo.schemeIndex));
}

function pauseDemoCycle() {
  if (state.demo.intervalId) { clearInterval(state.demo.intervalId); state.demo.intervalId = null; }
  state.demo.isPlaying = false;
  updateDemoToggleUI(getDetailEl(state.demo.schemeIndex));
}

function toggleDemoPlayback() {
  if (state.demo.isPlaying) pauseDemoCycle(); else playDemoCycle();
}

function startDemoCycle(index) {
  stopDemoCycle();
  const detailEl = getDetailEl(index);
  const scheme = state.rollResult.schemes[index];
  state.demo = { schemeIndex: index, intervalId: null, pairingIndex: 0, isPlaying: false };
  renderDemo(detailEl, scheme, 0);
  updateDemoToggleUI(detailEl);
  if (prefersReducedMotion()) return; // v4: start paused, no auto-cycle — prev/next still work
  playDemoCycle();
}

function stopDemoCycle() {
  if (state.demo.intervalId) clearInterval(state.demo.intervalId);
  state.demo = { schemeIndex: null, intervalId: null, pairingIndex: 0, isPlaying: false };
}
```

- `demoNext`/`demoPrev`/`stepDemo` work regardless of play/pause state or
  `prefersReducedMotion()` — only the *automatic* interval (`startDemoCycle`)
  honors reduced motion; a manual step never silently resumes it.
- Manual `playDemoCycle()` (via the toggle button) is **not** itself gated
  by `prefersReducedMotion()` — reduced motion only changes the *default* on
  open; an explicit user action to resume auto-cycling is honored.
- `updateDemoToggleUI(detailEl)` sets the toggle button's icon (⏸/▶),
  `title`/`aria-label` ("Pause"/"Play"), and `aria-pressed` from
  `state.demo.isPlaying` — called after every play/pause/open.
- Called from `setExpanded(index)` (start for the newly-opened panel, stop
  when collapsing) and from `performRoll()` (section 8, always restarts for
  scheme 0). `prefersReducedMotion()` wraps
  `matchMedia('(prefers-reduced-motion: reduce)').matches`.

**Playback controls** (built in `buildDetailContent`, `.demo-controls`,
`data-testid="scheme-demo-controls"`): three icon-only buttons —
`scheme-demo-prev` (⏮, wired to `demoPrev`), `scheme-demo-toggle` (⏸/▶,
wired to `toggleDemoPlayback`, the only true toggle so it also carries
`aria-pressed`), `scheme-demo-next` (⏭, wired to `demoNext`) — each with a
`title` + `aria-label` per `docs/conventions.md`'s icon-only-button rule.

### 9.2 Per-color rows

One row per color, in scheme order:

```js
function renderColorRows(detailEl, scheme) {
  const list = detailEl.querySelector('[data-testid="scheme-color-rows"]');
  list.innerHTML = '';
  scheme.forEach((c, idx) => {
    const li = buildColorRow(c, idx); // swatch + rgba readonly input + copy, hex readonly input + copy
    list.appendChild(li);
  });
}
```

- Swatch: small box, `--swatch-color: rgbaString(c)`.
- RGBA field: readonly input, `.value = rgbaString(c)`, copy button copies
  that value (reuse `copyText`/`handleCopyClick`, section 11).
- Hex field: readonly input, `.value = hexString(c)`, same copy pattern.

### 9.3 Copy-all textareas (derived, single source of truth)

```js
function rgbaOutput(i) {
  return state.rollResult.schemes[i].map(rgbaString).join('\n');
}
function hexOutput(i) {
  return state.rollResult.schemes[i].map(hexString).join('\n');
}
```

Written into the two `readonly` textareas whenever the detail panel is
(re)built (`rgbaOutputEl.value = rgbaOutput(i); hexOutputEl.value =
hexOutput(i);`). These are pure derivations of `state.rollResult` — there is
no path that writes them back into the scheme (per "Derived views have a
single source of truth" in `docs/conventions.md`). Both Copy-all buttons
reuse `copyText`/`handleCopyClick` (section 11) against the textarea's
`.value`.

## 10. Fade-in animation (isolated, tweakable)

Keep every tunable constant in one place so this is easy to iterate on
later, per DESIGN.md's explicit note that this area will likely change:

```css
/* ---- Fade-in animation (tweak here) ---- */
:root {
  --ctd-fade-duration: 320ms;
  --ctd-fade-stagger-step: 12ms;
}
@keyframes ctd-fade-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.fade-in-el {
  animation: ctd-fade-in var(--ctd-fade-duration) ease both;
  animation-delay: calc(var(--i, 0) * var(--ctd-fade-stagger-step));
}
@media (prefers-reduced-motion: reduce) {
  .fade-in-el { animation: none !important; opacity: 1 !important; transform: none !important; }
}
```

- Applies to the `5 * N` collapsed-strip swatches (5 schemes × `N` colors,
  `N = state.count`) rendered by `renderSchemes()` after every roll. Each
  `.swatch-mini` gets an inline `style.setProperty('--i', globalIndex)` where
  `globalIndex = schemeIndex * N + colorIndex`, giving a cascade across both
  axes (swatches within a scheme, and schemes in order) with a single index —
  simplest way to satisfy "staggered across swatches and/or across the 5
  schemes," generalized from the old fixed `schemeIndex * 5 + colorIndex`
  now that `N` isn't always 5.
- The just-opened detail panel's own contents (demo card, per-color rows)
  render simultaneously with the roll, without their own separate stagger —
  a deliberate simplification; the visual interest is in the swatch-strip
  cascade the user sees immediately.
- Reduced motion is handled purely in CSS (the class is always applied; the
  media query neutralizes it) — no JS branching needed for the fade itself,
  though `startDemoCycle`'s `prefersReducedMotion()` check (section 9.1)
  additionally skips the demo's interval-based cycling to keep it static.
- All constants/keyframe/class live in one clearly-commented CSS block so a
  future pass can retune duration/stagger/easing without touching JS.

## 11. Copy helper (shared by per-color copy + both copy-all buttons)

Re-implement the standard pattern (same as `color-converter`/`color-picker`):

```js
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
  document.body.removeChild(ta);
  return ok;
}

const copyTimeouts = new WeakMap();
async function handleCopyClick(btn, text) {
  if (!text) return;
  const ok = await copyText(text);
  if (!ok) return;
  clearTimeout(copyTimeouts.get(btn));
  btn.textContent = '✅';
  copyTimeouts.set(btn, setTimeout(() => { btn.textContent = '📋'; }, 1000));
}
```

## 12. Accessibility & responsive

- Real `<select>`/`<button>`/`<input>` with `<label>` (harmony select,
  colors-per-scheme select, seed input, both copy-all textareas) or
  `aria-label` (icon-only copy buttons, chip remove buttons, per-color-row
  fields — "RGBA value" / "Hex value").
- **Icon-only buttons also get a `title` tooltip**, in addition to their
  `aria-label`, per `docs/conventions.md` — the seed chip's `×` remove
  button (`title="Remove"`), every per-color copy button (`title` = the same
  text as its `aria-label`, e.g. "Copy RGBA value"), and both Copy-all
  buttons (`title="Copy all {label}"`, matching their `aria-label` — these
  aren't strictly icon-only, they have visible "Copy all" text, but carry a
  tooltip too for consistency across the copy-button family).
- `scheme-toggle` buttons: `aria-expanded` + `aria-controls` kept in sync
  with `state.expandedIndex` (section 8).
- Seed picker trigger (section 8b): `aria-label`/`title="Pick a color"`,
  `aria-haspopup="dialog"`, `aria-expanded` kept in sync with
  `state.seedPicker.open`. The popup is `role="dialog"`; each of the three
  draggable controls is `role="slider"` + `tabindex="0"` with an
  `aria-label` ("Saturation and value" / "Hue" / "Alpha") and `aria-valuenow`
  kept current on every render — plus arrow-key operability (section 8b.9)
  so the whole picker is keyboard-usable, not drag-only.
- Roll announcement: `#rollAnnounce`, static `role="status" aria-live="polite"`
  element, text set once per roll (`New palette — {label}`) — never spammed
  per-frame.
- Seed error: `#seedError`, same `role="status" aria-live="polite"` pattern,
  updated once per failed Add attempt, cleared on success.
- Demo text color is always the computed-best-contrast scheme color
  (section 9.1) — never a fixed black/white fallback, so it stays "using
  this scheme's colors" per DESIGN.md while remaining readable.
- `prefers-reduced-motion` honored in two independent places: the fade-in
  (CSS media query, section 10) and the demo cycle (JS check that skips
  `setInterval` entirely, section 9.1) — both render their final/static
  state immediately, no test needs to wait on a timer.
- Visible `:focus-visible` outlines on every interactive element; don't
  suppress focus rings.
- Tap targets: `.scheme-header` (the whole clickable strip) gets padding to
  reach ≥44px height even though the swatches inside are 50×50 already;
  `.chip-remove` gets padding to a ≥44×44 hit area even if the visible ×
  glyph is smaller; all buttons use `min-height: 44px` where they're
  standalone controls (Add, Roll, Copy, Copy all, Clear seeds).
- Responsive stacking: `.controls-bar` and `.seed-add-row` use `flex-wrap:
  wrap` below ~480px; `.swatch-strip` wraps (section 8); the scheme detail's
  demo card, color rows, and copy-all textareas stack to single-column below
  ~600px (grid/flex breakpoint, worker's exact breakpoint choice, matching
  the ~600px convention already used in sibling tools). No element may cause
  horizontal page scroll — wide content (none expected here beyond the
  swatch strip, already handled) would get its own `overflow-x: auto`
  container per convention.

## 13. Testability

### `data-testid` — complete list

- `controls-bar`, `roll-btn`, `harmony-select`, `algorithm-used-label`,
  `count-select`, `roll-announce`
- `seeds-section`, `seed-input`, `seed-add-btn`, `seed-error`, `seed-list`,
  per chip (`seed-chip`, `seed-chip-swatch`, `seed-chip-label`,
  `seed-chip-remove`), `clear-seeds-btn`
- Seed color picker (section 8b): `seed-picker-trigger`,
  `seed-picker-trigger-swatch`, `seed-picker-popup`, `seed-picker-sv-square`
  (+ `seed-picker-sv-thumb`), `seed-picker-hue-slider` (+
  `seed-picker-hue-thumb`), `seed-picker-alpha-slider` (+
  `seed-picker-alpha-thumb`)
- `schemes-section`, `schemes-list`
- Per scheme row (`scheme-row`, `data-index`): `scheme-toggle`,
  `scheme-swatches`, per swatch (`scheme-swatch`, `scheme-swatch-hex`),
  `scheme-detail`
- Per expanded detail: `scheme-demo`, `scheme-demo-card`,
  `scheme-demo-heading`, `scheme-demo-paragraph`, `scheme-demo-button`,
  **(v4)** `scheme-demo-lines` (+ per line `scheme-demo-line` and its
  `scheme-demo-line-hex` label — `N` of them), `scheme-demo-swatches` (+ per
  swatch `scheme-demo-swatch` — `N-1` of them), `scheme-demo-controls` (+
  `scheme-demo-prev`, `scheme-demo-toggle`, `scheme-demo-next`),
  `scheme-color-rows`, per color row (`scheme-color-row`,
  `scheme-color-swatch`, `scheme-color-rgba`, `scheme-color-rgba-copy`,
  `scheme-color-hex`, `scheme-color-hex-copy`), `scheme-rgba-output-col`,
  `scheme-rgba-output`, `scheme-rgba-copy-all-btn`, `scheme-hex-output-col`,
  `scheme-hex-output`, `scheme-hex-copy-all-btn`

Every one of these must appear in the emitted DOM (static ones in the HTML
skeleton, per-item ones set in the relevant `build*`/`render*` function).

### `window.__colorDesigner` test namespace

```js
window.__colorDesigner = {
  // pure color math
  parseColor, rgbaString, hexString, rgbToHsl, hslToRgb,
  relLuminance, contrastRatio, circularHueDistance,
  rgbToHsv, hsvToRgb,        // section 8b.1 — HSV, distinct from the HSL pair above

  // seed color picker actions (section 8b) — deterministic hooks; the live
  // H/S/V/A + open-state readback is state.seedPicker (below), not a
  // separate getter
  openSeedPicker,            // () -> void — re-parses the text input, opens the popup
  closeSeedPicker,           // () -> void — closes, returns focus to the trigger
  setSeedPickerHSVA,         // (partial: {h?,s?,v?,a?}) -> {h,s,v,a} — clamps, re-renders, writes back to the text input

  // pure harmony/generation
  anchorHues,               // (algorithmKey, H) -> hue[]
  generateScheme,           // (algorithm, seeds, count, rng) -> Color[N]  (N = clampCount(count))
  roll,                     // ({ algorithm, seeds, count, rng }) -> { algorithm, schemes }
  rollWith,                 // ({ algorithm, seeds, count, rngSeq }) -> { algorithm, schemes } — deterministic
  makeSeqRng,                // (seq) -> rng()  — build a deterministic rng from a fixed sequence
  cryptoRng,                 // () -> float in [0,1) — the production default
  clampCount,                 // (n) -> int in [2,10], default 4 for non-finite input

  // seed actions
  addSeed,                  // (str) -> seed | null
  removeSeed,                // (id) -> void  (direct, no modal — chip removal is low-stakes)
  clearSeeds: clearSeedsDirect, // () -> void  (direct, bypasses ctConfirm — for deterministic test resets)

  // UI action
  performRoll,               // () -> void — same function the Roll button/auto-roll call

  // live demo playback hooks (v4) — deterministic, so tests can drive/read
  // the demo without waiting on the auto-cycle timer
  demoNext,                             // () -> void — step pairingIndex forward (wraps at N), same fn the Next button calls
  demoPrev,                             // () -> void — step pairingIndex backward (wraps at N), same fn the Previous button calls
  demoTogglePlayback: toggleDemoPlayback, // () -> void — same fn the play/pause button calls
  demoPlay: playDemoCycle,              // () -> void — force-resume the auto-cycle (also works under reduced motion)
  demoPause: pauseDemoCycle,            // () -> void — force-pause the auto-cycle

  // live state
  state,                     // live reference: algorithmSelect, count, seeds, rollResult, expandedIndex, isInitialLoad, demo, seedPicker
                              // state.demo (v4): { schemeIndex, intervalId, pairingIndex, isPlaying }

  // per-scheme derived output getters
  rgbaOutput,                 // (i) -> string
  hexOutput,                  // (i) -> string
};
```

- `removeSeed`/`clearSeeds` are both exposed directly (bypassing
  `ctConfirm`) so tests can reset seed state deterministically without
  driving the modal — the **UI path** for Clear seeds (button → `ctConfirm`
  → Enter/click-confirm) is exercised separately by driving the real
  button + `ctConfirm`'s dialog through Playwright.
- `rollWith`/`makeSeqRng` are what make "Random picks one algorithm, all 5
  schemes share it" and exact anchor-hue/generated-color assertions —
  including for arbitrary `count` — possible without depending on real
  randomness.
- `state.count` (current `N`) and `state.isInitialLoad` (whether the last
  render was the initial auto-roll vs. a re-roll) are both readable straight
  off the live `state` reference — no separate getters needed.
- `addSeed` triggering the Roll button's wiggle class means the **UI
  assertion** for the wiggle ("adding a seed toggles the wiggle class") can
  be driven either through the real Add button or through
  `window.__colorDesigner.addSeed(...)` directly — both paths go through the
  same `addSeed` function, so both trigger `triggerRollWiggle()`.
- Namespace assigned once at module init, after every referenced function
  exists — inert for normal users, no observable UI difference when unused.

## 14. Script organization (inside the single `<script type="module">`)

1. DOM references (`const harmonySelectEl = document.getElementById(...)`,
   `countSelectEl`, the seed-picker element refs, etc.)
2. State (`state` incl. `state.seedPicker`, `nextSeedId`, `hasRolledOnce`)
3. Pure color math (section 3): `rgbToHsl`, `hslToRgb`, `rgbToHsv`,
   `hsvToRgb` (section 8b.1), `parseColor` + regex/helpers, `rgbaString`/
   `hexString`, `relLuminance`/`contrastRatio`, `circularHueDistance`
4. Harmony data + `anchorHues` (section 4)
5. Fill strategy: `ROLES`, `clamp01`, `clampCount` (section 5)
6. Seed injection: `injectSeeds` (section 6.2)
7. `pickSeedCount`, `pickRandomSeeds`, `generateScheme`, `roll`, `cryptoRng`,
   `makeSeqRng`, `rollWith` (section 7)
8. Seed actions: `addSeed` (incl. `triggerRollWiggle()`), `removeSeed`,
   `clearSeedsDirect`, `renderSeeds`, seed input/Add/Clear wiring (section
   6.1), `triggerRollWiggle` (section 8)
8b. Seed color picker: `snapAlpha`, `updateTriggerSwatch`, `renderSeedPicker`,
    `writeSeedPickerToInput`, `setSeedPickerHSVA`, `initSeedPickerFromInput`,
    `clampPopupPosition`/`positionSeedPicker`, `openSeedPicker`/
    `closeSeedPicker` + their document/window listeners, `attachPickerDrag`
    + the three drag wirings, the three keyboard-nudge listeners (section 8b)
9. `performRoll`, roll button + harmony-select + count-select + auto-roll
   wiring (section 8)
10. Accordion: `setExpanded`, `renderSchemes`, `buildSchemeRow` (section 8)
11. Scheme detail: `bestContrastIndex`, `renderDemo`, `updateDemoToggleUI`,
    `startDemoCycle`, `stopDemoCycle`, `playDemoCycle`, `pauseDemoCycle`,
    `toggleDemoPlayback`, `stepDemo`/`demoNext`/`demoPrev` (v4 playback,
    section 9.1), `renderColorRows`, `buildColorRow`, `rgbaOutput`,
    `hexOutput`, detail-panel build/teardown incl. `buildDemoLine`/
    `buildDemoSwatch`/`buildDemoControlBtn` (section 9)
12. Copy: `copyText`, `handleCopyClick`, wiring for per-row copy + both
    Copy-all buttons (section 11)
13. `prefersReducedMotion()` helper (section 9.1/10)
14. Test hook: `window.__colorDesigner = {...}` (section 13)

## 15. Ordered build checklist

1. Write the static HTML skeleton (header, **seeds section, then controls
   bar** — v2 order, section 8, with the Roll button first inside the
   controls bar, then harmony select, then algorithm-used label, then the
   colors-per-scheme select), schemes section with an empty `.schemes-list`,
   with every static `data-testid` from section 13 in place (incl.
   `count-select`). Paste the footer and `ctConfirm` blocks verbatim with
   their sentinels.
2. Implement the pure color math (section 3) standalone first — sanity-check
   `rgbToHsl`/`hslToRgb` round-trip a handful of known colors, and
   `parseColor`/`rgbaString`/`hexString` against a few cases (`#abc`,
   `#aabbccdd`, `rgb(255,0,0)`, `rgba(0 0 0 / 0.5)`) before touching the DOM.
3. Implement `anchorHues` + `ROLES` + `clampCount` + `generateScheme`
   (sections 4–7.1) as standalone pure functions; hand-verify a couple of
   algorithms at a couple of different `count` values (e.g. 2, 4, 10) each
   produce exactly `N` colors with sane hue/lightness spread.
4. Implement `roll`/`cryptoRng`/`makeSeqRng`/`rollWith` (section 7.2–7.3),
   all count-aware; verify by hand with a crafted `rngSeq` that Random mode
   picks one algorithm shared by all 5 schemes, that a specific selection is
   respected, and that all 5 schemes in one roll share the same `N`.
5. Implement seed state + `addSeed`/`removeSeed`/`clearSeedsDirect` +
   `injectSeeds` (section 6); verify a scheme's generated colors get
   overwritten at the expected nearest-hue slot(s) when seeds are present,
   that `k` distinct seeds land in `k` distinct slots, and that `k` is
   bounded by `N` as well as pool size. Wire `triggerRollWiggle()` into
   `addSeed`'s success path (section 8).
6. Wire the seeds UI (`renderSeeds`, chip build/remove with a `title`
   tooltip, Add button + error message, Clear seeds via `ctConfirm`).
6b. Implement the seed color picker (section 8b): `rgbToHsv`/`hsvToRgb`,
    the trigger swatch (`updateTriggerSwatch`, live on `input`),
    `renderSeedPicker`/`setSeedPickerHSVA`/`writeSeedPickerToInput`,
    `initSeedPickerFromInput`, open/close + positioning + the
    click-outside/Esc/resize/scroll listeners, `attachPickerDrag` wired to
    all three controls, and the three keyboard-nudge listeners. Verify by
    hand: typing a hex updates the trigger swatch live; opening re-parses
    the input every time; dragging each control updates the input text;
    alpha < 1 produces `rgba()`; Esc/click-outside close and return focus;
    arrow keys nudge each focused control; the popup stays within the
    viewport (including flipping above the trigger near the bottom edge)
    and fits a ~360px screen.
7. Implement `performRoll` + `renderSchemes`/`buildSchemeRow` (swatch strips
   with fade-in `--i`, centered via `justify-content: center`), wire the
   Roll button, the harmony select, and the count select, and call
   `performRoll()` once on `DOMContentLoaded` (auto-roll — `hasRolledOnce`
   starts `false`, so this first call is `isInitial`). Verify the
   algorithm-used label and `aria-live` announcement update once per roll.
8. Implement the accordion (`setExpanded`, single-open, **scheme 0
   auto-expands only when `isInitial` is true; every re-roll sets
   `expandedIndex = null`**) and the scheme detail panel build/teardown
   (demo card, per-color rows, copy-all textareas) — sections 8–9.
9. Implement the demo's cycling role assignment (`bestContrastIndex`,
   `renderDemo`, `startDemoCycle`/`stopDemoCycle`, both `N`-aware) with the
   CSS custom-property crossfade transition; verify it starts on
   expand/first-load, stops on collapse or after a re-roll (nothing is open),
   and is fully static under `prefers-reduced-motion`.
10. Implement `copyText`/`handleCopyClick`; wire per-color-row copy buttons
    (with `title` tooltips) and both per-scheme Copy-all buttons (with
    `title` tooltips).
11. Add the fade-in CSS block (section 10, `--i` now `schemeIndex * N +
    colorIndex`) and the wiggle keyframes/class (section 8); apply `--i` to
    every rendered swatch after each `performRoll()`; verify the
    reduced-motion media query neutralizes both the fade-in and the wiggle
    (no waiting, instant final state; wiggle class still toggles, just with
    no visible animation).
12. Accessibility + responsive pass (section 12): labels/aria-labels/title
    tooltips, focus styles, tap-target sizing, breakpoints for controls/seed
    row/swatch strip/detail-panel stacking down to ~360px with no horizontal
    overflow, at every `N` from 2 to 10 — including the seed picker trigger's
    `title`/`aria-label`/`aria-haspopup`/`aria-expanded` and the three
    `role="slider"` controls' `aria-label`/`aria-valuenow`.
13. Add the `window.__colorDesigner` test hook last (after every referenced
    function exists), matching section 13 exactly (incl. `clampCount`,
    `rgbToHsv`/`hsvToRgb`, and the seed-picker hooks).
14. Manual smoke test in a browser: load (auto-roll fires, scheme 1 open,
    swatches fade in, Roll button already reads "Roll again"), re-roll
    several times in Random mode (confirm the label changes algorithm
    sometimes but is consistent across all 5 schemes within one roll, and
    that **all schemes are now collapsed** after each re-roll), pick a
    specific algorithm and roll (label matches, stays fixed across re-rolls
    until changed again), change colors-per-scheme to a few different values
    and roll each time (confirm every scheme shows exactly that many
    swatches, centered in its row), open the seed picker via the trigger and
    drag around the sv-square/hue slider/alpha slider (confirm the text
    input updates live, alpha < 1 switches to `rgba()`, Esc and
    click-outside both close it and return focus to the trigger, and it's
    fully usable by keyboard alone), add 2–3 seed colors (via the picker and
    by typing directly — valid and one invalid to see the error; confirm the
    Roll button wiggles on each valid add), roll again and confirm seed
    colors appear verbatim in some schemes, open/close/switch accordion rows
    (demo cycles only in the open one, crossfades every ~2.5s), copy a
    per-color field and a Copy-all textarea (hover each to confirm a
    tooltip), Clear seeds via the confirm modal (Enter and Esc paths),
    resize down to ~360px and confirm no horizontal scroll (including the
    picker popup fitting on-screen), and toggle OS reduced-motion to confirm
    instant render + static demo + no visible wiggle.
