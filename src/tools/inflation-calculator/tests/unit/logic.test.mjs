// Offline pure-logic unit tests (node --test) for the inflation calculator.
//
// Dev/test-only. Imports the SAME `source/logic.mjs` the build inlines into the
// shipped index.html (docs/conventions.md § "Pure-logic unit tests") — one
// source of truth, no extraction step. No browser, no DOM, no localStorage.
//
// Two layers of coverage:
//   • deterministic math against a small FIXED cpi map (this file), and
//   • spot-checks against the bundled cpi-data.json (dataset.test.mjs).
//
// Run with: npm run test:unit  (or `node --test tests/unit/*.test.mjs`).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dataRange,
  cpiFor,
  adjust,
  cumulativeInflation,
  annualRate,
  formatUSD,
  formatPercent,
} from '../../source/logic.mjs';

// A tiny, hand-picked CPI map. Round numbers make every expected value exact.
// Keys are numeric STRINGS on purpose (the real dataset uses string keys) —
// the functions must accept both string and number lookups.
const CPI = { '2000': 100, '2010': 150, '2020': 200 };

// ---------------------------------------------------------------------------
// dataRange
// ---------------------------------------------------------------------------
test('dataRange returns the numeric min/max years', () => {
  assert.deepEqual(dataRange(CPI), { minYear: 2000, maxYear: 2020 });
});

test('dataRange throws on an empty / missing map', () => {
  assert.throws(() => dataRange({}), /No CPI data available/);
  assert.throws(() => dataRange(null), /No CPI data available/);
});

// ---------------------------------------------------------------------------
// cpiFor — lookup + friendly out-of-range error
// ---------------------------------------------------------------------------
test('cpiFor looks up by number or numeric string', () => {
  assert.equal(cpiFor(2000, CPI), 100);
  assert.equal(cpiFor('2000', CPI), 100);
  assert.equal(cpiFor(2020, CPI), 200);
});

test('cpiFor throws the friendly range message for an out-of-range year', () => {
  assert.throws(
    () => cpiFor(1800, CPI),
    (err) => {
      assert.equal(err.message, 'No CPI data for 1800. Data covers 2000–2020.');
      return true;
    },
  );
});

test('cpiFor rejects a non-whole year', () => {
  assert.throws(() => cpiFor(2000.5, CPI), /Enter a whole year/);
});

// ---------------------------------------------------------------------------
// adjust
// ---------------------------------------------------------------------------
test('adjust scales an amount by the CPI ratio', () => {
  // 100 * (150/100) = 150
  assert.equal(adjust(100, 2000, 2010, CPI), 150);
  // 200 * (200/100) = 400
  assert.equal(adjust(200, 2000, 2020, CPI), 400);
});

test('adjust of a same-year span returns the amount unchanged', () => {
  assert.equal(adjust(137.5, 2010, 2010, CPI), 137.5);
});

test('adjust is reversible (round-trips through the inverse span)', () => {
  const forward = adjust(100, 2000, 2020, CPI); // 200
  assert.equal(adjust(forward, 2020, 2000, CPI), 100);
});

test('adjust throws on a non-finite amount', () => {
  assert.throws(() => adjust('abc', 2000, 2010, CPI), /valid amount/);
});

test('adjust surfaces the out-of-range error for a bad year', () => {
  assert.throws(() => adjust(100, 1800, 2010, CPI), /No CPI data for 1800/);
});

// ---------------------------------------------------------------------------
// cumulativeInflation
// ---------------------------------------------------------------------------
test('cumulativeInflation is the percent change over the span', () => {
  // 150/100 - 1 = +50%
  assert.equal(cumulativeInflation(2000, 2010, CPI), 50);
  // 200/100 - 1 = +100%
  assert.equal(cumulativeInflation(2000, 2020, CPI), 100);
});

test('cumulativeInflation of a same-year span is 0', () => {
  assert.equal(cumulativeInflation(2010, 2010, CPI), 0);
});

test('cumulativeInflation reversed span is negative (deflation direction)', () => {
  // 100/150 - 1 = -33.33%
  assert.ok(Math.abs(cumulativeInflation(2010, 2000, CPI) - (-100 / 3)) < 1e-9);
});

// ---------------------------------------------------------------------------
// annualRate (CAGR)
// ---------------------------------------------------------------------------
test('annualRate is the compounded average yearly rate', () => {
  // (150/100)^(1/10) - 1  ≈ 4.1380%
  const r = annualRate(2000, 2010, CPI);
  assert.ok(Math.abs(r - (Math.pow(1.5, 1 / 10) - 1) * 100) < 1e-9);
  assert.ok(Math.abs(r - 4.138) < 0.001);
});

test('annualRate of a same-year span is exactly 0', () => {
  assert.equal(annualRate(2010, 2010, CPI), 0);
});

test('annualRate is direction-agnostic (reversed span has the same magnitude)', () => {
  const forward = annualRate(2000, 2020, CPI);
  const reversed = annualRate(2020, 2000, CPI);
  assert.ok(Math.abs(forward - reversed) < 1e-9);
  assert.ok(forward > 0 && reversed > 0);
});

test('compounding annualRate across the span reproduces the cumulative change', () => {
  const from = 2000;
  const to = 2020;
  const r = annualRate(from, to, CPI) / 100;
  const grown = 100 * Math.pow(1 + r, to - from);
  assert.ok(Math.abs(grown - adjust(100, from, to, CPI)) < 1e-6);
});

// ---------------------------------------------------------------------------
// formatUSD
// ---------------------------------------------------------------------------
test('formatUSD groups thousands and keeps two decimals', () => {
  assert.equal(formatUSD(0), '$0.00');
  assert.equal(formatUSD(5), '$5.00');
  assert.equal(formatUSD(1234.5), '$1,234.50');
  assert.equal(formatUSD(1234567.891), '$1,234,567.89');
});

test('formatUSD keeps a leading minus for negatives', () => {
  assert.equal(formatUSD(-5), '-$5.00');
});

test('formatUSD returns "" for non-finite input', () => {
  assert.equal(formatUSD(NaN), '');
  assert.equal(formatUSD(Infinity), '');
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
test('formatPercent signs the value and trims trailing zeros', () => {
  assert.equal(formatPercent(146.32), '+146.32%');
  assert.equal(formatPercent(2.6), '+2.6%');
  assert.equal(formatPercent(-8.4), '-8.4%');
  assert.equal(formatPercent(50), '+50%');
});

test('formatPercent renders a bare 0% (no sign) at zero', () => {
  assert.equal(formatPercent(0), '0%');
});

test('formatPercent returns "" for non-finite input', () => {
  assert.equal(formatPercent(NaN), '');
});
