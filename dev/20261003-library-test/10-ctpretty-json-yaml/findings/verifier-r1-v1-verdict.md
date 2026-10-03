# Verifier verdict — 10a CtPretty JSON+YAML+shared (r1, v1)

## VERDICT: PASS (with 2 raise-to-user lib bugs and 1 coverage gap)

## DoD evidence
| Claim | Result |
|---|---|
| Suite green | `node --test src/lib/tests/` -> 712 tests / 706 pass / 0 fail / 6 todo (matches builder). CtPretty.json-yaml: 90 = 88 pass + 2 todo. |
| build-all | `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." |
| test-all | lib step green; 9/10 suites pass; the only failure is `src/tools/color-picker` e2e (known unrelated flake, #1012). uuid-generator e2e 41/41. Not a lib regression. |
| No lib source touched | git blocked per spec; CtPretty.mjs mtime Oct 2 21:51 predates new test file (Oct 3 23:17); build-all 10/10. I only wrote under `tmp/mut/` + this file. Real lib never edited (mutations on scratch copy). |
| Exact pins | JSON: 10-row pinned table + 2/4/tab/'\t'/0; YAML: exact format + exact minify fixtures; round-trips use real `JSON.parse` + `assert.deepEqual`; YAML uses semantic parseYAML compare. Defensible. |

## Independent re-derivation (by hand, then ran)
- `formatJSON('{"a":[1,{"b":null}],"c":"é"}')` -> 2-space nested, é kept: matches.
- `formatJSON('[1,[],{}]',{indent:'tab'})` -> `[\n\t1,\n\t[],\n\t{}\n]`: matches.
- `minifyJSON('{ "a" : [ 1 , 2 ] , "b" : "x y" }')` -> `{"a":[1,2],"b":"x y"}`: matches.
- `formatYAML('a: 1\nb:\n  - x\n  - y: "no"\n')` -> `a: 1\nb:\n  - x\n  - y: "no"\n` (yes/no-like quoted); `minifyYAML` -> `{a: 1, b: [x, {y: "no"}]}`: matches the pinned style.
- `lineColFromOffset('ab\ncd',4)` -> {2,2}; byteLength é/€/😀 -> 2/3/4. Correct.

## Mutation sweep (scratch copy `tmp/mut/`, harness `tmp/mut/run.mjs`, log `tmp/mut/mutation-results.txt`)
28 mutants: 26 KILLED, 2 survived.
- byteLength: +1 killed; fallback 2-byte branch wrong (TextEncoder disabled) killed. Survivor A1 (disable TextEncoder path, use manual fallback) = EQUIVALENT mutant (fallback is correct, same output) — not a gap; shows fallback is correctly tested via A3.
- indentUnit: tab branch removed, default->4sp, n>=0->n>0: all killed.
- lineColFromOffset: line+=2, no col reset, clamp removed, col+=2: all killed.
- JSON: minify keeps ws (14 fail), indent ignored, default 4, tab branch dropped: all killed.
- YAML: empty-string/bool-like/numeric-like/special-char quoting off, minify separator, null format, bool inversion, comment strip, single/double-quote parsers, seq parser, flow array, indent ignored: all killed.
- **SURVIVOR E5 (real gap):** disabling `/^[\s]|[\s]$/` quoting in `yamlScalarNeedsQuote` leaves suite green. No test has a string value with leading/trailing whitespace (e.g. `a: " x "`), so a regression there would silently trim data on format. Recommend adding `formatYAML('a: " x "')` exact + round-trip. Not a FAIL.

## Adjudication of the surfaced YAML issues
### (a) Newline-in-scalar not quoted — GENUINE BUG, severity HIGH (data loss / invalid output). RAISE TO USER.
Reproduced exactly:
- `formatYAML('r: "line\nbreak"\nz: 1')` -> `"r: line\nbreak\nz: 1\n"` (raw newline); re-format/re-parse THROWS `Expected "key: value" (line 2)`.
- `minifyYAML` -> `{r: line\nbreak, z: 1}`; re-parse gives `{r:"line break"}` — value silently changed.
- Also affects sequences (`- a\nb` -> re-parse throws `Bad sequence item`) and keys (`a\nb: 1`). Tab and CR happen to round-trip in this lib's parser, but \n does not. Tail newline `"x\n"` is OK only because the trailing-whitespace regex quotes it (which is exactly the E5-untested branch).
Reference behavior: YAML requires a scalar containing a line break to be double-quoted with `\n` escape (or block scalar); formatter must emit `r: "line\nbreak"`, minifier likewise. Fix: in `yamlScalarNeedsQuote` add `/[\n\r\t]/` (JSON.stringify already escapes). The tool's formatter emits invalid YAML or changes meaning -> serious for a formatter. The 2 `todo` tests characterize it honestly and precisely (assert the CORRECT round-trip; will flip to pass when fixed). Not a FAIL of the tests.

### (b) Over-indent silent drop — GENUINE parser data-loss quirk, severity MEDIUM. RAISE TO USER (lower priority than a).
Reproduced: `a: 1\n b: 2` -> {a:1}; `a: 1\n b: 2\nc: 3` -> {a:1,c:3}; `a:\n  b: 1\n    c: 2` -> drops c; `- 1\n  - 2` -> [1]; `a: 1\n     garbage text` -> {a:1}; `a: 1\n b` -> {a:1}.
Reference: real YAML either errors (`a: 1\n b: 2` -> "mapping values not allowed here") or folds a plain continuation (`a: 1\n b` -> {a:"1 b"}); it never discards content. The rest of this parser is strict (throws with line numbers on anchors/tabs/bad indent/under-indent: `a:\n    b: 1\n  c: 2` throws `Bad indentation`), so silent drop is inconsistent and is unacceptable leniency: the formatter would delete user content from a pasted doc with a stray indent. Recommend: throw `Bad indentation (line N)` like under-indent does. Test note: the builder pinned the quirk as passing behavior (lines 410-414); when fixed this test will go red and must be updated (it is labelled a quirk, so acceptable, but consider converting to `todo` with a throws expectation).

## Coverage-quality concerns (not FAILs)
1. E5 gap above (whitespace-edge string quoting untested).
2. Over-indent quirk pinned as green; will need a deliberate edit upon fix.
3. HANDOFF claim "mutation not done" was a misreading; now done by me. 26/28 killed, 1 equivalent.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/ | grep -E "^ℹ (tests|pass|fail|todo)"
node --test src/lib/tests/unit/CtPretty.json-yaml.test.mjs | grep -E "^ℹ"
node scripts/build-all.mjs --check
node scripts/test-all.mjs   # color-picker e2e fails (unrelated)
node dev/20261003-library-test/10-ctpretty-json-yaml/tmp/mut/run.mjs   # mutation sweep (scratch copy)
node /private/tmp/claude-501/.../scratchpad-equivalent r.mjs           # ad hoc repros (scratch, outside repo)
```

**PASS** — suite green (712/706/0/6), build-all 10/10, 26/28 mutants killed (1 equivalent, 1 minor whitespace-quoting gap), fixtures pinned and hand-verified, and the two YAML lib bugs are correctly characterized and must be raised to the user.
