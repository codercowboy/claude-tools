# Epic — 20261003-library-test

> The ONE mutable cross-phase home. ORCHESTRATOR-WRITE-ONLY; all subagents are
> READ-ONLY here. Keep it CHARTER-CLEAN (subagents read this file) — describe WHAT
> each phase delivers, never its internal approach.

## Status: ✅ COMPLETE — 2026-10-04 (all 13 phases PASS)

Ledger #1013 (FINISHED). Direct unit-test coverage added for the `src/lib` (ct) shared library:
**1641 lib unit tests** across 18 files under `src/lib/tests/unit/` (node:test + node:assert/strict,
zero-dep), wired into `scripts/test-all.mjs` (`test:lib`). **1625 pass · 0 fail · 16 todo** (each todo
pins a genuine lib bug found & characterized — see decisions.md + follow-on #1014). `build-all --check`
10/10 throughout; no `src/lib` source modified (TEST-ONLY). `test-all` 9/10 — the lone failure is the
pre-existing color-picker/color-converter e2e flake (#1012), unrelated to the lib. Cost: 36 subagents,
~2.55M tokens, 571 calls.

## Goal / deliverable
Add direct, dependency-free unit tests for every pure-logic module of the `src/lib` ct library (the gap
confirmed in the #1008 cleanup epic: zero tests imported from `src/lib`). Each phase = one serial `ship`
round (builder + verifier, sonnet), verify↔fix cap 2, TEST-ONLY (never edit lib source; a real lib bug is
STOP-and-characterize, not fix). DOM/canvas-coupled code (components, CtCanvasCapture, CtVideoGif, and the
Image/URL/canvas helpers) deferred to e2e. Master plan: `../execution-plan.md`; per-round scope specs:
`../pNN-<slug>/PRD.md`.

## Phase map

| NN | Phase | Team | Status | Lib tests (cumulative) |
|----|-------|------|--------|------------------------|
| 00 | epic-plan (this) | — | living | — |
| 01 | harness (crc32 exemplar + wiring) | ship | ✅ PASS | 8 |
| 02 | ctutil-pure | ship | ✅ PASS | 55 |
| 03 | ctbyteutil-hashing | ship | ✅ PASS | 93 |
| 04 | ctbyteutil-encoding | ship | ✅ PASS | 137 |
| 05 | ctdatetimeutil | ship | ✅ PASS | 210 |
| 06 | ctziputil | ship | ✅ PASS | 239 |
| 07 | ctescaper | ship | ✅ PASS | 377 |
| 08 | ctdiff | ship | ✅ PASS | 445 |
| 09 | ctmarkdown | ship | ✅ PASS | 622 |
| 10 | ctpretty — SPLIT 10a JSON+YAML / 10b HTML+CSS / 10c SQL+JS | ship ×3 | ✅ PASS | 1004 |
| 11 | ctformat (6 formats) | ship | ✅ PASS | 1223 |
| 12 | ctcurl — SPLIT 12a parse / 12b generate | ship ×2 | ✅ PASS | 1519 |
| 13 | image-pure — SPLIT 13a CtDither+CtImagesToPdf / 13b CtImageUtil | ship ×2 | ✅ PASS | 1641 |

_Numbered ≠ serial: NN is a stable creation-order id. Work folders: `NN-<slug>/`; three phases split into
sub-rounds (10a/b/c, 12a/b, 13a/b) → work folders 10–17. 13a ran one verify↔fix cycle (CtDither weights)._

## Deliverable acceptance
- [x] All pure `src/lib/utils`, `utils/formats`, and non-DOM `utils/image` modules unit-tested directly.
- [x] Tests are zero-dep (node:test), live in `src/lib/tests/unit/`, run via `scripts/test-all.mjs`.
- [x] Every phase independently verified (re-run + coverage-quality judgement + scratch-copy mutation
      testing + independent oracle for computed values); one verify↔fix cycle used (cap 2).
- [x] `build-all --check` 10/10; no `src/lib` source modified.
- [x] Genuine lib bugs found are characterized (todo/pin tests) + surfaced, not fixed → follow-on #1014.
- [x] #1013 finished; cost rolled up (cost-ledger.md).
