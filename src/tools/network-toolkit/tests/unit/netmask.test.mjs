// Unit tests — Card 4: prefixToMask / maskToPrefix, incl. non-contiguous reject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { prefixToMask, maskToPrefix } = await loadLogic();

// Canonical prefix ↔ dotted-mask pairs across the whole range.
const PAIRS = [
  [0, '0.0.0.0'],
  [1, '128.0.0.0'],
  [4, '240.0.0.0'],
  [8, '255.0.0.0'],
  [16, '255.255.0.0'],
  [24, '255.255.255.0'],
  [25, '255.255.255.128'],
  [30, '255.255.255.252'],
  [31, '255.255.255.254'],
  [32, '255.255.255.255'],
];

test('prefixToMask — known values', () => {
  for (const [p, mask] of PAIRS) {
    assert.equal(prefixToMask(p), mask, `/${p}`);
  }
});

test('maskToPrefix — known values', () => {
  for (const [p, mask] of PAIRS) {
    assert.equal(maskToPrefix(mask), p, mask);
  }
});

test('prefixToMask / maskToPrefix round-trip for every prefix 0..32', () => {
  for (let p = 0; p <= 32; p++) {
    assert.equal(maskToPrefix(prefixToMask(p)), p, `/${p}`);
  }
});

test('prefixToMask accepts a string prefix (UI passes input.value)', () => {
  assert.equal(prefixToMask('24'), '255.255.255.0');
});

test('maskToPrefix — rejects a non-contiguous mask', () => {
  // The classic gotcha: 1-bits are not contiguous.
  assert.throws(() => maskToPrefix('255.0.255.0'), /contiguous/);
  assert.throws(() => maskToPrefix('255.255.0.255'), /contiguous/);
  assert.throws(() => maskToPrefix('0.255.255.255'), /contiguous/);
  assert.throws(() => maskToPrefix('255.255.255.1'), /contiguous/);
  assert.throws(() => maskToPrefix('128.0.0.1'), /contiguous/);
});

test('maskToPrefix — rejects malformed dotted input (delegates to ipv4ToInt)', () => {
  assert.throws(() => maskToPrefix('256.0.0.0'), /0.?255/);
  assert.throws(() => maskToPrefix('255.255.255'), /four parts/);
  assert.throws(() => maskToPrefix(''), /Enter an IPv4/);
});

test('prefixToMask — friendly throws on a bad prefix', () => {
  assert.throws(() => prefixToMask(-1), /0 to 32/);
  assert.throws(() => prefixToMask(33), /0 to 32/);
  assert.throws(() => prefixToMask(12.5), /whole number/);
  assert.throws(() => prefixToMask('nope'), /0 to 32/);
});
