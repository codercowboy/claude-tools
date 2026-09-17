// Unit tests for inspectUuid (source/logic.mjs). node --test, no browser/DOM.
// Detects version + variant; tolerant of braces / urn:uuid: / case / missing
// hyphens; rejects invalid; decodes v1 (Gregorian) and v7 (Unix-ms) timestamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { inspectUuid } = await loadLogic();

const V4 = '550e8400-e29b-41d4-a716-446655440000';
const V1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // classic v1 (DNS namespace)

test('inspectUuid: detects version 4 and RFC 4122 variant (10xx)', () => {
  const info = inspectUuid(V4);
  assert.equal(info.valid, true);
  assert.equal(info.version, 4);
  assert.equal(info.versionName, 'Version 4 (random)');
  assert.equal(info.variantBits, '10xx');
  assert.equal(info.variantName, 'RFC 4122 / DCE 1.1');
  assert.equal(info.canonical, V4);
  assert.equal(info.timestamp, null); // v4 carries no timestamp
});

test('inspectUuid: canonical + field breakdown', () => {
  const info = inspectUuid(V4);
  assert.equal(info.hex, '550e8400e29b41d4a716446655440000');
  assert.deepEqual(info.fields, {
    timeLow: '550e8400',
    timeMid: 'e29b',
    timeHiAndVersion: '41d4',
    clockSeqAndVariant: 'a716',
    node: '446655440000',
  });
});

test('inspectUuid: tolerates braces', () => {
  const info = inspectUuid('{550e8400-e29b-41d4-a716-446655440000}');
  assert.equal(info.valid, true);
  assert.equal(info.canonical, V4);
});

test('inspectUuid: tolerates a urn:uuid: prefix (case-insensitive)', () => {
  const info = inspectUuid('URN:UUID:550E8400-E29B-41D4-A716-446655440000');
  assert.equal(info.valid, true);
  assert.equal(info.canonical, V4);
});

test('inspectUuid: tolerates uppercase and normalizes to lowercase canonical', () => {
  const info = inspectUuid(V4.toUpperCase());
  assert.equal(info.valid, true);
  assert.equal(info.canonical, V4);
});

test('inspectUuid: tolerates missing hyphens', () => {
  const info = inspectUuid('550e8400e29b41d4a716446655440000');
  assert.equal(info.valid, true);
  assert.equal(info.canonical, V4);
});

test('inspectUuid: tolerates surrounding whitespace + uppercase + missing hyphens together', () => {
  const info = inspectUuid('  550E8400E29B41D4A716446655440000  ');
  assert.equal(info.valid, true);
  assert.equal(info.canonical, V4);
});

test('inspectUuid: rejects empty input with a prompt', () => {
  const info = inspectUuid('');
  assert.equal(info.valid, false);
  assert.match(info.error, /Enter a UUID/i);
});

test('inspectUuid: rejects too-short / too-long / non-hex', () => {
  for (const bad of ['550e8400', 'not-a-uuid', '550e8400-e29b-41d4-a716-4466554400000', 'zzzzzzzz-e29b-41d4-a716-446655440000']) {
    const info = inspectUuid(bad);
    assert.equal(info.valid, false, `expected invalid: ${bad}`);
    assert.ok(info.error && info.error.length > 0);
  }
});

test('inspectUuid: Nil UUID (all zeros)', () => {
  const info = inspectUuid('00000000-0000-0000-0000-000000000000');
  assert.equal(info.valid, true);
  assert.equal(info.isNil, true);
  assert.equal(info.isMax, false);
  assert.equal(info.versionName, 'Nil UUID');
  assert.equal(info.timestamp, null);
});

test('inspectUuid: Max UUID (all ones)', () => {
  const info = inspectUuid('ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.equal(info.valid, true);
  assert.equal(info.isMax, true);
  assert.equal(info.isNil, false);
  assert.equal(info.versionName, 'Max UUID');
  assert.equal(info.timestamp, null);
});

test('inspectUuid: decodes a v1 timestamp to a valid Date', () => {
  const info = inspectUuid(V1);
  assert.equal(info.valid, true);
  assert.equal(info.version, 1);
  assert.equal(info.versionName, 'Version 1 (time-based)');
  assert.ok(info.timestamp instanceof Date);
  assert.ok(!Number.isNaN(info.timestamp.getTime()));
  // The DNS-namespace UUID's embedded Gregorian time is in Feb 1998.
  assert.equal(info.timestamp.toISOString(), '1998-02-04T22:13:53.151Z');
});

test('inspectUuid: variant detection across the four buckets', () => {
  // 17th hex digit drives the variant nibble.
  const mk = (v17) => `550e8400-e29b-41d4-${v17}716-446655440000`;
  assert.equal(inspectUuid(mk('0')).variantBits, '0xxx'); // NCS (0)
  assert.equal(inspectUuid(mk('9')).variantBits, '10xx'); // RFC 4122 (8-b)
  assert.equal(inspectUuid(mk('c')).variantBits, '110x'); // Microsoft (c-d)
  assert.equal(inspectUuid(mk('e')).variantBits, '111x'); // Reserved (e-f)
});
