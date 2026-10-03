# Pre-task receipt — Phase 3e R7 (port: color-picker)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `color-picker` onto the ct lib (hardened recipe §3d). Uses ONLY confirm.js + copy.js + footer — NOT util/crc32:
- Template: CSS/footer → `<<ct:lib …>>`; `confirm.js`→CtConfirm; `copy.js`→CtClipboardUtil; add CtLicense (footer). **Do NOT inline CtUtil or CtByteUtil** (color-picker uses neither).
- app.mjs: `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`. **KEEP the tool-local `function clamp` (app.mjs:149)** — it is safe BECAUSE CtUtil (which also exports clamp) is NOT inlined. styles.css ctConfirm comment → reword if the grep gate flags it.
- MANDATORY smoke-check (headless load of built index.html; assert 0 pageerror + the tool's own test API present — check the e2e beforeEach for the `window.__…` it waits on) BEFORE the full e2e.
- No license e2e expected → zero test deltas; any red test = STOP+surface.
- Gates: no `jbcUtil|ctCopy|ctFlash|ctConfirm` in source; smoke clean; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/components/` (CtConfirm/CtClipboardUtil/CtLicense), epic decisions.md (recipe + R6 collision/smoke-check lessons), color-converter HANDOFF
- out (write): `src/tools/color-picker/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
