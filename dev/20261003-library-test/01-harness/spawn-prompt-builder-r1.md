<!-- tpm-workflow-spawn phase="dev/20261003-library-test/01-harness" role="builder" -->
You are a BUILDER subagent — 01-harness, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship a working,
reproducible artifact — not a survey of why it's hard. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/01-harness`

Your write boundary is that folder PLUS the specific product paths named in `plan.md` (the new
`src/lib/tests/` tree and the `scripts/test-all.mjs` wiring). You do NOT touch sibling phase folders,
`00-epic-plan/`, or any other `src/lib` source.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/01-harness/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `charter-builder.md` (in your working folder) — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption protocol, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your shipped artifact (and its tests) must clear.
8. `plan.md` (in your working folder) — your round's authoritative brief: scope, the Definition of Done triple-table, constraints. Read it LAST so the conventions above are loaded.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p01-harness/PRD.md` — the full scope spec this plan is built from (read fully).
- `dev/20261003-library-test/00-epic-plan/epic-plan.md` — the epic's shared contract.
- `dev/20261003-library-test/execution-plan.md` — §"Harness conventions" + §"Quality bar for the tests" (authoritative for HOW the tests should look).
- `src/lib/utils/CtByteUtil.mjs` — the module under test (`crc32` / `crc32Hex` exports).
- `src/lib/test-support/tests/` — the existing in-repo test-style precedent to mirror.
- `scripts/test-all.mjs` — the runner you wire (note ~line 20 `SKIP_RELDIRS` src/lib skip — KEEP it; add the lib step separately).
- `../claude-tools-dev/src/tools/{hasher,favicon-kit,apng-maker}/tests/unit/crc32.test.mjs` — origin vectors to PORT (read-only; adapt imports to `../../utils/CtByteUtil.mjs`, keep the vectors + cite source).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Stand up the `src/lib` unit-test HARNESS and prove it with ONE exemplar (`CtByteUtil.crc32`). Concretely:
(1) create `src/lib/tests/unit/` with zero-dep `*.test.mjs` (`node:test` + `node:assert/strict`) importing
the lib module directly; (2) author `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` with KNOWN IEEE CRC-32
vectors (`crc32("")`=0, `crc32("123456789")`=0xCBF43926, a bytes-input case, and `crc32Hex` formatting),
ported from the dev-repo origin tests with sources cited in comments; (3) add a NAMED lib-unit-test step
to `scripts/test-all.mjs` (run `node --test src/lib/tests/`, legible pass/fail count) WITHOUT re-enabling
tool-style discovery of the template, and optionally a `test:lib` npm script; (4) write
`src/lib/tests/README.md` documenting the conventions so phases 02–13 copy the pattern.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN and includes the crc32 exemplar (report the test count).
- `node scripts/test-all.mjs` runs the lib tests as a named step and is GREEN (quote the section).
- `node scripts/build-all.mjs --check` → 10/10 (proves no source touched beyond the test-all wiring).
- `findings/HANDOFF.md` records the chosen location + wiring precisely, the exemplar pattern, and the
  crc32-OWNERSHIP note (crc32 is covered HERE → Phase 03 does md5/sha*/hmac only).

HARD constraints:
- TEST-ONLY — do NOT modify ANY `src/lib` source. A test that reveals a real lib bug is STOP-and-surface
  (document it in the handoff); never weaken a test and never edit the lib to make a test pass.
- The ONE sanctioned non-test edit is the `scripts/test-all.mjs` wiring (+ optional `package.json`
  `test:lib`). Nothing else outside `src/lib/tests/`.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: the harness + exemplar + wiring + pattern doc above. Write `findings/HANDOFF.md` with the
three command outputs, the location/wiring decision, the crc32-ownership note, and any gap or surprise.
End with a terse status: what landed, what (if anything) is partial/blocked, and the repro commands.
