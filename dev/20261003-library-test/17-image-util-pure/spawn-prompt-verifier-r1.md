<!-- tpm-workflow-spawn phase="dev/20261003-library-test/17-image-util-pure" role="verifier" -->
You are a VERIFIER subagent — 17-image-util-pure (Phase 13b), round r1, variant v1 (library-test epic, #1013). This is the FINAL verification of the epic.

HARD RULE — you render a VERDICT, never a repair. You EXERCISE the artifact (run tests/commands, inspect code) but NEVER mutate/fix what you verify. A PASS you caused by editing anything is worthless. Report a FAIL with evidence; do not fix. TEST-ONLY epic: you NEVER edit `src/lib` source.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/17-image-util-pure`

Write ONLY your verdict file + your own scratch (use `tmp/` for scratch copies — NEVER touch the real lib file). Touch nothing else.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/17-image-util-pure/tmp/subagent.env" 2>/dev/null || true
```

Read, in order — ACTUALLY FETCH EACH ONE (do not skip the methodology reads). Fetch each methodology doc with `npx tpm doc <path>` from the project root:
1. `dev/20261003-library-test/17-image-util-pure/charter-verifier.md` — your posture. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — the tool/test conventions you check against.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end.
7. `npx tpm doc claude-context/methodology/verification.md` — the HARD RULE, on-disk evidence, PASS/FAIL format.
8. `dev/20261003-library-test/17-image-util-pure/plan.md` — the round's brief + DoD triple-table. Read it LAST.

Curated context (token-scoped):
- `dev/20261003-library-test/17-image-util-pure/findings/HANDOFF.md` — the builder's claims (verify, don't trust).
- `dev/20261003-library-test/p13-image-pure/PRD.md` + `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/unit/CtImageUtil.test.mjs` — the tests to review for QUALITY.
- `src/lib/utils/image/CtImageUtil.mjs` — the module under test (read-only).

Model: sonnet.

TASK CONTEXT — what to verify (DoD for Phase 13b = CtImageUtil pure helpers; completes the epic):
1. **Re-run yourself.** `node --test src/lib/tests/` — confirm GREEN, report counts (builder claims 1641
   total, 1625 pass, 16 todo, 0 fail; CtImageUtil 51). `node scripts/build-all.mjs --check` → 10/10. Run
   `node scripts/test-all.mjs` to completion — lib step green; note WHICH e2e suite (if any) fails (the
   flake shifts — color-picker #1012 / color-converter #94 — confirm it is unrelated, not a lib regression).
2. **Judge COVERAGE QUALITY. DO the mutation sweep on a SCRATCH COPY in your `tmp/` (never the real file):**
   - Make targeted mutations and confirm the suite goes RED for EACH: (a) flip a limit comparison `>`→`>=`
     (the strict-threshold claim is the key one — exactly-at-threshold must stay ok); (b) change a limit
     constant / the error>warn precedence; (c) break coverRect vs containRect (swap the >/< aspect branch);
     (d) break constrainRectToAspect's center/vert height-driven branch; (e) break hitTestHandle tol or the
     inside→'move' test; (f) break hexToRgb/rgbToHex. If any survives, that area's tests are hollow → report.
   - Independently RE-DERIVE by hand (not from the lib): coverRect(200,100,100,100)→{50,0,100,100};
     containRect(200,100,100,100)→{0,25,100,50}; the limit strict-`>` boundaries (exactly 8MB ok, +1 warn;
     exactly 40MB warn, +1 error; 20000 ok, 20001 error); and one constrainRectToAspect anchor case (e.g.
     n/s height-driven → {-40,10,200,100} for {10,10,100,100} ratio 2). Confirm the asserted literals match.
   - Confirm the aggregator-class loop really checks each static === the named export.
3. **Adjudicate the builder's observations** — clampByte TRUNCATES (127.9→127, not rounds); 'center' is
   width-driven; hitTestHandle ties → later handle; resizeRaw('move') treats the 'e'. For each: a defensible
   characterization of actual behavior (correctly pinned) or a genuine bug to raise? Judge briefly.
4. **Confirm no lib source modified** (only `CtImageUtil.test.mjs` added) + no canvas/DOM used + the 3
   deferred DOM fns (loadImageFile/canvasToBlob/canvasToPngBytes) are reasonable deferrals. `git` blocked —
   rely on `build-all --check` 10/10 + mtimes and SAY SO.

Deliverable — write your verdict to `findings/verifier-r1-v1-verdict.md`:
- A clear **PASS** or **FAIL** (partial-with-stated-gap is a legitimate PASS).
- Per DoD claim: the evidence (commands, per-mutation red/green results — call out the limit `>`→`>=`
  result specifically, your independent fit/aspect/limit re-derivations).
- Your adjudication of the 4 observations.
- Any coverage-quality concerns (not FAILs, but the orchestrator needs them).
- Reproduction: the exact commands you ran.
End your final report with the verdict (PASS/FAIL) and a one-line rationale.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back.
