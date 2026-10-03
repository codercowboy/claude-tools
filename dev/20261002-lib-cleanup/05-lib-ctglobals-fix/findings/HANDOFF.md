# HANDOFF 05-lib-ctglobals-fix r1 — PASS

Renames (src/lib/components/):
- CtLicense.mjs:97 window.jbcThirdParty -> window.ctThirdParty (both occurrences); doc comment :9 updated
- CtConfirm.mjs:49 jbcConfirmStyles -> ctConfirmStyles; comments :31, :39 updated
- CtModal.mjs:86 jbcModalStyles -> ctModalStyles; comments :69, :76 updated
- CtClipboardUtil.mjs:87 jbcCopyStyles -> ctCopyStyles; comments :12, :50 updated

Left as history: src/lib/utils/PROVENANCE.md; src/lib/jbc-include-old/* (old tools); "jbcCopy/jbcFlash/jbcConfirm" historical mentions in rebuilt index.html comments.

Rebuilt: base64-tool, uuid-generator index.html.

Gates: grep window.jbc[A-Z] in src/lib -> only PROVENANCE.md + jbc-include-old (history/old). scripts/tests 38/38. build-all --check 10 tool(s), 0 failed. base64: unit 53/53, e2e 71/71 (workers=1). uuid: unit 58/58, e2e 41/41. Zero test changes. No commits.

## Verifier round (r1)

PASS. Independently reproduced: no runtime window.jbc[A-Z] in src/lib (only PROVENANCE.md history); all four ct* reads present; scripts/tests 38/38; build-all --check 10/10; base64 unit 53/53 + e2e 71; uuid unit 58/58 + e2e 41 (serial). No test or out-of-scope files changed (mtime check). Minor concern: no test directly pins the ct* opt-out/ctThirdParty globals. Full evidence: findings/verifier-r1-v1-verdict.md.
