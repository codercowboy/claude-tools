# Pre-task receipt — Phase 13a · image (CtDither + CtImagesToPdf)

Pre-task — ship round: CtDither + CtImagesToPdf unit tests (p13-image-pure/PRD.md; sub-round 1 of 2 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p13 PRD (this sub-round = CtDither + CtImagesToPdf): two test files green.
   CtDither.test.mjs: nearestColorIndex (closest palette entry — exact ties pick FIRST, grayscale, squared
   RGB distance, early-break on exact); bayerMatrix(2/4/8) known matrices + recursion; floydSteinberg /
   atkinson / bayer on TINY known RGBA buffers → HAND-COMPUTED deterministic index output (FS 7/3/5/1÷16;
   atkinson 6×1/8; bayer order=4 strength=64); determinism (same input→same output). Signatures:
   nearestColorIndex(r,g,b,palette), {fn}(rgba,w,h,palette[,opts]) → Uint8Array of indices; palette=[[r,g,b]].
   CtImagesToPdf.test.mjs: pure helpers (mmToPt/ptToMm/pdfNumber/pdfEscapeString/pad10/strToBytes/
   clampQuality/percentToQuality/qualityToPercent/formatBytes/applyOrientation/orientedPageSize/
   computePlacement/planPages) + constants (MM_TO_PT/PT_PER_PX/PAGE_SIZES_PT/DEFAULT_QUALITY) exact;
   buildPdf/assemblePdf: image bytes → PDF bytes — assert %PDF-1.4 header, %%EOF, xref table, object count,
   page/MediaBox, embedded image stream present, byte-for-byte DETERMINISM for a fixed input (known length/
   markers). test-all + build-all 10/10; handoff per-module export inventory → tested, confirm NO canvas/DOM.
③ Paths — in: p13 PRD · src/lib/utils/image/CtDither.mjs (read) · src/lib/utils/image/CtImagesToPdf.mjs
   (read) · out: src/lib/tests/unit/CtDither.test.mjs + src/lib/tests/unit/CtImagesToPdf.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Dither needs HAND/REFERENCE-computed small outputs (not
just determinism — pin exact index arrays). PDF needs byte-structure + determinism (exact length + key
markers for a fixed tiny image). Port/adapt dither-studio's png.test.mjs vectors if relevant. A wrong-but-
deterministic output a self-consistent test would pass is the risk → hand-compute. No canvas/DOM needed;
if a function can't be isolated from canvas, DEFER it + surface. A genuine algorithm/PDF bug → STOP and
surface. No lib edits. Cover CtDither + CtImagesToPdf ONLY (CtImageUtil pure helpers = 13b).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P13 split into 13a/13b is the orchestrator's Gate-A call, which the p13 PRD explicitly endorses.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
