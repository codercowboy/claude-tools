# Verifier r1 v1 verdict — 16-image-dither-pdf (Phase 13a)

## VERDICT: FAIL
Rationale: PDF side and oracle independence are solid, but CtDither's error-diffusion weights are NOT pinned: Floyd–Steinberg coefficient mutations (7/16->6/16 and ->9/16, 3/16, 5/16, 1/16) and Atkinson divisor mutations (/8 -> /7, /6) all survive the 64 tests (the explicitly required mutation (a) and part of (b) survive = hollow tests).

## 1. Re-run
- `node --test src/lib/tests/` : tests 1583, pass 1567, fail 0, todo 16 (matches builder). New files: 64/64 pass.
- `node scripts/build-all.mjs --check`: 10 checked, 0 failed.
- `node scripts/test-all.mjs`: exit 0, "10/10 suites passed" (lib step green; no e2e flake this run).
- No lib source modified: CtDither.mjs / CtImagesToPdf.mjs mtimes Oct 2; only the 2 test files are Oct 4. (git unavailable; mtime + build --check 10/10.) No canvas/DOM used.

## 2. Oracle independence (KEY CHECK) — INDEPENDENT, not lib-sourced
Scratch `tmp/indep.mjs` (does not import CtDither; own error-diffusion loop, own tap tables):
- FS 3x1 g128 -> [1,0,1] ✔; FS 2x2 -> [1,0,0,1] ✔; Atkinson 3x1 -> [1,0,0] ✔; 2x2 -> [1,0,0,1] ✔; 1x3 -> [1,0,0] ✔
- bayerMatrix(4) via recursion AND via independent bit-interleave formula = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] ✔
- bayer 4x2 g128 -> [0,1,0,1,1,0,1,0] ✔; order 2 -> [0,1,1,0] ✔
- Tests assert literal arrays / literal matrices (deepEqual vs literals), not dither(x) vs dither(x). Only self-comparisons are determinism checks.
- PDF: summed literal text lengths myself: header 9+6=15 -> obj1@15, obj2@64 (+49), obj3@121 (+57), obj4@184, obj5@313 — match the xref in output (0..15,64,121,184,313,410). Test's expectedPdf() builds offsets from literal string lengths, whole blob compared to hand-written text. Independent ✔. No wrong-but-self-consistent fixture found.

## 3. Mutation sweep (scratch copies in tmp/verifier-r1-v1/, real lib untouched; script mut.sh). Result = pass/fail count of the 64-test pair
### CtDither
| mutation | result |
|---|---|
| FS 7/16->6/16 (all channels) | SURVIVED (64/0) |
| FS 7/16->9/16 | SURVIVED |
| FS 3/16->2/16, 5/16->4/16, 1/16->2/16 | each SURVIVED |
| Atkinson err/8 -> /7 ; /6 | SURVIVED |
| Atkinson offset (0,2)->(0,3) / (2,0)->(3,0) / (0,1)->(0,0) / (1,0) dup / drop (0,2) / (0,2)->(0,1) / (1,1)->(2,1) | killed (1-2 fails) except (1,1)->(2,1) SURVIVED |
| Manhattan metric | killed |
| tie `<` -> `<=` | killed |
| remove `dist===0` break | survived (equivalent mutant, ignore) |
| bayerMatrix recursion (4v+2->4v+3; 4v+1->4v+0) | killed |
| BAYER_STRENGTH 64->60 / 100 | SURVIVED (0 is killed) |
| bayer drop the +0.5 | SURVIVED |
| bayer default order 4->8 / ->2 | SURVIVED |
| bayer `x % mSize % 2` | SURVIVED |
| bayer denom *2 | killed |
Confirmed survivors are real behaviour changes (FS 7->9 and atkinson /6 differ from original on an 8x8 pseudo-gradient).
Cause: all error-diffusion tests use only gray-128 on <=3 pixel rows, where outcomes are a threshold decision insensitive to the exact weights (e.g. FS 3x1 p1 stays "black" for any weight in a wide range). Bayer tests only use gray-128 where thresholds have wide margin.
Fix hint (for builder): add hand-computed cases where weight changes flip a decision (e.g. a 3x3/4x4 non-128 gray, or palette with exactly-computable errors asserting an intermediate decision; for bayer use gray values near thresholds e.g. 98/99 vs 158 and a test whose default-order result differs from order 8/2, plus a strength!=64 case).

### CtImagesToPdf — all KILLED
header %PDF-1.5, startxref+1, xref `n`->`f`, offset+1, binary-comment byte, /Length+1, Kids numbering, toFixed(3), pdfNumber trim removed, cover<->contain, centring /2->/3 (x and y), box height margin, MM_TO_PT 25.4->25, auto-orientation `>`->`>=`, landscape swap disabled, A4 constant, fit margin 2x, pdfEscape backslash, DEFAULT_QUALITY, pad10 width. 22/22 killed.

## 4. Concerns (beyond the FAIL)
- Equivalent mutant (remove exact-match early break) is untestable by output; fine.
- No test of multi-channel (colour) error diffusion; only gray. Colour palette dithering weights/channel handling unpinned.
- bayer default `order`/`strength` effectively unpinned (see above).

## Reproduction
```
cd "<root>"; node --test src/lib/tests/ ; node scripts/build-all.mjs --check ; node scripts/test-all.mjs
node dev/20261003-library-test/16-image-dither-pdf/tmp/indep.mjs
dev/20261003-library-test/16-image-dither-pdf/tmp/verifier-r1-v1/mut.sh <name> dither|pdf '<perl -0pi expr>'
```
