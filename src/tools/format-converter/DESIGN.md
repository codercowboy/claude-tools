# Format Converter — DESIGN

Source-of-truth spec for the **Format Converter** tool.

## What it is

A single-file, dependency-free web tool that converts a document between six
data-serialization formats:

**JSON · CSV · TSV · YAML · .properties · XML**

You paste (or type) a document in one format, pick a source format (or let
**Auto-detect** guess), pick a target format, and the converted output appears
live. Everything runs locally in the browser — nothing is ever sent anywhere.

Per repo hard rules: **vanilla JS/Node, zero dependencies, ES modules,
`file://`-safe, no secure-context-only APIs.** Build-assembled from `source/`
into a committed single-file `index.html`. All parsing/emitting logic is pure
and DOM-free in `source/logic.mjs` (exported, unit-testable).

## The core model

Everything flows through **one normalized JS data model**:

```
parse<Source>(text, opts)  →  plain JS value  →  emit<Target>(model, opts)
```

The intermediate "model" is ordinary JavaScript data: **objects, arrays,
strings, numbers, booleans, and `null`**. Each format has a hand-rolled
`parseX` (text → model) and `emitX` (model → text). Conversion is just
`emit(parse(text))`. This keeps every format independent — adding one later
means one parser + one emitter, nothing else changes.

`convert(text, from, to, opts)` is the single entry point: it resolves
`from` (running `detectFormat` when `from === 'auto'`), parses to the model,
then emits the target. Any failure throws a friendly `Error` with a readable
message; the UI never crashes.

## Formats and their nesting model

Three formats are **natively nested** (JSON, YAML, XML) and can represent
arbitrary object/array trees directly. Two are **tabular** (CSV, TSV) and one
is **flat key/value** (.properties). The mappings below are the heart of the
design — they are documented in the tool's Help and README too.

### JSON

- `parseJSON` — `JSON.parse` (with a friendlier error message on failure).
- `emitJSON` — `JSON.stringify` with the chosen **indent** (0 = minified).

### YAML (hand-rolled, practical subset)

`parseYAML` / `emitYAML` implement a **practical common subset** of YAML — the
90% that shows up in config files — and **reject unsupported constructs loudly**
rather than silently mis-parsing them.

**Supported**

- Block mappings (`key: value`) nested by **space** indentation.
- Block sequences (`- item`), including sequences nested under a key at the
  same indentation as the key, and inline maps as sequence items
  (`- key: value` with aligned following keys).
- Scalars: plain, `'single-quoted'`, `"double-quoted"` (with `\n \t \" \\ \/`
  and `\uXXXX` escapes in double quotes).
- Plain-scalar **type inference**: `null` / `~` / empty → `null`;
  `true` / `false` → boolean; integers and floats (incl. `1e3`, `.5`, `-2`) →
  number; everything else → string.
- Flow collections: `[a, b, c]` and `{ a: 1, b: two }` (nesting allowed).
- Comments (`# …`), a single leading `---` document marker, a trailing `...`.
- Block scalars: `|` (literal, newlines kept) and `>` (folded, newlines →
  spaces), with basic `-`/`+` chomping.

**Rejected (throws a clear error naming the construct)**

- Anchors `&a` / aliases `*a`, explicit tags `!!type` / `!tag`, merge keys
  `<<`, complex mapping keys (`? …`), and multiple documents (more than one
  `---`). Tabs used for indentation are rejected (YAML forbids them).

`emitYAML` always emits **block style** with the chosen indent, quoting strings
only when needed (empty, leading/trailing space, reserved words, indicator
characters, or anything that would otherwise re-parse as a non-string).

### XML (hand-rolled)

`parseXML` is a small recursive-descent parser handling: the `<?xml …?>`
declaration, elements, attributes, text, `<![CDATA[…]]>`, `<!-- comments -->`,
self-closing tags, and entity decoding (`&lt; &gt; &amp; &quot; &apos;`,
numeric `&#nn;` / `&#xnn;`). It builds an element tree, then maps it to the
model with this **convention**:

- An element becomes `{ '<tagName>': value }` at the top level, so the **root
  element name is preserved** (round-trips through `emitXML`).
- Attributes become `@name` keys.
- Text content becomes the element's value directly when the element has **no
  attributes and no child elements**; otherwise it becomes a `#text` key.
- **Repeated** child elements with the same tag become an **array**.
- An empty element becomes `""` (or `{}` if it has attributes).

`emitXML(model, opts)` reverses it, with options:

- **`rootName`** (default `root`) — the wrapping element name. If the model is a
  single-key object (e.g. the `{ note: {…} }` that `parseXML` produces), that
  key is used as the root name so XML→…→XML round-trips; otherwise `rootName`
  wraps the whole model.
- **`attributes`** strategy — `false` (default): every object key becomes a
  **child element**; `true`: primitive-valued keys become **attributes**, while
  object/array values stay child elements. `@`-prefixed keys are always
  attributes and `#text` is always element text, regardless of strategy.
- **`declaration`** (default `true`) — emit the `<?xml version="1.0"
  encoding="UTF-8"?>` prolog.
- Arrays render as repeated elements sharing the key's name. Special characters
  are entity-escaped.

### CSV / TSV (tabular ⇄ array-of-row-objects)

Tabular formats map to/from an **array of row objects**, first row = headers.

- `parseCSV(text, { delimiter, header })` — **RFC-4180-ish**: fields may be
  quoted with `"`, quoted fields may contain the delimiter, newlines, and
  escaped quotes (`""` → `"`). With **header on** (default) → array of objects
  keyed by the header row; with header off → array of arrays. Cell values are
  kept as **strings** (no type coercion) for predictable, lossless text
  round-trips.
- `emitCSV(model, { delimiter, header })` — accepts an **array of objects**
  (columns = union of keys in first-seen order; header row emitted when
  `header` is on), an **array of arrays**, or an **array of primitives**
  (single `value` column). A plain object is treated as a single row. Nested
  values in a cell are `JSON.stringify`-ed. Fields are quoted only when they
  contain the delimiter, a quote, or a newline.
- **TSV** is CSV with a **tab** delimiter: `parseTSV` / `emitTSV` delegate to
  the CSV engine with `delimiter: '\t'`.

Converting a **non-tabular** model (e.g. a deeply nested object that is not an
array of rows) **to** CSV/TSV raises a friendly error explaining that the
target is tabular and the source must be an array of records.

### .properties (flat ⇄ dotted keys)

`.properties` is flat `key=value`. Nested structures map to/from **dotted
keys**.

- `emitProperties(model)` — **flattens** the model: nested object keys join with
  `.` (`a.b.c=…`); array elements use their **numeric index** as a segment
  (`list.0=…`, `list.1=…`). Keys and values are escaped Java-.properties style:
  in keys, ` `, `:`, `=`, and `\` are backslash-escaped; in values, leading
  spaces, `\`, and control chars (`\n`, `\t`, `\r`, `\f`) are escaped; non-ASCII
  can optionally be `\uXXXX`-escaped (**Escape unicode** option). Output is
  sorted for stable diffs.
- `parseProperties(text)` — parses `key=value`, `key:value`, and `key value`
  separators; `#`/`!` line comments; **line continuations** (trailing `\`);
  and `\uXXXX` + `\`-escapes. It then **un-flattens** dotted keys back into
  nested objects. A segment that is a non-negative integer reconstructs an
  **array** when *all* sibling segments at that level are the consecutive
  integers `0..n-1`; otherwise integer-looking segments stay object keys.
  Values remain **strings** (no type coercion).

## Auto-detect

`detectFormat(text)` returns one of the six format ids or `null` (ambiguous /
empty). Heuristic, in order:

1. Empty/whitespace → `null`.
2. Starts with `<?xml` or `<tag` → `xml`.
3. First meaningful char is `{`, `[`, or `"` and `JSON.parse` succeeds → `json`.
4. First non-comment line contains a **tab** and the file looks columnar →
   `tsv`.
5. Lines look like `key=value` (more `=`-delimited lines than `:`-mapping or
   `- ` sequence lines) → `properties`.
6. Has `key: value` mappings, `- ` sequences, or a leading `---` → `yaml`.
7. First line contains a **comma** and rows look columnar → `csv`.
8. Otherwise → `null` (the UI asks the user to pick a source format).

Detection is best-effort and documented as such; ambiguous input (e.g. a
single-column CSV vs a plain string) may need the source format chosen by hand.

## UI

Sticky-max-width single column (matches base64-tool / dev-converter):

- **Header** — title, subtitle, and a `?` **Help** button (first-load Help
  popup, per conventions).
- **Setup card** — the **From**/**To** selectors and the contextual options
  live together on **one card** (`.setup-card`). It holds:
  - **Format bar** — a **From** `<select>` (Auto-detect + the six formats), a
    **⇄ Swap** button, and a **To** `<select>`. When From = Auto-detect, a small
    status line shows the detected format (aria-live).
  - **Options block** — separated by a hairline rule, shows only the options
    relevant to the current From/To pair (the same contextual groups as before,
    each still show/hidden per target format):
    - CSV/TSV: **delimiter** (text; TSV locked to tab) + **header row** toggle.
    - JSON/YAML: **indent** (0/2/4).
    - XML: **root element name**, **attributes vs. child elements** strategy,
      **XML declaration** toggle.
    - .properties: **escape unicode** toggle.
- **Input** — a labelled textarea (wrapped in `.ct-field.ct-field--multiline`)
  with an **in-field copy** button revealed only when the textarea is non-empty,
  plus **Clear** (confirms via `confirmDialog` when the textarea holds non-trivial
  content) and **Sample** (loads a small example for the current source format).
- **Output** — a readonly textarea (also `.ct-field.ct-field--multiline`) with an
  always-shown **in-field copy** button pinned top-right (`ctCopy` + `ctFlash`).
- **Error region** — an `aria-live` alert that shows friendly parse/convert
  errors; output is cleared while an error is shown.

Light + dark themes, responsive/mobile, **44px standard control height** via the
shared `controls.css` include (added after `base.css`, before the tool's color
rules); the **in-field copy** buttons follow its `.ct-field` / `.ct-copy-btn`
pattern. `<select>` uses the shared `ct-base` fix (`background-color`, not the
shorthand, so the chevron survives) and each select is sized wide enough for its
longest option so the selected text never overlaps the chevron (the indent
select uses `width:auto` + a `min-width` floor rather than a fixed narrow width).
`[hidden] { display:none !important }` guard is present via `base.css`.
og/twitter meta + shared footer included.

### Destructive-action carve-out

**Clear** empties the input textarea, which can hold a large pasted document, so
it **uses `confirmDialog`** when the textarea is non-empty (per the conventions'
"clearing meaningful content" rule). Loading a **Sample** over existing input
also confirms. `--jbcc-accent` is set to the tool accent so the highlighted
"Yes" reads as a filled primary, and the generic `button:hover` rule excludes
`.jbcc-btn`.

## Persistence

- `format-converter:v1` — input text, `from`/`to` formats, and all options
  (delimiter, header, indent, xml root/attributes/declaration, properties
  unicode). Restored on load, saved on change. Best-effort try/catch; the tool
  works fully with no stored state. Derived output is **not** persisted.
- `format-converter:help-seen:v1` — first-load Help seen flag (degrades to not
  auto-showing if storage throws).

## Testability hooks

- `data-testid` on every interactive element.
- `window.__formatConverter` — an inert namespace exposing the pure functions
  (`parseJSON`, `emitJSON`, `parseYAML`, `emitYAML`, `parseCSV`, `emitCSV`,
  `parseTSV`, `emitTSV`, `parseProperties`, `emitProperties`, `parseXML`,
  `emitXML`, `detectFormat`, `convert`, `FORMATS`), the `convert` entry point,
  and the live `state`. Inert for normal users.

## Pure logic (`source/logic.mjs`)

Exports: `FORMATS`, `parseJSON`, `emitJSON`, `parseYAML`, `emitYAML`,
`parseCSV`, `emitCSV`, `parseTSV`, `emitTSV`, `parseProperties`,
`emitProperties`, `parseXML`, `emitXML`, `detectFormat`, `convert`. All
DOM-free and pure; round-trips are lossless where the formats allow (JSON↔YAML
for JSON-representable data; CSV↔TSV; properties flatten/un-flatten).

## Known limitations

- **YAML subset** only (see the rejected list). Advanced YAML (anchors, tags,
  multi-doc, merge keys) is refused with a clear message, by design.
- **CSV/TSV values are strings** — converting CSV→JSON yields string cells, not
  inferred numbers/booleans (predictable and lossless for text).
- **CSV/TSV require a tabular model** — an arbitrary nested object cannot be
  flattened into a single table and produces a friendly error instead.
- **.properties values are strings** and nesting is inferred from dotted keys;
  a literal dot inside a key is indistinguishable from a nesting separator.
- **XML** targets a pragmatic element/attribute/text convention, not a
  full XML-Schema-faithful round-trip; mixed content beyond a single `#text`
  run is simplified, and processing instructions/DOCTYPE are ignored.
