<!-- tpm-session: 0003 · 2026-10-03 · tpm-session-version: 1.0 · files: session-0003-handoff.md, session-0003-punchlist.md, session-0003-log.md -->
> **Session 0003 memory — three files in this folder.  THIS FILE: handoff.**
> • **session-0003-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0003-punchlist.md** — open/done work items (numbered).
> • **session-0003-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# HANDOFF — session 0003 — 2026-10-03
> ⚠️ READ THIS FULLY before doing anything. Unfinished punchlist items below are required reading.

## Where we are / Next / In flight
**Where we are:** Session 0003. Phase 3b (jbc->ct lib rename, #1009) is DONE & verifier-PASS r1. The #1008/#1009 lib-cleanup epic (dev/20261002-lib-cleanup/) now has Phases 1, 2, 3a, 3b all complete+verified. Recovery note: the 3b builder was killed mid-flight by a VM freeze but had actually finished the lib cleanly (20 modules renamed Jbc*->Ct*, import-clean, grep-clean); only the test ripple remained, hand-finished this session; gates green (node --test 38/38, build-all --check 10/10) and verifier r1 PASS (dev/20261002-lib-cleanup/02-jbc-to-ct/findings/verifier-r1-v1-verdict.md). Remaining roadmap: 3c -> 3d -> 3e -> 3f (dev/20261002-lib-cleanup/execution-plan.md).
**Next action:** Phase 3c: behavior-diff inventory between jbc-include-old (what the 9 tools currently consume) and the new ct lib. ⚠️ This phase has an EXPLICIT USER SIGN-OFF GATE -- produce the inventory, surface the behavior-difference decisions to the user, get sign-off, THEN proceed to 3d (pilot one tool). Do NOT start 3d without that sign-off.
**In flight:** NOTHING running. Verifier r1 completed (PASS); no subagents or stray subshells live. tpm-workflow spawn sign-off token for 02-jbc-to-ct was consumed this session -- any NEW round spawn needs fresh Gate A + Gate B.

## What remains
- #3.2 · Phase 3c (NEXT): behavior-diff inventory for the jbc-include->ct port -- requires explicit USER sign-off gate before 3d  [jybr9i, 2026-10-03T09:47:34-07:00]
- #3.3 · Phase 3d/3e/3f (after 3c sign-off): pilot one tool on the ct lib -> fan out remaining 8 tools -> retire jbc-include-old to tmp/safe-to-delete  [dpzzgy, 2026-10-03T09:47:34-07:00]
- #3.4 · #1011: update scripts/README.md for the claude-tools layout (still describes old jason-code layout)  [jmwxut, 2026-10-03T09:47:35-07:00]

## MUST NOT redo
- Phases 1, 2, 3a, 3b are ALL done & verified -- don't redo any of them.
- 3b: src/lib fully renamed Jbc*->Ct* (20 modules, all import-clean), scripts/tests/esm-inline*.test.mjs repointed, gates green, verifier-PASS. Do NOT re-run the rename.
- rm + git are BLOCKED in-session -- retire by moving to tmp/safe-to-delete/.
- jbc->ct is SURGICAL: preserve jbc-include / jbc-include-old refs (negative lookahead jbc-(?!include)); Jbc->Ct is case-sensitive. A blanket jbc->ct corrupts the legacy-dir refs.
- Every tpm-workflow round spawn needs FRESH user Gate A + Gate B (hook-enforced, per-session). Phase 3c has an explicit USER sign-off gate on top of that.
- Serial Playwright (workers:1) is a hard requirement; e2e flakiness is environmental/order-dependent (#1012 tracks a retries:1 hardening) -- don't chase it or revert to parallel.
- Orchestrator hygiene note: the 3b recovery also touched comment-only lines in src/lib/test-support/{interaction,shared-ui}.mjs -- slightly outside the plan's stated diff scope; verifier flagged it non-blocking. Harmless, but noted for the audit trail.
