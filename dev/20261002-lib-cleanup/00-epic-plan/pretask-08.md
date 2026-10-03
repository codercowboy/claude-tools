# Pre-task receipt — Phase 3e R5 (port: color-converter)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `color-converter` onto the ct lib (pilot recipe §3d). Mirrors uuid-generator:
- Template: CSS/footer → `<<ct:lib …>>`; `confirm.js`→`<<ct:module components/CtConfirm.mjs>>`; `copy.js`→`<<ct:module components/CtClipboardUtil.mjs>>`; `util.js`→`<<ct:module utils/CtUtil.mjs>>`; add `<<ct:module components/CtLicense.mjs>>` (footer License).
- app.mjs: `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`, `jbcUtil.debounce`→`debounce` (delete alias). Check styles.css:18 ctConfirm ref (likely a comment/class; CtConfirm's .ctc-* styles self-inject, unchanged).
- No license e2e test present → no test delta expected (any red test = STOP+surface).
- Gates: no `jbcUtil|ctCopy|ctFlash|ctConfirm` in source; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/{utils,components}/`, epic decisions.md (recipe), uuid HANDOFF (closest example)
- out (write): `src/tools/color-converter/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
