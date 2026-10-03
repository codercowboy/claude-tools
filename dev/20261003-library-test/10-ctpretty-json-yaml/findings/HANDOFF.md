# HANDOFF — 10a CtPretty JSON + YAML + shared (builder r1)

Deliverable: `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` (no lib source touched).

## Counts / commands
- New file: 90 tests, 88 pass, 0 fail, 2 todo (the suspected bug below).
- `node --test src/lib/tests/` -> 712 tests, 706 pass, 0 fail, 6 todo (2 mine; 4 pre-existing), exit 0.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- Not done: mutation (break-the-lib) check — lib edits are forbidden; exact fixtures pin actual output instead.

## Coverage matrix
| Area | pretty | minify | idempotent | round-trip | edge | exact fixture |
|---|---|---|---|---|---|---|
| shared (byteLength/indentUnit/lineColFromOffset) | n/a | n/a | n/a | n/a | yes (surrogate, bad indent, clamp) | yes |
| JSON | yes (2/4/tab/'\t'/0) | yes | yes (+cross) | yes (deepEqual w/ JSON.parse) | yes (empty, scalars, unicode, nested, trailing comma, bad token, error shape) | yes (10-row table) |
| YAML | yes (2/4) | yes | yes (string + semantic) | yes (semantic) | yes (empty, comments, unicode, deep, malformed, unsupported) | yes (format + minify) |

## YAML observed policy
- Comments (full-line and trailing, `#` after whitespace, not in quotes) are DROPPED on format/minify.
- Top-level scalar docs ("42", "hello") THROW `Expected "key: value" (line 1)`.
- Strict THROW (with `(line N)`) for: anchors, aliases, tags, complex keys, block scalars, tab indent, multiple docs, bad structure, unterminated quotes, bad flow.
- Lenient quirk: over-indented lines after an inline value are silently dropped (`a: 1\n b: 2` -> {a:1}).
- Empty/comment-only/`---` -> null; format/minify return ''.
- `yes`/`no` parse as strings (not booleans) but are quoted on emit; minify emits single-line flow `{a: 1, b: [x]}`.
- Note: JSON "Unexpected token"/empty errors carry no (line,col) when V8 gives no position; tests assert this actual shape.

## SUSPECTED LIB BUG (surfaced; not worked around)
Strings containing a newline: `yamlScalarNeedsQuote` / flow dump do not quote "\n".
- `formatYAML('r: "line\\nbreak"\nz: 1')` emits raw `r: line\nbreak\nz: 1\n`; re-parsing THROWS `Expected "key: value" (line 2)`.
- `minifyYAML` emits `{r: line\nbreak, z: 1}`; re-parse yields `"line break"` (value changed).
Pinned as 2 `{todo}` tests (visible, suite green). Remove `todo` when fixed (suggest quoting when str contains \n/\r/\t via JSON.stringify).

## Remaining
- 10b: formatHTML/minifyHTML, formatCSS/minifyCSS.
- 10c: tokenizeSQL/formatSQL/minifySQL, tokenizeJS/formatJS/minifyJS.
