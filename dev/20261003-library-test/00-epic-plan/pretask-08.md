# Pre-task receipt — Phase 08 · ctdiff

Pre-task — ship round: CtDiff unit tests (p08-ctdiff/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p08 PRD: CtDiff.test.mjs green; cover all 7 public exports (splitLines, normalizeLine,
   myersDiff, diffLines, tokenizeWords, diffWords, toUnifiedDiff); Myers line diff (identical / pure
   insert / pure delete / replace / common prefix+suffix / empty↔non-empty / CRLF-vs-LF / trailing
   newline) with ≥1 HAND-COMPUTED op sequence; word-level diff (intra-line, punctuation, whitespace
   runs, lossless re-join); unified diff (exact `@@ -a,b +c,d @@` headers, context size, multi-hunk,
   merge within 2*context); edit-script-soundness property (apply ops to "before" reconstructs "after")
   over a fixed battery; normalize options (ignoreCase / ignoreAllWhitespace / ignoreLeadingTrailing);
   test-all + build-all 10/10; handoff public-API inventory → tested + any untested option & why.
③ Paths — in: p08 PRD · src/lib/utils/formats/CtDiff.mjs (read) ·
   out: src/lib/tests/unit/CtDiff.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Reconstruct-property ALONE is insufficient (a wrong
-but-self-consistent diff can satisfy it) — pin ≥1 hand-computed op sequence AND ≥1 exact unified-diff
fixture. A round-trip that SHOULD hold but doesn't is a genuine lib bug → STOP and surface.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
