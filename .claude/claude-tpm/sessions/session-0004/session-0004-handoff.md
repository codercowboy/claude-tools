<!-- tpm-session: 0004 · 2026-10-03 · tpm-session-version: 1.0 · files: session-0004-handoff.md, session-0004-punchlist.md, session-0004-log.md -->
> **Session 0004 memory — three files in this folder.  THIS FILE: handoff.**
> • **session-0004-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0004-punchlist.md** — open/done work items (numbered).
> • **session-0004-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# HANDOFF — session 0004 — 2026-10-03
> ⚠️ READ THIS FULLY before doing anything. Unfinished punchlist items below are required reading.

## Where we are / Next / In flight
**Where we are:** Session 0004. (1) lib-cleanup epic (dev/20261002-lib-cleanup) COMPLETE+verified — all 9 tools + gallery on the ct lib, jbc-include-old retired to tmp/safe-to-delete, toolchain + scripts/README cleaned; build-all --check 10/10, test-all 9/9, scripts/tests 38/38. (2) Ledger groomed: #1008/#1009/#1011/#1003 finished; #1001 gained subtask E (library guides); #1013 created (lib unit tests). (3) NEW: a full execution plan for #1013 is scaffolded at dev/20261003-library-test/ — execution-plan.md (master) + 13 per-phase mini-PRDs in pNN-<slug>/PRD.md. No tests written yet; this is the plan only, ready for a fresh session to run.
**Next action:** Run the library unit-test epic per dev/20261003-library-test/execution-plan.md. In a fresh session: tpm-session open; npx tpm workflow epic-init dev/20261003-library-test; then for each pNN-<slug>/PRD.md IN ORDER (p01 harness FIRST — it blocks all), run a /tpm-workflow ship round (builder+verifier, sonnet, serial) using that PRD as the scope source — Gate A -> scaffold -> Gate B -> spawn builder -> verifier -> reconcile -> next. Serial only; quality over speed; size each team to one module (split the big format engines p10/p11/p12 if a builder flags it). The execution-plan.md 'How the next session runs this' section has the exact steps + conventions + quality bar. Still pending from the cleanup epic: USER should commit the tree + delete tmp/safe-to-delete when ready.
**In flight:** NOTHING running. No subagents, no strays. The library-test epic is PLANNED, not started.

## What remains
_No open punchlist items._

## MUST NOT redo
- lib-cleanup epic is DONE & verified — do not redo. jbc-include-old retired; flat <<ct:include>> intentionally retired; project.json required; Phase-05 + crypto.randomUUID reword intentional.
- #1003 CLOSED by decision (vendor tooling lives in ../claude-tools-dev, not public).
- src/lib has NO unit tests yet — that is the #1013 work, planned at dev/20261003-library-test/. The plan is written; do not re-plan from scratch — execute it (adjust per-phase at Gate A as needed).
- library-test epic is TEST-ONLY: do NOT modify lib source to make a test pass; a test that reveals a real lib bug is STOP-and-surface. Only Phase 01 may edit scripts/ (test-all wiring).
- Workers make no commits; rm/git blocked — USER commits + deletes tmp/safe-to-delete.
