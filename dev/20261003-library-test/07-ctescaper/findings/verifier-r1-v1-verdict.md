# Verifier r1 v1 — 07-ctescaper

## VERDICT: PASS

All DoD claims verified. Every no-op mutation of every escaper and unescaper was caught. No hollow contexts. Two non-blocking concerns below.

## 1. Gates (re-run)
- `node --test src/lib/tests/` -> 377 tests, 377 pass, 0 fail. CtEscaper file alone: 138 pass.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- `node scripts/test-all.mjs` -> lib step green (377/377); "8/10 suites passed. Failed: base64-tool, color-picker".
  - color-picker: `derived output textareas ... Copy-all buttons ... "Copied!"` failed. This is the known pre-existing e2e failure (#1012), unrelated.
  - base64-tool: 1 e2e failed (`localStorage persistence > degrades gracefully when localStorage throws`, 30s timeout).
    - This was NOT on the expected-failure list.
    - It is a flake: re-run in isolation (`npm run test:e2e -- -g "degrades gracefully"` in src/tools/base64-tool) -> passed in 1.6s.
    - It cannot be caused by this phase: the only change is a new test file, and the lib source is untouched (section 5).
    - Orchestrator note: base64-tool bundles CtEscaper, but build is "up to date" and the lib source is unchanged.

## 2. Coverage quality
Every one of the 19 pairs has a round-trip over a 19-input shared battery and 2 or more exact fixtures.
- Fixtures are asserted in both the escape and unescape direction.
- A guard test asserts each context has at least one fixture.
- A guard test asserts the PAIRS table covers every exported `escape*` function (excluding filename).
- No context is round-trip-only.

Mutation spot-check, on a SCRATCH COPY only (scratchpad `mut/`). I injected `return <arg>;` at the top of each function and ran the CtEscaper test file. Results are failing-test counts; every mutant was killed and none survived.

| Function | Escape no-op | Unescape no-op |
|---|---|---|
| Base64 | 10 | 10 |
| HtmlText | 4 | 4 |
| HtmlAttr | 3 | 3 |
| Xml | 4 | 3 |
| Json | 7 | 6 |
| JsString | 6 | 6 |
| Java | 5 | 4 |
| CString | 5 | 5 |
| Python | 4 | 5 |
| ShSingle | 6 | 7 |
| ShDouble | 5 | 4 |
| ShAnsiC | 4 | 4 |
| PowerShell | 4 | 4 |
| Sql | 5 | 5 |
| Csv | 4 | 6 |
| UrlComponent | 8 | 4 |
| UrlFull | 4 | 3 |
| Markdown | 4 | 4 |
| Regex | 5 | 4 |
| Filename (escape) | 5 | n/a |

- Corrupting one fixture's expected value (`'SGVsbG8='` -> `'SGVsbG9='`) -> 1 failure (killed).
- Baseline scratch copy: 138 pass, 0 fail (so the harness itself is sound).

Independent fixture checks (run directly via node, not via the test file) agreed with the references:
- Base64 of `é😀` == `Buffer.toString('base64')` -> `w6nwn5iA`
- Json == `JSON.stringify` (including `\u0001`, quotes, backslash and newline)
- UrlComponent == `encodeURIComponent`
- HtmlText `<&>"'` -> `&lt;&amp;&gt;"'`
- Csv `a"b,c` -> `"a""b,c"` (RFC 4180)
- Regex `a.b*` -> `a\.b\*`

The test file also cross-checks Base64, Json and UrlComponent against the Buffer / JSON.stringify / encodeURIComponent natives over the whole battery.

Metadata and helpers are all exercised:
- CONTEXTS: unique ids, required fields, only `filename` is non-round-trip.
- CONTEXTS_BY_ID maps every id to the same object.
- DEFAULT_ENABLED is a unique subset of the ids.
- `nest`: order, per-step values, reverse-unwind recovery, empty chain, unknown ids skipped.
- `escapeFilename`: illegal chars, diacritics, empty and all-illegal -> `untitled`, reserved names, length.

## 3. Lossy / characterized adjudication
All defensible characterizations. No genuine bug.
- `filename` one-way (collisions, non-Latin -> "untitled"): the module header declares it one-way, and the metadata has `unescape: null`. Characterization is correct.
- `escapeFilename` has no reserved-name handling (CON -> con) and no length cap.
  - Defensible as characterization: the module doesn't claim either.
  - Possible product gap: Windows-reserved names (CON, NUL.txt) pass through unchanged. If the filename slug is meant to be safe cross-platform, that is a feature request, not a test bug.
  - The test pins current behavior, so a future change will flag explicitly.
- URL encoders throw URIError on lone surrogates: this is native `encodeURI*` behavior. Defensible. The battery contains only well-formed surrogate pairs.
- `unescapeShSingle` needs the quoted form: the `'\''` bridge is only meaningful inside the quoted output of escape, so round-trip holds on real output. Defensible.
- `unescapeCsv` of unquoted text is identity: correct per RFC 4180, since unquoted fields carry no escapes. Defensible.
- HTML decoders leave unknown / out-of-range entities intact: lenient and safe. Defensible.
- No claimed round-trip context is actually lossy on the battery. All 19 round-trip.

## 4. Coverage-quality concerns (non-FAIL)
- The mutation I ran was whole-function no-op. Partial-escaper regressions are likely caught by multi-character fixtures (e.g. HtmlText, Markdown, Regex use many metachar fixtures), but I did not enumerate per-character mutants.
- Rare gaps in fixtures vs. full character set (e.g. HtmlText does not assert `'` or `"` are left unescaped in text context beyond the one fixture). Minor.
- An escapeFilename test that includes `.replace(/-g-/, 'g-')` on its expected value is confusingly built. Cosmetic: it works but is hard to read.
- The test input that includes lone surrogates is only characterized for URL encoders. Other contexts do not test lone surrogates. Minor.

## 5. No lib source modified
`git` is blocked, so I could not run `git diff` / `git status`. Evidence is indirect: `build-all --check` 10/10 and `CtEscaper.mjs` mtime Oct 2 21:51, before the new test file (Oct 3 20:34). This is not conclusive for every lib file; other lib files showed newer mtimes than CtEscaper.mjs, which is expected from earlier phases. I did not independently diff them. I did not modify the lib or the test file in place; all mutation work was in the scratchpad.

## 6. Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node --test src/lib/tests/unit/CtEscaper.test.mjs
node scripts/build-all.mjs --check
node scripts/test-all.mjs
(cd src/tools/base64-tool && npm run test:e2e -- -g "degrades gracefully")
# mutation harness (scratch only): copy CtEscaper.mjs to <scratch>/orig.mjs and the test to
# <scratch>/tests/unit/, with <scratch>/utils/formats/CtEscaper.mjs as the mutated copy.
# For each export matching /(un)?escape\w+/, insert `return <firstArg>;` after the opening brace,
# run `node --test <scratch>/tests/unit/CtEscaper.test.mjs`, confirm non-zero exit.
```
