// Unit tests for describeCron — plain-English descriptions of common cron
// shapes, incl. the dom/dow OR wording. node --test, no browser/DOM.
// See DESIGN.md § "Pure logic" (describeCron).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseCron, describeCron } = await loadLogic();

const desc = (expr, opts) => describeCron(parseCron(expr, opts));

test('clean "At HH:MM" for single minute+hour', () => {
  assert.equal(desc('0 9 * * *'), 'At 09:00');
  assert.equal(desc('30 14 * * *'), 'At 14:30');
  assert.equal(desc('0 0 * * *'), 'At 00:00');
});

test('clean "At HH:MM:SS" for single second+minute+hour (6-field)', () => {
  assert.equal(desc('30 0 12 * * *', { seconds: true }), 'At 12:00:30');
  assert.equal(desc('0 0 0 * * *', { seconds: true }), 'At 00:00:00');
});

test('weekday range reads as "Monday through Friday"', () => {
  assert.equal(desc('0 9 * * 1-5'), 'At 09:00, on Monday through Friday');
});

test('every-N minute phrasing', () => {
  assert.equal(desc('*/15 * * * *'), 'Every 15th minute');
  assert.equal(desc('*/5 * * * *'), 'Every 5th minute');
});

test('range-step minute phrasing', () => {
  assert.equal(desc('10-50/10 * * * *'), 'Every 10th minute from 10 through 50');
});

test('all-wildcards reads as "Every minute"', () => {
  assert.equal(desc('* * * * *'), 'Every minute');
});

test('day-of-month clause', () => {
  assert.equal(desc('0 0 1 * *'), 'At 00:00, on day 1 of the month');
  assert.equal(desc('0 0 1,15 * *'), 'At 00:00, on day 1 and 15 of the month');
});

test('month clause', () => {
  assert.equal(desc('0 0 1 1 *'), 'At 00:00, on day 1 of the month, in January');
  assert.equal(desc('0 0 * JAN-MAR *'), 'At 00:00, in January through March');
});

test('single weekday name', () => {
  assert.equal(desc('5 4 * * SUN'), 'At 04:05, on Sunday');
});

test('dom/dow both restricted -> joined with "or" (the OR rule)', () => {
  // 0 0 13 * 5 == midnight on the 13th OR any Friday.
  assert.equal(desc('0 0 13 * 5'), 'At 00:00, on day 13 of the month or on Friday');
});

test('dom/dow when only one restricted -> no "or"', () => {
  // Only dow restricted.
  assert.equal(desc('0 0 * * 1-5'), 'At 00:00, on Monday through Friday');
  // Only dom restricted.
  assert.equal(desc('0 0 15 * *'), 'At 00:00, on day 15 of the month');
});

test('`?` (dom/dow) is not "restricted" and yields no day clause (Spring)', () => {
  assert.equal(desc('0 0 12 * * ?', { flavor: 'spring' }), 'At 12:00:00');
  assert.equal(desc('0 0 12 ? * *', { flavor: 'spring' }), 'At 12:00:00');
});

test('every valid model yields a non-empty string (exotic custom shape)', () => {
  const s = desc('1-3,7,*/9 5 * * *');
  assert.ok(typeof s === 'string' && s.length > 0);
});
