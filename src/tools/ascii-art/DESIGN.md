# ascii-art — DESIGN

Source-of-truth spec for the **ASCII / Unicode Art Converter** (image → text art).
Idea #12 from `docs/image-video-tool-ideas.md` (Tier 1, all-three-proposed).

## What it is

A single-file, dependency-free HTML tool that loads an **image** and renders it as
**text art** — live, in the browser, nothing uploaded. Four render styles:

- **ASCII (ramp)** — each cell is a character from a brightness ramp (dense char =
  dark pixel). Editable/choosable ramp.
- **Unicode half-block (▀)** — each character packs **2 vertical pixels** as two
  colors (upper-half foreground + lower-half background), doubling vertical
  resolution. Always colored.
- **Braille (⠿)** — each character packs a **2×4 dot** cell (8 dots), the highest
  spatial resolution. Threshold + optional dithering decide which dots are inked.
- **Colored ANSI** — ASCII/half-block/braille output carrying per-cell color as
  ANSI escape codes (**256-color** or **truecolor**), for pasting into a terminal.

Color is a toggle that applies to ASCII and braille (half-block is always colored);
ANSI depth (256 / truecolor) governs the ANSI export.

## Scope / non-goals

- **Image in.** Video mode (a `<video>` + seek → text animation) is an explicit
  **stretch/out-of-scope** for this first pass; the note is surfaced in-tool.
- Vanilla, **zero dependencies**, works from `file://` and plain LAN HTTP. No
  secure-context-only APIs (no `crypto.randomUUID`, no WebCodecs).
- Pairs with the queued **ansi-previewer** (its ANSI export is that tool's input).

## Architecture (build-assembled)

Authored under `source/` and assembled into one self-contained `index.html` by the
repo build (see `docs/conventions.md` § "Build-assembled tools"). Files:

- `source/index.template.html` — page shell, OG meta, controls markup, Help modal.
- `source/styles.css` — the tool's palette + layout (dark-capable).
- `source/logic.mjs` — the **pure, DOM-free engine** (all text transforms). Imported
  directly by the unit tests and inlined into the shipped app by the build.
- `source/app.mjs` — DOM, canvas downsampling, persistence, export/copy wiring.

### The pixel grid contract

The pure logic never touches a canvas. `app.mjs` draws the loaded image onto a small
canvas at the sample resolution and hands the logic a **grid**:

```
grid = { width, height, data }   // data: RGBA bytes, length = width*height*4 (ImageData shape)
```

`app.mjs` picks the sample resolution per mode via `computeSampleSize(...)` so the
grid already has the right pixel count (ASCII: cols×rows; half-block: cols×2rows;
braille: 2cols×4rows). The logic just consumes it.

### Pure logic (`source/logic.mjs`) — exported, unit-tested

- **Ramps.** `RAMPS` presets (standard, blocks, simple, binary, …), each a string
  ordered **dark→light** (`ramp[0]` = darkest pixel). `charForLevel(t, ramp)` maps a
  normalized brightness `t∈[0,1]` to a ramp char (`index = round(t*(len-1))`).
- **Luminance & adjust.** `luminance(r,g,b)` (Rec. 601). `adjustLevel(v, opts)` applies
  brightness (add), contrast (scale about 128), gamma, then clamps 0..255.
  `normLevel(...)` = adjusted, inverted, normalized `t`.
- **Renderers → cells.** A **cell** is `{ ch, fg, bg }` (fg/bg = `{r,g,b}` or null).
  `renderCells(grid, opts)` dispatches on `opts.mode`:
  - `toAsciiCells(grid, opts)` — char from ramp; `fg` = pixel color when color on.
  - `toHalfBlockCells(grid, opts)` — `ch='▀'`, `fg`=top pixel, `bg`=bottom pixel.
  - `toBrailleCells(grid, opts)` — char from a 2×4 dot block via `packBraille(bits)`;
    `fg` = average color of the cell when color on. Threshold + dither
    (`none`/`bayer`/`floyd`).
- **Convenience.** `toAscii(grid, opts)` / `toBraille(grid, opts)` return the plain
  monochrome text (used by the self-check).
- **Serializers.** `cellsToText(rows)`, `cellsToHtml(rows, opts)` (coalesced
  inline-styled spans in a `<pre>`; `htmlDocument(...)` wraps a full downloadable
  page), `cellsToAnsi(rows, opts)` (256 via `rgbToAnsi256`, or truecolor; resets per
  line).
- **Aspect math.** `computeSampleSize(mode, imgW, imgH, widthChars, charAspect)` →
  `{ pixW, pixH, cols, rows }`. Characters are ~2:1 (taller than wide); `charAspect`
  (default **2.0**) corrects it so the art isn't vertically squashed.
- **Braille bit map.** dots 1-8 →
  `(0,0)=1 (0,1)=2 (0,2)=3 (0,3)=7 / (1,0)=4 (1,1)=5 (1,2)=6 (1,3)=8`; base U+2800.

### Controls (persisted, `ascii-art:v1`)

Mode (ascii/halfblock/braille) · color toggle · ANSI depth (256/truecolor) · output
width (chars) · ramp preset + editable ramp · invert · brightness · contrast · gamma
· braille threshold · braille dither · char aspect. Braille-only controls hide in
other modes; the ramp field hides outside ASCII. **Never** persist image bytes.

### Preview & export

- **Live preview** in a monospace box that scrolls inside its own container
  (`overflow:auto`); the page body never scrolls sideways. Monochrome → `textContent`;
  colored → coalesced `innerHTML` spans (with a chosen preview background).
- **Exports:** copy + download **.txt**, copy + download **.html** (self-contained,
  inline-styled), copy + download **.ans** (ANSI escapes). Buttons use the shared
  `copy`/`flash` (JbcClipboardUtil).

## Conventions applied

- Shared includes inlined by the build: `base.css`, `controls.css`, `footer.html`
  (with its License modal), `copy.js`, `JbcConfirm.mjs`.
- **First-load Help** popup (`ascii-art:help-seen:v1`), accessible modal with a ✕,
  Esc/backdrop close, focus trap, focus return; guarded by `[hidden]{display:none!important}`.
- Wide-screen: controls column + a preview that grows to fill available width.
- OG/Twitter meta + `preview.png` sibling (added later). HTML + README footers.
- Testability: `data-testid`s on interactive elements + an inert `window.__asciiArt`
  exposing the pure functions and deterministic entry points
  (`loadImageFromDataURL`, `render`, `getState`).

## Confirm carve-outs

- The **✕** on the file info removes the loaded image without a confirm (obvious
  inverse of loading; options untouched).
- **Reset** (discard image + restore default options) is **confirmed** when an image
  is loaded (mirrors image-converter).
- Editing the ramp text field / sliders is trivially reversible → no confirm.

## Caveats (surfaced in-tool)

- **Image only** this pass; video → text animation is a future add.
- Very large **widths** produce a lot of characters — the width is capped and the
  preview scrolls. Colored HTML of a big grid is heavy (span per color run).
- ANSI/truecolor rendering depends on the terminal; 256-color is the safe default.
