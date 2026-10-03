# Verifier r2 v1 verdict — 16-image-dither-pdf (CtDither re-verify)

**VERDICT: PASS** — the r1 weight-pinning gap is closed: all six r1-surviving mutants now turn the suite RED, the new literals are independently correct, no regression, no lib source edit.

## 1. Re-run
- `node --test src/lib/tests/` : tests 1590, pass 1574, fail 0, todo 16 (matches fixer). The "failing tests" block in spec output is the 16 todo entries (CtPretty.sql-js), not failures; tap reporter confirms `# fail 0`.
- CtDither.test.mjs: 33/33. CtImagesToPdf.test.mjs: 38/38.
- `node scripts/build-all.mjs --check`: 10/10 up to date, 0 failed.

## 2. Mutation closure (scratch copy tmp/r2v1mut/, real lib untouched; control no-op = 33/0 green)
| Mutant | Result |
|---|---|
| FS 7/16 -> 6/16 | RED (2 fail) |
| FS 3/16 -> 2/16 | RED (2 fail) |
| Atkinson /8 -> /7 | RED (2 fail) |
| BAYER_STRENGTH 64 -> 100 | RED (1 fail) |
| default bayer order 4 -> 8 | RED (2 fail) |
| drop +0.5 | RED (3 fail) |
All six (survivors in r1) now kill >=1 test. Scratch file restored; diff vs real lib identical.

## 3. Independent oracle (tmp/r2v1-oracle.mjs, does NOT import CtDither; own FS/Atkinson/Bayer sim, literal 4x4 Bayer matrix)
Matches the asserted literals exactly: FS 3x3 gray -> 101001101; FS 3x2 colour -> 202121; Atkinson 3x3 -> 111001110; Atkinson 3x2 colour -> 212013; Bayer default 4x2 near-threshold -> 11101101; Bayer order2 s128 -> 1111 (s64 -> 1001); Bayer extremes s64 -> (0,1), s60 -> (1,0). The colour cases assert literal arrays (`[2,0,2,1,2,1]`, `[2,1,2,0,1,3]`), not lib-sourced values. No wrong-but-self-consistent fixture found.

## 4. No regression / no lib edit
Original 26 tests retained and green; CtImagesToPdf 38 pass. `git` not used; mtimes: CtDither.mjs, CtImagesToPdf.mjs, CtImageUtil.mjs all Oct 2 (untouched); only CtDither.test.mjs modified (Oct 4 00:54). Other recent src/lib/tests mtimes belong to sibling phases. build-all 10/10.

## Residual concerns (not FAIL)
- Mutants only checked at the weights/constants listed; mutants such as FS tap-position swaps (e.g. 3/16 to the wrong neighbour) are not individually proven (fixer claims some; Atkinson tap (1,1)->(2,1) covered per fixer, not re-run by me).
- Bayer order 8 / matrix beyond 4 only indirectly covered.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/ ; node --test --test-reporter=tap src/lib/tests/
node scripts/build-all.mjs --check
node dev/20261003-library-test/16-image-dither-pdf/tmp/r2v1mut/run.mjs dev/20261003-library-test/16-image-dither-pdf/tmp/r2v1mut
node dev/20261003-library-test/16-image-dither-pdf/tmp/r2v1-oracle.mjs
```
