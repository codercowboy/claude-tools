# Plan — 17-image-util-pure (Phase 13b: CtImageUtil pure helpers)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 2 of 2 — the FINAL round of the epic. Target: the PURE helpers of
`src/lib/utils/image/CtImageUtil.mjs` (506 lines). (13a covered CtDither + CtImagesToPdf.) ~25 pure exports
across 5 groups + the aggregator class; 3 DOM/canvas fns are DEFERRED to e2e. Full spec:
`dev/20261003-library-test/p13-image-pure/PRD.md`.

In scope (PURE — no DOM):
- **Colour:** `clampByte` (round+clamp 0..255), `hexToRgb`, `rgbToHex`, `parsePalette`.
- **Formats:** `FORMATS` ({png,jpeg,webp} each {mime,ext,label,lossy}), `mimeForFormat` (fallback PNG),
  `formatSupportsQuality` (true for lossy).
- **Limits:** `makeImageLimitChecker({action,dimSep})` → `checkImageLimits({bytes,width,height})` →
  {level,message}; constants `WARN_FILE_BYTES`(8MB) `MAX_FILE_BYTES`(40MB) `WARN_PIXELS`(~24MP)
  `MAX_DIMENSION`(20000). Strict `>` (value AT a threshold does not trip); error>warn; order =
  file-hard → dim-hard → warns.
- **Rect gizmo:** `normalizeRect` (neg w/h sign-flip), `HANDLE_IDS` (8), `oppositeHandle`, `handlePoints`
  (8 + center), `hitTestHandle` (nearest within tol → id; inside → 'move'; else null).
- **Fit:** `coverRect` (scale-fill center-crop), `containRect` (scale-fit letterbox), `coverSrcRect`
  (pan/zoom, zoom≥1, offset clamped); all guard non-finite/<1 inputs to ≥1.
- **Crop-aspect:** `ASPECT_PRESETS`, `aspectRatioFor` (custom W:H + portrait), `clampRectToImage`,
  `constrainRectToAspect` (anchor nw/n/…/center drives width or height), `resizeRaw`.
- **Aggregator:** `class CtImageUtil` static members mirror the above.

DEFERRED (DOM/canvas — list in handoff, do NOT fake): `loadImageFile`, `canvasToBlob`, `canvasToPngBytes`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Colour helpers exact | `src/lib/tests/unit/CtImageUtil.test.mjs` | clampByte (round, <0→0, >255→255, non-finite); hex↔rgb round-trip + 3/6-digit + bad input; parsePalette |
| Formats registry | same file | FORMATS shape; mimeForFormat (known + fallback to PNG); formatSupportsQuality (jpeg/webp true, png false) |
| Limit checker | same file | at-threshold does NOT trip (strict `>`); just-over file→error; just-over dim→error; file-hard beats dim; warn tiers (soft file / ~24MP); error beats warn; injected action + dimSep appear in messages |
| Rect gizmo geometry | same file | normalizeRect sign-flip; HANDLE_IDS; oppositeHandle map (+center/move); handlePoints 8+center coords; hitTestHandle within-tol / 'move' inside / null outside |
| Fit helpers | same file | coverRect (wide vs tall source — exact sx/sy/sw/sh); containRect (letterbox/pillarbox exact); coverSrcRect (zoom=1≡cover, zoom>1 window, offset clamp); non-finite→1 guards |
| Crop-aspect | same file | aspectRatioFor (preset, custom w/h, portrait inversion, bad→null); clampRectToImage (inside [0,0,iw,ih], min 1px); constrainRectToAspect (nw/e/n/center anchors drive width vs height correctly); resizeRaw (per-handle edges) |
| Aggregator class | same file | a spot-check that CtImageUtil.<member> === the named export (e.g. clampByte, hitTestHandle, coverRect) |
| DOM fns deferred | handoff | loadImageFile/canvasToBlob/canvasToPngBytes listed as deferred (canvas/DOM) with reason |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtImageUtil.mjs` to confirm exact behavior of each helper FIRST (the threshold comparisons, the fit
math, the anchor logic in constrainRectToAspect, the hex parsing). Assert EXACT values. TABLE-DRIVEN where
natural (formats, presets, limit tiers, handle points). Key subtleties to pin:
- Limits: strict `>` (exactly AT 8MB/40MB/24MP/20000 is NOT tripped); precedence file-hard→dim-hard→warn;
  the injected `action`/`dimSep` strings surface in the messages.
- Fit: compute coverRect/containRect by hand for a wide source into a square (and vice-versa); coverSrcRect
  zoom/offset clamping so the window never leaves the source.
- constrainRectToAspect: the 'center' vs 'n'/'e' anchor branch (center+vert → driven by height).
All pure — NO canvas/DOM. DEFER loadImageFile/canvasToBlob/canvasToPngBytes (surface in handoff; do not
fake a canvas). A clearly-wrong result (your correct hand-computation ≠ lib) is a genuine lib bug → STOP
and surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p13-image-pure/PRD.md` — scope/DoD + the defer list (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/image/CtImageUtil.mjs` — the module under test (confirm each helper's exact behavior FIRST).

## Deliverables
- `src/lib/tests/unit/CtImageUtil.test.mjs`.
- `findings/HANDOFF.md` — export inventory → tested | deferred(reason); the limit-threshold + fit + aspect
  hand-computations; the test count; command outputs; confirmation NO canvas/DOM needed; a note that this
  COMPLETES P13 and the epic's test authoring; any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert EXACT values (hand-compute fit/aspect/limits —
  don't use the lib as its own oracle for the computed cases). A genuine bug is STOP-and-surface.
- DEFER the 3 DOM/canvas fns — do NOT fake a canvas to hit a line.
- Write only `src/lib/tests/unit/CtImageUtil.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the export inventory
(tested|deferred), show the key hand-computations (limits/fit/aspect), confirm no canvas/DOM needed, confirm
P13 + the epic's authoring is COMPLETE, and flag any suspected bug. Write it to `findings/HANDOFF.md`.
