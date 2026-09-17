// Unit tests — number formatting & humanizeSeconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { formatNumber, expToPlain, humanizeSeconds } = await loadLogic();

test('formatNumber — integers, no grouping', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(80), '80');
  assert.equal(formatNumber(256), '256');
  assert.equal(formatNumber(4294967296), '4294967296');
  assert.equal(formatNumber(80000000), '80000000');
});

test('formatNumber — decimals, trailing zeros trimmed', () => {
  assert.equal(formatNumber(0.08), '0.08');
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(81.92), '81.92');
});

test('formatNumber — very large / very small go exponential', () => {
  assert.match(formatNumber(1e21), /e/);
  assert.match(formatNumber(1e-8), /e/);
  // Uses a lowercase, "+"-stripped exponent.
  assert.ok(!formatNumber(1e21).includes('e+'));
});

test('formatNumber — non-finite / non-number → empty string', () => {
  assert.equal(formatNumber(NaN), '');
  assert.equal(formatNumber(Infinity), '');
  assert.equal(formatNumber('80'), '');
  assert.equal(formatNumber(null), '');
});

test('expToPlain — exponential string to plain decimal', () => {
  assert.equal(expToPlain('1.234e+3'), '1234');
  assert.equal(expToPlain('5e-7'), '0.0000005');
  assert.equal(expToPlain('1e3'), '1000');
  assert.equal(expToPlain('-2.5e2'), '-250');
});

test('humanizeSeconds — sub-second units', () => {
  assert.equal(humanizeSeconds(0), '0s');
  assert.equal(humanizeSeconds(0.5), '500 ms');
  assert.equal(humanizeSeconds(0.08), '80 ms');
  assert.equal(humanizeSeconds(0.0005), '500 µs');
  assert.match(humanizeSeconds(0.0000005), /ns$/);
});

test('humanizeSeconds — whole-second composition', () => {
  assert.equal(humanizeSeconds(1), '1s');
  assert.equal(humanizeSeconds(80), '1m 20s');
  assert.equal(humanizeSeconds(3661), '1h 1m 1s');
  assert.equal(humanizeSeconds(90000), '1d 1h');       // 86400 + 3600
  assert.equal(humanizeSeconds(86400), '1d');
});

test('humanizeSeconds — years use a Julian year and lead the string', () => {
  assert.equal(humanizeSeconds(31557600), '1y');
  assert.match(humanizeSeconds(8e7), /^2y /);
});

test('humanizeSeconds — invalid input → empty string', () => {
  assert.equal(humanizeSeconds(-1), '');
  assert.equal(humanizeSeconds(NaN), '');
  assert.equal(humanizeSeconds(Infinity), '');
});
