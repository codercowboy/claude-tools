# Pre-task receipt — Phase 04 · ctbyteutil-encoding

Pre-task — ship round: CtByteUtil encoding/ids/formatBytes unit tests (p04-ctbyteutil-encoding/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p04 PRD: CtByteUtil.encoding.test.mjs green; round-trips + known pairs + edge cases for
   bytesToBase64/base64UrlToBytes/utf8ToBase64/textToBytes/bytesToHex, formatBytes (#1008 NEW format,
   cap at GB, 1-dec+space), getRandomBytes/makeId (shape+uniqueness); test-all + build-all 10/10;
   handoff coverage inventory; note formatBytes traces to #1008.
③ Paths — in: p04 PRD · src/lib/utils/CtByteUtil.mjs (read) · base64-tool unit tests (formatBytes ref) ·
   out: src/lib/tests/unit/CtByteUtil.encoding.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY (no lib edits; use #1008 NEW formatBytes format, not old compact)

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
