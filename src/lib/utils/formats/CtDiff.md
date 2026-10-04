# CtDiff

A text diff engine built on the Myers O(ND) algorithm, with line-level, word-level, and unified-diff output.

`src/lib/utils/formats/CtDiff.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

One core routine, `myersDiff`, implements the [Myers diff algorithm](https://en.wikipedia.org/wiki/Diff) ("An O(ND) Difference Algorithm and Its Variations", Eugene W. Myers, 1986) and drives everything else. `diffLines` runs it over lines and groups the result into add/remove/replace hunks with line numbers and stats. `diffWords` runs it over word tokens for an intra-line diff. `toUnifiedDiff` renders a standard [unified diff](https://en.wikipedia.org/wiki/Diff#Unified_format). Comparison runs on an option-normalized key while the emitted ops carry the original text, so the `ignore*` options change what counts as equal without changing what is shown. The module is pure and DOM-free.

## API

### `splitLines(text) → string[]`

Splits text into lines. `''` or `null` yields `[]`. Otherwise CRLF/CR are normalized to LF before splitting on `\n`, so a trailing newline produces a final empty line (a file that ends in `\n` has one).

```js
import { splitLines } from './CtDiff.mjs';
splitLines('a\r\nb\n'); // ['a', 'b', '']
```

### `normalizeLine(line, opts?) → string`

Produces the comparison key for a line under the ignore options. `opts.ignoreAllWhitespace` strips every whitespace char. `opts.ignoreLeadingTrailingWhitespace` trims only the ends. `opts.ignoreCase` lower-cases. The options apply to the key only, never to the text the diff reports.

```js
import { normalizeLine } from './CtDiff.mjs';
normalizeLine('  Hi  There ', { ignoreAllWhitespace: true, ignoreCase: true }); // 'hithere'
```

### `myersDiff(a, b, eq?) → [{ type }]`

The core. Takes two arrays `a` and `b` and returns an ordered list of per-element ops, each `{ type: 'equal' | 'delete' | 'insert' }`, describing the shortest edit script that turns `a` into `b`. `eq(x, y)` compares two elements and defaults to strict `===`. Empty inputs short-circuit (two empty arrays give `[]`, one empty side gives all-insert or all-delete). The elements can be anything the `eq` comparator understands, not only strings.

```js
import { myersDiff } from './CtDiff.mjs';
myersDiff(['a', 'b', 'c'], ['a', 'x', 'c']);
// [{type:'equal'}, {type:'delete'}, {type:'insert'}, {type:'equal'}]
```

### `diffLines(a, b, opts?) → { ops, stats }`

Line-level diff. Splits both inputs with `splitLines`, keys each line with `normalizeLine(…, opts)`, runs `myersDiff`, then coalesces the element ops into block ops. Each op is `{ type, aStart, bStart, aLines, bLines }` where `type` is `equal`, `delete`, `insert`, or `replace` (a run with both deletes and inserts), and `aStart`/`bStart` are 0-based positions in the original line arrays. `stats` is `{ added, removed, changed }`, where a replace counts its paired lines as `changed` and any overhang as added/removed. `opts` is the `normalizeLine` option bag.

```js
import { diffLines } from './CtDiff.mjs';
const { ops, stats } = diffLines('one\ntwo\n', 'one\n2\n');
stats; // { added: 0, removed: 0, changed: 1 }
```

### `tokenizeWords(str) → string[]`

Splits a string into a lossless token stream of word runs (`[A-Za-z0-9_]+`), whitespace runs, and single other characters. Joining the tokens with `''` reproduces the input exactly.

```js
import { tokenizeWords } from './CtDiff.mjs';
tokenizeWords('a, b!'); // ['a', ',', ' ', 'b', '!']
```

### `diffWords(a, b) → [{ type, text }]`

Word-level (intra-line) diff. Tokenizes both sides with `tokenizeWords`, runs `myersDiff`, and returns segments `{ type: 'equal' | 'delete' | 'insert', text }` with adjacent same-type segments merged. There are no ignore options here.

```js
import { diffWords } from './CtDiff.mjs';
diffWords('the cat', 'the dog');
// [{type:'equal', text:'the '}, {type:'delete', text:'cat'}, {type:'insert', text:'dog'}]
```

### `toUnifiedDiff(a, b, opts?, cfg?) → string`

Renders a standard unified diff. `opts` is passed through to `diffLines` for the ignore options. `cfg.context` is the number of surrounding context lines (default 3, clamped to at least 0). `cfg.aName`/`cfg.bName` are the file labels in the `---`/`+++` header (defaults `a`/`b`). Changed rows are grouped into hunks, padded by `context`, and merged when their gaps fall within `2*context`. Returns `''` when the inputs are equal (no changes to show). Hunk headers follow the `@@ -start,count +start,count @@` convention.

```js
import { toUnifiedDiff } from './CtDiff.mjs';
console.log(toUnifiedDiff('a\nb\nc\n', 'a\nB\nc\n', {}, { context: 1 }));
// --- a
// +++ b
// @@ -1,3 +1,3 @@
//  a
// -b
// +B
//  c
```

## Notes

- The ignore options affect equality only. A line reported as `equal` can still differ in case or whitespace from its counterpart, because the op carries the original text from the `a` side.
- `splitLines` treats a trailing newline as a real final empty line, so `'a\n'` is two lines. Comparisons between a file with and without a trailing newline reflect that.
- `myersDiff` is generic over element type via `eq`, so it can diff token arrays or any comparable sequence, not only the line/word arrays the other exports build.
</content>
