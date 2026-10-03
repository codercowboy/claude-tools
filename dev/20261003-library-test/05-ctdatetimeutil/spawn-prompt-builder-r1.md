<!-- tpm-workflow-spawn phase="dev/20261003-library-test/05-ctdatetimeutil" role="builder" -->
You are a BUILDER subagent — 05-ctdatetimeutil, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/05-ctdatetimeutil`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtDateTimeUtil.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/05-ctdatetimeutil/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/05-ctdatetimeutil/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/05-ctdatetimeutil/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p05-ctdatetimeutil/PRD.md` — the full scope spec (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — harness location + conventions.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to COPY.
- `src/lib/utils/CtDateTimeUtil.mjs` — the module under test. ENUMERATE the public surface FIRST (28 statics on the class + formatDuration/humanizeDuration), then read each target fn's signature + output.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtDateTimeUtil.test.mjs`, zero-dep (`node:test` + `node:assert/strict`),
importing directly from `../../utils/CtDateTimeUtil.mjs`. Cover:
- `formatDuration(seconds)`: zero, negative (clamps to 0), large, fractional, ms/s/min/hr/day scale boundaries.
- `humanizeDuration(ms)`: 0ms, negative sign, pluralization, part assembly (`d/h/m/s/ms`).
- Pure calendar math: `parseNaive`, `addCalendar`, `businessDaysBetween`, `addBusinessDays`, `isoWeek`,
  `isoWeekYear`, `quarter`, `dayOfYear`, `weekdayName`, `diffParts`, `formatDiff`, `isWorkingHour`,
  `formatOffset` — leap-year (2024-02-29), month-length, and boundary edges, FIXED inputs.
- tz/DST engine: `zonedParts`, `zoneOffsetMinutes`, `zonedTimeToUtc`, `formatInZone`, `zoneAbbrev`,
  `isDstInEffect`, `nextDstTransition`, `zoneInfo`, `instantInZones`, `meetingGrid`, `overlapWindows` —
  FIXED epoch instants + EXPLICIT tz (e.g. `America/New_York` across a DST transition, `UTC`, a half-hour
  zone like `Asia/Kolkata`). NEVER use `Date.now()` or host tz — all tests must be deterministic.
CHARACTERIZE opinionated formatting (lock actual output, note it). The surface is LARGE: if you cannot
cover it THOROUGHLY in the budget, STOP and surface a split (what this round covers vs a follow-on) rather
than thinning coverage.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtDateTimeUtil tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the method inventory (every static → tested|deferred+reason), the count, the
  fixed anchors used, any characterized formatting, and — if you split — exactly what a follow-on must pick up.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. DETERMINISM: fixed instants + explicit tz only; a
  genuine bug is STOP-and-surface (loud in the handoff), never a weakened test and never a lib edit.
- Write ONLY `src/lib/tests/unit/CtDateTimeUtil.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtDateTimeUtil.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/05-ctdatetimeutil/findings/HANDOFF.md`). End your final report with a terse
status: what landed, what's deferred/split, what (if anything) is blocked, and the repro commands.