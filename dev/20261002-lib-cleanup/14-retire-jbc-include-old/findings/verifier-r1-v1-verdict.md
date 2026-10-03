# Verifier r1 v1 verdict — 14-retire-jbc-include-old: PASS

This verdict closes the lib-cleanup epic. Nothing was edited, moved or re-run-to-green; checks only.

| DoD row | Command | Result |
|---|---|---|
| Retired (moved) | `ls src/lib/jbc-include-old` | "No such file or directory" |
| | `ls tmp/safe-to-delete/jbc-include-old` | base.css confirm.js controls.css copy.js crc32.js footer.html gallery.css license.js readme-footer.md util.js (10 files) |
| Toolchain honest | `grep -rnE "jbc-include-old" scripts/` | no matches (rc=1) |
| | read build-tool.mjs / slice-tool.mjs | `resolveIncludeDir` returns `$JC_INCLUDE_DIR` or null (no default path); `<<ct:include>>` is marked LEGACY/RETIRED and throws a clear error with no include dir. TOKEN_RE, ct:inline, ct:lib/ct:module and project-token code untouched; the 10/10 build and the 38/38 tests (incl. T9 byte-identical, T9c) prove it. slice-tool prints a retired message and exits 1 without an include dir. |
| No stragglers | `grep -rnE "jbc-include\|jbcUtil\|jbcCrc32\|ctCopy\b\|ctFlash\b\|ctConfirm\b" src/tools src/gallery scripts` | Every hit is a `*`/`//` comment, DESIGN/PLAN/TESTS.md prose, or a test-comment string. I inspected qr-generator index.html (409, 627-628, 1213, 1640, 1786, 1816, 2835, 3181-3211) and inflation-calculator index.html:594 and DESIGN.md:141: all historical. No live code or import. The builder's list was incomplete: the same kind of historical comment also sits in uuid-generator/index.html, color-designer/index.html, `*/source/app.mjs`, `*/PLAN.md`, `*/DESIGN.md`, `tests/TESTS.md` and two e2e test comments (`ctFlash`/`ctConfirm` in comments). These are all non-live. Optional #1001 tidy. |
| Green | `node scripts/build-all.mjs --check` | 10 tools, 0 failed (gallery + 9 tools all "up to date") |
| | `node scripts/test-all.mjs` | EXIT 0, "9/9 suites passed." (serial; uuid-generator 41 passed in the tail) |
| | `node --test scripts/tests` | tests 38, pass 38, fail 0 |
| #1011 README | read scripts/README.md; compared with the repo | Verified true: the scripts table matches `ls scripts` (ct, build-tool, build-all, build-preview-gif, test-all, install-all, serve, new-tool, validate-project, slice-tool, tests/). `ct` verbs (build/test/serve/run/install) match ct.mjs. npm scripts (build, build:check, test:all, install:all, serve, postinstall) and `bin: ct` match package.json. `src/lib/new-tool-template/` exists. `$JC_BUILD_ROOTS` default `src/tools`, `$PORT` / 8080, `.claude/jason-code/project.json` then `project.json`, and `docs/images/tools-preview.gif` all match the code or disk. No stale jason-code layout in the README. The one `jason-code` mention is the real project.json search path in build-tool.mjs. |
| DOC voice | read-through | Plain, factual, terse. No LLM-isms found. Minor: the `<-` arrows and the "n/a" in the slice-tool row are fine. Nothing to flag. |
| Scope | mtimes (git blocked) | Files modified in this round: scripts/build-tool.mjs, slice-tool.mjs, README.md (16:50), src/lib dir mtime 16:47 (the move). `src/lib/utils` last 14:26 and `src/lib/components` 13:25. project.json 13:07. Tool index.html 14:28 or earlier. src/gallery index.html/template at 16:42-16:43 predate the move and belong to the preceding gallery round; no `ct:include` remains there. `test-results/.last-run.json` files are Playwright run artifacts. No tool source, utils, components or project.json edits attributable to this round. Caveat: mtimes cannot prove who made the 16:42 gallery edits. |

## Notes (non-blocking)
- `.claude/jason-code/project.json` and `$JC_INCLUDE_DIR` legacy references remain intentionally.
- docs/technical.md stale jbc-include content stays a #1001 follow-up, as the builder noted.
