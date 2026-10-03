# HANDOFF r2 — 16-image-dither-pdf (CtDither weight-sensitivity fix)
Test-only. Extended `src/lib/tests/unit/CtDither.test.mjs` (26 -> 33 tests; all prior kept). No src/lib change; no lib bug found (every hand/independent walk matched lib output first run).

## Added cases (hand-walks are in the test comments)
- FS 3x3 gray [192,120,127,130,64,120,192,96,120] -> 101001101 (pins 7/3/5/1 /16)
- FS 3x2 colour (R,G,B,black palette), incl. a clamp 269->255 -> 202121
- Atkinson 3x3 gray [128,192,160,64,140,140,127,160,160] -> 111001110 (pins /8 + taps)
- Atkinson 3x2 colour -> 212013 (also kills tap (1,1)->(2,1), the r1 survivor)
- Bayer default 4x2 near-threshold (offsets 4m-30) -> 11101101 (pins order 4, strength 64, +0.5)
- Bayer m=0 / m=15 strength discriminator (157/99), plus explicit strength 60 flip
- Bayer order 2 strength 128 (off=32m-48) -> 1111, vs strength 64 -> 1001
Oracle: inputs found by an independent sim (tmp/search.mjs, csearch.mjs, no CtDither import) over weight mutants; walks re-derived by hand in comments.

## Mutation-kill proof (scratch copy tmp/r2mut/, real lib untouched)
baseline 33/0. Each mutant -> RED: FS 7->6 (2 fail), 7->9, 3->2, 5->4, 1->2 (2 each); Atkinson /7, /6 (2 each), tap (1,1)->(2,1) (1); BAYER_STRENGTH 100 (1), 60 (2); default order 8 (2), 2 (2); drop +0.5 (3). Before (r1): all of these survived.

## Repro
node --test src/lib/tests/ (1590 tests, 1574 pass, 0 fail, 16 todo); node scripts/build-all.mjs --check (10/10)
