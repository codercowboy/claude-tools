# Pre-task receipt — Phase 3e R8 (port: cron-builder)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `cron-builder` onto the ct lib (hardened recipe §3d). SMALL set: copy.js + footer only.
- Template: CSS/footer → `<<ct:lib …>>`; `copy.js`→`<<ct:module components/CtClipboardUtil.mjs>>`; add `<<ct:module components/CtLicense.mjs>>` (footer). **Do NOT inline CtConfirm** (template:29 `ctConfirm` is a COMMENT on an unused `--ctc-accent` var — no confirm dialogs) **nor CtUtil/CtByteUtil**.
- app.mjs: `ctCopy`→`copy`, `ctFlash`→`flash`. Reword the template:29 `ctConfirm` comment so the source grep gate passes (the `--ctc-accent` var may stay). The function-scoped `const el` (app.mjs:523) is SAFE (CtUtil not inlined) — keep it.
- e2e (line ~512): `expect(... typeof window.ctLicense ...).toBe('function')` references the OLD global → update to the new wiring (assert the footer `[data-ct-license]` button / modal-open, which the surrounding test already checks). PRE-APPROVED license delta.
- MANDATORY smoke-check (headless load; assert `window.__cronBuilder` present + 0 pageerror) BEFORE the full e2e.
- Gates: no `jbcUtil|ctCopy|ctFlash|ctConfirm` in source; smoke clean; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/components/` (CtClipboardUtil/CtLicense), epic decisions.md (recipe + R6 lessons), inflation-calculator HANDOFF (license-delta example)
- out (write): `src/tools/cron-builder/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
