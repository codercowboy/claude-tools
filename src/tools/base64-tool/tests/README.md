# base64-tool tests

Automated end-to-end tests for `tools/base64-tool/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test` is a `devDependency` of `tools/base64-tool/package.json`;
it is never referenced by `index.html`, which remains a single,
dependency-free file. The spec drives the finished page from the outside,
through its `data-testid` hooks and the `window.__base64Tool` test API (see
`../DESIGN.md` § Testability and `../PLAN.md` § 13).

## Running the tests

From `tools/base64-tool/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/base64-tool/` (or from the repo root) hoists `node_modules` to the
repo root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would. Because `file://` **is** a secure context, this
suite cannot exercise the `crypto.randomUUID`-over-plain-HTTP failure mode
directly — instead it grep-checks the source for any use of
`crypto.randomUUID` at all (this tool has none, so the check is a simple
regression guard, not a context simulation like `hat-picker`'s).

## What's covered

`base64-tool.e2e.mjs` (48 tests):

1. **Pure functions via `window.__base64Tool`:** `encodeText`/`decodeText`
   round-trip Unicode (emoji, accents, CJK, mixed, and the empty string)
   exactly, going through `TextEncoder`/`TextDecoder` rather than raw
   `btoa`/`atob`; `bytesToBase64`/`base64ToBytes` round-trip the full 0–255
   byte range and `base64ToBytes` throws on garbage input;
   `toBase64Url`/`fromBase64Url` map `+`/`/` to `-`/`_` and strip padding,
   verified against a byte sequence guaranteed (deterministically, not
   probabilistically) to contain both `+` and `/`, and `fromBase64Url`
   restores the exact original padded string; `parseDataUri` returns
   `{mime, isBase64, payload}` for a valid data URI, `null` for a
   non-data-URI string, and `{isBase64:false, ...}` for a data URI missing
   `;base64` (with `decodeInput` confirmed to reject that case);
   `decodeInput`/`normalizeBase64` tolerate embedded whitespace/newlines and
   accept URL-safe input with no padding, reject a mixed
   standard/URL-safe alphabet, and throw a friendly, non-empty `Error` on
   every invalid-input case tried (garbage, empty, whitespace-only, a bare
   truncated character).
2. **Encode UI — live outputs from typed text:** typing updates all four
   outputs (Base64, Base64URL, `data:` URI, JS snippet) to the exact
   expected values, live, after the ~150ms debounce, including as text is
   edited further; a custom MIME type changes the `data:` URI (text mode
   only); empty input leaves every output blank rather than emitting
   `data:text/plain;base64,` for nothing. All five copy buttons (four encode
   outputs + decode text) show ✅ feedback on click, revert to 📋 after
   ~1s, and are checked against the known-correct field value; a
   best-effort `navigator.clipboard.readText()` read-back is also attempted
   but not required to pass (file:// clipboard permissions can be
   unreliable), per `docs/conventions.md`'s copy pattern.
3. **File encode via `setInputFiles`:** a small, known 1×1 PNG (as an
   in-memory `{name, mimeType, buffer}` payload, no fixture file on disk) —
   the Base64 output decodes back to the file's exact bytes, the `data:` URI
   carries the file's MIME, and `encode-file-info` shows the filename and
   MIME; a UTF-8 text file with unicode content round-trips its exact string
   content; **file wins over typed text** — selecting a file changes the
   output away from the text-only encoding, and removing the file restores
   the original text-based output and re-enables the MIME field.
4. **Decode:** a known bare Base64 string and a known `data:` URI both
   decode to the correct text, with the correct detected MIME shown; binary
   (non-UTF-8) decoded data shows the binary note instead of the text
   output; **Download as file** is exercised via `page.waitForEvent
   ('download')` for both a text payload (`.txt`, content diffed byte-for-
   byte after `download.saveAs()`) and a binary PNG payload (`.png`,
   likewise byte-exact), and confirmed disabled until a decode succeeds;
   invalid input (garbage, and a length-unrecoverable URL-safe string) shows
   an inline `decode-error` with non-empty text, leaves Download disabled
   and the text output hidden, causes no `pageerror`, and the tool recovers
   cleanly on the next valid input.
5. **Large-input guard:** a synthetic 3MB `File` (between the 2MB soft-warn
   and 10MB hard-cap thresholds, assigned directly to
   `window.__base64Tool.state.encode.sourceFile` per the tester brief's
   "assert the threshold logic via the hook" allowance) still encodes
   successfully but shows `encode-warning`; an 11MB synthetic `File` (over
   the hard cap) is rejected with a `"too large"` `encode-error` and empty
   outputs, with no `pageerror` and the page still responsive to a normal
   encode afterward; a 14,000,004-character Base64 string (just over the
   ~10MB-equivalent `MAX_DECODE_B64_CHARS` limit) passed to `decodeInput`
   directly throws a `"too large" / "limit"` error, again with no crash and
   a normal decode still working right after.
6. **`data-testid` hooks + API shape + source-level regressions:** all 34
   documented `data-testid`s (`PLAN.md` § 13) exist exactly once;
   `window.__base64Tool` exposes exactly the 14 documented keys
   (`encodeText`, `decodeText`, `bytesToBase64`, `base64ToBytes`,
   `toBase64Url`, `fromBase64Url`, `parseDataUri`, `normalizeBase64`,
   `decodeInput`, `extensionForMime`, `setMode`, `renderEncodeOutputs`,
   `renderDecodeOutput`, `state`) with the correct types, and `state` is
   confirmed a live reference; the raw HTML source is grepped to confirm
   `crypto.randomUUID` never appears (this tool needs no random IDs, so this
   is a standing regression guard rather than a non-secure-context
   simulation); the pasted footer's sentinel hash is confirmed present,
   equal to the expected `a97df085179a11175786e1d57d6c2a99`, and
   byte-identical (independently recomputed md5) to its own declared hash.
7. **Mobile (~375×667, dpr2, touch):** real taps (not the
   `window.__base64Tool` hooks) drive mode switching (`aria-pressed` +
   section visibility), typing + live-encoding, and a copy button's ✅
   feedback; no horizontal page overflow at 375px (outputs populated) or at
   ~360px (decode section, populated); a tap-target size check (mode-toggle
   buttons, a copy button, the dropzone) against the ~44px minimum, using
   `expect.soft` so every control is measured and reported rather than
   stopping at the first failure; and an `elementFromPoint` hit-test guard
   (after `scrollIntoViewIfNeeded()`) proving nothing overlays
   `mode-encode-btn` or a copy button.

See `TESTS.md` for the run record and bugs found (this run surfaced real
product bugs — see below — that are documented there for the fixer, not
worked around here).
