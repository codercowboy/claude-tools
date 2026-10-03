# PRD — Phase 13 · Image modules (pure logic only)

**Round type:** ship, sonnet, serial. **Size:** medium-high. **Depends on:** Phase 01.
**Targets:** `src/lib/utils/image/CtDither.mjs`, `CtImagesToPdf.mjs`, and the PURE helpers of
`CtImageUtil.mjs` → `src/lib/tests/unit/CtDither.test.mjs`, `CtImagesToPdf.test.mjs`, `CtImageUtil.test.mjs`.

## In scope (pure, deterministic — no DOM/canvas needed)
- **CtDither** (`nearestColorIndex`, `floydSteinberg`, `atkinson`, `bayerMatrix`, `bayer`): operate on
  plain pixel arrays / palettes — no canvas. Test: `nearestColorIndex` picks the closest palette color
  (exact ties, grayscale, RGB distance); `bayerMatrix(n)` known matrices (2x2, 4x4) + values/normalization;
  `floydSteinberg`/`atkinson`/`bayer` on a tiny known input buffer → deterministic known output (hand/
  reference-computed small case), error-diffusion conservation where checkable. Port/adapt
  `../claude-tools-dev/src/tools/dither-studio/tests/unit/png.test.mjs` if relevant.
- **CtImagesToPdf** (minimal PDF-1.4 writer): image bytes → PDF bytes. Assert PDF structure: `%PDF-1.4`
  header, `%%EOF`, xref table, object count, page/mediabox, embedded image stream present, byte-for-byte
  determinism for a fixed input. (A tiny known image → known PDF length / key markers.)
- **CtImageUtil** — the PURE helpers only (ex-`jbcColor`, `jbcCanvasFormats`, `jbcCheckImageLimits`):
  color math (hex↔rgb, clamping), `checkImageLimits` (dimension/area bounds → ok/reject), canvasFormats
  metadata (mime/ext tables). Enumerate exports; test the non-DOM ones.

## Deferred (DOM / canvas / video runtime — NOT unit-tested; e2e-covered)
`CtCanvasCapture` (needs a canvas), `CtVideoGif` (needs video/canvas + timing), and any `CtImageUtil`
function that requires a real `CanvasRenderingContext2D`/`Image`/`document` (e.g. `rectGizmo` DOM parts,
`setupHiDPICanvas`-style helpers). List each deferred export + the reason in the handoff.

## Definition of Done
- The three `*.test.mjs` green; dither algorithms (known small outputs), PDF byte structure + determinism,
  and CtImageUtil pure helpers covered.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: per-module export inventory → tested | deferred(reason). Confirm no canvas/DOM was required for
  the in-scope tests.

## Notes
No lib edits. If isolating pure logic from canvas-coupled code proves hard for a given function, defer it
(don't fake a canvas just to hit a line) and surface it. This phase may split (dither+pdf vs imageutil) if
large — builder's call at Gate A.
