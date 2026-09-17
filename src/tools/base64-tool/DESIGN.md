# base64-tool — Design

Author: Claude. Design lead: Jason. Source-of-truth spec.

## Summary

A single, self-contained `index.html` (vanilla, no build/deps/CDN) for
**Base64 / data-URI encoding and decoding**. Encode a pasted text or an uploaded
file into Base64, Base64URL, a `data:` URI, and a ready-to-paste JS snippet;
decode Base64/data-URI back to text or download it as a file. Everything is
local — no network, no CORS.

## Hard constraints

- **Ships as one file.** The committed `index.html` is fully self-contained — all
  HTML/CSS/JS inline, no external assets, no CDN, no npm dependencies, opens via
  `file://`. It is **build-assembled** from `source/` by the shared
  dependency-free Node build (`scripts/build-tool.mjs`, `npm run build`; see
  `docs/conventions.md` § "Build-assembled tools"). Author under `source/`
  (`index.template.html`, `styles.css`, `logic.mjs` = the pure engine, `app.mjs`
  = the DOM layer), run `npm run build`, commit the result. `npm test` runs
  `build --check` first so drift can't slip through.
- Vanilla browser APIs only (`FileReader`, `Blob`, `btoa`/`atob` with proper
  UTF-8 handling, `TextEncoder`/`TextDecoder`).
- No secure-context-only APIs. Responsive/mobile; icon tooltips; footer + OG +
  `preview.png`; per `docs/conventions.md`.

## Layout

1. **Header** — title + one-line description.
2. **Mode** — **Encode** / **Decode** (a segmented toggle or tabs).
3. **Input** (Encode): a **textarea** (paste text) AND a **file** picker +
   drag-drop target (either source; file wins if provided). Show the chosen
   file's name/size/detected MIME.
4. **Outputs** (Encode) — collapsible or stacked, each a read-only field with a
   **copy** button (+ tooltip):
   - **Base64** (raw).
   - **Base64URL** (`-`/`_`, no padding) — note the difference.
   - **`data:` URI** (`data:<mime>;base64,…`) — MIME from the file, or a chosen
     MIME for text (default `text/plain`).
   - **JS snippet** — a small ready-to-paste snippet using the data URI (e.g. an
     `<img>`/`fetch(dataURI)`/`Blob` example). Worker picks one clean, useful form.
5. **Decode mode** — a **textarea** to paste Base64 or a `data:` URI. On decode:
   - If a `data:` URI, parse its MIME; decode the payload.
   - Show the decoded **text** (when it's valid UTF-8 text) in a read-only area
     with copy; AND offer **Download as file** (Blob + object URL) with a sensible
     filename/extension from the MIME. Accept both standard and URL-safe Base64;
     tolerate whitespace/newlines. Invalid input → a clear inline error, no crash.

## Encoding details (get UTF-8 right)

- **Text → Base64:** encode via `TextEncoder` → bytes → Base64 (don't use raw
  `btoa(str)` on non-Latin1 text — it throws). Provide `encodeText`/`decodeText`
  that round-trip Unicode (emoji, accents) correctly.
- **File → Base64:** `FileReader.readAsArrayBuffer` → bytes → Base64 (and build
  the data URI with the file's `type`). Large files: warn/guard (Base64 inflates
  ~33%; cap what's rendered or note the limit so the UI stays responsive).
- **Base64URL:** map `+/`→`-_`, strip `=` padding; decode tolerantly.

## Accessibility & UX

- Real controls with labels; `aria-label`+`title` on icon buttons; visible focus;
  copy uses the shared clipboard pattern (+feedback). Announce results politely.
- Responsive: textareas/outputs scroll within their own containers; no page
  overflow; stacks on mobile.
- A "Clear" affordance; clearing a filled input is low-stakes (no modal needed).

## Testability

- `data-testid` on: mode toggle, text input, file input, each output field + its
  copy button, the decode input, decoded-text output + copy, download button,
  error message.
- `window.__base64Tool`: pure `encodeText(str)`, `decodeText(b64)`,
  `bytesToBase64(bytes)`, `base64ToBytes(b64)`, `toBase64Url(b64)`,
  `fromBase64Url(s)`, `parseDataUri(s)` → unit-testable Unicode round-trips,
  URL-safe handling, data-URI parsing, invalid-input handling. Inert for users.
- Tests: pure round-trips (incl. emoji/accents), URL-safe, data-URI parse,
  invalid input, plus a file encode via `setInputFiles` and a decode→download
  path; mobile coverage.

## Persistence

Per `docs/conventions.md` § "Persist UI state (localStorage)". Versioned key
`base64-tool:v1`. Persisted: the **mode** (Encode/Decode) and the raw text of
the **encode text-input** and the **decode input** textareas — saved on mode
toggle and on text-input change (debounced with the existing 150ms
render-debounce). NOT persisted: the uploaded file's bytes (too large /
inappropriate), and the four encode outputs / decoded output, which are
DERIVED — on restore they're recomputed by re-running
`renderEncodeOutputs()`/`renderDecodeOutput()` against the restored text, not
read back from storage. Every read/write is wrapped in `try/catch` and
degrades silently; with no stored state (or a throwing/unavailable
`localStorage`) the tool starts exactly as it does today — encode mode, both
inputs empty.

## Deliverables

- `tools/base64-tool/index.html`, `README.md`, `tests/` (@playwright/test + mobile).

## Out of scope (v1)

- Hex/URL/HTML entity encodings, gzip, encryption, multi-file/zip, streaming huge
  files. Keep it Base64/data-URI focused.

## Fixer notes (2026-08-30)

Two CSS bugs found by the tester (see `tests/TESTS.md`) were fixed, no markup
or JS changes:

- `[hidden] { display: none !important; }` added once near the top of the
  `<style>` block so the `hidden` attribute wins over the later unconditional
  `display` rules on `section`, `.file-info`, and `.output-field` — restoring
  the mode toggle's actual show/hide behavior, the empty file-info row hiding
  on load/after Remove, and `decode-text-col` hiding for binary decodes.
- `.output-field button` added to the `@media (max-width: 640px)` 44px
  `min-height` rule, alongside `.mode-toggle button` / `.actions-row button` /
  `.file-info button` / `.dropzone`, so the encode copy buttons and
  `decode-text-copy-btn` meet the mobile tap-target minimum.

Suite is 48/48 after the fix; footer sentinel hash unchanged
(`a97df085179a11175786e1d57d6c2a99`).
