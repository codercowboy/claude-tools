# HANDOFF — 17-image-util-pure (Phase 13b, r1)

Deliverable: `src/lib/tests/unit/CtImageUtil.test.mjs` (TEST-ONLY; no src/lib edit). Zero-dep.

## Gate
- `node --test src/lib/tests/` -> tests 1641, pass 1625, fail 0, todo 16 (the todos are pre-existing CtDiff known-bug markers). New file alone: 51 tests, all pass.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." (10/10)
- No canvas/DOM was needed or faked.

## Export inventory (28 named exports + class)
Tested: clampByte, hexToRgb, rgbToHex, parsePalette, FORMATS, mimeForFormat, formatSupportsQuality,
makeImageLimitChecker, WARN_FILE_BYTES, MAX_FILE_BYTES, WARN_PIXELS, MAX_DIMENSION, normalizeRect, HANDLE_IDS,
oppositeHandle, handlePoints, hitTestHandle, coverRect, containRect, coverSrcRect, ASPECT_PRESETS, aspectRatioFor,
clampRectToImage, constrainRectToAspect, resizeRaw, class CtImageUtil (every static === named export, all 28 looped).
Deferred (DOM/canvas, e2e): loadImageFile, canvasToBlob, canvasToPngBytes (need Image/URL/canvas).

## Key hand-computations
- Limits (strict >): 8MB=8388608 ok, +1 warn; 40MB=41943040 warn (not error), +1 error; 6000x4000=24,000,000 ok, 6000x4001 warn;
  20000x1200 ok, 20000x1201 warn (24.02MP); 20001x1 / 1x20001 error. Precedence file-hard > dim-hard > warns verified;
  messages exact incl. injected action ('cropping') and dimSep ('x'); defaults 'processing' / U+00D7.
- coverRect(200,100,100,100)={50,0,100,100}; (100,200,100,100)={0,50,100,100}; (1600,900,100,100)={350,0,900,900};
  (400,300,160,90)={0,37.5,400,225}; (1000,100,50,100)={475,0,50,100}.
- containRect(200,100,100,100)={0,25,100,50}; (100,200,..)={25,0,50,100}; (100,100,400,200)={100,0,200,200}; (400,300,160,90)={20,0,120,90}.
- coverSrcRect(200,100,100,100,z=2)={75,25,50,50}; z=4={87.5,37.5,25,25}; z2 ox=1000,oy=1000 -> {150,50,50,50}; -1000 -> {0,0,50,50}; z1 ox=30 -> sx=80.
- constrainRectToAspect on {10,10,100,100}, ratio 2: nw/ne {10,10,100,50}; sw/se {10,60,100,50}; e/w {10,35,100,50};
  n/s (height-driven) {-40,10,200,100}; center {10,35,100,50}.
- resizeRaw on {10,20,100,60} to (50,40): nw {50,40,60,40}, se {10,20,40,20}, etc.; past-edge gives negative w/h.

## Observations (not bugs; pinned or avoided)
- clampByte TRUNCATES (v|0), it does not round (127.9 -> 127). Source comment says "truncates"; the task text said "round". Test pins truncation.
- constrainRectToAspect 'center' is WIDTH-driven (horiz and vert both 'c'); only 'n'/'s' are height-driven. Pinned.
- hitTestHandle ties go to the later handle in HANDLE_IDS order (`d <= bestD`). Pinned.
- resizeRaw('move', ...) misreads the 'e' in "move" as east handle (substring test). Not asserted; callers only pass the 8 handle ids. Low-severity quirk, no change made.
- No suspected genuine lib bug.

## Completion
This COMPLETES P13 and the epic's test authoring. Verifier should run the full test-all sweep.

## Repro
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtImageUtil.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
