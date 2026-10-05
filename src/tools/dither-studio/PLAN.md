# Dither & Retro-Palette Studio — PLAN

Implementation plan derived from `DESIGN.md`. Order of work and the concrete
pieces each file carries.

## 1. `source/logic.mjs` (pure, DOM-free, exported)

Build in this order, each independently unit-testable:

1. Color utils: `hexToRgb`, `rgbToHex`, `clampByte`.
2. `PALETTES` table (bw, gameboy, nes, cga4, ega16, c64, pico8, eink7) +
   `grayscalePalette(n)`.
3. `nearestColorIndex` / `nearestColor` (squared-distance, early-out on 0).
4. `medianCut(rgba, n)` — histogram, longest-axis split at count-weighted median,
   count-weighted average per box (same shape as `video-gif`'s quantizer).
5. `mapNearest`, `indicesToRgba`.
6. `floydSteinberg`, `atkinson` (error-diffusion over a Float32 working buffer),
   `bayerMatrix(order)` + `bayer(...)` (ordered threshold perturbation).
7. `pixelScale(rgba, w, h, factor)` — area-average block downscale.
8. `buildBrightnessContrastLUT(brightness, contrast)`, `applyLUT`.
9. `paletteToHexList`, `paletteToGpl`.
10. Indexed-PNG sync helpers: `crc32` (table build once), `PNG_SIGNATURE`,
    `pngChunk`, `buildIHDRIndexed`, `buildPLTE`, `filterIndexRows`.

No backticks anywhere in this file (it is inlined into `app.mjs`); no
`<<ct:…>>`-looking text in comments.

## 2. `source/index.template.html`

Head (OG meta, palette tokens light+dark, token order base→controls→styles).
Body: header + `?` help button; dropzone; error/warning; a `loaded` section with a
`work` grid = controls column + preview column.

Controls (each a `.field`):
- Palette **source** select (Preset / Auto median-cut / Custom).
- Preset select (shown for Preset) + Grayscale-N slider (shown for grayscale).
- Auto-N slider (shown for Auto).
- Custom palette editable table (shown for Custom): rows of color input + hex text
  + remove `✕`; "Add color", "Load current palette", "Remove all".
- Dither select (none / FS / Atkinson / Bayer 4×4 / Bayer 8×8).
- Pixel scale slider (1–16).
- Brightness slider (−100…100), Contrast slider (−100…100).
- Output info line + actions: Export PNG, Export PNG-8, Copy palette, Download
  `.gpl`, Reset.

Preview column: before/after compare (processed canvas base, original canvas
clipped over left, divider handle) + a split range slider + a swatch strip of the
active palette.

Help overlay + dialog (`modal-close-x`, focus trap). Footer + copy.js + JbcConfirm.mjs
+ module script inlining `app.mjs`.

## 3. `source/styles.css`

Palette-agnostic look on top of base/controls includes: header, dropzone,
file-info, error/warning, the work grid (wide-screen `minmax` columns), fields,
the editable swatch table, the compare/preview (position-relative layers,
`image-rendering: pixelated`, divider handle), palette swatch strip, Help modal +
`modal-close-x`, `confirmDialog` theming vars, reduced-motion.

## 4. `source/app.mjs`

- DOM refs; `state` (image data + options); `DEFAULT_OPTIONS`.
- Persistence: `saveOptions`/`loadOptions` (options only), help-seen flags.
- Load/decode: file input + drag/drop → `Image` → draw to scratch canvas →
  `getImageData` → stash source RGBA + dims. `loadImageFromDataURL` test entry.
- `activePalette()` — resolve from mode/preset/grayscale/auto(median-cut on the
  pre-adjusted, pixel-scaled source)/custom.
- `process()` — LUT → pixelScale → palette → dither(indices) → `indicesToRgba` →
  put on processed canvas (small) ; draw original into before canvas; update swatch
  strip + output info. Debounced.
- Compare split: range slider + pointer drag set `--split`; clip-path on the before
  layer.
- Exports: `exportPng` (upscale via a nearest export canvas → toBlob), 
  `encodeIndexedPng` (async: `filterIndexRows` → `CompressionStream('deflate')` →
  assemble chunks → Blob), `copyPalette`, `downloadGpl`.
- Custom-palette table: render rows from `state.customPalette`, add/edit/remove,
  "load current", "remove all" (confirm).
- Reset (confirm) → clear image + defaults.
- Help modal (focus-trap pattern from image-converter).
- `window.__ditherStudio` = pure logic + `loadImageFromDataURL`, `process`,
  `getState`, `encodeIndexedPng`.

## 5. `package.json`, `README.md`

`@codercowboy/dither-studio` manifest (build/build:check/test/serve scripts,
playwright devDep). README: what it is, palettes, dither algorithms, indexed-PNG
note, privacy, "Developing (build from source)" section, verbatim readme-footer.

## 6. Build & self-check

`npm run build` then `npm run build:check` (both exit 0). A `node -e` self-check
importing `logic.mjs`: `nearestColor` picks the obvious palette entry, and a small
`floydSteinberg` pass is deterministic across two runs.

Out of scope for this pass (later): the Playwright/`node --test` suites and
`preview.png`.
