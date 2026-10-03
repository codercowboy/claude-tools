# Verifier verdict — 02-ctutil-pure r1 v1

**VERDICT: PASS**

## DoD evidence
| Claim | Evidence | Result |
|---|---|---|
| Tests green, meaningful | `node --test src/lib/tests/` -> 55 tests / 55 pass / 0 fail (47 CtUtil + 8 crc32). Mutation test below. | PASS |
| Suite stays green | `build-all --check` -> "Checked 10 tool(s); 0 failed." `test-all` run #1 (this verifier): **10/10 suites passed** (lib step green). Builder's 9/10 did not reproduce -> known e2e load flake. | PASS |
| Inventory complete | HANDOFF lists all 17 exports (9 tested, 8 deferred w/ reason) vs the 17 exports in CtUtil.mjs (downloadBlob, debounce, clamp, num, clampInt, escapeHtml, escapeAttr, persistState, onceFlag, el, prefersReducedMotion, restartAnimation, setupHiDPICanvas, posAt, slugify, wrapText, class CtUtil). Matches. | PASS |
| No lib source touched | git is blocked; relied on file inspection: `src/lib/utils/CtUtil.mjs` mtime Oct 2 21:51 (untouched); only `src/lib/tests/unit/CtUtil.test.mjs` is newer than 19:00 on Oct 3 under src/lib/. build-all 10/10. Note: `components/Ct*.mjs`, `utils/CtByteUtil.mjs` have Oct 3 mtimes, all <= 14:26 (before Phase 01 harness 18:55) -> earlier work, not this round. Cannot prove via git diff. | PASS (inspection-based) |

## Mutation testing (scratch copy only; real file never touched)
Script: `scratchpad/mut.mjs` copies CtUtil.mjs + the test to a scratch dir, applies one textual mutation at a time, runs the test file.
**35 mutants, 35 killed, 0 survived, 0 not-applied.** Covered: clamp (<= / >=, non-finite->hi, drop hi bound), num (`||0` fallback, isNaN vs isFinite), clampInt (parseInt->round(Number), clamp the fallback, drop upper bound), escapeHtml (drop `>`, drop `<`, `&` ordering), escapeAttr (drop `'`, drop `"`, wrong entity), slugify (cap 61, no trim, leading-only trim, quote removal, no lowercase, no trim(), null->"null", diacritic strip off, diacritic cap ignored, acronym splitter removed), wrapText (>= boundary, no trailing trim at wrap / at end, limit guard removed, non-finite->Infinity, no `\n` split, empty paragraph dropped), debounce (no clearTimeout, lost `this`), aggregator ref swap.
No can't-fail asserts found; the few "comparative" asserts (`escapeAttr(s)===escapeHtml(s)` without quotes) are paired with a `notEqual` and absolute expectations elsewhere.

## Adjudication of characterized behaviors
| Behavior | Call | Reasoning |
|---|---|---|
| `clamp(+Infinity)` -> `lo` | **Raise as minor bug / design question** (characterize OK for now) | Doc says "Non-finite -> lo", so it is intentional, but `-Infinity -> lo` is correct while `+Infinity -> lo` violates the clamp contract (result should be `hi`). Callers likely only pass NaN-ish garbage, so low severity. Test comment already flags it; if lib is later fixed the test must flip. |
| `clamp(null/'')` -> 0 | Characterize OK | Number() coercion, documented "Coerces n to a number". |
| `num('')/null/[]` -> 0, `true` -> 1 | Characterize OK (mild footgun) | Doc says "Coerces v to a finite number"; empty-input -> 0 rather than fallback could surprise form code but is standard Number() semantics. Worth knowing, not a bug. |
| `clampInt('1e2')`->1, `'0x10'`->0, floats truncate, `1e21`->1 | Characterize OK | Documented as parseInt(v,10). `1e21` -> 1 is a parseInt-of-String artifact; harmless edge. |
| `clampInt` fallback returned unclamped / undefined if omitted | Characterize OK | Documented ("non-integer -> fallback"). |
| escapeHtml leaves quotes; escapeAttr adds `" '` | Characterize OK | Documented in the header; correct split text-node vs attribute. |
| Double-escaping of already-escaped input; null->"null" | Characterize OK | Standard escaper behavior (idempotence is not a goal). |
| slugify drops non-ASCII ("Café"->"caf") | Characterize OK | Documented ("conservative, ASCII form"; diacritics variant exists). |
| slugify 60-cap leaves trailing hyphen (verified: 59 a's + " b" -> `a*59-`) | **Raise as minor bug** | Doc promises "strip leading/trailing hyphens" then cap; slice runs after the strip, so the post-condition "no trailing hyphen" is violated. Cosmetic in a filename but contradicts the stated contract. Not asserted as correct; test comment says "characterize". |
| wrapText drops leading whitespace; mid-line runs preserved; width<=0/NaN disables wrapping | Characterize OK | Width<=0/NaN documented. Leading-whitespace drop (loses indentation) is undocumented but a plausible design for canvas wrapping; mention only. |

## Coverage-quality concerns (non-blocking)
- Mutation score is high; no gaps found in the in-scope fns.
- The two suspected-bug asserts (`clamp(Infinity)->lo`, slugify trailing hyphen) pin buggy-looking behavior; they will need updating when the lib is fixed — worth a task entry so they are not mistaken for specs.
- `wrapText` with `measure` that is non-monotonic, surrogate pairs/emoji in slugify default, and `slugify({diacritics:true})` with digits/emoji are not exercised (minor).
- `debounce` test uses mock timers only for `setTimeout`; fine.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs            # ran once: 10/10 suites passed
node <scratchpad>/mut.mjs            # 35 mutants, all KILLED
find src/lib -newermt "2026-10-03 00:00" -type f   # mtime inspection (git blocked)
```
