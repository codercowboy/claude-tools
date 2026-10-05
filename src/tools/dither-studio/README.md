# Dither &amp; Retro-Palette Studio

Load an image, reduce it to a limited color **palette** with optional
**dithering** and **chunky pixels**, compare the result against the original, and
export a true-color PNG, a tiny **indexed PNG-8**, or the palette itself.

A single self-contained `index.html` — open it straight from `file://`, no server,
no build, no dependencies. **Everything runs locally in your browser; the image
never leaves your device.**

This is a *style* tool (retro / pixel-art / e-ink look), not a fidelity tool. It
reuses the median-cut quantizer approach from `video-gif`, applied to still images.

## What it does

- **Load** an image (drop or click — PNG / JPEG / WebP / GIF / BMP).
- **Pick a palette** from one of three sources.
- **Dither** to trade color banding for texture.
- **Pixel-scale** into chunky retro pixels.
- **Pre-adjust** brightness and contrast.
- **Compare** with a draggable before/after wipe.
- **Export** a dithered PNG, an indexed PNG-8, or the palette (hex list / `.gpl`).

## Palettes

**Fixed presets**

| Preset | Colors |
| --- | --- |
| 1-bit Black &amp; White | 2 |
| Game Boy (DMG) | 4 |
| CGA (mode 4, high) | 4 |
| e-ink 7-color (ACeP) | 7 |
| EGA 16 | 16 |
| Commodore 64 | 16 |
| PICO-8 | 16 |
| NES (2C02) | 55 |
| Grayscale | N levels (2–64, slider) |

**Auto (median-cut)** — quantize the image itself to **N colors** (2–256) using the
same longest-axis median-cut used by the GIF maker.

**Custom** — an editable table of hex swatches: add, edit (color picker or hex
field), and remove colors. Seed it from the currently active palette with
"Load current".

## Dithering algorithms

- **None** — nearest palette color per pixel (hard banding).
- **Floyd–Steinberg** — classic error diffusion (7/16, 3/16, 5/16, 1/16).
- **Atkinson** — the early-Mac look; diffuses 6/8 of the error to six neighbors
  (lighter, higher-contrast).
- **Ordered — Bayer 4×4 / 8×8** — a fixed threshold matrix; a regular crosshatch
  texture with no error propagation. (Ordered dither strength is a tuned constant;
  see `DESIGN.md`.)

All algorithms are deterministic given the same input, and live in a DOM-free
`source/logic.mjs` that the unit tests import directly.

## Pixel scale

Downscales the image (area-averaging) by an integer factor of 1–16 **before**
palette reduction, then nearest-neighbor scales the result back up for crisp,
chunky pixels (`image-rendering: pixelated`). Great for a true low-res sprite look.

## Export

- **PNG** — the visible (upscaled, chunky) result as a true-color PNG via the
  native `canvas` encoder.
- **Indexed PNG-8** — a hand-assembled PNG (signature + `IHDR` color-type 3 +
  `PLTE` + `IDAT` + `IEND`, with a hand-rolled CRC32). The `IDAT` DEFLATE stream is
  produced by the browser's built-in `CompressionStream('deflate')` (a valid zlib
  stream). Because palette images have few colors and long flat runs, these files
  are **genuinely tiny** — often a fraction of the true-color PNG.

  > **Indexed-PNG note.** The DEFLATE compression itself uses the browser's
  > `CompressionStream` (an allowed browser API, like `canvas.toBlob`) rather than
  > a hand-rolled deflate. It works from `file://` and plain HTTP (it is *not*
  > secure-context-gated). Where `CompressionStream` is unavailable, the tool falls
  > back to true-color PNG and disables the indexed button with a note.

- **Palette** — copy the palette as a newline hex list, or download a GIMP `.gpl`.

## Privacy

No network, no uploads, no telemetry. Your **options** (palette, dither, pixel
scale, brightness/contrast, split position, custom palette) are remembered on this
device via `localStorage`; the **images themselves are never stored**.

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from
`source/` and must not be hand-edited.

- `source/index.template.html` — page shell + include tokens
- `source/styles.css` — tool styles (on top of the shared `base.css` / `controls.css`)
- `source/logic.mjs` — the pure, DOM-free engine (palettes, quantization,
  dithering, PNG helpers) — imported directly by the unit tests
- `source/app.mjs` — DOM / canvas / pipeline / export / persistence glue

```sh
npm run build         # assemble source/ -> index.html
npm run build:check   # verify index.html matches source/ (fails if stale)
npm install           # tool-local dev deps (@playwright/test) for tests
npm test              # unit (node --test) then e2e (@playwright/test)
npm run serve         # static server for http:// testing
```

Edit `source/`, run `npm run build`, and commit **both** the source and the
regenerated `index.html`.

<!-- readme-footer: paste at the bottom of each tool's README. Keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Licensed under the **[MIT License](https://github.com/codercowboy/claude-tools/blob/main/LICENSE)**. Any bundled third-party libraries are listed in the tool's in-app **License** dialog (footer) and in the repository's [`NOTICES`](https://github.com/codercowboy/claude-tools/blob/main/NOTICES) file.

Code by Claude &middot; Ideas by Jason, the ideas guy.
