# Plan — 16-image-dither-pdf (Phase 13a: CtDither + CtImagesToPdf)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 1 of 2 of the final P13 split. THIS round = **CtDither** (`src/lib/utils/image/CtDither.mjs`, 160
lines) + **CtImagesToPdf** (`src/lib/utils/image/CtImagesToPdf.mjs`, 382 lines). (13b = CtImageUtil pure
helpers.) Both are pure/DOM-free.
- **CtDither** (5 exports): `nearestColorIndex(r,g,b,palette)` → index (squared-RGB distance, FIRST match
  on tie, early-break on exact); `floydSteinberg(rgba,w,h,palette)` → Uint8Array indices (err 7/3/5/1÷16);
  `atkinson(rgba,w,h,palette)` → Uint8Array (6 neighbours × 1/8); `bayerMatrix(order)` → recursive threshold
  matrix (base `[[0,2],[3,1]]`, power-of-2); `bayer(rgba,w,h,palette,opts{order=4,strength=64})` → Uint8Array.
  palette = `[[r,g,b],…]`; rgba = flat RGBA byte array.
- **CtImagesToPdf** (22 exports): pure helpers + constants + the PDF-1.4 writer. `buildPdf`/`assemblePdf`
  take image bytes → PDF bytes. Full spec: `dev/20261003-library-test/p13-image-pure/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| nearestColorIndex correct | `src/lib/tests/unit/CtDither.test.mjs` | closest entry by squared RGB; exact tie → FIRST index; grayscale + RGB cases; exact match early-break |
| bayerMatrix known | same file | `bayerMatrix(2)`=`[[0,2],[3,1]]`; `bayerMatrix(4)` exact 4×4; recursion/values; order≤1→`[[0]]` |
| error-diffusion hand-computed | same file | `floydSteinberg` + `atkinson` on a TINY RGBA buffer (e.g. 2×2 / 3×1) with a 2-colour palette → EXACT hand-derived index array (not determinism-only) |
| bayer deterministic+known | same file | `bayer` on a tiny buffer (order 4, strength 64) → exact index array; determinism (same in→same out) |
| CtImagesToPdf helpers exact | `src/lib/tests/unit/CtImagesToPdf.test.mjs` | mmToPt/ptToMm, pdfNumber, pdfEscapeString, pad10, strToBytes, clampQuality, percent↔quality, formatBytes, applyOrientation, orientedPageSize, computePlacement, planPages + constants (MM_TO_PT/PT_PER_PX/PAGE_SIZES_PT/DEFAULT_QUALITY) |
| PDF byte structure | same file | `buildPdf`(fixed tiny image bytes) → `%PDF-1.4` header, `%%EOF` trailer, xref table, correct object count, page + MediaBox, embedded image stream present |
| PDF determinism | same file | same input → byte-identical output (assert exact length + key offsets/markers) |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the two new test files added; build-all 10/10 confirms |

## Task / method
Read both modules FIRST — CtDither (all 5 fns, the exact error-diffusion coefficients + traversal order)
and CtImagesToPdf (helper signatures, the buildPdf/assemblePdf output shape, how the image stream is
embedded). Assert the ACTUAL output. Then:
1. **CtDither** — `nearestColorIndex` cases incl the tie→first rule; `bayerMatrix(2/4/8)` exact; HAND-COMPUTE
   `floydSteinberg` and `atkinson` on a 2×2 (and/or 3×1) RGBA buffer with a tiny palette (e.g. black/white)
   — walk the error-diffusion by hand and pin the exact index Uint8Array; `bayer` exact on a tiny buffer +
   determinism. (Adapt dither-studio's `png.test.mjs` vectors if they apply.)
2. **CtImagesToPdf** — each pure helper/const asserted exactly; `buildPdf` on a FIXED tiny image (e.g. a
   known 1×1 JPEG/PNG byte array) → assert the structural markers (%PDF-1.4, xref, object count, MediaBox,
   stream) AND byte-for-byte determinism (exact length + a couple of exact slices). Don't assert the whole
   blob if brittle — pin length + markers + a determinism re-run equality.
No canvas/DOM is needed; if any function can't be isolated from canvas, DEFER it + surface (don't fake a
canvas). A wrong-but-deterministic output is the risk → HAND-COMPUTE the dither/PDF, don't trust the lib's
own output as the oracle. A genuine algorithm/PDF bug → STOP and surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p13-image-pure/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/image/CtDither.mjs` + `src/lib/utils/image/CtImagesToPdf.mjs` — the modules under test.
- (optional) `../claude-tools-dev/src/tools/dither-studio/tests/unit/png.test.mjs` — vectors to adapt if relevant.

## Deliverables
- `src/lib/tests/unit/CtDither.test.mjs` + `src/lib/tests/unit/CtImagesToPdf.test.mjs`.
- `findings/HANDOFF.md` — per-module export inventory → tested; the dither hand-computations shown; the PDF
  structural markers asserted; the test count; command outputs; confirmation NO canvas/DOM was needed; what
  remains for 13b (CtImageUtil pure helpers); and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. HAND-COMPUTE dither + PDF expectations (don't use the
  lib's own output as the oracle). A genuine algorithm/PDF bug is STOP-and-surface.
- Cover CtDither + CtImagesToPdf ONLY. Do NOT test CtImageUtil (13b owns it).
- Write only the two named test files (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the per-module
inventory, show the dither hand-computations + the PDF markers asserted, confirm no canvas/DOM was needed,
flag any suspected bug, and note what remains for 13b. Write it to `findings/HANDOFF.md`.
