# HANDOFF — 05-ctdatetimeutil r1

## Landed
`src/lib/tests/unit/CtDateTimeUtil.test.mjs` — 73 tests, whole surface in ONE round (no split). No src/lib source touched.

## Gate
- `node --test src/lib/tests/` -> tests 210, pass 210, fail 0 (was 137 before; +73 here).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- Mutation check (scratch copy, lib untouched): broke zonedTimeToUtc refinement pass, isoWeek Monday offset, wrap-midnight
  isWorkingHour, quarter divisor, isDstInEffect std-offset -> each turned the suite red (1-3 failures).

## Method inventory (27 class statics + WEEKDAY_NAMES; all TESTED, none deferred)
formatDuration, humanizeDuration, parseNaive, addCalendar, businessDaysBetween, addBusinessDays, isoWeek, isoWeekYear,
quarter, dayOfYear, weekdayName, diffParts, formatDiff, toNaiveInput (bonus), formatOffset, isWorkingHour, zonedParts,
zoneOffsetMinutes, zonedTimeToUtc, formatInZone, zoneAbbrev, isDstInEffect, nextDstTransition, zoneInfo, instantInZones,
meetingGrid, overlapWindows, WEEKDAY_NAMES. Plus an aggregator test that every static === the named export.
(PRD said "28 statics": actual count is 27 functions + the WEEKDAY_NAMES constant = 28 members.)

## Fixed anchors
UTC-only epoch instants; tz = America/New_York, UTC, Asia/Kolkata, Australia/Sydney. NY spring-forward 2024-03-10T07:00Z,
fall-back 2024-11-03T06:00Z; JUL=2024-07-01T12:00Z, JAN=2024-01-15T12:00Z; leap day 2024-02-29; ISO-year edges
(2020/21, 2024/25, 2015/16). No Date.now(), no host tz; formatInZone always passes locale/tz explicitly.
(`overlapWindows`' default refDate uses today and is never exercised — refDate always passed.)

## Characterized (locked as-is, marked "characterize" in file)
- nextDstTransition: binary search ends <1s, `at` can carry sub-second residue (spring 2024 -> 07:00:00.438Z); asserted as a [t, t+1s] window.
- zonedTimeToUtc in spring-forward GAP (02:30 NY) -> 06:30Z (=01:30 EST, an hour BEFORE the gap); fall-back fold picks first (EDT) occurrence.
- meetingGrid on the NY spring-forward date: columns 1 and 2 share instant 06:00Z (wall hour 2 nonexistent).
- zoneAbbrev(Kolkata) = "GMT+5:30" (ICU en-US), bad tz -> "". zonedParts with bad tz throws RangeError.
- addCalendar 'months' overflows (Jan 31 + 1mo -> Mar 2 2024), Feb 29 + 1y -> Mar 1; invalid amount/unit returns an equal copy.
- formatDiff has no ms component: +500ms -> "0s", -500ms -> "-0s".
- humanizeDuration: fixed d/h/m/s/ms suffixes, no pluralization, days never roll up.
- instantInZones.local format "Jul 01, 2024, 22:30:00" (en-US, h23).

## Suspected bugs (none blocking; surfaced, NOT fixed)
- "-0s" from formatDiff for a negative sub-second diff is arguably wrong (cosmetic).
- Gap-time resolution in zonedTimeToUtc / meetingGrid (above) is arguably a quirk; typical convention is to shift forward.
- Environment dependence: abbreviation/ICU strings (EDT/EST, GMT+5:30) depend on Node's ICU; fine on current Node, would flag on a small-icu build.

## Repro
cd repo root; `node --test src/lib/tests/unit/CtDateTimeUtil.test.mjs`; `node --test src/lib/tests/`; `node scripts/build-all.mjs --check`.
