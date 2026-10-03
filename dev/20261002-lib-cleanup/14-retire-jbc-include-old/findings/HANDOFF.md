# HANDOFF — 14-retire-jbc-include-old r1 (epic final round): PASS

## Preconditions
`grep -rnE "<<ct:include " src --include="*.html" --include="*.template.html" | grep -v "jbc-include-old/"` was empty before the move.

## Move
`src/lib/jbc-include-old` -> `tmp/safe-to-delete/jbc-include-old/` (10 files). `src/lib/jbc-include-old` no longer exists. (`tmp/safe-to-delete/` already held `misc`, `test-support-old`.)

## build-tool.mjs / slice-tool.mjs — MARKED LEGACY (not ripped out)
- build-tool: `resolveIncludeDir` no longer has a default path; returns `$JC_INCLUDE_DIR` if set, else `null`. `<<ct:include>>` with no include dir now throws a clear "retired, use <<ct:lib>>/<<ct:module>>" error. TOKEN_RE, the `includeDir` injection seam and the `<<ct:inline>>` path are untouched (the scripts/tests inject `includeDir`, and the T9c test covers it). Header comment + CONFIG KNOBS updated. Dropped unused `existsSync` import.
- slice-tool: comment updated; if `resolveIncludeDir` is null it prints a retired message and exits 1 (it is a dead migration aid).
- Why not rip out: minimal and safe; the seam is test-covered and the ct:module/lib/project-token code is untouched.

## scripts/README.md (#1011)
Rewritten to the actual layout: added `ct.mjs`, `build-preview-gif.mjs`, `tests/`; fixed `<<jbc:...>>` to `<<ct:inline|module|lib>>`; template path now `src/lib/new-tool-template/`; removed the false `.claude/jason-code/assets` / `assets` include-dir search; documented build-all covering the gallery; slice-tool marked legacy; `$JC_INCLUDE_DIR` documented as legacy. Verified against script headers, `ct.mjs` and `package.json`.

## Straggler grep
`grep -rnE "jbc-include-old" scripts` -> empty. Broad grep (`jbc-include|jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm`) over src/tools src/gallery scripts: no live code. Remaining hits are historical comments only (in tool source HTML comments and `src/tools/inflation-calculator/DESIGN.md:141`):
- `src/tools/qr-generator/index.html` ~L409, 627-628, 1213, 1640, 1786, 1816, 2835 (comments referencing old `jbc-include/...` paths / `ctConfirm`)
- `src/tools/inflation-calculator/index.html` L594 (comment)
- `src/tools/inflation-calculator/DESIGN.md` L141 (prose)
I did not edit tool sources (out of boundary).

## Sweep
- `node scripts/build-all.mjs --check` -> 10/10 up to date, 0 failed.
- `node scripts/test-all.mjs` -> 9/9 suites passed (EXIT 0; log in `tmp/test-all.out`).
- `node --test scripts/tests` -> 38/38 pass.
- `slice-tool --dir=...` -> exits 1 with the retired message (expected).

## #1001 follow-ups (NOT fixed)
- `docs/technical.md` has stale `jbc-include` content at L13, 19, 55, 57, 59, 67, 74, 90, 115, 117 (still describes `src/tools/jbc-include/`, `INCLUDE_DIR`, `<<ct:include>>`), and L169 matched the grep too (check it).
- Build-tool/validate-project header comments reference `docs/conventions.md`, which does not exist in this repo.
- Possible tidy: the stale historical comments listed above in qr-generator / inflation-calculator.

Status: PASS, nothing remaining for this round. No commits made.

## Verifier round (r1)
PASS. Independently reproduced the retire, toolchain cleanup, build-all --check 10/10, test-all 9/9, node --test 38/38, README spot-checks, and scope. Full evidence: `findings/verifier-r1-v1-verdict.md`. Extra historical-comment stragglers beyond the builder list (uuid-generator, color-designer, source/app.mjs, PLAN/DESIGN/TESTS.md): all non-live; optional #1001 tidy.
