# Verifier r1 verdict — 01-esm-inliner

## VERDICT: PASS

No repairs made. All mutations ran on a scratch copy (`<scratchpad>/mut2`), never in the repo.

| DoD row | Command / method | Evidence | Result |
|---|---|---|---|
| Strip export / `export {}` / inline relative imports; no line-start export/import; each symbol once | Independent: `buildTool()` on a scratch template with `<<ct:module utils/image/JbcDither.mjs>>`, `utils/JbcZipUtil.mjs`, `components/JbcConfirm.mjs` + `<<ct:lib components/styles/base.css>>` (harness `scratchpad/run.mjs`) | col-0 `export`/`import` lines: 0. `class JbcByteUtil` x1, `function u16le` x1. Body vm.Script-parses. | PASS |
| `./` and `../` resolution (cross-subdir) | same run: Dither (utils/image/) -> ImageUtil -> `../JbcByteUtil.mjs` | banner order: ByteUtil, ImageUtil, Dither, ZipUtil, JbcConfirm | PASS |
| Multi-importer dep emitted once, deps first | same run: ByteUtil is a dep of ImageUtil, Dither, Zip | exactly one `const __ct_utils_JbcByteUtil` (line 3), before all dependents | PASS |
| Resolves across utils/, components/, components/styles/ | same run (mjs from utils, utils/image, components; css via ct:lib); suite T5/T5b/T6/H17 | built OK, no leftover tokens | PASS |
| export default fails loud | libDir fixture with `export default 1;` | `ESM inliner: utils/X.mjs:1: unsupported construct: export default` | PASS |
| ADDITIVE, 9 tools byte-identical | `node scripts/build-all.mjs --check` | 10 lines "up to date", `Checked 10 tool(s); 0 failed.`, exit 0 | PASS |
| Own node:test suite green | `node --test scripts/tests/` | tests 38, pass 38, fail 0 | PASS |
| Only `scripts/` touched | git blocked; `find src -type f` sorted by mtime vs plan.md (17:28): newest src file 17:00 (`test-results/.last-run.json`, from earlier e2e phase); newest `src/lib` file 12:38. `grep -rl "ct:module\|ct:lib" src --include=*.html` -> none (no tool ported). scripts/: `build-tool.mjs` 18:32, `tests/` (2 files) 18:32/18:37 | Nothing under src/ modified after the plan; only build-tool.mjs + scripts/tests/ are new/changed in this round. (Other `scripts/*.mjs` have older mtimes, 11:29-16:36, i.e. prior phases, not this round.) | PASS |

## Test non-vacuity (spot-verify of test-writer's claim)
- Counts: 46 + 55 `assert*` lines across the two files; hardening file executes bundles (H1/H2/H4/H9/H17 in vm) per the HANDOFF.
- Mutation spot-check on scratch copy of `scripts/` (src symlinked), 3 of the claimed 26:
  - dedup lookup disabled (`const known = undefined;`, line 215) -> 8 fail / 30 pass (killed)
  - `export default` detection disabled (line 189) -> 2 fail (killed)
  - `export ` strip on functions disabled (line 180) -> 8 fail (killed)
- Claim confirmed: the suite is not vacuous. The 26-mutation claim was only sampled (3), not fully reproduced.

## Notes (non-blocking)
- `components/*.mjs` are only syntax-checked in tests (need DOM); accepted limit, as the test-writer noted.
- `slice-tool.mjs` on a `ct:module` template was not exercised (R6; not a DoD row).
- Mtime-based scope check is weaker than a git diff; no contradicting evidence found.
