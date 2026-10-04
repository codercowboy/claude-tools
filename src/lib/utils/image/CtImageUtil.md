# CtImageUtil

A grab-bag of image and canvas helpers: color conversion, a canvas-format registry, a large-image guard, crop-rectangle geometry, fit math, and a few runtime DOM helpers.

`src/lib/utils/image/CtImageUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

One module, built from several formerly separate files concatenated together: color primitives, canvas-format metadata, the image-limit checker, the crop-rect gizmo geometry, image fit helpers, and crop-rect interaction math. Most of it is pure and DOM-free (a value in, a value out), so it runs under `node --test`. One section needs the DOM (`Image`, `URL`, `<canvas>`) and is runtime-only: `loadImageFile`, `canvasToBlob`, `canvasToPngBytes`. Every function and constant is both a named export and a static on the `CtImageUtil` class; the statics reference the same bindings, so there is one implementation. [`formatBytes`](../CtByteUtil.md) is imported from `../CtByteUtil.mjs` for the image-limit messages.

## API — color helpers

### `clampByte(v) → number`

Clamps a number to an integer in `0..255`. Fractional values are truncated via `| 0`; a non-numeric argument becomes `0` (`NaN < 0` and `NaN > 255` are both false, then `NaN | 0` is `0`).

```js
import { clampByte } from './CtImageUtil.mjs';
clampByte(300);   // -> 255
clampByte(-5);    // -> 0
clampByte(128.9); // -> 128
```

### `hexToRgb(hex) → [r, g, b] | null`

Parses a hex color string to an RGB triple. Accepts `"#abc"` or `"#aabbcc"` (the leading `#` is optional, case-insensitive, whitespace trimmed). A non-string or malformed value returns `null`.

```js
import { hexToRgb } from './CtImageUtil.mjs';
hexToRgb('#ff8800'); // -> [255, 136, 0]
hexToRgb('#f80');    // -> [255, 136, 0]
hexToRgb('nope');    // -> null
```

### `rgbToHex(rgb) → string`

Formats an `[r, g, b]` triple as `"#rrggbb"`. Each channel is clamped to a byte first.

```js
import { rgbToHex } from './CtImageUtil.mjs';
rgbToHex([255, 136, 0]); // -> "#ff8800"
```

### `parsePalette(list) → [[r, g, b], ...]`

Normalises a mixed list into clean RGB triples. Accepts hex strings and/or `[r, g, b]` arrays, dropping anything unparseable (a bad hex string, or an entry shorter than 3).

```js
import { parsePalette } from './CtImageUtil.mjs';
parsePalette(['#000', [255, 255, 255], 'bad']); // -> [[0,0,0],[255,255,255]]
```

## API — canvas formats

### `FORMATS`

An object of the raster formats a browser `<canvas>` can natively encode via [`toBlob`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob): `png`, `jpeg`, `webp`, each `{ mime, ext, label, lossy }`. PNG is lossless with alpha; JPEG and WebP are lossy. AVIF and animated GIF are deliberately absent (`canvas.toBlob('image/avif')` is not a supported encoder, and GIF would need a hand-rolled LZW encoder).

### `mimeForFormat(fmt) → string`

Returns the MIME type for a format key (case-insensitive). An unknown key falls back to PNG's MIME.

### `formatSupportsQuality(fmt) → boolean`

Returns `true` for the lossy formats (JPEG, WebP) that honour the `quality` argument to `toBlob`; `false` for PNG and unknown keys.

```js
import { FORMATS, mimeForFormat, formatSupportsQuality } from './CtImageUtil.mjs';
mimeForFormat('jpeg');          // -> "image/jpeg"
formatSupportsQuality('png');   // -> false
formatSupportsQuality('webp');  // -> true
```

## API — large-image guard

### `WARN_FILE_BYTES` / `MAX_FILE_BYTES` / `WARN_PIXELS` / `MAX_DIMENSION`

Exported thresholds: soft file-size warning at 8 MB, hard file-size reject at 40 MB, soft pixel-count warning at ~24 MP, hard per-side dimension reject at 20000 px.

### `makeImageLimitChecker(opts) → checkImageLimits`

Builds a configured guard. It is a factory because the one part that differs per tool gets injected once at configuration time: the verb in the warn copy and the dimension separator. The thresholds and logic stay shared.

- `opts.action` — string — fills "Large image — `<action>` may take a moment…". Default `'processing'` (for example `'converting'`, `'cropping'`).
- `opts.dimSep` — string — joins width and height in the too-large message. Default `'×'`.
- Returns a `checkImageLimits({ bytes, width, height }) → { level, message }` function.

The returned checker takes `{ bytes = 0, width = 0, height = 0 }` (width/height are optional, since dimensions are unknown until decode) and returns `level` of `'ok'`, `'warn'`, or `'error'` with a message. Every comparison is a strict `>`, so a value exactly at a threshold does not trip it. The file-size hard cap is checked first, then the dimension cap, then the soft warns, so an error always wins over a warn.

```js
import { makeImageLimitChecker } from './CtImageUtil.mjs';

const check = makeImageLimitChecker({ action: 'converting', dimSep: '×' });
check({ bytes: 50 * 1024 * 1024 });        // -> { level: 'error', message: 'Image too large ...' }
check({ bytes: 1000, width: 100, height: 100 }); // -> { level: 'ok', message: '' }
```

## API — crop-rect gizmo geometry

### `normalizeRect(rect) → { x, y, w, h }`

Returns a fresh rect with non-negative `w`/`h`. A handle dragged past the opposite edge produces a negative width or height; this flips the sign and shifts the origin so the rect stays well-formed.

### `HANDLE_IDS`

The eight resize-handle ids: `['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']`.

### `oppositeHandle(id) → string`

Returns the handle diagonally or axis-opposite the given one (the fixed anchor when the named handle is dragged). `'move'` and `'center'`, and any unknown id, map to `'center'`.

### `handlePoints(rect) → { nw, n, ne, e, se, s, sw, w, center }`

Returns the eight handle points plus the center, each `{ x, y }`, in the rect's own coordinate space. The rect is normalised first.

### `hitTestHandle(rect, px, py, tol) → string | null`

Hit-tests a pointer against the handles.

- `rect` — `{ x, y, w, h }`.
- `px`, `py` — pointer coordinates, in the same space as `rect`.
- `tol` — hit radius, default `10`.
- Returns the nearest handle id within `tol`; otherwise `'move'` when the pointer is inside the rect; otherwise `null`.

```js
import { handlePoints, hitTestHandle } from './CtImageUtil.mjs';

const rect = { x: 0, y: 0, w: 100, h: 50 };
hitTestHandle(rect, 2, 2, 10);   // -> "nw"
hitTestHandle(rect, 50, 25, 10); // -> "move"
hitTestHandle(rect, 500, 500);   // -> null
```

## API — image / canvas runtime helpers

These need the DOM and are never exercised by `node --test`.

### `loadImageFile(file, opts) → Promise<{ img, url, width, height }>`

Validates a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File), decodes it into an [`Image`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement), and resolves it.

- `file` — a `File`/`Blob`. Missing file rejects with `Error('No file')`.
- `opts.accept` — a `RegExp` or a predicate `fn(file) → boolean`. Default `/^image\//` (tested against `file.type`). A failing type rejects with `Error('Unsupported file type')`.
- `opts.revoke` — boolean — when `true`, the object URL is revoked right after decode. Default `false`.
- Resolves `{ img, url, width, height }` where `width`/`height` are `naturalWidth`/`naturalHeight` and `url` is the [object URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static). A decode failure rejects with `Error('Could not decode image')` (and revokes the URL).
- The caller owns `url` when `revoke` is not set: revoke it when done, or keep it as a thumbnail.

```js
import { loadImageFile } from './CtImageUtil.mjs';

const input = document.querySelector('input[type=file]');
const { img, url, width, height } = await loadImageFile(input.files[0]);
// ... use img, then:
URL.revokeObjectURL(url);
```

### `canvasToBlob(canvas, type, quality) → Promise<Blob | null>`

A promisified `canvas.toBlob` that never rejects. It resolves the `Blob`, or `null` when `toBlob` yields null or throws (for example an unsupported type). `type` and `quality` pass straight through.

```js
import { canvasToBlob } from './CtImageUtil.mjs';
const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9); // Blob or null
```

### `canvasToPngBytes(canvas) → Promise<Uint8Array>`

Encodes the canvas as PNG and resolves its bytes (`canvasToBlob` then `blob.arrayBuffer`). Rejects with `Error('canvas.toBlob returned null')` if the canvas could not be encoded.

```js
import { canvasToPngBytes } from './CtImageUtil.mjs';
const bytes = await canvasToPngBytes(canvas); // Uint8Array
```

## API — image fit helpers

### `coverRect(srcW, srcH, dstW, dstH) → { sx, sy, sw, sh }`

Returns the source sub-rectangle that "covers" a destination box: scale-to-fill, center-cropping the overflow. Draw it with `drawImage(img, sx, sy, sw, sh, 0, 0, dstW, dstH)`. Non-finite or `<1` inputs are guarded to at least 1.

### `containRect(srcW, srcH, dstW, dstH) → { x, y, w, h }`

Returns the destination-space rectangle that "contains" the source: scale-to-fit, centered (letterbox or pillarbox). Draw the whole source into it.

### `coverSrcRect(srcW, srcH, dstW, dstH, zoom, ox, oy) → { sx, sy, sw, sh }`

A pan/zoom variant of `coverRect`. The window is the cover window divided by `zoom`.

- `zoom` — number — clamped to `>= 1`; `1` equals `coverRect`. Default `1`.
- `ox`, `oy` — the window centre's offset from the source centre, in **source** pixels, clamped so the window never leaves the source. Default `0`.
- Returns the source sub-rect `{ sx, sy, sw, sh }`.

```js
import { coverRect, containRect, coverSrcRect } from './CtImageUtil.mjs';

coverRect(1920, 1080, 400, 400);          // center-crop square from a 16:9 source
containRect(1920, 1080, 400, 400);        // letterboxed rect inside a 400x400 box
coverSrcRect(1920, 1080, 400, 400, 2, 0, 0); // 2x zoom, centered
```

## API — crop-rect interaction

Builds on the gizmo geometry above (`normalizeRect`, `HANDLE_IDS`).

### `ASPECT_PRESETS`

An array of `{ id, label, ratio }` aspect presets: `free`, `1x1`, `4x3`, `3x2`, `16x9`, `9x16`, `5x7`, `8x10`, `4x6`, `custom`. `ratio` is the landscape width/height; `null` means free or custom.

### `aspectRatioFor(presetId, customW, customH, portrait) → number | null`

Resolves a preset id (plus optional custom dimensions) to a `w/h` ratio.

- `presetId` — a preset id. `'custom'` uses `customW`/`customH`.
- `customW`, `customH` — custom dimensions, used only for `'custom'`. A non-positive value returns `null`.
- `portrait` — boolean — when `true`, the ratio is inverted. Default `false`.
- Returns the ratio, or `null` for `free`/`custom` with bad inputs.

### `clampRectToImage(rect, iw, ih) → { x, y, w, h }`

Forces a rect inside `[0, 0, iw, ih]` with a minimum size of 1px per side. Non-positive-finite `iw`/`ih` fall back to 1.

### `constrainRectToAspect(rect, ratio, anchor) → { x, y, w, h }`

Adjusts a rect so `w/h === ratio`, holding one handle (or the center) fixed.

- `rect` — `{ x, y, w, h }`.
- `ratio` — target `w/h`. A non-positive-finite ratio returns `normalizeRect(rect)` unchanged.
- `anchor` — the handle held fixed, default `'nw'`. Corner and horizontal-edge anchors drive by width (`h = w/ratio`); vertical-edge anchors (`n`/`s`) drive by height (`w = h*ratio`); `'center'` keeps the center fixed.
- Returns the constrained rect.

### `resizeRaw(handleId, rect0, p) → { x, y, w, h }`

Computes the raw (unclamped, possibly negative `w`/`h`) rect when dragging `handleId` to point `p`, with the opposite edges of `rect0` fixed. Only the eight edge/corner handles resize; any other id (such as `'move'` or `'center'`) returns `rect0` unchanged.

- `handleId` — a handle id.
- `rect0` — the rect at drag start.
- `p` — `{ x, y }` — the current pointer position.
- Returns the dragged rect (feed it through `normalizeRect` / `clampRectToImage` before use).

```js
import { resizeRaw, normalizeRect, clampRectToImage } from './CtImageUtil.mjs';

const rect0 = { x: 10, y: 10, w: 100, h: 80 };
const raw = resizeRaw('se', rect0, { x: 150, y: 150 });
const clean = clampRectToImage(normalizeRect(raw), 800, 600);
```

## API — aggregator

### `class CtImageUtil`

Carries every named export above as a static (`CtImageUtil.hexToRgb`, `CtImageUtil.makeImageLimitChecker`, `CtImageUtil.loadImageFile`, and so on). Statics reference the named bindings, so there is one implementation. Not meant to be instantiated.

```js
import { CtImageUtil } from './CtImageUtil.mjs';
CtImageUtil.rgbToHex([0, 0, 0]); // -> "#000000"
```

## Notes

- Most of the module is pure and runs under Node. The three image/canvas helpers (`loadImageFile`, `canvasToBlob`, `canvasToPngBytes`) need the DOM and will not run under `node --test`.
- `clampByte` treats a non-numeric argument as `0` rather than throwing. The color helpers rely on this.
- `hitTestHandle` and the crop-rect functions assume pointer coordinates and rects share one coordinate space. Convert screen-to-image before calling if the canvas is scaled.
- The guard thresholds are intentionally generous (40 MB / 20000 px hard caps) and use strict `>`, so a value exactly at a cap passes.
- The module is assembled from several former single-purpose files (color, canvas formats, limit checker, rect gizmo, fit helpers, crop interaction); the section comments in the source name their origins.
