# Lib-cleanup execution plan — multi-phase, via tpm workflows

**Date:** 2026-10-02
**Altitude:** high-level punchlist of the rounds we'd run. NOT actual tpm-workflow
scaffolding (no plan.md / charter / spawn-prompts here) — that gets written per
round when we kick it off.
**Companions:** `tooling-diff.md`, `reconciliation-plan.md`, `test-support-diff.md`,
`includes-diff.md`.

## Scope & order (easiest → hardest)

1. Reconcile `scripts/` ↔ `src/tools/misc/` tooling. *(✅ DONE — byte-identical, misc retired)*
2. Retire `test-support-old` (port the 9 tools onto the new `test-support`). *(✅ DONE 2026-10-02 — 27 files repointed, unit 9/9 + e2e 9/9, old dir in tmp/safe-to-delete)*
3. jbc-include port — the big multi-round effort. *(next)*

## Rules that hold across every round

- **Charter:** shipping (workers produce the change + keep it green), not research.
- **Green gate = done.** Every code round ends on: `node scripts/build-all.mjs --check`
  byte-identical (10/10) **and** `node scripts/test-all.mjs` 9/9 (serial — base config
  is `workers: 1`, keep it).
- **🔴 Test-review gate (the hard rule).** A red test is STOP-and-surface, never an
  auto-edit. A worker reports the exact before/after and waits — it never rewrites a
  test to make it pass. The only exception: behavior changes **pre-approved** in the
  Phase-3 inventory (3c).
- **Pilot before fan-out.** Prove a new pipeline on ONE tool before spawning a team
  across nine.
- **No commits by workers.** Changes land in the working tree; the user commits.
- **No `rm`, no `git`.** Both are blocked in this environment. Retire anything by
  MOVING it to `tmp/safe-to-delete/` (e.g. `mv src/lib/jbc-include-old tmp/safe-to-delete/`),
  never delete. "Gone from its old location" checks still pass after a move.

---

## Phase 1 — Reconcile tooling  *(status: ✅ DONE — build --check 10/10 byte-identical; misc in tmp/safe-to-delete; e2e confirmed green once contention cleared. Bonus fix: scripts/test-all.mjs now skips src/lib so the new-tool-template isn't mis-discovered as a test target.)*

**Goal:** `scripts/` becomes the single best-of-both toolchain; `src/tools/misc/` deleted.
**Round shape:** 1 builder (executing `reconciliation-plan.md`) → verify.
**Verify:** `--check` byte-identical + 9/9 e2e + `misc/` gone.
**Why first:** every later phase builds on the merged `build-tool.mjs`; the ESM-inlining
work (3a) lands on top of it.
**Ledger:** part of #1008 (tooling half).

## Phase 2 — Retire `test-support-old`  *(status: ✅ DONE 2026-10-02 — 27 test files across 9 tools repointed lib/test-support-old → lib/test-support; unit 9/9 + e2e 9/9 green; test-support-old moved to tmp/safe-to-delete/. Serial-config backport to the new base config was already in place.)*

**Goal:** the 9 tools import the new `src/lib/test-support`; delete `test-support-old`.
**Why easy:** the diff report confirmed identical export names/signatures, nothing dropped;
the one gotcha (serial config on the new base) is already fixed.
**Round shape:** 1 builder → verify. (Low enough risk to run as a single `tpm-spawn`, or
even inline.)
**Steps:**
1. Repoint imports `lib/test-support-old/` → `lib/test-support/` in all 9 tools' `tests/`
   (configs + `*.e2e.mjs` + `tests/unit/_helpers.mjs`). Depth is unchanged.
2. `--check` (should be untouched) + full serial e2e → 9/9.
3. Delete `src/lib/test-support-old/`; grep for leftover refs.
**Verify:** 9/9 e2e, `test-support-old/` gone, no stale refs.
**Ledger:** part of #1008.

## Phase 3 — jbc-include port  *(multi-round)*

The hard one. The new lib is ESM (named exports) and `jbc`-named; the tools are flat-inlined
globals and `ct`-named. Sub-rounds:

### 3a — Build: teach `build-tool.mjs` to inline ES modules  *(✅ DONE 2026-10-02 — verifier PASS)*
**Shipped:** two additive tokens `<<ct:module PATH>>` (ESM transform) + `<<ct:lib PATH>>` (verbatim),
resolved against injectable `libDir` (default `src/lib`); per-module IIFE scoping (8 real cross-module
name collisions ruled out flat concat); column-0 parse + whole-lib equivalence guard; throws on
`export default`/`*`/`let|var`, unsupported imports, cycles, path-escape, root-vs-root collisions.
Only `scripts/build-tool.mjs` + `scripts/tests/{esm-inline,esm-inline-hardening}.test.mjs` changed;
9 tools BYTE-IDENTICAL (10/10 `--check`), 38/38 node:test, 26-mutation check all caught.
**3d contract:** inside a tool's `<script type="module">`, above `<<ct:inline app.mjs>>`, write
`<<ct:module components/JbcClipboardUtil.mjs>>` (one per lib module used); exports become `const`s,
lib-internal imports resolved+deduped by the build; `<<ct:lib components/styles/base.css>>` for CSS.
**Carry-forward notes:** `components/*.mjs` are DOM-only (syntax-checked, not executed in tests);
`slice-tool.mjs` not yet exercised against a `ct:module` template (planner R6 — check in 3d).
See `01-esm-inliner/findings/HANDOFF.md` + `verifier-r1-v1-verdict.md`.

#### 3a (original brief)
**Goal:** the build can inline a `.mjs` module (strip `export`, resolve the lib's internal
relative imports, e.g. `JbcZipUtil`→`JbcByteUtil`) and resolve includes across the new split
(`utils/`, `components/`, `components/styles/`).
**Round shape:** plan → 1 builder + 1 test-writer (unit tests for the inliner) → verifier.
**Gate:** new inliner has tests; existing 9 tools still `--check` byte-identical (it must be
additive — old flat includes keep working until a tool is ported).
**This is the riskiest single piece — do it alone, first, before any tool moves.**

### 3b — Rename the lib `jbc` → `ct`  *(do this BEFORE porting tools)*
**Goal:** rename `src/lib/utils` + `components` from `Jbc*`/`jbc-`/`.jbcc-`/`data-jbc-license`
to the `ct` convention the tools already use — so the port lands on matching names and the
per-tool churn shrinks.
**Round shape:** 1 builder (codemod over `src/lib/utils` + `components` only) → verify.
**Gate:** lib-internal references consistent; nothing yet consumes it, so blast radius is the
lib dir only. (This is #1009, pulled ahead of the port.)
**Ledger:** #1009.

### 3c — Inventory & decide behavior diffs  *(human gate, no fan-out)*
**Goal:** list every behavioral difference old→new (seed from the reports: `formatBytes`
output/TB-tier, footer license-script gap, any others) and get a per-diff decision:
**force-old** (call new API with options → test stays green) or **accept-new** (test update
pre-approved).
**Round shape:** 1 analyst produces a decisions table (scoped deliverable, not open research)
→ **user signs off**.
**Why now:** front-loading these turns "this breaks a test" into a pre-made decision, so 3e
runs without stalling. Organize by **shared util** (e.g. `formatBytes` decided once, ripples
to N tools).

### 3d — Pilot: port ONE tool end-to-end
**Goal:** run one small tool (e.g. `uuid-generator` or `base64-tool`) through the whole
pipeline — ESM inlining + named imports (globals→`confirmDialog`/`copy`/`openLicense`/…) +
footer `CtLicense` import + CSS already matching post-3b — and get it green.
**Round shape:** 1 builder (full port) → verifier (`--check` for that tool + its e2e).
**Gate:** pipeline validated on one target; if the 3a inliner design is wrong we learn here,
not across nine.

### 3e — Fan out: port the remaining 8 tools
**Round shape:** `tpm-spawn-team` — 1 worker per tool (parallel, or 2–3 batches to keep the
machine sane) + verifier(s). Each worker applies the pilot-proven recipe + the 3c decisions.
**Test-review gate applies:** green → done; red (and not pre-approved) → stop + surface.
**Verify:** each tool `--check` byte-identical where no behavior change, e2e green (or
pre-approved test deltas).

### 3f — Delete `jbc-include-old` + final sweep
**Round shape:** 1 builder → verifier.
**Steps:** grep for any leftover old include names / `ct`↔`jbc` stragglers across `src/tools`
+ `scripts`; delete `src/lib/jbc-include-old/`; full `--check` + full serial e2e.
**Gate:** 9/9 e2e, no stale references, `jbc-include-old/` gone.

---

## Dependency chain

```
P1 reconcile ──► P2 retire test-support-old ──► P3a build inliner ──► P3b lib rename
                                                        │                   │
                                                        └─────────┬─────────┘
                                                                  ▼
                                               P3c inventory+decide (human gate)
                                                                  ▼
                                                        P3d pilot one tool
                                                                  ▼
                                                   P3e fan out remaining 8
                                                                  ▼
                                                 P3f delete jbc-include-old + sweep
```

## Ledger mapping

- **#1008** (Move jason-code into src/lib) — umbrella for P1, P2, P3a/3c/3d/3e/3f.
- **#1009** (jbc→ct rename) — P3b (pulled ahead of the tool port).
- **#1011** (scripts/README) — fold into P3f or the doc pass (#1001).
- **#1010** (diff gate) — ✅ done; its two reports feed P3c/P3e.
