# HANDOFF 06-port-qr-generator r1 — STATUS: PASS

## Changed (src/tools/qr-generator only)
- template: CSS -> ct:lib base/controls; footer -> ct:lib; classic include scripts removed; module script with ct:module CtByteUtil, CtUtil, CtClipboardUtil, CtConfirm, CtLicense then ct:inline app.mjs.
- app.mjs: deleted `const crc32 = jbcCrc32`; debounce, copy, flash; jbcUtil.downloadBlob -> downloadBlob (CtUtil export; not in the brief but needed).
- e2e: only the comment referencing window.ctLicense updated (no code referenced it; the test uses the footer-license-link testid). The e2e does NOT set window.ctThirdParty (it asserts the "100% vanilla" note), so the ctThirdParty-list assertion did not exist to validate Phase 05; the vanilla-note License tests pass.
- Collisions: only crc32 (the deleted alias). No renames.
- CtByteUtil inlined whole: 585 lines for crc32. Built index.html 139692 chars.

## Gates
- grep jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm over source: only a prose comment in styles.css:265 ("ctConfirm-style") remains; no code matches.
- build-tool clean; build-all --check: 10 checked, 0 failed.
- unit: 61/61 pass.
- e2e serial (run from src/tools/qr-generator, config tests/playwright.config.mjs, workers 1): 75 pass, 1 FAIL.

## The red test
`conventions compliance › index.html source does not reference crypto.randomUUID` (e2e line 1192) regexes the built HTML for `crypto.randomUUID`. Inlining CtByteUtil brings in a doc comment (src/lib/utils/CtByteUtil.mjs:534: "...crypto.randomUUID — it is secure-context-only...") that matches. No actual use. Not the license delta, so STOPPED.
Options: (a) lib: reword that comment (shared src/lib, out of my boundary; likely also hits other ported tools with this test); (b) loosen the test to ignore comments (test change needs sign-off).

## Final (after orchestrator reworded CtByteUtil.mjs:534)
Rebuilt (139730 chars). crypto.randomUUID grep in index.html: 0. e2e serial 76/76 pass; unit 61/61; build-all --check 10/10 (0 failed); scripts/tests 38/38. The red test above is resolved.

## Verifier round (r1)
VERDICT: PASS. All DoD rows reproduced independently (build-all --check 10/10, scripts/tests 38/38, unit 61/61, serial e2e 76/76, no crypto.randomUUID in built html, license wired, scope clean). Caveat: no ctThirdParty-list assertion exists for this tool. Details: findings/verifier-r1-v1-verdict.md
