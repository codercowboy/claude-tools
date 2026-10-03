// Unit tests for CtDateTimeUtil.mjs: duration formatters, naive calendar math, and the Intl-based tz/DST engine.
// Run: node --test src/lib/tests/
//
// DETERMINISM: every test uses FIXED epoch instants + EXPLICIT tz ids. No Date.now(), no host tz, no host locale
// (formatInZone passes locale explicitly). Naive (UTC-field) functions use UTC-built Dates only.
//
// FIXED ANCHORS (all UTC):
//   NY spring-forward 2024-03-10T07:00:00Z (02:00 EST -> 03:00 EDT); NY fall-back 2024-11-03T06:00:00Z
//   JUL = 2024-07-01T12:00:00Z (NY=EDT -04:00, Kolkata +05:30); JAN = 2024-01-15T12:00:00Z (NY=EST -05:00)
//   leap day 2024-02-29; tz: America/New_York, UTC, Asia/Kolkata (+05:30), Australia/Sydney (southern DST)
//
// CHARACTERIZE markers flag opinionated/surprising current behavior locked in as-is (not endorsed):
//  - nextDstTransition binary-searches to <1s, so `at` can carry sub-second residue (e.g. .438 ms) -> asserted as a window;
//  - zonedTimeToUtc on a spring-forward GAP wall time (02:30 NY) forward-shifts to 03:30 EDT = 07:30Z (#1014-O.1,
//    the "compatible" convention); meetingGrid on that date therefore shares the 07:00Z instant across columns 2 and 3;
//  - zoneAbbrev for Asia/Kolkata is "GMT+5:30" under en-US/ICU (no "IST"); bad zone -> "";
//  - addCalendar months overflows (Jan 31 + 1 month -> Mar 2 in 2024), not clamped to month end;
//  - formatDiff has no millisecond component (500ms diff -> "0s").
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CtDateTimeUtil, formatDuration, humanizeDuration,
  zoneOffsetMinutes, formatOffset, zonedParts, zonedTimeToUtc, formatInZone, zoneAbbrev,
  isWorkingHour, meetingGrid, overlapWindows, instantInZones, isDstInEffect, nextDstTransition, zoneInfo,
  parseNaive, addCalendar, businessDaysBetween, addBusinessDays, isoWeek, isoWeekYear, quarter, dayOfYear,
  weekdayName, diffParts, formatDiff, toNaiveInput, WEEKDAY_NAMES,
} from '../../utils/CtDateTimeUtil.mjs';

const NY = 'America/New_York';
const KOL = 'Asia/Kolkata';
const SYD = 'Australia/Sydney';
const U = (...a) => new Date(Date.UTC(...a));       // month is 0-based, like Date.UTC
const iso = (d) => d.toISOString();
const JUL = U(2024, 6, 1, 12);
const JAN = U(2024, 0, 15, 12);

// ------------------------------------------------------------ aggregator
test('CtDateTimeUtil: statics are the same functions as the named exports', () => {
  const names = ['formatDuration', 'humanizeDuration', 'zoneOffsetMinutes', 'formatOffset', 'zonedParts', 'zonedTimeToUtc',
    'formatInZone', 'zoneAbbrev', 'isWorkingHour', 'meetingGrid', 'overlapWindows', 'instantInZones', 'isDstInEffect',
    'nextDstTransition', 'zoneInfo', 'parseNaive', 'addCalendar', 'businessDaysBetween', 'addBusinessDays', 'isoWeek',
    'isoWeekYear', 'quarter', 'dayOfYear', 'weekdayName', 'diffParts', 'formatDiff', 'toNaiveInput'];
  const ns = { formatDuration, humanizeDuration, zoneOffsetMinutes, formatOffset, zonedParts, zonedTimeToUtc, formatInZone,
    zoneAbbrev, isWorkingHour, meetingGrid, overlapWindows, instantInZones, isDstInEffect, nextDstTransition, zoneInfo,
    parseNaive, addCalendar, businessDaysBetween, addBusinessDays, isoWeek, isoWeekYear, quarter, dayOfYear, weekdayName,
    diffParts, formatDiff, toNaiveInput };
  assert.equal(names.length, 27);
  for (const n of names) assert.equal(CtDateTimeUtil[n], ns[n], n);
  assert.equal(CtDateTimeUtil.WEEKDAY_NAMES, WEEKDAY_NAMES);
});

test('WEEKDAY_NAMES: Sunday-first, 7 entries', () => {
  assert.deepEqual(WEEKDAY_NAMES, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
});

// ------------------------------------------------------------ formatDuration
test('formatDuration: zero and sub-minute', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(59), '0:59');
});
test('formatDuration: scale boundaries 60s / 3599s / 3600s / 86400s', () => {
  assert.equal(formatDuration(60), '1:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3599), '59:59');
  assert.equal(formatDuration(3600), '1:00:00');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(86399), '23:59:59');
  assert.equal(formatDuration(86400), '24:00:00'); // hours do not roll into days
});
test('formatDuration: large value keeps accumulating hours', () => {
  assert.equal(formatDuration(360000), '100:00:00');
  assert.equal(formatDuration(1e6), '277:46:40');
});
test('formatDuration: negative and non-finite clamp to 0', () => {
  assert.equal(formatDuration(-1), '0:00');
  assert.equal(formatDuration(-3600), '0:00');
  assert.equal(formatDuration(-Infinity), '0:00');
  assert.equal(formatDuration(Infinity), '0:00');
  assert.equal(formatDuration(NaN), '0:00');
});
test('formatDuration: fractional seconds are rounded (half up)', () => {
  assert.equal(formatDuration(0.4), '0:00');
  assert.equal(formatDuration(0.5), '0:01');
  assert.equal(formatDuration(59.5), '1:00');     // rounding carries into the minute
  assert.equal(formatDuration(3599.5), '1:00:00'); // ...and into the hour
  assert.equal(formatDuration(65.4), '1:05');
});

// ------------------------------------------------------------ humanizeDuration
test('humanizeDuration: 0 -> "0ms"; non-finite -> ""', () => {
  assert.equal(humanizeDuration(0), '0ms');
  assert.equal(humanizeDuration(0.4), '0ms'); // rounds to 0
  assert.equal(humanizeDuration(NaN), '');
  assert.equal(humanizeDuration(Infinity), '');
  assert.equal(humanizeDuration(-Infinity), '');
});
test('humanizeDuration: single-unit boundaries', () => {
  assert.equal(humanizeDuration(1), '1ms');
  assert.equal(humanizeDuration(500), '500ms');
  assert.equal(humanizeDuration(999), '999ms');
  assert.equal(humanizeDuration(1000), '1s');
  assert.equal(humanizeDuration(60000), '1m');
  assert.equal(humanizeDuration(3600000), '1h');
  assert.equal(humanizeDuration(86400000), '1d');
});
test('humanizeDuration: part assembly, largest to smallest, zeros omitted', () => {
  assert.equal(humanizeDuration(90000), '1m 30s');
  assert.equal(humanizeDuration(93784004), '1d 2h 3m 4s 4ms');
  assert.equal(humanizeDuration(86400000 + 4000), '1d 4s');       // middle zeros skipped
  assert.equal(humanizeDuration(3600000 + 1), '1h 1ms');
  assert.equal(humanizeDuration(59999), '59s 999ms');
  assert.equal(humanizeDuration(2 * 86400000 + 3600000), '2d 1h');
});
test('humanizeDuration: no pluralization — units are fixed d/h/m/s/ms suffixes (characterize)', () => {
  assert.equal(humanizeDuration(1 * 86400000), '1d');
  assert.equal(humanizeDuration(2 * 86400000), '2d');
  assert.equal(humanizeDuration(1000), '1s');
  assert.equal(humanizeDuration(2000), '2s');
  assert.equal(humanizeDuration(400 * 86400000), '400d'); // days never roll into larger units
});
test('humanizeDuration: negative keeps a single leading "-"', () => {
  assert.equal(humanizeDuration(-500), '-500ms');
  assert.equal(humanizeDuration(-90000), '-1m 30s');
  assert.equal(humanizeDuration(-93784004), '-1d 2h 3m 4s 4ms');
});
test('humanizeDuration: fractional ms rounded first', () => {
  assert.equal(humanizeDuration(999.6), '1s');
  assert.equal(humanizeDuration(1500.4), '1s 500ms');
});

// ------------------------------------------------------------ parseNaive
test('parseNaive: datetime-local forms -> UTC-field Date', () => {
  assert.equal(iso(parseNaive('2024-02-29T13:45')), '2024-02-29T13:45:00.000Z');
  assert.equal(iso(parseNaive('2024-02-29T13:45:30')), '2024-02-29T13:45:30.000Z');
  assert.equal(iso(parseNaive('2024-02-29 13:45')), '2024-02-29T13:45:00.000Z'); // space separator accepted
  assert.equal(iso(parseNaive('2024-02-29')), '2024-02-29T00:00:00.000Z');       // date only
  assert.equal(iso(parseNaive('  2024-02-29  ')), '2024-02-29T00:00:00.000Z');   // trimmed
});
test('parseNaive: leap-day validity', () => {
  assert.ok(parseNaive('2024-02-29'));
  assert.equal(parseNaive('2023-02-29'), null);
  assert.equal(parseNaive('1900-02-29'), null); // century non-leap
  assert.ok(parseNaive('2000-02-29'));          // 400-year leap
});
test('parseNaive: out-of-range components rejected (no roll-over)', () => {
  for (const s of ['2024-13-01', '2024-00-10', '2024-04-31', '2024-02-30', '2024-01-32', '2024-01-01T24:00',
    '2024-01-01T25:00', '2024-01-01T10:60', '2024-01-01T10:00:60']) assert.equal(parseNaive(s), null, s);
});
test('parseNaive: malformed / non-string -> null', () => {
  for (const s of ['', '   ', 'garbage', '2024-1-1', '2024/01/01', '2024-01-01T10', '2024-01-01T10:00Z', '24-01-01']) {
    assert.equal(parseNaive(s), null, JSON.stringify(s));
  }
  for (const v of [null, undefined, 123, {}, new Date(0)]) assert.equal(parseNaive(v), null);
});

// ------------------------------------------------------------ weekdayName / dayOfYear / quarter
test('weekdayName: known dates', () => {
  assert.equal(weekdayName(U(2024, 1, 29)), 'Thursday');
  assert.equal(weekdayName(U(2024, 6, 1)), 'Monday');
  assert.equal(weekdayName(U(2024, 6, 7)), 'Sunday');
  assert.equal(weekdayName(U(2024, 6, 6)), 'Saturday');
  assert.equal(weekdayName(new Date(0)), 'Thursday'); // 1970-01-01
});
test('dayOfYear: leap and non-leap boundaries', () => {
  assert.equal(dayOfYear(U(2024, 0, 1)), 1);
  assert.equal(dayOfYear(U(2024, 0, 31)), 31);
  assert.equal(dayOfYear(U(2024, 1, 28)), 59);
  assert.equal(dayOfYear(U(2024, 1, 29)), 60);
  assert.equal(dayOfYear(U(2024, 2, 1)), 61);
  assert.equal(dayOfYear(U(2024, 11, 31)), 366);
  assert.equal(dayOfYear(U(2023, 2, 1)), 60);
  assert.equal(dayOfYear(U(2023, 11, 31)), 365);
});
test('dayOfYear: ignores time-of-day', () => {
  assert.equal(dayOfYear(U(2024, 1, 29, 0, 0, 0)), 60);
  assert.equal(dayOfYear(U(2024, 1, 29, 23, 59, 59, 999)), 60);
});
test('quarter: month boundaries', () => {
  const q = (m) => quarter(U(2024, m, 15));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(q), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  assert.equal(quarter(U(2024, 2, 31, 23, 59, 59)), 1);
  assert.equal(quarter(U(2024, 3, 1)), 2);
});

// ------------------------------------------------------------ isoWeek / isoWeekYear
test('isoWeek / isoWeekYear: year-boundary cases', () => {
  const cases = [
    // [Date, week, isoYear]
    [U(2024, 0, 1), 1, 2024],    // Mon -> week 1
    [U(2024, 11, 29), 52, 2024], // Sun
    [U(2024, 11, 30), 1, 2025],  // Mon: belongs to 2025-W01
    [U(2024, 11, 31), 1, 2025],
    [U(2025, 0, 1), 1, 2025],
    [U(2021, 0, 1), 53, 2020],   // Fri: 2020-W53
    [U(2021, 0, 3), 53, 2020],   // Sun
    [U(2021, 0, 4), 1, 2021],    // Mon
    [U(2020, 11, 31), 53, 2020],
    [U(2015, 11, 31), 53, 2015], // 2015 has 53 weeks
    [U(2016, 0, 3), 53, 2015],
    [U(2026, 0, 1), 1, 2026],    // Thu
    [U(2024, 1, 29), 9, 2024],   // leap day
    [U(2024, 6, 1), 27, 2024],
  ];
  for (const [d, w, y] of cases) {
    assert.equal(isoWeek(d), w, 'week ' + iso(d));
    assert.equal(isoWeekYear(d), y, 'year ' + iso(d));
  }
});
test('isoWeek: time-of-day does not change the week', () => {
  assert.equal(isoWeek(U(2024, 11, 29, 23, 59, 59)), 52);
  assert.equal(isoWeek(U(2024, 11, 30, 0, 0, 0)), 1);
});

// ------------------------------------------------------------ businessDaysBetween
test('businessDaysBetween: week spans (Mon 2024-07-01 anchor)', () => {
  const mon = U(2024, 6, 1);
  assert.equal(businessDaysBetween(mon, mon), 0);
  assert.equal(businessDaysBetween(mon, U(2024, 6, 2)), 1);
  assert.equal(businessDaysBetween(mon, U(2024, 6, 5)), 4);  // Mon -> Fri
  assert.equal(businessDaysBetween(mon, U(2024, 6, 6)), 4);  // -> Sat adds nothing
  assert.equal(businessDaysBetween(mon, U(2024, 6, 7)), 4);  // -> Sun adds nothing
  assert.equal(businessDaysBetween(mon, U(2024, 6, 8)), 5);  // -> next Mon
  assert.equal(businessDaysBetween(mon, U(2024, 6, 15)), 10);
});
test('businessDaysBetween: weekend starts, antisymmetry, ignores time-of-day', () => {
  assert.equal(businessDaysBetween(U(2024, 6, 6), U(2024, 6, 8)), 1);  // Sat -> Mon
  assert.equal(businessDaysBetween(U(2024, 6, 6), U(2024, 6, 7)), 0);  // Sat -> Sun
  assert.equal(businessDaysBetween(U(2024, 6, 5), U(2024, 6, 8)), 1);  // Fri -> Mon
  assert.equal(businessDaysBetween(U(2024, 6, 8), U(2024, 6, 1)), -5);
  assert.equal(businessDaysBetween(U(2024, 6, 1, 23, 59), U(2024, 6, 2, 0, 1)), 1);
  assert.equal(businessDaysBetween(U(2024, 6, 1, 23), U(2024, 6, 1, 1)), 0); // same date
});
test('businessDaysBetween: across leap day', () => {
  // Thu 2024-02-29 -> Mon 2024-03-04: Fri + Mon = 2
  assert.equal(businessDaysBetween(U(2024, 1, 29), U(2024, 2, 4)), 2);
  // Wed 2024-02-28 -> Fri 2024-03-01 = Thu, Fri = 2
  assert.equal(businessDaysBetween(U(2024, 1, 28), U(2024, 2, 1)), 2);
});

// ------------------------------------------------------------ addBusinessDays
test('addBusinessDays: skips weekends forward/backward', () => {
  assert.equal(iso(addBusinessDays(U(2024, 6, 5), 1)), '2024-07-08T00:00:00.000Z');  // Fri +1 -> Mon
  assert.equal(iso(addBusinessDays(U(2024, 6, 1), -1)), '2024-06-28T00:00:00.000Z'); // Mon -1 -> Fri
  assert.equal(iso(addBusinessDays(U(2024, 6, 1), 5)), '2024-07-08T00:00:00.000Z');
  assert.equal(iso(addBusinessDays(U(2024, 6, 1), 10)), '2024-07-15T00:00:00.000Z');
  assert.equal(iso(addBusinessDays(U(2024, 6, 6), 1)), '2024-07-08T00:00:00.000Z');  // Sat +1 -> Mon
  assert.equal(iso(addBusinessDays(U(2024, 6, 7), -1)), '2024-07-05T00:00:00.000Z'); // Sun -1 -> Fri
});
test('addBusinessDays: n=0, truncation, time-of-day preserved, input not mutated', () => {
  const d = U(2024, 6, 5, 14, 30, 15);
  assert.equal(iso(addBusinessDays(d, 0)), '2024-07-05T14:30:15.000Z');
  assert.equal(iso(addBusinessDays(d, 1)), '2024-07-08T14:30:15.000Z');
  assert.equal(iso(addBusinessDays(U(2024, 6, 1), 2.9)), '2024-07-03T00:00:00.000Z'); // trunc -> 2
  assert.equal(iso(addBusinessDays(U(2024, 6, 1), -2.9)), '2024-06-27T00:00:00.000Z');
  assert.equal(iso(d), '2024-07-05T14:30:15.000Z');
});
test('addBusinessDays: across leap day; round-trips with businessDaysBetween', () => {
  assert.equal(iso(addBusinessDays(U(2024, 1, 28), 2)), '2024-03-01T00:00:00.000Z'); // Wed +2 = Fri
  assert.equal(iso(addBusinessDays(U(2024, 1, 29), 1)), '2024-03-01T00:00:00.000Z');
  const start = U(2024, 1, 29);
  assert.equal(businessDaysBetween(start, addBusinessDays(start, 17)), 17);
});

// ------------------------------------------------------------ addCalendar
test('addCalendar: days / weeks / hours / minutes across leap day', () => {
  assert.equal(iso(addCalendar(U(2024, 1, 28), 1, 'days')), '2024-02-29T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 1, 29), 1, 'days')), '2024-03-01T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2023, 1, 28), 1, 'days')), '2023-03-01T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 1, 29), -1, 'days')), '2024-02-28T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 1, 29), 1, 'weeks')), '2024-03-07T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 1, 29, 23), 2, 'hours')), '2024-03-01T01:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 1, 29, 23, 59), 2, 'minutes')), '2024-03-01T00:01:00.000Z');
});
test('addCalendar: years and months (naive fields; 2024-03-10 spring-forward date is NOT special)', () => {
  assert.equal(iso(addCalendar(U(2024, 1, 29), 1, 'years')), '2025-03-01T00:00:00.000Z'); // Feb 29 + 1y rolls to Mar 1
  assert.equal(iso(addCalendar(U(2024, 1, 29), 4, 'years')), '2028-02-29T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 0, 15), 1, 'months')), '2024-02-15T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 11, 15), 1, 'months')), '2025-01-15T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 0, 15), -1, 'months')), '2023-12-15T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 0, 15), 12, 'months')), '2025-01-15T00:00:00.000Z');
  // characterize: overflow, not clamp to end of month
  assert.equal(iso(addCalendar(U(2024, 0, 31), 1, 'months')), '2024-03-02T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2023, 0, 31), 1, 'months')), '2023-03-03T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 2, 10, 6, 59), 1, 'days')), '2024-03-11T06:59:00.000Z'); // 24h exactly, no DST
});
test('addCalendar: business-days delegates; string amount coerced', () => {
  assert.equal(iso(addCalendar(U(2024, 6, 5), 1, 'business-days')), '2024-07-08T00:00:00.000Z');
  assert.equal(iso(addCalendar(U(2024, 6, 1), '2', 'days')), '2024-07-03T00:00:00.000Z');
});
test('addCalendar: invalid amount / unknown unit return an equal COPY; input never mutated', () => {
  const d = U(2024, 1, 29, 5);
  for (const r of [addCalendar(d, NaN, 'days'), addCalendar(d, Infinity, 'days'), addCalendar(d, 'x', 'days'),
    addCalendar(d, 1, 'fortnights'), addCalendar(d, 1, undefined)]) {
    assert.equal(iso(r), '2024-02-29T05:00:00.000Z');
    assert.notEqual(r, d);
  }
  addCalendar(d, 1, 'years'); addCalendar(d, 1, 'months');
  assert.equal(iso(d), '2024-02-29T05:00:00.000Z');
});

// ------------------------------------------------------------ diffParts / formatDiff
test('diffParts: forward diff components + totals', () => {
  const p = diffParts(new Date(0), new Date(90061001)); // 1d 1h 1m 1s 1ms
  assert.deepEqual({ ...p, totalMinutes: undefined, totalHours: undefined, totalDays: undefined }, {
    sign: 1, totalMs: 90061001, days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 1,
    totalSeconds: 90061.001, totalMinutes: undefined, totalHours: undefined, totalDays: undefined,
  });
  assert.equal(p.totalMinutes, 90061001 / 60000);
  assert.equal(p.totalHours, 90061001 / 3600000);
  assert.equal(p.totalDays, 90061001 / 86400000);
});
test('diffParts: negative flips sign of totals but components stay absolute', () => {
  const p = diffParts(new Date(90061001), new Date(0));
  assert.equal(p.sign, -1);
  assert.equal(p.totalMs, -90061001);
  assert.deepEqual([p.days, p.hours, p.minutes, p.seconds, p.milliseconds], [1, 1, 1, 1, 1]);
  assert.equal(p.totalSeconds, -90061.001);
  assert.equal(p.totalDays, -(90061001 / 86400000));
});
test('diffParts: zero diff', () => {
  const p = diffParts(U(2024, 1, 29), U(2024, 1, 29));
  assert.equal(p.sign, 0);
  assert.deepEqual([p.totalMs, p.days, p.hours, p.minutes, p.seconds, p.milliseconds], [0, 0, 0, 0, 0, 0]);
  assert.equal(p.totalSeconds, 0);
});
test('diffParts: leap-day span is exactly 1 day; Feb 28 -> Mar 1 leap vs non-leap', () => {
  assert.equal(diffParts(U(2024, 1, 28), U(2024, 1, 29)).days, 1);
  assert.equal(diffParts(U(2024, 1, 28), U(2024, 2, 1)).days, 2);
  assert.equal(diffParts(U(2023, 1, 28), U(2023, 2, 1)).days, 1);
  assert.equal(diffParts(U(2024, 0, 1), U(2025, 0, 1)).days, 366);
  assert.equal(diffParts(U(2023, 0, 1), U(2024, 0, 1)).days, 365);
});
test('formatDiff: sign, components, zero omission', () => {
  const a = new Date(0), b = new Date(90061001);
  assert.equal(formatDiff(diffParts(a, b)), '1d 1h 1m 1s');
  assert.equal(formatDiff(diffParts(b, a)), '-1d 1h 1m 1s');
  assert.equal(formatDiff(diffParts(a, new Date(86400000 + 5000))), '1d 5s');
  assert.equal(formatDiff(diffParts(a, new Date(3600000))), '1h');
  assert.equal(formatDiff(diffParts(a, a)), '0s');
});
test('formatDiff: sub-second has no ms component; negative sub-second is "0s" not "-0s" [#1014-O]', () => {
  assert.equal(formatDiff(diffParts(new Date(0), new Date(500))), '0s');
  assert.equal(formatDiff(diffParts(new Date(500), new Date(0))), '0s'); // #1014-O: no signed zero
});

// ------------------------------------------------------------ toNaiveInput (bonus public static)
test('toNaiveInput: formats UTC fields; round-trips with parseNaive', () => {
  const d = U(2024, 1, 29, 3, 4, 5);
  assert.equal(toNaiveInput(d), '2024-02-29T03:04');
  assert.equal(toNaiveInput(d, true), '2024-02-29T03:04:05');
  assert.equal(iso(parseNaive(toNaiveInput(d, true))), iso(d));
});

// ------------------------------------------------------------ formatOffset
test('formatOffset: minutes -> ±HH:MM', () => {
  assert.equal(formatOffset(0), '+00:00');
  assert.equal(formatOffset(330), '+05:30');
  assert.equal(formatOffset(-480), '-08:00');
  assert.equal(formatOffset(-300), '-05:00');
  assert.equal(formatOffset(345), '+05:45');   // Nepal
  assert.equal(formatOffset(840), '+14:00');
  assert.equal(formatOffset(-570), '-09:30');
  assert.equal(formatOffset(-30), '-00:30');
  assert.equal(formatOffset(5), '+00:05');
});

// ------------------------------------------------------------ isWorkingHour
test('isWorkingHour: default 9-17 window, end exclusive', () => {
  assert.equal(isWorkingHour(8), false);
  assert.equal(isWorkingHour(9), true);
  assert.equal(isWorkingHour(16), true);
  assert.equal(isWorkingHour(17), false);
  assert.equal(isWorkingHour(12, {}), true);               // missing start/end -> defaults
  assert.equal(isWorkingHour(12, null), true);
  assert.equal(isWorkingHour(8, { start: 8 }), true);      // partial config: start custom, end default 17
});
test('isWorkingHour: custom, wrapping and empty windows', () => {
  const w = { start: 22, end: 6 };
  for (const h of [22, 23, 0, 5]) assert.equal(isWorkingHour(h, w), true, 'h' + h);
  for (const h of [6, 12, 21]) assert.equal(isWorkingHour(h, w), false, 'h' + h);
  assert.equal(isWorkingHour(5, { start: 5, end: 5 }), false);   // empty window
  assert.equal(isWorkingHour(0, { start: 0, end: 24 }), true);
  assert.equal(isWorkingHour(23, { start: 0, end: 24 }), true);
  assert.equal(isWorkingHour(10, { start: NaN, end: NaN }), true); // non-finite -> defaults
});

// ------------------------------------------------------------ zonedParts
test('zonedParts: UTC and half-hour zone', () => {
  assert.deepEqual(zonedParts(U(2024, 0, 1), 'UTC'),
    { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0, weekday: 1, weekdayName: 'Monday' }); // midnight stays hour 0
  assert.deepEqual(zonedParts(new Date(0), KOL),
    { year: 1970, month: 1, day: 1, hour: 5, minute: 30, second: 0, weekday: 4, weekdayName: 'Thursday' });
});
test('zonedParts: NY either side of spring-forward (1:59:59 EST -> 3:00:00 EDT)', () => {
  assert.deepEqual(zonedParts(U(2024, 2, 10, 6, 59, 59), NY),
    { year: 2024, month: 3, day: 10, hour: 1, minute: 59, second: 59, weekday: 0, weekdayName: 'Sunday' });
  assert.deepEqual(zonedParts(U(2024, 2, 10, 7, 0, 0), NY),
    { year: 2024, month: 3, day: 10, hour: 3, minute: 0, second: 0, weekday: 0, weekdayName: 'Sunday' });
});
test('zonedParts: local date differs from UTC date (day rollover) and leap day', () => {
  const p = zonedParts(U(2024, 1, 29, 23, 0), KOL); // 04:30 on Mar 1
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute, p.weekdayName], [2024, 3, 1, 4, 30, 'Friday']);
  const q = zonedParts(U(2024, 2, 1, 3, 0), NY);    // still Feb 29 in NY (22:00 EST)
  assert.deepEqual([q.month, q.day, q.hour, q.weekdayName], [2, 29, 22, 'Thursday']);
});
test('zonedParts: invalid tz throws RangeError', () => {
  assert.throws(() => zonedParts(JUL, 'Not/AZone'), RangeError);
});

// ------------------------------------------------------------ zoneOffsetMinutes
test('zoneOffsetMinutes: UTC, Kolkata, NY across the DST boundary', () => {
  assert.equal(zoneOffsetMinutes(JUL, 'UTC'), 0);
  assert.equal(zoneOffsetMinutes(JUL, KOL), 330);
  assert.equal(zoneOffsetMinutes(JAN, KOL), 330);
  assert.equal(zoneOffsetMinutes(JAN, NY), -300);
  assert.equal(zoneOffsetMinutes(JUL, NY), -240);
  assert.equal(zoneOffsetMinutes(U(2024, 2, 10, 6, 59, 59), NY), -300); // spring
  assert.equal(zoneOffsetMinutes(U(2024, 2, 10, 7, 0, 0), NY), -240);
  assert.equal(zoneOffsetMinutes(U(2024, 10, 3, 5, 59, 59), NY), -240); // fall
  assert.equal(zoneOffsetMinutes(U(2024, 10, 3, 6, 0, 0), NY), -300);
});
test('zoneOffsetMinutes: southern-hemisphere DST (Sydney +11 Jan, +10 Jul)', () => {
  assert.equal(zoneOffsetMinutes(JAN, SYD), 660);
  assert.equal(zoneOffsetMinutes(JUL, SYD), 600);
});

// ------------------------------------------------------------ zonedTimeToUtc
test('zonedTimeToUtc: unambiguous wall times', () => {
  assert.equal(iso(zonedTimeToUtc(2024, 7, 1, 12, 0, 0, NY)), '2024-07-01T16:00:00.000Z'); // EDT
  assert.equal(iso(zonedTimeToUtc(2024, 1, 15, 12, 0, 0, NY)), '2024-01-15T17:00:00.000Z'); // EST
  assert.equal(iso(zonedTimeToUtc(2024, 7, 1, 12, 0, undefined, NY)), '2024-07-01T16:00:00.000Z'); // seconds optional
  assert.equal(iso(zonedTimeToUtc(2024, 1, 1, 5, 30, 0, KOL)), '2024-01-01T00:00:00.000Z');
  assert.equal(iso(zonedTimeToUtc(2024, 2, 29, 12, 34, 56, 'UTC')), '2024-02-29T12:34:56.000Z');
  assert.equal(iso(zonedTimeToUtc(2024, 3, 10, 3, 30, 0, NY)), '2024-03-10T07:30:00.000Z'); // just after spring-forward
  assert.equal(iso(zonedTimeToUtc(2024, 3, 10, 1, 30, 0, NY)), '2024-03-10T06:30:00.000Z'); // just before
});
test('zonedTimeToUtc: DST gap forward-shifts; ambiguous fold picks the earlier instant [#1014-O.1]', () => {
  // 02:30 does not exist in NY on 2024-03-10 -> forward-shift ("compatible"): 03:30 EDT = 07:30Z,
  // i.e. the SAME instant as an explicit 03:30 (not a collapse back to 01:30 EST).
  assert.equal(iso(zonedTimeToUtc(2024, 3, 10, 2, 30, 0, NY)), '2024-03-10T07:30:00.000Z');
  assert.equal(iso(zonedTimeToUtc(2024, 3, 10, 2, 30, 0, NY)), iso(zonedTimeToUtc(2024, 3, 10, 3, 30, 0, NY)));
  // Southern hemisphere (positive offset): Sydney springs forward 2024-10-06, 02:30 -> 03:30 AEDT.
  assert.equal(iso(zonedTimeToUtc(2024, 10, 6, 2, 30, 0, SYD)), '2024-10-05T16:30:00.000Z');
  assert.equal(iso(zonedTimeToUtc(2024, 10, 6, 2, 30, 0, SYD)), iso(zonedTimeToUtc(2024, 10, 6, 3, 30, 0, SYD)));
  // 01:30 occurs twice on 2024-11-03; implementation picks the first (EDT) = 05:30Z.
  assert.equal(iso(zonedTimeToUtc(2024, 11, 3, 1, 30, 0, NY)), '2024-11-03T05:30:00.000Z');
});
test('zonedTimeToUtc: round-trips through zonedParts for non-DST-edge times', () => {
  for (const [tz, y, mo, d, h] of [[NY, 2024, 7, 1, 9], [KOL, 2024, 2, 29, 23], ['UTC', 2024, 12, 31, 23], [SYD, 2024, 1, 15, 8]]) {
    const p = zonedParts(zonedTimeToUtc(y, mo, d, h, 15, 0, tz), tz);
    assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute], [y, mo, d, h, 15], tz);
  }
});

// ------------------------------------------------------------ formatInZone
test('formatInZone: explicit locale + options', () => {
  assert.equal(formatInZone(JUL, NY), '7/1/2024');                       // default en-US date only
  assert.equal(formatInZone(JUL, NY, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), '08:00');
  assert.equal(formatInZone(JUL, 'UTC', { year: 'numeric', month: '2-digit', day: '2-digit' }), '07/01/2024');
  assert.equal(formatInZone(JUL, KOL, { locale: 'de-DE', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), '17:30');
  assert.equal(formatInZone(JUL, NY, { month: 'long', day: 'numeric', year: 'numeric' }), 'July 1, 2024');
  assert.equal(formatInZone(U(2024, 1, 29, 23), KOL, { weekday: 'long', locale: 'en-US' }), 'Friday'); // tz shifts the day
});

// ------------------------------------------------------------ zoneAbbrev
test('zoneAbbrev: NY standard/daylight, UTC, Kolkata (characterize), bad zone', () => {
  assert.equal(zoneAbbrev(JUL, NY), 'EDT');
  assert.equal(zoneAbbrev(JAN, NY), 'EST');
  assert.equal(zoneAbbrev(JUL, 'UTC'), 'UTC');
  assert.equal(zoneAbbrev(JUL, KOL), 'GMT+5:30'); // characterize: ICU gives numeric, not "IST"
  assert.equal(zoneAbbrev(JUL, 'Bad/Zone'), '');  // swallows RangeError
});

// ------------------------------------------------------------ isDstInEffect
test('isDstInEffect: NY, UTC, Kolkata, Sydney (southern hemisphere)', () => {
  assert.equal(isDstInEffect(NY, JUL), true);
  assert.equal(isDstInEffect(NY, JAN), false);
  assert.equal(isDstInEffect('UTC', JUL), false);
  assert.equal(isDstInEffect(KOL, JUL), false);
  assert.equal(isDstInEffect(SYD, JAN), true);
  assert.equal(isDstInEffect(SYD, JUL), false);
});
test('isDstInEffect: exact transition boundaries in NY', () => {
  assert.equal(isDstInEffect(NY, U(2024, 2, 10, 6, 59, 59)), false);
  assert.equal(isDstInEffect(NY, U(2024, 2, 10, 7, 0, 0)), true);
  assert.equal(isDstInEffect(NY, U(2024, 10, 3, 5, 59, 59)), true);
  assert.equal(isDstInEffect(NY, U(2024, 10, 3, 6, 0, 0)), false);
});

// ------------------------------------------------------------ nextDstTransition
test('nextDstTransition: NY spring-forward found from Jan 1 (within 1s of 07:00:00Z)', () => {
  const t = nextDstTransition(NY, U(2024, 0, 1));
  assert.equal(t.offsetBefore, -300);
  assert.equal(t.offsetAfter, -240);
  // characterize: binary search stops at <1s so `at` may carry sub-second residue after the true instant
  const trueMs = Date.UTC(2024, 2, 10, 7, 0, 0);
  assert.ok(t.at.getTime() >= trueMs && t.at.getTime() <= trueMs + 1000, iso(t.at));
  assert.equal(zoneOffsetMinutes(new Date(t.at.getTime()), NY), -240);
  assert.equal(zoneOffsetMinutes(new Date(trueMs - 1000), NY), -300);
});
test('nextDstTransition: NY fall-back found from June 1', () => {
  const t = nextDstTransition(NY, U(2024, 5, 1));
  assert.equal(t.offsetBefore, -240);
  assert.equal(t.offsetAfter, -300);
  const trueMs = Date.UTC(2024, 10, 3, 6, 0, 0);
  assert.ok(t.at.getTime() >= trueMs && t.at.getTime() <= trueMs + 1000, iso(t.at));
});
test('nextDstTransition: Sydney southern-hemisphere (April fall-back, -> standard)', () => {
  const t = nextDstTransition(SYD, U(2024, 0, 15));
  assert.equal(t.offsetBefore, 660);
  assert.equal(t.offsetAfter, 600);
  assert.equal(t.at.getUTCFullYear(), 2024);
  assert.equal(t.at.getUTCMonth(), 3); // April
});
test('nextDstTransition: null for no-DST zones and for a too-short maxDays window', () => {
  assert.equal(nextDstTransition('UTC', U(2024, 0, 1)), null);
  assert.equal(nextDstTransition(KOL, U(2024, 0, 1)), null);
  assert.equal(nextDstTransition(NY, U(2024, 0, 1), 30), null);
});

// ------------------------------------------------------------ zoneInfo
test('zoneInfo: NY in July — full shape', () => {
  const z = zoneInfo(NY, JUL);
  assert.equal(z.tz, NY);
  assert.equal(z.offsetMinutes, -240);
  assert.equal(z.offsetLabel, '-04:00');
  assert.equal(z.abbrev, 'EDT');
  assert.equal(z.dst, true);
  assert.equal(z.next.offsetBefore, -240);
  assert.equal(z.next.offsetAfter, -300);
  const fb = Date.UTC(2024, 10, 3, 6, 0, 0);
  assert.ok(z.next.at.getTime() >= fb && z.next.at.getTime() <= fb + 1000);
  assert.deepEqual(z.parts, { year: 2024, month: 7, day: 1, hour: 8, minute: 0, second: 0, weekday: 1, weekdayName: 'Monday' });
});
test('zoneInfo: Kolkata (half-hour, no DST) and UTC', () => {
  assert.deepEqual(zoneInfo(KOL, JUL), {
    tz: KOL, offsetMinutes: 330, offsetLabel: '+05:30', abbrev: 'GMT+5:30', dst: false, next: null,
    parts: { year: 2024, month: 7, day: 1, hour: 17, minute: 30, second: 0, weekday: 1, weekdayName: 'Monday' },
  });
  const u = zoneInfo('UTC', JUL);
  assert.deepEqual([u.offsetMinutes, u.offsetLabel, u.abbrev, u.dst, u.next], [0, '+00:00', 'UTC', false, null]);
});

// ------------------------------------------------------------ instantInZones
test('instantInZones: one instant across UTC / NY / Kolkata with day-delta', () => {
  const r = instantInZones(U(2024, 6, 1, 22, 30), ['UTC', NY, KOL]);
  assert.deepEqual(r.map((x) => x.tz), ['UTC', NY, KOL]);
  assert.deepEqual(r.map((x) => x.offsetMinutes), [0, -240, 330]);
  assert.deepEqual(r.map((x) => x.offsetLabel), ['+00:00', '-04:00', '+05:30']);
  assert.deepEqual(r.map((x) => x.abbrev), ['UTC', 'EDT', 'GMT+5:30']);
  assert.deepEqual(r.map((x) => x.weekdayName), ['Monday', 'Monday', 'Tuesday']);
  assert.deepEqual(r.map((x) => x.dayDelta), [0, 0, 1]);
  // characterize: `local` is en-US "Mon DD, YYYY, HH:mm:ss" (h23)
  assert.deepEqual(r.map((x) => x.local), ['Jul 01, 2024, 22:30:00', 'Jul 01, 2024, 18:30:00', 'Jul 02, 2024, 04:00:00']);
  assert.equal(r[2].parts.hour, 4);
  assert.equal(r[2].parts.minute, 0);
});
test('instantInZones: negative day-delta and empty list', () => {
  const r = instantInZones(U(2024, 6, 1, 2, 0), [NY]); // 22:00 prior day in NY
  assert.equal(r[0].dayDelta, -1);
  assert.equal(r[0].weekdayName, 'Sunday');
  assert.deepEqual(instantInZones(JUL, []), []);
});

// ------------------------------------------------------------ meetingGrid
test('meetingGrid: structure + two-zone cells (ref NY, 2024-07-01)', () => {
  const g = meetingGrid(['UTC', NY], { start: 9, end: 17 }, NY, '2024-07-01');
  assert.equal(g.refZone, NY);
  assert.equal(g.refDateStr, '2024-07-01');
  assert.equal(g.columns.length, 24);
  assert.deepEqual(g.columns.map((c) => c.hour), [...Array(24).keys()]);
  const c9 = g.columns[9];
  assert.equal(iso(c9.instant), '2024-07-01T13:00:00.000Z');
  assert.equal(c9.allWorking, true);
  assert.deepEqual(c9.cells, [
    { tz: 'UTC', localHour: 13, localMinute: 0, working: true, dayDelta: 0, offsetMinutes: 0 },
    { tz: NY, localHour: 9, localMinute: 0, working: true, dayDelta: 0, offsetMinutes: -240 },
  ]);
  const c23 = g.columns[23];
  assert.equal(iso(c23.instant), '2024-07-02T03:00:00.000Z');
  assert.equal(c23.allWorking, false);
  assert.deepEqual(c23.cells.map((c) => [c.localHour, c.dayDelta, c.working]), [[3, 1, false], [23, 0, false]]);
});
test('meetingGrid: half-hour zone reports localMinute 30', () => {
  const g = meetingGrid([KOL], { start: 9, end: 17 }, 'UTC', '2024-07-01');
  const c = g.columns[0].cells[0];
  assert.deepEqual([c.localHour, c.localMinute, c.offsetMinutes, c.dayDelta], [5, 30, 330, 0]);
  assert.equal(g.columns[18].cells[0].dayDelta, 0); // 18:00Z = 23:30 same day; 19:00Z -> next day
  assert.equal(g.columns[19].cells[0].dayDelta, 1);
});
test('meetingGrid: empty zone list -> no column is allWorking', () => {
  const g = meetingGrid([], {}, 'UTC', '2024-07-01');
  assert.equal(g.columns.length, 24);
  assert.deepEqual(g.columns[0].cells, []);
  assert.equal(g.columns.some((c) => c.allWorking), false);
  assert.equal(iso(g.columns[0].instant), '2024-07-01T00:00:00.000Z');
});
test('meetingGrid: DST spring-forward day in NY (gap forward-shifts) [#1014-O.1]', () => {
  const g = meetingGrid([NY], { start: 9, end: 17 }, NY, '2024-03-10');
  assert.equal(iso(g.columns[0].instant), '2024-03-10T05:00:00.000Z'); // 00:00 EST
  assert.equal(iso(g.columns[1].instant), '2024-03-10T06:00:00.000Z'); // 01:00 EST
  // nonexistent 02:00 forward-shifts to 03:00 EDT -> columns 2 and 3 now share the 07:00Z instant
  // (a duplicate is unavoidable: the spring-forward day has only 23 real hours).
  assert.equal(iso(g.columns[2].instant), '2024-03-10T07:00:00.000Z');
  assert.equal(iso(g.columns[3].instant), '2024-03-10T07:00:00.000Z'); // 03:00 EDT
  assert.equal(g.columns[9].cells[0].offsetMinutes, -240);
  assert.equal(g.columns[0].cells[0].offsetMinutes, -300);
});

// ------------------------------------------------------------ overlapWindows
test('overlapWindows: UTC+NY in reference UTC vs NY frames', () => {
  const wh = { start: 9, end: 17 };
  assert.deepEqual(overlapWindows(['UTC', NY], wh, 'UTC', '2024-07-01'), [{ startHour: 13, endHour: 17 }]);
  assert.deepEqual(overlapWindows(['UTC', NY], wh, NY, '2024-07-01'), [{ startHour: 9, endHour: 13 }]);
});
test('overlapWindows: half-hour zone (Kolkata+UTC) -> 09:00-12:00 UTC (whole hours only)', () => {
  assert.deepEqual(overlapWindows([KOL, 'UTC'], { start: 9, end: 17 }, 'UTC', '2024-07-01'), [{ startHour: 9, endHour: 12 }]);
});
test('overlapWindows: no overlap (Tokyo+NY), empty zones, single zone', () => {
  const wh = { start: 9, end: 17 };
  assert.deepEqual(overlapWindows(['Asia/Tokyo', NY], wh, 'UTC', '2024-07-01'), []);
  assert.deepEqual(overlapWindows([], wh, 'UTC', '2024-07-01'), []);
  assert.deepEqual(overlapWindows(['UTC'], undefined, 'UTC', '2024-07-01'), [{ startHour: 9, endHour: 17 }]); // default hours
});
test('overlapWindows: wrapping window yields two ranges, trailing one ends at 24', () => {
  assert.deepEqual(overlapWindows(['UTC'], { start: 22, end: 6 }, 'UTC', '2024-07-01'),
    [{ startHour: 0, endHour: 6 }, { startHour: 22, endHour: 24 }]);
});
test('overlapWindows: all-day window is a single 0-24 range', () => {
  assert.deepEqual(overlapWindows(['UTC', KOL], { start: 0, end: 24 }, 'UTC', '2024-07-01'), [{ startHour: 0, endHour: 24 }]);
});
