# Plan — 05-ctdatetimeutil

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test `src/lib/utils/CtDateTimeUtil.mjs` — the two standalone exports `formatDuration(seconds)` and
`humanizeDuration(ms)`, plus the pure/deterministic members of the `CtDateTimeUtil` class (a tz/calendar/
DST/business-day engine built on `Intl`, ex-`jbcTimezone`). Full scope spec:
`dev/20261003-library-test/p05-ctdatetimeutil/PRD.md`. DETERMINISM IS THE CRITICAL CONSTRAINT: every test
uses FIXED epoch instants + EXPLICIT tz/locale args — never `Date.now()`, never host tz.

The class surface is LARGE (28 static members). Thorough coverage beats breadth: if one round cannot
cover the surface thoroughly, STOP and surface a split (e.g. duration+naive+calendar-math as this round,
tz/DST/meeting-grid as a follow-on) rather than thinning.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Duration formatters tested | `src/lib/tests/unit/CtDateTimeUtil.test.mjs` | `formatDuration`: zero, negative→clamped 0, large, fractional, scale boundaries (ms/s/min/hr/day); `humanizeDuration`: 0ms, negative sign, pluralization, part assembly |
| Pure calendar math tested deterministically | same file | `parseNaive`, `addCalendar`, `businessDaysBetween`, `addBusinessDays`, `isoWeek`, `isoWeekYear`, `quarter`, `dayOfYear`, `weekdayName`, `diffParts`, `formatDiff`, `isWorkingHour`, `formatOffset` — leap-year + month-length + boundary edges, fixed inputs |
| tz/DST engine tested with fixed tz | same file | `zonedParts`, `zoneOffsetMinutes`, `zonedTimeToUtc`, `formatInZone`, `zoneAbbrev`, `isDstInEffect`, `nextDstTransition`, `zoneInfo`, `instantInZones`, `meetingGrid`, `overlapWindows` — fixed instants + explicit tz (e.g. America/New_York DST boundary, UTC) |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green; `node scripts/build-all.mjs --check` 10/10 |
| Method inventory in handoff | `findings/HANDOFF.md` | every static member → tested \| deferred(reason) |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
1. FIRST enumerate the public surface (the 28 statics on the class + the 2 standalone exports) and read
   each target fn's implementation to learn its exact signature + output.
2. Pick FIXED anchors: a handful of fixed epoch-ms instants spanning a DST transition (e.g. US spring-
   forward / fall-back), a leap day (2024-02-29), month boundaries, and explicit tz strings
   (`America/New_York`, `UTC`, one half-hour zone like `Asia/Kolkata`). Pass tz/locale explicitly.
3. Characterize-then-assert for opinionated formatting (`formatDiff`, `humanizeDuration` wording):
   lock the ACTUAL current output and note it. Surface anything that looks like a genuine bug; do NOT
   edit the lib or weaken a test.
4. Run `node --test src/lib/tests/` + `node scripts/build-all.mjs --check`. (Leave the full
   `node scripts/test-all.mjs` sweep to the verifier — but DO confirm the lib step runs via
   `node --test src/lib/tests/`.)

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p05-ctdatetimeutil/PRD.md` — scope/DoD (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — harness conventions.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/CtDateTimeUtil.mjs` — the module under test (enumerate the surface FIRST).

## Deliverables
- `src/lib/tests/unit/CtDateTimeUtil.test.mjs`.
- `findings/HANDOFF.md` — method inventory (every static → tested|deferred+reason), test count, the
  command outputs, the fixed anchors used, any characterized formatting, any suspected bug, and — if you
  split — a clear statement of what this round covered vs what a follow-on phase must pick up.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. DETERMINISM: fixed instants + explicit tz only.
- Write only `src/lib/tests/unit/CtDateTimeUtil.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h. If the surface is too big for thorough coverage in that budget, STOP and surface a split.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the method inventory,
note the fixed anchors + any characterized formatting, and flag any split or suspected bug. Write it all
to `findings/HANDOFF.md`.
