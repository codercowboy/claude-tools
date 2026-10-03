# Verifier verdict — 13-ctformat (Phase 11), r1 v1

**VERDICT: PASS** (suite green and strong; 32/33 scratch mutations killed; 2 `todo` correctly characterize a genuine lib bug; 1 minor gap noted)

## 1. Re-run (DoD)
| Claim | Evidence | Result |
|---|---|---|
| `node --test src/lib/tests/` green, 1223/1207/16 todo/0 fail | ran it: tests 1223, pass 1207, fail 0, todo 16 | CONFIRMED |
| CtFormat 219 = 217 + 2 todo | `node --test src/lib/tests/unit/CtFormat.test.mjs`: 219/217/0 fail/2 todo | CONFIRMED |
| build-all --check 10/10 | "Checked 10 tool(s); 0 failed." | CONFIRMED |
| test-all.mjs | exit 0; lib step 0 fail; e2e suites 71,95,205,92,38,27,38,76,41 passed; "10/10 suites passed". No e2e flake this run. | CONFIRMED |
| No lib source modified | git blocked; CtFormat.mjs mtime Oct 2 21:51 vs CtFormat.test.mjs Oct 3 23:59 (test is newer, lib untouched since before the round); build-all 10/10 | CONFIRMED (mtime + build check, not git) |

(The stack traces visible at the tail of the full run are the 16 `todo` assertion outputs, not failures.)

## 2. Mutation sweep (scratch copy in tmp/verifier-r1-v1/s; real lib never touched)
Script: `tmp/verifier-r1-v1/mut.mjs`. 33 single-point mutations; each result = test failures in CtFormat.test.mjs.
- (a) CSV quote/escape: no quoting on delimiter (17 red), no quote doubling (16), no quoting on newline (5), parser drops "" unescape (16), CRLF normalize removed (2), union-columns broken (1) — ALL KILLED
- (b) detectFormat: xml branch removed (3), json (2), tsv->csv (3-4), properties->yaml (3), `---` yaml (1), csv branch removed (4), mapLines->yaml removed (3) — ALL KILLED
- (c) convert routing: yaml->json emitter (22), csv parser=tsv (13), xml emitter=yaml (11), `detected` wrong (20), opts not passed to emitter (2), FORMATS label (1) — ALL KILLED
- (d) YAML/XML nesting: yaml seq parse (1), yaml nested indent (19), xml repeated-tag grouping (10), xml attr `@` prefix (8), xml `#text` dropped (5) — ALL KILLED
- (e) type coercion: yaml int->string (27), bool (8), float (3), null (8), emit numeric-string quoting (9), number emitted quoted (18); properties null->'null' (2), properties arraify (10) — ALL KILLED
- **SURVIVOR (1/33):** removing the "drop a single trailing empty record" rule in `parseDelimited` (f3). No non-todo test pins parsing of a trailing blank line (e.g. `parseCSV('a\nx\n\n')` -> `[{a:'x'}]` today, `[{a:'x'},{a:''}]` without the rule). Minor gap: the exact behavior the todo is about is only pinned via the todo + the single-column scope test. Suggest one pin: `parseCSV('a\nx\n\n')` and `'a\nx\n\n\n'`.

## 3. Fixture quality
Every format has pinned exact text for emit (json, yaml L205/218, csv L331/346, tsv, properties, xml) and exact-B convert pairs (table at L611-617, 19 pairs) — not parse-compare-only; A->B->A is additional, not the sole check. Independent hand re-derivations:
- Emit (L331): `emitCSV([{a:1,b:'x,y'},{a:'q"',c:null}])`: columns a,b,c (first-seen union); row1 `1,"x,y",` (c undefined->''); row2 `"q""",,` => `a,b,c\n1,"x,y",\n"q""",,` — matches pinned.
- Convert (L617): `{"a":{"b":[1,2]}}` json->properties: flatten a.b.0=1, a.b.1=2 => `a.b.0=1\na.b.1=2` — matches.

## 4. Adjudication
### (a) CSV/TSV single-column trailing-empty loss — GENUINE BUG, severity LOW-MEDIUM
Reproduced: `emitCSV([{a:''}])`=`"a\n"`, parse -> `[]`; `[{a:'x'},{a:''}]` -> `[{a:'x'}]`; TSV same. Also hits `{a:null}` last row and primitive arrays (`parseCSV(emitCSV(['x','']))` -> only x; `['']` -> `[]`), because emit writes the empty cell unquoted so the last line is indistinguishable from the file's final newline, and parseDelimited then pops a lone `['']` record. Mid-table empties and multi-column empties survive (confirmed). Silent data loss on round-trip and on csv->X conversion of any single-column CSV whose last data row is blank (e.g. a one-column export with an empty last value). Even `a\n""\n` parses to `[]` (quoted empty is also dropped), so a fix must (1) quote a lone empty cell on emit (RFC 4180 / Python csv.writer writes `""`) AND (2) not pop a record whose single empty field was quoted (track "field was quoted"). Not common (single-column + blank last), but silent. **Recommendation: raise to user as a lib bug to fix in a follow-up lib task; no urgency.** The 2 todos honestly characterize it and the scope-limiting pin is correct. Caveat: the scope test pins the buggy emit (`'a\n'`) — it will need updating on fix (note in the fix task).

### (b) `detectFormat('[1,')` -> csv — DEFENSIBLE for detection, but one real consequence worth a note (LOW)
Reproduced; also `[1,2`, `[1, 2, 3`, `{"a":1,`, `[1,2,]`, `[a,b]` -> csv (all comma-containing single-line JSON-ish text); `{"a":` -> yaml; `{a:1}`, `{'a':1}`, `[`, `"abc` -> null. detectFormat is best-effort heuristics and truncated/invalid JSON is not valid anything, so there is no right answer; erroring would be arguably better than guessing. The real consequence: `convert('[1,','auto','json')` silently succeeds with `[]` (header-only CSV) instead of reporting a JSON syntax error — a user pasting truncated JSON into an auto-detect UI gets an empty result and no error. **Recommendation: mention to user as a UX nit; optional fix = if text starts with `{`/`[` and JSON.parse fails, return null/'json' (surfacing a parse error) rather than falling through.** Not a test defect; tests may pin current behavior (they do).

### (c) Lossy-by-design — all DEFENSIBLE, no raise needed
- CSV/TSV/properties stringify numbers/booleans (`1`->"1", `true`->"true"): inherent to stringly formats; XML same. Tests pin actual stringified output and say so. OK.
- null/empty container -> "" in CSV/properties (`c=`, `d=`, `e=`); CSV empty object/array emit as JSON text `[]`/`{}` cell (asymmetric vs properties but deterministic). OK, documented lossiness. XML null -> `<c/>`, `{r:{b:[]}}` -> `<r>\n</r>` -> parses back `{"r":""}` (empty container collapses).
- XML trims text (`"  hi  "`->"hi") and collapses a 1-element array to a scalar (`{b:['x']}` -> `<b>x</b>` -> `"x"`): standard XML->JSON mapping ambiguity (no schema to know cardinality); same as xml2js default. OK, worth a doc line but not a bug.

## 5. Other coverage observations (non-blocking)
- One surviving mutation (above). Everything else sampled is genuinely pinned.
- Test strategy "pin the lib's ACTUAL output" is declared in the header; where the lib behavior is arguably wrong (a), it was surfaced as todo rather than pinned — correct posture.

## 6. Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/ ; node --test src/lib/tests/unit/CtFormat.test.mjs
node scripts/build-all.mjs --check ; node scripts/test-all.mjs
node dev/20261003-library-test/13-ctformat/tmp/verifier-r1-v1/mut.mjs   # mutation sweep on scratch copy
node /tmp/_p.mjs   # adjudication probes (inline in session; probes listed in section 4)
```
All commands ran to completion; no background processes left.

**PASS** — suite is green (1223/1207/16 todo/0 fail, test-all 10/10), 32 of 33 targeted mutations turn it red, formats have pinned exact fixtures, and the CSV single-column loss is a genuine lib bug correctly surfaced as `todo`.
