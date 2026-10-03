# Pre-task receipt — Phase 01 · harness

Pre-task — ship round: lib test harness + exemplar (p01-harness/PRD.md)
Defaults run the team AS CONFIGURED except the two epic-wide overrides below.

① Roster + sequencing — serial, 1 each:
     builder   · charter: shipping   · sonnet   (override: sonnet, not opus)
     verifier  · charter: verifier   · sonnet   (override: sonnet, not opus)
     ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (override: cap 2, not 5)
② Definition of "done" — per p01-harness/PRD.md DoD:
     • node --test src/lib/tests/ green incl. crc32 exemplar (count reported)
     • node scripts/test-all.mjs runs lib tests as a named step, green
     • node scripts/build-all.mjs --check → 10/10 (no lib source touched)
     • handoff documents location + wiring + crc32 ownership for later phases
③ Paths:
     in:   dev/20261003-library-test/p01-harness/PRD.md (scope) · src/lib/* (read)
     out:  src/lib/tests/unit/ · src/lib/tests/README.md · scripts/test-all.mjs (wiring only)

Advanced: time 2h · scope task-folder · epic is TEST-ONLY (no lib source edits)

## User response (quoted)
> "run the unit test workflows planned last session, run it autonomously unless a verifier fixer
> team can't solve a blocker for any given phase"

Confirmed at the kickoff gate (AskUserQuestion, 2026-10-03): **"Run all 13 autonomously"** — drive
phases 01→13 serially, each a sonnet ship round, writing each round's sign-off as the pre-authorized
GO; stop and surface only on an unresolvable blocker (verify↔fix loop hits cap 2) or a real lib bug a
test reveals.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
