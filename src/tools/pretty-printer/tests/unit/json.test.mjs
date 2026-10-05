// Unit tests — JSON engine (source/logic.mjs). node --test, no browser/DOM.
// See DESIGN.md § "JSON (full)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJSON, minifyJSON, SAMPLES } from './_helpers.mjs';

// A spread of representative JSON inputs (compact, so re-formatting is a real
// transform on each).
const INPUTS = {
  object: '{"name":"claude","version":"1.0","ok":true}',
  nested: '{"a":{"b":{"c":[1,2,{"d":null}]}},"e":[]}',
  array: '[1,2,3,{"x":true},[4,[5,[6]]]]',
  emptyObject: '{}',
  emptyArray: '[]',
  unicode: '{"emoji":"😀","greek":"λ","escaped":"line1\\nline2\\t\\"q\\""}',
  numbers: '{"int":42,"neg":-7,"float":3.14,"exp":6.022e23,"zero":0}',
  deep: '{"l1":{"l2":{"l3":{"l4":{"l5":"deep"}}}}}',
};

test('minifyJSON: JSON.parse(minify(x)) deep-equals JSON.parse(x) — semantic equivalence', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    assert.deepEqual(JSON.parse(minifyJSON(src)), JSON.parse(src), name);
  }
});

test('minifyJSON: output has no insignificant whitespace', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const min = minifyJSON(src);
    // No spaces/newlines outside of string literals: compare against V8's own
    // whitespace-free serialization.
    assert.equal(min, JSON.stringify(JSON.parse(src)), name);
  }
});

test('formatJSON: fmt(fmt(x)) === fmt(x) — idempotent (2-space default)', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const once = formatJSON(src);
    assert.equal(formatJSON(once), once, name);
  }
});

test('formatJSON: round-trips through parse (format is meaning-preserving)', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    assert.deepEqual(JSON.parse(formatJSON(src)), JSON.parse(src), name);
  }
});

test('formatJSON: format→minify→format is stable', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const f = formatJSON(src);
    assert.equal(formatJSON(minifyJSON(f)), f, name);
  }
});

test('formatJSON: indent variants — 2 spaces (default), 4 spaces, tab', () => {
  const src = '{"a":1,"b":{"c":2}}';
  assert.equal(formatJSON(src), '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}');
  assert.equal(formatJSON(src, { indent: 2 }), '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}');
  assert.equal(formatJSON(src, { indent: 4 }), '{\n    "a": 1,\n    "b": {\n        "c": 2\n    }\n}');
  assert.equal(formatJSON(src, { indent: '\t' }), '{\n\t"a": 1,\n\t"b": {\n\t\t"c": 2\n\t}\n}');
  assert.equal(formatJSON(src, { indent: 'tab' }), '{\n\t"a": 1,\n\t"b": {\n\t\t"c": 2\n\t}\n}');
});

test('formatJSON: every indent variant still round-trips', () => {
  for (const indent of [2, 4, '\t', 'tab']) {
    for (const src of Object.values(INPUTS)) {
      assert.deepEqual(JSON.parse(formatJSON(src, { indent })), JSON.parse(src));
    }
  }
});

test('JSON: top-level primitives are handled by both format and minify', () => {
  const prims = ['42', '-3.5', '6.022e23', '"a string"', 'true', 'false', 'null'];
  for (const p of prims) {
    assert.equal(formatJSON(p), JSON.stringify(JSON.parse(p)), `format ${p}`);
    assert.equal(minifyJSON(p), JSON.stringify(JSON.parse(p)), `minify ${p}`);
  }
});

test('JSON: top-level string with escapes is preserved exactly', () => {
  const src = '"tab\\tnewline\\nquote\\"backslash\\\\"';
  assert.equal(JSON.parse(formatJSON(src)), JSON.parse(src));
  assert.equal(minifyJSON(src), src);
});

test('JSON: whitespace-heavy input minifies to the compact canonical form', () => {
  const src = '{\n\t"a" :   1 ,\n\t"b" : [ 1 , 2 ,   3 ]\n}';
  assert.equal(minifyJSON(src), '{"a":1,"b":[1,2,3]}');
});

test('JSON: keys with special characters survive round-trip', () => {
  const src = '{"a.b":1,"c d":2,"":3,"quote\\"":4}';
  assert.deepEqual(JSON.parse(formatJSON(src)), JSON.parse(src));
  assert.deepEqual(JSON.parse(minifyJSON(src)), JSON.parse(src));
});

// --- Errors ---------------------------------------------------------------

test('formatJSON: invalid input throws an Error prefixed "Invalid JSON:"', () => {
  for (const bad of ['{bad}', '{"a":}', '[1,2,', 'not json', "{'a':1}", '{"a":1,}']) {
    assert.throws(() => formatJSON(bad), (e) => e instanceof Error && /^Invalid JSON:/.test(e.message), bad);
  }
});

test('minifyJSON: invalid input throws the same "Invalid JSON:" error', () => {
  assert.throws(() => minifyJSON('{oops'), (e) => /^Invalid JSON:/.test(e.message));
});

test('formatJSON: the error message includes (line L, col C) when V8 provides a position', () => {
  // "{bad}" — V8 reports a column here on supported Node versions.
  let msg = '';
  try { formatJSON('{bad}'); } catch (e) { msg = e.message; }
  assert.match(msg, /^Invalid JSON: .+ \(line \d+, col \d+\)$/);
});

test('formatJSON: line/col reflects the error location on a later line', () => {
  const src = '{\n  "a": 1,\n  "b": nope\n}';
  let msg = '';
  try { formatJSON(src); } catch (e) { msg = e.message; }
  // The bad token sits on line 3; assert a line number is surfaced when present.
  if (/\(line \d+/.test(msg)) {
    assert.match(msg, /\(line 3, col \d+\)/);
  } else {
    assert.match(msg, /^Invalid JSON:/);
  }
});

test('formatJSON: the whole-source echo in newer V8 messages is trimmed out', () => {
  let msg = '';
  try { formatJSON('not json'); } catch (e) { msg = e.message; }
  assert.doesNotMatch(msg, /is not valid JSON/);
  assert.match(msg, /^Invalid JSON:/);
});

// --- Sample ---------------------------------------------------------------

test('JSON sample: minify is semantically equal and format is idempotent', () => {
  const src = SAMPLES.json;
  assert.deepEqual(JSON.parse(minifyJSON(src)), JSON.parse(src));
  const f = formatJSON(src);
  assert.equal(formatJSON(f), f);
});
