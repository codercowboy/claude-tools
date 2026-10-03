# Pre-task receipt — Phase 3e R3 (port: qr-generator)

**Date:** 2026-10-03 · session 0004

> **Authorization:** covered by the session-0004 standing autonomous-drive authorization (Gate B "Go — drive autonomously"); next round in the approved one-tool-per-round 3e sequence.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `qr-generator` onto the ct lib (pilot recipe, epic decisions.md §3d). This tool exercises the most lib surface so far — crc32 + the License third-party list:
- Modules: CtByteUtil (`crc32`), CtUtil (`debounce`), CtClipboardUtil (`copy`/`flash`), CtConfirm (`confirmDialog`), CtLicense (footer).
- Renames: delete `const crc32 = jbcCrc32` (crc32 now a const from the inlined module); `jbcUtil.debounce`→`debounce`; `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog`.
- e2e: update the old `window.ctLicense()` ref → new wiring (PRE-APPROVED license delta). The e2e's `window.ctThirdParty` third-party-list assertion should now PASS (Phase-05 fixed the lib) — keep it; it validates the fix end-to-end.
- Accept inlining the whole CtByteUtil (~585 lines) for just crc32 — note the size but do not refactor the lib.
- Gates: no `jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm` in source; `build-all --check` 10/10; unit green; e2e green serial (including the ctThirdParty assertion).

## Paths
- in (read): `src/lib/{utils,components}/`, epic decisions.md (recipe), pilot `03-pilot-base64-port/findings/HANDOFF.md`, `04-port-uuid-generator/findings/HANDOFF.md`
- out (write): `src/tools/qr-generator/source/` + `tests/`

## Advanced
time 2h · scope task-folder · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B); one-tool-per-round sequencing
