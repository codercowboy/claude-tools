# base64-tool — Implementation Plan

Author: Claude (planner). Implements `DESIGN.md` strictly; the worker should
not need to re-decide architecture. Cross-reference `tools/color-converter/`
and `tools/color-picker/` for the canonical copy-button / accessibility /
responsive patterns used by this repo (re-implement locally — single-file
rule, no imports).

**Design override, called out explicitly:** `docs/conventions.md` § "Destructive
actions require confirmation" normally requires the shared `ctConfirm` dialog
before clearing an input. `DESIGN.md` § "Accessibility & UX" for *this* tool
explicitly says: *"A 'Clear' affordance; clearing a filled input is low-stakes
(no modal needed)."* Since `DESIGN.md` is this tool's source of truth, both
Clear buttons (encode and decode) act **immediately, with no `ctConfirm`
dialog** — do not paste `tools/include/confirm.js` into this tool at all, it
is unused.

## 1. Overall file structure

One `index.html`:

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Base64 / Data URI Tool</title>
  <!-- OG + Twitter meta tags, see section 9 -->
  <style> ... all CSS ... </style>
</head>
<body>
  <header class="app-header">
    <h1>Base64 / Data URI Tool</h1>
    <p class="subtitle">Encode and decode Base64 and data: URIs — text or files, all local, nothing leaves your browser.</p>
  </header>

  <div class="mode-toggle" data-testid="mode-toggle" role="group" aria-label="Mode">
    <button type="button" data-testid="mode-encode-btn" aria-pressed="true">Encode</button>
    <button type="button" data-testid="mode-decode-btn" aria-pressed="false">Decode</button>
  </div>

  <section class="encode-section" data-testid="encode-section">
    ...text input, file input + dropzone, file info, mime input, clear,
    error, four output fields...
  </section>

  <section class="decode-section" data-testid="decode-section" hidden>
    ...decode textarea, clear, error, detected mime, decoded text + copy,
    download button...
  </section>

  <!-- pasted HTML footer, tools/include/footer.html (sentinels included) -->

  <script type="module">
    // see section 11 for internal organization
  </script>
</body>
</html>
```

Both sections exist in the DOM at all times (values persist across mode
switches); the inactive one is toggled with the `hidden` attribute (or a CSS
class) by the mode toggle, not conditionally rendered/destroyed. No
`ctConfirm` script is pasted (see the override note above) — this tool has no
bespoke or shared confirm dialog anywhere in it.

### Encode section skeleton

```html
<section class="encode-section" data-testid="encode-section">
  <div class="field">
    <label for="encodeTextInput">Text to encode</label>
    <textarea id="encodeTextInput" data-testid="encode-text-input" rows="6"
      placeholder="Paste or type text..."></textarea>
  </div>

  <label class="dropzone" for="encodeFileInput" data-testid="encode-dropzone">
    <input type="file" id="encodeFileInput" data-testid="encode-file-input" class="visually-hidden">
    <span>Drop a file here, or click to choose one</span>
  </label>

  <div class="file-info" data-testid="encode-file-info" hidden>
    <span class="file-name"></span> · <span class="file-size"></span> · <span class="file-mime"></span>
    <button type="button" data-testid="encode-remove-file-btn" aria-label="Remove file" title="Remove file">✕</button>
  </div>

  <div class="field">
    <label for="encodeMimeInput">MIME type (used for the data URI; ignored while a file is selected)</label>
    <input type="text" id="encodeMimeInput" data-testid="encode-mime-input" value="text/plain">
  </div>

  <button type="button" data-testid="encode-clear-btn">Clear</button>

  <p class="error" data-testid="encode-error" role="alert" hidden></p>
  <p class="warning" data-testid="encode-warning" role="status" aria-live="polite" hidden></p>

  <div class="output-field" data-testid="encode-base64-col">
    <label for="encodeBase64Output">Base64</label>
    <textarea id="encodeBase64Output" data-testid="encode-base64-output" readonly></textarea>
    <button type="button" data-testid="encode-base64-copy-btn" aria-label="Copy Base64" title="Copy Base64">📋</button>
  </div>

  <div class="output-field" data-testid="encode-base64url-col">
    <label for="encodeBase64UrlOutput">Base64URL (URL-safe, unpadded)</label>
    <textarea id="encodeBase64UrlOutput" data-testid="encode-base64url-output" readonly></textarea>
    <button type="button" data-testid="encode-base64url-copy-btn" aria-label="Copy Base64URL" title="Copy Base64URL">📋</button>
  </div>

  <div class="output-field" data-testid="encode-datauri-col">
    <label for="encodeDataUriOutput">data: URI</label>
    <textarea id="encodeDataUriOutput" data-testid="encode-datauri-output" readonly></textarea>
    <button type="button" data-testid="encode-datauri-copy-btn" aria-label="Copy data URI" title="Copy data URI">📋</button>
  </div>

  <div class="output-field" data-testid="encode-snippet-col">
    <label for="encodeSnippetOutput">JS snippet</label>
    <textarea id="encodeSnippetOutput" data-testid="encode-snippet-output" readonly rows="4"></textarea>
    <button type="button" data-testid="encode-snippet-copy-btn" aria-label="Copy JS snippet" title="Copy JS snippet">📋</button>
  </div>
</section>
```

### Decode section skeleton

```html
<section class="decode-section" data-testid="decode-section" hidden>
  <div class="field">
    <label for="decodeInput">Base64 or data: URI to decode</label>
    <textarea id="decodeInput" data-testid="decode-input" rows="6"
      placeholder="Paste Base64, Base64URL, or a data:... URI"></textarea>
  </div>

  <button type="button" data-testid="decode-clear-btn">Clear</button>

  <p class="error" data-testid="decode-error" role="alert" hidden></p>

  <p class="detected-mime" data-testid="decode-detected-mime" hidden></p>

  <div class="output-field" data-testid="decode-text-col" hidden>
    <label for="decodeTextOutput">Decoded text</label>
    <textarea id="decodeTextOutput" data-testid="decode-text-output" readonly></textarea>
    <button type="button" data-testid="decode-text-copy-btn" aria-label="Copy decoded text" title="Copy decoded text">📋</button>
  </div>

  <p class="binary-note" data-testid="decode-binary-note" hidden>
    Not valid UTF-8 text — use Download to save the decoded bytes as a file.
  </p>

  <button type="button" data-testid="decode-download-btn" disabled>Download as file</button>
</section>
```

## 2. State shape

```js
const state = {
  mode: 'encode',          // 'encode' | 'decode'
  encode: {
    sourceFile: null,      // File | null — when set, its bytes win over the textarea
  },
  decode: {
    last: null,            // { mime, bytes, text, isText } | null — result of the most recent successful decodeInput()
  },
};
```

- `encode.sourceFile` is the **only** piece of "which source wins" state —
  the textarea's own text is read directly from the DOM (`encodeTextInputEl.value`)
  whenever needed, never duplicated into `state`. "File wins if present" is
  implemented as: `getEncodeSourceBytes()` checks `state.encode.sourceFile`
  first and only falls back to the textarea when it is `null`.
- `decode.last` caches the most recent successful `decodeInput()` result so
  the Download button (a separate user action, not itself triggering a
  re-decode) always downloads exactly what's currently displayed, even if the
  textarea has since been edited but not yet re-rendered (debounce window).
- Both output textareas/fields are **derived views** recomputed from this
  state (plus the live DOM textarea values) on every relevant change — never
  hand-edited or partially patched, matching `docs/conventions.md` § "Derived
  views have a single source of truth".

## 3. Core pure functions (the `window.__base64Tool` surface, minus DOM actions)

All of these are pure (no DOM access), defined near the top of the module
script, before any rendering code. **UTF-8 correctness is the whole point —
never call raw `btoa(str)`/`atob()` on text directly; always go through
bytes.**

```js
// bytes <-> Base64 -------------------------------------------------------

// Chunked to avoid a stack-overflow from String.fromCharCode.apply on very
// large byte arrays (Function.prototype.apply has an argument-count limit).
function bytesToBase64(bytes) {
  const CHUNK = 0x8000; // 32k
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  let binary;
  try {
    binary = atob(b64);
  } catch {
    throw new Error('Invalid Base64 input.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// text <-> Base64, via TextEncoder/TextDecoder (NOT raw btoa/atob on the
// string — btoa throws on any code point outside Latin1, so straight
// `btoa(str)` silently breaks on accents/emoji/CJK). fatal:true makes
// TextDecoder throw on invalid UTF-8 instead of substituting U+FFFD, which
// is what lets decode mode tell "valid UTF-8 text" from "binary data".

function encodeText(str) {
  return bytesToBase64(new TextEncoder().encode(String(str ?? '')));
}

function decodeText(b64) {
  const bytes = base64ToBytes(b64);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // throws on invalid UTF-8
}

// Base64 <-> Base64URL ----------------------------------------------------

function toBase64Url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  let b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const rem = b64.length % 4;
  if (rem === 1) throw new Error('Invalid Base64URL length.');
  if (rem === 2) b64 += '==';
  else if (rem === 3) b64 += '=';
  return b64;
}

// data: URI parsing ---------------------------------------------------
// data:[<mime>][;param=value ...][;base64],<data>
// We only need mime + whether the payload is base64 + the raw payload text.

function parseDataUri(s) {
  const str = String(s ?? '').trim();
  const m = str.match(/^data:([^,]*),([\s\S]*)$/);
  if (!m) return null;
  const parts = m[1].split(';').filter((p) => p !== '');
  const isBase64 = parts[parts.length - 1] === 'base64';
  if (isBase64) parts.pop();
  const mime = parts[0] || 'text/plain';
  return { mime, isBase64, payload: m[2] };
}

// Tolerant normalization for pasted Base64: strips whitespace/newlines,
// accepts either the standard or URL-safe alphabet (not a mix of both — a
// string containing both '+/' AND '-_' is ambiguous and rejected), restores
// dropped padding, then validates the final charset.

function normalizeBase64(input) {
  let s = String(input ?? '').replace(/\s+/g, '');
  if (s === '') throw new Error('No input to decode.');
  const hasUrlSafe = /[-_]/.test(s);
  const hasStandard = /[+/]/.test(s);
  if (hasUrlSafe && hasStandard) {
    throw new Error('Mixed standard and URL-safe Base64 characters.');
  }
  if (hasUrlSafe) {
    s = fromBase64Url(s);
  } else {
    const rem = s.length % 4;
    if (rem === 1) throw new Error('Invalid Base64 length.');
    if (rem !== 0) s += '='.repeat(4 - rem);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw new Error('Contains characters outside the Base64 alphabet.');
  }
  return s;
}

// One entry point for the whole decode flow: accepts raw Base64/Base64URL OR
// a data: URI, returns the decoded bytes + best-effort text + detected mime.
// Throws a friendly Error on anything invalid — callers catch and display
// err.message.

const MAX_DECODE_B64_CHARS = 14_000_000; // ~10MB decoded (see section 6)

function decodeInput(raw) {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') throw new Error('Nothing to decode.');

  const parsed = parseDataUri(trimmed);
  let mime = null;
  let payload = trimmed;
  if (parsed) {
    if (!parsed.isBase64) {
      throw new Error('Only base64-encoded data: URIs are supported.');
    }
    mime = parsed.mime;
    payload = parsed.payload;
  }

  const clean = normalizeBase64(payload);
  if (clean.length > MAX_DECODE_B64_CHARS) {
    throw new Error(
      `Input too large to decode (${clean.length.toLocaleString()} characters, ` +
      `limit ${MAX_DECODE_B64_CHARS.toLocaleString()}).`
    );
  }
  const bytes = base64ToBytes(clean);

  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = null;
  }

  return { mime: mime || 'application/octet-stream', bytes, text, isText: text !== null };
}

// MIME -> file extension, for the Download button's filename.

const MIME_EXTENSIONS = {
  'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css', 'text/csv': 'csv',
  'text/markdown': 'md', 'application/json': 'json',
  'application/javascript': 'js', 'text/javascript': 'js',
  'application/xml': 'xml', 'text/xml': 'xml',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'application/octet-stream': 'bin',
};

function extensionForMime(mime) {
  const clean = String(mime || '').toLowerCase().split(';')[0].trim();
  if (MIME_EXTENSIONS[clean]) return MIME_EXTENSIONS[clean];
  const subtype = clean.split('/')[1];
  if (subtype) {
    const simple = subtype.split('+')[0].replace(/[^a-z0-9]/g, '');
    if (simple) return simple;
  }
  return 'bin';
}
```

Notes:

- `parseDataUri` and `normalizeBase64`/`decodeInput` deliberately keep the
  regex/parsing logic simple (this tool is Base64/data-URI focused, not a
  general MIME/RFC-2397 parser per `DESIGN.md` § "Out of scope").
- `decodeInput` is the single seam the decode UI calls — it never touches the
  DOM, so it's directly unit-testable via `page.evaluate` and also drives
  `renderDecodeOutput()` (section 6).
- `MAX_DECODE_B64_CHARS` (~14,000,000 chars ≈ 10MB of decoded bytes at the
  ~4:3 Base64 expansion ratio) mirrors `MAX_ENCODE_FILE_BYTES` (section 5) so
  encode and decode share the same real-world size ceiling.

## 4. Mode toggle

```js
function setMode(mode) {
  state.mode = mode;
  const isEncode = mode === 'encode';
  encodeSectionEl.hidden = !isEncode;
  decodeSectionEl.hidden = isEncode;
  modeEncodeBtn.setAttribute('aria-pressed', String(isEncode));
  modeDecodeBtn.setAttribute('aria-pressed', String(!isEncode));
  (isEncode ? encodeTextInputEl : decodeInputEl).focus();
}
modeEncodeBtn.addEventListener('click', () => setMode('encode'));
modeDecodeBtn.addEventListener('click', () => setMode('decode'));
```

Switching modes never clears the other section's content — both textareas,
the selected file, and the last decode result all persist so a user can
flip back and forth (e.g. encode something, switch to decode to sanity-check
it, switch back) without losing work.

## 5. Encode: inputs (text, file, drag-drop) and the MIME field

- `encodeTextInputEl` gets a debounced (`~150ms`, matching the
  `color-converter` convention) `input` listener that calls
  `renderEncodeOutputs()`.
- `encodeMimeInputEl` gets a debounced `input` listener that also calls
  `renderEncodeOutputs()` — it only affects the output when no file is
  selected (see `getEncodeMime()` below).
- The file `<input type="file">` is visually hidden and wrapped in a
  `<label>` (`data-testid="encode-dropzone"`) so clicking/tapping anywhere in
  the dropzone opens the native file picker with no extra JS. Its `change`
  event and the dropzone's `drop` event both funnel into one function:

```js
function setEncodeFile(file) {
  state.encode.sourceFile = file || null;
  updateFileInfo();
  renderEncodeOutputs();
}

encodeFileInputEl.addEventListener('change', () => {
  setEncodeFile(encodeFileInputEl.files[0] || null);
});

['dragenter', 'dragover'].forEach((evt) =>
  dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.remove('drag-over'); })
);
dropzoneEl.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) setEncodeFile(file);
});
```

- `updateFileInfo()` shows/hides `encode-file-info` and fills in name /
  human-readable size (`formatBytes`, e.g. `12.4 KB`) / `file.type ||
  'application/octet-stream'`; also disables/greys `encodeMimeInputEl` while
  a file is selected (it's ignored in that state, per DESIGN — "MIME from the
  file, or a chosen MIME for text").
- `encode-remove-file-btn` calls `setEncodeFile(null)` (clears the file
  input's `.value` too, so re-selecting the same filename still fires
  `change`) and re-enables the MIME field; falls back to encoding whatever is
  currently in the textarea.
- **File wins if both are present**: `getEncodeSourceBytes()` always checks
  `state.encode.sourceFile` first (section 6) — the textarea's content is
  simply ignored while a file is selected, not cleared, so removing the file
  reveals it again untouched.

### Large-file guard

```js
const MAX_ENCODE_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB hard cap
const WARN_ENCODE_FILE_BYTES = 2 * 1024 * 1024;  //  2 MB soft warning
```

- Over `MAX_ENCODE_FILE_BYTES`: `getEncodeSourceBytes()` throws immediately
  (before reading the file) with a clear message — `renderEncodeOutputs()`
  catches it, shows `encode-error`, and leaves the output fields empty. This
  keeps the tool from trying to build a >13MB Base64 string into a textarea
  (Base64 is ~4/3 the input size) and hanging the page.
- Between `WARN_ENCODE_FILE_BYTES` and `MAX_ENCODE_FILE_BYTES`: encoding
  proceeds, but `encode-warning` (a separate, non-error `aria-live="polite"`
  status element) shows something like *"Large file — this may take a
  moment."* Cleared on the next file/text change that no longer warrants it.
- The same 10MB ceiling underlies `MAX_DECODE_B64_CHARS` (section 3) so
  encode and decode agree on "how big is too big."

## 6. Encode: computing and rendering the four outputs

```js
async function getEncodeSourceBytes() {
  const file = state.encode.sourceFile;
  if (file) {
    if (file.size > MAX_ENCODE_FILE_BYTES) {
      throw new Error(`File too large to encode (${formatBytes(file.size)}, limit ${formatBytes(MAX_ENCODE_FILE_BYTES)}).`);
    }
    return new Uint8Array(await file.arrayBuffer());
  }
  return new TextEncoder().encode(encodeTextInputEl.value);
}

function getEncodeMime() {
  if (state.encode.sourceFile) return state.encode.sourceFile.type || 'application/octet-stream';
  return encodeMimeInputEl.value.trim() || 'text/plain';
}

async function renderEncodeOutputs() {
  hideEncodeError();
  updateEncodeWarning();
  const hasSource = state.encode.sourceFile || encodeTextInputEl.value !== '';
  if (!hasSource) { clearEncodeOutputs(); return; }
  try {
    const bytes = await getEncodeSourceBytes();
    const mime = getEncodeMime();
    const b64 = bytesToBase64(bytes);
    const b64url = toBase64Url(b64);
    const dataUri = `data:${mime};base64,${b64}`;
    encodeBase64OutputEl.value = b64;
    encodeBase64UrlOutputEl.value = b64url;
    encodeDataUriOutputEl.value = dataUri;
    encodeSnippetOutputEl.value = jsSnippet(dataUri);
  } catch (err) {
    showEncodeError(err.message);
    clearEncodeOutputs();
  }
}
```

- `hasSource` guards the empty-input case (nothing typed, no file) so the
  outputs are simply blank rather than showing `data:text/plain;base64,`
  for an empty string — a deliberate small UX choice, not an error state.
- **JS snippet** (one clean, universal form — works for any MIME, not just
  images): converting the `data:` URI back into a `Blob` via `fetch`, which
  is the standard trick for turning any data URI into binary usable from JS:

```js
function jsSnippet(dataUri) {
  return [
    '// Turn this data URI back into a Blob:',
    `fetch(${JSON.stringify(dataUri)})`,
    '  .then((res) => res.blob())',
    '  .then((blob) => {',
    '    // use `blob` here, e.g.:',
    '    // const url = URL.createObjectURL(blob);',
    '  });',
  ].join('\n');
}
```

- Every output textarea is `readonly` (not `disabled`) so it stays
  selectable/copyable directly, in addition to its copy button.

## 7. Decode: parsing, rendering, and Download

```js
function renderDecodeOutput() {
  hideDecodeError();
  const raw = decodeInputEl.value;
  if (raw.trim() === '') { clearDecodeOutputs(); return; }
  let result;
  try {
    result = decodeInput(raw);
  } catch (err) {
    showDecodeError(err.message);
    clearDecodeOutputs();
    return;
  }
  state.decode.last = result;
  decodeDetectedMimeEl.hidden = false;
  decodeDetectedMimeEl.textContent = `Detected type: ${result.mime}`;
  if (result.isText) {
    decodeTextColEl.hidden = false;
    decodeTextOutputEl.value = result.text;
    decodeBinaryNoteEl.hidden = true;
  } else {
    decodeTextColEl.hidden = true;
    decodeBinaryNoteEl.hidden = false;
  }
  decodeDownloadBtn.disabled = false;
}
```

- `decodeInputEl` gets the same `~150ms` debounced `input` listener calling
  `renderDecodeOutput()`.
- `clearDecodeOutputs()` hides the detected-mime line, the text output, the
  binary note, disables the Download button, and sets `state.decode.last =
  null`.
- **Invalid input never throws past this function** — every failure mode
  (bad Base64 charset, odd length, mixed alphabets, non-base64 data URI,
  oversized input, empty input) is a caught `Error` with a specific
  `.message`, rendered into `decode-error` (`role="alert"`) and nothing else
  changes. No uncaught exception, no blank white screen.

### Download as file

```js
function downloadDecoded() {
  const result = state.decode.last;
  if (!result) return;
  const blob = new Blob([result.bytes], { type: result.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `decoded.${extensionForMime(result.mime)}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
decodeDownloadBtn.addEventListener('click', downloadDecoded);
```

Works identically whether the decoded payload is text or binary — Download
is always offered once a decode succeeds, per `DESIGN.md`.

## 8. Copy buttons (shared pattern)

Re-implement the `color-converter` clipboard pattern verbatim (locally, no
import):

```js
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
  document.body.removeChild(ta);
  return ok;
}

const copyTimeouts = new WeakMap();
async function handleCopyClick(btn, text) {
  if (!text) return;
  const ok = await copyText(text);
  if (!ok) return;
  clearTimeout(copyTimeouts.get(btn));
  btn.textContent = '✅';
  copyTimeouts.set(btn, setTimeout(() => { btn.textContent = '📋'; }, 1000));
}
```

Wire one listener per copy button, reading the paired field's `.value` at
click time (never a stale closure):

```js
encodeBase64CopyBtn.addEventListener('click', () => handleCopyClick(encodeBase64CopyBtn, encodeBase64OutputEl.value));
// ...same for base64url, data URI, snippet, and decode-text-copy-btn
```

Every copy button is icon-only (📋), so each carries both `aria-label` and a
matching `title` (already shown in the skeleton in section 1) per
`docs/conventions.md` § Accessibility baseline.

## 9. Clear buttons (no confirm dialog — see the override note up top)

```js
encodeClearBtn.addEventListener('click', () => {
  encodeTextInputEl.value = '';
  encodeMimeInputEl.value = 'text/plain';
  encodeMimeInputEl.disabled = false;
  encodeFileInputEl.value = '';
  state.encode.sourceFile = null;
  updateFileInfo();
  clearEncodeOutputs();
  hideEncodeError();
  document.activeElement?.blur();
  encodeTextInputEl.focus();
});

decodeClearBtn.addEventListener('click', () => {
  decodeInputEl.value = '';
  clearDecodeOutputs();
  hideDecodeError();
  document.activeElement?.blur();
  decodeInputEl.focus();
});
```

Immediate, no dialog, per `DESIGN.md`'s explicit "low-stakes, no modal
needed." Still blurs first (mobile keyboard dismiss) before refocusing the
now-empty primary field, consistent with the "submit/commit blurs" rule in
`docs/conventions.md` — Clear is this tool's one commit-like action per
section.

## 10. Accessibility & responsive/mobile

- Every input/textarea has a real `<label for>`; the mode toggle uses
  `role="group"` + `aria-label="Mode"` with `aria-pressed` on each button
  (`docs/conventions.md` § "Toggle buttons expose `aria-pressed`").
- All icon-only buttons (four encode copy buttons, decode text copy button,
  remove-file ✕) carry both `aria-label` and `title`.
- `encode-error`/`decode-error` are `role="alert"` (assertive by nature —
  appropriate for a validation failure the user needs to notice
  immediately); `encode-warning` and `decode-detected-mime` are
  `role="status"`/`aria-live="polite"` — informational, not urgent. Each is a
  static element in the markup whose text is swapped in place, so nothing
  is re-announced more than once per event.
- Honor `prefers-reduced-motion` for the drag-over highlight and copy-button
  swap (make any transition instant under that media query).
- Visible `:focus-visible` outlines on every interactive element — do not
  suppress them.
- **No secure-context-only APIs** — this tool uses none (`crypto.randomUUID`
  is never needed here), so it works identically over `file://`, plain HTTP,
  and HTTPS. Grep for `randomUUID` during review to confirm none crept in.
- Responsive: single-column stack under a ~640px breakpoint — mode toggle
  buttons go full-width, the four encode output fields and file-info row
  stack vertically, textareas/outputs scroll within their own
  `overflow-x/y: auto` container rather than the page. Buttons and the
  dropzone get a mobile `min-height: 44px` bump for tap-friendliness. The
  dropzone's "click/tap to choose" affordance (via the wrapping `<label>`)
  is the primary mobile file-selection path — drag-and-drop is a
  progressive enhancement for desktop, not required on touch.

## 11. Footer + OG placeholders

- Paste `tools/include/footer.html` verbatim (sentinels included) at the
  bottom of `<body>`, after both sections and before the `<script
  type="module">`.
- `<head>` gets the standard OG block per `docs/conventions.md` § "Link
  previews":

```html
<meta property="og:title"       content="Base64 / Data URI Tool">
<meta property="og:description" content="Encode and decode Base64 and data: URIs from text or files, entirely in your browser.">
<meta property="og:type"        content="website">
<meta property="og:site_name"   content="claude-tools">
<meta property="og:image"       content="preview.png">
<meta name="twitter:card"       content="summary_large_image">
```

- `preview.png` (a ~1200×630 sibling image) is referenced but **not**
  produced by this plan/worker step — it's the same out-of-band asset every
  other tool carries; flag it as an outstanding follow-up if the build
  pipeline doesn't already generate one for new tools.

## 12. Script organization (inside the single `<script type="module">`)

1. DOM references (`getElementById`/`querySelector` for every element named
   above).
2. `state`.
3. Pure core functions (section 3): `bytesToBase64`, `base64ToBytes`,
   `encodeText`, `decodeText`, `toBase64Url`, `fromBase64Url`,
   `parseDataUri`, `normalizeBase64`, `decodeInput`, `extensionForMime`,
   `formatBytes`.
4. Mode toggle (`setMode`).
5. Encode: `setEncodeFile`, `updateFileInfo`, drag/drop wiring,
   `getEncodeSourceBytes`, `getEncodeMime`, `renderEncodeOutputs`,
   `jsSnippet`, `clearEncodeOutputs`, `showEncodeError`/`hideEncodeError`,
   `updateEncodeWarning`, debounced input listeners.
6. Decode: `renderDecodeOutput`, `clearDecodeOutputs`,
   `showDecodeError`/`hideDecodeError`, `downloadDecoded`, debounced input
   listener, download button wiring.
7. Copy: `copyText`, `handleCopyClick`, one listener per copy button.
8. Clear button wiring (section 9).
9. Initial render: `setMode('encode')` once at load (sections already agree
   via the `hidden` attribute in markup, but this also sets `aria-pressed`
   correctly); both output areas start empty, decode Download starts
   disabled.
10. Test hook: `window.__base64Tool = {...}` (section 13), assigned last.

## 13. Testability hooks

### `data-testid` — complete list

- `mode-toggle`, `mode-encode-btn`, `mode-decode-btn`
- `encode-section`, `encode-text-input`, `encode-dropzone`,
  `encode-file-input`, `encode-file-info`, `encode-remove-file-btn`,
  `encode-mime-input`, `encode-clear-btn`, `encode-error`,
  `encode-warning`
- `encode-base64-col`, `encode-base64-output`, `encode-base64-copy-btn`
- `encode-base64url-col`, `encode-base64url-output`, `encode-base64url-copy-btn`
- `encode-datauri-col`, `encode-datauri-output`, `encode-datauri-copy-btn`
- `encode-snippet-col`, `encode-snippet-output`, `encode-snippet-copy-btn`
- `decode-section`, `decode-input`, `decode-clear-btn`, `decode-error`,
  `decode-detected-mime`
- `decode-text-col`, `decode-text-output`, `decode-text-copy-btn`
- `decode-binary-note`, `decode-download-btn`

This satisfies `DESIGN.md`'s required set (mode toggle, text input, file
input, each output field + copy button, decode input, decoded-text output +
copy, download button, error message) with `encode-error`/`decode-error` as
the two concrete "error message" testids (one per mode, matching the
per-field-id granularity already used by `color-converter`).

### `window.__base64Tool`

```js
window.__base64Tool = {
  // pure functions (DESIGN.md's required set)
  encodeText,
  decodeText,
  bytesToBase64,
  base64ToBytes,
  toBase64Url,
  fromBase64Url,
  parseDataUri,

  // additional pure/logic helpers, useful test surface
  normalizeBase64,
  decodeInput,       // (str) -> { mime, bytes, text, isText }; throws Error on invalid input
  extensionForMime,

  // deterministic entry points (bypass debounce/DOM-event timing for tests
  // that don't need to exercise the real file-picker/drag-drop path — see
  // section 14, the file-encode test should still use setInputFiles)
  setMode,
  renderEncodeOutputs,   // async
  renderDecodeOutput,

  // live state
  state,
};
```

Assigned once at module init; inert for normal users — just a namespace, no
UI difference when unused.

## 14. Test plan (for the Tester agent)

- **Unicode round-trip**: `page.evaluate(() => { const b = __base64Tool.encodeText('héllo 😀 café — ok'); return __base64Tool.decodeText(b) === 'héllo 😀 café — ok'; })` → `true`. Also drive it through the real UI: type the same string into `encode-text-input`, read `encode-base64-output`, paste that value into `decode-input` (switch modes), assert `decode-text-output` matches.
- **URL-safe**: pick/construct a Base64 string containing both `+` and `/`
  (e.g. encode a short byte sequence chosen to produce them), assert
  `toBase64Url` output has no `+`, `/`, or `=`, and that
  `fromBase64Url(toBase64Url(b64))` restores the original padded string (or
  decodes to the same bytes as `base64ToBytes(b64)`).
- **data-URI parse**: `parseDataUri('data:image/png;base64,iVBORw0KGgo=')` →
  `{ mime: 'image/png', isBase64: true, payload: 'iVBORw0KGgo=' }`;
  `parseDataUri('not a uri')` → `null`; a `data:text/plain,hello` (no
  `;base64`) case → `isBase64: false`, and confirm `decodeInput()` on that
  string throws the "only base64-encoded" error.
- **Invalid input**: type `"!!! not base64 !!!"` into `decode-input`, assert
  `decode-error` becomes visible with non-empty text, `decode-download-btn`
  stays disabled, no console error/uncaught exception is logged, and the
  page is still responsive afterward (type something valid next and confirm
  it recovers).
- **File encode via `setInputFiles`**: use a small fixture text file, e.g.
  `page.locator('[data-testid="encode-file-input"]').setInputFiles(fixturePath)`
  (not the `window.__base64Tool` bypass, per `DESIGN.md`). Assert
  `encode-file-info` shows the filename/size/mime, and that decoding
  `encode-base64-output`'s value (via `base64ToBytes` in-page or decoding
  in Node) reproduces the fixture's exact bytes.
- **Decode → download path**: paste a known `data:image/png;base64,...` (or
  a raw Base64 string) into `decode-input`, click `decode-download-btn`,
  `await page.waitForEvent('download')`, assert the suggested filename ends
  in the extension `extensionForMime` would produce for that MIME, and
  optionally save + diff the downloaded bytes against the known input.
- **Mobile**: repeat the encode text round-trip, the mode toggle, and the
  decode → download flow at a mobile viewport/device profile; assert no
  horizontal overflow and that the dropzone/mode-toggle/copy buttons are
  comfortably tappable (~44px).

## 15. Ordered build checklist

1. Static HTML skeleton (header, mode toggle, both sections with every
   `data-testid` from section 13, decode section starts `hidden`), OG meta
   tags in `<head>`, pasted footer at the bottom of `<body>` — no `ctConfirm`
   script anywhere (see the override note at the top).
2. Implement the pure core functions (section 3) standalone, no DOM; hand
   check a handful of vectors before wiring anything up: an emoji/accent
   round trip, a known data URI, a URL-safe round trip, a garbage string.
3. Wire the mode toggle (`setMode`, `aria-pressed`, focus-on-switch).
4. Wire encode text/mime inputs (debounced) and file input + drag-drop
   (`setEncodeFile`, `updateFileInfo`, the large-file guard) into
   `renderEncodeOutputs`.
5. Implement `renderEncodeOutputs` writing all four output fields + the
   `jsSnippet` builder; wire the four copy buttons via the shared
   `copyText`/`handleCopyClick`.
6. Wire the encode Clear button (immediate, no dialog).
7. Implement `renderDecodeOutput` (via `decodeInput`) showing detected mime,
   decoded text or the binary note, and enabling Download; wire the decode
   text copy button and `downloadDecoded`.
8. Wire the decode Clear button (immediate, no dialog).
9. Accessibility pass: labels, `aria-label`+`title` on every icon-only
   button, `role="alert"`/`aria-live="polite"` wiring, `:focus-visible`
   styles, `prefers-reduced-motion` guards.
10. Responsive/mobile CSS pass: breakpoint stacking, 44px tap targets,
    per-field `overflow-x/y: auto` so nothing overflows the page.
11. Add `window.__base64Tool` last, matching section 13 exactly.
12. Manual smoke test: emoji/accent text round trip; upload then drag-drop a
    small file (confirm file wins over any typed text, and Remove File
    restores the textarea); decode a data URI and a bare Base64/Base64URL
    string with stray whitespace; feed garbage into decode and confirm a
    clean inline error with no crash; download a decoded file and check its
    filename/extension and contents; push a file just over
    `MAX_ENCODE_FILE_BYTES` and confirm the guard fires; check a ~375px
    viewport for overflow and tap-target comfort; flip modes back and forth
    and confirm both sides retain their content.
