# Verifier verdict — 05-ctdatetimeutil r1 v1

## VERDICT: PASS

The 73-test suite is deterministic, exercises all 28 members, and turned red on 15 of 16 deliberate mutations (the survivor is an equivalent mutant, plus one test with a gap noted below). Only the test file was added. One non-lib e2e suite (color-picker) is red; it is unrelated to this round (see DoD 4).

## DoD evidence

### 1. Re-run
- `node --test src/lib/tests/` -> tests 210, pass 210, fail 0 (confirms the builder's claim; 73 of those are the new file, `node --test .../CtDateTimeUtil.test.mjs` -> 73/73).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- `node scripts/test-all.mjs` (ran to completion, ~5 min): lib step green (210/210); 9/10 suites pass; `Failed: src/tools/color-picker`.
  - Failing test: `color-picker.e2e.mjs:1665 remove-all clears the on-screen list ... surviving reload` (`toHaveCount(0)` on `color-row`, remove-all confirm dialog). Re-run ALONE: same single test fails again (91 passed, 1 failed), so it is reproducible, not a random flake. Not caused by this round: no tool references CtDateTimeUtil (grep over src outside lib/utils + tests/unit is empty); color-picker's `index.html` and e2e file are untouched by this round (mtimes Oct 3 15:40 / Oct 2 16:54, before the test file at Oct 3 20:11). Pre-existing color-picker issue; orchestrator should track it separately.

### 2. Determinism + coverage quality
- Grep of the test file for `Date.now|new Date()|Math.random|setTimeout|TZ|getTimezoneOffset|toLocale` -> no hits. Every `new Date(...)` takes an explicit epoch/UTC arg (`new Date(0)`, `Date.UTC`-built). Every tz call passes an explicit IANA id; `formatInZone` is always given tz, and locale is explicit or the lib default 'en-US'. `overlapWindows`/`meetingGrid` always pass refZone + refDateStr, so the `_todayStr()` default is never hit.
- Host-independence proven empirically: suite re-run with `TZ=Pacific/Auckland`, `America/Los_Angeles`, `Asia/Kolkata`, each with `LC_ALL=de_DE.UTF-8` -> 73/73 green every time.
- All 28 members actually exercised with value assertions (not name-checked): the 27 functions + WEEKDAY_NAMES, plus bonus `toNaiveInput`. Aggregator test checks static === named export for all 27 names. DST edges real (NY spring 07:00Z and fall 06:00Z at +-1s, gap + fold, Sydney southern hemisphere); leap edges real (2024-02-29, 1900/2000/2023, Feb28->Mar1 leap vs non-leap, 366/365-day years); ISO-week year boundaries real (2020/21, 2024/25, 2015/16).
- Independent recomputation (Python `datetime`/`zoneinfo`, not the lib): ISO week/year of 2024-07-01 = 27/2024, 2024-02-29 = 9, 2021-01-01 = 53/2020, 2015-12-31 = 53/2015, 2024-12-30 = 1/2025, 2016-01-03 = 53/2015; day-of-year 2024-02-29 = 60; NY 2024-03-10T06:59:59Z = 01:59:59-05:00 and 07:00:00Z = 03:00:00-04:00; NY 2024-11-03T06:00Z offset = -05:00; Kolkata of 2024-07-01T22:30Z = 2024-07-02 04:00+05:30; Sydney Jan offset = +11:00; 2024-02-29 -> 2024-03-04 = 4 calendar days (Fri+Mon = 2 business days). All match the test literals.
- Mutation testing on a SCRATCH COPY (scratchpad `mut/`; the real lib never touched). Pass/fail counts are of 73:

| Mutation | Result |
|---|---|
| isoWeek Thursday offset +3 -> +2 | RED (1) |
| isoWeekYear drop Thursday shift | RED (1) |
| quarter divisor 3 -> 4 | RED (1) |
| zonedTimeToUtc remove refinement pass | RED (3) |
| zonedTimeToUtc offset sign flip | RED (6) |
| businessDaysBetween start inclusive / end exclusive | RED (4 / 4) |
| addBusinessDays trunc -> round | RED (1) |
| addCalendar months clamp / weeks 6d / years +1 | RED (1 each) |
| dayOfYear off by one | RED (2) |
| formatOffset minutes mod | RED (4) |
| isWorkingHour wrap `\|\|`->`&&`; end exclusive -> inclusive | RED (2 / 4) |
| isDstInEffect std min->max; `>` -> `>=` | RED (3 / 2) |
| nextDstTransition bsearch branch; returns lo not hi | RED (1 / 3) |
| meetingGrid dayDelta -> 0; every->some; drop `cells.length>0` | RED (2 / 3 / 2) |
| overlapWindows drop trailing range | RED (2) |
| instantInZones dayDelta -> 0 | RED (2) |
| zoneAbbrev short -> long | RED (4) |
| isoWeek `ft` first-Thursday offset +3 -> +2 | SURVIVED — equivalent mutant (shift of 1 day is absorbed by `Math.round(.../7d)`), not a test gap |
| nextDstTransition coarse step 6h -> 7d | SURVIVED — weak spot: no test where two offset changes fall inside one coarse step; unrealistic for real zones, low value |
| formatInZone `opts.locale \|\| 'en-US'` -> `'en-US'` (locale ignored) | SURVIVED — **real gap**: the only non-en locale assertion (`de-DE`, `hourCycle:'h23'`, `'17:30'`) yields the same string in en-US, so the test cannot detect a locale-handling regression. A discriminating case would use a locale whose output differs (e.g. `de-DE` `month:'long'` -> "Juli", or `day/month` ordering). |

- No can't-fail asserts found beyond the locale one above. Tests are asserting concrete values, not just truthiness; sub-second window assertions for `nextDstTransition` also check offsets at +-1s so are not vacuous (the nd-hi mutant went red).

### 3. Quirk adjudication
| Quirk | Judgment |
|---|---|
| `nextDstTransition` sub-second residue (`at` up to <1s after the true instant) | Defensible. Binary search is documented "to the second"; returning `hi` is by-design. Tested as a [t, t+1s] window with offsets checked either side. Not a bug. |
| `zonedTimeToUtc` gap time (02:30 NY, 2024-03-10) -> 06:30Z (= 01:30 EST, an hour BEFORE the gap) | Genuine, minor quirk worth raising. I traced it: guess 02:30Z -> off1 -300 -> 07:30Z; off2 at 07:30Z is -240 != off1 -> ts = guess + 240min = 06:30Z. The common convention (Temporal "compatible", Luxon, java.time) shifts forward to 03:30 EDT = 07:30Z. Characterization is accurate and fine to lock; recommend a follow-up bug task (non-blocking). Fold (01:30 on 11-03 -> first/EDT 05:30Z) matches the standard "earlier" convention: correct. |
| `meetingGrid` columns 1 and 2 share instant 06:00Z on spring-forward | Direct consequence of the gap quirk above (hour-2 column renders as local 01:00). Cosmetic grid defect on one day/yr; same follow-up as above. Defensible to characterize. |
| `zoneAbbrev` Kolkata = "GMT+5:30", NY EDT/EST | Matches the lib's own comment ("PDT", "IST", or "GMT+5:30" per engine). Defensible, but engine-dependent (see ICU). |
| `addCalendar` months overflow (Jan 31 + 1mo -> Mar 2, 2024; Mar 3, 2023) and Feb 29 + 1y -> Mar 1 | Defensible: this is plain `setUTCMonth/FullYear` JS semantics; the doc says "naive model". A clamp-to-month-end would be friendlier for UI but this is a design choice, not a defect. |
| `formatDiff` negative sub-second -> "-0s" | Genuine cosmetic bug (sign set from `parts.sign` while all components are 0, and ms is dropped). Low severity; worth a note/fix task. Characterization correctly marked. |
| `humanizeDuration` no pluralization | Defensible: fixed compact suffixes (`1d`, `2d`), consistent with "1s"/"2s"; pluralization isn't applicable to this format. Not a bug. |

### ICU-portability assessment
- Env: Node 26.8.2, ICU 78.3, `icu_small=false` (full ICU). Tests that depend on ICU data: `zoneAbbrev` and `zoneInfo/instantInZones` abbrev ("EDT"/"EST"/"GMT+5:30"), `formatInZone` ('7/1/2024', 'July 1, 2024', de-DE '17:30'), `instantInZones.local` ("Jul 01, 2024, 22:30:00"), plus all IANA tz offset logic.
- Risk on a small-icu Node: modern Node (>=13) ships full-icu by default; small-icu only appears in custom builds. Even there, `en-US` is always present, so en-US string formats, EDT/EST/GMT+5:30 would typically hold; the `de-DE` formatInZone assertion is the only locale-sensitive one, and (see mutation survivor above) it is the weakest assertion. The core offset/DST logic uses `en-US` formatToParts + IANA tz data, which is in every ICU build, small-icu included (tz data is not locale data).
- Verdict: acceptable assumption for this repo (current Node full-ICU; the product itself requires `Intl` tz support in the browser). Not a blocker. Optional hardening: document the full-ICU assumption in the test header, or isolate the abbrev/locale-string assertions so a future ICU string change (e.g. a CLDR tweak to "GMT+5:30" rendering) is one clear test failure rather than scattered ones. I could not exercise an actual small-icu build here, so this part is reasoning, not measurement.

### 4. No lib source modified
- `git` is blocked; relied on: `build-all.mjs --check` 10/10 (no tool bundle drift) + mtimes: `src/lib/utils/CtDateTimeUtil.mjs` last modified Oct 2 21:51 (before the round); `src/lib/tests/unit/CtDateTimeUtil.test.mjs` Oct 3 20:11. `find src -newer CtDateTimeUtil.mjs` lists only regenerated tool `index.html` files (build-output bundle files touched by build-all, the pre-existing color-picker index Oct 3 15:40 included) and `src/lib/test-support/interaction.mjs` — all predate this round or are build artifacts; I did not diff them so I cannot positively rule out an incidental edit to `interaction.mjs`, but the 210/210 + 10/10 results show nothing broke. The lib module under test is unchanged (mtime) and my mutations ran only on scratch copies.

## Coverage-quality concerns (not FAILs)
1. `formatInZone` locale assertion cannot discriminate locales (mutation survived) — add a locale-distinguishing case.
2. No test where two DST changes fall inside one 6h coarse scan step in `nextDstTransition` (low value, unrealistic).
3. Default-arg paths (`new Date()` in `isDstInEffect`/`nextDstTransition`/`zoneInfo`, `_todayStr()`) intentionally untested for determinism — acceptable.
4. Two genuine (non-blocking) behaviors to hand to a follow-up task: gap-time resolution in `zonedTimeToUtc`/`meetingGrid`, and "-0s" in `formatDiff`.
5. Pre-existing color-picker e2e failure (remove-all test) — reproducible alone, unrelated; track separately.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs          # ~5 min; color-picker red
( cd src/tools/color-picker && npm run test:e2e )   # same single failure alone
for tz in Pacific/Auckland America/Los_Angeles Asia/Kolkata; do TZ=$tz LC_ALL=de_DE.UTF-8 node --test src/lib/tests/unit/CtDateTimeUtil.test.mjs; done
grep -nE "Date\.now|new Date\(\)|Math\.random|setTimeout|TZ|getTimezoneOffset|toLocale" src/lib/tests/unit/CtDateTimeUtil.test.mjs
# mutation: copy lib + test into a scratch dir (utils/ and tests/unit/), apply a one-line sed/python replace to the scratch lib, run node --test on the scratch test.
```
