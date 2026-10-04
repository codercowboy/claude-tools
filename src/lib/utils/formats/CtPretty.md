# CtPretty

A multi-language pretty-printer and minifier for JSON, YAML, HTML, CSS, SQL, and JavaScript.

`src/lib/utils/formats/CtPretty.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

Six hand-rolled, zero-dependency engines each guarantee one thing above all: output is semantically equivalent to input. [JSON](https://www.json.org/), [YAML](https://yaml.org/), [HTML](https://developer.mozilla.org/en-US/docs/Web/HTML), and [CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) get a full pretty-print and a full minify. [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) and [SQL](https://en.wikipedia.org/wiki/SQL) get a reliable pretty-print plus a SAFE [minify](https://en.wikipedia.org/wiki/Minification_(programming)) only: whitespace and comments are stripped, but no identifier is renamed, no dead code is removed, and no token is reordered or rewritten. Each public format function takes `(src, opts)` and returns a string, or throws an `Error` with a friendly `.message` (and a line/column where locatable) on invalid input. The JS and SQL tokenizers are exported for consumers that want to assert token-stream equivalence. The module is DOM-free.

Most functions accept `opts.indent`: a number of spaces, or `'tab'`/`'\t'` for tabs (default 2 spaces).

## API

### `byteLength(str) → number`

The number of bytes in the UTF-8 encoding of a string (for a size readout). Uses `TextEncoder` when available, with a manual byte-count fallback.

```js
import { byteLength } from './CtPretty.mjs';
byteLength('café'); // 5
```

### `indentUnit(indent) → string`

Resolves an indent option into the actual indent string: `'\t'`/`'tab'` gives a tab, a finite non-negative number gives that many spaces, anything else gives two spaces.

```js
import { indentUnit } from './CtPretty.mjs';
indentUnit(4);     // '    '
indentUnit('tab'); // '\t'
```

### `lineColFromOffset(src, offset) → { line, col }`

Converts a character offset into a 1-based line and column within `src`. The offset is clamped to the string length.

```js
import { lineColFromOffset } from './CtPretty.mjs';
lineColFromOffset('ab\ncd', 4); // { line: 2, col: 2 }
```

### `formatJSON(src, opts?) → string` / `minifyJSON(src) → string`

`formatJSON` parses and re-serializes with indentation (`opts.indent`, default 2, `'tab'` for tabs). `minifyJSON` serializes with no whitespace. Both throw an `Invalid JSON: … (line L, col C)` error on a parse failure, resolving the position from the engine's message where possible.

```js
import { formatJSON, minifyJSON } from './CtPretty.mjs';
minifyJSON('{\n  "a": 1\n}'); // '{"a":1}'
```

### `parseYAML(src) → value`

Parses the supported YAML subset into a plain JS value (`null` for an empty document). Supports block mappings and sequences, nesting, plain and quoted scalars, booleans/null/numbers, `#` comments, flow collections (`[…]`/`{…}`), and a single optional leading `---`. Anchors/aliases, tags, complex keys, block scalars, tab indentation, and multiple documents are rejected with an `Unsupported YAML feature: …` error. `formatYAML`/`minifyYAML` build on this.

```js
import { parseYAML } from './CtPretty.mjs';
parseYAML('a: 1\nb: [x, y]'); // { a: 1, b: ['x', 'y'] }
```

### `formatYAML(src, opts?) → string` / `minifyYAML(src) → string`

`formatYAML` re-emits parsed YAML as indented block style (`opts.indent`). `minifyYAML` emits it as a single-line flow collection. Comments are dropped by both. An empty document returns `''`.

```js
import { minifyYAML } from './CtPretty.mjs';
minifyYAML('a: 1\nb: 2'); // '{a: 1, b: 2}'
```

### `formatHTML(src, opts?) → string` / `minifyHTML(src) → string`

`formatHTML` re-indents the markup, placing block elements on their own lines and keeping inline-only elements on one line where they fit. `minifyHTML` collapses insignificant whitespace conservatively (HTML whitespace can be significant). Attribute strings are kept verbatim, void elements and self-closing tags are respected, and the contents of raw-text elements (`script`, `style`, `pre`, `textarea`) are preserved byte-for-byte. `minifyHTML` keeps IE conditional and bang (`<!--! … -->`) comments and drops the rest. The parser is lenient about mismatched tags.

```js
import { formatHTML } from './CtPretty.mjs';
formatHTML('<ul><li>a</li><li>b</li></ul>');
// <ul>
//   <li>a</li>
//   <li>b</li>
// </ul>
```

### `formatCSS(src, opts?) → string` / `minifyCSS(src) → string`

A string-aware CSS engine that correctly skips strings, `/* */` comments, and `url(…)` (quoted or not) so structural characters inside them are never misread. `formatCSS` builds a node tree, re-indents, puts one selector per line, and separates top-level rules with a blank line. `minifyCSS` strips comments and insignificant whitespace and removes a redundant trailing `;` before `}`.

```js
import { minifyCSS } from './CtPretty.mjs';
minifyCSS('a {\n  color: red;\n}'); // 'a{color:red}'
```

### `tokenizeSQL(src) → [{ type, value }]`

Tokenizes SQL into words, numbers, strings (`'…'` with `''` escapes), quoted identifiers (`"…"` and `` `…` ``), line comments (`-- …`), block comments, whitespace, and punctuation. Not a full parser. Exported so a consumer can compare token streams before and after formatting.

```js
import { tokenizeSQL } from './CtPretty.mjs';
tokenizeSQL('SELECT 1').map((t) => t.type); // ['word','ws','number']
```

### `formatSQL(src, opts?) → string` / `minifySQL(src) → string`

`formatSQL` lays out a statement by clause: it breaks before `SELECT`/`FROM`/`WHERE` and friends (including two- and three-word clauses like `GROUP BY` and `LEFT OUTER JOIN`), indents sub-clauses (`AND`/`OR`/`ON`), and tracks parenthesis depth for subqueries. `opts.keywordCase` is `'unchanged'` (default), `'lower'`, or `'upper'` and recases only recognized keywords. `minifySQL` strips comments and collapses whitespace to single spaces. Neither removes, reorders, or rewrites a token.

```js
import { formatSQL } from './CtPretty.mjs';
formatSQL('select a,b from t where x=1', { keywordCase: 'upper' });
// SELECT a,
//   b
// FROM t
// WHERE x = 1
```

### `tokenizeJS(src) → [{ type, value }]`

Tokenizes JavaScript into line/block comments, single/double strings, template literals (including nested `${…}` and nested templates), regex literals (disambiguated from division by the preceding significant token), numbers, identifiers/keywords, and punctuators. Exported for token-stream equivalence checks. This tokenizer is the crux of the safe-minify guarantee.

```js
import { tokenizeJS } from './CtPretty.mjs';
tokenizeJS('x = /ab/g').map((t) => t.type); // ['name','ws','punct','ws','regex']
```

### `formatJS(src, opts?) → string` / `minifyJS(src) → string`

`formatJS` re-indents by bracket depth and adds token-level spacing (spaces around binary operators but not unary ones, a space after commas, a space before a block `{`), keeps `import`/`export` lists on one line, and separates top-level sections with blank lines. It never removes an existing line break, so [automatic semicolon insertion](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#automatic_semicolon_insertion) behavior is unchanged. `minifyJS` drops comments and collapses whitespace but never joins tokens across an existing newline, and inserts a space only where two tokens would otherwise merge. Both only move or normalize whitespace.

```js
import { minifyJS } from './CtPretty.mjs';
minifyJS('const x = 1 ;\n// note\nlet y = x + 2 ;');
// 'const x=1;\nlet y=x+2;'
```

## Notes

- JS and SQL get SAFE minify only. Comments and insignificant whitespace are removed, nothing else: no renaming, no dead-code elimination, no AST rewriting. For aggressive JS minification, a dedicated tool is the right choice.
- The minifiers are conservative around whitespace that can be significant. `minifyHTML` keeps inter-inline spacing and raw-text contents, and `minifyJS` preserves newlines so ASI is never altered.
- `formatJSON`/`minifyJSON` and `parseYAML` throw on invalid input, with a line/column in the message where the engine can locate it. The other engines parse leniently and do their best rather than throwing.
- YAML support is a documented subset (the same set `parseYAML` accepts). Unsupported constructs are rejected with a clear error rather than mis-rendered.
</content>
