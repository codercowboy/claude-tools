# Verifier r1 verdict — 02-jbc-to-ct

**VERDICT: PASS**

| DoD row | Command | Evidence |
|---|---|---|
| Lib identity renamed | `grep -rnP "Jbc\|jbcc\|data-jbc\|jbc-(?!include)" src/lib/utils src/lib/components` | no matches (rc=1) |
| No `Jbc*` files; 20 Ct | `find src -name 'Jbc*'`; `find src/lib/utils src/lib/components -name 'Ct*.mjs' \| wc -l` | none; 20 |
| Every util imports | node `await import()` over every `src/lib/utils/**/Ct*.mjs` | no MODULE_NOT_FOUND |
| Tests green | `node --test scripts/tests/` | tests 38, pass 38, fail 0 |
| Tools unaffected | `node scripts/build-all.mjs --check` | "Checked 10 tool(s); 0 failed." all up to date |
| jbc-include preserved | `grep -rn "jbc-include" src/lib`; `ls src/lib/jbc-include-old` | present in PROVENANCE.md (lines 18,232,253,282,300,352,388,411,462,481), CtUtil/CtByteUtil/CtConfirm/CtComponents/CtModal/CtClipboardUtil JSDoc; jbc-include-old has 10 files intact |
| Inliner on renamed modules | scratch script (scratchpad v.mjs) calling `bundleModule('utils/CtByteUtil.mjs')`, `utils/image/CtDither.mjs`, `components/CtConfirm.mjs` | all parse via `new Function`; no line-start export/import survives |
| Scope | mtime newer than plan.md, excluding dev/.claude/tmp | changed: src/lib/utils/**, src/lib/components/** (incl. styles, footer.html, readme-footer.md), scripts/tests/esm-inline*.test.mjs, scripts/build-tool.mjs, src/lib/test-support/{interaction,shared-ui}.mjs. NO src/tools/**, src/gallery, jbc-include-old |
| Tests not gutted | read references | 38 tests; only names differ (Ct filenames, `__ct_utils_CtByteUtil`, `__ct_utils_image_CtDither`); assertion counts 49 + 56 consistent; same structure |

## Flags (non-blocking)
- `src/lib/test-support/{interaction,shared-ui}.mjs` edits are outside plan scope (plan said leave them); comment-only per HANDOFF, gates unaffected. I could not diff them (git blocked); comment-only is unverified beyond tests/--check passing.
- `build-tool.mjs` mtime changed; plan allows a header-comment edit. Not diffed; `--check` 10/10 and tests pass.
- Hybrid `jbc-include/CtByteUtil.mjs` JSDoc strings are a consequence of the spec; acceptable.
- Verifier did not edit anything outside this folder.
