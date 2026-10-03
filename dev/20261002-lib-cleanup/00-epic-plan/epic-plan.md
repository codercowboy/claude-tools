# Epic — 20261002-lib-cleanup

> The ONE mutable cross-phase home. ORCHESTRATOR-WRITE-ONLY; all subagents are
> READ-ONLY here. Keep it CHARTER-CLEAN (subagents read this file) — describe WHAT
> each phase delivers, never its internal approach.

## Goal / deliverable

Finish the #1008 lib-cleanup: migrate the jason-code conventions code into `src/lib`,
reconcile the duplicate build tooling, and port the 9 shipped tools off the legacy
flat includes (`src/lib/jbc-include-old/`) onto the new ESM library (`src/lib/utils/`
+ `src/lib/components/`), renamed `jbc`→`ct` (#1009). Each phase keeps the tools green
and, where no behavior changes, byte-identical. Full roadmap: `../execution-plan.md`.

## Phase map

| NN | Phase | Team | Parallelism | Status |
|----|-------|------|-------------|--------|
| 00 | epic-plan (this) | — | — | living |
| —  | P1 reconcile tooling (scripts/ ↔ misc) | (informal) | — | ✅ done — byte-identical, misc retired |
| —  | P2 retire test-support-old | (inline) | — | ✅ done — 27 files repointed, unit+e2e 9/9 |
| 01 | esm-inliner (3a): teach build-tool.mjs to inline ES modules | full−documentarian (planning→builder→test-writer→verifier) | serial | ✅ DONE — verifier PASS; 10/10 byte-identical, 38/38 tests, 26-mutation check |
| —  | 3b rename jbc→ct (#1009) | tbd | — | pending (after 3a) |
| —  | 3c behavior-diff decisions (USER sign-off gate) | tbd | — | pending |
| —  | 3d pilot one tool | tbd | — | pending |
| —  | 3e fan out remaining 8 tools | tbd | — | pending |
| —  | 3f retire jbc-include-old + sweep | tbd | — | pending |

_Numbered ≠ serial: NN is a stable creation-order id, not an execution order. P1/P2 pre-date
the formal epic scaffold (done informally/inline), so they carry no NN._

## Deliverable acceptance

Epic done when: all 9 tools build from the new `ct`-named ESM library via `build-tool.mjs`
ESM-inlining, `build-all.mjs --check` is green, `test-all.mjs` is 9/9, `jbc-include-old/`
and `test-support-old/` are retired, and every behavior change was pre-approved by the user
(3c gate). Phase 01 (3a) acceptance is its own `plan.md` DoD table.
