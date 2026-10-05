// Unit tests for JSON parse/emit (source/logic.mjs). Offline node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseJSON, emitJSON } = await loadLogic();

test('parseJSON parses a nested object/array tree', () => {
  const model = parseJSON('{"name":"Ada","nums":[1,2,3],"addr":{"city":"London"},"ok":true,"n":null}');
  assert.deepEqual(model, {
    name: 'Ada', nums: [1, 2, 3], addr: { city: 'London' }, ok: true, n: null,
  });
});

test('emitJSON round-trips a representative nested value', () => {
  const value = { a: 1, b: [true, false, null, 'x'], c: { d: { e: 2.5 } } };
  const out = emitJSON(value, { indent: 2 });
  assert.deepEqual(parseJSON(out), value);
});

test('emitJSON honors the indent option (2 vs 4 vs 0/minified)', () => {
  const v = { a: 1 };
  assert.equal(emitJSON(v, { indent: 2 }), '{\n  "a": 1\n}');
  assert.equal(emitJSON(v, { indent: 4 }), '{\n    "a": 1\n}');
  assert.equal(emitJSON(v, { indent: 0 }), '{"a":1}');
});

test('parseJSON throws a friendly error (not a raw SyntaxError) on invalid input', () => {
  assert.throws(() => parseJSON('{ not json }'), /Invalid JSON:/);
});
