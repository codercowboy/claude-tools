<!-- tpm-workflow-spawn phase="dev/20261003-library-test/02-ctutil-pure" role="builder" -->
You are a BUILDER subagent — 02-ctutil-pure, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/02-ctutil-pure`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new
`src/lib/tests/unit/CtUtil.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any
`src/lib` source, or the test-all wiring (that was Phase 01's one-time edit).

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/02-ctutil-pure/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/02-ctutil-pure/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/02-ctutil-pure/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p02-ctutil-pure/PRD.md` — the full scope spec (read fully; names in/deferred fns + edge cases).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative for test quality.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — the harness location + conventions from Phase 01.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` — the pattern to COPY (location, runner, style).
- `src/lib/utils/CtUtil.mjs` — the module under test (read the ACTUAL implementations of the in-scope fns).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtUtil.test.mjs` covering the PURE functions of `CtUtil.mjs`, zero-dep
(`node:test` + `node:assert/strict`), importing directly from `../../utils/CtUtil.mjs`. In scope:
`clamp` · `num` · `clampInt` · `escapeHtml` · `escapeAttr` · `slugify` · `wrapText`, with the edge cases
named in `plan.md` / the PRD (in-range/below/above/NaN for clamp; coercion + fallback for num/clampInt;
`& < > " '` + unicode + already-escaped for the escapers; spaces/case/punctuation/diacritics/separators
for slugify; width/unbreakable-word/newlines/empty for wrapText). Optionally test `debounce` with
`node:test` mock timers IF cheap, else defer with a note. DEFER (DOM/BOM, list in handoff with reason):
`downloadBlob` · `el` · `persistState` · `onceFlag` · `posAt` · `prefersReducedMotion` ·
`setupHiDPICanvas` · `restartAnimation`.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtUtil tests (report the count).
- `node scripts/test-all.mjs` lib step stays green; `node scripts/build-all.mjs --check` → 10/10.
- `findings/HANDOFF.md` lists EVERY CtUtil export → tested | deferred(reason), reports the count, and
  flags any surprising/characterized behavior or suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. CHARACTERIZE actual behavior: if `clampInt`/`num`
  surprises you, assert what it actually does and NOTE it; never edit the lib and never weaken a test.
  A test that reveals a genuine bug is STOP-and-surface (document it loudly in the handoff).
- Write ONLY `src/lib/tests/unit/CtUtil.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtUtil.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/02-ctutil-pure/findings/HANDOFF.md`) with the coverage inventory, count,
command outputs, and any surprise. End your final report with a terse status: what landed, what's
deferred, what (if anything) is blocked, and the repro commands.