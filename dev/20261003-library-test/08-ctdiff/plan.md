# Plan — 08-ctdiff

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test `src/lib/utils/formats/CtDiff.mjs` (278 lines; Myers O(ND) diff engine). Public API (confirmed
`export { ... }`): `splitLines`, `normalizeLine`, `myersDiff`, `diffLines`, `tokenizeWords`, `diffWords`,
`toUnifiedDiff`. One core (`myersDiff`) drives both line- and word-level diffs; `diffLines` coalesces
element ops into `{type: equal|insert|delete|replace, aStart, bStart, aLines, bLines}` + stats;
`toUnifiedDiff` emits standard `@@ -a,b +c,d @@` hunks with configurable context. Full scope spec:
`dev/20261003-library-test/p08-ctdiff/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| All 7 public exports covered | `src/lib/tests/unit/CtDiff.test.mjs` | each export has direct tests; handoff maps export → tests |
| Myers line diff correct | same file | identical→all-equal; pure insert; pure delete; replace; common prefix+suffix; empty↔non-empty; CRLF-vs-LF normalize equal; trailing-newline yields final empty line |
| Hand-computed op sequence pinned | same file | ≥1 small case with the EXACT expected op list (type+aStart/bStart+lines) hand-derived, not just reconstructed |
| Word diff correct & lossless | same file | intra-line change, punctuation, whitespace runs; `diffWords` segments join back to inputs; adjacent same-type coalesced |
| Unified diff exact | same file | exact `@@` headers + `-`/`+`/` ` markers + `--- a`/`+++ b`; multi-hunk; hunk merge within 2*context; context size cfg; no-change → `''` |
| Edit-script soundness | same file | apply ops (del aLines, ins bLines) to "before" reconstructs "after" over a FIXED battery of pairs |
| Normalize options | same file | ignoreCase / ignoreAllWhitespace / ignoreLeadingTrailingWhitespace change equality but ops carry ORIGINAL text |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtDiff.mjs` to confirm the exact export names + op/row shapes FIRST. Then:
1. **myersDiff** — direct element-op tests on small arrays (equal/insert/delete, the backtrack legs),
   including a hand-derived op sequence for a known pair (e.g. `['a','b','c']` vs `['a','x','c']`).
2. **diffLines** — table of `{before, after, expectedOps}` for the characteristic cases above; assert the
   coalesced op objects (type + aStart/bStart + aLines/bLines). Pin at least one FULL expected op list.
3. **diffWords / tokenizeWords** — tokenization is lossless (`tokens.join('')===input`); intra-line edits
   produce the right equal/delete/insert segments; adjacent same-type coalesced.
4. **toUnifiedDiff** — exact string fixtures: single hunk, multiple hunks, context=0 and larger, the
   merge-within-2*context behavior, and the no-change `''` case. Assert the full emitted text.
5. **Reconstruct property** — over a fixed battery of (before, after) pairs, apply the edit script and
   assert it rebuilds `after`. This is a SUPPLEMENT to the hand-pinned fixtures, never the only check.
6. **Options** — assert normalizeLine + diffLines under each ignore-* option: equality changes, emitted
   lines remain the ORIGINAL (un-normalized) text.
A round-trip/reconstruct that SHOULD hold but doesn't is a genuine lib bug → STOP and surface, never a
weakened test, never a lib edit.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p08-ctdiff/PRD.md` — scope/DoD + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar (known cases + property).
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/formats/CtDiff.mjs` — the module under test (confirm exports + op/row shapes FIRST).

## Deliverables
- `src/lib/tests/unit/CtDiff.test.mjs`.
- `findings/HANDOFF.md` — public-API inventory → tested, the test count, command outputs, which
  formatting option (if any) is left untested + why, and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. The reconstruct property ALONE is insufficient (a
  wrong-but-self-consistent diff can pass it) — pair with ≥1 hand-computed op sequence AND ≥1 exact
  unified-diff fixture. A genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtDiff.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the public-API
inventory (export → tested), note any untested formatting option with the reason, and flag any suspected
bug. Write it to `findings/HANDOFF.md`.
