# color-designer — Design

Author: Claude. Design lead: Jason. Source-of-truth spec. The planner turns this
into an implementation plan; the worker implements strictly against both. Built
in rounds — this includes v2 refinements (configurable color count, re-roll
collapse behavior, the roll-again button with wiggle-on-add, alignment/centering,
tooltips), a v3 visual seed color picker, and a v4 round (purple-button hover
fix, spacer-label alignment, and a richer live demo showing all N colors with
playback controls).

## Summary

A single, self-contained `index.html` (vanilla HTML/CSS/JS, no build, no
dependencies) that generates **color schemes** from color-theory math. The user
can optionally seed it with their own colors; on each "roll" it produces **five
schemes** built from a harmony algorithm (hue rotations) plus tint/shade
variation, mixing in 1–3 of the seed colors per scheme. Each scheme shows big
swatches with hex, and expands to a live demo + copyable color rows.

## Hard constraints

- **Ships as one file.** The committed `index.html` is fully self-contained — all
  HTML/CSS/JS inline, no external assets, no CDN, no npm dependencies, opens via
  `file://`. It is **build-assembled** from `source/` by the shared
  dependency-free Node build (`scripts/build-tool.mjs`, `npm run build`); the pilot
  for `docs/conventions.md` § "Build-assembled
  tools". Author under `source/` (`index.template.html`, `styles.css`, `logic.mjs`
  = the pure engine, `app.mjs` = the DOM layer), run `npm run build`, commit the
  result. `npm test` runs `build --check` first so drift can't slip through.
- **Vanilla.** Standard browser APIs only. Inline `<script type="module">` fine.
- **Responsive & mobile** (per `docs/conventions.md`): usable down to ~360px, no
  horizontal overflow, ~44px tap targets, with mobile test coverage.
- Uses the shared pasted components: the **footer** (`tools/include/footer.html`,
  sentinels + hash, at the bottom) and **`ctConfirm`** (`tools/include/confirm.js`)
  for any destructive confirmation.
- **Icon-only buttons get hover tooltips** (`title`) per `docs/conventions.md`.
- Canonical color formatting matches the sibling color tools (see Formatting).

## The color theory (the engine)

Work in **HSL**. A harmony algorithm takes a base hue `H` and yields a set of
**anchor hues** by rotation:

| Algorithm | Anchor hues (degrees) | Anchors |
|---|---|---|
| Complementary | `H`, `H+180` | 2 |
| Analogous | `H-30`, `H`, `H+30` | 3 |
| Triadic | `H`, `H+120`, `H+240` | 3 |
| Split-complementary | `H`, `H+150`, `H+210` | 3 |
| Tetradic (square) | `H`, `H+90`, `H+180`, `H+270` | 4 |
| Monochromatic | `H` | 1 |

**Anchors are hues, not the final color count.** Every scheme targets **N
colors**, where **N is user-configurable (2–10, default 4)** — there is no hard
limit; the harmony only sets hue relationships. The N colors are filled out from
the anchor hues by varying **lightness/saturation** (tints = lighter, shades =
darker) and, where useful, a near-neutral. So e.g. triadic (3 anchors) at N=5 →
3 anchor colors + 2 tint/shade variants.

Conversions `rgbToHsl` / `hslToRgb` are pure helper functions.

## Moods (flavor layered on top of the harmony)

The harmony sets the **relationship** between hues; a **mood** sets their
**territory and tone**. The two compose — the mood adjusts the same engine
rather than replacing it — so every harmony works under every mood.

Each mood is pure data (`MOODS` table, keyed in `MOOD_MAP`):

| Field | Effect |
|---|---|
| `hueArcs` | `null` = any hue; else `[[start,end],…]` degrees, a base hue is picked uniformly inside one arc. `end < start` wraps past 360 (e.g. `[335,45]`). Theme moods (Ocean, Sunset, …) stake out a neighborhood; tone moods leave it `null`. |
| `spread` | Multiplier on the harmony's hue **offsets** (the `+120`/`+180`/… in the table). `1` = full harmony; theme moods use `<1` so their anchors stay near the arc. Scaling the **original** offsets (not a wrapped shortest-angle diff) preserves the harmony geometry. |
| `sat` / `light` | `[lo,hi]` base saturation / lightness ranges, replacing the defaults. |
| `roleScale` | Multiplier on the ROLES `dL`/`dS` deltas — `<1` softens (pastel, ice), `>1` exaggerates the in-scheme light/sat swing. |

- **`anchorHues(key, H, spread = 1)`** applies the spread; `spread = 1` is
  identical to the pre-mood behavior, so the harmony table and its tests are
  unchanged.
- **`MOOD_ANY`** (key `'any'`, the default) is a deliberate no-op: `hueArcs
  null`, `spread 1`, `sat [0.55,0.90]`, `light [0.45,0.60]`, `roleScale 1` — the
  exact ranges/draw pattern the generator used before moods existed, so default
  output and stored rolls don't change.
- **`'surprise'`** resolves to one randomly-chosen *flavored* mood (never
  `'any'`) per roll, shared by all five schemes — mirroring how `'random'`
  resolves one algorithm per roll.
- A themed mood owns its hue: a seed can still supply the **base hue** only for
  hue-free (tone) moods; for themed moods the arc wins and the seed is still
  woven in via nearest-hue injection.
- The badge reads **"Mood · Harmony"**, dropping the mood half when it's `'any'`.

### Mood-tuning guide (adding / editing a mood)

Moods are pure data — a row in the `MOODS` array (inside the PURE-LOGIC block of
`index.html`). Nothing else needs to change: `MOOD_MAP`, `MOOD_LABELS`,
`SURPRISE_POOL`, and the `<select>`'s option list are all derived, and the
generator reads the row generically. To add or tweak one, edit the row and
(if adding) drop a matching `<option>` into the mood `<select>`'s `<optgroup>`.

Each field, and how to reason about it:

| Field | What to set it to |
|---|---|
| `key` | Unique, stable string. Persisted in `color-designer:v1` and used by `roll(...)`. Never rename a shipped key (it invalidates stored rolls, which then fall back to `'any'`). |
| `label` | Human name shown in the `<select>` and the badge ("Label · Harmony"). |
| `hueArcs` | `null` for a **tone** mood (any hue, composes with every harmony). For a **theme** mood, `[[start,end], …]` in degrees — a base hue is drawn uniformly inside one randomly-chosen arc. Use `end < start` to wrap past 360 (e.g. `[335,45]` = pinks→reds→oranges). Keep arcs ≥ ~25–40° wide so there's room to vary the base hue. |
| `spread` | Multiplier on the harmony's hue **offsets** (`+120`, `+180`, …). `1` = full harmony. A **theme** mood should use `< 1` (≈0.35–0.6) so its anchors stay near the arc and the palette still reads as that theme; too high and, say, a triadic scheme flies out of the neighborhood. `0` would collapse every anchor onto the base hue (monochrome) — usually not what you want for a named mood. |
| `sat` | `[lo, hi]` base saturation, each in `[0,1]`. Low+low = washed / muted; high+high = punchy / neon. This replaces the default `[0.55, 0.90]`. |
| `light` | `[lo, hi]` base lightness, each in `[0,1]`. High = pastel/airy; low = deep/moody. Replaces the default `[0.45, 0.60]`. Keep `hi - lo` modest (≈0.1–0.2) so the five schemes in a roll stay recognizably the same mood. |
| `roleScale` | Multiplier on the ROLES `dL`/`dS` deltas that spread colors *within* one scheme. `< 1` softens the light/sat swing (pastel `0.5`, ice `0.6` stay tonally tight); `> 1` exaggerates it (forest `1.1`). `1` = the classic swing. |
| `anchorBias` *(optional)* | Degrees to nudge the **non-base** anchors outward (`+`) or inward (`−`) before `spread` is applied; the base anchor (offset 0) never moves. Absent/`0` is byte-identical to plain `anchorHues`. Use for a mood whose companions should sit asymmetrically around the base hue. |
| `roles` *(optional)* | An array replacing the shared `ROLES` table for this mood only (each entry `{ name, dL, dS }`), letting a mood define its own light/sat spread across slots. Absent = the default `ROLES`. |

Both optional fields are **additive**: no shipped mood sets them, so current
output is unchanged (locked by the `MOOD_ANY`-equivalence tests). Add them only
when a stock mood can't get the feel you want from `sat`/`light`/`roleScale`.

Rules of thumb: a **tone** mood is `hueArcs: null, spread: 1` and only reshapes
`sat`/`light`/`roleScale`; a **theme** mood adds an arc and a sub-1 `spread`.
Every non-`'any'` mood automatically joins `SURPRISE_POOL`. `MOOD_ANY` must stay
byte-for-byte the pre-mood default (`hueArcs null`, `spread 1`,
`sat [0.55,0.90]`, `light [0.45,0.60]`, `roleScale 1`) — don't edit it. After a
change, `tests/unit/moods.test.mjs` + `tests/unit/moods-deep.test.mjs` re-verify
range well-formedness, arc containment, and the `'any'`-is-a-no-op guarantee.

## Rolls, schemes, and the controls

- A **roll** produces **exactly 5 schemes**. Each scheme = an ordered list of **N
  colors** (N configurable, 2–10, default 4).
- **Harmony `<select>`** — options: **Random (default)**, then Complementary,
  Analogous, Triadic, Split-complementary, Tetradic, Monochromatic.
- **Mood `<select>`** — **Any (classic, default)**, **Surprise me 🎲**, then two
  `<optgroup>`s: **Tone** (Warm, Cool, Soft pastels, Deep & moody, Muted, Neon)
  and **Theme** (Ocean, Sunset, Ice, Forest, Earthy). Applies on the next roll.
  See **Moods** above for what each field does.
- **Colors-per-scheme control** — lets the user pick **N (2–10, default 4)**
  (a `<select>` or a small stepper). Changing it applies on the next roll.
- **"Random" semantics (important):** on Random, a roll picks **one** algorithm
  at random and **all five schemes in that roll use that same algorithm** — only
  the base hue / seed mix differs between the five. A subsequent re-roll may pick
  a different algorithm. (A roll is always internally coherent; Random varies the
  algorithm *between* rolls, never *within* one.)
- When a **specific** algorithm is selected, all five schemes use it.
- Surface which algorithm a roll used (a small label, e.g. "Triadic") — helpful
  in Random mode.

## Seed colors (optional)

- The user can add **any number** of seed colors (or none).
- **Add-a-color row** (left→right): a **swatch/eyedropper button** (the primary
  visual picker — see below), the **hex/rgba text input** (parsed live), and an
  **Add** button. Below it, the seed chip list, each chip with a remove **×**
  (low-stakes — a chip × without a modal is fine; only bulk "Clear seeds" uses
  `ctConfirm`).
- **Add is this section's commit action** (per `docs/conventions.md` §
  Responsive & mobile): a **successful** Add blurs the seed input, dismissing
  the on-screen keyboard on mobile; a **rejected** Add (empty/invalid) keeps
  focus in the input so the user can fix the value.
- **Add from a generated swatch:** each mini swatch in a scheme strip carries a
  small **＋** button (`data-testid="scheme-swatch-seed-btn"`), revealed on
  hover/focus in its bottom-right ("Add as a seed color"). It calls
  `addSeedFromColor(color)` — pushes that exact color as a seed chip, **deduped**
  by canonical `rgba()`, **wiggles** the Roll button, and **does not reroll**.
  `stopPropagation` keeps the click from toggling the scheme row. Because a
  `<button>` can't nest in a `<button>`, the scheme header is a
  `div[role="button"] tabindex="0"` with an Enter/Space keydown handler (rather
  than a `<button>` wrapping the strip). That handler is **guarded by
  `e.target === toggle`** so it only fires for keys pressed on the header
  itself — keystrokes that bubble up from a focused child control (the ＋
  add-as-seed button) reach that button's own native activation instead of
  being `preventDefault`-ed away. (Without the guard, Enter/Space on a focused
  ＋ toggled the row and never added the seed — see TESTS.md "v8 round".)

### Seed color picker (visual — the primary input)

The primary way to choose a seed is a **visual picker** — a custom, vanilla
**saturation/value square + hue slider + alpha slider**, built entirely from
`<div>`s driven by Pointer Events (no `<canvas>`, no native `<input
type="color">`):

- **Trigger = swatch + eyedropper:** the first control in the add-a-color row is
  a `<button data-testid="seed-picker-trigger">` showing an **eyedropper
  (pipette) icon** over a checkerboard base; a child `.trigger-fill` span
  (`data-testid="seed-picker-trigger-swatch"`) is painted with
  `background-color: var(--trigger-color, transparent)`, live-updated on every
  `input` event on the text field via `parseColor` — valid text paints the
  swatch, empty/invalid text falls back to `transparent` (checkerboard shows
  through). The eyedropper icon uses `mix-blend-mode: difference` so it stays
  visible over any swatch color. `title`/`aria-label` "Pick a color";
  `aria-haspopup="dialog"` + `aria-expanded` track open state.
- **Picker popup** (`data-testid="seed-picker-popup"`, `role="dialog"`): a
  `position: fixed` panel (260px wide, clamped to `100vw - 1.5rem`) containing:
  - **saturation/value square** (`seed-picker-sv-square`) — background is a
    white→hue horizontal gradient with a transparent→black vertical gradient
    layered over it (`--picker-hue-color` custom property set to
    `hsl(h, 100%, 50%)`); thumb at `left: s*100%, top: (1-v)*100%`.
  - **hue slider** (`seed-picker-hue-slider`) — a fixed 7-stop rainbow
    gradient; thumb at `left: (h/360)*100%`.
  - **alpha slider** (`seed-picker-alpha-slider`) — a checkerboard base with a
    current-opaque-color→transparent gradient layered over it (recomputed from
    the current h/s/v on every change); thumb at `left: a*100%`.
  - All three are `role="slider"`, `tabindex="0"`, and support **arrow-key
    nudging** when focused (Shift = a bigger step) in addition to
    mouse/touch drag via Pointer Events (`pointerdown`/`pointermove`/
    `pointerup`, with `setPointerCapture`).
  - Positioned just below the trigger by default; **flips above** the trigger
    when there's no room below, and clamps left/right to stay within the
    viewport. Closes (and un-registers its listeners) on **Esc** or a
    **pointerdown outside** the popup/trigger, or on window resize/scroll;
    focus returns to the trigger on close.
- **Two-way sync:** every drag/keyboard change calls one central
  `setSeedPickerHSVA(partial)` that updates state, re-renders the popup, and
  writes the canonical string back into the text input — **hex `#rrggbb`**
  when alpha is 1, else **`rgba(r, g, b, a)`** — via the same `hexString`/
  `rgbaString` used everywhere else in the tool (never a separate formatter).
  Conversely, **opening the picker re-parses the text input's current value**
  via `parseColor` every time (`h,s,v` from `rgbToHsv`, `a` from the parsed
  alpha); an empty/invalid input falls back to a default of **mid hue (180°),
  full saturation/value, alpha 1**. The text input stays fully typeable/
  pasteable at all times; "Add" still adds whatever string is currently in it.
- *(Implementation: a custom vanilla HSV picker, self-contained inside
  `index.html`'s single module script but written with minimal DOM/CSS
  coupling to the rest of the tool, so it could later be lifted into a shared
  `tools/include/` component. Native `<input type="color">` was rejected as
  the primary input — it's OS-styled and hex-only/no-alpha — though nothing
  here precludes adding a true screen eyedropper via the Chromium `EyeDropper`
  API as a future bonus.)*
- **Per scheme, the roll mixes in 1, 2, or 3 of the seed colors** (chosen at
  random from the available seeds; **bounded by the seed-pool size and by N**; if
  none, the scheme is fully generated). A seed is injected by replacing the
  generated color in the **nearest-hue slot** with the seed's exact color.
- With **no seeds**, rolls are fully generated from random base hues.

## Generation algorithm (per scheme)

Given `algorithm`, the seed pool, a color count `N`, an injectable `rng`, and a
`mood` (default `MOOD_ANY`):

1. Choose a base hue `H` — from a seed's hue (tone moods only), else from the
   mood's arc via `moodBaseHue` (`rng()*360` for `MOOD_ANY`) — and base S/L from
   the mood's `sat`/`light` ranges.
2. Compute the algorithm's anchor hues, scaled by the mood's `spread`
   (`anchorHues(algorithm, H, mood.spread)`).
3. Build **N** colors by iterating N slots, **cycling the anchor hues
   round-robin** (`anchors[i % anchors.length]`), and **spreading a set of
   lightness/saturation "roles"** (dark shade → mid → light tint, plus
   muted/vivid) across the N slots, each role delta scaled by `mood.roleScale`,
   so any N in 2–10 yields varied, usable colors. Deterministic given `rng`.
4. Pick `k = 1..3` seeds (bounded by pool size and N) and inject each into its
   nearest-hue slot (distinct slots, collision-free).
5. Result: an array of N `{r,g,b,a}` colors.

Keep generation a **pure function**
`generateScheme(algorithm, seeds, count, rng, mood)` and
`roll({ algorithm, seeds, count, rng, mood })` → `{ algorithm, mood, schemes }`
(5 schemes × `count` colors each), with `rng` injectable so tests are
deterministic. Default rng wraps `crypto.getRandomValues`. `count` defaults to 4,
clamped to 2–10; `mood` defaults to `'any'` and resolves `'surprise'` to one
flavored mood per roll. `MOOD_ANY`'s ranges/draws are chosen so omitting `mood`
is byte-for-byte identical to the pre-mood generator.

## Layout (top-to-bottom, responsive)

1. **Header** — title + one-line description.
2. **Seed colors** (near the **top**, above the controls) — the add-a-color row
   (eyedropper/swatch picker + hex/rgba input + Add), the seed chip list (× per
   chip), and a **"Clear seeds"** control (guarded by `ctConfirm`) when non-empty.
   Details in "Seed colors" / "Seed color picker" below.
3. **Controls bar** (**below** the seed section) — one row, left→right:
   **"Roll again"** button, then the **harmony `<select>`**, then the
   **algorithm-used label** ("which harmony was used"). The **colors-per-scheme**
   control (2–10, default 4) also sits in this row (e.g. at the right end). All
   vertically aligned/centered with each other; works with zero seeds.
   - The **Roll button label** is `Roll again`, followed by **two non-breaking
     spaces**, then the **🎲 dice icon** (`Roll again&nbsp;&nbsp;🎲`); purple,
     the primary action. It reads "Roll again" from the start (the page auto-rolls
     on load).
   - **Each time the user adds a seed color, the "Roll again" button briefly
     *wiggles*** as an attention nudge — this **replaces** the earlier idea of a
     separate roll button in the seed area. Honor `prefers-reduced-motion` (no
     wiggle).
   - **Primary (purple) button hover** (both roll buttons / any purple primary):
     on hover keep the **purple border**, change the **fill to white**, and set
     the **text to the purple color** (inverted). Do NOT use white fill + white
     text (which makes the label invisible) — the current bug.
   - **Alignment:** the harmony `<select>` and colors-per-scheme control have a
     visible **label above them**, which pushes their boxes down relative to the
     label-less "Roll again" button. Give label-less controls a **spacer label**
     — an empty `<label>` containing a `&nbsp;` above them (Bootstrap-5 style) —
     so every control *box* top-aligns across the row.
4. **Schemes accordion** — the 5 schemes, each a collapsible row:
   - **Collapsed row:** a **centered** horizontal strip of **~50×50 swatches**
     (the N colors), each with its **hex** shown beneath it.
   - **Expanded detail** (below) appears **inline between this scheme row and the
     next**. **One open at a time** (accordion). On **initial page load** the
     **first scheme auto-expands**; on every **subsequent re-roll ALL schemes
     collapse** (none auto-open) so the user picks which to open.
5. **Footer** (shared component).

## Scheme detail (expanded panel)

- **Live demo** — sample elements (heading, paragraph, button) rendered using this
  scheme's colors, designed so the user can see **all N colors together**, not
  just a few:
  - **Multiple sample lines**, each using a **different color pairing**
    (background + best-contrast text via relative luminance), so more of the
    palette is visible at once. Scale the number of lines/pairings with N so a
    larger palette shows more of itself.
  - A **column of swatches on the right** showing the scheme's **non-background
    colors against the current demo background**, so the user can eyeball how they
    sit together.
  - The pairing assignment **auto-cycles slowly — about 1/3 as often as before**
    (~7–8s between changes, vs the old ~2.5s) with a crossfade.
  - **Playback controls** on the demo: a **play/pause** toggle plus **prev/next**
    step buttons, so the user can pause the auto-cycle and manually step through
    pairings instead of it constantly switching on them. Icon-only controls get
    `title` tooltips (e.g. "Pause", "Next", "Previous").
  - Respects `prefers-reduced-motion`: **start paused / no auto-cycle**; prev/next
    still work for manual stepping.
- **Per-color rows** — one per color (N): a small swatch + read-only rgba input +
  read-only hex input, each with a copy button (shared copy-with-fallback + check
  feedback + tooltip). Same shape as the other tools.
- **Copy-all textareas** — two read-only textareas (RGBA one-per-line, HEX
  one-per-line) for this scheme's N colors, each with a **Copy all** button.
  Derived from the scheme (single source of truth).

## Animation: generated colors fade in

- When a roll's colors render (initial load and every re-roll), the swatches
  **fade in** (opacity 0→1 + slight translate/scale), **staggered** across
  swatches/schemes (~250–500ms). Honor **`prefers-reduced-motion`**: appear
  immediately. Keep the fade logic isolated/easy to tweak (still iterating).

## Formatting (pure, canonical — match sibling tools)

- `rgbaString({r,g,b,a})` → `rgba(r, g, b, a)`, 0–255 ints, trimmed alpha, always
  included.
- `hexString({r,g,b,a})` → lowercase `#rrggbb`, or `#rrggbbaa` only when a < 1.
- `parseColor(str)` accepts hex (#rgb/#rgba/#rrggbb/#rrggbbaa, with/without #) and
  rgb()/rgba() (comma + modern slash), like `color-converter`; used for seeds.

## Accessibility & UX

- Real `<select>`/`<button>`/`<input>` with labels; `aria-label` **and a
  `title` tooltip** on icon-only buttons (copy, ×, etc.); visible focus. Accordion
  rows are proper buttons with `aria-expanded`.
- Swatch hex text has sufficient contrast; demo text uses computed-contrast color.
- Announce a roll politely via `aria-live` (e.g. "New palette — Triadic"), once.
- `prefers-reduced-motion` honored for the fade-in and the demo cycle.
- Responsive/mobile: swatch strips wrap or scroll within their row (no page
  overflow); accordion and detail panels stack cleanly on narrow screens.
- A successful seed **Add** blurs the seed input to dismiss the on-screen
  keyboard; a rejected Add keeps focus so the user can fix it (see "Seed
  colors" above).
- **Fixer pass:** the page-wide `button:hover:not(:disabled)` rule had
  higher CSS specificity than the pasted ctConfirm's `.ctc-btn--yes:hover`
  (filter-only), so hovering "Yes" (Clear seeds dialog) repainted it
  near-white even though its resting state was correctly a filled accent.
  Fixed in this tool's own CSS by excluding `.ctc-btn` from the generic
  hover rule — per `docs/conventions.md`'s ctConfirm hover-specificity note.
  Naively adding just `:not(.ctc-btn)` also raises the generic rule's
  specificity enough to newly out-rank `.btn-primary:hover` (Roll again),
  so `.btn-primary` is excluded from the generic rule too
  (`button:hover:not(:disabled):not(.ctc-btn):not(.btn-primary)`), leaving
  Roll again's own fill/text-invert hover rule untouched. The pasted
  ctConfirm block itself was not touched.

## Testability (build these in)

- Stable **`data-testid`** on: the harmony select, the **mood select**, the
  **colors-per-scheme control**, the Roll button, the **"Roll again"** button (by
  the seeds), algorithm-used label (badges "Mood · Harmony"), seed input, seed
  Add, seed list + each chip's remove, Clear seeds, the schemes container, each
  scheme row + expand control + its swatches (with hex + a **`scheme-swatch-seed-btn`**
  ＋ per swatch), the expanded detail, each per-color row (swatch/rgba/hex/
  copies), and the two copy-all textareas + buttons.
- Seed color picker: `seed-picker-trigger` (+ `seed-picker-trigger-swatch`),
  `seed-picker-popup`, `seed-picker-sv-square`, `seed-picker-hue-slider`,
  `seed-picker-alpha-slider` (and each thumb).
- Live demo (v4): `scheme-demo-lines` (+ each `scheme-demo-line`, with a
  `scheme-demo-line-hex` label), `scheme-demo-swatches` (+ each
  `scheme-demo-swatch`), `scheme-demo-controls` (+ `scheme-demo-prev`,
  `scheme-demo-toggle`, `scheme-demo-next`).
- Expose **`window.__colorDesigner`**: pure `parseColor`, `rgbaString`,
  `hexString`, `rgbToHsl`, `hslToRgb`, `rgbToHsv`, `hsvToRgb`; pure
  `generateScheme(algorithm, seeds, count, rng, mood)` and `roll({ algorithm,
  seeds, count, rng, mood })`; the `MOODS`/`MOOD_MAP` data and
  `moodBaseHue(mood, rng)`; an injectable-rng/deterministic roll entry so tests
  assert exact colors, the "Random shares one algorithm across all 5 schemes"
  rule, the analogous "Surprise shares one flavored mood" rule, and arbitrary
  `count`; `addSeed(str)` / `addSeedFromColor(color)` / `clearSeeds()`;
  seed-picker hooks
  `openSeedPicker()`, `closeSeedPicker()`, `setSeedPickerHSVA({h,s,v,a})`
  (updates the picker AND writes back to the text input, returning the
  resulting clamped HSVA); live demo playback hooks `demoNext()`, `demoPrev()`,
  `demoTogglePlayback()` (deterministic — no need to wait on the auto-cycle
  timer); live `state` (incl. current count, whether the last render was the
  initial load vs a re-roll, `state.seedPicker` — the live `{open,h,s,v,a}`
  readback for the picker, and `state.demo` — live `{schemeIndex, pairingIndex,
  isPlaying, intervalId}` for the open scheme's demo); and per-scheme output
  getters (`rgbaOutput(i)` / `hexOutput(i)`). Inert for normal users.
- Tests should assert: N is honored (each scheme has exactly N colors) across
  N=2..10; default N=4; Random-mode roll → all 5 schemes share the algorithm;
  accordion **first-open only on initial load, all-collapsed after a re-roll**;
  the "Roll again" button appears once seeds exist and rolls; copy/copy-all;
  reduced-motion path; mobile real-tap + overlay hit-test; the purple-button
  hover inversion (white fill + purple text, never white-on-white); the Roll
  button/select top-alignment via the spacer label; the demo's sample-line/
  swatch counts scale with N; play/pause toggles `state.demo.isPlaying` and
  the auto-cycle interval; prev/next change `state.demo.pairingIndex` (via
  hooks and a real click); reduced motion starts the demo paused but prev/next
  still work; and for the seed color picker — trigger swatch tracks the typed
  input, opening re-parses the input, `setSeedPickerHSVA`/real drags write the
  expected hex/rgba back into the input, alpha<1 produces `rgba()`,
  Esc/click-outside closes with focus returning to the trigger, arrow-key
  nudging works, and it functions at a mobile viewport with a real touch drag.

## Persistence

Per `docs/conventions.md` § "Persist UI state (localStorage)" (hat-picker is
the exemplar). Versioned key **`color-designer:v1`**. Persisted: the harmony
`<select>` value, the **mood `<select>` value**, colors-per-scheme **N**, the
seed colors, and the **last-generated roll** — its schemes (the actual colors),
which algorithm and mood were used, and which scheme was expanded. A roll is
random and can't be deterministically recomputed from its inputs, so restoring
"where the user left off" means persisting the rolled result itself, not just the
settings that produced it. `mood` is validated on restore against the known keys
(plus `'surprise'`); an absent mood (older `v1` blobs) reads as `'any'`, so the
key stays `v1`.

Also persisted in the same key: **pins** (`locked`, `{ "s:c": color }`), the
**roll seed** string, the **vision preview** + **demo speed** prefs, and the
**roll history** (recent rolls + pointer). The **saved-palette shelf** lives in a
separate key **`color-designer:saved:v1`** (an array of named entries). A
**shared-link hash** takes precedence over stored state on load, then is applied
into `localStorage` as the new baseline (see § Feature set → Shareable links).

- **Save on change:** adding/removing/clearing a seed (including via a swatch
  ＋), changing harmony, mood, N, roll seed, vision, or demo speed, pinning/
  unpinning a swatch, every roll, history navigation, and expanding/collapsing a
  scheme each write the current state.
- **Restore on load:** if a stored, well-formed roll exists (right shape,
  5 schemes of exactly N colors each), it's rendered directly — including
  re-expanding the previously-open scheme and restarting its live demo —
  instead of the normal auto-roll. Missing/unreadable/malformed storage falls
  back to the normal fresh auto-roll, unchanged.
- **Best-effort + safe:** every `localStorage` read/write is wrapped in
  `try/catch` and degrades silently; the tool works fully with no stored
  state. Nothing secret is persisted (n/a here).

## Feature set (v10 — palette workflow)

Layered onto the roll/mood engine; each is pure-where-possible + `data-testid`-
covered. All theme- and reduced-motion-aware, responsive to 360px.

- **Pin / lock** — a 🔒 button top-right of each swatch toggles `state.locked`
  (`{ "s:c": color }`). `performRoll` calls the pure `applyLocks(schemes, locked)`
  after generation, so pinned slots survive re-rolls. Locks prune when N shrinks.
- **Roll history** — a bounded (20) stack of `{ rollResult, …settings }`; Back/
  Forward navigate it, a new roll truncates the forward tail. Persisted.
- **Seeded rolls** — a "Roll seed" field routes rolls through
  `makeSeededRng(str)` (`hashStringToInt` + `mulberry32`) for reproducibility;
  empty = `cryptoRng`. The seed rides along in shared links.
- **Export** — pure `exportPalette(scheme, format)` (CSS vars / SCSS / JSON /
  Tailwind / HEX / RGBA) into a per-scheme textarea, with Copy, Download (Blob +
  object URL), and PNG (offscreen `<canvas>`, no library).
- **Contrast** — pure `scorePairs(scheme)` + `contrastLabel` render a per-color
  "best readable text + WCAG grade" grid in the detail panel.
- **Hue wheel** — an inline SVG "explain this scheme" plot of each color's hue
  (from `anchorHues`/`rgbToHsl`) against a faint hue ring; theme-aware, scrolls.
- **Vision preview (CVD)** — pure `simulateCVD(color, type)` (fixed matrices)
  repaints swatches + demo as a *preview only*; palette data is never mutated.
- **Demo speed** — slow/normal/fast scales the auto-cycle interval; the hero card
  also freezes the cycle on hover and resumes on leave.
- **Shareable links** — `encodeShareState()` base64-encodes settings + the rolled
  palette (hex) + pins into `location.hash`; on load a valid hash wins over
  stored state and is then stripped (best-effort) so edits persist locally.
- **Saved-palette shelf** — "Save" stores the open scheme (its own localStorage
  key); items have inline-editable names, Load (shows it as scheme 1), and a
  confirm-guarded Delete.
- **Keyboard shortcuts** — one global handler (ignored while typing / a dialog is
  open): `R` roll, `1`–`5` expand, `←`/`→` demo step, `Esc` collapse, `?` help.

## Deliverables

- `tools/color-designer/index.html` — the tool.
- `tools/color-designer/README.md` — usage.
- `tools/color-designer/tests/` — `@playwright/test` suite incl. mobile coverage,
  plus `tests/unit/*.test.mjs` (`node --test`) for the pure logic.

## Out of scope / later rounds

- Non-HSL color spaces; smarter N-role spacing for large N (IDEAS #10); the
  screen `EyeDropper` API (IDEAS #11). Everything else from the earlier "later
  rounds" note (export, history, contrast UI, per-color locks) shipped in v10.
