# ascii-art

A single-file, dependency-free HTML tool that turns an **image** into **text
art** — entirely in your browser. Load an image (drag-and-drop or pick one) and
render it four ways, tune it live, and export as plain text, colored HTML, or
ANSI. Everything runs locally through the browser's native `<canvas>` — no
network requests, no uploads, nothing leaves your machine.

## Modes

- **ASCII (ramp)** — one character per cell from a brightness ramp (dense
  character = dark pixel). Choose a preset ramp or edit your own; the **first
  character maps to the darkest pixel**.
- **Unicode half-block (▀)** — each character stacks **two vertical pixels** as
  two colors (upper-half foreground + lower-half background), doubling vertical
  resolution. Always colored.
- **Braille (⠿)** — each character packs a **2×4 dot** cell (8 dots) for the
  highest spatial resolution. A **threshold** plus optional **dithering**
  (ordered Bayer 4×4 or Floyd–Steinberg) decide which dots are inked.
- **Colored ANSI** — turn on **Color** to carry per-cell color into the exports;
  pick **256-color** (safe) or **truecolor** (24-bit) ANSI depth.

## Export formats

- **`.txt`** — plain monospace text (copy or download).
- **`.html`** — a self-contained page with inline-styled colored spans
  (copy or download).
- **`.ans`** — ANSI escape codes for pasting into a terminal (copy or download).

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works served
from a static file server if you'd rather.

1. **Load an image.** Drop a file onto the dropzone or click it to choose one
   (`image/*`). A live preview of the text art appears.
2. **Pick a mode** — ASCII, Half-block, or Braille.
3. **ASCII ramp** — choose a preset (Standard, Detailed, Block shades, Simple,
   Binary) or type your own into the ramp box. Dark → light, left to right.
4. **Braille** — set the **threshold** and choose a **dither** to control which
   dots ink.
5. **Color & ANSI** — toggle **Color** (half-block is always colored) and choose
   the **ANSI color depth** for the ANSI export.
6. **Tune** — output width (characters), brightness, contrast, gamma, invert, and
   a **char-aspect** correction (monospace characters are roughly 2:1, so this
   keeps the art from looking vertically squashed). Everything updates live.
7. **Preview background** — flip the preview between a dark and a light
   background.
8. **Export** — copy or download the result as **.txt**, **.html**, or **.ans**.

Your settings (mode, ramp, width, adjustments, ANSI depth, preview background,
…) are remembered on this device between visits — the **images themselves are
never stored**.

### Limits & notes

- **Image only, for now.** Rendering video to a text animation (a `<video>` +
  seek) is a planned follow-up; this first pass is single-image.
- **Big widths make a lot of characters.** Output width is capped and the preview
  scrolls inside its own box. Colored HTML of a large grid is heavy (a span per
  color run).
- **ANSI depends on the terminal.** 256-color is the safe default; truecolor
  needs a capable terminal. The ANSI export pairs with the sibling
  `ansi-previewer` tool.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. The code is
authored under `source/` and assembled into the one self-contained file (see
`docs/conventions.md` § "Build-assembled tools"):

- `source/index.template.html` — the page shell + shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (ramps, luminance/adjust math,
  ASCII/half-block/braille cell renderers, braille bit-packing, dithering, and
  the text/HTML/ANSI serializers). Imported directly by the unit tests.
- `source/app.mjs` — the DOM / canvas downsampling / persistence / export
  wiring.

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then
  commit both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It uses only vanilla browser APIs
  (`FileReader`/`createObjectURL`, `<img>`, `<canvas>` 2D, `getImageData`), none
  of which are secure-context-only, so it also works over plain LAN HTTP.
- For automated testing, the page exposes `window.__asciiArt` with the pure
  functions (`renderCells`, `toAscii`, `toBraille`, `toAsciiCells`,
  `toHalfBlockCells`, `toBrailleCells`, `packBraille`, `cellsToText`,
  `cellsToHtml`, `htmlDocument`, `cellsToAnsi`, `rgbToAnsi256`, `charForLevel`,
  `luminance`, `adjustLevel`, `normLevel`, `computeSampleSize`), the
  deterministic entry points `loadImageFromDataURL(dataUrl, name)` and
  `render()`, and a `getState()` accessor. This namespace has no effect on normal
  use.

<!-- readme-footer: keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Licensed under the **[MIT License](https://github.com/codercowboy/claude-tools/blob/main/LICENSE)**. Any bundled third-party libraries are listed in the tool's in-app **License** dialog (footer) and in the repository's [`NOTICES`](https://github.com/codercowboy/claude-tools/blob/main/NOTICES) file.

Code by Claude &middot; Ideas by Jason, the ideas guy.
