# 03-pilot-base64-port HANDOFF (r1)

STATUS: PARTIAL PASS. Port done and behavior-green; ONE blocker needs a shared-file fix (repo-root project.json).

## Blocker (pilot discovery) - footer tokens
- `<<ct:lib components/footer.html>>` is verbatim, BUT `{{project.*}}` substitution runs AFTER lib/module expansion
  (build-tool.mjs applyProjectTokens), so the footer IS substituted - provided a project.json exists.
- No project.json exists in the repo (searched `.claude/jason-code/project.json`, `project.json`). The OLD footer hardcoded
  the URL, so nothing needed it until now. Result: build warns and leaves `{{project.repo}}/name/repoLabel` unsubstituted in
  the footer AND in CtLicense.mjs (`LICENSE_REPO`, license body `{{project.name}}`). Every tool carrying the new footer/CtLicense hits this (3e).
- Fix (outside my boundary, NOT made): add repo-root `project.json`:
  `{"name":"claude-tools","repo":"https://github.com/codercowboy/claude-tools","tagline":"<tbd>"}`
  (values = what the old footer hardcoded). No build/lib change needed.
- To verify without writing it, I built base64 via `buildTool(dir,{project:{...}})` and wrote that into
  `src/tools/base64-tool/index.html`. Shipped index.html therefore has 0 `{{project` tokens. A plain `build-tool` run
  WITHOUT project.json would regress it to unsubstituted, and `build-all --check` currently reports base64 stale.
  After project.json lands, rebuild/check should be byte-identical (not re-verified).

## Recipe (for 3e)
Template `source/index.template.html`:
- CSS: `<<ct:include base.css>><<ct:include controls.css>>` -> `<<ct:lib components/styles/base.css>><<ct:lib components/styles/controls.css>>`
- Footer: `<<ct:include footer.html>>` -> `<<ct:lib components/footer.html>>`
- Delete the two classic `<script><<ct:include copy.js/util.js>></script>` blocks.
- In the app's `<script type="module">`, ABOVE `<<ct:inline app.mjs>>`:
  `<<ct:module components/CtClipboardUtil.mjs>>`, `<<ct:module utils/CtUtil.mjs>>`, `<<ct:module components/CtLicense.mjs>>`
  (only modules whose names the tool uses; CtLicense is import-for-side-effect and self-wires `[data-ct-license]`).
app.mjs: `jbcUtil.debounce`->`debounce` (delete the `const debounce = jbcUtil.debounce` alias - after rename it is a TDZ self-reference),
`jbcUtil.downloadBlob`->`downloadBlob`, `await ctCopy(`->`await copy(`, `ctFlash(`->`flash(`. Also rename `__ctCopySync`
(the gate grep `ctCopy` matches it) -> `__copySync`; update stale comments.
Build CLI: `node scripts/build-tool.mjs --dir=src/tools/base64-tool` (NOT a positional path - positional silently uses cwd and errors).
Package scripts' `pretest:*` run `build --check`, so they fail until project.json exists; run `node --test tests/unit/*.test.mjs` and `npx playwright test --config=tests/playwright.config.mjs` directly.

## formatBytes finding
base64-tool never used `jbcUtil.formatBytes`; it has its own pure local `formatBytes` in logic.mjs (already new format, unit-tested via loadLogic).
I kept it and did NOT import `utils/CtByteUtil.mjs` (would inline ~585 unused lines, and the `formatBytes` const would collide with logic.mjs's). No behavior change; output "1.5 KB" style. Possible later dedupe; not needed.
3e: check each tool for local-vs-lib duplicates before importing.

## Test deltas
None. License e2e (2 tests) passes unchanged (only its stale comment mentions old paths). slice-tool.mjs not exercised.

## Gates
- grep `jbcUtil|ctCopy|ctFlash` over source: no matches.
- build-tool --dir: builds clean (with project.json warning).
- unit: 53/53 pass. e2e serial (workers:1 untouched): 71/71 pass (run on index.html with identity injected).
- build-all --check: 9/10 - the 1 failure is base64 (stale vs. the no-project.json build), other 9 up to date. Expected 10/10 once project.json exists.
- No tool-feedback needing inliner workarounds; ct:module/ct:lib worked first time.

## Verifier round (r1)
Verdict: PASS (see findings/verifier-r1-v1-verdict.md). Reproduced: old-symbol grep clean; rebuild byte-identical; build-all --check 10/10; unit 53/53; serial e2e 71/71; footer License wired, 0 unsubstituted {{project tokens; project.json present; formatBytes "1.5 KB"; builder scope limited to base64-tool. Concerns: no mutation test run; stale e2e comment; slice-tool unexercised.
