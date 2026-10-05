# Pretty-Printer & Minifier — DESIGN

Source-of-truth spec for `src/tools/pretty-printer/`. Read with the repo's
`CLAUDE.md` (hard rules) and `docs/conventions.md`. Reference implementation for
structure/patterns: `src/tools/base64-tool/` and the sibling `dev-converter`.

## What it is

A single-file, vanilla, build-assembled web tool that **pretty-prints and
minifies** code in six languages, selected by a **tab row** at the top:
**JSON · YAML · HTML · CSS · SQL · JavaScript**. Ships as one self-contained
`index.html` (opens from `file://`, no deps, no CDN), authored from `source/`
and assembled by `scripts/build-tool.mjs`.

Name (H1 / `<title>` / og:title): **Pretty-Printer & Minifier**.
Folder / artifact id: `pretty-printer`. npm `@codercowboy/pretty-printer`.

### Hard rule: zero dependencies → every engine is hand-rolled

No formatter/minifier libraries, no CDN, no WASM. Every engine is written by
hand in vanilla JS in `source/logic.mjs`. Because of that, we adopt a **"safe
scope"** (product-owner decision):

- **JSON, YAML, HTML, CSS** — full pretty-print **and** minify.
- **JavaScript, SQL** — reliable **pretty-print** + **SAFE minify only**: strip
  comments and collapse *insignificant* whitespace, fully string/regex/template
  aware. **No identifier renaming, no dead-code elimination, no AST rewriting.**
  Safe minify must never change program semantics.

**The overriding correctness invariant for every engine:** output must be
*semantically equivalent* to input. A transform that would change meaning must
instead leave that region untouched (or error), never silently corrupt. This is
what the "VERY elaborate" test suite exists to guarantee.

## Global requirements (conventions)

- Vanilla JS/DOM only; ES modules; no deps; works from `file://`; no
  secure-context-only APIs.
- Shared build includes: `<<ct:include base.css>>`, `<<ct:include
  controls.css>>` (right after base.css — standard 44px control height + the
  in-field copy pattern), `<<ct:include footer.html>>`, `<<ct:include
  copy.js>>`; inline `<<ct:inline styles.css>>`, `<<ct:inline logic.mjs>>`,
  `<<ct:inline app.mjs>>`.
- **First-load Help modal** (auto-once; `pretty-printer:help-seen:v1`; ✕ with
  `data-testid="modal-close-x"`, focus trap, Esc/backdrop close, focus return;
  `[hidden]` guarded by base.css).
- **Persist UI state** under `pretty-printer:v1` (try/catch, degrade silently):
  active tab, current mode (format/minify), indent choice, per-language input
  text, and language options (SQL keyword case). Never persist derived output.
- **Copy** via `copy`/`flash` (JbcClipboardUtil); icon-only buttons get `title`+`aria-label`.
- **Accessibility**: proper `tablist`/`tab`/`tabpanel` roles + arrow-key tab
  navigation (WAI-ARIA tabs pattern); real labels; `:focus-visible`; parse
  errors announced via `aria-live="polite"`; every `<select>` inherits the
  base.css select fix (use `background-color`, never the `background` shorthand
  — see the dev-converter select-chevron lesson); responsive, no horizontal
  overflow (textareas scroll internally).
- **Testability**: `data-testid` on all interactive elements; expose
  `window.__prettyPrinter` with all pure engine fns + a few deterministic entry
  points (setTab, setMode, run) + live `state`; inert for users.
- **Clear** is low-stakes per-language input → no confirm modal (documented
  carve-out; this line documents it). "Load sample" replaces the current
  language's input — since that can overwrite typed content, guard **only** the
  sample-load with `confirmDialog` **when the input is non-empty** (use
  `<<ct:include JbcConfirm.mjs>>`); Clear stays confirm-free.
- Theme: light default + `prefers-color-scheme: dark` (mirror base64-tool
  palette). Watch the `button:hover` specificity trap (exclude `.jbcc-btn`).

## UI

- Header: title + short blurb + `?` Help button.
- **Tab row** `role="tablist"` with six tabs (`data-testid="tab-<lang>"`,
  langs: `json`,`yaml`,`html`,`css`,`sql`,`js`), labels: JSON, YAML, HTML, CSS,
  SQL, JavaScript. Roving tabindex + Left/Right/Home/End arrow nav. Active tab
  persists.
- Controls row (applies to active tab):
  - Mode: two buttons **Format** / **Minify** (`data-testid="mode-format"`,
    `mode-minify"`, `aria-pressed`). Default Format.
  - Indent `<select>` (`indent-select`): `2 spaces` (default) / `4 spaces` /
    `Tab`. Shown for Format; disabled/ignored for Minify. (Not meaningful for
    minify.)
  - SQL only: keyword-case `<select>` (`sql-keyword-case`): `Unchanged`
    (default) / `UPPERCASE` / `lowercase`. Hidden for other tabs.
  - Buttons: **Load sample** (`load-sample`), **Clear** (`clear-input`).
- **Layout: the two textareas stack vertically** — Input on top, Output below
  (on every viewport, not just mobile). The input keeps roughly its current
  height; the output is much taller (many more rows).
- Input `<textarea data-testid="pp-input">` (label "Input") with a live byte
  count. The input's field is wrapped in `.ct-field.ct-field--multiline` with an
  in-field copy button (`copy-input`) revealed only when the input is non-empty.
- Output `<textarea data-testid="pp-output" readonly>` (label "Output"),
  wrapped in `.ct-field.ct-field--multiline` with an always-shown in-field copy
  button (`copy-output`, top-right, via `copy`/`flash` from JbcClipboardUtil). The **stats line**
  (`pp-stats`) sits in the **output's label row** (next to the "Output" label):
  input bytes → output bytes and, for minify, `−N bytes (P%)` saved.
- Error region `data-testid="pp-error"` `role="alert"`+`aria-live="polite"`,
  hidden when clear. On error, show a friendly message (with line:col when the
  engine can locate it) and leave the previous output as-is is NOT required —
  clear the output and show the error.
- Behavior: output updates live (debounced ~150ms) on input change, and
  immediately on mode/indent/option/tab change. Switching tabs swaps to that
  language's remembered input and re-runs.

## Pure engine (`source/logic.mjs`) — DOM-free, exported, unit-tested

Shared: a small `formatBytes`/byte-count helper is fine. Prefer small internal
tokenizers per language. Each public fn takes `(src: string, opts)` and returns
a string, or throws `Error` with a friendly `.message` (and, where locatable,
includes `line`/`col` info in the message) on genuinely invalid input.

Required exports (names are contract; tests import them):

### JSON (full)
- `formatJSON(src, { indent = 2 })` — `JSON.parse` then re-serialize with the
  chosen indent (`indent` is a number of spaces, or the string `"\t"`). Handles
  top-level objects/arrays/primitives. On parse failure throw
  `Error('Invalid JSON: <reason> (line L, col C)')` (compute line/col from the
  error position when possible).
- `minifyJSON(src)` — `JSON.stringify(JSON.parse(src))` (no whitespace).
- Invariant tested: `JSON.parse(minifyJSON(x))` deep-equals `JSON.parse(x)`;
  `formatJSON` idempotent; round-trips through both.

### YAML (subset — full pretty + minify over a documented common subset)
Hand-rolled parser for a **practical common subset**: block mappings, block
sequences, nested structures, scalars (plain/single/double-quoted), booleans/
null/numbers, `#` comments, and blank lines. **Out of scope (must be detected
and rejected with a clear error, never mis-parsed):** anchors/aliases (`&`/`*`),
tags (`!!`), complex/explicit keys (`?`), block scalars (`|`/`>`) — support
these only if cleanly doable; otherwise error `Error('Unsupported YAML feature:
<x> (line L)')`. Multiple documents (`---`): support at least a single leading
`---`.
- `parseYAML(src)` → JS value (internal but exported for tests).
- `formatYAML(src, { indent = 2 })` — parse → re-emit canonical **block** YAML
  with consistent indent; comments are dropped (document this) OR preserved if
  feasible; be consistent and test it.
- `minifyYAML(src)` — emit compact **flow** style (JSON-like:
  `{a: 1, b: [1, 2, 3]}`), comments stripped.
- Invariant tested: `parseYAML(formatYAML(x))` deep-equals `parseYAML(x)`;
  same for minify; unsupported features raise the documented error.

### HTML (full)
Hand-rolled tokenizer: tags (open/close/self-closing), attributes (quoted/
unquoted/boolean), text nodes, comments (`<!-- -->`), doctype, and **raw-text
elements** `<script>`, `<style>`, `<pre>`, `<textarea>` whose contents are
preserved verbatim (never reflowed). Void elements per the HTML spec.
- `formatHTML(src, { indent = 2 })` — re-indent the element tree; text in
  raw/pre/textarea untouched; attributes preserved in order.
- `minifyHTML(src)` — remove comments (keep IE conditional comments
  `<!--[if …]>` and bang-comments `<!--!`), collapse runs of inter-tag
  whitespace, drop whitespace-only text nodes between block-level elements;
  **preserve** whitespace inside/around inline elements conservatively and
  never touch raw-text element contents. Document that HTML whitespace can be
  significant and this is a conservative minify.
- Invariant tested: raw-text contents byte-preserved; `formatHTML` idempotent;
  minify never drops non-whitespace text; attribute values with `<`/`>`/quotes
  handled.

### CSS (full)
Hand-rolled tokenizer aware of strings (`'`/`"`), comments (`/* */`), `url(...)`
(incl. unquoted), at-rules (`@media`, `@font-face`, `@keyframes`, nested
blocks), and declaration blocks.
- `formatCSS(src, { indent = 2 })` — one rule per block, one declaration per
  line, `selector {`\n`  prop: value;`\n`}`, blank line between top-level rules,
  nested at-rule blocks indented.
- `minifyCSS(src)` — strip comments, collapse whitespace, remove spaces around
  `{ } : ; ,`, drop the last `;` in a block, preserve string and `url()`
  contents. Never merge/reorder declarations.
- Invariant tested: strings/url() preserved; `formatCSS` idempotent; minify
  re-parses to the same rule/declaration set.

### SQL (pretty-print full; safe minify)
Token-based (NOT a full SQL parser), aware of string literals (`'...'` with
`''` escapes), quoted identifiers (`"..."` and backtick), line comments
(`-- …`), and block comments (`/* */`).
- `formatSQL(src, { indent = 2, keywordCase = 'unchanged' })` — newline before
  major clauses (`SELECT, FROM, WHERE, AND, OR, JOIN`/`INNER/LEFT/RIGHT/FULL
  JOIN`, `ON, GROUP BY, HAVING, ORDER BY, LIMIT, UNION, INSERT INTO, VALUES,
  UPDATE, SET, DELETE FROM`, etc.), indent select-lists and subqueries in
  parens; apply keywordCase to recognized keywords only (never inside strings/
  identifiers/comments). Best-effort, readable, and **must preserve all tokens**
  (only whitespace/case of keywords changes).
- `minifySQL(src)` — strip comments, collapse runs of whitespace to single
  spaces, trim; preserve string/identifier contents exactly. One-line output.
- Invariant tested: string/comment/identifier contents never altered by minify;
  removing comments/whitespace only; keyword casing never touches string
  contents; format preserves the token stream (compare non-whitespace tokens).

### JavaScript (pretty-print + safe minify; token-level, NO AST)
Hand-rolled **tokenizer** that correctly distinguishes: line/block comments,
single/double-quoted strings, **template literals** (incl. nested `${…}`
expressions and nested templates), **regex literals vs division** (using the
preceding-significant-token rule), numbers, identifiers/keywords, and
punctuators. The tokenizer is the crux — get it right and both transforms are
safe.
- `formatJS(src, { indent = 2 })` — a reliable **re-indenter** with token-level
  spacing: adjust whitespace/indentation around tokens based on bracket depth
  (`{ } ( ) [ ]`), newline after `{`/`;`, etc., PLUS: a space around binary
  operators (`||`, `&&`, `+`, comparisons, `=>`, and `=` in
  assignments/declarations) but never around unary operators or in the
  regex-vs-division cases the tokenizer distinguishes; a space after every
  comma; a space before a block `{` and in `) {` / `} else {`; **import/
  export-list statements kept on a single line**; and a **blank line between
  top-level sections** (the import group, then const/var/function/class
  definitions separated by blank lines). It only moves/normalizes whitespace
  between tokens and never removes, reorders, or rewrites tokens — so the output
  stays token-equivalent to the input and still parses (ASI is preserved because
  existing line-breaks are never removed). Imperfect prettiness is acceptable;
  **breaking code is not.**
- `minifyJS(src)` — remove comments and collapse insignificant whitespace,
  token-aware. **Safety rules (mandatory):**
  - Whitespace between two tokens may be removed only when doing so cannot merge
    them into a different token or change meaning. Keep a single space when both
    sides are "word-ish" (identifier/keyword/number) or when removal would form
    a different operator (e.g. `a - -b`, `a + +b`, `i++ + j`, `a / /re/`).
  - **ASI safety:** never remove a line-terminator whose removal could change
    automatic-semicolon-insertion behavior. Simplest correct approach: preserve
    newlines as newlines (still stripping indentation and blank lines and
    comments) unless a `;` or other unambiguous separator makes the newline
    provably removable. Being conservative (leaving some newlines) is REQUIRED
    over risking ASI corruption.
  - Never alter the contents of strings, template literals, or regex literals.
- **Invariant tested (critical):** for a large battery of inputs, both
  `formatJS(x)` and `minifyJS(x)` must still **parse** (the unit test validates
  parseability via `node:vm`/`new Function` or `node --check` on a temp file)
  and must be **token-equivalent** to the input (same ordered token stream
  ignoring comments/whitespace). Include adversarial cases: regex-vs-division
  (`return /a/g.test(x)`, `a = b /c/ d`), template literals with braces and
  nested templates, strings containing `//`, `/*`, backticks, and newlines,
  ASI-sensitive snippets (`return\n a`, `a\n++b`), object literals, arrow fns,
  comments in tricky spots.

### Samples
- `SAMPLES` — a map `{ json, yaml, html, css, sql, js }` of representative
  example inputs used by the "Load sample" button (exported so tests can use
  them too; each sample must itself round-trip cleanly).

## Tests (both layers; unit tests are the headline deliverable)

- **Unit (`node --test`, `tests/unit/*.test.mjs`)** importing `source/
  logic.mjs`. This must be **VERY elaborate**, per the product owner. For each
  language: format idempotency (`fmt(fmt(x))===fmt(x)`); semantic-equivalence of
  minify; the per-language invariants listed above; error cases with exact/near
  messages; and the full JS/SQL/CSS/HTML adversarial batteries. JS/SQL minify
  must be verified to **still parse** and be **token-equivalent** to the source.
  Organize by language (`tests/unit/json.test.mjs`, `yaml…`, `html…`, `css…`,
  `sql…`, `js…`, plus `samples.test.mjs` asserting every SAMPLE round-trips).
- **e2e (`@playwright/test`, `tests/`)** — first-load Help + close/focus-trap;
  tab switching (click + arrow keys, roles correct) and per-tab input retention;
  Format vs Minify for each language on its sample; indent select changes
  output; SQL keyword-case select; error display on invalid JSON/YAML; copy
  flashes; stats line (bytes saved on minify); load-sample confirm when input
  non-empty; localStorage persistence across reload; **mobile ~375px** no
  horizontal overflow. Pre-seed `pretty-printer:help-seen:v1`; test genuine
  first-load in a fresh context.

## Definition of done

Everything in conventions § "Every tool ships the same set of things":
`package.json`, `README.md` (usage per language + documented scope/limitations
of each hand-rolled engine + dev section + verbatim footer), `tests/` (elaborate
unit + e2e incl. mobile), `source/` → generated `index.html`, HTML footer,
`preview.png` (~1200×630), `DESIGN.md`, `PLAN.md`, and a gallery card added to
`src/tools/source/index.template.html` (utilities). `npm run build` clean;
`npm test` green; `build:check` passes.
