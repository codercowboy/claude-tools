// Unit tests for CtPretty.mjs -- JSON + YAML + shared helpers ONLY (Phase 10a).
// HTML/CSS (10b) and SQL/JS (10c) are covered by other files. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: exact fixtures (pinned to the lib's ACTUAL output), plus semantic equality
// (parse-compare) for YAML round-trip/idempotency since YAML formatting is opinionated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  byteLength, indentUnit, lineColFromOffset,
  formatJSON, minifyJSON,
  parseYAML, formatYAML, minifyYAML,
} from '../../utils/formats/CtPretty.mjs';

// =========================================================== shared helpers
test('byteLength: ASCII = 1 byte/char, empty = 0', () => {
  assert.equal(byteLength(''), 0);
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('Hello, World!'), 13);
});
test('byteLength: 2-byte, 3-byte, 4-byte (emoji/surrogate pair)', () => {
  assert.equal(byteLength('\u00e9'), 2);        // e-acute
  assert.equal(byteLength('\u00fc\u00f1'), 4);  // 2 x 2-byte
  assert.equal(byteLength('\u2603'), 3);        // snowman
  assert.equal(byteLength('\u20ac'), 3);        // euro
  assert.equal(byteLength('\u{1F600}'), 4);     // emoji = surrogate pair, 4 bytes (not 6)
  assert.equal(byteLength('a\u00e9\u2603\u{1F600}'), 1 + 2 + 3 + 4);
});

test('indentUnit: numbers -> that many spaces', () => {
  assert.equal(indentUnit(2), '  ');
  assert.equal(indentUnit(4), '    ');
  assert.equal(indentUnit(0), '');
  assert.equal(indentUnit('3'), '   ');
});
test("indentUnit: 'tab' and '\\t' -> tab", () => {
  assert.equal(indentUnit('tab'), '\t');
  assert.equal(indentUnit('\t'), '\t');
});
test("indentUnit: garbage / negative / NaN -> default two spaces", () => {
  assert.equal(indentUnit('garbage'), '  ');
  assert.equal(indentUnit(-1), '  ');
  assert.equal(indentUnit(NaN), '  ');
  assert.equal(indentUnit(Infinity), '  ');
  assert.equal(indentUnit({}), '  ');
});

test('lineColFromOffset: offset 0 -> {1,1}', () => {
  assert.deepEqual(lineColFromOffset('abc\ndef', 0), { line: 1, col: 1 });
  assert.deepEqual(lineColFromOffset('', 0), { line: 1, col: 1 });
});
test('lineColFromOffset: mid-line is 1-based', () => {
  assert.deepEqual(lineColFromOffset('abc\ndef', 2), { line: 1, col: 3 });
  assert.deepEqual(lineColFromOffset('abc\ndef', 5), { line: 2, col: 2 });
});
test('lineColFromOffset: at the newline and just after it', () => {
  assert.deepEqual(lineColFromOffset('abc\ndef', 3), { line: 1, col: 4 }); // on the \n itself
  assert.deepEqual(lineColFromOffset('abc\ndef', 4), { line: 2, col: 1 }); // just after \n
  assert.deepEqual(lineColFromOffset('a\n\nb', 3), { line: 3, col: 1 });
});
test('lineColFromOffset: past end clamps to end; negative clamps to start', () => {
  assert.deepEqual(lineColFromOffset('abc\ndef', 7), { line: 2, col: 4 });
  assert.deepEqual(lineColFromOffset('abc\ndef', 999), { line: 2, col: 4 });
  assert.deepEqual(lineColFromOffset('abc\ndef', -5), { line: 1, col: 1 });
});

// =========================================================== JSON
const JSON_CASES = [
  { name: 'empty object', input: ' { } ', pretty: '{}', min: '{}' },
  { name: 'empty array', input: '[ ]', pretty: '[]', min: '[]' },
  { name: 'number', input: ' 42 ', pretty: '42', min: '42' },
  { name: 'negative/float/exp number', input: '-1.5e3', pretty: '-1500', min: '-1500' },
  { name: 'string', input: ' "hi there" ', pretty: '"hi there"', min: '"hi there"' },
  { name: 'null', input: ' null ', pretty: 'null', min: 'null' },
  { name: 'booleans', input: '[true,false]', pretty: '[\n  true,\n  false\n]', min: '[true,false]' },
  {
    name: 'simple object',
    input: '{"a":1,"b":"x"}',
    pretty: '{\n  "a": 1,\n  "b": "x"\n}',
    min: '{"a":1,"b":"x"}',
  },
  {
    name: 'nested with irregular whitespace',
    input: '{ "a" : [ 1 , 2 , { "b" : null } ] ,\n\t"c" : { } , "d" : [ ] }',
    pretty: '{\n  "a": [\n    1,\n    2,\n    {\n      "b": null\n    }\n  ],\n  "c": {},\n  "d": []\n}',
    min: '{"a":[1,2,{"b":null}],"c":{},"d":[]}',
  },
  {
    name: 'unicode and escapes preserved as characters',
    input: '{"u":"h\\u00e9llo \\u2603 \\ud83d\\ude00","q":"a\\"b\\\\c\\n"}',
    pretty: '{\n  "u": "h\u00e9llo \u2603 \u{1F600}",\n  "q": "a\\"b\\\\c\\n"\n}',
    min: '{"u":"h\u00e9llo \u2603 \u{1F600}","q":"a\\"b\\\\c\\n"}',
  },
  {
    name: 'whitespace inside strings is significant (kept)',
    input: '{ "k" :  "  a   b  " }',
    pretty: '{\n  "k": "  a   b  "\n}',
    min: '{"k":"  a   b  "}',
  },
];

for (const c of JSON_CASES) {
  test(`JSON exact: ${c.name}`, () => {
    assert.equal(formatJSON(c.input), c.pretty);
    assert.equal(minifyJSON(c.input), c.min);
  });
  test(`JSON idempotent: ${c.name}`, () => {
    assert.equal(formatJSON(formatJSON(c.input)), formatJSON(c.input));
    assert.equal(minifyJSON(minifyJSON(c.input)), minifyJSON(c.input));
    // cross: formatting a minified doc == formatting the original, and vice versa
    assert.equal(formatJSON(minifyJSON(c.input)), c.pretty);
    assert.equal(minifyJSON(formatJSON(c.input)), c.min);
  });
  test(`JSON round-trip: ${c.name}`, () => {
    const orig = JSON.parse(c.input);
    assert.deepEqual(JSON.parse(formatJSON(c.input)), orig);
    assert.deepEqual(JSON.parse(minifyJSON(c.input)), orig);
    assert.deepEqual(JSON.parse(formatJSON(c.input)), JSON.parse(minifyJSON(c.input)));
  });
}

test('formatJSON: default indent is 2 spaces', () => {
  assert.equal(formatJSON('{"a":{"b":1}}'), '{\n  "a": {\n    "b": 1\n  }\n}');
  assert.equal(formatJSON('{"a":{"b":1}}', {}), formatJSON('{"a":{"b":1}}', { indent: 2 }));
});
test('formatJSON: indent 4', () => {
  assert.equal(formatJSON('{"a":{"b":1}}', { indent: 4 }), '{\n    "a": {\n        "b": 1\n    }\n}');
});
test("formatJSON: indent 'tab' and '\\t'", () => {
  const want = '{\n\t"a": {\n\t\t"b": 1\n\t}\n}';
  assert.equal(formatJSON('{"a":{"b":1}}', { indent: 'tab' }), want);
  assert.equal(formatJSON('{"a":{"b":1}}', { indent: '\t' }), want);
});
test('formatJSON: indent 0 emits compact (JSON.stringify semantics)', () => {
  assert.equal(formatJSON('{"a": [1, 2]}', { indent: 0 }), '{"a":[1,2]}');
});
test('formatJSON: key order and array order preserved', () => {
  assert.equal(minifyJSON('{"z":1,"a":2,"m":[3,1,2]}'), '{"z":1,"a":2,"m":[3,1,2]}');
});
test('minifyJSON: strips newlines, tabs, CRLF between tokens', () => {
  assert.equal(minifyJSON('{\r\n\t"a":\t1,\r\n\t"b": [\n 2\n ]\n}\n'), '{"a":1,"b":[2]}');
});

test('JSON errors: trailing comma in object rejected with line/col', () => {
  for (const fn of [formatJSON, minifyJSON]) {
    assert.throws(() => fn('{"a":1,}'), (e) => {
      assert.ok(e instanceof Error);
      assert.match(e.message, /^Invalid JSON: /);
      assert.match(e.message, /\(line 1, col 8\)$/);
      return true;
    });
  }
});
test('JSON errors: trailing comma in array rejected', () => {
  assert.throws(() => formatJSON('[1,2,]'), /Invalid JSON/);
  assert.throws(() => minifyJSON('[1,2,]'), /Invalid JSON/);
});
test('JSON errors: multi-line input reports the right line and col', () => {
  assert.throws(() => formatJSON('{\n "a":1,\n}'), /Invalid JSON: .*\(line 3, col 1\)/);
});
test('JSON errors: truncated input carries line/col', () => {
  assert.throws(() => formatJSON('[1,2'), /Invalid JSON: .*\(line 1, col 5\)/);
});
test('JSON errors: bad token / empty input -> Invalid JSON (position info only when the engine gives one)', () => {
  assert.throws(() => formatJSON('nope'), (e) => e.message === "Invalid JSON: Unexpected token 'o'");
  assert.throws(() => formatJSON(''), (e) => e.message === 'Invalid JSON: Unexpected end of JSON input');
  assert.throws(() => minifyJSON('{'), /Invalid JSON/);
});
test('JSON errors: single quotes, comments, undefined, NaN rejected', () => {
  for (const bad of ["{'a':1}", '{"a":1} // c', '{"a":undefined}', '[NaN]', '{a:1}', '01']) {
    assert.throws(() => formatJSON(bad), /Invalid JSON/, bad);
    assert.throws(() => minifyJSON(bad), /Invalid JSON/, bad);
  }
});
test('JSON errors: error message does not embed the whole source', () => {
  const big = 'x'.repeat(200);
  assert.throws(() => formatJSON(big), (e) => !e.message.includes(big));
});

test('JSON edges: deep nesting round-trips', () => {
  let s = '1';
  for (let i = 0; i < 50; i++) s = `{"k":[${s}]}`;
  assert.deepEqual(JSON.parse(formatJSON(s)), JSON.parse(s));
  assert.equal(minifyJSON(formatJSON(s)), s);
});
test('JSON edges: large integers/float literal normalised as JS does', () => {
  assert.equal(minifyJSON('[1.0, 1e2, 0.5]'), '[1,100,0.5]');
});

// =========================================================== YAML
const YAML_DOC = `# top comment
name: Alice  # trailing comment
age: 30
tags:
  - a
  - "b c"
  - 'it''s'
nested:
  k: {x: 1, y: [1,2]}
  empty: []
  e2: {}
list:
  - id: 1
    v: yes
  - id: 2
    v: "true"
uni: héllo ☃ 😀
n: ~
s: "123"
`;
const YAML_VALUE = {
  name: 'Alice', age: 30, tags: ['a', 'b c', "it's"],
  nested: { k: { x: 1, y: [1, 2] }, empty: [], e2: {} },
  list: [{ id: 1, v: 'yes' }, { id: 2, v: 'true' }],
  uni: 'h\u00e9llo \u2603 \u{1F600}', n: null, s: '123',
};

test('parseYAML: full document -> expected value (comments dropped, ~ -> null, yes stays a string)', () => {
  assert.deepEqual(parseYAML(YAML_DOC), YAML_VALUE);
});

test('formatYAML EXACT fixture (default 2-space)', () => {
  assert.equal(formatYAML(YAML_DOC), [
    'name: Alice',
    'age: 30',
    'tags:',
    '  - a',
    '  - b c',
    '  - "it\'s"',
    'nested:',
    '  k:',
    '    x: 1',
    '    y:',
    '      - 1',
    '      - 2',
    '  empty: []',
    '  e2: {}',
    'list:',
    '  - id: 1',
    '    v: "yes"',
    '  - id: 2',
    '    v: "true"',
    'uni: h\u00e9llo \u2603 \u{1F600}',
    'n: null',
    's: "123"',
    '',
  ].join('\n'));
});

test('minifyYAML EXACT fixture (single-line flow)', () => {
  assert.equal(
    minifyYAML(YAML_DOC),
    '{name: Alice, age: 30, tags: [a, b c, "it\'s"], nested: {k: {x: 1, y: [1, 2]}, empty: [], e2: {}}, ' +
    'list: [{id: 1, v: "yes"}, {id: 2, v: "true"}], uni: h\u00e9llo \u2603 \u{1F600}, n: null, s: "123"}',
  );
});

test('formatYAML: indent 4 changes nesting unit; "- key" continuation stays aligned', () => {
  assert.equal(formatYAML('a:\n  b:\n    c:\n      d: deep', { indent: 4 }),
    'a:\n    b:\n        c:\n            d: deep\n');
  assert.equal(formatYAML('l:\n  - id: 1\n    v: 2', { indent: 4 }), 'l:\n    - id: 1\n      v: 2\n');
});

test('formatYAML: sequences of mixed kinds (exact)', () => {
  const src = '- 1\n- [2,3]\n- {a: 1}\n-\n  - x\n- a: 1\n  b: 2\n- []\n- {}';
  assert.deepEqual(parseYAML(src), [1, [2, 3], { a: 1 }, ['x'], { a: 1, b: 2 }, [], {}]);
  assert.equal(formatYAML(src), '- 1\n-\n  - 2\n  - 3\n- a: 1\n-\n  - x\n- a: 1\n  b: 2\n- []\n- {}\n');
  assert.equal(minifyYAML(src), '[1, [2, 3], {a: 1}, [x], {a: 1, b: 2}, [], {}]');
});

test('formatYAML: quoting rules (keys and values that would otherwise change meaning)', () => {
  const out = formatYAML('k: "a: b"\n"x y": 1\n"-": "- z"\nq: "yes"\nz: ""\nh: "a # b"');
  assert.equal(out, 'k: "a: b"\nx y: 1\n"-": "- z"\nq: "yes"\nz: ""\nh: "a # b"\n');
  assert.deepEqual(parseYAML(out), { k: 'a: b', 'x y': 1, '-': '- z', q: 'yes', z: '', h: 'a # b' });
});

test('YAML scalars: types parsed', () => {
  assert.deepEqual(
    parseYAML('i: 42\nf: -2.5\ne: 1e3\nh: 0x1F\nt: true\nT: True\nF: FALSE\nn: null\nN: ~\nblank:\ns: plain text\nd: "dq"\nsq: \'sq\''),
    { i: 42, f: -2.5, e: 1000, h: 31, t: true, T: true, F: false, n: null, N: null, blank: null, s: 'plain text', d: 'dq', sq: 'sq' },
  );
});
test('YAML scalars: strings that look like other types are quoted on emit and survive round-trip', () => {
  const v = { a: '123', b: 'true', c: 'null', d: '~', e: 'no', f: '1.5', g: '' };
  const src = Object.entries(v).map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join('\n');
  assert.deepEqual(parseYAML(src), v);
  assert.deepEqual(parseYAML(formatYAML(src)), v);
  assert.deepEqual(parseYAML(minifyYAML(src)), v);
});
test('YAML scalars: double-quoted escapes and single-quote doubling', () => {
  assert.deepEqual(parseYAML('a: "q\\"x"\nb: "tab\\there"\nc: "back\\\\slash"\nd: \'it\'\'s\''),
    { a: 'q"x', b: 'tab\there', c: 'back\\slash', d: "it's" });
});
test('YAML scalars: top-level scalar documents are rejected (maps/sequences/flow only)', () => {
  for (const s of ['42', 'hello']) {
    assert.throws(() => parseYAML(s), /Expected "key: value" \(line 1\)/);
    assert.throws(() => formatYAML(s), /Expected "key: value"/);
    assert.throws(() => minifyYAML(s), /Expected "key: value"/);
  }
});

test('YAML maps/sequences: sequence at the key column is valid; CRLF input accepted', () => {
  assert.deepEqual(parseYAML('k:\n- a\n- b\nz: 1'), { k: ['a', 'b'], z: 1 });
  assert.deepEqual(parseYAML('a: 1\r\nb: 2\r\n'), { a: 1, b: 2 });
});
test('YAML maps: numeric-looking keys become string keys', () => {
  assert.deepEqual(parseYAML('0x1F: a\n1e3: b'), { 31: 'a', 1000: 'b' });
});
test('YAML flow: nested flow collections and quoted flow scalars', () => {
  assert.deepEqual(parseYAML('a: {x: [1, {y: "z, w"}], q: \'s\'}'), { a: { x: [1, { y: 'z, w' }], q: 's' } });
  assert.deepEqual(parseYAML('[1, [2], {a: b}]'), [1, [2], { a: 'b' }]);
});
test('YAML deep nesting round-trips', () => {
  let doc = 'leaf: 1\n';
  for (let i = 0; i < 12; i++) doc = `k${i}:\n` + doc.replace(/^(?=.)/gm, '  ');
  const v = parseYAML(doc);
  assert.deepEqual(parseYAML(formatYAML(doc)), v);
  assert.deepEqual(parseYAML(minifyYAML(doc)), v);
  assert.equal(formatYAML(formatYAML(doc)), formatYAML(doc));
});

// ---- idempotency + semantic round-trip over a battery of docs
const YAML_BATTERY = {
  'full doc': YAML_DOC,
  'scalar map': 'a: 1\nb: two\nc: true\nd: null',
  'sequence': '- 1\n- two\n- [3, 4]\n- {k: v}',
  'seq of maps': 'items:\n  - id: 1\n    name: x\n  - id: 2\n    name: y\n',
  'nested maps': 'a:\n  b:\n    c:\n      d: 1\n',
  'empties': 'a: []\nb: {}\nc:\n',
  'unicode': 'greeting: 你好\nemoji: 😀\nacc: héllo\n',
  'quoted-lookalikes': 'a: "123"\nb: "true"\nc: "x: y"\nd: "- dash"\n',
  'minified flow in': '{a: 1, b: [x, y], c: {d: "e f"}}',
  'crlf': 'a: 1\r\nb:\r\n  - x\r\n  - y\r\n',
};
for (const [name, doc] of Object.entries(YAML_BATTERY)) {
  test(`YAML idempotent + semantic round-trip: ${name}`, () => {
    const v = parseYAML(doc);
    const pretty = formatYAML(doc);
    assert.deepEqual(parseYAML(pretty), v);                      // format preserves meaning
    assert.deepEqual(parseYAML(minifyYAML(doc)), v);             // minify preserves meaning
    assert.deepEqual(parseYAML(pretty), parseYAML(minifyYAML(doc))); // pretty == minify semantically
    assert.equal(formatYAML(pretty), pretty);                    // format idempotent (string)
    assert.equal(minifyYAML(minifyYAML(doc)), minifyYAML(doc));  // minify idempotent (string)
    assert.equal(minifyYAML(pretty), minifyYAML(doc));           // minify(format(x)) == minify(x)
    assert.equal(formatYAML(minifyYAML(doc)), pretty);           // format(minify(x)) == format(x)
  });
}

// ---- comment policy
test('YAML comments: full-line and trailing comments are DROPPED (not preserved) by format/minify', () => {
  const src = '# header\na: 1 # trail\n# mid\nb: 2\n';
  assert.deepEqual(parseYAML(src), { a: 1, b: 2 });
  assert.equal(formatYAML(src), 'a: 1\nb: 2\n');
  assert.equal(minifyYAML(src), '{a: 1, b: 2}');
});
test("YAML comments: '#' only starts a comment at line start / after whitespace; never inside quotes", () => {
  assert.deepEqual(parseYAML('a: http://x.com/#frag'), { a: 'http://x.com/#frag' });
  assert.deepEqual(parseYAML('a: b # c'), { a: 'b' });
  assert.deepEqual(parseYAML('a: "b # c"'), { a: 'b # c' });
  assert.deepEqual(parseYAML("a: 'b # c'"), { a: 'b # c' });
});

// ---- empty-ish input
test('YAML empty: empty / whitespace / comment-only / lone "---" -> null value and empty output', () => {
  for (const s of ['', '   \n\n', '# only a comment', '---\n', '---\n# c\n']) {
    assert.equal(parseYAML(s), null, JSON.stringify(s));
    assert.equal(formatYAML(s), '', JSON.stringify(s));
    assert.equal(minifyYAML(s), '', JSON.stringify(s));
  }
});
test('YAML: single leading "---" and trailing "..." markers are accepted', () => {
  assert.deepEqual(parseYAML('---\na: 1\n...'), { a: 1 });
});

// ---- malformed / unsupported policy
test('YAML unsupported features THROW with a descriptive message and (line N)', () => {
  const cases = [
    ['a: &x 1', 'Unsupported YAML feature: anchors (line 1)'],
    ['&x\na: 1', 'Unsupported YAML feature: anchors (line 1)'],
    ['a: *x', 'Unsupported YAML feature: aliases (line 1)'],
    ['a: !!str 1', 'Unsupported YAML feature: tags (line 1)'],
    ['? a', 'Unsupported YAML feature: complex keys (line 1)'],
    ['a: |\n  x', 'Unsupported YAML feature: block scalars (line 1)'],
    ['a: >\n  x', 'Unsupported YAML feature: block scalars (line 1)'],
    ['\ta: 1', 'Unsupported YAML feature: tab indentation (line 1)'],
    ['a: 1\n---\nb: 2', 'Unsupported YAML feature: multiple documents (line 2)'],
  ];
  for (const [src, msg] of cases) {
    assert.throws(() => parseYAML(src), (e) => e instanceof Error && e.message === msg, src);
    assert.throws(() => formatYAML(src), (e) => e.message === msg, src);
    assert.throws(() => minifyYAML(src), (e) => e.message === msg, src);
  }
});
test('YAML malformed input THROWS (strict): bad structure / unterminated / bad flow', () => {
  const cases = [
    ['just text\nmore', 'Expected "key: value" (line 1)'],
    ['a: 1\nb', 'Expected "key: value" (line 2)'],
    ['a: 1\n- b', 'Expected "key: value" (line 2)'],
    ['- a\nb: 1', 'Bad sequence item (line 2)'],
    ['a: "unterminated', 'Unterminated double-quoted string (line 1)'],
    ["a: 'unterminated", 'Unterminated single-quoted string (line 1)'],
    ['a: [1,2', 'Malformed flow sequence (line 1)'],
    ['a: {x 1}', 'Expected ":" in flow mapping (line 1)'],
  ];
  for (const [src, msg] of cases) {
    assert.throws(() => parseYAML(src), (e) => e instanceof Error && e.message === msg, src);
    assert.throws(() => formatYAML(src), (e) => e.message === msg, src);
  }
});
test('YAML: over-indented lines after an inline value now throw (was silently DROPPED) [#1014-G]', () => {
  // Fixed under #1014-G: a deeper-indented line following an inline value is malformed YAML and
  // must error (consistent with the parser's under-indent throw), not silently discard content.
  assert.throws(() => parseYAML('a: 1\n b: 2'),
    (e) => e instanceof Error && e.message === 'Bad indentation (line 2)');
  assert.throws(() => parseYAML('a: 1\nb: 2\n  c: 3'),
    (e) => e instanceof Error && e.message === 'Bad indentation (line 3)');
});

// ---- FIXED under #1014-B: strings containing a newline are now quoted.
// yamlScalarNeedsQuote now treats a \n/\r/\t anywhere as requiring quotes, so formatYAML emits a
// valid double-quoted scalar and minifyYAML preserves the value across a round-trip.
test('YAML round-trip: string value containing a newline survives format [#1014-B]', () => {
  const src = 'r: "line\\nbreak"\nz: 1';
  assert.deepEqual(parseYAML(formatYAML(src)), { r: 'line\nbreak', z: 1 });
});
test('YAML round-trip: string value containing a newline survives minify [#1014-B]', () => {
  const src = 'r: "line\\nbreak"\nz: 1';
  assert.deepEqual(parseYAML(minifyYAML(src)), { r: 'line\nbreak', z: 1 });
});
