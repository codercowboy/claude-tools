# Verdict 05-lib-ctglobals-fix r1 — PASS

All commands run from project root, env sourced (tmp/verifier1-env.md). No edits made to any checked artifact.

| DoD row | Command | Result |
|---|---|---|
| 4 runtime globals renamed | `grep -rnE "window\.ct(ThirdParty\|ConfirmStyles\|ModalStyles\|CopyStyles)" src/lib/components/*.mjs` | Runtime reads present: CtLicense.mjs:97 (ctThirdParty x2), CtConfirm.mjs:49, CtModal.mjs:86, CtClipboardUtil.mjs:87 |
| No runtime window.jbc[A-Z] | `grep -rnE "window\.jbc[A-Z]" src/lib \| grep -v jbc-include-old` | Only src/lib/utils/PROVENANCE.md (history). Zero matches in the four modules. |
| Doc comments current / history left | `grep -nE "jbc[A-Z]"` on the four modules | Survivors are only "Formerly/ex-/was jbcX" lineage comments (CtClipboardUtil:9-10, CtModal:3,73-74, CtConfirm:3,36-38); API doc comments use ct* (CtConfirm:31,39; CtModal:69,76; CtClipboardUtil:12,50; CtLicense:9) |
| 3a inliner tests | `node --test scripts/tests/` | tests 38, pass 38, fail 0 |
| Rebuild byte-clean | `node scripts/build-all.mjs --check` | Checked 10 tool(s); 0 failed |
| base64-tool | unit `node --test tests/unit/*.test.mjs`; e2e `npx playwright test --config=tests/playwright.config.mjs --workers=1` | unit 53/53; e2e 71 passed |
| uuid-generator | same | unit 58/58; e2e 41 passed |
| No test changes | mtimes | scripts/tests/*.mjs last modified 2026-10-02 23:36 (pre-round). Tool test files (13:10, 13:14) predate builder spawn prompt (13:24:06), i.e. prior round; nothing newer than the spawn prompt under scripts/, src/lib/utils, src/tools except the two index.html |
| Diff scope | `find scripts src/lib/utils src/tools -type f -newer spawn-prompt-builder-r1.md` plus stat | Changed after builder spawn: 4 lib components (13:25:15) + base64-tool/index.html and uuid-generator/index.html (13:25:19) only. Other 7 tools' index.html at 10-02 11:29. project.json 13:07 (pre-spawn). |

Note: git is blocked, so scope was judged by mtimes. Coverage concern (minor): no test pins the ct* global opt-outs or ctThirdParty population directly; the License e2e passes without populating a third-party list. Not a DoD blocker.
