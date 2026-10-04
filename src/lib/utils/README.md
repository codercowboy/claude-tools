# ct lib — utils

The shared logic the claude-tools tools are built from: byte and hash helpers, a date/time engine, a ZIP writer, text-format converters, and image/canvas code. Each module is inlined into a tool's single-file `index.html` at build time — the build's `<<ct:module path>>` token strips the `export` keywords and pastes the code in — so nothing here ships as a runtime dependency. The pure, DOM-free modules are also importable under Node, which is how the tools unit-test their engines.

Every module has its own reference doc. This is the map; follow a link for the full API.

## Top-level — `src/lib/utils/`

- [`CtByteUtil`](./CtByteUtil.md) — byte-level utilities: [CRC-32](https://en.wikipedia.org/wiki/Cyclic_redundancy_check), [base64](https://developer.mozilla.org/en-US/docs/Glossary/Base64)/base64url codecs, a byte-size formatter, a hand-rolled MD5/SHA/HMAC hash engine, and random-byte/id generation.
- [`CtUtil`](./CtUtil.md) — small dependency-free runtime helpers: a Blob downloader, a debouncer, numeric guards, HTML/attribute escaping, versioned `localStorage` persistence, a hyperscript element factory, HiDPI-canvas setup, and a few pure text helpers.
- [`CtDateTimeUtil`](./CtDateTimeUtil.md) — duration formatters plus a timezone / calendar / date-math engine built on [`Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/API/Intl/DateTimeFormat).
- [`CtZipUtil`](./CtZipUtil.md) — a hand-rolled STORE-only (uncompressed) [ZIP](https://en.wikipedia.org/wiki/ZIP_(file_format)) writer, plus the little-endian field writers it uses.

## Formats — `src/lib/utils/formats/`

- [`CtCurl`](./formats/CtCurl.md) — an HTTP-request model with a [curl](https://curl.se/)/[wget](https://www.gnu.org/software/wget/) command parser and a multi-language code emitter.
- [`CtDiff`](./formats/CtDiff.md) — a text diff engine on the Myers O(ND) algorithm, with line-level, word-level, and unified-diff output.
- [`CtEscaper`](./formats/CtEscaper.md) — escape and unescape a string for roughly 20 syntactic contexts (HTML, code string literals, shells, SQL, URLs, and more).
- [`CtFormat`](./formats/CtFormat.md) — a structured-data conversion engine for JSON, CSV, TSV, YAML, `.properties`, and XML.
- [`CtMarkdown`](./formats/CtMarkdown.md) — a safe, deterministic Markdown-to-HTML renderer.
- [`CtPretty`](./formats/CtPretty.md) — a multi-language pretty-printer and minifier for JSON, YAML, HTML, CSS, SQL, and JavaScript.

## Image & canvas — `src/lib/utils/image/`

These lean on browser surfaces (a `<canvas>`, `Blob`/`File`, `MediaRecorder`); each doc states what it needs.

- [`CtCanvasCapture`](./image/CtCanvasCapture.md) — records a `<canvas>` to a video [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) using [`MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
- [`CtDither`](./image/CtDither.md) — reduces raw RGBA pixels to palette-index buffers by nearest-color, error-diffusion, or ordered ([Bayer](https://en.wikipedia.org/wiki/Ordered_dithering)) dithering.
- [`CtImagesToPdf`](./image/CtImagesToPdf.md) — a hand-rolled, zero-dependency [PDF](https://en.wikipedia.org/wiki/PDF)-1.4 writer that lays already-encoded JPEGs into a multi-page document.
- [`CtImageUtil`](./image/CtImageUtil.md) — image and canvas helpers: color conversion, a canvas-format registry, a large-image guard, crop-rectangle geometry, fit math, and a few runtime DOM helpers.
- [`CtVideoGif`](./image/CtVideoGif.md) — a hand-rolled, zero-dependency [GIF](https://en.wikipedia.org/wiki/GIF)89a encoder and decoder: median-cut quantization, [LZW](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Welch), and a frame compositor.

## Provenance

Most of these were promoted verbatim from individual tools once more than one tool needed them. [`PROVENANCE.md`](./PROVENANCE.md) records where each came from.
