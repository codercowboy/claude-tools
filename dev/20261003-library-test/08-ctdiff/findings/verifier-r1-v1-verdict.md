# Verifier r1 v1 verdict — 08-ctdiff

**PASS** — suite genuinely green; 17/17 mutants killed; hand-pinned fixtures independently re-derived; the `toUnifiedDiff` zero-count-hunk bug is a GENUINE lib bug, honestly characterized via `todo`.

## 1. Re-run
- `node --test src/lib/tests/` -> tests 445, pass 443, fail 0, todo 2. CtDiff file alone: 68 tests, 66 pass, 2 todo. Matches HANDOFF.
- `node scripts/build-all.mjs --check` -> Checked 10 tool(s); 0 failed.
- `node scripts/test-all.mjs` -> exit 1, 9/10 suites. Lib step green (445/443/0/2). The one failing suite is **color-converter**, not color-picker as the prompt expected: e2e #94 "shared License modal › footer License link opens the modal" (toBeVisible failure). color-picker passed 205/205. This is a UI e2e unrelated to CtDiff (only a test file was added); not a lib regression. Log: tmp/testall.log. Orchestrator should note the known-failure identity differs from #1012's description.
- No lib source modified: CtDiff.mjs mtime Oct 2 21:51, earlier than the new test file (Oct 3 22:49); build-all 10/10. (git blocked; mtime/inspection only.)

## 2. Mutation testing (scratch copy in tmp/mut, real files untouched; baseline 66 pass/0 fail/2 todo)
All killed (failures counted exclude todo):
| Mutant | fails |
|---|---|
| a1 myers tie-break `<` -> `<=` | 2 |
| a2 snake never followed | 35 |
| a3 backtrack insert/delete flipped | 26 |
| b merge threshold 2c+1 -> 2c | 3 |
| b2 merge threshold 2c+1 -> 2c+2 | 1 |
| c ignoreAllWhitespace no-op | 4 |
| c2 ignoreLeadingTrailing no-op | 3 |
| d diffWords no coalescing | 7 |
| d2 diffWords insert text altered | 6 |
| e replace -> delete in diffLines | 16 |
| e2 insert -> delete in diffLines | 7 |
| e3 stats `changed` off | 4 |
| f hunk aStart fallback 0 -> 1 | 2 |
| g tokenizer drops `_` | 2 |
| h splitLines CR-only handling | 2 |
| i default context 3 -> 2 | 1 |
| j ignoreCase no-op | 5 |
Note b2 and i are each killed by exactly one test (thin but real).

Fixtures: HANDOFF/plan claim pinned literals; confirmed tests use `mk(type,aStart,bStart,aLines,bLines)` deepEqual literals and exact unified-text strings; reconstruct tests are a labeled supplement and every export also has pinned-literal tests (tokenizeWords/diffWords segments, myers [a,b,c] vs [a,x,c], Myers-paper case, exact `@@` strings). Independent re-derivation: diffLines('a\nb\nc','a\nX\nb\nc') -> equal(a@0,0), insert(aStart1,bStart1,[X]), equal(b,c @1,2); unified ctx1 `@@ -1,2 +1,3 @@` / ` a` / `+X` / ` b` — lib output matched exactly (checked live), and ctx0 / merge-threshold fixtures killed by mutants b/b2 above.

## 3. ADJUDICATION — toUnifiedDiff zero-count hunk start
Cause (CtDiff.mjs): `aStart = aLinesInHunk.length ? first.a : 0` (and same for b) — a zero-count side always gets start 0.
Reference from GNU `diff -U0` (temp files in tmp/g), case `a\nb\nc` -> `a\nX\nb\nc`: **`@@ -1,0 +2 @@`**. Spec: zero-length side's start = the line it follows (0 only at BOF).
Lib output (ctx 0): `@@ -0,0 +2,1 @@`  -> DEVIATES (-0 vs -1). (`,1` vs omitted `,1` is equivalent.)
Pure delete mid-file `a\nb\nc` -> `a\nc`: GNU `@@ -2 +1,0 @@`; lib `@@ -2,1 +0,0 @@` -> DEVIATES (+0 vs +1).
Builder's headline repro `a\nb\nc` vs `c\nb\na` ctx0: GNU `-1,2 +1,0` / `-3,0 +2,2`; lib `-1,2 +0,0` (correct, BOF) / `-0,0 +2,2` (should be -3,0). Builder's description of the second hunk is correct. (Our Myers picks the same alignment as GNU here.)
Real effect with `patch(1)`: pure-insert mid-file ctx0 applied to `a b c` yields `X a b c` (hunk misplaced to top; wrong output). Pure-delete hunk applied correctly (patch uses old-side start; the bogus +0 is ignored).
**Verdict: GENUINE lib bug, not a builder misunderstanding.** Severity: low-moderate. Only context 0 (with context>=1 a hunk always has both sides non-empty unless a whole file side is empty, where 0 is correct); default context 3 unaffected. At ctx 0 it produces output that standard consumers misapply for pure inserts. Raise to user; do not fix here.
`todo` marking is honest: exactly 2 tests (battery apply ctx0 -- actual output demonstrably wrong order; exact-header test), both fail for the real stated reason; the 66 other tests pass and were exercised by 17 mutants. Nit: one todo test's title says "(-3,0 +2,2)" while the handoff said "(-1,0 +2,2)"; assertion expects `-1,0 +2,2` for `a\nb\nc`->`a\nX\nY\nb\nc`, which is correct per GNU rule (-1,0) -- the title's "-3,0" is stale/misleading. Cosmetic.

## 4. Concerns (non-FAIL)
- Mutants b2 and i killed by only 1 test each.
- Todo test title/assertion mismatch (above).
- The tests don't assert 'op' behaviour for zero-count hunk at BOF (+0,0 correct) separately from the buggy case; covered by existing ctx0 fixture.

## Reproduction
`node --test src/lib/tests/`; `node scripts/build-all.mjs --check`; `node scripts/test-all.mjs > tmp/testall.log`; GNU: `diff -U0 tmp/g/a2 tmp/g/b2`; mutation: copy lib+test to tmp/mut/src/lib/{utils/formats,tests/unit}, python str-replace each mutant, `node --test` the test file; patch: write lib output to tmp/g/d2.patch, `patch tmp/g/p2 < tmp/g/d2.patch`.
