# Dither & Retro-Palette Studio — DESIGN

Source-of-truth spec for `dither-studio` (image tool idea #5). Everything here is
implemented as a single-file, vanilla, zero-dependency, `file://`-safe web tool,
build-assembled from `source/` per `docs/conventions.md`.

## What it is

Load an image, reduce it to a limited color **palette** with an optional
**dithering** algorithm, optionally shrink it into **chunky pixels**, preview the
result against the original with a before/after split, and export a true-color
PNG, an indexed **PNG-8**, or the palette itself. This is a *style* tool (retro /
pixel-art / e-ink look), not a fidelity tool — a different job from the GIF
quantizer, whose median-cut approach it reuses.

Everything runs locally in the browser. The image never leaves the device.

## Core flow

1. **Load** — drop or pick an image (`accept="image/*"`). Decoded via
   `Image`/`createObjectURL`; pixels read through a `<canvas>` `getImageData`.
2. **Pre-adjust** — brightness and contrast sliders build a 256-entry LUT applied
   to the RGB channels before quantization.
3. **Pixel scale** — an integer downscale factor (1–16). The image is
   area-averaged down to `ceil(w/f) × ceil(h/f)`; all palette/dither math runs at
   that reduced resolution, then the result is nearest-neighbor scaled back up for
   chunky pixels (crisp, `image-rendering: pixelated`).
4. **Palette** — one of three sources:
   - **Fixed preset**: 1-bit B/W, Game Boy, NES, CGA (mode-4 hi), EGA-16, C64,
     PICO-8, e-ink 7-color, or Grayscale-N (N chosen with a slider, 2–64).
   - **Auto (median-cut)**: quantize the image itself to N colors (2–256), the
     same median-cut used by `video-gif`.
   - **Custom**: an editable table of hex swatches (add / edit / remove), matching
     Jason's editable-data-table style. Seeded from the current palette.
5. **Dither** — none / Floyd–Steinberg / Atkinson / ordered Bayer 4×4 / ordered
   Bayer 8×8. All deterministic given the same input → unit-testable.
6. **Preview** — a before/after split: the processed result underneath, the
   original clipped over the left portion, a draggable divider + a range slider
   controlling the split. Both layers share the same displayed box so pixels line
   up.
7. **Export**:
   - **PNG** (true-color) via `canvas.toBlob` at full (upscaled) resolution.
   - **Indexed PNG-8** — hand-assembled PNG (signature + IHDR color-type 3 + PLTE
     + IDAT + IEND, hand-rolled CRC32) whose IDAT DEFLATE stream comes from the
     browser's `CompressionStream('deflate')` (a zlib stream — valid PNG IDAT).
     Genuinely tiny for palette images. If `CompressionStream` is unavailable the
     button is disabled with a note.
   - **Palette** — copy/download a hex list, or download a GIMP `.gpl` file.

## Pure logic (`source/logic.mjs`, DOM-free, exported, unit-testable)

- `PALETTES` — ordered table of fixed presets `{ id, name, colors: [[r,g,b],…] }`.
- `hexToRgb(hex)` / `rgbToHex([r,g,b])` — `#rrggbb`, lowercase out.
- `grayscalePalette(n)` — N evenly spaced grays (2–256).
- `medianCut(rgba, n)` — histogram + longest-axis median-cut → palette (reused
  approach from `video-gif`; alpha ignored).
- `nearestColor([r,g,b], palette)` → nearest `[r,g,b]`; `nearestColorIndex(...)`.
- `mapNearest(rgba, palette)` → `Uint8Array` of palette indices (no dithering).
- `floydSteinberg(rgba, w, h, palette)` → indices (7/3/5/1 error diffusion).
- `atkinson(rgba, w, h, palette)` → indices (6 neighbors, 1/8 each, 3/4 total).
- `bayer(rgba, w, h, palette, { order, strength })` → indices (ordered, matrix
  from `bayerMatrix(order)`; order 2/4/8).
- `bayerMatrix(order)` — recursive normalized threshold matrix.
- `indicesToRgba(indices, palette)` → `Uint8ClampedArray` (alpha 255).
- `pixelScale(rgba, w, h, factor)` → `{ data, width, height }` (area-average).
- `buildBrightnessContrastLUT(brightness, contrast)` / `applyLUT(rgba, lut)`.
- `paletteToHexList(palette)` / `paletteToGpl(palette, name)`.
- Indexed-PNG helpers (sync, testable): `crc32(bytes)`, `pngChunk(type, data)`,
  `PNG_SIGNATURE`, `buildIHDRIndexed(w,h)`, `buildPLTE(palette)`,
  `filterIndexRows(indices, w, h)` (filter-type-0 scanlines). The async DEFLATE +
  assembly lives in `app.mjs` (`encodeIndexedPng`), calling these.

The dither functions return palette **indices** (not RGB) so they're the single
source of truth for both the on-canvas preview (`indicesToRgba`) and the indexed
PNG export — no double implementation, no desync.

## Canvas glue (`source/app.mjs`)

DOM refs, load/decode, the processing pipeline (LUT → pixelScale → palette →
dither → `indicesToRgba`), the before/after split UI, exports, the custom-palette
editable table, persistence, the Help modal, and the inert `window.__ditherStudio`
test hook.

## Options & persistence

Persist **options only** under `dither-studio:v1` (never image bytes): palette
mode + preset id, grayscale N, auto N, custom palette hex list, dither algorithm,
pixel scale, brightness, contrast, split position. First-load Help auto-shows once
(`dither-studio:help-seen:v1`). All `localStorage` access is `try/catch`,
degrading silently.

## Conventions applied

- Build-assembled: `index.template.html` + `styles.css` + `logic.mjs` + `app.mjs`
  → `index.html`. Token order: `base.css`, then `controls.css`, then the tool's
  own styles; `footer.html`, `copy.js`, `JbcConfirm.mjs` inlined; `logic.mjs` folded
  into `app.mjs` via `<<ct:inline logic.mjs>>`. `logic.mjs` contains **no**
  backticks / no `<<ct:…>>` token text in comments.
- controls.css (44px controls, `<select>` fix). Wide-screen layout: controls
  column + preview that grows with the viewport (`@media (min-width: 900px)`).
- First-load Help popup + `?` button, `role="dialog"`, focus trap, `✕`, Esc /
  backdrop close, focus return, reduced-motion.
- Destructive confirms via `confirmDialog`: "Remove all" swatches, and Reset (which
  discards the loaded image + restores default options). Removing a single custom
  swatch or the loaded image via its `✕` is an easily-reversible carve-out and
  skips the confirm (documented here).
- Copy via `ctCopy`/`ctFlash`. License surface + footer inlined for free.
- OG meta in `<head>`; `preview.png` referenced (added later).
- `data-testid`s on interactive elements; inert `window.__ditherStudio`.
- Package identity `@codercowboy/dither-studio`, `com.codercowboy`.

## Caveats / decisions

- **Indexed PNG-8 uses the browser's `CompressionStream`** for the DEFLATE pass
  (not hand-rolled deflate); everything else about the PNG is hand-assembled. This
  is an allowed browser API (like `canvas.toBlob`), works from `file://` and plain
  HTTP (not secure-context-gated), and yields genuinely tiny indexed files. When
  it's missing, the tool falls back to true-color PNG and disables the indexed
  button with a note.
- **Ordered (Bayer) dither strength** is a fixed, documented constant tuned for a
  general look; arbitrary custom palettes may want more/less. Floyd–Steinberg and
  Atkinson are parameter-free.
- **Large images**: processing runs at the (downscaled) pixel-scale resolution and
  is debounced. At pixel-scale 1 on a very large image the pass can be heavy; a
  soft warning suggests raising the pixel scale. No Worker (kept simple); the pass
  is user-triggered and debounced, not per-frame.
- No animated-GIF/AVIF output — out of scope (that's `video-gif` /
  `image-converter` territory).
