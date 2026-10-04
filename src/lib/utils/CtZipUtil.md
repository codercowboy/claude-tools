# CtZipUtil

A hand-rolled STORE-only (uncompressed) [ZIP](https://en.wikipedia.org/wiki/ZIP_(file_format)) writer, plus the two little-endian field writers it uses.

`src/lib/utils/CtZipUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

`storeZip(files)` packs an array of named byte buffers into one standard `.zip` as a `Uint8Array`, with no compression. Everything the tools feed it (PNGs, ICO) is already compressed, so [STORE](https://en.wikipedia.org/wiki/ZIP_(file_format)#Compression_methods) (method 0) keeps the writer tiny and dependency-free while still producing an archive any extractor can open.

It depends only on `crc32` from `CtByteUtil.mjs` for the per-entry checksum. The module is DOM-free and Node-importable. Output is deterministic: DOS date/time fields are written as `0` (a fixed, valid-enough timestamp), so the same input always produces the same bytes. The archive is built as three sections per the spec: a local file header plus payload for each file, a central directory with one record per file, and an end-of-central-directory record.

## API

### `u16le(view, offset, value) → void`

Writes a 16-bit value little-endian into a [`DataView`](https://developer.mozilla.org/en-US/docs/Web/API/DataView). `value` is masked to 16 bits (`& 0xffff`).

- `view` — the target `DataView`.
- `offset` — the byte offset.
- `value` — the number to write.

```js
import { u16le } from './CtZipUtil.mjs';

const dv = new DataView(new ArrayBuffer(2));
u16le(dv, 0, 20); // writes 0x14 0x00
```

### `u32le(view, offset, value) → void`

Writes a 32-bit value little-endian into a `DataView`. `value` is coerced to unsigned (`>>> 0`).

- `view` — the target `DataView`.
- `offset` — the byte offset.
- `value` — the number to write.

```js
import { u32le } from './CtZipUtil.mjs';

const dv = new DataView(new ArrayBuffer(4));
u32le(dv, 0, 0x04034b50); // the local file header signature
```

### `storeZip(files) → Uint8Array`

Packs the given files into an uncompressed ZIP archive.

- `files` — an array of `{ name, bytes }`:
  - `name` — the entry's filename (a string). It is UTF-8-encoded via `TextEncoder`. When the encoded name has any byte above `0x7f`, general-purpose bit 11 (`0x0800`) is set on that entry, declaring the name UTF-8 so extractors don't mangle it.
  - `bytes` — the file contents. A `Uint8Array` is used as-is; anything else is wrapped with `new Uint8Array(f.bytes)`.
- Returns the complete archive as a `Uint8Array`.

Each entry's CRC-32 is computed over its data. Compressed and uncompressed sizes are both written as the data length (STORE), and the "version needed to extract" is 2.0.

```js
import { storeZip } from './CtZipUtil.mjs';

const zip = storeZip([
  { name: 'hello.txt', bytes: new TextEncoder().encode('hi there') },
  { name: 'favicon.ico', bytes: icoBytes }, // a Uint8Array
]);
// `zip` is a Uint8Array ready to download or write to disk.
```

## Notes

- STORE only. There is no deflate path, so a ZIP of already-uncompressed text is no smaller than the input plus header overhead. That is the intended trade: these tools zip pre-compressed image bytes where deflate would buy nothing.
- No per-file timestamps. Date and time fields are `0` by design, for deterministic output. Extractors show an epoch-ish or "invalid" date; that is expected.
- `name` is taken literally, including any `/` path separators, and is not sanitized. The caller owns naming (no traversal guards, no de-duplication).
- The writer emits the classic 32-bit ZIP structure (no Zip64), so it is bounded by the usual ~4 GB per-file and total-size limits. Not a concern for the icon/sprite payloads it was built for.
- The two little-endian writers are exported because both ICO and ZIP are little-endian formats; a consuming tool building an ICO can reuse them.
