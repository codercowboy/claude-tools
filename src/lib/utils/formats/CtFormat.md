# CtFormat

A structured-data format conversion engine for JSON, CSV, TSV, YAML, `.properties`, and XML.

`src/lib/utils/formats/CtFormat.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

Each supported format has a `parse<Source>(text, opts)` that returns a plain JS value (objects, arrays, strings, numbers, booleans, `null`) and an `emit<Target>(model, opts)` that returns text. A `convert(text, from, to, opts)` entry point drives the round-trip through a `PARSERS`/`EMITTERS` registry, and `detectFormat(text)` auto-detects the source. [YAML](https://yaml.org/) and [XML](https://www.w3.org/TR/xml/) use practical hand-written parsers covering a documented subset, so the module carries no runtime dependency and stays DOM-free. `FORMATS` is the id+label registry a UI builds its selects from. Parsers and emitters throw a plain `Error` with a readable message on invalid input or a model that does not fit the target.

## API

### `FORMATS`

An array of `{ id, label }` for the six formats, in UI order: `json`, `csv`, `tsv`, `yaml`, `properties`, `xml`.

```js
import { FORMATS } from './CtFormat.mjs';
FORMATS.map((f) => f.id); // ['json','csv','tsv','yaml','properties','xml']
```

### `parseJSON(text) → value` / `emitJSON(model, opts?) → string`

`parseJSON` is `JSON.parse` with the error rewrapped as `Invalid JSON: …`. `emitJSON` is `JSON.stringify` with indentation from `opts.indent` (a number 0-8, default 2).

```js
import { parseJSON, emitJSON } from './CtFormat.mjs';
emitJSON(parseJSON('{"a":1}'), { indent: 2 });
// '{\n  "a": 1\n}'
```

### `parseCSV(text, opts?) → value` / `emitCSV(model, opts?) → string`

`parseCSV` reads [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)-ish [delimited text](https://en.wikipedia.org/wiki/Comma-separated_values) (quoted fields with embedded delimiter, newline, or doubled quote). With `opts.header !== false` (the default) the first row is the header and each later row becomes an object keyed by it. `opts.header === false` returns an array of arrays. `opts.delimiter` overrides the `,` separator. An unterminated quoted field throws.

`emitCSV` takes a tabular model: an array of objects (columns are the union of keys in first-seen order), an array of arrays (emitted as-is), or an array of primitives (a single `value` column). A single object is wrapped as one row. `opts.header`/`opts.delimiter` apply. A non-array or non-uniform model throws.

```js
import { parseCSV, emitCSV } from './CtFormat.mjs';
parseCSV('a,b\n1,2\n');        // [{ a: '1', b: '2' }]
emitCSV([{ a: 1, b: 2 }]);     // 'a,b\n1,2'
```

### `parseTSV(text, opts?) → value` / `emitTSV(model, opts?) → string`

The tab-delimited variants, equivalent to the CSV functions with `delimiter: '\t'`.

### `parseProperties(text) → value` / `emitProperties(model, opts?) → string`

`parseProperties` reads a Java [`.properties`](https://en.wikipedia.org/wiki/.properties) file: `#`/`!` comments, `=`/`:`/whitespace separators, backslash line continuations, and `\uNNNN`/`\n`/`\t` escapes. Dotted keys are un-flattened into a nested model, and a run of integer keys `0..n-1` becomes an array. `emitProperties` flattens the model back into sorted `dotted.key=value` lines. `opts.escapeUnicode` escapes non-ASCII characters as `\uNNNN`.

```js
import { parseProperties } from './CtFormat.mjs';
parseProperties('db.host=localhost\ndb.port=5432');
// { db: { host: 'localhost', port: '5432' } }
```

### `parseXML(text) → value` / `emitXML(model, opts?) → string`

`parseXML` tokenizes and builds an element tree, then maps it to a model: attributes become `@name` keys, text content becomes `#text` (or the bare string for a text-only element), and repeated child tags become arrays. It skips the prolog, comments, processing instructions, and `<![CDATA[…]]>`, and throws a descriptive `Error` on malformed or mismatched markup. The root is wrapped under its tag name so `emitXML` round-trips it.

`emitXML` serializes a model. `opts.rootName` names the root (otherwise a single-key object uses that key, else `root`). `opts.declaration !== false` prepends the `<?xml …?>` line. `opts.attributes === true` renders primitive leaf values as attributes instead of child elements. `opts.indent` sets the indent width. An invalid root element name throws.

```js
import { parseXML, emitXML } from './CtFormat.mjs';
parseXML('<user id="7"><name>Neo</name></user>');
// { user: { '@id': '7', name: 'Neo' } }
```

### `detectFormat(text) → string | null`

Guesses the source format from the text, returning a `FORMATS` id or `null` when it cannot tell. XML is detected by a leading `<?xml` or `<tag`, JSON by a `{`/`[`/`"` start that actually parses, then a mix of heuristics separates TSV, `.properties`, YAML, and CSV by their signal lines. A non-string or empty input returns `null`.

```js
import { detectFormat } from './CtFormat.mjs';
detectFormat('a: 1\nb: 2'); // 'yaml'
detectFormat('x=1\ny=2');   // 'properties'
```

### `convert(text, from, to, opts?) → { output, detected, model }`

The top-level entry point. Parses `text` as `from` (or runs `detectFormat` when `from` is `'auto'`) and emits it as `to`. Returns `output` (the converted text), `detected` (the source format id actually used), and `model` (the intermediate JS value). Per-format options are nested under the format id in `opts` (for example `opts.csv`, `opts.json`). Throws when auto-detection fails or either format id is unknown, and propagates any parser/emitter error.

```js
import { convert } from './CtFormat.mjs';
convert('{"a":1,"b":2}', 'json', 'yaml').output; // 'a: 1\nb: 2'
convert('a,b\n1,2', 'auto', 'json').detected;    // 'csv'
```

## Notes

- YAML support is a documented subset: block mappings and sequences, scalars, flow collections (`[…]`/`{…}`), block scalars (`|`/`>`), and a single optional leading `---`. Anchors/aliases (`&`/`*`), tags (`!`), merge keys (`<<`), complex keys (`?`), tab indentation, and multiple documents are rejected with an explicit error rather than mis-parsed.
- CSV values parse as strings. There is no type inference on cells, so `"1"` stays the string `'1'`.
- A single-cell empty CSV record emits as `""` so it survives a round-trip, since an unquoted empty line parses as a dropped blank row.
- The XML model convention (`@attr`, `#text`, repeated tags as arrays) is lossy for mixed content and ordering. It is built to round-trip the common element/attribute/text shape, not to be a faithful DOM.
</content>
