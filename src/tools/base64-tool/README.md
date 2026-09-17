# base64-tool

A single-file, dependency-free HTML tool for Base64 / data-URI encoding and
decoding. Encode pasted text or an uploaded file into Base64, Base64URL, a
`data:` URI, and a ready-to-paste JS snippet; decode Base64 or a `data:` URI
back to text or download it as a file. Everything runs locally in the
browser — no network requests, no CORS, nothing leaves your machine.

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works
fine served from a static file server if you'd rather.

### Encode

1. Either **type/paste text** into the text box, or provide a **file** (click
   the dropzone to pick one, or drag a file onto it). **A selected file
   always wins over the textarea** — the textarea's content is ignored (not
   cleared) while a file is set, and reappears once you remove the file with
   the **✕** button. The chosen file's name, size, and detected MIME type are
   shown once selected.
2. The **MIME type** field controls the `data:` URI's MIME when encoding
   text (default `text/plain`); it's disabled and ignored while a file is
   selected, since the file's own type is used instead.
3. Four outputs update live (debounced) as you type or change the file:
   - **Base64** — the raw, standard Base64 alphabet (`+`, `/`, `=` padding).
   - **Base64URL** — the URL/filename-safe alphabet (`-`, `_`), unpadded.
   - **`data:` URI** — `data:<mime>;base64,<data>`.
   - **JS snippet** — a ready-to-paste `fetch(dataURI).then(res => res.blob())`
     snippet for turning the data URI back into a `Blob` in your own code.
   Each has its own **copy** button.
4. **Clear** resets the text, file, MIME field, and all four outputs
   immediately (no confirmation — clearing here is low-stakes and easy to
   redo).

Files over **10 MB** are rejected with an inline error (Base64 inflates a
file by about a third, and building a much larger string into a textarea
would hang the page). Files over **2 MB** encode fine but show a brief
warning that it may take a moment.

### Decode

1. Paste **Base64**, **Base64URL**, or a full **`data:<mime>;base64,...`
   URI** into the box. Whitespace/newlines are tolerated, and both the
   standard and URL-safe alphabets are accepted (though not mixed together
   in the same string — that's rejected as ambiguous).
2. On a successful decode: the detected MIME type is shown; if the decoded
   bytes are valid UTF-8 text, they're shown in a read-only box with a copy
   button, otherwise a note explains the payload is binary. Either way,
   **Download as file** saves the decoded bytes as a `Blob`, with a filename
   extension guessed from the MIME type (falling back to `.bin`).
3. Invalid input (bad Base64 characters, a non-base64 `data:` URI, garbage
   text) shows a clear inline error and never crashes the page — fix the
   input and it recovers.
4. **Clear** resets the decode box and all decode outputs immediately (no
   confirmation, same reasoning as Encode's Clear).

Switching between **Encode** and **Decode** never clears the other side —
both keep their content so you can flip back and forth (e.g. encode
something, switch to Decode to sanity-check it, switch back).

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. This tool grew
large enough to earn a build (see `docs/conventions.md` § "Build-assembled
tools"), so the code is authored under `source/` and inlined into the one file:

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (Base64/Base64URL/data-URI
  encode/decode). Imported directly by unit tests.
- `source/app.mjs` — the DOM wiring (mode toggle, file handling, outputs).

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It's assembled by a dependency-free Node build (see
  "Developing" above).
- Text encoding/decoding goes through `TextEncoder`/`TextDecoder`, never raw
  `btoa(str)`/`atob()` on a JS string — so Unicode (accents, emoji, CJK)
  round-trips correctly instead of throwing or corrupting.
- For automated testing, the page exposes `window.__base64Tool` with the
  pure functions `encodeText(str)`, `decodeText(b64)`, `bytesToBase64(bytes)`,
  `base64ToBytes(b64)`, `toBase64Url(b64)`, `fromBase64Url(s)`,
  `parseDataUri(s)`, `normalizeBase64(input)`, `decodeInput(raw)` (throws a
  friendly `Error` on invalid input), and `extensionForMime(mime)`; the
  deterministic entry points `setMode(mode)`, `renderEncodeOutputs()`
  (async), and `renderDecodeOutput()`; and a live (non-cloned) `state`
  reference. This namespace has no effect on normal use.

<!-- readme-footer: keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
