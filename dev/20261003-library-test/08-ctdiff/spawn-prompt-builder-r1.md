<!-- tpm-workflow-spawn phase="dev/20261003-library-test/08-ctdiff" role="builder" -->
You are a BUILDER subagent — 08-ctdiff, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/08-ctdiff`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtDiff.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/08-ctdiff/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/08-ctdiff/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/08-ctdiff/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p08-ctdiff/PRD.md` — the full scope spec + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to COPY.
- `src/lib/utils/formats/CtDiff.mjs` — the module under test. CONFIRM the exact `export { ... }` names + the op/row object shapes FIRST (read its header + diffLines/toUnifiedDiff bodies).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtDiff.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing
directly from `../../utils/formats/CtDiff.mjs`. Confirmed public API (7 exports):
`splitLines, normalizeLine, myersDiff, diffLines, tokenizeWords, diffWords, toUnifiedDiff`. Cover EACH.

1. **myersDiff** — element-op tests on small arrays (equal/insert/delete + the backtrack legs). Include a
   HAND-DERIVED op sequence for a known pair (e.g. `['a','b','c']` vs `['a','x','c']` → equal,delete,
   insert,equal or the engine's actual shape — derive it by hand, assert it exactly).
2. **diffLines** — table of characteristic cases: identical→all-equal; pure insertion; pure deletion;
   replacement; common prefix+suffix; empty↔non-empty; CRLF-vs-LF (normalize to equal); trailing-newline
   (a string ending in \n yields a final empty line). Assert the COALESCED op objects (type + aStart +
   bStart + aLines + bLines) and the stats. Pin ≥1 FULL expected op list by hand.
3. **tokenizeWords / diffWords** — tokenization is lossless (`tokenizeWords(s).join('')===s`); intra-line
   edits, punctuation, whitespace runs produce correct equal/delete/insert segments; adjacent same-type
   segments are coalesced.
4. **toUnifiedDiff** — EXACT string fixtures: single hunk, multiple hunks, `context: 0` and a larger
   context, the merge-within-2*context behavior, custom aName/bName, and the no-change → `''` case.
   Assert the FULL emitted text (this is what catches a wrong-but-self-consistent diff).
5. **Reconstruct property** — over a FIXED battery of (before, after) pairs, apply the edit script
   (drop deletes, keep equals, add inserts) and assert it rebuilds `after`. SUPPLEMENT to the pinned
   fixtures, never the only check.
6. **normalizeLine + options** — ignoreCase / ignoreAllWhitespace / ignoreLeadingTrailingWhitespace change
   what counts as equal, but emitted op lines carry the ORIGINAL (un-normalized) text.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtDiff tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the public-API inventory (export → tested), the count, the command outputs,
  any formatting option left untested + why, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. The reconstruct property ALONE is insufficient — pair
  with ≥1 hand-computed op sequence AND ≥1 exact unified-diff fixture. A genuine bug (a round-trip/
  reconstruct that SHOULD hold but doesn't) is STOP-and-surface, never a weakened test, never a lib edit.
- Write ONLY `src/lib/tests/unit/CtDiff.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtDiff.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/08-ctdiff/findings/HANDOFF.md`). End your final report with a terse status:
what landed, the public-API inventory, any untested option, what (if anything) is blocked, and the repro commands.
