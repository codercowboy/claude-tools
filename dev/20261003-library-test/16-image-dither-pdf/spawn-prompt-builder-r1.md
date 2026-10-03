<!-- tpm-workflow-spawn phase="dev/20261003-library-test/16-image-dither-pdf" role="builder" -->
You are a BUILDER subagent — 16-image-dither-pdf (Phase 13a), round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/16-image-dither-pdf`

Your write boundary is that folder PLUS the two product paths named in `plan.md`: the new `src/lib/tests/unit/CtDither.test.mjs` and `src/lib/tests/unit/CtImagesToPdf.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring. You cover CtDither + CtImagesToPdf ONLY — CtImageUtil pure helpers are 13b; do not test them.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/16-image-dither-pdf/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/16-image-dither-pdf/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/16-image-dither-pdf/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p13-image-pure/PRD.md` — the full scope spec + the split/defer notes (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to COPY.
- `src/lib/utils/image/CtDither.mjs` — all 5 fns; note the EXACT error-diffusion coefficients + traversal.
- `src/lib/utils/image/CtImagesToPdf.mjs` — the helpers + the buildPdf/assemblePdf output shape.
- (optional) `../claude-tools-dev/src/tools/dither-studio/tests/unit/png.test.mjs` — vectors to adapt if relevant.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author TWO zero-dep test files (`node:test` + `node:assert/strict`), importing directly from
`../../utils/image/CtDither.mjs` and `../../utils/image/CtImagesToPdf.mjs`.

**CtDither.test.mjs** (exports: nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer):
- `nearestColorIndex(r,g,b,palette)` — closest by SQUARED RGB distance; an exact tie picks the FIRST index;
  grayscale + RGB cases; exact-match early-break. palette = `[[r,g,b],…]`.
- `bayerMatrix(order)` — `bayerMatrix(2)` === `[[0,2],[3,1]]`; assert the exact 4×4 for order 4; recursion;
  `order<=1` → `[[0]]`.
- `floydSteinberg(rgba,w,h,palette)` + `atkinson(rgba,w,h,palette)` — HAND-COMPUTE the output on a TINY
  buffer (2×2 and/or 3×1 RGBA) with a 2-colour palette (e.g. black `[0,0,0]` / white `[255,255,255]`): walk
  the error diffusion by hand (FS pushes 7/16 to the right, 3/16 down-left, 5/16 down, 1/16 down-right;
  Atkinson spreads 1/8 to each of its 6 neighbours per CtDither.mjs's offsets)
  and PIN the exact index Uint8Array. Determinism too.
- `bayer(rgba,w,h,palette,opts)` — exact index array on a tiny buffer (order 4, strength 64); determinism.

**CtImagesToPdf.test.mjs** (22 exports — the pure helpers + the PDF writer):
- Pure helpers + constants EXACT: mmToPt/ptToMm, pdfNumber, pdfEscapeString, pad10, strToBytes,
  clampQuality, percentToQuality/qualityToPercent, formatBytes, applyOrientation, orientedPageSize,
  computePlacement, planPages; MM_TO_PT, PT_PER_PX, PAGE_SIZES_PT, DEFAULT_QUALITY.
- `buildPdf`/`assemblePdf` on a FIXED tiny image byte array → assert the STRUCTURE: `%PDF-1.4` header,
  `%%EOF` trailer, an xref table, the correct object count, a page with a MediaBox, the embedded image
  stream present — AND byte-for-byte DETERMINISM (assert the exact output length + a couple of exact byte
  slices / marker offsets, and that a second call is byte-identical). Avoid asserting the entire blob if brittle.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including both new files (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the per-module export inventory → tested, the dither hand-computations shown,
  the PDF markers asserted, the count, the command outputs, confirmation NO canvas/DOM was needed, what
  remains for 13b, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. HAND-COMPUTE the dither + PDF expectations (do NOT use the
  lib's own output as the oracle — that would pass a wrong-but-deterministic result). A genuine algorithm/
  PDF bug is STOP-and-surface, never a weakened test and never a lib edit.
- No canvas/DOM is needed here. If any function genuinely can't be isolated from a canvas, DEFER it and
  surface it in the handoff — do NOT fake a canvas to hit a line.
- Cover CtDither + CtImagesToPdf ONLY. Do NOT test CtImageUtil (13b owns it).
- Write ONLY the two named test files (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtDither.test.mjs` + `src/lib/tests/unit/CtImagesToPdf.test.mjs` +
`findings/HANDOFF.md` (at `dev/20261003-library-test/16-image-dither-pdf/findings/HANDOFF.md`). End your
final report with a terse status: what landed, the per-module inventory, the dither hand-computations + PDF
markers, confirmation no canvas/DOM was needed, what remains for 13b, what (if anything) is blocked, and the
repro commands.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back, so you don't leave a stray process.
