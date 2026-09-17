// Offline unit tests (node --test) that spot-check the BUNDLED CPI dataset
// (source/cpi-data.json) against the pure logic. These are the "does the real
// shipped data still produce the documented numbers?" checks — a regression net
// for both the dataset and the math, using the exact file the build inlines.
//
// Read via fs + JSON.parse (rather than a JSON import assertion) so this runs
// identically on every supported Node (>=20) regardless of import-attributes
// support. Dev/test-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adjust, cumulativeInflation, annualRate, dataRange, cpiFor } from '../../source/logic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../source/cpi-data.json'), 'utf8'),
);
const CPI = DOC.data;

// ---------------------------------------------------------------------------
// Shape / provenance of the committed dataset
// ---------------------------------------------------------------------------
test('dataset carries the documented CPI-U provenance metadata', () => {
  assert.equal(DOC.series, 'CUUR0000SA0');
  assert.equal(DOC.base, '1982-84=100');
  assert.match(DOC.source, /Bureau of Labor Statistics/i);
  assert.equal(typeof DOC.lastUpdated, 'string');
  assert.ok(DOC.lastUpdated.length > 0);
});

test('every entry is a numeric year mapped to a finite positive number', () => {
  const keys = Object.keys(CPI);
  assert.ok(keys.length > 100, 'expected a full century-plus of annual data');
  for (const k of keys) {
    assert.ok(/^\d{4}$/.test(k), `year key "${k}" should be a 4-digit year`);
    const v = CPI[k];
    assert.equal(typeof v, 'number', `CPI[${k}] should be a number`);
    assert.ok(Number.isFinite(v) && v > 0, `CPI[${k}] should be finite & positive`);
  }
});

test('years are contiguous from 1913 to the latest, no gaps', () => {
  const { minYear, maxYear } = dataRange(CPI);
  assert.equal(minYear, 1913, 'CPI-U annual series starts in 1913');
  assert.ok(maxYear >= 2025, 'dataset should run through at least 2025');
  for (let y = minYear; y <= maxYear; y++) {
    assert.ok(CPI[y] != null || CPI[String(y)] != null, `missing year ${y}`);
  }
  // The index rises overall across the century (prices went up a lot).
  assert.ok(cpiFor(maxYear, CPI) > cpiFor(minYear, CPI) * 10);
});

// ---------------------------------------------------------------------------
// Documented known values (the numbers the README / task cite)
// ---------------------------------------------------------------------------
test('adjust(100, 1990, 2025) ≈ $246.32 with the bundled data', () => {
  assert.ok(Math.abs(adjust(100, 1990, 2025, CPI) - 246.32) < 0.01);
});

test('cumulative inflation 1990→2025 ≈ +146.32%', () => {
  assert.ok(Math.abs(cumulativeInflation(1990, 2025, CPI) - 146.32) < 0.01);
});

test('average annual rate 1990→2025 ≈ +2.61%/yr', () => {
  assert.ok(Math.abs(annualRate(1990, 2025, CPI) - 2.61) < 0.02);
});

test('dataRange of the bundled data is 1913 .. latest (>=2025)', () => {
  const { minYear, maxYear } = dataRange(CPI);
  assert.equal(minYear, 1913);
  assert.ok(maxYear >= 2025);
});

// ---------------------------------------------------------------------------
// Edge behavior against the real range
// ---------------------------------------------------------------------------
test('a same-year span yields 0% cumulative and 0%/yr against real data', () => {
  assert.equal(cumulativeInflation(1970, 1970, CPI), 0);
  assert.equal(annualRate(1970, 1970, CPI), 0);
  assert.equal(adjust(50, 1970, 1970, CPI), 50);
});

test('reversed span is symmetric: adjust round-trips back to the amount', () => {
  const forward = adjust(100, 1950, 2000, CPI);
  assert.ok(Math.abs(adjust(forward, 2000, 1950, CPI) - 100) < 1e-6);
  // annualRate direction-agnostic on real data too.
  assert.ok(Math.abs(annualRate(1950, 2000, CPI) - annualRate(2000, 1950, CPI)) < 1e-9);
});

test('out-of-range year throws the friendly range message naming the real bounds', () => {
  const { minYear, maxYear } = dataRange(CPI);
  assert.throws(
    () => cpiFor(1800, CPI),
    (err) => {
      assert.equal(err.message, `No CPI data for 1800. Data covers ${minYear}–${maxYear}.`);
      return true;
    },
  );
});
