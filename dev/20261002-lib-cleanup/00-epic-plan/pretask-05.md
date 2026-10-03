# Pre-task receipt — Phase 05 (lib fix: window.jbc* → ct* globals)

**Date:** 2026-10-03 · session 0004

> **Authorization:** user explicitly chose "Verified ship round" for this shared-lib fix (session-0004, in response to the surfaced Phase-3b gap), on top of the standing autonomous-drive authorization. Inserted before the tool ports that depend on it.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Rename the 4 RUNTIME `jbc`+PascalCase window globals (3b misses) to `ct*` in the new lib, + their current-API doc comments; leave PROVENANCE/historical lineage comments alone:
- `CtLicense.mjs` `window.jbcThirdParty` → `window.ctThirdParty`
- `CtConfirm.mjs` `window.jbcConfirmStyles` → `window.ctConfirmStyles`
- `CtModal.mjs` `window.jbcModalStyles` → `window.ctModalStyles`
- `CtClipboardUtil.mjs` `window.jbcCopyStyles` → `window.ctCopyStyles`
Gates: `grep -rnE "window\.jbc[A-Z]" src/lib` → no RUNTIME matches; `node --test scripts/tests/` 38/38; rebuild base64-tool + uuid-generator (they inline these modules) so `build-all --check` stays 10/10 and their e2e stay green.

## Paths
- in/out (write): `src/lib/components/{CtLicense,CtConfirm,CtModal,CtClipboardUtil}.mjs` + regenerated `src/tools/base64-tool/index.html` + `src/tools/uuid-generator/index.html`
- read: epic `decisions.md` (the gap write-up)

## Advanced
time 1h · scope: shared-lib targeted · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** user "Verified ship round" + standing autonomous authorization
