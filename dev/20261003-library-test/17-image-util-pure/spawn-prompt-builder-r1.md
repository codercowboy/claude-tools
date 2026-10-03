<!-- tpm-workflow-spawn phase="dev/20261003-library-test/17-image-util-pure" role="builder" -->
You are a BUILDER subagent — 17-image-util-pure (Phase 13b), round r1 (library-test epic, #1013). This is the FINAL authoring round of the epic.

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/17-image-util-pure`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtImageUtil.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/17-image-util-pure/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/17-image-util-pure/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/17-image-util-pure/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p13-image-pure/PRD.md` — the full scope spec + the DEFER list (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to COPY.
- `src/lib/utils/image/CtImageUtil.mjs` — the module. Confirm the EXACT behavior of each pure helper FIRST
  (threshold comparisons, fit math, constrainRectToAspect anchor logic, hex parsing).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtImageUtil.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing
directly from `../../utils/image/CtImageUtil.mjs`. Cover the ~25 PURE exports (TABLE-DRIVEN where natural):
1. **Colour:** clampByte (round + clamp 0..255, non-finite); hexToRgb/rgbToHex (round-trip, 3- & 6-digit,
   bad input); parsePalette.
2. **Formats:** FORMATS shape ({png,jpeg,webp}→{mime,ext,label,lossy}); mimeForFormat (known + PNG fallback);
   formatSupportsQuality (jpeg/webp true, png false).
3. **Limits:** makeImageLimitChecker — the STRICT `>` (exactly AT 8MB/40MB/~24MP/20000 does NOT trip);
   just-over file → error; just-over dimension → error; file-hard beats dim-hard; the two warn tiers; error
   beats warn; the injected `action` + `dimSep` appear in the messages. Assert the constants' values.
4. **Rect gizmo:** normalizeRect (negative w/h flips sign); HANDLE_IDS (8); oppositeHandle (+move/center);
   handlePoints (8 corners/edges + center coordinates); hitTestHandle (nearest within tol → id; inside the
   rect → 'move'; else null).
5. **Fit:** coverRect (wide-source vs tall-source — HAND-COMPUTE the exact {sx,sy,sw,sh}); containRect
   (letterbox/pillarbox exact {x,y,w,h}); coverSrcRect (zoom=1 ≡ coverRect, zoom>1 window, offset clamp so
   the window never leaves the source); non-finite/<1 inputs guarded to ≥1.
6. **Crop-aspect:** aspectRatioFor (preset ratio, custom W:H, portrait inversion, bad custom → null);
   clampRectToImage (forced inside [0,0,iw,ih], min 1px); constrainRectToAspect (the nw / e / n / center
   anchor branches — center+vertical is driven by HEIGHT, else by width); resizeRaw (per-handle edge moves).
7. **Aggregator:** spot-check `CtImageUtil.<member> === <namedExport>` for a few (clampByte, hitTestHandle,
   coverRect).

HAND-COMPUTE the fit/aspect/limit expectations (do NOT use the lib as its own oracle for computed cases).

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtImageUtil tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the export inventory → tested | deferred(reason), the key hand-computations,
  the count, the command outputs, confirmation NO canvas/DOM was needed, a note that this COMPLETES P13 +
  the epic's authoring, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. HAND-COMPUTE fit/aspect/limit expectations (independent
  oracle). A clearly-wrong result (your correct hand result ≠ lib output) is a genuine lib bug →
  STOP-and-surface, never a weakened test and never a lib edit.
- DEFER the 3 DOM/canvas fns (loadImageFile, canvasToBlob, canvasToPngBytes) — list them in the handoff;
  do NOT fake a canvas to hit a line.
- Write ONLY `src/lib/tests/unit/CtImageUtil.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtImageUtil.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/17-image-util-pure/findings/HANDOFF.md`). End your final report with a terse
status: what landed, the export inventory (tested|deferred), the key hand-computations, confirmation no
canvas/DOM was needed, confirmation P13 + the epic authoring is COMPLETE, what (if anything) is blocked, and
the repro commands.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back, so you don't leave a stray process.
