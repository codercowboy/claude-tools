# Pre-task receipt — Phase 3d (pilot: base64-tool port)

**Date:** 2026-10-03 · session 0004

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
- base64-tool ported onto the ct lib: `<<ct:include copy.js/util.js>>` → `<<ct:module …>>`; globals `jbcUtil`/`ctCopy`/`ctFlash` → named imports `copy`/`flash`/`downloadBlob`/`formatBytes`.
- Footer License kept & wired via explicit `CtLicense` module include.
- `formatBytes` = new format (accept-new; tests already assert `"1.5 KB"` form).
- `node scripts/build-all.mjs --check` → 10/10 (base64 via ct modules; other 8 untouched).
- `node --test` unit + serial e2e green for base64-tool; license-wiring test deltas pre-approved.

## Paths
- in (read): `src/lib/{utils,components}/`, `includes-diff.md`, `00-epic-plan/decisions.md`, `01-esm-inliner/findings/HANDOFF.md`
- out (write): `src/tools/base64-tool/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet (user override) · retries builder 5 / verify-loop cap 2 (user override) / verifier 1

## Sequencing (user-approved)
Sequential ship rounds, never parallel: R1=3d base64-tool · R2–R9=3e one tool/round (color-converter, color-designer, color-picker, cron-builder, inflation-calculator, network-toolkit, qr-generator, uuid-generator) · R10=3f retire jbc-include-old + sweep + #1011. Autonomous drive; pause only on a blocker 2 fix-rounds can't resolve.

**User response (quoted):** "Approve as shown"
**Accepted:** all defaults as shown (overrides: sonnet model, verify-loop cap 2)
