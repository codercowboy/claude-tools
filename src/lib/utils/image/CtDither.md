# CtDither

Reduces raw RGBA pixels to palette-index buffers by nearest-color, error diffusion, or ordered ([Bayer](https://en.wikipedia.org/wiki/Ordered_dithering)) dithering.

`src/lib/utils/image/CtDither.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

This is the pure, DOM-free core an indexed-image tool needs to map a full-color image down to a fixed palette. Every function takes raw [RGBA](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) bytes plus a palette (an array of `[r, g, b]` triples) and returns a [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) of per-pixel palette indices, one byte per pixel. There is no canvas, document, or window. [`clampByte`](./CtImageUtil.md) is imported from `./CtImageUtil.mjs` so exactly one copy exists when a consumer inlines both modules. The module uses string concatenation instead of template literals so it can be inlined into a Web Worker source string.

## API

### `nearestColorIndex(r, g, b, palette) → number`

Returns the index of the palette entry closest to `(r, g, b)` by squared Euclidean distance in RGB space.

- `r`, `g`, `b` — numbers — the color channels (0–255).
- `palette` — array of `[r, g, b]` — the target palette.
- Returns the index (0-based) of the nearest entry. Scans from index 0 and keeps the first entry at the minimum distance; an exact match (distance 0) short-circuits the scan.
- Does not throw. An empty palette returns `0`.

```js
import { nearestColorIndex } from './CtDither.mjs';

const palette = [[0, 0, 0], [255, 255, 255], [255, 0, 0]];
nearestColorIndex(200, 10, 10, palette); // -> 2 (red)
```

### `floydSteinberg(rgba, width, height, palette) → Uint8Array`

Maps the image to palette indices using [Floyd–Steinberg](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering) error diffusion. The quantization error at each pixel is spread to not-yet-visited neighbours with the standard 7/16, 3/16, 5/16, 1/16 weights, scanning left-to-right, top-to-bottom. A float working buffer carries the error forward.

- `rgba` — `Uint8Array` / `Uint8ClampedArray` / array of RGBA bytes — length `width * height * 4`. The alpha channel is ignored.
- `width`, `height` — numbers — pixel dimensions.
- `palette` — array of `[r, g, b]`.
- Returns a `Uint8Array` of length `width * height`, one palette index per pixel.

```js
import { floydSteinberg } from './CtDither.mjs';

const width = 2, height = 2;
const rgba = new Uint8Array([
  10, 10, 10, 255,  245, 245, 245, 255,
  128, 128, 128, 255,  60, 60, 60, 255,
]);
const palette = [[0, 0, 0], [255, 255, 255]];
const indices = floydSteinberg(rgba, width, height, palette); // Uint8Array(4)
```

### `atkinson(rgba, width, height, palette) → Uint8Array`

Maps the image to palette indices using [Atkinson](https://en.wikipedia.org/wiki/Atkinson_dithering) error diffusion. Atkinson spreads only 6/8 of the error, 1/8 each to six neighbours (right, two-right, and the row below at offsets -1/0/+1 plus two-down). The remaining 2/8 is discarded, which gives higher contrast than Floyd–Steinberg. Same signature and return shape as `floydSteinberg`.

- `rgba` — RGBA bytes, length `width * height * 4`. Alpha ignored.
- `width`, `height` — numbers.
- `palette` — array of `[r, g, b]`.
- Returns a `Uint8Array` of `width * height` palette indices.

```js
import { atkinson } from './CtDither.mjs';

const indices = atkinson(rgba, width, height, palette);
```

### `bayerMatrix(order) → number[][]`

Builds a recursive ordered-threshold (Bayer) matrix. Starts from the 2×2 base and doubles until the side length reaches `order`.

- `order` — number — the desired matrix side length. Coerced with `| 0`. An order `<= 1` returns `[[0]]`. Only powers of two are meaningful; the exposed choices are 4 and 8.
- Returns a square 2D array of threshold values (0 to `side*side - 1`).
- Does not throw.

```js
import { bayerMatrix } from './CtDither.mjs';

bayerMatrix(2); // -> [[0, 2], [3, 1]]
bayerMatrix(4); // -> 4x4 ordered threshold matrix
```

### `bayer(rgba, width, height, palette, opts) → Uint8Array`

Ordered (Bayer) dithering. For each pixel it adds a threshold offset from the tiled Bayer matrix to the RGB channels before picking the nearest palette entry, which breaks up banding without diffusing error between pixels.

- `rgba` — RGBA bytes, length `width * height * 4`. Alpha ignored.
- `width`, `height` — numbers.
- `palette` — array of `[r, g, b]`.
- `opts.order` — number — Bayer matrix order. Default `4`.
- `opts.strength` — number — amplitude of the threshold offset. Default `64` (`BAYER_STRENGTH`, an internal constant). The per-pixel offset is `((matrix[y][x] + 0.5) / (size*size) - 0.5) * strength`, so it ranges over roughly `[-strength/2, strength/2)`. Pass `0` for no offset (plain nearest-color), or raise it for a stronger pattern. A value of `null`/`undefined` uses the default; `0` is honoured.
- Returns a `Uint8Array` of `width * height` palette indices.

```js
import { bayer } from './CtDither.mjs';

const indices = bayer(rgba, width, height, palette, { order: 4, strength: 64 });
```

## Notes

- Pure and DOM-free. All functions run under Node (`node --test` imports the module directly) and in the browser. Pulling pixels off a canvas and painting the result back is the caller's job.
- Input alpha is ignored throughout. These are intended for opaque frames.
- Distance is computed on raw RGB, with no gamma or perceptual weighting. Palette matching is "good enough" rather than color-accurate.
- `clampByte` comes from `./CtImageUtil.mjs`. The error-diffusion functions snap their float working buffer back into `0..255` with it before matching; `bayer` clamps the offset channel values the same way.
- `BAYER_STRENGTH` (64) is an internal default and is not exported. Pass `opts.strength` to change it.
