# CtImagesToPdf

A hand-rolled, zero-dependency [PDF](https://en.wikipedia.org/wiki/PDF)-1.4 writer that lays out already-encoded JPEG images into a multi-page document.

`src/lib/utils/image/CtImagesToPdf.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

The module takes JPEG bytes plus each image's pixel dimensions and returns a complete multi-page PDF as a [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array), one image per page, each embedded as a `/DCTDecode` ([JPEG](https://en.wikipedia.org/wiki/JPEG)) image XObject. It is DOM-free: image *encoding* stays in the caller, and this module only does page geometry, layout, and byte serialisation. Alongside the assembler it exports the geometry math (points and millimetre units, named page sizes, orientation, and contain/cover/actual/fit placement) and small numeric and PDF-formatting helpers, so a tool can preview layout before building the file. The typical entry point is `buildPdf`; `planPages` and `assemblePdf` are the two halves it wraps. [`formatBytes`](../CtByteUtil.md) is imported from `../CtByteUtil.mjs` and re-exported so this engine stays the single source of truth for the byte-size readout.

## API

### `MM_TO_PT`

Constant: points per millimetre (`72 / 25.4`). One PDF point is 1/72 inch. See [point (typography)](https://en.wikipedia.org/wiki/Point_(typography)).

### `PT_PER_PX`

Constant `1`. Maps image pixels to points at 72 dpi for "actual size" and "fit" placement.

### `PAGE_SIZES_PT`

An object of named portrait page sizes in PDF points: `a4`, `a3`, `letter`, `legal`, each `{ w, h }`.

### `DEFAULT_QUALITY`

Constant `0.85`. The fallback JPEG quality used by the quality helpers.

### `mmToPt(mm) → number` / `ptToMm(pt) → number`

Convert between millimetres and PDF points. A non-numeric argument is treated as `0`.

```js
import { mmToPt, ptToMm } from './CtImagesToPdf.mjs';
mmToPt(10); // -> 28.3464...
```

### `pdfNumber(n) → string`

Formats a number as a PDF real: a plain decimal with no exponent, trailing zeros trimmed, `-0` normalised to `0`. A non-finite value becomes `0`. At `|n| >= 1e21` (where `toFixed` would switch to exponential form) it emits the full integer decimal via `BigInt`, since a PDF real must never carry an exponent.

### `pdfEscapeString(str) → string`

Escapes a JS string for use inside a PDF literal string `( ... )`: backslash, parentheses, and the control characters `\r \n \t \b \f`. `null`/`undefined` becomes `''`.

### `pad10(n) → string`

Formats a number as a 10-digit zero-padded string (the xref offset format). Rounds, floors negatives to `0`.

### `strToBytes(s) → Uint8Array`

Encodes an ASCII/Latin1 string to bytes, masking each char code to `& 0xff`. PDF syntax is Latin1; binary streams are pushed as raw `Uint8Array`, never through this.

### `clampQuality(q) → number`

Clamps a quality to `[0, 1]`. Non-finite input returns `DEFAULT_QUALITY` (`0.85`).

### `percentToQuality(p) → number`

Converts a 0–100 percent to a 0–1 quality (clamped). Non-finite input returns `DEFAULT_QUALITY`.

### `qualityToPercent(q) → number`

Converts a 0–1 quality to a rounded 0–100 percent (quality clamped first).

```js
import { clampQuality, percentToQuality, qualityToPercent } from './CtImagesToPdf.mjs';
percentToQuality(85);   // -> 0.85
qualityToPercent(0.85); // -> 85
clampQuality(1.5);      // -> 1
```

### `formatBytes(bytes) → string`

Re-exported from `../CtByteUtil.mjs`. The shared human byte-size readout (space between number and unit, binary 1024 tiers, one decimal, capped at GB). See [CtByteUtil](../CtByteUtil.md).

### `applyOrientation(base, orientation, imgW, imgH) → { w, h }`

Applies an orientation to a base `{ w, h }` page size.

- `base` — `{ w, h }` — base size in points. Non-positive dimensions fall back to A4's.
- `orientation` — `'portrait'` | `'landscape'` | `'auto'`. `'auto'` matches the image's own aspect (landscape when `imgW > imgH`). Anything other than `'landscape'` is treated as portrait.
- `imgW`, `imgH` — numbers — used only when `orientation` is `'auto'`.
- Returns `{ w, h }` with the two dimensions swapped as needed to satisfy the orientation.

### `orientedPageSize(opts) → { w, h }`

Resolves the media-box size (points) for one image under the current options.

- `opts.pageSize` — `'a4'`/`'a3'`/`'letter'`/`'legal'` | `'custom'` | `'fit'`. `'fit'` sizes the page to the image plus margins (`imgW * PT_PER_PX + 2*marginPt`, same for height). `'custom'` uses `customWpt`/`customHpt`. An unknown key falls back to A4.
- `opts.orientation` — default `'auto'` (ignored for `'fit'`).
- `opts.imgW`, `opts.imgH` — image pixel dimensions.
- `opts.marginPt` — margin in points, default `0`.
- `opts.customWpt`, `opts.customHpt` — custom page size in points, default `0`.
- Returns `{ w, h }` in points.

### `computePlacement(opts) → { x, y, w, h, clip }`

Computes where the image is drawn on the page, in PDF coordinates (origin bottom-left), plus a clip rectangle equal to the content box (page minus margins) so `cover`/`actual` overflow is cropped rather than spilled.

- `opts.pageW`, `opts.pageH` — page size in points.
- `opts.imgW`, `opts.imgH` — image pixels (each forced to at least 1).
- `opts.margin` — margin in points, default `0`.
- `opts.fitMode` — `'contain'` (default) | `'cover'` | `'actual'`. `contain` scales to fit inside the content box; `cover` scales to fill and center-crops; `actual` draws at 1 px = 1 pt with no scaling.
- Returns `{ x, y, w, h, clip: { x, y, w, h } }`. The image is centered in the content box.

### `buildContentStream(image) → string`

Builds the PDF content stream that draws a single image XObject (`/Im0`) into its placement rectangle. The XObject occupies a unit square, so a `cm` matrix scales and translates it; a clip rectangle, when present, is applied first.

- `image` — `{ x, y, w, h, clip }` — a placement (as produced by `computePlacement` or `planPages`).
- Returns the content-stream source as a string.

### `planPages(images, options) → Array`

Plans each page: resolves its size and the image's placement rectangle.

- `images` — array of `{ jpegBytes: Uint8Array, width, height }`.
- `options` — `{ pageSize, orientation, marginMm, fitMode, customWmm, customHmm }`. Margins and custom sizes are given in **millimetres** here and converted to points internally.
- Returns an array of `{ pageWidth, pageHeight, image: { bytes, width, height, x, y, w, h, clip } }`. For `pageSize: 'fit'` the image is placed at the margin at its actual pixel size.

### `assemblePdf(pages, meta) → Uint8Array`

Serialises planned pages into a complete PDF-1.4 file: header with a binary-marker comment, Catalog / Pages / Info objects, then per page a Page, a Contents stream, and an Image XObject (`/DeviceRGB`, 8 bits per component, `/DCTDecode`), followed by a cross-reference table and trailer.

- `pages` — the output of `planPages`.
- `meta` — `{ title }` — optional document title, written into the Info dictionary (escaped).
- Returns the whole PDF as a `Uint8Array`.
- Object numbering: 1 Catalog, 2 Pages, 3 Info; page `i` uses `4+3i` (Page), `5+3i` (Contents), `6+3i` (Image).

### `buildPdf(images, options) → Uint8Array`

Convenience entry point: `planPages` then `assemblePdf` in one call, with defaults filled in.

- `images` — array of `{ jpegBytes: Uint8Array, width, height }`. The bytes must be a real JPEG, since each is embedded via `/DCTDecode` with no re-encoding.
- `options` — `{ pageSize, orientation, marginMm, fitMode, customWmm, customHmm, title }`. Defaults: `pageSize: 'a4'`, `orientation: 'auto'`, `marginMm: 10`, `fitMode: 'contain'`, `customWmm: 210`, `customHmm: 297`.
- Returns the PDF as a `Uint8Array`.

```js
import { buildPdf } from './CtImagesToPdf.mjs';

// jpegBytes is a Uint8Array of real JPEG data (encode it however you like)
const pdf = buildPdf(
  [{ jpegBytes, width: 1200, height: 800 }],
  { pageSize: 'a4', orientation: 'auto', marginMm: 10, fitMode: 'contain', title: 'My doc' }
);

// In a browser, hand the bytes to a Blob to download:
const blob = new Blob([pdf], { type: 'application/pdf' });
```

## Notes

- Pure and DOM-free. It runs under Node and in the browser. It does not encode images: the caller must supply JPEG bytes (for example from `canvas.toBlob('image/jpeg', q)` then `blob.arrayBuffer()`).
- JPEG only. Images are embedded as `/DCTDecode` with `/ColorSpace /DeviceRGB`. There is no PNG/alpha path; a CMYK or grayscale JPEG embedded as `DeviceRGB` may render with wrong colors.
- The embedded bytes are not validated. `buildPdf` trusts that `jpegBytes` is a decodable JPEG of the stated `width`/`height`. Wrong dimensions produce a stretched or mis-scaled image.
- Output is PDF 1.4. The writer emits a classic xref table and trailer (no object streams, no compression of the page content), which keeps it simple and deterministic.
- `title` is the only metadata written. The Producer is always `images-to-pdf`.
