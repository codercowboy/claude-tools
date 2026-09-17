# color-designer

A single-file, dependency-free HTML tool that generates **color schemes**
from color-theory math (HSL harmonies), optionally flavored by a **mood**
(Warm, Ocean, Sunset, Deep & moody, …). Optionally seed it with your own
colors, then roll — you get **five schemes** of a configurable number of
colors each (**2–10, default 4**), shown as swatch strips that expand into a
live demo, per-color copy fields, and copy-all output.

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works
fine served from a static file server if you'd rather.

The page **rolls automatically on load** so you always land on a populated
palette.

### Seed colors (optional, at the top)

Seed the generator with your own colors, or leave it empty for fully random
palettes.

- **Visual picker (primary):** the first control in the add-a-color row is a
  **swatch/eyedropper button** — its fill shows the current color. Click it to
  open a picker popup with a **saturation/value square**, a **hue slider**, and
  an **alpha slider**. Drag (mouse or touch) or focus a slider and use the
  **arrow keys** (Shift for bigger steps). Picking writes the color back into
  the text field; opening the picker starts from whatever color is currently in
  the text field. Close with **Esc** or by clicking outside.
- **Text entry:** type a hex or `rgba()` value and click **Add** (or press
  Enter). Each seed becomes a chip with its own **×** remove control (no
  confirmation — removing one chip is low-stakes). **Clear seeds** removes them
  all at once and is guarded by a confirmation dialog (Enter confirms,
  Esc/backdrop cancels).
- Adding or removing seeds doesn't reroll on its own — the **Roll again** button
  gives a little **wiggle** when you add a seed, nudging you to roll and see it
  mixed in.
- **Add a generated swatch as a seed:** hover (or keyboard-focus) any generated
  swatch and a small **＋** appears in its bottom-right ("Add as a seed color").
  Click it — or focus it and press **Enter/Space** — to promote that exact color
  to a seed chip up top; no reroll, just the same Roll-button wiggle nudge.
  Adding the same color twice is deduped to a single chip (compared by canonical
  `rgba()`, so different typed/picked forms of the same color don't stack).
- Per scheme, a roll mixes in **1 to 3** of your seeds (bounded by how many you
  have and by the colors-per-scheme count), each dropped into the generated slot
  whose hue is closest to the seed's — so the scheme still reads as a coherent
  harmony while genuinely using your color.

### Controls (below the seeds)

1. **Roll again 🎲** — generates five brand-new schemes. Works with zero seeds.
2. **Harmony** — pick an algorithm: **Random** (default), Complementary,
   Analogous, Triadic, Split-complementary, Tetradic, or Monochromatic. Changing
   it takes effect on the next roll.
   - In **Random** mode, each roll picks **one** algorithm and all five schemes
     in that roll use it — only the base hue (and seed mix) varies between them.
     A different re-roll may land on a different algorithm. The badge next to the
     controls always names the algorithm actually used.
3. **Mood** — a flavor layered *on top of* the harmony. Where harmony decides
   the **relationship** between hues, a mood decides their **territory and tone**
   — which slice of the wheel to start in, how saturated, how light or dark, and
   how much in-scheme contrast. The two compose, so e.g. "Deep & moody +
   Complementary" lands a dark navy against a golden opposite, while "Ocean +
   Complementary" stays in cool blue-greens.
   - **Any (classic)** (default) — no flavor; the original behavior.
   - **Surprise me 🎲** — picks one flavored mood for you each roll (never
     "Any"), shared by all five schemes, the way "Random" harmony picks one
     algorithm. The badge names the mood it landed on.
   - **Tone moods** (any hue): Warm, Cool, Soft pastels, Deep & moody, Muted,
     Neon.
   - **Theme moods** (locked to a hue neighborhood): Ocean, Sunset, Ice,
     Forest, Earthy.
   - The badge next to the controls reads **"Mood · Harmony"** (just the harmony
     name when the mood is "Any"). Changing the mood takes effect on the next
     roll.
4. **Colors per scheme** — choose **2–10** colors per scheme (**default 4**).
   Applies on the next roll.

### More controls (secondary row)

- **Roll history — ◀ Back / Forward ▶** — step through your recent rolls (up to
  20 kept) to return to one you liked. A fresh roll after going Back discards the
  "forward" entries, like an undo stack. History survives reload.
- **Roll seed** — type any text to make rolls **reproducible**: the same seed
  always produces the same roll (handy with **Copy link**). Leave it blank for a
  fresh random roll each time.
- **Vision preview** — repaint the swatches (and the live demo) as they'd look to
  someone with **protanopia / deuteranopia / tritanopia**. It's a preview overlay
  only — your actual colors, hex values, and exports are unchanged.
- **Demo speed** — Slow / Normal / Fast for the live-demo auto-cycle.
- **🔗 Copy link** — copies a URL with the whole palette + settings encoded in the
  hash. Opening it reopens this exact palette (no backend). The link is applied
  once on load, then the tool reverts to saving on this device.
- **💾 Save palette** — saves the open scheme to a **Saved palettes** shelf
  (stored on this device). Each saved item has an editable name, a **Load**
  button (which shows it as the first scheme so you can keep working from it), and
  a **Delete** (guarded by a confirm dialog).

### Pin / lock swatches

Hover (or keyboard-focus) any generated swatch and tap the **🔒** in its
top-right corner to **pin** that exact color in that slot. Pinned colors stay put
through every re-roll while the rest change — "keep the ones you love, roll the
rest." Tap again to unpin. Pins persist on this device and are dropped
automatically if you lower *Colors per scheme* below a pinned slot. (The **＋**
add-as-seed button stays in the bottom-right.)

### Keyboard shortcuts

Active when you're not typing in a field and no dialog is open:

| Key | Action |
|---|---|
| `R` | Roll again |
| `1`–`5` | Expand that scheme |
| `←` / `→` | Step the live demo (prev / next pairing) |
| `Esc` | Close the open scheme |
| `?` | Open this help |

### Schemes

Five collapsible rows, each a **centered** strip of ~50×50 swatches (one per
color) with their hex codes underneath. Click a row to expand it (only one is
open at a time). **On initial page load the first scheme auto-expands; every
re-roll collapses all of them** so you choose which to open. Expanding reveals:

- A **live demo** showing **every color in the scheme at once**: a heading/
  paragraph/button "hero" card, plus a full-width sample line for each of the
  scheme's colors (used as that line's background, paired with whichever
  scheme color has the best contrast against it — WCAG relative luminance),
  and a **swatch column** on the right showing all the *other* colors sitting
  against the current background. The current pairing slowly rotates with a
  crossfade (~7-8s) so you can see the colors combine in different ways, or
  use the **play/pause** and **prev/next** buttons under the demo to pause it
  and step through pairings yourself.
- **Per-color rows** — a swatch, a read-only RGBA field, and a read-only hex
  field, each with its own copy button (hover for a tooltip).
- **Copy-all** — two read-only textareas (RGBA and HEX, one value per line) with
  **Copy all** buttons, derived live from the scheme.
- **Contrast** — for each color used as a background, a chip showing the
  best-contrast scheme color as text on it, the exact ratio, and a **WCAG grade**
  (AAA / AA / AA Large / Fail).
- **Export** — a format dropdown (**CSS variables, SCSS, JSON, Tailwind, HEX list,
  RGBA list**) feeding a textarea, with **Copy**, **Download** (a real file), and
  **PNG** (renders the swatch strip to an image) buttons.
- **Hue wheel** — an inline SVG "explain this scheme" wheel plotting each color's
  hue against a faint color ring, so you can see the harmony's geometry.

Generated swatches **fade in** with a short staggered animation on load and every
re-roll. The fade-in, the demo's color-cycling, and the roll-button wiggle all
honor `prefers-reduced-motion` — motion-reduced users get the final state
immediately, and the demo starts **paused** (prev/next still work for manual
stepping).

### Color theory

Work happens in HSL. A harmony algorithm rotates a base hue `H` into a set of
**anchor hues**:

| Algorithm | Anchor hues | Anchors |
|---|---|---|
| Complementary | `H`, `H+180` | 2 |
| Analogous | `H-30`, `H`, `H+30` | 3 |
| Triadic | `H`, `H+120`, `H+240` | 3 |
| Split-complementary | `H`, `H+150`, `H+210` | 3 |
| Tetradic (square) | `H`, `H+90`, `H+180`, `H+270` | 4 |
| Monochromatic | `H` | 1 |

**Anchors are hues, not the color count.** A scheme's **N** colors (2–10) are
filled by cycling the anchor hues round-robin across the N slots and applying
lightness/saturation "roles" (dark shade, mid, light tint, vivid, muted) so a
scheme has variety and usable contrast regardless of how many anchors its
algorithm defines. That's why any N works, from a 2-color complementary pair up
to a 10-color spread.

### How a mood modulates the harmony

A mood is a small data row that adjusts the four things above without changing
the harmony's geometry:

- **Hue territory** — a mood may confine the base hue `H` to one or more arcs of
  the wheel (Ocean ≈ 175–230°, Sunset ≈ 335–45° wrapping through red). Tone
  moods leave `H` free.
- **Spread** — a multiplier on each harmony's hue **offsets** (the `+120`,
  `+180`, … above). Theme moods use a spread below 1 so their anchors stay near
  the arc and the palette still reads as that theme; tone moods use `1` (full
  harmony). Scaling the *original* offsets (not a wrapped shortest-angle diff)
  is what preserves the harmony — triadic's `+240` shrinks to `+96` at spread
  0.4, not to `-48`.
- **Saturation / lightness ranges** — replace the default base ranges, so
  pastels start light and desaturated, "Deep & moody" starts dark and rich, etc.
- **Role scale** — multiplies the role deltas, softening (pastel, ice) or
  exaggerating (deep) the light/sat swing *within* a scheme.

"Any (classic)" is a no-op mood: same hue freedom and ranges as before moods
existed, so the default output is unchanged. "Surprise me" resolves to one
randomly-chosen flavored mood per roll (shared by all five schemes).

### Accepted seed color formats

- Hex, with or without a leading `#`: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`.
- Functional `rgb()`/`rgba()`, comma syntax with optional alpha:
  `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`.
- Functional modern slash syntax, alpha required: `rgb(255 0 0 / 0.5)`.
- Not supported: named CSS colors, `hsl()`, and percentage channels.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. This tool grew
large enough to earn a build (see `docs/conventions.md` § "Build-assembled
tools"), so the code is authored under `source/` and inlined into the one file:

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (color math, moods, generation,
  export, WCAG, locks). Keeps the `PURE-LOGIC` sentinels so unit tests still work.
- `source/app.mjs` — the DOM wiring.

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It's assembled by a dependency-free Node build (see
  "Developing" above). The confirm dialog and the site footer are pasted-in shared
  components from `tools/include/`.
- Canonical formatting matches the sibling color tools: `rgba(r, g, b, a)` with
  0–255 integer channels and a trimmed alpha (always included, even when `a` is
  `1`); lowercase `#rrggbb` hex, or `#rrggbbaa` only when alpha is less than 1.
- For automated testing, the page exposes `window.__colorDesigner` with:
  - **Pure color math:** `parseColor`, `rgbaString`, `hexString`, `rgbToHsl`,
    `hslToRgb`, `rgbToHsv`, `hsvToRgb`, `relLuminance`, `contrastRatio`,
    `circularHueDistance`.
  - **Harmony/generation:** `anchorHues(algorithm, H, spread)`,
    `generateScheme(algorithm, seeds, count, rng, mood)`,
    `roll({ algorithm, seeds, count, rng, mood })`, `clampCount(n)`; deterministic
    entry points `rollWith({ algorithm, seeds, count, rngSeq, mood })`,
    `makeSeqRng(seq)`, and the production `cryptoRng()`.
  - **Moods:** the `MOODS` table and `MOOD_MAP` (both keyed by mood key),
    plus `moodBaseHue(mood, rng)`. `mood` accepts a key like `'ocean'`,
    `'any'` (classic), or `'surprise'`; `roll(...)` echoes the resolved mood
    back on its result as `.mood`.
  - **Moods (richer params):** a mood may optionally carry `anchorBias` (degrees
    to nudge non-base anchors) and `roles` (override the default light/sat role
    table). Both default off, so every shipped mood — and `MOOD_ANY` — is
    byte-identical to before.
  - **Seeded rolls & CVD:** `makeSeededRng(str)` (`hashStringToInt` + `mulberry32`)
    for reproducible rolls; `simulateCVD(color, type)` + `CVD_TYPES` for the
    color-blindness preview.
  - **Locks, contrast, export:** `lockKey(s, c)` / `applyLocks(schemes, locked)`;
    `scorePairs(scheme)`, `contrastGrade`, `contrastLabel`, `bestForegroundIndex`;
    `exportPalette(scheme, format)` + `EXPORT_FORMATS`.
  - **Seeds & UI:** `addSeed(str)`, `addSeedFromColor(color)` (the swatch **＋**
    action — deduped, wiggles, no reroll), `removeSeed(id)`, `clearSeeds()`
    (direct, non-modal — the UI's × and "Clear seeds" use the confirm dialog for
    the bulk case); `performRoll()`, `goHistory(delta)`, `toggleLock(s, c, color)`,
    `handleShareLink()`, `encodeShareState()`, `handleSavePalette()`,
    `loadSavedPalette(entry)`, `getSavedPalettes()`.
  - **Seed picker:** `openSeedPicker()`, `closeSeedPicker()`,
    `setSeedPickerHSVA({ h, s, v, a })` and a live `state.seedPicker` readback.
  - **State/output:** a live (non-cloned) `state` reference (incl. `state.count`,
    `state.moodSelect`, `state.locked`, `state.rollSeed`, `state.cvd`,
    `state.demoSpeed`, `state.history`/`state.historyIndex`); per-scheme
    derived-output getters `rgbaOutput(i)` / `hexOutput(i)`.
  This namespace has no effect on normal use.

- **Persistence:** seeds, harmony, mood, colors-per-scheme, pins, roll seed,
  vision/demo-speed prefs, the recent-roll history, and the last palette live in
  `localStorage` (`color-designer:v1`); the saved-palette shelf uses a separate
  `color-designer:saved:v1` key. A **shared link** (`#…` hash) takes precedence on
  load, then the tool reverts to device storage. Every read/write is
  try/catch-wrapped, so the tool works fully with storage disabled.

<!-- readme-footer: keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
