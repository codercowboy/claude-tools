# Pre-task receipt — Phase 3e R4 (port: inflation-calculator)

**Date:** 2026-10-03 · session 0004

> **Authorization:** covered by the session-0004 standing autonomous-drive authorization (Gate B); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `inflation-calculator` onto the ct lib (pilot recipe). SIMPLE tool — only copy.js + footer from the lib:
- Template: CSS/footer → `<<ct:lib …>>`; `copy.js` → `<<ct:module components/CtClipboardUtil.mjs>>`; add `<<ct:module components/CtLicense.mjs>>` for the footer License. Keep the `<<ct:inline cpi-data.json>>` + `<<ct:inline app.mjs>>` as-is.
- app.mjs: `ctCopy`→`copy`, `ctFlash`→`flash`.
- e2e (line ~413): the `window.ctLicense()` programmatic-open test → switch to clicking the footer `[data-ct-license]` button (PRE-APPROVED license delta), preserving the "modal opens" assertion.
- Gates: no `jbcUtil|ctCopy|ctFlash` in source; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/components/`, epic decisions.md (recipe), prior HANDOFFs (base64/uuid worked examples)
- out (write): `src/tools/inflation-calculator/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
