# Pre-task receipt — Phase 03 · ctbyteutil-hashing

Pre-task — ship round: CtByteUtil hashing unit tests (p03-ctbyteutil-hashing/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p03 PRD: CtByteUtil.hashing.test.mjs green; each of md5/sha1/sha256/sha512/hmac has ≥3
   known-answer (RFC/NIST) vectors + an edge case; crc32 SKIPPED (owned by P01); test-all + build-all
   --check 10/10; handoff lists fns covered + vector sources. A digest mismatch = REAL bug → STOP & surface.
③ Paths — in: p03 PRD · src/lib/utils/CtByteUtil.mjs (read) · dev origin hash/crc32 tests (port) ·
   out: src/lib/tests/unit/CtByteUtil.hashing.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY (no lib edits; mismatch = surface, never adjust expected)

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
