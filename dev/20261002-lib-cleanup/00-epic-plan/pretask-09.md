# Pre-task receipt — Phase 3e R6 (port: color-designer)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `color-designer` onto the ct lib (pilot recipe §3d). Like qr-generator + confirm.js:
- Template: CSS/footer → `<<ct:lib …>>`; `confirm.js`→CtConfirm; `copy.js`→CtClipboardUtil; `crc32.js`→CtByteUtil; `util.js`→CtUtil; add CtLicense (footer). (5 `<<ct:module>>`.)
- app.mjs: delete `const crc32 = jbcCrc32` alias if present (crc32 now from inlined CtByteUtil); `jbcUtil.debounce`→`debounce` (delete alias); `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog`. styles.css:17 ctConfirm comment → reword (grep gate scans source/).
- The `does not reference crypto.randomUUID` convention test should PASS now (Phase-3e lib-comment reword already removed the literal from CtByteUtil). No license e2e present → expect ZERO test deltas; any red test = STOP+surface.
- Accept CtByteUtil whole-inline (~585 lines) for crc32; note size.
- Gates: no `jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm` in source; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/{utils,components}/`, epic decisions.md (recipe), qr-generator HANDOFF (closest example: CtByteUtil inline)
- out (write): `src/tools/color-designer/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
