<!-- tpm-session: 0004 · 2026-10-03 · tpm-session-version: 1.0 · files: session-0004-handoff.md, session-0004-punchlist.md, session-0004-log.md -->
> **Session 0004 memory — three files in this folder.  THIS FILE: punchlist.**
> • **session-0004-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0004-punchlist.md** — open/done work items (numbered).
> • **session-0004-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# Punchlist — session 0004 — 2026-10-03

## Open
_No open items._

## Done
- [x] #4.1 · Phase 3c: behavior-diff sign-off — USER-APPROVED (formatBytes accept-new; keep footer License via per-tool CtLicense import; license-wiring test deltas pre-approved)  [nqte8i, 2026-10-03T10:43:04-07:00] (closed 2026-10-03T10:43:10-07:00)
- [x] #4.2 · Phase 3d (NEXT): pilot-port ONE tool (base64-tool) end-to-end onto ct lib — ESM inline + named imports + explicit CtLicense import; green gate (--check byte-identical + its e2e) for that tool  [33y8cr, 2026-10-03T10:43:04-07:00] (closed 2026-10-03T13:11:39-07:00)
- [x] #4.3 · Phase 3e: fan out remaining 8 tools onto ct lib via tpm-spawn-team, applying the pilot recipe + 3c decisions; red test NOT pre-approved = stop+surface  [b4wods, 2026-10-03T10:43:04-07:00] (closed 2026-10-03T16:59:10-07:00)
- [x] #4.4 · Phase 3f: retire jbc-include-old to tmp/safe-to-delete + final grep/green sweep (9/9 e2e, no stale refs); folds in #1011 scripts/README update  [ukwtn3, 2026-10-03T10:43:05-07:00] (closed 2026-10-03T16:59:10-07:00)
