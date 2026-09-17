// Unit tests for invalid input — parseCron must reject with a friendly Error.
// node --test, no browser/DOM. See DESIGN.md § "Pure logic" + "Non-goals".
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseCron } = await loadLogic();

// Assert parseCron throws, and the message matches (regex or substring).
function rejects(expr, match, opts) {
  assert.throws(
    () => parseCron(expr, opts),
    (err) => {
      assert.ok(err instanceof Error, 'throws an Error');
      if (match instanceof RegExp) assert.match(err.message, match);
      else assert.ok(err.message.includes(match), `message "${err.message}" includes "${match}"`);
      return true;
    },
    `expected ${JSON.stringify(expr)} to be rejected`
  );
}

test('empty / blank input', () => {
  rejects('', /Enter a cron expression/);
  rejects('   ', /Enter a cron expression/);
});

test('wrong field count', () => {
  rejects('* * *', /expected 5 fields/);
  rejects('* * * * * *', /expected 5 fields/);
  rejects('* * * * *', /expected 6 fields/, { seconds: true });
  rejects('0 * * * * *', /expected 5 fields/);
  // Quartz accepts 6 or 7; 5 or 8 are rejected with that guidance.
  rejects('* * * * *', /expected 6 or 7 fields/, { flavor: 'quartz' });
  rejects('0 0 0 * * ? 2025 9', /expected 6 or 7 fields/, { flavor: 'quartz' });
  // AWS is always 6 (year, not seconds).
  rejects('0 0 * * ?', /expected 6 fields/, { flavor: 'aws' });
});

test('out-of-range values, per field', () => {
  rejects('60 * * * *', /Minutes: 60 is out of range \(0–59\)/);
  rejects('* 24 * * *', /Hours: 24 is out of range \(0–23\)/);
  rejects('* * 0 * *', /Day of month: 0 is out of range \(1–31\)/);
  rejects('* * 32 * *', /Day of month: 32 is out of range/);
  rejects('* * * 13 *', /Month: 13 is out of range \(1–12\)/);
  rejects('* * * * 8', /Day of week: 8 is out of range \(0–7\)/);
});

test('malformed fields', () => {
  rejects('abc * * * *', /Minutes: "abc" is not a valid value/);
  rejects('5-1 * * * *', /range start 5 is after end 1/);
  rejects('*/0 * * * *', /step must be 1 or greater/);
  rejects('*/x * * * *', /step "x" is not a number/);
});

test('Standard / Unix rejects the L / W / # special tokens per flavor', () => {
  rejects('* * L * *', /Standard \/ Unix does not support L/);
  rejects('* * LW * *', /does not support L, W/);
  rejects('* * * * 1W', /does not support .*W/);
  rejects('* * * * 5#3', /does not support .*#/);
  rejects('0 0 L * *', /does not support L/);
  // Digit-attached special tokens (last-Friday `5L`, nearest-weekday `15W`)
  // are rejected even though L/W also appear in the JUL / WED names.
  rejects('0 0 * * 5L', /does not support L/);
  rejects('* * 15W * *', /does not support .*W/);
});

test('Spring rejects W but allows L and # (per-flavor character support)', () => {
  // Spring @Scheduled: supports ? L # but NOT W.
  rejects('0 0 0 * * 15W', /Spring @Scheduled does not support .*W/, { flavor: 'spring' });
  // L and # are fine in Spring (no throw) — asserted in flavors.test.mjs.
});

test('Quartz # must be 1–5 and only in day-of-week', () => {
  rejects('0 0 0 * * 6#7', /"#n" must be between 1 and 5/, { flavor: 'quartz' });
  rejects('0 0 0 6#3 * ?', /"#" is only valid in day-of-week/, { flavor: 'quartz' });
});

test('`?` is rejected entirely in Standard / Unix (no Quartz extensions)', () => {
  rejects('? * * * *', /Standard \/ Unix does not support "\?"/);
  rejects('* * ? * *', /Standard \/ Unix does not support "\?"/);
  rejects('* * 1? * *', /"\?" must stand alone/);
});

test('misplaced `?` in a non-dom/dow field (a flavor that allows `?`)', () => {
  // Spring allows `?`, but only in day-of-month / day-of-week.
  rejects('? 0 0 * * *', /only allowed for day-of-month and day-of-week/, { flavor: 'spring' });
  rejects('0 ? 0 * * *', /only allowed for day-of-month and day-of-week/, { flavor: 'spring' });
});

test('Quartz / AWS require exactly one of dom/dow to be `?`', () => {
  // Neither is `?` -> rejected.
  rejects('0 0 12 * * *', /exactly one of day-of-month and day-of-week must be "\?"/, { flavor: 'quartz' });
  rejects('0 0 12 5 * 3', /exactly one of day-of-month and day-of-week must be "\?"/, { flavor: 'quartz' });
  // Both `?` -> rejected.
  rejects('0 0 12 ? * ?', /exactly one of day-of-month and day-of-week must be "\?"/, { flavor: 'quartz' });
  // AWS: `*` in both dom and dow -> rejected (must use `?` in one).
  rejects('0 12 * * * *', /exactly one of day-of-month and day-of-week must be "\?"/, { flavor: 'aws' });
});

test('unknown macro', () => {
  rejects('@bogus', /Unknown macro "@bogus"/);
});

test('macros are only supported in Standard / Unix', () => {
  rejects('@daily', /Unix with seconds does not support the "@daily" macro/, { seconds: true });
  rejects('@daily', /Quartz .* does not support the "@daily" macro/, { flavor: 'quartz' });
  rejects('@hourly', /Spring @Scheduled does not support the "@hourly" macro/, { flavor: 'spring' });
});

test('empty term inside a list', () => {
  rejects('1,,3 * * * *', /empty term/);
});
