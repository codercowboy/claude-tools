# Pretty-Printer & Minifier

A single-file, dependency-free web tool that **pretty-prints and minifies** code
in six languages — **JSON, YAML, HTML, CSS, SQL, and JavaScript** — selected by
a tab row at the top. It opens straight from `file://` (no server, no build, no
CDN) and does everything locally in your browser; nothing you paste is ever
sent anywhere.

Every formatter and minifier is **hand-rolled in vanilla JavaScript** — there
are no third-party libraries, no WASM, and no network calls. That constraint is
the whole point of this repo, and it shapes the scope below.

## Using it

1. Open `index.html` in a modern browser.
2. Pick a **language tab** (JSON · YAML · HTML · CSS · SQL · JavaScript). Arrow
   keys (Left/Right/Home/End) move between tabs.
3. Paste or type your code into the **Input** box up top.
4. Choose **Format** (pretty-print) or **Minify**. The **Output** updates live
   in the taller box below, with a byte-count and — for minify — how many bytes
   were saved (shown next to the Output label).
5. Adjust **Indent** (2 spaces / 4 spaces / Tab) for formatting, and — on the
   SQL tab — the **keyword case** (Unchanged (default) / UPPERCASE / lowercase).
6. **Load sample** drops in a representative example (it asks first if you'd
   overwrite non-empty input); **Clear** empties the current tab; the **📋**
   button inside each box copies its contents (the input's appears once you've
   typed something).

Your active tab, mode, indent, SQL keyword case, and the text you've typed for
each language are remembered on this device. The output is always recomputed and
never stored.

## Scope & limitations (per engine)

The overriding rule for every engine is that **output is always semantically
equivalent to input.** When a transform could change meaning, the tool leaves
that region untouched or reports an error — it never silently corrupts code.

### JSON — full pretty-print + minify
Parses with a strict JSON parser and re-serializes. Format re-indents; minify
removes all insignificant whitespace. Invalid JSON is reported with a
line/column when one can be located. (Comments and trailing commas are not
valid JSON and will be reported as errors.)

### YAML — a documented common subset (full pretty + minify)
Hand-rolled parser covering the practical everyday subset: block mappings, block
sequences, arbitrary nesting, scalars (plain, single- and double-quoted),
booleans/null/numbers, `#` comments, blank lines, flow collections
(`[a, b]` / `{k: v}`), and a single optional leading `---`.

**Explicitly out of scope** (detected and rejected with a clear
`Unsupported YAML feature: …` message, never mis-parsed): anchors & aliases
(`&`/`*`), tags (`!`/`!!`), complex/explicit keys (`?`), block scalars
(`|`/`>`), tab indentation, and multi-document streams. **Comments are dropped**
by both format and minify. Format emits canonical block YAML; minify emits
compact flow style.

### HTML — full pretty-print + conservative minify
Hand-rolled tokenizer handling tags, attributes (kept verbatim, so quotes and
values containing `<`/`>` are never corrupted), text, comments, doctype, void
elements, and **raw-text elements** (`<script>`, `<style>`, `<pre>`,
`<textarea>`) whose contents are preserved byte-for-byte. Because HTML
whitespace can be significant, **minify is deliberately conservative**: it drops
comments (keeping IE conditional and `<!--!` bang-comments), collapses
inter-tag whitespace, and drops whitespace-only text between block-level
elements, while leaving inline spacing and raw-text contents alone.

### CSS — full pretty-print + minify
Hand-rolled tokenizer aware of strings, `/* */` comments, `url(...)` (including
unquoted), at-rules (`@media`, `@font-face`, `@keyframes`, …) and nested blocks.
Format puts one declaration per line; minify strips comments and insignificant
whitespace, removes spaces around `{ } : ; ,`, and drops the last `;` in a
block. Declarations are never merged or reordered, and string/`url()` contents
are preserved.

### SQL — reliable pretty-print + **safe** minify
Token-based (not a full SQL parser), aware of string literals (`'...'` with
`''` escapes), quoted identifiers (`"..."` and `` `...` ``), and line (`-- …`)
and block (`/* */`) comments. **Format** puts major clauses on their own lines,
indents subqueries, and applies the chosen keyword case to recognized keywords
only (never inside strings, identifiers, or comments) — it only changes
whitespace and keyword case, never the token stream. **Minify** only strips
comments and collapses whitespace to single spaces on one line. There is **no**
identifier renaming or query rewriting. Pretty-printing is best-effort and
readable; correctness (token preservation) is guaranteed.

### JavaScript — reliable pretty-print + **safe** minify
A hand-rolled **tokenizer** is the crux here. It correctly distinguishes line
and block comments, single/double-quoted strings, **template literals**
(including nested `${…}` expressions and nested templates), **regex literals vs
division** (via the preceding-significant-token rule), numbers,
identifiers/keywords, and punctuators.

- **Format** is a reliable re-indenter with token-level spacing: it puts a
  space around binary operators (`||`, `&&`, `+`, comparisons, `=>`, and `=` in
  assignments/declarations) — but not around unary operators or in the
  regex-vs-division cases — a space after every comma, and a space before a
  block `{` (`function foo() {`, `if (x) {`, `} else {`); it keeps `import`/
  `export`-list statements on a single line and puts a blank line between the
  import group and the top-level declarations that follow. It only moves and
  normalizes whitespace and never removes, reorders, or rewrites a token. To
  protect automatic semicolon insertion (ASI), it **never joins tokens across an
  existing newline**.
- **Minify** removes comments and collapses insignificant whitespace only. It
  keeps a space wherever removing it could merge two tokens (e.g. `a - -b`,
  `i++ + j`, `a / /re/`), never touches the contents of strings, template
  literals, or regexes, and — being conservative about ASI — **preserves
  existing line breaks** rather than risk changing behavior.

There is **no** identifier renaming, dead-code elimination, or AST rewriting.
The savings come from stripping comments, indentation, and blank lines, plus
collapsing intra-line whitespace. This is a *safe* minifier, not an aggressive
one.

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from the
`source/` folder and must never be hand-edited.

```
source/
├── index.template.html   # page shell + tab row + editor + Help modal + build tokens
├── styles.css            # tool styles (base.css is inlined by the build)
├── logic.mjs             # ALL six hand-rolled engines + SAMPLES (pure, exported)
└── app.mjs               # tabs (ARIA), controls, live run, persistence, hooks
```

- `npm run build` — assemble `source/` → `index.html`.
- `npm run build:check` — fail if the committed `index.html` is stale.
- `npm test` — unit tests (`node --test`, importing `source/logic.mjs`) then the
  Playwright e2e suite. `build:check` runs first, so a stale build fails the run.
- `npm run serve` — serve the tool over HTTP for behavior that differs from
  `file://`.

Edit `source/`, run `npm run build`, and commit **both** the source and the
regenerated `index.html`. See `docs/conventions.md` § "Build-assembled tools".

The pure engines live in `source/logic.mjs` with stable export names
(`formatJSON`/`minifyJSON`, `parseYAML`/`formatYAML`/`minifyYAML`,
`formatHTML`/`minifyHTML`, `formatCSS`/`minifyCSS`, `formatSQL`/`minifySQL`,
`formatJS`/`minifyJS`, `tokenizeJS`, and `SAMPLES`) so the unit tests can import
them directly and the app can inline them.

<!-- readme-footer: paste at the bottom of each tool's README. Keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
