# Pre-task receipt — Phase 07 · ctescaper

Pre-task — ship round: CtEscaper unit tests (p07-ctescaper/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p07 PRD: CtEscaper.test.mjs green; every ~20 escape/unescape context pair has round-trip
   identity (table-driven over CONTEXTS) + ≥1 KNOWN-OUTPUT fixture (round-trip alone passes a no-op —
   must pin real escape output); metadata (CONTEXTS/CONTEXTS_BY_ID/DEFAULT_ENABLED) + escapeFilename
   (one-way) + nest covered; test-all + build-all 10/10; handoff context table {roundtrip✓,fixture✓} +
   any lossy context called out.
③ Paths — in: p07 PRD · src/lib/utils/formats/CtEscaper.mjs (read) ·
   out: src/lib/tests/unit/CtEscaper.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Round-trip-ONLY is insufficient — always pair with a
real known-output assert. Big mechanical surface — table-driven, not 40 ad-hoc tests.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
