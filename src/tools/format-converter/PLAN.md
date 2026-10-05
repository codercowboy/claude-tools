# Format Converter — PLAN

Implementation plan derived from `DESIGN.md`. Build-assembled under `source/`.

## Files

```
src/tools/format-converter/
├── DESIGN.md                     # spec (done)
├── PLAN.md                       # this file
├── README.md                     # usage + dev section + readme-footer
├── package.json                  # @codercowboy/format-converter
└── source/
    ├── index.template.html       # page shell + tokens
    ├── styles.css                # tool CSS (after base.css)
    ├── logic.mjs                 # pure engine (parsers/emitters/detect/convert)
    └── app.mjs                   # DOM wiring, options, persistence, help, copy
```

`index.html` is **generated** by `npm run build` — never hand-edited.

## Step 1 — `source/logic.mjs` (pure engine)

Order of implementation (each pure, exported, DOM-free):

1. **Shared helpers** — `isPlainObject`, `flatten`/`unflatten` (dotted keys),
   number/scalar formatting, error helper.
2. **JSON** — `parseJSON`, `emitJSON({ indent })`.
3. **CSV/TSV** — `parseCSV(text,{delimiter,header})` (RFC-4180-ish state
   machine: quotes, `""`, embedded delimiter/newline), `emitCSV`,
   `parseTSV`/`emitTSV` (delegate, `\t`). Tabular-model guard on emit.
4. **.properties** — `parseProperties` (comments, continuations, `\u`/escapes,
   `=`/`:`/space separators, then un-flatten), `emitProperties({escapeUnicode})`
   (flatten + Java escaping + sorted output).
5. **XML** — `parseXML` (recursive-descent: decl, elements, attrs, text, CDATA,
   comments, self-close, entity decode) → element tree → model convention;
   `emitXML({rootName,attributes,declaration,indent})` (escape, attr strategy,
   repeated-element arrays).
6. **YAML** — comment strip, unsupported-construct rejection, line/indent
   tokenizer, recursive block parser (mappings, sequences, same-indent
   sequences, inline maps in sequences, block scalars `|`/`>`, flow `[]`/`{}`),
   scalar type inference; `emitYAML({indent})` block emitter with minimal
   quoting.
7. **`detectFormat(text)`** — ordered heuristic from DESIGN.
8. **`convert(text, from, to, opts)`** — resolve auto → detect, parse, emit;
   throw friendly `Error`s.
9. **`FORMATS`** — id/label/select metadata array.
10. `export { … }` all of the above.

## Step 2 — `source/index.template.html`

Head: charset/viewport, `<title>`, og/twitter meta, `:root` light + dark
tokens (reuse the base64/dev-converter palette, add `--jbcc-accent`), then
`<<ct:include base.css>><<ct:inline styles.css>>`.

Body: header (title/subtitle + `?`), format bar (From/Swap/To selects +
detect status), input textarea + Clear/Sample, contextual options panel
(CSV/TSV, JSON/YAML indent, XML, properties), output textarea + Copy, error
region. Help overlay + modal-close-✕. `<<ct:include footer.html>>`, then
`<script><<ct:include copy.js>><<ct:include JbcConfirm.mjs>></script>` and
`<script type="module"><<ct:inline app.mjs>></script>`.

## Step 3 — `source/styles.css`

Reuse base64-tool structure: body/app/header, buttons (`button:hover:not(
:disabled):not(.jbcc-btn)`), fields, format bar grid, options panel, output
field, error, help modal + `.modal-close-x`, responsive `@media (max-width:
640px)`, reduced-motion. `--jbcc-accent` wired for `confirmDialog`.

## Step 4 — `source/app.mjs`

`<<ct:inline logic.mjs>>` at top, then: state + persistence (`loadState`/
`saveState`), DOM refs, `render()` (call `convert`, show output or error,
update detect status, show/hide relevant option groups), event wiring
(selects, textarea input, option inputs, swap, clear w/ `confirmDialog`, sample,
copy), help modal (focus trap/Esc/backdrop/✕/return), init (restore + first
render + first-load help), and the `window.__formatConverter` hook.

## Step 5 — `package.json` + `README.md`

Copy base64-tool `package.json`, rename to `@codercowboy/format-converter`,
update description/keywords/`main`. README: what it is, the format-mapping
tables, options, a "Developing (build from source)" section, then the verbatim
`readme-footer.md`.

## Step 6 — Build & validate

```
cd src/tools/format-converter
npm run build        # writes index.html
npm run build:check  # exit 0 — index.html matches source/
```

Both must exit 0. No root `npm install`. No `tests/` and no `preview.png` in
this pass (out of scope for the builder).

## Out of scope (this pass)

- `tests/` suite (unit + e2e) — a later stage.
- `preview.png` — a later stage.
- Gallery card in `src/tools/index.html` — a later stage.
