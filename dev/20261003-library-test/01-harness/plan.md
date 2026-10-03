# Plan — 01-harness

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Stand up the `src/lib` (ct) unit-test harness and prove it end-to-end with ONE exemplar module's
tests (`CtByteUtil.crc32`), so every later phase (02–13) just copies the pattern. This is the
FOUNDATION phase of the library-test epic (#1013) and the ONLY phase allowed to edit `scripts/`.
The shared `ct` lib currently has ZERO direct unit tests — it is exercised only indirectly via the
9 tools' Playwright e2e. `scripts/test-all.mjs` deliberately SKIPS `src/lib` (line 20:
`SKIP_RELDIRS = new Set(['src' + sep + 'lib'])`) so the new-tool template isn't mis-discovered; this
phase adds an explicit lib-unit-test step WITHOUT re-enabling tool-style discovery of the template.
Full scope spec: `dev/20261003-library-test/p01-harness/PRD.md` (read it fully — it is the DoD source).

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Harness location established | `src/lib/tests/unit/` dir with `*.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing the lib module directly | `node --test src/lib/tests/` discovers and runs the tests |
| crc32 exemplar covers crc32 + crc32Hex with known IEEE vectors | `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` | runs green; asserts `crc32("")`=0, `crc32("123456789")`=0xCBF43926, a bytes-input case, and `crc32Hex` formatting — vectors cited in comments |
| Suite wiring runs lib tests | `scripts/test-all.mjs` gains a named lib-unit-test step (and/or a `test:lib` npm script) | `node scripts/test-all.mjs` runs `node --test src/lib/tests/` as a legible named section with pass/fail count, and is GREEN |
| No lib source touched | git diff shows only `scripts/test-all.mjs` (+ optional `package.json`) + new test files | `node scripts/build-all.mjs --check` → 10/10 |
| Pattern is documented for later phases | `src/lib/tests/README.md` (or a header comment) stating location, runner, how to add a module's tests, the quality bar | later builder can copy it without re-deriving conventions |
| Handoff records crc32 ownership | `findings/HANDOFF.md` | states that crc32 is covered HERE so Phase 03 does md5/sha*/hmac only |

## Task / method
1. Read `p01-harness/PRD.md` fully, then inspect `src/lib/utils/CtByteUtil.mjs` (the `crc32` /
   `crc32Hex` exports) and the existing `src/lib/test-support/tests/` precedent for the test style.
2. Create `src/lib/tests/unit/` and author `CtByteUtil.crc32.test.mjs`. PORT/ADAPT the vectors from
   the dev-repo origin tests (`../claude-tools-dev/src/tools/hasher/tests/unit/crc32.test.mjs`, and
   `favicon-kit`/`apng-maker` crc32 tests) — keep the vectors, adapt the import to
   `../../utils/CtByteUtil.mjs`. Cite vector sources in comments.
3. Wire `scripts/test-all.mjs`: add a named lib-unit-test step that runs `node --test src/lib/tests/`
   with a legible section header + pass/fail count. Do NOT remove the `SKIP_RELDIRS` src/lib skip
   (that guards tool-discovery); add the lib step as a SEPARATE explicit step. Optionally add a
   `test:lib` script to `package.json`.
4. Write `src/lib/tests/README.md` documenting the conventions so phases 02–13 copy the pattern.
5. Run `node --test src/lib/tests/`, `node scripts/test-all.mjs`, `node scripts/build-all.mjs --check`
   and capture the output in the handoff.

## Tools & MCP
Baseline: Read/Grep/Edit/Write + Bash for `node --test`, `node scripts/test-all.mjs`,
`node scripts/build-all.mjs --check`. No new npm dependencies — zero-dep node:test only. No MCP needed.

## Context — folders to read
- `dev/20261003-library-test/p01-harness/PRD.md` — the scope/DoD spec (read fully).
- `dev/20261003-library-test/00-epic-plan/epic-plan.md` — the epic's shared contract + quality bar.
- `dev/20261003-library-test/execution-plan.md` — §"Harness conventions" + §"Quality bar" (authoritative).
- `src/lib/utils/CtByteUtil.mjs` — the module under test (crc32 / crc32Hex exports).
- `src/lib/test-support/tests/` — the existing in-repo test-style precedent to mirror.
- `scripts/test-all.mjs` — the runner to wire (note line ~20 `SKIP_RELDIRS` src/lib skip — keep it).
- `../claude-tools-dev/src/tools/{hasher,favicon-kit,apng-maker}/tests/unit/crc32.test.mjs` — origin
  vectors to port (read-only; adapt imports to the ct module path).

## Deliverables
- `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` (the exemplar).
- `src/lib/tests/README.md` (the pattern doc for later phases).
- `scripts/test-all.mjs` wiring (+ optional `package.json` `test:lib`).
- `findings/HANDOFF.md` — the single rolling handoff: chosen location + wiring precisely (later phases
  depend on it), the exemplar pattern, crc32-ownership note, and the three command outputs.
- A repro line in the handoff (the exact commands to re-run the gate).

## Constraints
- **TEST-ONLY epic — do NOT modify ANY lib source** (`src/lib/**` except the new `src/lib/tests/`).
  A test that reveals a real lib bug is STOP-and-surface, not a lib edit and not a weakened test.
- The ONE sanctioned non-test edit this phase is the `scripts/test-all.mjs` wiring (+ optional
  `package.json` `test:lib`). No other `scripts/` or source edits.
- Do NOT touch sibling phase folders or `00-epic-plan/`.
- No commits; `rm`/`git` stay blocked. Surface the diff; the user commits.

## Time budget
2h.

## When done
Report: test count from `node --test src/lib/tests/`; confirmation `node scripts/test-all.mjs` is green
with the new named lib step (quote the section); `build-all --check` result (expect 10/10); the exact
harness location + wiring decision; the crc32-ownership note for Phase 03; and any gap or surprise.
Write it all to `findings/HANDOFF.md`.
