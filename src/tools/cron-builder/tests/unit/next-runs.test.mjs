// Unit tests for nextRuns — deterministic (always a fixed local `from`) — the
// Vixie-cron dom/dow OR rule, step/range/list schedules, month/day rollover,
// an impossible expression, and 6-field seconds. node --test, no browser/DOM.
// See DESIGN.md § "Pure logic" (nextRuns).
//
// nextRuns computes in LOCAL time, so every `from` is built with the local
// Date constructor and every assertion reads local getters — deterministic in
// any time zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, localDate, stamp } from './_helpers.mjs';

const { parseCron, nextRuns } = await loadLogic();

const runsFor = (expr, from, count, opts) =>
  nextRuns(parseCron(expr, opts), from, count);

test('daily at 09:00 — count, spacing, and each match at the right wall clock', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0); // Mon Jan 1 2024 00:00 local
  const runs = runsFor('0 9 * * *', from, 3);
  assert.equal(runs.length, 3);
  runs.forEach((r, i) => {
    const s = stamp(r);
    assert.equal(s.hh, 9);
    assert.equal(s.mi, 0);
    assert.equal(s.d, i + 1); // Jan 1, 2, 3
    assert.equal(s.mo, 1);
  });
});

test('strictly after `from`: a match exactly at `from` is skipped', () => {
  // from is exactly 09:00 — the next run must be the NEXT day, not this instant.
  const from = localDate(2024, 1, 1, 9, 0, 0);
  const [first] = runsFor('0 9 * * *', from, 1);
  assert.equal(stamp(first).d, 2);
});

test('every 15 minutes — steps across the hour boundary', () => {
  const from = localDate(2024, 1, 1, 10, 2, 0);
  const runs = runsFor('*/15 * * * *', from, 4);
  const mins = runs.map((r) => `${stamp(r).hh}:${stamp(r).mi}`);
  assert.deepEqual(mins, ['10:15', '10:30', '10:45', '11:0']);
});

test('list schedule (0,30) fires at both minutes each hour', () => {
  const from = localDate(2024, 1, 1, 10, 5, 0);
  const runs = runsFor('0,30 * * * *', from, 3);
  const mins = runs.map((r) => `${stamp(r).hh}:${stamp(r).mi}`);
  assert.deepEqual(mins, ['10:30', '11:0', '11:30']);
});

test('range-step hours (0-12/6) constrains the hours', () => {
  const from = localDate(2024, 1, 1, 1, 0, 0);
  const runs = runsFor('0 0-12/6 * * *', from, 4);
  const hrs = runs.map((r) => stamp(r).hh);
  // hours 0,6,12 -> after 01:00 that day: 6, 12, then next day 0, 6
  assert.deepEqual(hrs, [6, 12, 0, 6]);
});

test('OR rule: `0 0 13 * 5` fires on the 13th OR any Friday', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 13 * 5', from, 6);
  assert.equal(runs.length, 6);
  // Every run must satisfy (day==13 OR dow==Friday) — never AND.
  for (const r of runs) {
    const s = stamp(r);
    assert.ok(s.d === 13 || s.dow === 5,
      `run ${r} matched neither the 13th nor a Friday`);
    assert.equal(s.hh, 0);
    assert.equal(s.mi, 0);
  }
  // The OR must actually include the 13th even when it isn't a Friday:
  // Jan 13 2024 is a Saturday, and it must appear.
  const hasThe13th = runs.some((r) => stamp(r).d === 13);
  assert.ok(hasThe13th, 'the 13th (a Saturday) must be among the runs');
  const jan13 = runs.find((r) => stamp(r).mo === 1 && stamp(r).d === 13);
  assert.equal(stamp(jan13).dow, 6, 'Jan 13 2024 is a Saturday — proves OR not AND');
});

test('only dow restricted: `0 0 * * 1` fires only on Mondays', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 * * 1', from, 4);
  for (const r of runs) assert.equal(stamp(r).dow, 1);
});

test('only dom restricted: `0 0 15 * *` fires only on the 15th', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 15 * *', from, 3);
  for (const r of runs) assert.equal(stamp(r).d, 15);
  // Consecutive months.
  assert.deepEqual(runs.map((r) => stamp(r).mo), [1, 2, 3]);
});

test('month restriction + day rollover: `0 0 1 1 *` fires Jan 1 each year', () => {
  const from = localDate(2024, 6, 15, 0, 0, 0); // mid-year
  const runs = runsFor('0 0 1 1 *', from, 3);
  runs.forEach((r) => {
    const s = stamp(r);
    assert.equal(s.mo, 1);
    assert.equal(s.d, 1);
    assert.equal(s.hh, 0);
  });
  assert.deepEqual(runs.map((r) => stamp(r).y), [2025, 2026, 2027]);
});

test('end-of-month rollover: `0 0 31 * *` skips months without a 31st', () => {
  const from = localDate(2024, 1, 31, 0, 0, 1); // just after Jan 31 midnight
  const runs = runsFor('0 0 31 * *', from, 3);
  // Feb (no 31) and Apr (no 31) skipped: next are Mar 31, May 31, Jul 31.
  assert.deepEqual(runs.map((r) => stamp(r).mo), [3, 5, 7]);
  for (const r of runs) assert.equal(stamp(r).d, 31);
});

test('impossible expression `0 0 30 2 *` returns zero runs (no hang)', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  const runs = runsFor('0 0 30 2 *', from, 5);
  assert.equal(runs.length, 0);
});

test('6-field seconds: `*/30 * * * * *` steps by 30 seconds', () => {
  const from = localDate(2024, 1, 1, 10, 0, 5);
  const runs = runsFor('*/30 * * * * *', from, 3, { seconds: true });
  const secs = runs.map((r) => `${stamp(r).mi}:${stamp(r).ss}`);
  assert.deepEqual(secs, ['0:30', '1:0', '1:30']);
});

test('6-field seconds: single second value fires once per matching minute', () => {
  const from = localDate(2024, 1, 1, 11, 59, 0);
  const runs = runsFor('30 0 12 * * *', from, 2, { seconds: true });
  runs.forEach((r) => {
    const s = stamp(r);
    assert.equal(s.hh, 12);
    assert.equal(s.mi, 0);
    assert.equal(s.ss, 30);
  });
  assert.deepEqual(runs.map((r) => stamp(r).d), [1, 2]);
});

test('non-Date / invalid `from` returns an empty array (never throws)', () => {
  assert.deepEqual(nextRuns(parseCron('* * * * *'), 'nope', 5), []);
  assert.deepEqual(nextRuns(parseCron('* * * * *'), new Date(NaN), 5), []);
});

test('count parameter caps the results', () => {
  const from = localDate(2024, 1, 1, 0, 0, 0);
  assert.equal(runsFor('* * * * *', from, 1).length, 1);
  assert.equal(runsFor('* * * * *', from, 10).length, 10);
});
