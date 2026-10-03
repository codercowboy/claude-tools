# Verifier r1 verdict — 07-port-inflation-calculator: PASS

Independent run; nothing edited (verdict-not-repair). Run from tool dir for tests.

| DoD row | Command | Evidence | Result |
|---|---|---|---|
| Consumes ct lib | `grep -nE "<<ct:" source/index.template.html` | lib base.css/controls.css, footer.html; `ct:module` CtClipboardUtil.mjs + CtLicense.mjs; `ct:inline` cpi-data.json + app.mjs kept; no `ct:include` | PASS |
| Globals gone | `grep -rnE "jbcUtil\|ctCopy\|ctFlash\|__ctCopySync\|<<ct:include (copy)\.js>>" source tests` | no matches (rc=1). Whole-tool grep hits only inlined lib `ctCopyStyles` (CtModal/CtLicense opt-out, not a tool symbol) and stale docs DESIGN.md/PLAN.md prose; outside plan scope (source/) | PASS |
| Footer License wired | built index.html counts | `data-ct-license` x3, `CtLicense\|openLicense` x10, `__INFLATION_CPI__` x3; no unsubstituted `<<`/`{{}}` tokens | PASS |
| License e2e delta | read tests/*.e2e.mjs:412 | test now "footer License link opens the modal": clicks footer-license-link, asserts license-modal visible + contains 'MIT License'. Same intent, not deleted; test count 27 | PASS |
| Deterministic build | `node scripts/build-tool.mjs --dir=...`; `build-all --check` | built ok; "Checked 10 tool(s); 0 failed." | PASS |
| Behavior preserved | `node --test tests/unit/*.test.mjs`; `npx playwright test --config=tests/playwright.config.mjs --workers=1` | unit 33/33 pass; e2e 27 passed | PASS |
| Scope | mtime sweep (git blocked) | only inflation-calculator files newer than 14:28 (builder start ~14:33); src/lib latest 14:26 (CtByteUtil), qr-generator 14:28 — prior rounds; scripts/project.json untouched this round | PASS |

Caveat: scope by mtime cannot rule out a byte-identical rewrite; no contradicting evidence.
Note (non-blocking): builder also renamed tool-local `__ctCopySync` -> `__copySync` (declared in HANDOFF); tests green.
