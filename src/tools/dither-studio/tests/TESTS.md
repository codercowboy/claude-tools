# dither-studio — tests

Two layers, both required (`npm test` runs `build:check` → unit → e2e).

## Unit (`node --test tests/unit/*.test.mjs`)

Pure, DOM-free logic imported straight from `../../source/logic.mjs` — no browser.

- **`palettes.test.mjs`** — every fixed preset is well-formed (`[0,255]` triples,
  unique ids) and matches its documented color count; `paletteById`;
  `hexToRgb`/`rgbToHex` round-trip + shorthand/case; `parsePalette` filters junk;
  `grayscalePalette(N)` has pure-black/white endpoints, N monotone entries, and
  clamps degenerate N; `nearestColorIndex`/`nearestColor` snap to the right
  index; `mapNearest` + `indicesToRgba` shapes.
- **`dither.test.mjs`** — for Floyd–Steinberg, Atkinson, Bayer-4 and Bayer-8:
  determinism across runs, non-mutation of the input buffer, `w*h` in-range
  indices, and a flat in-palette color mapping to its own index. Error-diffusion
  and ordered dither both mix a mid-grey across a B/W palette. `bayerMatrix(4)`
  equals the canonical recursive matrix; `bayerMatrix(4)`/`(8)` are permutations
  of `0..15` / `0..63` with `0` at the top-left.
- **`quantize.test.mjs`** — `buildHistogram` de-dupes/counts; `medianCut` yields
  ≤N in-range colors, is deterministic, returns exact colors below N, splits a
  black/white image into dark+light clusters, and degrades an empty buffer to
  black. `pixelScale` pass-through at 1, area-averages a 2×2 block, ceils dims.
  Brightness/contrast LUT: identity at 0, brightness lift/clamp, contrast about
  the 128 fixed point; `applyLUT` preserves alpha.
- **`png.test.mjs`** — `crc32` matches the canonical `"123456789" → 0xCBF43926`
  vector (and 0 for empty); `pngChunk` framing + CRC-over-type‖data; IHDR
  declares 8-bit color-type-3; PLTE = 3 bytes/entry; `filterIndexRows` prepends
  filter byte 0. `assembleIndexedPng` walks chunk-by-chunk to EOF
  (`IHDR·PLTE·IDAT·IEND`), and its IDAT — DEFLATE stood in by `node:zlib`, the
  same zlib stream the browser `CompressionStream` emits — **inflates back** to
  the exact filtered scanlines.

## E2E (`playwright test --config=tests/playwright.config.mjs`)

Drives the built `index.html` over `file://` via `data-testid`s and the inert
`window.__ditherStudio` hook. A synthetic gradient is generated in-page and fed
through `loadImageFromDataURL` — no fixture asset.

- Test-hook surface; load reveals name/dims; switching **palette** preset and
  **dither** mode changes the after-canvas pixels + palette strip; **pixel-scale**
  changes the processed backing-store dims; **auto** median-cut quantizes to ≤N.
- **Indexed PNG-8** export downloads `*-indexed.png` and re-encodes to a
  signature+IHDR(ct3)+PLTE-valid PNG; true-color PNG export; palette hex-copy and
  `.gpl` download.
- Custom-palette table add / load-current / remove-all (shared `confirmDialog`).
- Persistence: options-only (`dither-studio:v1`), restored on reload, no image.
- Responsive: no horizontal overflow at 1400px and 375px.
- First-load Help modal (auto-once, `✕`, focus trap, Esc/backdrop, focus return,
  `[hidden]` guard); License modal (MIT + "100% vanilla", Esc, the `[data-jbc-license]` trigger).

## Running

```sh
npm install && npx playwright install chromium
npm test            # build:check → unit → e2e
```
