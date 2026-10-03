# Verifier r1 v1 verdict — 06-port-qr-generator — **PASS**

Independent re-run; nothing edited. (Run unit/e2e from src/tools/qr-generator: there is no root `tests/` dir; tests live in the tool.)

| DoD row | Command | Result |
|---|---|---|
| Template uses lib | `grep -n "ct:" source/index.template.html` | `ct:lib` base.css, controls.css, footer.html; `ct:module` CtByteUtil, CtUtil, CtClipboardUtil, CtConfirm, CtLicense; no `ct:include`. PASS |
| Old globals gone | `grep -rnE "jbcUtil\|jbcCrc32\|ctCopy\|ctFlash\|ctConfirm\|<<ct:include (copy\|crc32\|util)\.js>>" src/tools/qr-generator` | Code: none. Only prose/comments (PLAN.md, TESTS.md, styles.css:265, e2e:700 comment "ctFlash swapped the label") and lib's unrelated `ctCopyStyles` in built html. `const crc32 = jbcCrc32` absent; crc32 is the inlined function (index.html:675). PASS |
| License wired | built html | footer `<button ... data-ct-license data-testid="footer-license-link">`; CtLicense inlined, `openLicense` present; no `{{...}}` / `<<ct:` tokens left. PASS |
| License e2e same intent | read e2e 1128-1182 | Only comments changed (no window.ctLicense code ref); assertions intact: footer link opens modal, MIT text, close-X, "100% vanilla" note (no ctThirdParty set in this tool, as expected). PASS |
| Deterministic build | `node scripts/build-tool.mjs --dir="src/tools/qr-generator"`; `node scripts/build-all.mjs --check` | built 139730 chars; "Checked 10 tool(s); 0 failed." PASS |
| crypto.randomUUID | `grep -nE "crypto\.randomUUID" index.html src/lib/utils/CtByteUtil.mjs` | no matches (rc=1); lib comment :534 reworded, meaning kept; `src/lib/utils/PROVENANCE.md:92` still documents the rule. PASS |
| scripts guard | `node --test scripts/tests/` | 38/38 pass. PASS |
| Unit | `node --test tests/unit/*.test.mjs` (in tool dir) | 61/61. PASS |
| E2E serial | `npx playwright test --config=tests/playwright.config.mjs --workers=1` | 76 passed (incl. conventions compliance randomUUID test). PASS |
| Scope | find -newer builder spawn prompt (excl dev/tmp/.claude) | Changed: qr-generator index.html, source/app.mjs, source/index.template.html, tests/qr-generator.e2e.mjs; plus src/lib/utils/CtByteUtil.mjs (orchestrator's expected comment reword). project.json older than spawn. No other tool/lib/scripts edits. PASS |

Concerns (non-blocking): the plan's expected ctThirdParty-list assertion does not exist in this tool's e2e (it asserts vanilla note), so Phase-05 list rendering is not validated here. Mutation testing not performed. CtByteUtil inlined whole (585 lines) for crc32, as accepted by plan.
