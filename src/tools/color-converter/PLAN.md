# color-converter — Implementation Plan

Author: Claude (planner). Implements `DESIGN.md` strictly. The worker should
not need to re-decide architecture — only fill in CSS polish and wire up the
DOM exactly as specified here. Cross-reference: `tools/color-picker/index.html`
and its `PLAN.md` for the canonical formatting / copy-button patterns
(re-implement, do not import — single-file rule).

**Update (confirm dialog / footer / tooltips / mobile):** sections 8 and 10
below originally specified a bespoke, per-tool confirm modal
(`#modalBackdrop`/`#modal`, `state.modal`, `openConfirmModal`/`closeModal`/
`confirmModalAction`/`onModalKeydown`). That implementation has been replaced
by the shared, pasted `ctConfirm` component (`tools/include/confirm.js`), per
`docs/conventions.md` § Destructive actions require confirmation — see
`DESIGN.md` § "Removal & confirm" for the current, authoritative behavior.
Section 8 below is kept for historical context (the modal's UX contract —
Enter/Esc/focus-trap/backdrop-click/messages-per-action — carried over
unchanged onto `ctConfirm`) but its DOM/state/function names no longer match
`index.html`. The tool's `index.html` also now carries the pasted HTML footer
(`tools/include/footer.html`) at the bottom of `<body>`, `title` tooltips on
every icon-only button, and a mobile Playwright test block — see the notes
appended to sections 10 and 12.

## 1. Overall file structure

One `index.html`, roughly:

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Color Converter</title>
  <style> ... all CSS ... </style>
</head>
<body>
  <header>...title + one-line description...</header>

  <section class="paste-section" data-testid="paste-section">
    ...bulk paste textarea, Convert, Clear, parse summary...
  </section>

  <section class="rows-section" data-testid="rows-section">
    ...column header row, rows list, Add row, Remove all...
  </section>

  <section class="outputs-section" data-testid="outputs-section">
    ...RGBA output textarea + Copy all, HEX output textarea + Copy all...
  </section>

  <!-- pasted HTML footer, tools/include/footer.html (sentinels included) -->

  <script>
    // pasted ctConfirm component, tools/include/confirm.js (sentinels
    // included) — a classic script so window.ctConfirm exists before the
    // module script below wires up any listeners.
  </script>

  <script type="module">
    // see section 12 for internal organization; per-row trash, Clear, and
    // Remove all each call `if (await ctConfirm(message)) {...}` instead of
    // opening a bespoke modal.
  </script>
</body>
</html>
```

### DOM skeleton (key elements, with `data-testid`s — full list in section 10)

```html
<header class="app-header">
  <h1>Color Converter</h1>
  <p class="subtitle">Paste or type mixed rgba/hex colors, convert them all to one format.</p>
</header>

<section class="paste-section" data-testid="paste-section">
  <label for="pasteInput">Paste colors, one per line (rgba or hex, mixed is fine)</label>
  <textarea id="pasteInput" data-testid="paste-input" rows="6"></textarea>
  <div class="paste-actions">
    <button id="convertBtn" type="button" data-testid="convert-btn">Convert</button>
    <button id="clearPasteBtn" type="button" data-testid="clear-paste-btn">Clear</button>
    <p id="parseSummary" data-testid="parse-summary" role="status" aria-live="polite"></p>
  </div>
</section>

<section class="rows-section" data-testid="rows-section">
  <div class="rows-header" aria-hidden="true">
    <span>Input</span><span>Swatch</span><span>Hex</span><span>RGBA</span><span></span>
  </div>
  <ul id="rowsList" data-testid="rows-list"></ul>
  <div class="rows-actions">
    <button id="addRowBtn" type="button" data-testid="add-row-btn">Add row</button>
    <button id="removeAllBtn" type="button" data-testid="remove-all-btn" disabled>Remove all</button>
  </div>
</section>

<section class="outputs-section" data-testid="outputs-section">
  <div class="output-col" data-testid="rgba-output-col">
    <label for="rgbaOutput">RGBA (one per line)</label>
    <textarea id="rgbaOutput" data-testid="rgba-output" readonly></textarea>
    <button id="rgbaCopyAllBtn" type="button" data-testid="rgba-copy-all-btn">Copy all</button>
  </div>
  <div class="output-col" data-testid="hex-output-col">
    <label for="hexOutput">HEX (one per line)</label>
    <textarea id="hexOutput" data-testid="hex-output" readonly></textarea>
    <button id="hexCopyAllBtn" type="button" data-testid="hex-copy-all-btn" title="Copy all HEX values">Copy all</button>
  </div>
</section>
```

There is no inline modal markup — destructive actions call the shared
`ctConfirm(message)` (pasted at the bottom of `<body>`; see section 1), which
builds and tears down its own dialog DOM at call time.

One row template (built in JS, see section 5); note every icon-only button
gets a `title` mirroring its `aria-label` (tooltip convention):

```html
<li class="row" data-testid="color-row" data-id="3">
  <input type="text" class="row-input" data-testid="row-input" aria-label="Color (rgba or hex)">
  <span class="swatch" data-testid="row-swatch"></span>
  <div class="field">
    <input type="text" class="row-hex-output" data-testid="row-hex-output" readonly aria-label="Hex output">
    <button type="button" class="icon-btn copy-btn" data-testid="row-hex-copy" aria-label="Copy hex value" title="Copy hex value">📋</button>
  </div>
  <div class="field">
    <input type="text" class="row-rgba-output" data-testid="row-rgba-output" readonly aria-label="RGBA output">
    <button type="button" class="icon-btn copy-btn" data-testid="row-rgba-copy" aria-label="Copy rgba value" title="Copy rgba value">📋</button>
  </div>
  <button type="button" class="icon-btn trash-btn" data-testid="row-trash" aria-label="Remove row" title="Remove row">🗑</button>
</li>
```

## 2. State shape

```js
const state = {
  rows: [
    // { id: 1, rawText: 'rgba(255, 0, 0, 0.5)', parsed: {r:255,g:0,b:0,a:0.5} },
    // { id: 2, rawText: 'not a color', parsed: null },
    // { id: 3, rawText: '', parsed: null },   // empty row, not yet typed in
  ],
  // No `modal` field — destructive actions call the shared `ctConfirm()`
  // (tools/include/confirm.js), which owns its own transient DOM/state and
  // resolves a Promise<boolean>; nothing modal-related lives in `state`.
};
let nextId = 1;
```

Notes:
- `rows` is the **single source of truth**. `rawText` is exactly what's in the
  row's input (preserves whatever the user typed/pasted, including invalid
  text, so they can see and fix it). `parsed` is `parseColor(rawText)` — `null`
  for empty or invalid text.
- No separate "invalid" boolean — a row is invalid iff `rawText.trim() !== ''
  && parsed === null`; empty iff `rawText.trim() === ''`. Swatch/derivation
  logic branches on these two conditions directly (see section 5).
- The paste textarea (`pasteInput`) is **not** part of `state` — read it
  directly from the DOM when Convert/Clear run; it has no derived effects on
  rows except via the one-way Convert action (which erases and regenerates
  rows from it).
- **Derivation of the two output textareas**: pure functions of `state.rows`,
  recomputed and written into the two `readonly` textareas every time `rows`
  changes (add/edit/remove/bulk-convert). No separate cached "output state" —
  always derive fresh from `state.rows` so there is no way for them to drift:

  ```js
  function rgbaOutput() {
    return state.rows.map(rowToRgbaLine).join('\n');
  }
  function hexOutput() {
    return state.rows.map(rowToHexLine).join('\n');
  }
  function rowToRgbaLine(row) {
    if (row.rawText.trim() === '') return '';
    return row.parsed ? rgbaString(row.parsed) : invalidLine(row.rawText);
  }
  function rowToHexLine(row) {
    if (row.rawText.trim() === '') return '';
    return row.parsed ? hexString(row.parsed) : invalidLine(row.rawText);
  }
  ```

  Call a single `renderOutputs()` after every row mutation that sets
  `rgbaOutputEl.value = rgbaOutput()` and `hexOutputEl.value = hexOutput()`.
  Because `.map` preserves order/length 1:1 with `state.rows`, both textareas
  stay line-aligned with the rows and with each other automatically.

## 3. `parseColor(str) -> {r,g,b,a} | null`

Pure function. Trim the whole input first; if the trimmed string is empty,
return `null` (an empty row is "no value", not tested with the invalid
regexes — callers distinguish empty vs. invalid via `rawText.trim() === ''`
as noted above, but `parseColor('')` itself is simply `null`, which is
correct either way). All matching is case-insensitive and only against the
**entire** trimmed string (`^...$` — no partial/embedded matches).

### Step 1 — try hex

```js
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
```

- Strip an optional leading `#`.
- Match against `[0-9a-f]` runs of length exactly 3, 4, 6, or 8 (anchored —
  a 5- or 7-digit run is invalid and falls through to `null`).
- Expand:
  - length 3 (`rgb` shorthand): `abc` → `r=aa, g=bb, b=cc`, `a=1`. Double each
    nibble: `r = parseInt(c0+c0, 16)`, etc.
  - length 4 (`rgba` shorthand): `abcd` → `r=aa,g=bb,b=cc`, alpha nibble `d`
    doubled to `dd`, `a = parseInt('dd',16) / 255`.
  - length 6: `r = parseInt(str.slice(0,2),16)`, `g = slice(2,4)`, `b =
    slice(4,6)`, `a = 1`.
  - length 8: as length 6 plus `a = parseInt(str.slice(6,8),16) / 255`.
- Result channels are always integers 0–255 by construction (no clamping
  needed for hex — the regex already restricts to valid hex digits).

### Step 2 — try functional `rgb()`/`rgba()`

Two forms, tried in this order (first match wins); if neither matches, return
`null`. Both accept either function name (`rgb` and `rgba` are treated as
aliases — the argument shape decides comma vs. slash, not the name, matching
modern CSS color-4 behavior and the design's "rgb(r g b / a)" example).

**Comma form** (alpha optional):

```js
const RGB_COMMA_RE =
  /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i;
```

- Groups 1–3 are r, g, b; group 4 (optional) is alpha.
- Each captured group must parse with `Number(...)` to a finite number —
  if `Number.isNaN`, the whole thing is invalid (return `null`), don't
  silently coerce to 0.
- No `%` allowed anywhere in this branch — the regex has no `%` in its
  character class, so `rgb(50%, 0%, 0%)` simply fails to match and falls
  through to `null`. (Percentage channels are out of scope per DESIGN.md;
  document this explicitly in a code comment next to the regex.)

**Slash form** (alpha required — this is the CSS "space-separated + slash"
syntax, which only makes sense with an alpha):

```js
const RGB_SLASH_RE =
  /^rgba?\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*\)$/i;
```

- Groups 1–4 are r, g, b, a — all required, space-separated channels, then
  `/`, then alpha. No commas anywhere in this branch (a mix of comma and
  slash, e.g. `rgb(1, 2, 3 / 4)`, matches neither regex and is invalid).

**Channel/alpha normalization (shared by both functional forms):**

```js
function clampChannel(n) { return Math.round(Math.min(255, Math.max(0, n))); }
function clampAlpha(n) { return Math.min(1, Math.max(0, n)); }
```

- r/g/b: `Number(group)`, then `clampChannel` (round to nearest int, clamp
  0–255). Decimal channels like `rgb(120.4, 0, 0)` are accepted and rounded.
- a: if the comma-form's 4th group is absent, `a = 1`. Otherwise `Number(group)`
  then `clampAlpha` (clamp 0–1; do **not** round — alpha is stored as a float
  and only trimmed for display by `rgbaString`, see section 4).
- If either r, g, or b (or alpha, when present) fails `Number()` (`NaN`),
  return `null` for the whole parse — don't partially default.

### Step 3 — anything else → `null`

No named CSS colors, no `hsl()`/`hwb()`/`lab()`/`lch()`, no percentage
channels, no `rgb()` with fewer/more than 3 (comma) or exactly 4 (slash)
arguments. All out of scope per DESIGN.md.

### Full function shape

```js
function parseColor(str) {
  const s = String(str ?? '').trim();
  if (s === '') return null;

  const hexMatch = s.match(HEX_RE);
  if (hexMatch) return parseHex(hexMatch[1]);

  const comma = s.match(RGB_COMMA_RE);
  if (comma) return buildRgba(comma[1], comma[2], comma[3], comma[4]); // comma[4] may be undefined -> a=1

  const slash = s.match(RGB_SLASH_RE);
  if (slash) return buildRgba(slash[1], slash[2], slash[3], slash[4]);

  return null;
}
```

`buildRgba` centralizes the `Number()` + `NaN` check + clamp logic described
above so both regex branches share it.

## 4. Canonical formatters (pure, match color-picker exactly)

Copy these verbatim in behavior from `color-picker/index.html` (re-implemented
locally, not imported):

```js
function rgbaString({ r, g, b, a }) {
  const alpha = Number.isInteger(a) ? a : Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexString({ r, g, b, a }) {
  const h = (n) => n.toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a < 1 ? `${base}${h(Math.round(a * 255))}` : base;
}
```

- `rgbaString`: **always** includes alpha, even when `a === 1` (e.g.
  `rgba(255, 0, 0, 1)`), for consistency across rows regardless of source
  format. Alpha is trimmed to at most 3 decimal places and printed without
  trailing zeros (`Math.round(a*1000)/1000` naturally does this; `1` stays
  `1`, not `1.000`).
- `hexString`: always lowercase; `#rrggbb` when `a === 1`, `#rrggbbaa` only
  when `a < 1`.
- Both are pure, take the normalized `{r,g,b,a}` shape `parseColor` returns,
  and are the primary unit-test surface along with `parseColor` itself.

## 5. Row DOM, live conversion, swatch, per-field copy, trash

### Adding a row

```js
function addRow(rawText = '') {
  const row = { id: nextId++, rawText, parsed: parseColor(rawText) };
  state.rows.push(row); // append — newest at the bottom (reading order)
  renderRows();
  renderOutputs();
  return row;
}
```

- "Add row" button calls `addRow('')` then focuses the new row's input
  (query the newly appended `<li>` in `rowsList` and call `.focus()` on its
  `.row-input`). This is a deliberate exception to the "commit blurs" rule
  used by Convert: Add row isn't submitting a value, it's handing the user an
  empty field to type into, so it keeps the keyboard up and moves focus there
  instead of blurring.
- Full list re-render (`renderRows()` clears and rebuilds `rowsList` from
  `state.rows`) is simplest and fast enough for this tool's scale (dozens to
  low hundreds of rows); no need for incremental DOM diffing. Preserve focus
  only for the explicit "Add row" case above — routine typing in an existing
  row's input never triggers `renderRows()` (see below), so focus is never
  disturbed while a user is typing.

### Live conversion on input

Each row's `.row-input` gets an `input` listener, **debounced lightly**
(~150ms is plenty responsive while avoiding thrash on fast paste/autofill):

```js
function onRowInput(row, inputEl) {
  clearTimeout(row._debounce);
  row._debounce = setTimeout(() => {
    row.rawText = inputEl.value;
    row.parsed = parseColor(row.rawText);
    updateRowVisuals(row); // swatch + hex/rgba output fields for THIS row only
    renderOutputs();       // derived textareas — cheap, always full recompute
  }, 150);
}
```

- Important: do **not** call `renderRows()` (full rebuild) on every keystroke
  — that would destroy and recreate the input the user is actively typing in
  and lose cursor position/focus. Instead mutate `row.rawText`/`row.parsed`
  and call a targeted `updateRowVisuals(row)` that only touches that row's
  swatch + hex-output + rgba-output elements (found via the row's `<li
  data-id>` or a `WeakMap<row, {swatchEl, hexEl, rgbaEl}>` built at row-creation
  time — the WeakMap is simpler and avoids DOM queries on every keystroke).
- `renderOutputs()` (rebuilding the two output textareas) is comparatively
  cheap (string join) and safe to call unconditionally on every debounced
  input — the user isn't typing *inside* those readonly textareas.

### Swatch rendering

```css
.swatch {
  width: 20px; height: 20px;
  border: 1px solid var(--swatch-outline, #8888);
  border-radius: 3px;
  background-color: var(--swatch-color, transparent);
}
.swatch.alpha {
  background-image: /* checkerboard, e.g. repeating conic-gradient */;
}
.swatch.invalid {
  background: repeating-linear-gradient(45deg, #f88 0 4px, #fff 4px 8px);
}
.swatch.empty {
  background: transparent; /* neutral placeholder, outline only */
}
```

`updateRowVisuals(row)` sets exactly one of three swatch states:

- **empty** (`row.rawText.trim() === ''`): class `swatch empty`, no inline
  `--swatch-color`.
- **invalid** (`row.rawText.trim() !== '' && row.parsed === null`): class
  `swatch invalid` — visually distinct (hatched pattern above), never
  attempts to set a background color from a null value (guards against a
  crash — always check `row.parsed` truthiness before calling `rgbaString`).
- **valid**: class `swatch` (+ `alpha` when `row.parsed.a < 1`, adding the
  checker background so the true alpha is visible), with
  `swatch.style.setProperty('--swatch-color', rgbaString(row.parsed))`.

Same three-way branch drives the hex/rgba output fields for the row: empty
string in both when empty or invalid, `hexString(row.parsed)` /
`rgbaString(row.parsed)` when valid.

### Per-field copy (hex output, rgba output — and later, output textareas)

Re-implement the color-picker pattern exactly:

```js
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { /* fall through */ }
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
  if (!text) return; // nothing to copy on an empty/invalid row's output field
  const ok = await copyText(text);
  if (!ok) return;
  clearTimeout(copyTimeouts.get(btn));
  btn.textContent = '✅';
  copyTimeouts.set(btn, setTimeout(() => { btn.textContent = '📋'; }, 1000));
}
```

- Each row's hex-copy button copies the **current** `row-hex-output` input's
  `.value` at click time (always read from the DOM field, not a stale
  closure) — same for rgba-copy.
- Copy-all buttons (section 7) reuse the same `copyText`/`handleCopyClick`
  helpers against the full output textarea's `.value`.

### Trash (per-row remove, via the generalized confirm modal)

```js
function removeRow(id) {
  state.rows = state.rows.filter((r) => r.id !== id);
  renderRows();
  renderOutputs();
}
```

`removeRow(id)` itself stays a **direct, non-modal** function — it is what
`window.__colorConverter.removeRow` exposes for tests, and it is also what
the trash button's confirm handler calls. The row's trash button is wired to
call the shared `ctConfirm` dialog, **not** `removeRow` directly (current —
see `DESIGN.md` § "Removal & confirm"; supersedes the `openConfirmModal`
snippet this section originally showed):

```js
trashBtn.addEventListener('click', async () => {
  if (await ctConfirm('Remove this color?')) removeRow(row.id);
});
```

Confirming ("Remove this color?", Enter/click-Yes) calls `removeRow(row.id)`;
Esc/Cancel/backdrop-click resolve `ctConfirm(...)` to `false`, leaving
`state.rows` untouched.

## 6. Bulk Convert

```js
// REPLACE semantics: erase all current rows first (this also clears both
// derived output textareas via renderOutputs()), then regenerate rows fresh
// from `text`. Does not accumulate across repeated calls — a second Convert
// reflects only the latest paste contents, not the union of every past
// Convert.
function bulkConvert(text) {
  state.rows = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  let invalidCount = 0;
  for (const line of lines) {
    const row = { id: nextId++, rawText: line, parsed: parseColor(line) };
    if (row.parsed === null) invalidCount++;
    state.rows.push(row);
  }
  renderRows();
  renderOutputs();
  showParseSummary(lines.length, invalidCount);
  return { added: lines.length, invalid: invalidCount };
}
```

- Split on `\n` (a leading `\r` from CRLF paste is stripped by `.trim()` on
  each line, so no separate `\r\n` handling is needed).
- Blank lines (empty after trim) are **skipped entirely** — they do not
  become rows and do not count toward "generated" or "invalid".
- Every remaining line becomes exactly one freshly-generated row, valid or
  not (invalid lines become invalid rows, per DESIGN.md, so the user can see
  and fix them inline).
- **Replace**, never append — `state.rows = []` runs first, unconditionally,
  before regenerating. No confirmation is needed for Convert: the source
  (the paste textarea) is untouched, so nothing the user typed is lost, only
  the previously-generated rows are superseded.
- Convert button handler: `bulkConvert(pasteInputEl.value)`. It does **not**
  clear the paste textarea afterward (only "Clear" does) — the paste box is
  the source of truth for regeneration, and leaving the pasted text visible
  lets the user cross-check what they just converted or tweak it and
  re-Convert.
- After `bulkConvert`, the click handler also calls
  `document.activeElement?.blur()` — Convert is this tool's commit/submit
  action, so it dismisses the mobile on-screen keyboard on a successful run
  per `docs/conventions.md` § Responsive & mobile (the keyboard follows
  focus; there's no dedicated dismiss API). This is unconditional — Convert
  has no "rejected" outcome the way seed-add or per-row validation do, since
  even invalid lines still become rows.
- If `pasteInputEl.value.trim() === ''`, still call `bulkConvert('')`, which
  erases any existing rows and is otherwise a no-op (`lines` is empty) — show
  a summary of "Generated 0 rows" rather than silently doing nothing, so the
  button always gives feedback. (Simpler alternative the worker may choose
  instead: early-return without touching the summary if there's nothing to
  parse — either is acceptable; document whichever is chosen in a one-line
  comment.)

### Parse summary

```js
function showParseSummary(generated, invalid) {
  parseSummaryEl.textContent =
    invalid > 0
      ? `Generated ${generated} row${generated === 1 ? '' : 's'} — ${invalid} couldn't be parsed.`
      : `Generated ${generated} row${generated === 1 ? '' : 's'}.`;
}
```

- `parseSummaryEl` has `role="status"` + `aria-live="polite"` in the markup
  (static, not toggled per-call) so screen readers announce each update
  automatically without needing to re-insert the node — this is what makes
  it "announced once, not spammy" (a single text update, not a stream of
  DOM mutations).
- Persists until the next Convert (does not auto-clear) — gives the user
  time to read it.

### Clear (paste box)

Visible label is "Clear"; `data-testid="clear-paste-btn"` is unchanged.
Clicking it calls the shared `ctConfirm` dialog (current — supersedes the
`openConfirmModal` snippet this section originally showed) instead of
clearing directly:

```js
clearPasteBtn.addEventListener('click', async () => {
  if (await ctConfirm('Clear the paste box?')) pasteInputEl.value = '';
});
```

The dialog shows "Clear the paste box?"; confirming (Enter/click-Yes) empties
only the paste textarea — same scope as before, it does not touch rows or
the parse summary. Esc/Cancel/backdrop-click leave the paste box untouched.

## 7. Derived output textareas (RGBA-per-line, HEX-per-line)

Already specified structurally in section 2 (`rgbaOutput()`/`hexOutput()`
plus `renderOutputs()`). Additional concrete details:

### Invalid-line placeholder token

Use a literal, unambiguous token that can't collide with a real color value:

```
INVALID: <original raw text>
```

i.e. `invalidLine(rawText)` returns `` `INVALID: ${rawText}` ``. This is
simpler to test exactly (`line.startsWith('INVALID:')`) than the
comment-style `/* ? original */` alternative DESIGN.md floats, and keeps the
original text visible for the user to fix. **Document this token in the
README and in a code comment right above `invalidLine`.**

- Empty rows (nothing typed) emit an **empty string** line — not the
  `INVALID:` token — so a fresh "Add row" or a not-yet-typed-into row doesn't
  read as an error; it's just blank, matching "Empty when the row is
  invalid/empty" language in DESIGN.md's row section (empty is its own
  state, invalid is distinct).
- Both output textareas always have exactly `state.rows.length` lines (a
  trailing `join('\n')` naturally produces this — no extra trailing newline
  since `Array.prototype.join` doesn't add one after the last element).
  This is what "line-aligned with the rows and with each other" means
  concretely: `rgbaOutput().split('\n')[i]` and `hexOutput().split('\n')[i]`
  both correspond to `state.rows[i]`.
- `renderOutputs()` writes both `.value`s directly; being `readonly` (not
  `disabled`), their text remains selectable/copyable by the user directly
  in addition to the Copy-all buttons.

### Copy all

```js
rgbaCopyAllBtn.addEventListener('click', () => handleCopyClick(rgbaCopyAllBtn, rgbaOutputEl.value));
hexCopyAllBtn.addEventListener('click', () => handleCopyClick(hexCopyAllBtn, hexOutputEl.value));
```

Reuses `handleCopyClick`/`copyText` from section 5 verbatim. Give the button
the same check-mark-for-1s feedback as per-field copy buttons (swap
textContent, or if the button has a text label like "Copy all", swap to
"Copied!" for 1s instead of an icon swap — worker's choice, keep it
consistent between the two Copy-all buttons).

## 8. Generalized confirm modal (per-row remove / Clear / Remove all)

> **Superseded.** This section describes the original bespoke modal. It has
> since been replaced by the shared `ctConfirm` component
> (`tools/include/confirm.js`) — see the note at the top of this document and
> `DESIGN.md` § "Removal & confirm" for what `index.html` actually does now.
> The UX contract described below (Enter confirms, Esc/backdrop cancel, focus
> trap, per-action message) is unchanged; only the DOM/state/function names
> are stale. Kept for historical context.

One reusable modal, re-implementing the color-picker modal pattern (see that
tool's `index.html` around its "Confirm modal" section), serves **three**
actions this time — generalized via a `kind` on `state.modal` (`'row'` |
`'clearPaste'` | `'all'`), each with its own message and pending action.
`'row'` additionally carries a `rowId`.

```js
const CONFIRM_MESSAGES = {
  row: 'Remove this color?',
  clearPaste: 'Clear the paste box?',
  all: 'Remove all rows?',
};

// Fallback focus target if the element that opened the modal (e.g. a row's
// trash button) no longer exists in the DOM by the time the modal closes.
function defaultFocusFor(kind) {
  if (kind === 'row') return addRowBtn;
  if (kind === 'clearPaste') return pasteInputEl;
  return removeAllBtn;
}

function openConfirmModal(kind, { rowId = null } = {}) {
  if (kind === 'all' && state.rows.length === 0) return; // Remove all is disabled when empty anyway, but guard defensively
  state.modal = { open: true, kind, rowId, returnFocusEl: document.activeElement };
  modalTitleEl.textContent = CONFIRM_MESSAGES[kind];
  modalBackdrop.hidden = false;
  modalConfirmBtn.focus(); // default focus on Confirm
  document.addEventListener('keydown', onModalKeydown, true);
}

function closeModal() {
  modalBackdrop.hidden = true;
  document.removeEventListener('keydown', onModalKeydown, true);
  const { returnFocusEl, kind } = state.modal;
  state.modal = { open: false, kind: null, rowId: null, returnFocusEl: null };
  if (returnFocusEl && document.body.contains(returnFocusEl)) returnFocusEl.focus();
  else defaultFocusFor(kind).focus();
}

function confirmModalAction() {
  const { kind, rowId } = state.modal;
  if (kind === 'row') removeRow(rowId); // same direct function the test hook exposes
  else if (kind === 'clearPaste') pasteInputEl.value = '';
  else if (kind === 'all') removeAllRows();
  closeModal();
}

function onModalKeydown(e) {
  if (!state.modal.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  if (e.key === 'Enter') { e.preventDefault(); confirmModalAction(); return; }
  if (e.key === 'Tab') {
    const focusables = [modalCancelBtn, modalConfirmBtn];
    const idx = focusables.indexOf(document.activeElement);
    e.preventDefault();
    const nextIdx = e.shiftKey
      ? (idx <= 0 ? focusables.length - 1 : idx - 1)
      : (idx === focusables.length - 1 ? 0 : idx + 1);
    focusables[nextIdx].focus();
  }
}

modalConfirmBtn.addEventListener('click', confirmModalAction);
modalCancelBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
modal.addEventListener('click', (e) => e.stopPropagation()); // don't let clicks inside bubble to backdrop

removeAllBtn.addEventListener('click', () => openConfirmModal('all'));
clearPasteBtn.addEventListener('click', () => openConfirmModal('clearPaste'));
// Per-row trash (built in buildRow(), section 5):
// trashBtn.addEventListener('click', () => openConfirmModal('row', { rowId: row.id }));
```

- `removeAllRows()` sets `state.rows = []`, calls `renderRows()`,
  `renderOutputs()`, and `updateRemoveAllDisabled()`.
- `updateRemoveAllDisabled()` (`removeAllBtn.disabled = state.rows.length ===
  0`) must be called after every row mutation that could change
  emptiness: `addRow`, `bulkConvert`, `removeRow`, `removeAllRows`. Simplest
  to call it unconditionally at the end of `renderRows()` so every path is
  covered by construction.
- Per-row trash and Clear now **both route through this same modal** (see
  sections 5 and 6) — `openConfirmModal('row', {...})` and
  `openConfirmModal('clearPaste')` respectively. `removeRow(id)` and direct
  paste-clearing remain available outside the modal only via the
  `window.__colorConverter` test hook (`removeRow`), exactly as
  `removeAllRows()` already was.

## 9. Accessibility

- Every input/textarea has a real `<label for>` (paste textarea, both output
  textareas) or `aria-label` (row input — "Color (rgba or hex)", row hex
  output — "Hex output", row rgba output — "RGBA output").
- Icon-only buttons (all copy buttons, trash) get `aria-label`s: "Copy hex
  value", "Copy rgba value", "Remove row", "Copy all" (or more specific per
  column: "Copy all RGBA values" / "Copy all HEX values" if the button has no
  visible differentiating text already).
- **Tooltips.** Every icon-only button (both per-row copy buttons, the row
  trash button, both Copy-all buttons) also carries a `title` attribute
  mirroring its `aria-label`, so hovering shows a native browser tooltip —
  per `docs/conventions.md` § Accessibility baseline ("Icon-only buttons get
  a hover tooltip").
- `parseSummaryEl`: `role="status" aria-live="polite"`, static in the markup,
  text content swapped in place (see section 6) — announced once per
  Convert, not per keystroke.
- Copy feedback (icon swap to ✅) is a visual affordance, not itself
  announced via aria-live (matching color-picker) — avoids a live region
  firing on every single copy click across potentially many rows, which
  would be spammy. If the worker wants an audible confirmation too, a single
  shared `aria-live="polite"` status element updated with "Copied" text and
  debounced/coalesced is acceptable, but is not required by DESIGN.md.
- Visible `:focus-visible` outlines on all interactive elements (inputs,
  buttons) — do not suppress focus rings.
- Confirm dialog: the shared `ctConfirm` component renders
  `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its
  message paragraph, a focus trap, and Enter/Esc — same contract as the
  superseded section 8 modal, now provided by the pasted component instead
  of bespoke code.
- Responsive stacking: rows section uses CSS grid with named columns
  (`input swatch hex rgba trash`) at wide widths; below a breakpoint (e.g.
  `600px`) collapse each row to a labeled stacked layout (grid-template-areas
  swap, or flex-wrap) so long hex/rgba text doesn't get clipped on phones.
  The two output textareas are side-by-side (`display: flex` / `grid` two
  columns) above the breakpoint and stacked vertically below it, per
  DESIGN.md's explicit "stack on narrow screens" instruction. On top of that
  existing breakpoint, buttons and icon-buttons also pick up a `min-height`/
  `min-width: 44px` bump (mobile only) so tap targets stay finger-friendly —
  see DESIGN.md § "Responsive & mobile".

## 10. Testability hooks

### `data-testid` — complete list

- `paste-section`, `paste-input`, `convert-btn`, `clear-paste-btn`,
  `parse-summary`
- `rows-section`, `rows-list`
- Per row (`<li data-testid="color-row" data-id="...">`): `row-input`,
  `row-swatch`, `row-hex-output`, `row-hex-copy`, `row-rgba-output`,
  `row-rgba-copy`, `row-trash`
- `add-row-btn`, `remove-all-btn`
- `outputs-section`, `rgba-output-col`, `rgba-output`, `rgba-copy-all-btn`,
  `hex-output-col`, `hex-output`, `hex-copy-all-btn`

The shared `ctConfirm` dialog is **not** part of this list — it's a pasted,
tool-agnostic component with no `data-testid`s of its own. Tests drive it via
`page.getByRole('dialog')` and `page.getByRole('button', { name: 'Yes' |
'Cancel' })` instead (the superseded `confirm-modal*` testids above no longer
exist in the DOM).

Every one of these must actually appear in the emitted DOM (static ones in
the HTML skeleton, per-row ones set in `buildRow()`/equivalent) — the tester
agent will assert on all of them.

### `window.__colorConverter` test namespace

```js
window.__colorConverter = {
  // pure functions
  parseColor,
  rgbaString,
  hexString,

  // actions
  addRow,          // (rawText = '') -> row
  bulkConvert,      // (text) -> { added, invalid }  (REPLACE: erases rows first, then regenerates from text)
  removeRow,        // (id) -> void  (bypasses the ctConfirm dialog — direct action for deterministic tests)
  removeAllRows,     // () -> void  (bypasses the ctConfirm dialog — direct action for deterministic tests)

  // live state
  state,            // live (non-cloned) reference — tests can read state.rows directly

  // derived output getters
  rgbaOutput,
  hexOutput,
};
```

- `removeRow` and `removeAllRows` are both exposed directly (not gated behind
  `ctConfirm`) so tests can reset state between assertions without simulating
  clicks/keydowns; the **UI paths** (trash → `ctConfirm` → Enter/click-Yes;
  Remove-all button → `ctConfirm` → Enter/click-Yes) are exercised separately
  by driving the real button/dialog through Playwright (`page.getByRole`)
  rather than calling a bypass for *that* specific assertion.
- Namespace is a plain object assigned once at module init — inert for
  normal users, no observable UI difference when unused.

## 11. CSS notes (brief — worker has latitude on visual polish)

- Reasonable max-width on the whole page (e.g. `900–1100px`, centered) so
  rows and output textareas don't stretch unreadably wide.
- Row grid: something like
  `grid-template-columns: 1fr 24px 140px 180px 32px;` with `gap` — adjust to
  taste, the important constraint is the swatch stays a fixed small square
  (~20×20 with padding) and the two output fields don't get so narrow that
  `#rrggbbaa` (9 chars) or `rgba(255, 255, 255, 0.5)` truncate.
- Checkerboard for alpha < 1: a small repeating background, e.g.
  `background-image: conic-gradient(#ccc 90deg, #fff 90deg 180deg, #ccc 180deg 270deg, #fff 270deg); background-size: 8px 8px;`
  underneath the swatch's own background-color (which is itself semi-
  transparent via the rgba value, so the checker shows through).
- Invalid swatch: visually distinct from both empty and alpha-checker states
  — a red-ish hatch pattern or a bold "?" glyph are both fine; just don't
  reuse the alpha checker pattern (would be ambiguous with a real
  semi-transparent color).
- Keep both output `<textarea>`s monospace (`font-family: monospace`) so
  columns of hex/rgba values line up visually — a nice-to-have, not required.

## 12. Script organization (inside the single `<script type="module">`)

Suggested section order, each with a `// ====...` banner comment (mirrors
color-picker's organization):

1. DOM references (`const pasteInputEl = document.getElementById(...)`, etc.)
2. State (`state`, `nextId`)
3. `parseColor` + its regexes + helpers (`parseHex`, `buildRgba`,
   `clampChannel`, `clampAlpha`) — pure, no DOM
4. `rgbaString` / `hexString` — pure, no DOM
5. Row management: `addRow`, `removeRow`, `removeAllRows`,
   `updateRemoveAllDisabled`
6. Row rendering: `renderRows`, `buildRow`, `updateRowVisuals`, the
   input-debounce wiring (`onRowInput`)
7. Derived outputs: `rowToRgbaLine`, `rowToHexLine`, `invalidLine`,
   `rgbaOutput`, `hexOutput`, `renderOutputs`
8. Copy: `copyText`, `handleCopyClick`, wiring for row copy buttons and the
   two Copy-all buttons
9. Bulk convert: `bulkConvert` (REPLACE semantics), `showParseSummary`,
   Convert button wiring; Clear/Remove-all button wiring, each an
   `async () => { if (await ctConfirm(message)) {...} }` guard (current —
   supersedes the old "generalized confirm modal" step below)
10. Initial render (`renderRows(); renderOutputs();` once at load — starts
    with zero rows, both outputs empty strings, Remove-all disabled)
11. Test hook: `window.__colorConverter = {...}`

Current `index.html` structure around the module script: the pasted HTML
footer (`tools/include/footer.html`) sits at the bottom of `<body>`, followed
by a classic (non-module) `<script>` carrying the pasted `ctConfirm`
component (`tools/include/confirm.js`), followed by the
`<script type="module">` above. `ctConfirm` must be a classic script (not a
module) so it attaches `window.ctConfirm` synchronously before the module
script's event listeners can be invoked by user interaction.

## 13. Ordered build checklist

1. Write the static HTML skeleton (header, paste section, rows section with
   header row + empty list + Add row/Remove all, outputs section with two
   textareas + copy-all buttons) with every `data-testid` from section 10 in
   place; the pasted footer + `ctConfirm` script go at the bottom of `<body>`
   (see the note at the end of section 12) rather than as inline modal
   markup.
2. Implement `parseColor` + `rgbaString`/`hexString` as standalone pure
   functions first; sanity-check a handful of cases by hand (`#abc`,
   `#aabbccdd`, `rgb(255,0,0)`, `rgba(0 0 0 / 0.5)`, `not a color`) before
   wiring any DOM.
3. Implement row state + `addRow`/`removeRow`/`removeAllRows` and
   `renderRows`/`buildRow` (static render, no live-typing yet). Verify Add
   row / trash work and Remove-all's disabled state tracks row count.
4. Wire per-row live conversion (`onRowInput`, debounce, `updateRowVisuals`)
   and swatch states (empty/invalid/valid+alpha-checker).
5. Implement `rgbaOutput`/`hexOutput`/`renderOutputs` and call it from every
   row-mutating path (`addRow`, `removeRow`, `removeAllRows`,
   `onRowInput`'s debounced callback, `bulkConvert`). Verify line-alignment
   by eyeballing a mix of valid/invalid/empty rows.
6. Implement `copyText`/`handleCopyClick`; wire per-row hex/rgba copy
   buttons and both Copy-all buttons.
7. Implement `bulkConvert` (REPLACE: erase rows first, then regenerate) +
   `showParseSummary`; wire Convert (no confirmation) and Clear (opens the
   confirm modal). Test that a second Convert regenerates from the paste box
   rather than accumulating on top of the first.
8. Wire per-row trash, Clear, and Remove all to the shared `ctConfirm`
   dialog (`if (await ctConfirm(message)) {...}`, one call site each — see
   `DESIGN.md` § "Removal & confirm"); verify the correct message shows per
   action and that `window.__colorConverter.removeRow`/`removeAllRows` still
   work as direct, non-dialog calls.
9. Pass over accessibility: labels, aria-labels, **`title` tooltips on every
   icon-only button**, aria-live on parse summary, focus-visible styles,
   responsive breakpoint for rows + outputs stacking, and the ~44px
   mobile tap-target CSS bump.
10. Add the `window.__colorConverter` test hook last (after all referenced
    functions exist), matching the exact shape in section 10.
11. Manual smoke test in a browser: paste a mixed batch (hex shorthand, hex
    long, rgba comma, rgb slash, garbage line, blank lines), Convert, verify
    summary count, edit the paste box and Convert again (rows should
    regenerate, not accumulate), edit a row inline, copy a few fields, remove
    a single row via trash → `ctConfirm`, Clear the paste box via `ctConfirm`,
    Remove all via `ctConfirm` (Enter and Esc paths for each), reload
    confirms nothing persists (no persistence is in scope); also check at a
    ~375px/360px viewport that nothing overflows horizontally and buttons are
    comfortably tappable.
12. Add the mobile Playwright `describe` block (real taps, not the
    `window.__*` hooks) per `docs/conventions.md` § Responsive & mobile.
