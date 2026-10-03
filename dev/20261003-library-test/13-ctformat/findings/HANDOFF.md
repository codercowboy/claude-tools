# HANDOFF — 13-ctformat (Phase 11), builder r1

Deliverable: `src/lib/tests/unit/CtFormat.test.mjs` (test-only; no src/lib touched). Not split (11a/11b not needed).

## Counts / commands
- `node --test src/lib/tests/unit/CtFormat.test.mjs` -> tests 219, pass 217, fail 0, todo 2.
- `node --test src/lib/tests/` -> tests 1223, pass 1207, fail 0, todo 16 (2 of the todos are mine; rest pre-existing).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- Not done: mutation-testing (break lib, watch red); exact-fixture assertions make this low risk. Full test-all sweep left to the verifier.

## Coverage matrix
| format | parse | emit exact | round-trip battery | cross-convert | detect | malformed | specifics |
|---|---|---|---|---|---|---|---|
| json | Y | Y | 12 models | Y | Y | Y | indent opts, circular emit, type fidelity |
| yaml | Y | Y | 15 models | Y | Y | Y (12 constructs) | inference, quoting, flow, block scalars, comments, BOM/CRLF |
| csv | Y | Y | 5 | Y | Y | Y | quoting, CRLF, ragged, header:false, delimiter, union columns, nested cells, non-tabular throws |
| tsv | Y | Y | 4 | Y | Y | Y | tab delim, quoted tab, ignores delimiter opt |
| properties | Y | Y | 7 | Y | Y | n/a (never throws) | comments, separators, continuation, escapes, \uXXXX, sort, escapeUnicode |
| xml | Y | Y | 8 | Y | Y | Y (13 constructs) | attrs, #text, arrays, CDATA, entities, options, name validation |

Convert pairs with exact fixtures (19): json<->yaml, csv<->json, tsv<->json, csv<->tsv, json<->properties, json<->xml, yaml<->xml, yaml<->properties, csv<->yaml, plus csv->xml (sibling roots). A->B->A preservation: all ordered pairs among {json,yaml,csv,tsv} (tabular), {json,yaml,xml} (tree), {json,yaml,properties} (string tree). Also: convert opts routing, auto-detect, unknown format errors, error propagation, type-fidelity across conversions, unicode, FORMATS registry (exact entries; every id accepted by convert).

## Observed malformed policy
All failures THROW `Error` (no error objects): JSON `Invalid JSON: ...`; YAML `YAML: ...` (multi-doc, tabs, anchors, aliases, tags, merge keys, `?` keys, unterminated quotes/flow); XML `XML: ...` (no root, unclosed, mismatched, unquoted/missing attr, unterminated comment/CDATA/PI); CSV/TSV only `Unterminated quoted field` on parse, and emit throws for non-tabular models; properties never throws; convert throws on unknown source/target and undetectable auto. detectFormat never throws: returns null for empty/non-string/unrecognised.

## Lossy-by-design behaviours pinned (not bugs)
CSV/TSV/properties/XML stringify numbers/booleans; null/[]/{} -> "" in properties/XML/CSV; XML trims text and collapses 1-element arrays; properties flatten dotted model keys; `detectFormat('[1,')` -> csv (comma heuristic).

## SUSPECTED BUG (surfaced, lib not edited)
`parseCSV/parseTSV` drop a lone empty trailing record, but `emitCSV` doesn't quote an empty cell. So a single-column table whose last row is `''` is lost on round-trip: `parseCSV(emitCSV([{a:''}]))` -> `[]` (expected `[{a:''}]`); `[{a:'x'},{a:''}]` -> `[{a:'x'}]`. Multi-column empties survive. Cause: `parseDelimited` "drop a single trailing empty record" cannot distinguish `''` row from final newline. Suggested fix: emit `""` for an empty cell in single-column output (or drop only when text ends with newline). Encoded as 2 `todo` tests (suite stays green, failure visible) plus a passing test pinning the limited scope and the actual emit `'a\n'`.
