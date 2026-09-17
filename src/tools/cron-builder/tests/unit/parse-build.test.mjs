// Unit tests for parseCron / buildCron — the parse↔serialize round-trip,
// term kinds, names, `7`→Sunday normalization, `?` handling, and macro
// expansion. node --test, no browser/DOM. See DESIGN.md § "Pure logic".
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const {
  parseCron, buildCron, parseField, buildField, FIELD_SPECS,
  fieldOrder, MACROS,
} = await loadLogic();

// Parse then rebuild; the rebuilt canonical string is asserted against `want`.
function roundtrip(expr, want = expr, opts) {
  const model = parseCron(expr, opts);
  assert.equal(buildCron(model), want, `buildCron(parseCron(${JSON.stringify(expr)}))`);
  return model;
}

test('field order: 5-field vs 6-field (seconds)', () => {
  assert.deepEqual(fieldOrder(false), ['minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(fieldOrder(true), ['second', 'minute', 'hour', 'dom', 'month', 'dow']);
});

test('parseCron returns the documented model shape', () => {
  const m = parseCron('0 9 * * 1-5');
  assert.equal(m.seconds, false);
  assert.equal(m.second, undefined);
  for (const key of ['minute', 'hour', 'dom', 'month', 'dow']) {
    const f = m[key];
    assert.ok(typeof f.raw === 'string');
    assert.ok(Array.isArray(f.terms));
    assert.equal(typeof f.wildcard, 'boolean');
    assert.equal(typeof f.question, 'boolean');
    assert.ok(Array.isArray(f.values));
    assert.ok(f.valueSet instanceof Set);
  }
});

test('round-trip: 5-field wildcards and plain values', () => {
  roundtrip('* * * * *');
  roundtrip('0 9 * * 1-5');
  roundtrip('30 2 1 6 0');
});

test('round-trip: 6-field seconds', () => {
  const m = roundtrip('30 0 12 * * *', '30 0 12 * * *', { seconds: true });
  assert.equal(m.seconds, true);
  assert.equal(m.second.values[0], 30);
  // Same text parsed as 5-field is a different (wrong-count-free) shape.
  assert.equal(buildCron(parseCron('0 12 * * *')), '0 12 * * *');
});

test('round-trip: lists (1,15) and (0,15,30)', () => {
  const m = roundtrip('0 0 1,15 * *');
  assert.deepEqual(m.dom.values, [1, 15]);
  roundtrip('0,15,30 * * * *');
});

test('round-trip: ranges (1-5)', () => {
  const m = roundtrip('0 0 * * 1-5');
  assert.deepEqual(m.dow.values, [1, 2, 3, 4, 5]);
});

test('round-trip: whole-range step */15 and */5', () => {
  const m = roundtrip('*/15 * * * *');
  assert.deepEqual(m.minute.values, [0, 15, 30, 45]);
  roundtrip('*/5 * * * *');
});

test('round-trip: range-step 10-50/10 and 0-30/10', () => {
  const m = roundtrip('10-50/10 * * * *');
  assert.deepEqual(m.minute.values, [10, 20, 30, 40, 50]);
  roundtrip('0-30/10 * * * *');
});

test('round-trip: step-from a/n (5/10)', () => {
  const m = roundtrip('5/10 * * * *');
  assert.deepEqual(m.minute.values, [5, 15, 25, 35, 45, 55]);
});

test('month names JAN–DEC normalize to numbers (case-insensitive)', () => {
  assert.equal(buildCron(parseCron('0 0 * JAN *')), '0 0 * 1 *');
  assert.equal(buildCron(parseCron('0 0 * dec *')), '0 0 * 12 *');
  assert.equal(buildCron(parseCron('0 0 * JAN-MAR *')), '0 0 * 1-3 *');
  const m = parseCron('0 0 * jun,jul,aug *');
  assert.deepEqual(m.month.values, [6, 7, 8]);
});

test('names containing L/W (JUL, WED) are accepted despite the L/W/# guard', () => {
  // Regression: a naive /[LW#]/ guard wrongly rejected JUL (incidental "L")
  // and WED (incidental "W"). Both are documented names.
  assert.equal(buildCron(parseCron('0 0 * JUL *')), '0 0 * 7 *');
  assert.equal(buildCron(parseCron('0 0 * jul *')), '0 0 * 7 *');
  assert.equal(buildCron(parseCron('0 0 * * WED')), '0 0 * * 3');
  assert.equal(buildCron(parseCron('0 0 * * SUN,WED')), '0 0 * * 0,3');
  assert.equal(buildCron(parseCron('0 0 * JUN,JUL,AUG *')), '0 0 * 6,7,8 *');
});

test('day-of-week names SUN–SAT normalize to numbers', () => {
  assert.equal(buildCron(parseCron('5 4 * * SUN')), '5 4 * * 0');
  assert.equal(buildCron(parseCron('0 0 * * fri')), '0 0 * * 5');
  const m = parseCron('0 0 * * MON-FRI');
  assert.deepEqual(m.dow.values, [1, 2, 3, 4, 5]);
});

test('day-of-week `7` normalizes to Sunday (0) in value sets', () => {
  // A literal 7 is preserved verbatim in the rebuilt string...
  assert.equal(buildCron(parseCron('0 0 * * 7')), '0 0 * * 7');
  // ...but its value set collapses to Sunday (0).
  assert.deepEqual(parseCron('0 0 * * 7').dow.values, [0]);
  // 5-7 -> Fri, Sat, Sun == {5,6,0}
  assert.deepEqual(parseCron('0 0 * * 5-7').dow.values, [0, 5, 6]);
  // 0-7 -> every day
  assert.deepEqual(parseCron('0 0 * * 0-7').dow.values, [0, 1, 2, 3, 4, 5, 6]);
});

test('`?` in dom/dow parses, is preserved on rebuild, and matches like * (Spring)', () => {
  // Standard / Unix no longer accepts `?` (a Quartz extension); Spring does.
  const m = parseCron('0 0 12 * * ?', { flavor: 'spring' });
  assert.equal(m.dow.question, true);
  assert.equal(m.dow.wildcard, false);
  assert.equal(buildCron(m), '0 0 12 * * ?');
  // Behaves like the whole range for matching.
  assert.deepEqual(m.dow.values, [0, 1, 2, 3, 4, 5, 6]);

  const m2 = parseCron('0 0 12 ? * *', { flavor: 'spring' });
  assert.equal(m2.dom.question, true);
  assert.deepEqual(m2.dom.values, Array.from({ length: 31 }, (_, i) => i + 1));
});

test('macros expand to their documented 5-field equivalents', () => {
  const expected = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };
  for (const [macro, expr] of Object.entries(expected)) {
    assert.equal(buildCron(parseCron(macro)), expr, macro);
  }
  // The MACROS table itself agrees.
  assert.deepEqual(MACROS, expected);
});

test('macros are case-insensitive and whitespace-trimmed', () => {
  assert.equal(buildCron(parseCron('  @DAILY  ')), '0 0 * * *');
});

test('whitespace between fields is collapsed', () => {
  assert.equal(buildCron(parseCron('0    9\t*  * 1-5')), '0 9 * * 1-5');
});

test('parseField / buildField work directly on a single field', () => {
  const f = parseField('1,15,30', FIELD_SPECS.minute);
  assert.deepEqual(f.values, [1, 15, 30]);
  assert.equal(buildField(f), '1,15,30');
});
