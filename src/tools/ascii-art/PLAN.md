# ascii-art — PLAN

Implementation plan derived from `DESIGN.md`.

## 1. Pure engine — `source/logic.mjs` (DOM-free, exported)

1. Constants: `RAMPS` (named presets, each dark→light), `DEFAULT_RAMP`,
   `BRAILLE_BASE = 0x2800`, braille dot-bit table, `CHAR_HALF_BLOCK = '▀'`,
   `DEFAULTS` (mode/width/adjust/threshold/aspect…), width bounds.
2. Pixel helpers: `pixelAt(grid,x,y) -> {r,g,b,a}` (clamped/edge-safe),
   `luminance(r,g,b)` (Rec. 601).
3. Adjustment chain: `adjustLevel(v,{brightness,contrast,gamma})` →
   `normLevel(v,opts) -> t∈[0,1]` applying invert.
4. Ramp: `clampRamp(str)`, `charForLevel(t,ramp)`.
5. Cell renderers (return `{width, rows:[[{ch,fg,bg}]]}`):
   `toAsciiCells`, `toHalfBlockCells`, `toBrailleCells` (+ `packBraille(bits2x4)`,
   dither: none / Bayer 4×4 / Floyd–Steinberg). `renderCells(grid,opts)` dispatch.
6. Plain-text convenience: `toAscii(grid,opts)`, `toBraille(grid,opts)`.
7. Serializers: `cellsToText`, `rgbToAnsi256`, `cellsToAnsi(rows,opts)`,
   `cellsToHtml(rows,opts)` (coalesced spans), `htmlDocument(rows,opts)`.
8. Aspect: `computeSampleSize(mode,imgW,imgH,widthChars,charAspect)`.
9. `export { … }` everything above.

## 2. Markup — `source/index.template.html`

- `<head>`: charset/viewport, `<title>`, OG + Twitter meta, `<style>` with the
  palette `:root` (+ dark `@media`), then shared-CSS include tokens + the tool CSS.
- Header (title + subtitle + Help `?`), dropzone + hidden file input, error line.
- Loaded section: file-info row (name·dims·size·type + ✕), controls panel
  (mode select, color toggle, ANSI depth, width, ramp preset+text, invert,
  brightness/contrast/gamma ranges, braille threshold+dither, char aspect), and
  export rows (txt/html/ansi copy+download). Preview `<pre>` in a scroll container.
- Help overlay/dialog (✕, list of modes + exports + caveats).
- Footer + `copy.js` + `JbcConfirm.mjs` + `app.mjs` include tokens.

## 3. App wiring — `source/app.mjs`

- DOM refs; `state` (image bits transient; options persisted `ascii-art:v1`).
- Load: file input + drag/drop → `<img>` → `adoptImage`; `loadImageFromDataURL`
  test entry.
- `render()`: `computeSampleSize` → draw image to an offscreen canvas at pixW×pixH →
  `getImageData` → grid → `renderCells` → cache `lastRows` → paint preview
  (textContent vs innerHTML) → update counts. Debounced.
- Controls wiring updates state, toggles mode-specific control visibility, persists,
  re-renders. Ramp preset select swaps the ramp text; editing text sets custom.
- Exports: build text/html/ansi from `lastRows`; copy via `copy`/`flash` (JbcClipboardUtil);
  download via Blob + `<a download>`.
- Help modal (focus-trap pattern) + first-load auto-show. Reset (confirmed) / ✕.
- `window.__asciiArt` test hook (pure fns + `loadImageFromDataURL`, `render`,
  `getState`).

## 4. Styles — `source/styles.css`

Palette-driven, dark-capable; controls grid (controls left / preview right on wide
screens); monospace preview box with `overflow:auto`; Help modal + ✕; `confirmDialog`
theming vars; `[hidden]` display guard already from base.css.

## 5. README + build

- `README.md` (modes + export formats, usage, limits, "Developing (build from
  source)", verbatim readme-footer).
- `npm run build` → `index.html`; `npm run build:check` must pass.
- `node -e` self-check: `toAscii` of a known 2-px grid gives expected ramp chars;
  `packBraille` packs a 2×4 cell to the right codepoint.

## Out of scope this pass

Playwright e2e suite and `preview.png` (added by later pipeline stages).
