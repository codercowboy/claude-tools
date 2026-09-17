// Unit tests — Card 1: transfer/rate math. bit vs byte, base toggle, references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const {
  sizeToBits, rateToBitsPerSec, transferTime, referenceTransferTimes,
  REFERENCE_SIZES, SIZE_UNIT_BY_KEY, RATE_UNIT_BY_KEY, SIZE_UNIT_ORDER,
} = await loadLogic();

// -------- sizeToBits: bit vs byte families, prefix powers, base --------

test('sizeToBits — byte family is ×8, decimal base', () => {
  assert.equal(sizeToBits(1, 'B', 1000), 8);
  assert.equal(sizeToBits(1, 'KB', 1000), 8e3);
  assert.equal(sizeToBits(1, 'MB', 1000), 8e6);
  assert.equal(sizeToBits(1, 'GB', 1000), 8e9);
  assert.equal(sizeToBits(1, 'TB', 1000), 8e12);
  assert.equal(sizeToBits(1, 'PB', 1000), 8e15);
});

test('sizeToBits — bit family is ×1, decimal base', () => {
  assert.equal(sizeToBits(1, 'b', 1000), 1);
  assert.equal(sizeToBits(1, 'Kb', 1000), 1e3);
  assert.equal(sizeToBits(1, 'Mb', 1000), 1e6);
  assert.equal(sizeToBits(1, 'Gb', 1000), 1e9);
  assert.equal(sizeToBits(8, 'Gb', 1000), 8e9); // 8 Gb == 1 GB
});

test('sizeToBits — binary base (1024) differs from decimal', () => {
  assert.equal(sizeToBits(1, 'KB', 1024), 8 * 1024);
  assert.equal(sizeToBits(1, 'GB', 1024), 8 * 1024 ** 3);
  assert.equal(sizeToBits(1, 'Mb', 1024), 1024 ** 2);
});

test('sizeToBits — base defaults to binary (1024) unless 1000 is given', () => {
  // normalizeBase: only an explicit 1000 selects decimal.
  assert.equal(sizeToBits(1, 'KB', 1024), 8192);
  assert.equal(sizeToBits(1, 'KB', undefined), 8192);
  assert.equal(sizeToBits(1, 'KB', 999), 8192);
});

test('rateToBitsPerSec — bit and byte rate families', () => {
  assert.equal(rateToBitsPerSec(1, 'bps', 1000), 1);
  assert.equal(rateToBitsPerSec(100, 'Mbps', 1000), 1e8);
  assert.equal(rateToBitsPerSec(1, 'Gbps', 1000), 1e9);
  assert.equal(rateToBitsPerSec(1, 'Bps', 1000), 8);      // 1 byte/s = 8 bit/s
  assert.equal(rateToBitsPerSec(1, 'MBps', 1000), 8e6);
  assert.equal(rateToBitsPerSec(12.5, 'MBps', 1000), 1e8); // == 100 Mbps
});

// -------- transferTime: the headline math --------

test('transferTime — 1 GB @ 100 Mbps (decimal) is exactly 80 s', () => {
  assert.equal(transferTime(1, 'GB', 100, 'Mbps', 1000), 80);
});

test('transferTime — byte-rate path agrees with the bit-rate path', () => {
  // 12.5 MB/s == 100 Mbps, so 1 GB still takes 80 s.
  assert.equal(transferTime(1, 'GB', 12.5, 'MBps', 1000), 80);
});

test('transferTime — binary base gives a different (larger) result', () => {
  // 8 * 1024^3 bits / (100 * 1024^2 bit/s) = 81.92 s
  assert.equal(transferTime(1, 'GB', 100, 'Mbps', 1024), 81.92);
});

test('transferTime — accepts string inputs (UI passes input.value)', () => {
  assert.equal(transferTime('1', 'GB', '100', 'Mbps', 1000), 80);
});

test('transferTime — simple ratios', () => {
  assert.equal(transferTime(1, 'b', 1, 'bps', 1000), 1);
  assert.equal(transferTime(1, 'B', 1, 'bps', 1000), 8);
  assert.equal(transferTime(0, 'GB', 100, 'Mbps', 1000), 0); // zero amount is allowed
});

// -------- referenceTransferTimes --------

test('referenceTransferTimes — 1 MB/GB/TB/PB @ 100 Mbps (decimal)', () => {
  const rows = referenceTransferTimes(100, 'Mbps', 1000);
  assert.deepEqual(rows.map((r) => r.label), ['1 MB', '1 GB', '1 TB', '1 PB']);
  assert.equal(rows[0].seconds, 0.08);   // 1 MB
  assert.equal(rows[1].seconds, 80);     // 1 GB
  assert.equal(rows[2].seconds, 80000);  // 1 TB
  assert.equal(rows[3].seconds, 8e7);    // 1 PB
});

test('referenceTransferTimes — covers exactly the four REFERENCE_SIZES', () => {
  const rows = referenceTransferTimes(1, 'Gbps', 1000);
  assert.equal(rows.length, REFERENCE_SIZES.length);
});

// -------- error paths --------

test('transferTime — friendly throws on invalid amount / speed', () => {
  assert.throws(() => transferTime(-1, 'GB', 100, 'Mbps', 1000), /zero or more/);
  assert.throws(() => transferTime('x', 'GB', 100, 'Mbps', 1000), /zero or more/);
  assert.throws(() => transferTime(1, 'GB', 0, 'Mbps', 1000), /greater than zero/);
  assert.throws(() => transferTime(1, 'GB', -5, 'Mbps', 1000), /greater than zero/);
  assert.throws(() => transferTime(1, 'GB', '', 'Mbps', 1000), /greater than zero/);
});

test('sizeToBits / rateToBitsPerSec — friendly throw on unknown units', () => {
  assert.throws(() => sizeToBits(1, 'XB', 1000), /Unknown size unit/);
  assert.throws(() => rateToBitsPerSec(1, 'xbps', 1000), /Unknown speed unit/);
});

test('referenceTransferTimes — friendly throws on non-positive speed', () => {
  assert.throws(() => referenceTransferTimes(0, 'Mbps', 1000), /greater than zero/);
});

// -------- unit table integrity --------

test('SIZE_UNIT_ORDER lists byte family then bit family, all keyed', () => {
  assert.deepEqual(SIZE_UNIT_ORDER,
    ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'b', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb']);
  for (const key of SIZE_UNIT_ORDER) {
    assert.ok(SIZE_UNIT_BY_KEY[key], `size unit ${key} defined`);
  }
});

test('every rate unit has a name/abbr/family/power', () => {
  for (const key of Object.keys(RATE_UNIT_BY_KEY)) {
    const u = RATE_UNIT_BY_KEY[key];
    assert.ok(u.name && u.abbr, key);
    assert.ok(u.family === 'bit' || u.family === 'byte', key);
    assert.equal(typeof u.power, 'number', key);
  }
});
