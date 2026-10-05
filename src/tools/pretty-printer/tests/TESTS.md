# Tests — Pretty-Printer & Minifier

Two required layers (per `CLAUDE.md` and `docs/conventions.md`):

- **Unit** — `node --test tests/unit/*.test.mjs`, importing `source/logic.mjs`
  directly (DOM-free pure logic). `npm run test:unit` (build:check runs first).
- **e2e** — `@playwright/test` driving the built `index.html` over `file://`.
  `npm run test:e2e` (build:check runs first).

`npm test` runs both. Current status: **105 unit tests pass, 31 e2e tests pass.**

The unit tests are the headline deliverable: the product owner asked for "VERY
elaborate" coverage, because every one of the six engines is hand-rolled and the
overriding invariant is that **output is always semantically equivalent to
input**. The suites are organised by language.

## Unit coverage (`tests/unit/`)

Per-file counts: json 17 · yaml 16 · html 15 · css 14 · sql 15 · js 19 ·
samples 9 = **105**.

### `json.test.mjs` — `formatJSON` / `minifyJSON` (17)
- **Semantic equivalence:** `JSON.parse(minify(x))` deep-equals `JSON.parse(x)`;
  format round-trips through `JSON.parse`; minify equals V8's whitespace-free
  serialization.
- **Idempotency:** `fmt(fmt(x)) === fmt(x)`; format→minify→format is stable.
- **Indent variants** 2 / 4 / tab (exact bytes) and every variant round-trips.
- Top-level primitives (number/string/bool/null) and top-level arrays through
  both engines; escaped strings and special keys preserved.
- **Errors:** invalid input throws `Error` prefixed `Invalid JSON:`; the message
  carries `(line L, col C)` when V8 provides a position; the whole-source echo in
  newer V8 messages is trimmed out.

### `yaml.test.mjs` — `parseYAML` / `formatYAML` / `minifyYAML` (16)
- **Round-trips:** `parseYAML(formatYAML(x))` and `parseYAML(minifyYAML(x))`
  deep-equal `parseYAML(x)` across block maps/seqs, nesting, seq-of-maps,
  map-of-seqs, scalars, quoted strings, flow collections, a leading `---`,
  comments and blanks.
- Idempotency of both format and minify; scalar typing (null/bool/number/hex/
  string); quoted scalars keep structural chars; comments ignored, not parsed;
  format emits block, minify emits compact flow; comments dropped by both.
- **Every unsupported feature throws the documented `Unsupported YAML feature:
  …` error** (exact message + line): anchors `&`, aliases `*`, tags `!`/`!!`,
  complex keys `?`, block scalars `|`/`>`/`|-`, tab indentation, multiple
  documents, and a top-level anchor — asserted through `parseYAML`, `formatYAML`
  and `minifyYAML`. Malformed `key: value` lines report a friendly line error.

### `html.test.mjs` — `formatHTML` / `minifyHTML` (15)
- Idempotency of both engines; **minify never drops a non-whitespace text node**
  (compared run-for-run); raw-text (`script`/`style`/`pre`/`textarea`) contents
  preserved byte-for-byte by both engines; attribute values containing `< > "`
  handled and attribute order preserved.
- Minify drops ordinary comments but keeps IE conditional + `<!--!` bang
  comments; collapses whitespace-only text between block elements; preserves
  spacing around inline elements; keeps the doctype.
- Format emits void elements without a bogus close tag and nests with indent.

### `css.test.mjs` — `formatCSS` / `minifyCSS` (14)
- Idempotency of both; **`minifyCSS(formatCSS(x)) === minifyCSS(x)`** — format
  and minify agree on the rule/declaration set (comment-safe check).
- Strings and `url()` (quoted, unquoted, inner spaces, `data:` URIs) preserved
  byte-for-byte; spaces around `{ } : ; ,` removed; last `;` in a block dropped;
  comments stripped (leading + inline).
- Format shape (`prop: value;`, one per line), indent 2/4/tab, top-level
  comments preserved, nested at-rules indented, multi-selectors split per line.

### `sql.test.mjs` — `formatSQL` / `minifySQL` / `tokenizeSQL` (15)
- **Token-stream preservation via the exported tokenizer:** `formatSQL` keeps
  the full non-whitespace token stream (keywords case-normalized only);
  `minifySQL` keeps it minus comments — across select/join/aggregate/subquery/
  insert/update/delete/strings/quoted-ids/case-expr and the sample.
- Idempotency; minify is single-line; keyword casing never touches string or
  quoted-identifier contents; upper/lower/unchanged casing; `COUNT(*)` keeps no
  space; `WHERE (` / `IN (` keep their space.
- Minify strips `--` and `/* */` comments (but not a `--` inside a string) and
  collapses whitespace. `tokenizeSQL`: `''` escapes, and string/quotedId/
  comment/number/word classification.

### `js.test.mjs` — `formatJS` / `minifyJS` / `tokenizeJS` (19) — the crux
- A large **adversarial battery** (~45 cases) asserting BOTH `formatJS` and
  `minifyJS` are **token-equivalent** to the input (same ordered significant-token
  stream via the exported tokenizer): regex-vs-division (`return /a/g`, `a=b/c/d`,
  `x++ / y / z`, `}/re/`, `typeof /re/`, `this/x/y`, `/[/]/`, escaped `/a\/b/g`),
  nested templates `` `a${`b${c}d`}e` `` and `${ {a:1}.a }`, strings containing
  `//` `/*` backticks/newlines, numeric separators / BigInt / hex / binary,
  optional chaining `?.`, nullish `??`/`??=`, private `#fields`, operator
  adjacency (`a - -b`, `i++ + j`), and ASI corners (`return\n a`, `a\n++b`,
  `throw\nx`).
- **Parseability of the output** (a broken emit is a hard fail): valid-as-script
  cases validated with `vm.Script`, top-level-`return` cases with `new Function`,
  and `import`/`export` cases (incl. the sample) with `node --check` on a temp
  `.mjs`.
- **ASI safety:** `minifyJS` never joins tokens across an existing newline
  (`a\n++b`, `throw\nx`, `return\n a`, two `const`s) and keeps a multi-line
  program multi-line.
- **Literal integrity:** strings/templates/regexes are never edited — including
  that a template's *text* spans survive verbatim while its `${…}` expression is
  minified. Comments stripped, surrounding tokens intact.
- `tokenizeJS` directly: regex-vs-division classification, a `/` inside a regex
  character class, nested-template spans, string/comment/number typing, and
  single-token numeric separators / BigInt / hex.
- Idempotency of both engines.

### `samples.test.mjs` — `SAMPLES` (9)
- `SAMPLES` has exactly the six documented languages, all non-empty.
- Every sample is format-idempotent; per-language semantic checks (JSON deep
  equality, YAML re-parse, HTML raw-text + idempotency, CSS same-set, SQL token
  stream, JS token-equivalence + module parseability); minify-then-format
  stability where a semantic model exists.

## e2e coverage (`tests/pretty-printer.e2e.mjs`, 31)

- **First-load Help** — genuine fresh context auto-shows once, stays closed on
  reload, writes the seen flag; re-open via `?`.
- **Help modal** (pre-seeded, opened via `?`): `✕` close + focus return; Esc
  close + focus return; backdrop click closes / inside-dialog click does not;
  Tab / Shift+Tab focus trap stays inside.
- **Tabs:** correct `tablist`/`tab`/`tabpanel` roles + single selected tab;
  click selects + updates roving tabindex; Left/Right/Home/End arrow nav
  (incl. wrap-around); per-tab input retention; SQL keyword-case control only on
  the SQL tab.
- **Format vs Minify for every language** on its sample (output non-empty; minify
  no larger than format).
- **Indent select** changes the formatted output (2/4/tab) and is disabled in
  Minify mode; **SQL keyword-case select** changes keyword casing.
- **Errors:** invalid JSON shows `Invalid JSON …` + clears output + recovers;
  unsupported YAML shows `Unsupported YAML feature: anchors`.
- **Copy flash**, **stats line** (bytes-saved `−N (P%)` on minify), **load-sample
  `confirmDialog`** only when input is non-empty (cancel keeps text, confirm
  replaces), **Clear** with no confirm.
- **Persistence** across reload (tab, mode, indent, SQL case, per-language text)
  via the persisted blob + `window.__prettyPrinter`.
- **Test hook** shape; every `<select>` carries the base.css chevron.
- **Mobile (375px):** no horizontal overflow; still formats; output fits width.

## Notes / gotchas handled

- Pre-seed `pretty-printer:help-seen:v1` via `addInitScript` in every suite
  except the dedicated first-load suite (fresh `browser.newContext`).
- The output is a JS-populated `<textarea>`: read it via `toHaveValue` /
  `inputValue()`, never `toContainText` (which reads `textContent`, empty here).
- Output updates on a ~150ms debounce after typing: poll the output value rather
  than reading it immediately after `fill`.
- Persistence follows the conventions `file://` guidance — drive state through
  the UI, poll the persisted blob, then a small settle wait before `reload()`.
- Parse validation of `import`/`export` snippets uses `node --check` on a temp
  `.mjs` file (import/export aren't valid in `vm.Script` / `new Function`).
