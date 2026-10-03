# Pre-task receipt — Phase 3e R2 (port: uuid-generator)

**Date:** 2026-10-03 · session 0004

> **Authorization:** covered by the session-0004 standing authorization — user approved (Gate A + Gate B, "Go — drive autonomously") the sequential one-tool-per-round fan-out plan and authorized me to write each round's sign-off and proceed without re-asking, pausing only on a blocker 2 verify↔fixer rounds can't fix. This receipt records the next round in that approved sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `uuid-generator` onto the ct lib using the pilot-proven recipe (epic `decisions.md` §3d):
- Template: CSS/footer → `<<ct:lib …>>`; delete classic `<script>` includes; add `<<ct:module>>` for CtClipboardUtil (copy/flash), CtUtil (debounce), CtConfirm (confirmDialog), CtLicense (footer).
- app.mjs: `ctCopy`→`copy`, `ctFlash`→`flash`, `ctConfirm`→`confirmDialog`, `jbcUtil.debounce`→`debounce` (delete the alias).
- e2e references the OLD `ctLicense` global → update to the new wiring (PRE-APPROVED license delta).
- Gates: no `jbcUtil|ctCopy|ctFlash` in source; `build-all --check` 10/10; unit green; e2e green serial.

## Paths
- in (read): `src/lib/{utils,components}/`, epic `decisions.md` (recipe + carry-forwards), pilot `03-pilot-base64-port/findings/HANDOFF.md`
- out (write): `src/tools/uuid-generator/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing as approved
