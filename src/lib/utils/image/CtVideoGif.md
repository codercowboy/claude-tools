# CtVideoGif

A hand-rolled, zero-dependency [GIF](https://en.wikipedia.org/wiki/GIF)89a encoder and decoder: median-cut quantization, palette mapping, variable-width [LZW](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Welch), and a full frame compositor.

`src/lib/utils/image/CtVideoGif.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

The module turns plain [RGBA](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) frame arrays into GIF89a bytes and back again, with no external library and no `document`/`window`. The encode path is a pipeline: build a shared global palette by [median-cut](https://en.wikipedia.org/wiki/Median_cut) over a sample of all frames, map or [Floyd–Steinberg](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering)-dither each frame to palette indices, then assemble the GIF (global palette, NETSCAPE2.0 looping, per-frame delay). The decode path parses a whole GIF87a/89a file and composites every frame onto the logical screen, honouring disposal methods, transparency, sub-rects, local color tables, and interlace. The usual entry points are `encodeFramesToGif` and `gifDecode`; the rest are the building blocks they use, exported so a tool can unit-test and reuse them. The module contains no template literals so it can be inlined verbatim into a Web Worker source string.

## API — high-level pipeline

### `encodeFramesToGif(rgbaFrames, opts, onProgress) → { gif, palette }`

Runs the full encode pipeline: sample, quantize to one shared palette, map/dither each frame, assemble.

- `rgbaFrames` — array of RGBA frame buffers (`Uint8ClampedArray` / `Uint8Array` / array), each `width * height * 4` bytes. Alpha is ignored (frames are treated as opaque).
- `opts.width`, `opts.height` — numbers — frame dimensions. Coerced with `| 0`.
- `opts.maxColors` — number — palette size, clamped to `2..256`. Default `256`.
- `opts.dither` — boolean — when `true`, each frame uses Floyd–Steinberg; otherwise nearest-color mapping. Default `false`.
- `opts.delayCs` — number — per-frame delay in centiseconds. Default `10` (100 ms).
- `opts.delaysCs` — array — optional per-frame delays, each overriding `delayCs` for its frame.
- `opts.loop` — number — loop count, `0` means infinite. Default `0`.
- `opts.sampleCap` — number — pixel budget for palette sampling. Default `50000`.
- `onProgress` — optional `fn({ phase, frame, total })`, with `phase` of `'quantize'`, `'map'`, or `'encode'`.
- Returns `{ gif: Uint8Array, palette: [[r,g,b], ...] }`.

```js
import { encodeFramesToGif } from './CtVideoGif.mjs';

// two 2x2 frames of RGBA bytes
const f0 = new Uint8Array(2 * 2 * 4).fill(0);
const f1 = new Uint8Array(2 * 2 * 4).fill(255);
const { gif, palette } = encodeFramesToGif([f0, f1], {
  width: 2, height: 2, maxColors: 16, dither: false, delayCs: 10, loop: 0,
});
// gif is a Uint8Array of GIF89a bytes
```

### `gifDecode(input) → { width, height, palette, backgroundIndex, loop, frames }`

Parses a GIF87a/89a file and composites every frame onto the logical screen.

- `input` — a `Uint8Array` (or an `ArrayBuffer`, wrapped automatically) of GIF bytes.
- Returns `{ width, height, palette, backgroundIndex, loop, frames }`:
  - `palette` — the global color table (`[r,g,b][]`) or `null`.
  - `loop` — the NETSCAPE loop count, or `null` when there is no such extension.
  - `frames` — array of per-frame objects: `{ delayCs, disposal, transparentIndex (-1 when none), left, top, width, height, interlaced, palette (local table | null), indices (Uint8Array of the sub-rect's palette indices, de-interlaced), rgba (Uint8ClampedArray, a full-screen composited snapshot) }`.
- Undecoded or transparent canvas pixels are transparent black (`0,0,0,0`).
- Throws an `Error` on bad magic (not `GIF87a`/`GIF89a`), an unexpected block marker, or a corrupt LZW stream (bad first code, dictionary overflow, invalid code). A missing trailer is tolerated.

```js
import { gifDecode } from './CtVideoGif.mjs';

const parsed = gifDecode(gifBytes); // gifBytes: Uint8Array
for (const frame of parsed.frames) {
  // frame.rgba is a full-screen composited snapshot, ready for putImageData
}
```

## API — quantization

### `quantize(rgbaPixels, maxColors) → [[r, g, b], ...]`

Median-cut color quantizer. Builds a de-duplicated RGB histogram, then repeatedly splits the color box with the widest channel range along its longest axis at the count-weighted median, until `maxColors` boxes exist (or nothing can be split further). Each box collapses to its count-weighted average color.

- `rgbaPixels` — RGBA bytes. Alpha ignored.
- `maxColors` — clamped to `2..256`.
- Returns a palette of `[r, g, b]` triples. Empty input returns `[[0, 0, 0]]`. If there are already fewer distinct colors than `maxColors`, they are returned as-is.

### `buildHistogram(rgba) → [{ r, g, b, count }, ...]`

Builds a de-duplicated RGB histogram (alpha ignored). Each distinct color carries its pixel `count`.

```js
import { quantize, buildHistogram } from './CtVideoGif.mjs';

const hist = buildHistogram(rgbaPixels);   // de-duplicated colors + counts
const palette = quantize(rgbaPixels, 64);  // up to 64 [r,g,b] entries
```

## API — palette mapping

### `nearestColorIndex(r, g, b, palette) → number`

Index of the palette entry closest to `(r, g, b)` by squared Euclidean distance. Scans from 0; an exact match short-circuits. An empty palette returns `0`.

### `mapToPaletteIndices(rgba, palette) → Uint8Array`

Maps every pixel to its nearest palette index, with a per-color cache so each distinct RGB value is matched once. Returns a `Uint8Array` of `rgba.length / 4` indices. Alpha ignored.

### `ditherFloydSteinberg(rgba, width, height, palette) → Uint8Array`

Maps the image to palette indices with Floyd–Steinberg error diffusion (7/16, 3/16, 5/16, 1/16 weights, left-to-right, top-to-bottom, float working buffer). Returns a `Uint8Array` of `width * height` indices.

```js
import { nearestColorIndex, mapToPaletteIndices, ditherFloydSteinberg } from './CtVideoGif.mjs';

const indices = ditherFloydSteinberg(rgba, width, height, palette);
```

### `samplePixels(frames, cap) → Uint8Array`

Concatenates a bounded sample of RGBA pixels drawn across all frames, with a stride chosen so the total stays under `cap` pixels (default `50000`). This keeps median-cut fast on large inputs. Sampled pixels are written with alpha forced to 255.

## API — GIF89a block writers

Each returns a plain array of byte values. `gif89aEncode` wires them together.

### `lzwEncode(indices, minCodeSize) → Uint8Array`

GIF variable-width LZW. Emits the raw code stream with LSB-first bit packing. `minCodeSize` is clamped to a minimum of 2 (the GIF spec floor). The caller frames the output into sub-blocks (see `toSubBlocks`). The dictionary is reset with a clear code when it reaches 4096 entries.

### `buildColorTable(palette, paddedSize) → number[]`

The global/local color table, padded to `paddedSize` entries (a power of two), each an RGB triple. Entries past the palette length are black.

### `buildGraphicControlExtension(delayCs, delaysCs, index) → number[]`

A Graphic Control Extension setting the per-frame delay in centiseconds, disposal method 0, no transparency. When `delaysCs` is an array with a value at `index`, that per-frame delay wins over the scalar `delayCs`. The delay is clamped to `0..65535`.

### `buildImageDescriptor(width, height) → number[]`

An Image Descriptor at `(0, 0)`, full frame, no local color table and no interlace.

### `buildNetscapeExtension(loop) → number[]`

The NETSCAPE2.0 Application Extension carrying the loop count (`0` is infinite, clamped to `0..65535`).

### `toSubBlocks(bytes) → number[]`

Frames a byte stream into the GIF sub-block format: chunks of at most 255 bytes, each length-prefixed, terminated by a `0x00` block.

### `gif89aEncode(frames, options) → Uint8Array`

Assembles a complete GIF89a from frames that are already palette-index arrays. A single global palette is shared by all frames.

- `frames` — array of per-pixel palette-index arrays (`Uint8Array` | `number[]`), each `width * height` long.
- `options.width`, `options.height` — numbers.
- `options.palette` — `[[r,g,b], ...]`. Default `[[0,0,0]]`.
- `options.delayCs` — per-frame delay in centiseconds. Default `10`.
- `options.delaysCs` — optional per-frame delay array (falls back to `delayCs`).
- `options.loop` — loop count, `0` infinite. Default `0`.
- Returns the GIF as a `Uint8Array`. The color-table size is the smallest power of two (2..256) that holds the palette.

```js
import { quantize, mapToPaletteIndices, gif89aEncode } from './CtVideoGif.mjs';

const palette = quantize(rgba, 256);
const frame0 = mapToPaletteIndices(rgba, palette);
const gif = gif89aEncode([frame0], { width, height, palette, delayCs: 10, loop: 0 });
```

## API — GIF decoding internals

### `lzwDecode(bytes, minCodeSize, expectedLength) → Uint8Array`

Inflates one image's already-de-sub-blocked LZW byte stream to palette indices, using prefix/suffix chains for the dictionary.

- `bytes` — the raw LZW stream (no sub-block framing).
- `minCodeSize` — the image's minimum code size (clamped to a minimum of 2).
- `expectedLength` — optional — stops decoding early and sizes/pads the result to this length. If the stream is short, the result is zero-padded to `expectedLength`.
- Returns a `Uint8Array` of palette indices.
- Throws an `Error` on a bad first code, dictionary overflow, or an invalid code.

## Notes

- Pure and DOM-free. The module runs under `node --test` and in the browser. Getting pixels into and out of a canvas is the caller's job.
- Alpha is dropped on encode. Frames are treated as opaque, and the encoder writes no transparency or disposal (disposal method 0, every frame full-size and fully overwriting the previous). Transparency and disposal 0–3 are handled only on the decode side.
- The shared global palette is built from a capped sample across all frames, so an encode with a tiny `maxColors` and high color variance can band. Raise `maxColors` or enable `dither`.
- `gif89aEncode` expects frames that are already palette indices of the exact length `width * height`; use `mapToPaletteIndices` or `ditherFloydSteinberg` to produce them, or call `encodeFramesToGif` to run the whole pipeline.
- The decoder's per-frame `rgba` is a full-screen composited snapshot (ready for `putImageData`), while `indices` is just that frame's sub-rect in palette-index form.
