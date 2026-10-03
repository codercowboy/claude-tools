<!-- tpm-session: 0002 · 2026-10-02 · tpm-session-version: 1.0 · files: session-0002-handoff.md, session-0002-punchlist.md, session-0002-log.md -->
> **Session 0002 memory — three files in this folder.  THIS FILE: punchlist.**
> • **session-0002-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0002-punchlist.md** — open/done work items (numbered).
> • **session-0002-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# Punchlist — session 0002 — 2026-10-02

## Open
- [ ] #2.3 · Phase 3 (#1008/#1009): jbc-include port — see dev/20261002-lib-cleanup/execution-plan.md (3a ESM-inlining -> 3b rename jbc->ct -> 3c behavior-diff decisions [USER gate] -> 3d pilot -> 3e fan out -> 3f retire jbc-include-old)  [vdz6i9, 2026-10-02T14:48:45-07:00]
- [ ] #2.4 · #1011: update scripts/README.md for claude-tools layout (migrated from jason-code; still describes old jason-code layout)  [dyqcgs, 2026-10-02T14:48:52-07:00]
- [ ] #2.5 · Phase 3b STOPPED mid-flight for VM recovery: src/lib renamed Jbc*->Ct* (20 files, 0 Jbc*.mjs left) BUT scripts/tests/esm-inline*.test.mjs NOT yet repointed (still ref Jbc) -> tree inconsistent + UNVERIFIED. Resume: either finish the test ripple + re-run gates (node --test 38/38, build --check 10/10, grep lib clean), or re-spawn the 02-jbc-to-ct builder to complete its own work. Verifier not yet run.  [kdogfe, 2026-10-02T22:01:51-07:00]

## Done
- [x] #2.1 · Confirm Phase 1 (tooling merge) with a clean full serial e2e once VM load drops — merge is byte-identical-verified (build --check 10/10); e2e unconfirmed due to contention  [za7nsq, 2026-10-02T14:48:26-07:00] (closed 2026-10-02T16:53:15-07:00)
- [x] #2.2 · Phase 2 (#1008): retire test-support-old — repoint 9 tools' test imports lib/test-support-old -> lib/test-support, run e2e, mv test-support-old to tmp/safe-to-delete  [vfaj6g, 2026-10-02T14:48:35-07:00] (closed 2026-10-02T17:01:01-07:00)
