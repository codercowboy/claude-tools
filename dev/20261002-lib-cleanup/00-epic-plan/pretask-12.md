# Pre-task receipt — Phase 3e R9 (port: network-toolkit) — FINAL tool

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B); last round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `network-toolkit` onto the ct lib (hardened recipe §3d). Same shape as cron-builder: copy.js + footer only.
- Template: CSS/footer → `<<ct:lib …>>`; `copy.js`→`<<ct:module components/CtClipboardUtil.mjs>>`; add `<<ct:module components/CtLicense.mjs>>` (footer). **Do NOT inline CtConfirm/CtUtil/CtByteUtil.**
- app.mjs: `ctCopy`→`copy`, `ctFlash`→`flash`.
- e2e (line ~475): the `window.ctLicense` reference → new wiring (footer `[data-ct-license]` present / modal opens). PRE-APPROVED license delta.
- MANDATORY smoke-check (headless load; assert `window.__networkToolkit` present + 0 pageerror) BEFORE the full e2e.
- Gates: no `jbcUtil|ctCopy|ctFlash|ctConfirm` in source; smoke clean; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/components/` (CtClipboardUtil/CtLicense), epic decisions.md (recipe + R6 lessons), cron-builder HANDOFF (identical shape)
- out (write): `src/tools/network-toolkit/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
