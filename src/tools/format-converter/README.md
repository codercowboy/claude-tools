# Format Converter

A single-file, dependency-free web tool that converts a document between six
data-serialization formats:

**JSON · CSV · TSV · YAML · .properties · XML**

Open `index.html` straight from `file://` — no server, no build, nothing to
install. Everything runs locally in your browser; nothing you paste is ever
sent anywhere.

## How it works

Paste (or type) a document, choose a **From** format (or leave it on
**Auto-detect**), choose a **To** format, and the converted output appears
live. Under the hood every conversion follows one path:

```
parse<Source>  →  a normalized JS data model  →  emit<Target>
```

Each format has its own hand-rolled parser and emitter — no libraries.

## Format mappings

Three formats are natively nested; three are not. The tool maps between them
with clear, documented conventions:

| Format          | Shape          | Nesting mapping |
| --------------- | -------------- | --------------- |
| JSON            | nested tree    | native |
| YAML            | nested tree    | native (practical subset — see below) |
| XML             | nested tree    | elements / attributes / text (see below) |
| CSV / TSV       | tabular        | **array of row objects** (first row = headers) |
| .properties     | flat key/value | **dotted keys** (`a.b.c=…`, arrays use `list.0=…`) |

- **CSV/TSV** ⇄ an array of records. On parse, the header row names the columns
  and each following row becomes an object; on emit, an array of objects
  becomes a table (columns = the union of keys). Cell values stay **strings**.
  Converting a deeply nested object *to* a single table isn't possible and
  shows a friendly error. TSV is CSV with a tab delimiter.
- **.properties** ⇄ dotted keys. Nested objects flatten to `a.b.c=value` and
  array elements use their numeric index (`list.0=value`); on parse, dotted
  keys rebuild the nested object, and a run of consecutive integer segments
  (`0,1,2,…`) rebuilds an array. Java-style escaping is handled both ways.
- **XML** ⇄ model uses a pragmatic convention: attributes become `@name` keys,
  text becomes the element value (or a `#text` key when the element also has
  attributes/children), and repeated child tags become arrays. The root
  element name is preserved.

## Options

The options panel shows only what's relevant to the current conversion:

- **CSV / TSV** — **delimiter** (CSV; TSV is always a tab) and a **header row**
  toggle.
- **JSON / YAML** — **indent** (minified / 2 / 4 spaces).
- **XML** — **root element** name, **primitives as attributes** (vs. child
  elements), and an **XML declaration** toggle.
- **.properties** — **escape non-ASCII** as `\uXXXX`.

## YAML support (practical subset)

The YAML engine covers the common config-file subset: block mappings and
sequences, sequences nested under a key, inline maps as sequence items, flow
collections (`[…]`, `{…}`), plain / single- / double-quoted scalars with type
inference, `|` and `>` block scalars, and comments. **Unsupported** constructs
— anchors, aliases, tags, merge keys (`<<`), and multiple documents — are
**rejected with a clear message** rather than silently mis-parsed. Tabs for
indentation are rejected (YAML forbids them).

## Auto-detect

Leaving **From** on *Auto-detect* guesses the source format from the text
(XML/JSON by structure, TSV/CSV by delimiter, YAML vs. `.properties` by
`key: value` vs. `key=value`). Detection is best-effort; ambiguous input can be
resolved by picking the source format by hand.

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from
the `source/` folder and must not be hand-edited.

```
src/tools/format-converter/
├── index.html            # GENERATED — do not edit
└── source/
    ├── index.template.html
    ├── styles.css
    ├── logic.mjs         # pure engine (parsers/emitters/detect/convert)
    └── app.mjs           # DOM wiring, options, persistence
```

- **Edit `source/`, then rebuild and commit both:**
  ```
  cd src/tools/format-converter
  npm run build          # regenerate index.html from source/
  npm run build:check    # verify index.html matches source/ (exit 0)
  ```
- The pure logic lives in `source/logic.mjs` (DOM-free, exported) so unit tests
  can import it directly, and the build inlines it into the shipped file via
  `<<ct:inline logic.mjs>>`.
- Run the tool over HTTP (to check behavior that differs from `file://`):
  `npm run serve`.

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
