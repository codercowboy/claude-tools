# CtByteUtil

Byte-level utilities: [CRC-32](https://en.wikipedia.org/wiki/Cyclic_redundancy_check), [base64](https://developer.mozilla.org/en-US/docs/Glossary/Base64)/base64url codecs, a parameterized byte-size formatter, a hand-rolled hash engine (MD5/SHA/HMAC), and random-byte/id generation.

`src/lib/utils/CtByteUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

This module merges five former files (`crc32.js`/`crc32.mjs`/`base64.mjs`/`formatBytes.mjs`/`hasher.mjs`) into one. Every helper is a named export defined once, and the `CtByteUtil` class at the bottom is a thin aggregator whose static members point at those same functions. A consumer imports whichever shape suits it: named imports for a pure `logic.mjs`, or the class for `CtByteUtil.crc32(...)` style calls.

The hashing functions are all hand-rolled rather than built on [Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) (`crypto.subtle`). That is deliberate: `crypto.subtle` is secure-context-only and throws over plain LAN HTTP and `file://`, which these tools must run under. The one platform API the module does lean on is [`crypto.getRandomValues`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues), and even there it falls back to `Math.random` when that is absent.

The module is DOM-free and Node-importable. The encoders and codecs rely only on globals present in both a browser and Node 16+ ([`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array), [`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder), [`atob`](https://developer.mozilla.org/en-US/docs/Web/API/Window/atob)/[`btoa`](https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa)), so `node --test` can import it directly.

## API

### `crc32(bytes) → number`

Computes the standard reflected CRC-32 (polynomial `0xedb88320`) over a byte sequence and returns it as an unsigned 32-bit integer. This is the exact checksum the [PNG](https://en.wikipedia.org/wiki/PNG) chunk format and the [ZIP](https://en.wikipedia.org/wiki/ZIP_(file_format)) local/central records require.

- `bytes` — `Uint8Array` or any indexed, `length`-bearing source of 0..255 values — the data to checksum.
- Returns the CRC-32 as an unsigned integer (`>>> 0`, so always 0..4294967295).
- Does not throw. An empty input returns `0`.

```js
import { crc32 } from './CtByteUtil.mjs';

const sum = crc32(new TextEncoder().encode('hello world'));
console.log(sum); // an unsigned 32-bit integer
```

### `crc32Hex(bytes) → string`

Same CRC-32 as `crc32`, formatted as an 8-character lowercase hex string (zero-padded).

- `bytes` — same as `crc32`.
- Returns the checksum as 8 hex chars, e.g. `"0d4a1185"`.

```js
import { crc32Hex } from './CtByteUtil.mjs';

crc32Hex(new TextEncoder().encode('abc')); // "352441c2"
```

### `base64UrlToBytes(input) → Uint8Array`

Decodes a [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5) (or standard base64) string to raw bytes. It strips whitespace, tolerates missing padding (URL-safe and JWT segments are unpadded by spec), maps the URL-safe alphabet (`-`/`_`) onto standard (`+`/`/`), then validates alphabet and length before decoding.

- `input` — the string to decode. `null`/`undefined` are coerced to `''`.
- Returns a `Uint8Array` of the decoded bytes.
- Throws an `Error` when the input is empty, has an invalid length (`length % 4 === 1`), contains characters outside the base64url alphabet, or fails `atob`. The messages say "segment" (the function's original JWT-decoding context), preserved verbatim so existing consumers' tests stay byte-stable.

```js
import { base64UrlToBytes } from './CtByteUtil.mjs';

base64UrlToBytes('aGVsbG8');        // Uint8Array for "hello" (no padding, fine)
base64UrlToBytes('aGVsbG8=');       // same, padded
// base64UrlToBytes('%%%') throws: "Segment contains characters outside the base64url alphabet."
```

### `utf8ToBase64(str) → string`

Encodes a JS string to standard base64 (with padding), UTF-8-safe.

- `str` — the string to encode.
- Returns a standard-base64 string.

`btoa` alone accepts only Latin1 and throws on multi-byte characters (accents, emoji), so the string is first encoded to UTF-8 bytes via `TextEncoder`, turned into a Latin1-safe binary string, then `btoa`'d.

```js
import { utf8ToBase64 } from './CtByteUtil.mjs';

utf8ToBase64('café 🎉'); // valid base64 of the UTF-8 bytes
```

### `formatBytes(bytes, opts?) → string`

Human-readable byte count for a file/blob size readout. This is the one byte formatter for the whole library. With no options it reproduces the historical logic-layer default exactly: an integer count with a `" B"` suffix below 1 KiB, otherwise one decimal place in [binary (1024)](https://en.wikipedia.org/wiki/Binary_prefix) tiers (KB, MB, GB, capped at GB), with a space between number and unit.

- `bytes` — the size. With no `invalid` option it is coerced via `Number(bytes) || 0`, so a non-numeric or `NaN` argument formats as `"0 B"`.
- `opts` — optional shape overrides (all optional; the default is byte-identical to the pre-parameterization function):
  - `base` — `1024` (default) or `1000` for a decimal-SI readout.
  - `decimals` — `1` (default), a number, or a `function(scaledValue) => number` that receives the scaled value so precision can vary by magnitude, e.g. `v => v < 10 ? 2 : 1`.
  - `space` — `true` (default) or `false` to drop the separator.
  - `units` — the ascending tier labels, default `['KB','MB','GB']`; the last one caps growth.
  - `byteUnit` — the sub-`base` unit label, default `'B'`.
  - `invalid` — a string returned verbatim for invalid input. When unset, invalid input coerces to `"0 B"` as above.
  - `invalidWhen` — a `predicate(bytes) => boolean` deciding what counts as invalid; consulted only when `invalid` is set. Defaults to `!Number.isFinite(bytes)` (catches `NaN` and `±Infinity`).
- Returns the formatted string.

Edge case worth knowing: with no `invalid` option, `±Infinity` is truthy, so `Number(bytes) || 0` does NOT coerce it to 0. It survives and tops out in the capped GB tier (`"Infinity GB"` / `"-Infinity B"`). Pass `invalid` to show a sentinel for non-finite input instead.

```js
import { formatBytes } from './CtByteUtil.mjs';

formatBytes(1536);                              // "1.5 KB"
formatBytes(1000000, { base: 1000 });           // "1.0 MB" (decimal tiers)
formatBytes(NaN, { invalid: '—' });             // "—"
formatBytes(5120, { decimals: v => v < 10 ? 2 : 1 }); // "5.00 KB"
```

### `textToBytes(str) → Uint8Array`

Encodes a string to its UTF-8 bytes via `TextEncoder`. `null`/`undefined` become `''` first.

```js
import { textToBytes } from './CtByteUtil.mjs';

textToBytes('abc'); // Uint8Array(3) [97, 98, 99]
```

### `bytesToHex(bytes) → string`

Encodes a byte array to a lowercase hex string (two chars per byte, no separator).

```js
import { bytesToHex } from './CtByteUtil.mjs';

bytesToHex(new Uint8Array([0, 255, 16])); // "00ff10"
```

### `bytesToBase64(bytes) → string`

Encodes a byte array to standard base64 (with `=` padding). Hand-rolled rather than via `btoa`, so it runs unchanged under `node --test`.

```js
import { bytesToBase64 } from './CtByteUtil.mjs';

bytesToBase64(new Uint8Array([104, 105])); // "aGk="
```

### `md5(msg) → Uint8Array`

Computes an [MD5](https://en.wikipedia.org/wiki/MD5) digest.

- `msg` — the message as a `Uint8Array`.
- Returns a 16-byte `Uint8Array` digest.

MD5 is broken for collision resistance. It is here for checksums and legacy interop, not security.

```js
import { md5, bytesToHex, textToBytes } from './CtByteUtil.mjs';

bytesToHex(md5(textToBytes('abc'))); // "900150983cd24fb0d6963f7d28e17f72"
```

### `sha1(msg) → Uint8Array`

Computes a [SHA-1](https://en.wikipedia.org/wiki/SHA-1) digest.

- `msg` — `Uint8Array`.
- Returns a 20-byte `Uint8Array` digest.

SHA-1 is also weak against collisions. Use SHA-256 or SHA-512 where integrity against an adversary matters.

```js
import { sha1, bytesToHex, textToBytes } from './CtByteUtil.mjs';

bytesToHex(sha1(textToBytes('abc'))); // "a9993e364706816aba3e25717850c26c9cd0d89d"
```

### `sha256(msg) → Uint8Array`

Computes a [SHA-256](https://en.wikipedia.org/wiki/SHA-2) digest.

- `msg` — `Uint8Array`.
- Returns a 32-byte `Uint8Array` digest.

```js
import { sha256, bytesToHex, textToBytes } from './CtByteUtil.mjs';

bytesToHex(sha256(textToBytes('abc')));
// "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
```

### `sha512(msg) → Uint8Array`

Computes a [SHA-512](https://en.wikipedia.org/wiki/SHA-2) digest, implemented with `BigInt` arithmetic masked to 64 bits.

- `msg` — `Uint8Array`.
- Returns a 64-byte `Uint8Array` digest.

```js
import { sha512, bytesToHex, textToBytes } from './CtByteUtil.mjs';

bytesToHex(sha512(textToBytes('abc'))); // 128 hex chars
```

### `hmac(hashName, keyBytes, msgBytes) → Uint8Array`

Computes an [HMAC](https://en.wikipedia.org/wiki/HMAC) ([RFC 2104](https://datatracker.ietf.org/doc/html/rfc2104)) over any of the module's hashes.

- `hashName` — `'md5' | 'sha1' | 'sha256' | 'sha512'`.
- `keyBytes` — the secret key as a `Uint8Array`. A key longer than the hash's block size is first hashed down; a short key is zero-padded to the block size.
- `msgBytes` — the message as a `Uint8Array`.
- Returns the MAC as a `Uint8Array` the size of the chosen hash's digest.
- Throws `Error('Unsupported hash for HMAC: ' + hashName)` for any other name.

```js
import { hmac, bytesToHex, textToBytes } from './CtByteUtil.mjs';

const mac = hmac('sha256', textToBytes('secret'), textToBytes('message'));
bytesToHex(mac); // 64 hex chars
```

### `getRandomBytes(n) → Uint8Array`

Returns `n` cryptographically-random bytes via `crypto.getRandomValues`, chunked past the 65536-byte per-call cap. Where `getRandomValues` is absent it falls back to `Math.random` (not cryptographically strong).

- `n` — the number of bytes.
- Returns a `Uint8Array` of length `n`.

It never calls the native `crypto.randomUUID()`, which is secure-context-only and throws over `file://` and plain-HTTP LAN.

```js
import { getRandomBytes } from './CtByteUtil.mjs';

const salt = getRandomBytes(16);
```

### `makeId() → string`

Returns a short, file://-safe id: `"s_"` followed by 16 hex characters, built from `getRandomBytes(8)`. Meant for DOM ids and object keys, not security tokens.

```js
import { makeId } from './CtByteUtil.mjs';

makeId(); // e.g. "s_3f9a1c08b27e45d1"
```

### `class CtByteUtil`

An aggregator class. Every static member references one of the named functions above (no reimplementation): `crc32`, `crc32Hex`, `base64UrlToBytes`, `utf8ToBase64`, `formatBytes`, `textToBytes`, `bytesToHex`, `bytesToBase64`, `md5`, `sha1`, `sha256`, `sha512`, `hmac`, `getRandomBytes`, `makeId`.

```js
import { CtByteUtil } from './CtByteUtil.mjs';

CtByteUtil.crc32Hex(CtByteUtil.textToBytes('abc')); // "352441c2"
CtByteUtil.formatBytes(2048);                        // "2.0 KB"
```

## Notes

- All hashes operate on a `Uint8Array`. Encode text first (`textToBytes` or `new TextEncoder().encode(...)`); the functions do not accept raw strings.
- MD5 and SHA-1 are present for checksums and interop, not for adversarial integrity. Reach for SHA-256/SHA-512/HMAC when it matters.
- `getRandomBytes` falls back to `Math.random` when `crypto.getRandomValues` is unavailable, so do not treat its output as cryptographically strong in that case.
- SHA-512 padding writes only the low 64 bits of the message bit-length; the upper 8 bytes stay zero. Fine for any real input a tool will hash.
- The source carries the `crc32` implementation once; `CtZipUtil.mjs` imports it from here, and the build hoists one copy into the shipped page.
