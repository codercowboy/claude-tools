# Pre-task receipt — Phase 13b · CtImageUtil (pure helpers)

Pre-task — ship round: CtImageUtil pure-helper unit tests (p13-image-pure/PRD.md; sub-round 2 of 2 — FINAL round of the epic)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p13 PRD (this sub-round = CtImageUtil PURE helpers; COMPLETES P13 + the epic):
   CtImageUtil.test.mjs green; cover the ~25 pure exports — color (clampByte, hexToRgb, rgbToHex,
   parsePalette), formats (FORMATS, mimeForFormat, formatSupportsQuality), limits (makeImageLimitChecker +
   WARN_FILE_BYTES 8MB / MAX_FILE_BYTES 40MB / WARN_PIXELS 24MP / MAX_DIMENSION 20000; strict `>`, error>warn,
   file-hard→dim-hard→warns, injected action/dimSep), rect-gizmo geometry (normalizeRect sign-flip, HANDLE_IDS,
   oppositeHandle, handlePoints, hitTestHandle tol/move/null), fit (coverRect, containRect, coverSrcRect
   zoom/pan clamp, non-finite guards), crop-aspect (ASPECT_PRESETS, aspectRatioFor incl custom+portrait,
   clampRectToImage, constrainRectToAspect anchor cases, resizeRaw), and the CtImageUtil aggregator-class
   static members. DEFER (DOM/canvas, NOT unit-tested): loadImageFile, canvasToBlob, canvasToPngBytes — list
   each + reason in handoff. test-all + build-all 10/10; handoff export inventory → tested|deferred(reason).
③ Paths — in: p13 PRD · src/lib/utils/image/CtImageUtil.mjs (read) ·
   out: src/lib/tests/unit/CtImageUtil.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. All in-scope helpers are pure number/string math — assert
EXACT values + boundary behavior (esp. the limit thresholds' strict `>` and precedence; rect geometry;
aspect-ratio math). NO canvas/DOM; defer the 3 DOM fns (don't fake a canvas). A clearly-wrong result is a
genuine lib bug → STOP and surface. No lib edits. This is the FINAL phase — after PASS, the epic-close sweep
runs (full test-all + build-all, #1013 subtasks, follow-on tickets for the raised bugs, close).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P13 split into 13a/13b is the orchestrator's Gate-A call, which the p13 PRD explicitly endorses.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
