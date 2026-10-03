# Verifier r1 v1 verdict — 10-port-color-picker: PASS

Method: all commands run from project root (tool dir for tests); nothing edited. (build-tool regenerated color-picker/index.html deterministically as required by the check.)

| DoD row | Evidence | Result |
|---|---|---|
| Smoke-check | `present: true` / `errors(0)` (provided node/playwright command) | PASS |
| Old includes/globals gone | `grep -rnE "jbcUtil\|ctCopy\|ctFlash\|ctConfirm\|<<ct:include (confirm\|copy)\.js>>" source` -> no matches (rc=1) | PASS |
| Template modules | template lines 14,96,100-102: ct:lib base.css/controls.css/footer.html; ct:module CtConfirm, CtClipboardUtil, CtLicense only; built index.html has 0 CtUtil/CtByteUtil modules | PASS |
| Local clamp kept | `source/app.mjs:149: function clamp(v, min, max)` | PASS |
| License wired | built html: 3x `data-ct-license`, CtLicense + `openLicense` inlined; no `{{..}}`, `<<ct:..>>`, `__X__` tokens | PASS |
| Build deterministic | build-tool OK; `build-all --check`: Checked 10 tool(s); 0 failed | PASS |
| Unit | 7 tests, 7 pass, 0 fail | PASS |
| E2E serial | `npx playwright test --config=tests/playwright.config.mjs --workers=1` -> 92 passed (incl. 2 License modal tests) | PASS |
| No test changes | `find tests -newer plan.md` -> empty | PASS |
| Scope | files newer than plan.md under src/scripts/project.json: only color-picker index.html, styles.css, app.mjs, index.template.html | PASS |

Concerns: playwright config has no explicit `workers` setting (I forced --workers=1). No mutation testing performed (not requested beyond DoD); License modal is covered by 2 e2e tests.
