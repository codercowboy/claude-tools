# Pre-task receipt — Phase 06 · ctziputil

Pre-task — ship round: CtZipUtil unit tests (p06-ctziputil/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p06 PRD: CtZipUtil.test.mjs green; u16le/u32le LE byte order + storeZip byte structure
   (PK local/central/EOCD signatures, per-entry CRC-32 matching CtByteUtil.crc32, sizes/offsets),
   single/multi/empty/binary/unicode cases, ideally a real unzip round-trip; test-all + build-all 10/10;
   handoff coverage inventory + whether a real unzip round-trip was used.
③ Paths — in: p06 PRD · src/lib/utils/CtZipUtil.mjs (read) · dev zip tests (port) ·
   out: src/lib/tests/unit/CtZipUtil.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. NOTE actual API: u16le/u32le(view,offset,value) WRITE
into a DataView (not return bytes); storeZip(files). Small module — quick round, keep byte asserts rigorous.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
