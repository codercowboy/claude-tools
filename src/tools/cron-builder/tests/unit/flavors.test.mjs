// Unit tests for the FLAVOR-AWARE engine — field layout, day-of-week
// numbering, the `?`/`L`/`W`/`#` special tokens, the year field, and flavor
// conversion. node --test, no browser/DOM. See DESIGN.md § "Flavors".
//
// nextRuns computes in LOCAL time, so every `from` is built with the local
// Date constructor and every assertion reads local getters — deterministic in
// any time zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, localDate, stamp } from './_helpers.mjs';

const {
  parseCron, buildCron, describeCron, nextRuns, convertExpr,
  orderForFlavor, specsForFlavor, FLAVOR_IDS, FLAVORS, DEFAULTS,
  fieldEditorMode,
} = await loadLogic();

const runsFor = (expr, flavor, from, count) =>
  nextRuns(parseCron(expr, { flavor }), from, count);

// ---------------------------------------------------------------------------
// Flavor registry & field order
// ---------------------------------------------------------------------------
test('the five documented flavors exist', () => {
  assert.deepEqual(FLAVOR_IDS, ['standard', 'unixSeconds', 'quartz', 'spring', 'aws']);
});

test('field order per flavor (seconds-leading vs year-trailing; 5/6/7 fields)', () => {
  assert.deepEqual(orderForFlavor('standard'), ['minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(orderForFlavor('unixSeconds'), ['second', 'minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(orderForFlavor('quartz', false), ['second', 'minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(orderForFlavor('quartz', true), ['second', 'minute', 'hour', 'dom', 'month', 'dow', 'year']);
  assert.deepEqual(orderForFlavor('spring'), ['second', 'minute', 'hour', 'dom', 'month', 'dow']);
  // AWS carries a trailing YEAR, not a leading seconds.
  assert.deepEqual(orderForFlavor('aws'), ['minute', 'hour', 'dom', 'month', 'dow', 'year']);
});

test('parseCron records the resolved flavor, order, seconds, and year flags', () => {
  const q6 = parseCron('0 0 12 ? * 6#3', { flavor: 'quartz' });
  assert.equal(q6.flavor, 'quartz');
  assert.equal(q6.seconds, true);
  assert.equal(q6.hasYear, false);
  assert.deepEqual(q6.order, ['second', 'minute', 'hour', 'dom', 'month', 'dow']);

  const q7 = parseCron('0 0 12 ? * 6#3 2025', { flavor: 'quartz' });
  assert.equal(q7.hasYear, true);
  assert.equal(q7.year.values[0], 2025);

  const aws = parseCron('0 12 ? * 2-6 *', { flavor: 'aws' });
  assert.equal(aws.seconds, false);
  assert.equal(aws.hasYear, true);
});

// ---------------------------------------------------------------------------
// Per-flavor round-trips
// ---------------------------------------------------------------------------
test('per-flavor parse → build round-trips (canonical text preserved)', () => {
  const cases = [
    ['standard', '0 9 * * 1-5'],
    ['standard', '*/15 0 1,15 1-3 0'],
    ['unixSeconds', '30 0 12 * * 3'],
    ['quartz', '0 0 12 ? * 6#3'],
    ['quartz', '0 0 12 L * ?'],
    ['quartz', '0 0 12 ? * 6#3 2025'],
    ['quartz', '0 15 10 15W * ?'],
    ['spring', '0 0 9 * * 5L'],
    ['spring', '0 0 9 * * ?'],
    ['aws', '0 12 ? * 2-6 *'],
    ['aws', '0 10 L * ? 2025-2030'],
    ['aws', '15 10 ? * 6#3 *'],
  ];
  for (const [flavor, expr] of cases) {
    const model = parseCron(expr, { flavor });
    assert.equal(buildCron(model), expr, `${flavor}: ${expr}`);
  }
});

test('names map through the flavor’s dow numbering on build', () => {
  // Unix: MON=1 … FRI=5.
  assert.equal(buildCron(parseCron('0 0 * * MON-FRI', { flavor: 'standard' })), '0 0 * * 1-5');
  // Quartz: MON=2 … FRI=6 (1 = Sunday).
  assert.equal(buildCron(parseCron('0 0 0 ? * MON-FRI', { flavor: 'quartz' })), '0 0 0 ? * 2-6');
  // AWS uses Quartz numbering too.
  assert.equal(buildCron(parseCron('0 0 ? * MON-FRI *', { flavor: 'aws' })), '0 0 ? * 2-6 *');
});

// ---------------------------------------------------------------------------
// DOW numbering correctness — the crux. Quartz `1`=Sunday vs Unix `1`=Monday.
// Assert nextRuns lands on the RIGHT weekday.
// ---------------------------------------------------------------------------
test('DOW numbering: Quartz `1` = Sunday, Unix `1` = Monday (nextRuns weekday)', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0); // Mon Jan 1 2024
  // Unix dow 1 -> Monday (JS day 1).
  for (const r of runsFor('0 0 * * 1', 'standard', from, 4)) {
    assert.equal(stamp(r).dow, 1, 'Unix 1 must be Monday');
  }
  // Quartz dow 1 -> Sunday (JS day 0).
  for (const r of runsFor('0 0 0 ? * 1', 'quartz', from, 4)) {
    assert.equal(stamp(r).dow, 0, 'Quartz 1 must be Sunday');
  }
  // AWS dow 1 -> Sunday too.
  for (const r of runsFor('0 0 ? * 1 *', 'aws', from, 4)) {
    assert.equal(stamp(r).dow, 0, 'AWS 1 must be Sunday');
  }
});

test('DOW numbering: full-range endpoints map correctly (7=Sat Quartz, 7=Sun Unix)', () => {
  // Quartz dow 7 -> Saturday (JS day 6).
  const from = localDate(2024, 1, 1, 0, 0, 0);
  for (const r of runsFor('0 0 0 ? * 7', 'quartz', from, 3)) {
    assert.equal(stamp(r).dow, 6, 'Quartz 7 must be Saturday');
  }
  // Unix dow 7 -> Sunday (alias of 0).
  for (const r of runsFor('0 0 * * 7', 'standard', from, 3)) {
    assert.equal(stamp(r).dow, 0, 'Unix 7 must be Sunday');
  }
  // Quartz "weekdays" 2-6 == Mon..Fri.
  for (const r of runsFor('0 0 0 ? * 2-6', 'quartz', from, 10)) {
    const d = stamp(r).dow;
    assert.ok(d >= 1 && d <= 5, `Quartz 2-6 must be Mon..Fri, got JS day ${d}`);
  }
  // Spring uses Unix numbering: 1-5 == Mon..Fri.
  for (const r of runsFor('0 0 0 * * 1-5', 'spring', from, 10)) {
    const d = stamp(r).dow;
    assert.ok(d >= 1 && d <= 5, `Spring 1-5 must be Mon..Fri, got JS day ${d}`);
  }
});

test('the same weekday value set expands to the same JS days across numbering', () => {
  // Unix Sunday (0) and Quartz Sunday (1) both normalize to JS 0.
  assert.deepEqual(parseCron('0 0 * * 0', { flavor: 'standard' }).dow.values, [0]);
  assert.deepEqual(parseCron('0 0 0 ? * 1', { flavor: 'quartz' }).dow.values, [0]);
  // Quartz `*` in dow expands to all seven JS days.
  assert.deepEqual(parseCron('0 0 0 ? * *', { flavor: 'quartz' }).dow.values, [0, 1, 2, 3, 4, 5, 6]);
});

// ---------------------------------------------------------------------------
// `?` — treated as unspecified (like *), plus the exactly-one rule
// ---------------------------------------------------------------------------
test('`?` behaves like `*` for matching (not restricted)', () => {
  const m = parseCron('0 0 12 ? * 2-6', { flavor: 'quartz' });
  assert.equal(m.dom.question, true);
  assert.equal(m.dom.wildcard, false);
  // dom=? is not restricted, so only dow constrains: weekdays.
  const from = localDate(2024, 1, 1, 0, 0, 0);
  for (const r of nextRuns(m, from, 6)) {
    const d = stamp(r).dow;
    assert.ok(d >= 1 && d <= 5, 'dom=? means only dow constrains');
  }
});

test('Quartz `?`-required rule is enforced, but valid single-? passes', () => {
  // Valid: exactly one `?`.
  assert.doesNotThrow(() => parseCron('0 0 12 ? * 6#3', { flavor: 'quartz' }));
  assert.doesNotThrow(() => parseCron('0 0 12 15 * ?', { flavor: 'quartz' }));
  assert.doesNotThrow(() => parseCron('0 0 12 * * ?', { flavor: 'quartz' }));
  // Invalid: zero or two `?`.
  assert.throws(() => parseCron('0 0 12 * * *', { flavor: 'quartz' }), /exactly one/);
  assert.throws(() => parseCron('0 0 12 ? * ?', { flavor: 'quartz' }), /exactly one/);
});

test('AWS `?`-required rule (can’t be `*` in both dom and dow)', () => {
  assert.doesNotThrow(() => parseCron('0 12 ? * 2-6 *', { flavor: 'aws' }));
  assert.doesNotThrow(() => parseCron('0 12 15 * ? *', { flavor: 'aws' }));
  assert.throws(() => parseCron('0 12 * * * *', { flavor: 'aws' }), /exactly one/);
  assert.throws(() => parseCron('0 12 15 * 2 *', { flavor: 'aws' }), /exactly one/);
});

test('Standard / Unix and Unix-with-seconds reject `?` entirely', () => {
  assert.throws(() => parseCron('0 0 ? * *', { flavor: 'standard' }), /does not support "\?"/);
  assert.throws(() => parseCron('0 0 0 ? * *', { flavor: 'unixSeconds' }), /does not support "\?"/);
});

// ---------------------------------------------------------------------------
// L — last day of month / last given weekday
// ---------------------------------------------------------------------------
test('L in day-of-month fires on the last day of each month', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 12 L * ?', 'quartz', from, 3);
  // Jan 31, Feb 29 (2024 leap), Mar 31.
  assert.deepEqual(runs.map((r) => `${stamp(r).mo}/${stamp(r).d}`), ['1/31', '2/29', '3/31']);
  for (const r of runs) {
    const s = stamp(r);
    const lastDay = new Date(s.y, s.mo, 0).getDate();
    assert.equal(s.d, lastDay, 'must be the last day of its month');
    assert.equal(s.hh, 12);
  }
});

test('L-n in day-of-month fires n days before the last day (Quartz/Spring)', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  // 3 days before the last day of January = Jan 28.
  const [first] = runsFor('0 0 12 L-3 * ?', 'quartz', from, 1);
  assert.equal(stamp(first).d, 28);
});

test('nL in day-of-week fires on the last given weekday of the month', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  // Spring numbering: 5 = Friday. Last Friday of Jan 2024 = Jan 26.
  const [jan] = runsFor('0 0 12 * * 5L', 'spring', from, 1);
  assert.equal(stamp(jan).d, 26);
  assert.equal(stamp(jan).dow, 5);
  // The next run must again be the LAST Friday (Feb 23 2024), not just any Friday.
  const runs = runsFor('0 0 12 * * 5L', 'spring', from, 2);
  const feb = runs[1];
  assert.equal(stamp(feb).mo, 2);
  assert.equal(stamp(feb).d, 23);
  assert.equal(stamp(feb).dow, 5);
});

test('Quartz nL uses Quartz dow numbering (6 = Friday)', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  // Quartz 6 = Friday. Last Friday of Jan 2024 = Jan 26.
  const [jan] = runsFor('0 0 12 ? * 6L', 'quartz', from, 1);
  assert.equal(stamp(jan).d, 26);
  assert.equal(stamp(jan).dow, 5);
});

// ---------------------------------------------------------------------------
// W — nearest weekday to a given day-of-month
// ---------------------------------------------------------------------------
test('W picks the nearest weekday, never crossing month boundaries', () => {
  // June 15 2024 is a Saturday -> nearest weekday is Friday June 14.
  let [r] = runsFor('0 12 15W * ? *', 'aws', localDate(2024, 6, 1), 1);
  assert.equal(stamp(r).mo, 6);
  assert.equal(stamp(r).d, 14);
  assert.equal(stamp(r).dow, 5);

  // September 15 2024 is a Sunday -> nearest weekday is Monday September 16.
  [r] = runsFor('0 12 15W * ? *', 'aws', localDate(2024, 9, 1), 1);
  assert.equal(stamp(r).d, 16);
  assert.equal(stamp(r).dow, 1);

  // A weekday target stays put: July 15 2024 is a Monday.
  [r] = runsFor('0 12 15W * ? *', 'aws', localDate(2024, 7, 1), 1);
  assert.equal(stamp(r).d, 15);
});

test('1W near the start of a month rolls forward, not into the previous month', () => {
  // June 1 2024 is a Saturday -> 1W is Monday June 3 (can’t go to May).
  const [r] = runsFor('0 12 1W * ? *', 'aws', localDate(2024, 6, 1), 1);
  assert.equal(stamp(r).mo, 6);
  assert.equal(stamp(r).d, 3);
});

test('LW fires on the last weekday of the month (Quartz)', () => {
  // Last day of March 2024 is Sunday the 31st -> last weekday is Friday the 29th.
  const [r] = runsFor('0 0 12 LW * ?', 'quartz', localDate(2024, 3, 1), 1);
  assert.equal(stamp(r).d, 29);
  assert.equal(stamp(r).dow, 5);
});

// ---------------------------------------------------------------------------
// # — nth weekday of the month
// ---------------------------------------------------------------------------
test('6#3 (Quartz) fires on the 3rd Friday of the month', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 12 ? * 6#3', 'quartz', from, 3);
  // 3rd Friday: Jan 19, Feb 16, Mar 15 (2024).
  assert.deepEqual(runs.map((r) => `${stamp(r).mo}/${stamp(r).d}`), ['1/19', '2/16', '3/15']);
  for (const r of runs) {
    const s = stamp(r);
    assert.equal(s.dow, 5, 'must be a Friday');
    assert.equal(Math.floor((s.d - 1) / 7) + 1, 3, 'must be the 3rd occurrence');
    assert.equal(s.hh, 12);
  }
});

test('#1 vs #5: first occurrence always exists; #5 skips months without a 5th', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  // 1st Monday (Spring numbering 1 = Monday).
  const first = runsFor('0 0 12 * * 1#1', 'spring', from, 2);
  for (const r of first) {
    assert.equal(stamp(r).dow, 1);
    assert.ok(stamp(r).d <= 7, '1st Monday is within the first week');
  }
  // 5th Monday only occurs in some months; every hit must genuinely be a 5th.
  const fifth = runsFor('0 0 12 * * 1#5', 'spring', from, 3);
  for (const r of fifth) {
    const s = stamp(r);
    assert.equal(s.dow, 1);
    assert.equal(Math.floor((s.d - 1) / 7) + 1, 5);
  }
});

// ---------------------------------------------------------------------------
// Year field (Quartz 7-field / AWS)
// ---------------------------------------------------------------------------
test('Quartz year field constrains runs to that year', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 12 1 1 ? 2025', 'quartz', from, 5);
  assert.equal(runs.length, 1);
  assert.equal(stamp(runs[0]).y, 2025);
  assert.equal(stamp(runs[0]).mo, 1);
  assert.equal(stamp(runs[0]).d, 1);
});

test('AWS year field constrains runs; a past year yields zero (no hang)', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const some = runsFor('0 12 1 1 ? 2025', 'aws', from, 5);
  assert.equal(some.length, 1);
  assert.equal(stamp(some[0]).y, 2025);
  // A year entirely in the past -> no runs within the horizon.
  const none = runsFor('0 12 1 1 ? 1999', 'aws', from, 5);
  assert.equal(none.length, 0);
});

test('a year range fires once per year across the range', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 12 1 1 ? 2025-2027', 'quartz', from, 10);
  assert.deepEqual(runs.map((r) => stamp(r).y), [2025, 2026, 2027]);
});

// ---------------------------------------------------------------------------
// Special-character allowance per flavor (positive cases)
// ---------------------------------------------------------------------------
test('Spring supports L and # but not W', () => {
  assert.doesNotThrow(() => parseCron('0 0 9 L * ?', { flavor: 'spring' }));
  assert.doesNotThrow(() => parseCron('0 0 9 * * 5#2', { flavor: 'spring' }));
  assert.throws(() => parseCron('0 0 9 15W * ?', { flavor: 'spring' }), /does not support .*W/);
});

test('Quartz and AWS support L, W, and #', () => {
  assert.doesNotThrow(() => parseCron('0 0 9 15W * ?', { flavor: 'quartz' }));
  assert.doesNotThrow(() => parseCron('0 0 9 L * ?', { flavor: 'quartz' }));
  assert.doesNotThrow(() => parseCron('0 0 9 ? * 6#3', { flavor: 'quartz' }));
  assert.doesNotThrow(() => parseCron('0 9 15W * ? *', { flavor: 'aws' }));
  assert.doesNotThrow(() => parseCron('0 9 ? * 6#3 *', { flavor: 'aws' }));
});

test('JUL / WED names still parse in flavors that reject L / W tokens', () => {
  // The L/W guard must not trip on real month/day names.
  assert.equal(buildCron(parseCron('0 0 * JUL WED', { flavor: 'standard' })), '0 0 * 7 3');
  // Quartz: WED = 4 (1 = Sunday).
  assert.equal(buildCron(parseCron('0 0 0 ? JUL WED', { flavor: 'quartz' })), '0 0 0 ? 7 4');
});

// ---------------------------------------------------------------------------
// Special tokens mark the field, and describeCron phrases them
// ---------------------------------------------------------------------------
test('a field with a special token is flagged and reads as Custom', () => {
  const m = parseCron('0 0 12 ? * 6#3', { flavor: 'quartz' });
  assert.equal(m.dow.special, true);
  assert.deepEqual(fieldEditorMode(m.dow), { mode: 'custom', text: '6#3' });
});

test('describeCron phrases special tokens and the year clause', () => {
  assert.equal(describeCron(parseCron('0 0 12 ? * 6#3', { flavor: 'quartz' })),
    'At 12:00:00, on the 3rd Friday of the month');
  assert.equal(describeCron(parseCron('0 0 12 L * ?', { flavor: 'quartz' })),
    'At 12:00:00, on the last day of the month');
  assert.equal(describeCron(parseCron('0 0 9 * * 5L', { flavor: 'spring' })),
    'At 09:00:00, on the last Friday of the month');
  assert.equal(describeCron(parseCron('0 12 15W * ? *', { flavor: 'aws' })),
    'At 12:00, on the nearest weekday to day 15');
  assert.equal(describeCron(parseCron('0 0 12 1 1 ? 2025', { flavor: 'quartz' })),
    'At 12:00:00, on day 1 of the month, in January, in 2025');
});

// ---------------------------------------------------------------------------
// Flavor conversion (convertExpr) — always yields a valid target expression
// ---------------------------------------------------------------------------
test('convertExpr: standard <-> unix-seconds adds/removes the seconds field', () => {
  assert.equal(convertExpr('0 9 * * 1-5', 'standard', 'unixSeconds'), '0 0 9 * * 1-5');
  assert.equal(convertExpr('30 0 9 * * 1-5', 'unixSeconds', 'standard'), '0 9 * * 1-5');
});

test('convertExpr: standard -> Quartz renumbers dow and inserts a `?`', () => {
  const out = convertExpr('0 9 * * 1-5', 'standard', 'quartz');
  const m = parseCron(out, { flavor: 'quartz' });
  // Must be a valid Quartz expression firing Mon..Fri.
  assert.equal(m.dom.question || m.dow.question, true);
  for (const r of nextRuns(m, localDate(2024, 1, 1), 6)) {
    const d = stamp(r).dow;
    assert.ok(d >= 1 && d <= 5, 'converted schedule must still be weekdays');
  }
});

test('convertExpr: Quartz -> standard drops the `?` and renumbers dow', () => {
  const out = convertExpr('0 0 9 ? * 2-6', 'quartz', 'standard');
  const m = parseCron(out, { flavor: 'standard' });
  assert.equal(m.flavor, 'standard');
  for (const r of nextRuns(m, localDate(2024, 1, 1), 6)) {
    const d = stamp(r).dow;
    assert.ok(d >= 1 && d <= 5, 'weekday meaning preserved across the switch');
  }
});

test('convertExpr: standard -> AWS appends a year and inserts a `?`', () => {
  const out = convertExpr('0 9 * * 1-5', 'standard', 'aws');
  assert.equal(out.split(/\s+/).length, 6);
  const m = parseCron(out, { flavor: 'aws' });
  assert.equal(m.hasYear, true);
});

test('convertExpr: same flavor is a no-op; unparseable input falls back to the default', () => {
  assert.equal(convertExpr('0 9 * * 1-5', 'standard', 'standard'), '0 9 * * 1-5');
  assert.equal(convertExpr('not a cron', 'standard', 'quartz'), DEFAULTS.quartz);
});

test('convertExpr output always parses in the target flavor (fuzz across flavors)', () => {
  const seeds = {
    standard: ['0 9 * * 1-5', '*/15 0 1,15 * 0', '0 0 * * 7', '0 0 1 1 *'],
    unixSeconds: ['30 0 9 * * 1-5', '0 0 0 * * *'],
    quartz: ['0 0 12 ? * 6#3', '0 0 12 L * ?', '0 0 9 ? * 2-6', '0 0 12 15W * ?'],
    spring: ['0 0 9 * * 5L', '0 0 9 * * 1-5', '0 0 9 * * ?'],
    aws: ['0 12 ? * 2-6 *', '0 10 L * ? *', '15 10 ? * 6#3 *'],
  };
  for (const from of FLAVOR_IDS) {
    for (const expr of seeds[from]) {
      for (const to of FLAVOR_IDS) {
        const out = convertExpr(expr, from, to);
        assert.doesNotThrow(
          () => parseCron(out, { flavor: to }),
          `convert ${from} "${expr}" -> ${to} produced invalid "${out}"`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// specsForFlavor sanity
// ---------------------------------------------------------------------------
test('specsForFlavor gives the right dow bounds + numbering per flavor', () => {
  const unix = specsForFlavor('standard').dow;
  assert.equal(unix.min, 0);
  assert.equal(unix.wildMax, 6);
  assert.equal(unix.dowOffset, 0);
  assert.equal(unix.wrap7, true);

  const quartz = specsForFlavor('quartz').dow;
  assert.equal(quartz.min, 1);
  assert.equal(quartz.wildMax, 7);
  assert.equal(quartz.dowOffset, 1);
  assert.equal(quartz.wrap7, false);
});
