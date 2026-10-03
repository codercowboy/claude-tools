<!-- tpm-workflow-spawn phase="dev/20261003-library-test/16-image-dither-pdf" role="builder" -->
You are a BUILDER (FIXER) subagent — 16-image-dither-pdf (Phase 13a), round r2 (library-test epic, #1013).
This is a VERIFY↔FIX round: the r1 verifier returned FAIL on a TEST-QUALITY gap (not a lib bug). Close it.

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/16-image-dither-pdf`

Your write boundary is that folder PLUS the one product path you must extend: the existing `src/lib/tests/unit/CtDither.test.mjs`. Do NOT touch `CtImagesToPdf.test.mjs` (it PASSED verification — leave it), sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

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

Curated context (token-scoped — read these):
- `dev/20261003-library-test/16-image-dither-pdf/findings/verifier-r1-v1-verdict.md` — THE FAIL VERDICT. Read
  it fully: it lists exactly which mutants survived and gives a fix hint. Your job is to kill those mutants.
- `dev/20261003-library-test/16-image-dither-pdf/findings/HANDOFF.md` — the r1 builder's work (what exists).
- `src/lib/tests/unit/CtDither.test.mjs` — the file you EXTEND (keep all existing passing tests).
- `src/lib/utils/image/CtDither.mjs` — the module under test; note the EXACT FS (7/3/5/1÷16) + Atkinson
  (6 taps × 1/8) coefficients + the bayer threshold (`(m+0.5)/denom - 0.5` × strength).

Model: sonnet.

THE GAP TO CLOSE (from the r1 FAIL verdict):
Every existing error-diffusion test uses only gray-128 on ≤3 rows, where the output is a pure threshold
decision that does NOT depend on the exact weights — so these mutants SURVIVED (tests stayed green):
- FS `7/16`→`6/16` and →`9/16`; FS `3/16`, `5/16`, `1/16` each changed.
- Atkinson divisor `/8`→`/7` and →`/6`; an Atkinson tap moved.
- `BAYER_STRENGTH` 64→60/100; dropping the `+0.5` in the bayer threshold; default bayer order 4→8/2.
Also: NO colour (multi-channel) error-diffusion test exists.

YOUR TASK — add WEIGHT-SENSITIVE, HAND-COMPUTED cases so each surviving mutant is KILLED:
1. **Floyd-Steinberg** — add ≥1 case on a NON-128 / near-threshold gray input (and ≥3 cols so the 7/16,
   3/16, 5/16, 1/16 taps all propagate to pixels whose decision FLIPS if a weight is wrong). Pick inputs
   where, say, 7/16 vs 6/16 changes a downstream pixel's chosen index. HAND-COMPUTE the exact index array
   (walk the diffusion yourself; do NOT use CtDither's own output as the oracle).
2. **Atkinson** — add ≥1 case where the `/8` divisor and the specific 6-tap layout matter — a downstream
   pixel that flips if the divisor is /7 or a tap moves. Hand-compute.
3. **Bayer** — add cases that pin the DEFAULT order (4) and strength (64): inputs whose result differs
   under order 8/2 or strength 60/100, and a case that fails if the `+0.5` is dropped. Hand-compute from the
   matrix + threshold formula.
4. **Colour / multi-channel** — add ≥1 error-diffusion case with a non-gray palette (e.g. R/G/B entries)
   and multi-channel input, so per-channel error handling is pinned.
Keep ALL existing passing tests. Use clear comments showing each hand-computation.

PROVE YOU CLOSED IT (do this and report it): on a SCRATCH COPY of `CtDither.mjs` in `tmp/`, apply the
specific surviving mutations from the verdict (FS 7/16→6/16; Atkinson /8→/7; BAYER_STRENGTH 64→100; default
order 4→8) and confirm your EXTENDED suite now goes RED for each. (Never mutate the real lib.) If a mutation
still survives, your new case isn't weight-sensitive enough — strengthen it.

Gate (all must hold, prove each in the handoff):
- `node --test src/lib/tests/` GREEN including the extended CtDither tests (report the new count).
- `node scripts/build-all.mjs --check` → 10/10.
- The four targeted mutants (FS 7/16→6/16, Atkinson /8→/7, BAYER_STRENGTH→100, default order→8) each turn
  the suite RED on a scratch copy — SHOW the before/after.
- `findings/HANDOFF-r2.md` documents the added cases + hand-computations + the mutation-kill proof.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. HAND-COMPUTE every new expectation (independent oracle).
  If while hand-computing you find the lib is actually WRONG (your correct hand result ≠ lib output), that
  is a genuine lib bug → STOP and surface (characterize via a todo/pin), do not weaken the test.
- Extend ONLY `src/lib/tests/unit/CtDither.test.mjs` (+ your HANDOFF-r2). Do NOT touch CtImagesToPdf.test.mjs.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: the extended `src/lib/tests/unit/CtDither.test.mjs` + `findings/HANDOFF-r2.md`. End your final
report with a terse status: the new test count, the cases added, the mutation-kill before/after proof for
the four targeted mutants, whether any lib bug surfaced, and the repro commands.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back, so you don't leave a stray process.
