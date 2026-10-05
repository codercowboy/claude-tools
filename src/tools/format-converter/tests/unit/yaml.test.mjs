// Unit tests for the practical-subset YAML parse/emit — supported constructs
// round-trip; unsupported constructs are rejected with the documented error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseYAML, emitYAML } = await loadLogic();

test('parseYAML: block mappings and nested maps', () => {
  const model = parseYAML('name: Ada\naddr:\n  city: London\n  country: UK');
  assert.deepEqual(model, { name: 'Ada', addr: { city: 'London', country: 'UK' } });
});

test('parseYAML: block sequences nested under a key', () => {
  const model = parseYAML('fields:\n  - mathematics\n  - computing');
  assert.deepEqual(model, { fields: ['mathematics', 'computing'] });
});

test('parseYAML: inline maps as sequence items (- key: value)', () => {
  const model = parseYAML('people:\n  - name: Grace\n    born: 1906\n  - name: Alan\n    born: 1912');
  assert.deepEqual(model, {
    people: [{ name: 'Grace', born: 1906 }, { name: 'Alan', born: 1912 }],
  });
});

test('parseYAML: scalar type inference (null/bool/int/float/string)', () => {
  const model = parseYAML('a: null\nb: ~\nc: true\nd: false\ne: 42\nf: -2\ng: 1.5\nh: 1e3\ni: hello');
  assert.deepEqual(model, {
    a: null, b: null, c: true, d: false, e: 42, f: -2, g: 1.5, h: 1000, i: 'hello',
  });
});

test('parseYAML: single- and double-quoted scalars with escapes', () => {
  const model = parseYAML('a: "line\\nbreak"\nb: \'it\'\'s ok\'\nc: "42"');
  assert.deepEqual(model, { a: 'line\nbreak', b: "it's ok", c: '42' });
});

test('parseYAML: flow collections [..] and {..}', () => {
  const model = parseYAML('nums: [1, 2, 3]\nmap: { a: 1, b: two }');
  assert.deepEqual(model, { nums: [1, 2, 3], map: { a: 1, b: 'two' } });
});

test('parseYAML: comments and a leading --- document marker are ignored', () => {
  const model = parseYAML('---\n# a comment\nname: Ada  # trailing\nborn: 1815');
  assert.deepEqual(model, { name: 'Ada', born: 1815 });
});

test('parseYAML: | literal block scalar keeps newlines', () => {
  const model = parseYAML('text: |\n  line1\n  line2');
  assert.equal(model.text, 'line1\nline2\n');
});

test('parseYAML: > folded block scalar joins lines with spaces', () => {
  const model = parseYAML('text: >\n  line1\n  line2');
  assert.equal(model.text.trim(), 'line1 line2');
});

test('emitYAML emits block style and round-trips a nested model', () => {
  const model = {
    name: 'Ada', nums: [1, 2], addr: { city: 'London' },
    people: [{ name: 'Grace', born: 1906 }],
  };
  const out = emitYAML(model, { indent: 2 });
  assert.deepEqual(parseYAML(out), model);
});

test('emitYAML quotes strings that would otherwise re-parse as non-strings', () => {
  const out = emitYAML({ a: '42', b: 'true', c: 'plain' });
  assert.deepEqual(parseYAML(out), { a: '42', b: 'true', c: 'plain' });
});

test('JSON <-> YAML round-trip for JSON-representable data', () => {
  const value = {
    s: 'hi', n: 3.14, i: 7, b: true, nul: null,
    arr: [1, 'two', { three: 3 }], obj: { nested: { deep: [true, false] } },
  };
  assert.deepEqual(parseYAML(emitYAML(value)), value);
});

test('parseYAML: a top-level bare scalar document is the scalar, not {}', () => {
  // Regression: parseYAMLBlock used to fall through to an empty mapping for a
  // document that is a lone scalar, silently dropping the value.
  assert.equal(parseYAML('42'), 42);
  assert.equal(parseYAML('hello world'), 'hello world');
  assert.equal(parseYAML('true'), true);
  assert.equal(parseYAML('"quoted"'), 'quoted');
});

test('parseYAML: a top-level flow collection document parses (not {})', () => {
  assert.deepEqual(parseYAML('[1, 2, 3]'), [1, 2, 3]);
  assert.deepEqual(parseYAML('{a: 1, b: two}'), { a: 1, b: 'two' });
});

test('parseYAML: a scalar written on the line below its key is captured', () => {
  // Regression: `key:` followed by an indented bare scalar produced {key:{}}.
  assert.deepEqual(parseYAML('key:\n  somevalue'), { key: 'somevalue' });
  assert.deepEqual(parseYAML('n:\n  42'), { n: 42 });
});

// --- Rejected (unsupported) constructs: each names the construct clearly. ---
const rejections = [
  ['anchors', 'a: &anchor 1', /anchors \(&\)/],
  ['aliases', 'a: *anchor', /aliases \(\*\)/],
  ['tags', 'a: !!str 1', /tags \(!\)/],
  ['merge keys', '<<: *base', /merge keys \(<<\)/],
  ['complex keys', '? a\n: b', /complex mapping keys \(\?\)/],
  ['multiple documents', '---\na: 1\n---\nb: 2', /multiple documents/],
  ['tab indentation', 'a:\n\tb: 1', /tabs are not allowed/],
];

for (const [name, src, re] of rejections) {
  test(`parseYAML rejects ${name} with the documented error`, () => {
    assert.throws(() => parseYAML(src), re);
  });
}
