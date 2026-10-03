# HANDOFF — 16-image-dither-pdf (Phase 13a, builder r1)

## Landed
- `src/lib/tests/unit/CtDither.test.mjs` — 26 tests
- `src/lib/tests/unit/CtImagesToPdf.test.mjs` — 38 tests
- No src/lib source touched. No canvas/DOM needed or faked.

## Gate
- `node --test src/lib/tests/` -> tests 1583, pass 1567, fail 0 (two new files: 64/64)
- `node scripts/build-all.mjs --check` -> Checked 10 tool(s); 0 failed (10/10)

## Inventory -> tested
CtDither (5/5): nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer.
CtImagesToPdf (21 exports incl. buildContentStream; all tested): MM_TO_PT, PT_PER_PX, PAGE_SIZES_PT,
DEFAULT_QUALITY, mmToPt, ptToMm, pdfNumber, pdfEscapeString, pad10, strToBytes, clampQuality,
percentToQuality, qualityToPercent, formatBytes (re-export), applyOrientation, orientedPageSize,
computePlacement, buildContentStream, planPages, assemblePdf, buildPdf.

## Dither hand-computations (B/W palette; white iff g > 127.5; clampByte truncates)
- FS 3x1 g128: p0 W err -127 -> p1 128-55.5625=72.4375->72 B err 72 -> p2 128+31.5=159.5->159 W => [1,0,1]
- FS 2x2 g128: p00 W; p10 72.4375 B; p01 88.3125+13.5=101.8125 B; p11 120.0625+22.5+44.1875=186.75 W => [1,0,0,1]
- Atkinson 3x1 g128: p0 W err -15.875; p1 112.125 B err 14; p2 112.125+14=126.125 B => [1,0,0] (differs from FS)
- Atkinson 2x2 g128 => [1,0,0,1]; 1x3 column => [1,0,0]
- bayerMatrix(4) = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]; bayer order4/str64 off=4m-30:
  4x2 g128 => [0,1,0,1,1,0,1,0]; order 2 off=16m-24 2x2 => [0,1,1,0]
All hand predictions matched the lib on first run (no bug).

## PDF markers asserted
Hand-written full expected layout for 1 image (fit, 100x50, margin 0, title "T(x)", bytes FF D8 FF D9):
`%PDF-1.4\n`, binary comment bytes 25 E2 E3 CF D3 0A, 6 objects (3+3N), `/MediaBox [0 0 100 50]`,
content stream (47 bytes) `q\n0 0 100 50 re W n\n100 0 0 50 0 0 cm\n/Im0 Do\nQ`, image XObject
`/Filter /DCTDecode /Length 4` with raw bytes, xref `0 7` (20-byte entries, each offset verified to land on
`N 0 obj`), trailer `/Size 7 /Root 1 0 R /Info 3 0 R`, `startxref`, `%%EOF\n`. Whole blob compared to the
hand-built text (offsets summed from literal lengths), plus determinism (2 calls identical), 0-page and
2-page cases (9 objects, Kids [4 0 R 7 0 R], xref 0 10), and default A4/10mm geometry
(`/MediaBox [0 0 841.89 595.276]`, `785.1971 0 0 392.5985 28.3465 101.3387 cm`).

## Remaining for 13b
CtImageUtil pure helpers (clampByte etc.; not touched here). Note CtDither imports clampByte from it.

## Suspected bugs: none.

## Repro
`node --test src/lib/tests/` ; `node scripts/build-all.mjs --check`
