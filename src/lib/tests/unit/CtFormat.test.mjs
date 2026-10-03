// Unit tests for CtFormat.mjs -- structured-data format conversion engine
// (JSON / CSV / TSV / YAML / .properties / XML). Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: TABLE-DRIVEN over a format registry. Exact text fixtures are pinned to the lib's ACTUAL
// output; round-trips use semantic equality (parse(emit(x)) deepEqual x). Where a format is lossy by
// design (CSV/TSV/properties/XML stringify scalars; XML trims text; properties flatten), the test pins
// the ACTUAL lossy result rather than pretending the round-trip is lossless.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATS,
  parseJSON, emitJSON,
  parseYAML, emitYAML,
  parseCSV, emitCSV,
  parseTSV, emitTSV,
  parseProperties, emitProperties,
  parseXML, emitXML,
  detectFormat,
  convert,
} from '../../utils/formats/CtFormat.mjs';

const IDS = ['json', 'csv', 'tsv', 'yaml', 'properties', 'xml'];

// ---- the format registry the table-driven tests walk ----
// sampleText -> parse -> sampleModel ; sampleModel -> emit -> exactText ; roundTrip = lossless battery.
const REG = [
  {
    id: 'json', parse: parseJSON, emit: emitJSON,
    sampleText: '{"a":1,"b":[true,null,"x"],"c":{}}',
    sampleModel: { a: 1, b: [true, null, 'x'], c: {} },
    exactText: '{\n  "a": 1,\n  "b": [\n    true,\n    null,\n    "x"\n  ],\n  "c": {}\n}',
    roundTrip: [
      {}, [], 0, 'str', null, true, { a: 1 }, [1, 'a', null, false],
      { n: { n: { n: [1, { z: 'deep' }] } } }, { 'üñí ☃': 'välue \u{1F600}' }, { s: 'a"b\\c\nd\te' },
      { num: 1.5, neg: -3, big: 1e21, str_num: '42', t: 'true', nul: 'null' },
    ],
  },
  {
    id: 'yaml', parse: parseYAML, emit: emitYAML,
    sampleText: 'a: 1\nb:\n  - true\n  - null\n  - x\nc: {}\n',
    sampleModel: { a: 1, b: [true, null, 'x'], c: {} },
    exactText: 'a: 1\nb:\n  - true\n  - null\n  - x\nc: {}',
    roundTrip: [
      { a: 1 }, { a: 1, b: [1, { x: 2, y: [3] }], c: { d: null, e: 't:x' }, f: '', g: '123', h: [], i: {} },
      [1, 2, 3], [[1, 2], [3]], [{ a: 1, b: 2 }, { a: 3 }], [], {}, 'plain', 42, true, null,
      { s: 'true', n: 'null', i: '42', f: '1.5', e: '1e3', t: '~' },
      { lead: ' x', trail: 'x ', nl: 'a\nb', tab: 'a\tb', colon: 'a: b', hash: 'a #b', q: 'it\'s "q"' },
      { dash: '- x', minus: '-', star: '*a', bang: '!t', amp: '&a', pct: '%x', at: '@x', pipe: '|', gt: '>' },
      { 'üñí ☃': 'välue \u{1F600}', 'key with space': 1, 'k:colon': 2, '': 3 },
      { num: 1.5, neg: -3, exp: 1e-7 },
    ],
  },
  {
    id: 'csv', parse: parseCSV, emit: emitCSV,
    sampleText: 'name,age\nAda,36\nBob,41\n',
    sampleModel: [{ name: 'Ada', age: '36' }, { name: 'Bob', age: '41' }],
    exactText: 'name,age\nAda,36\nBob,41',
    // CSV is string-only: round-trip is lossless for string-valued uniform records.
    roundTrip: [
      [{ a: 'x', b: 'y' }],
      [{ a: 'x,1', b: 'q"q' }, { a: 'l1\nl2', b: '' }],
      [{ 'üñí': '☃', 'k 2': '\u{1F600}' }],
      [{ a: ' lead', b: 'trail ' }],
      [{ a: '1', b: '2' }, { a: '3', b: '4' }, { a: '5', b: '6' }],
    ],
  },
  {
    id: 'tsv', parse: parseTSV, emit: emitTSV,
    sampleText: 'name\tage\nAda\t36\nBob\t41\n',
    sampleModel: [{ name: 'Ada', age: '36' }, { name: 'Bob', age: '41' }],
    exactText: 'name\tage\nAda\t36\nBob\t41',
    roundTrip: [
      [{ a: 'x', b: 'y' }],
      [{ a: 'x,1', b: 'q"q' }, { a: 'l1\nl2', b: '' }],
      [{ a: 'has\ttab', b: 'ok' }],
      [{ 'üñí': '☃', 'k 2': '\u{1F600}' }],
    ],
  },
  {
    id: 'properties', parse: parseProperties, emit: emitProperties,
    sampleText: '# comment\n! also comment\na.b=1\na.c.0=x\na.c.1=y\nname = Ada\n',
    // properties values are always strings; integer-keyed siblings become arrays.
    sampleModel: { a: { b: '1', c: ['x', 'y'] }, name: 'Ada' },
    exactText: 'a.b=1\na.c.0=x\na.c.1=y\nname=Ada',
    // lossless for string-valued models (keys without dots).
    roundTrip: [
      { a: 'x' }, { a: { b: 'x', c: ['p', 'q'] }, z: 'y' },
      { k: 'with space', e: 'a=b', c: 'a:b' },
      { multi: 'l1\nl2', tab: 'a\tb', bs: 'back\\slash' },
      { 'üñí': '☃ \u{1F600}' },
      { 'key with space': 'v', 'k=eq': 'v', 'k:col': 'v' },
      { lead: ' x' },
    ],
  },
  {
    id: 'xml', parse: parseXML, emit: emitXML,
    sampleText: '<?xml version="1.0"?>\n<root id="7"><a>1</a><b>x</b><b>y</b><c/></root>',
    // attributes -> "@name", repeated tags -> array, pure text -> string, empty -> ''.
    sampleModel: { root: { '@id': '7', a: '1', b: ['x', 'y'], c: '' } },
    exactText: '<?xml version="1.0" encoding="UTF-8"?>\n<root id="7">\n  <a>1</a>\n  <b>x</b>\n  <b>y</b>\n  <c/>\n</root>',
    // XML is string-only and single-rooted: lossless for string-valued single-root models.
    roundTrip: [
      { r: 'text' }, { r: { a: 'x', b: ['1', '2'] } },
      { r: { '@id': 'x', '#text': 'hi' } },
      { r: { a: 'a<b&c>d', b: '"quoted"' } },
      { r: { '@a': 'q"&<', c: 'v' } },
      { r: { e: '' } },
      { r: { 'üñí': '☃ \u{1F600}' } },
      { r: { a: { b: { c: 'deep' } } } },
    ],
  },
];

// =========================================================== FORMATS registry
test('FORMATS: six entries, each with non-empty string id + label', () => {
  assert.equal(FORMATS.length, 6);
  for (const f of FORMATS) {
    assert.equal(typeof f.id, 'string'); assert.ok(f.id.length > 0);
    assert.equal(typeof f.label, 'string'); assert.ok(f.label.length > 0);
  }
});
test('FORMATS: exact ids/labels in order; ids unique', () => {
  assert.deepEqual(FORMATS, [
    { id: 'json', label: 'JSON' }, { id: 'csv', label: 'CSV' }, { id: 'tsv', label: 'TSV' },
    { id: 'yaml', label: 'YAML' }, { id: 'properties', label: '.properties' }, { id: 'xml', label: 'XML' },
  ]);
  assert.equal(new Set(FORMATS.map((f) => f.id)).size, 6);
});
test('FORMATS ids line up with the test registry (parse/emit pairs)', () => {
  assert.deepEqual(FORMATS.map((f) => f.id).sort(), IDS.slice().sort());
  assert.deepEqual(REG.map((r) => r.id).sort(), IDS.slice().sort());
});
test('FORMATS: every id is accepted by convert() as both source and target', () => {
  const doc = { json: '[{"a":"1"}]', csv: 'a\n1', tsv: 'a\n1', yaml: '- a: 1', properties: 'a=1', xml: '<r>1</r>' };
  for (const f of FORMATS) {
    assert.doesNotThrow(() => convert(doc[f.id], f.id, 'json'), `source ${f.id}`);
    assert.doesNotThrow(() => convert('[{"a":"1"}]', 'json', f.id), `target ${f.id}`);
  }
});

// =========================================================== per-format parse / emit / round-trip
for (const f of REG) {
  test(`${f.id}: parse(sampleText) -> expected canonical model`, () => {
    assert.deepEqual(f.parse(f.sampleText), f.sampleModel);
  });
  test(`${f.id}: emit(sampleModel) -> exact text fixture`, () => {
    assert.equal(f.emit(f.sampleModel), f.exactText);
  });
  test(`${f.id}: emit is deterministic and parse(exactText) -> sampleModel`, () => {
    assert.equal(f.emit(f.sampleModel), f.emit(f.sampleModel));
    assert.deepEqual(f.parse(f.exactText), f.sampleModel);
  });
  f.roundTrip.forEach((model, i) => {
    test(`${f.id}: round-trip #${i} parse(emit(x)) == x  [${JSON.stringify(model).slice(0, 50)}]`, () => {
      assert.deepEqual(f.parse(f.emit(model)), model);
    });
  });
  test(`${f.id}: emit is idempotent through parse (emit(parse(emit(x))) == emit(x))`, () => {
    for (const model of f.roundTrip) {
      const once = f.emit(model);
      assert.equal(f.emit(f.parse(once)), once);
    }
  });
}

// =========================================================== JSON specifics
test('JSON: indent option (4, 0 = minified, out-of-range/NaN -> default 2)', () => {
  assert.equal(emitJSON({ a: 1 }, { indent: 4 }), '{\n    "a": 1\n}');
  assert.equal(emitJSON({ a: 1 }, { indent: 0 }), '{"a":1}');
  assert.equal(emitJSON({ a: 1 }, { indent: 99 }), '{\n  "a": 1\n}');
  assert.equal(emitJSON({ a: 1 }, { indent: -1 }), '{\n  "a": 1\n}');
  assert.equal(emitJSON({ a: 1 }, { indent: 'x' }), '{\n  "a": 1\n}');
  assert.equal(emitJSON({ a: 1 }), '{\n  "a": 1\n}');
});
test('JSON: scalars and empties emit as-is', () => {
  assert.equal(emitJSON(null), 'null');
  assert.equal(emitJSON([]), '[]');
  assert.equal(emitJSON({}), '{}');
  assert.equal(emitJSON('s'), '"s"');
  assert.equal(emitJSON(undefined), undefined); // JSON.stringify(undefined) -> undefined (pinned)
});
test('JSON: type fidelity (number vs numeric string, boolean, null, nested, unicode)', () => {
  const m = parseJSON('{"n":1,"s":"1","t":true,"ts":"true","z":null,"zs":"null","arr":[],"obj":{},"é":"☃"}');
  assert.strictEqual(m.n, 1); assert.strictEqual(m.s, '1');
  assert.strictEqual(m.t, true); assert.strictEqual(m.ts, 'true');
  assert.strictEqual(m.z, null); assert.strictEqual(m.zs, 'null');
  assert.deepEqual(m.arr, []); assert.deepEqual(m.obj, {});
  assert.equal(m['é'], '☃');
});
test('JSON: malformed -> throws Error with "Invalid JSON:" prefix', () => {
  for (const bad of ['{x', '', '{"a":1,}', "{'a':1}", '[1,2', 'undefined']) {
    assert.throws(() => parseJSON(bad), (e) => e instanceof Error && /^Invalid JSON: /.test(e.message), bad);
  }
});
test('JSON: unserialisable model (circular) -> throws "Could not emit JSON:"', () => {
  const a = {}; a.a = a;
  assert.throws(() => emitJSON(a), /^Error: Could not emit JSON: /);
});

// =========================================================== YAML specifics
test('YAML: exact emit of a mixed nested model', () => {
  assert.equal(
    emitYAML({ a: 1, b: [1, { x: 2, y: [3] }], c: { d: null, e: 't:x' }, f: '', g: '123', h: [], i: {} }),
    'a: 1\nb:\n  - 1\n  -\n    x: 2\n    y:\n      - 3\nc:\n  d: null\n  e: "t:x"\nf: ""\ng: "123"\nh: []\ni: {}');
});
test('YAML: exact emit of nested/obj sequences and top-level scalar', () => {
  assert.equal(emitYAML([[1, 2], [3]]), '-\n  - 1\n  - 2\n-\n  - 3');
  assert.equal(emitYAML([{ a: 1, b: 2 }, { a: 3 }]), '-\n  a: 1\n  b: 2\n-\n  a: 3');
  assert.equal(emitYAML('hi'), 'hi');
  assert.equal(emitYAML(5), '5');
  assert.equal(emitYAML(null), 'null');
  assert.equal(emitYAML([]), '[]');
  assert.equal(emitYAML({}), '{}');
});
test('YAML: strings that would re-infer as non-strings get quoted; real scalars do not', () => {
  assert.equal(emitYAML({ a: 'true', b: true, c: '1', d: 1, e: 'null', f: null, g: '', h: 'x' }),
    'a: "true"\nb: true\nc: "1"\nd: 1\ne: "null"\nf: null\ng: ""\nh: x');
});
test('YAML: indent option (4); 0/garbage fall back to 2', () => {
  assert.equal(emitYAML({ a: { b: 1 } }, { indent: 4 }), 'a:\n    b: 1');
  assert.equal(emitYAML({ a: { b: 1 } }, { indent: 0 }), 'a:\n  b: 1');
  assert.equal(emitYAML({ a: { b: 1 } }, { indent: 'zz' }), 'a:\n  b: 1');
});
test('YAML: non-finite numbers emit as quoted strings', () => {
  assert.equal(emitYAML({ a: Infinity, b: NaN }), 'a: "Infinity"\nb: "NaN"');
});
test('YAML: scalar type inference on parse', () => {
  const m = parseYAML('a: 1\nb: -2\nc: 1.5\nd: 1e3\ne: 007\nf: ~\ng: null\nh: Null\ni: True\nj: FALSE\nk: text\nl: 12abc\nm: 0x1F');
  assert.deepEqual(m, { a: 1, b: -2, c: 1.5, d: 1000, e: 7, f: null, g: null, h: null, i: true, j: false, k: 'text', l: '12abc', m: '0x1F' });
});
test('YAML: quoted scalars stay strings; escapes and quote doubling honoured', () => {
  assert.deepEqual(parseYAML('a: "1"\nb: \'true\'\nc: "x\\ny\\tz\\u00e9"\nd: \'it\'\'s\'\ne: ""'),
    { a: '1', b: 'true', c: 'x\ny\tz\u00e9', d: "it's", e: '' });
});
test('YAML: empty value -> null; "key:" with nested block -> object', () => {
  assert.deepEqual(parseYAML('a:\nb: 1'), { a: null, b: 1 });
  assert.deepEqual(parseYAML('a:\n  b: 1\n  c:\n    - 1'), { a: { b: 1, c: [1] } });
});
test('YAML: sequence at same indent as parent key', () => {
  assert.deepEqual(parseYAML('a:\n- 1\n- 2\nb: 3'), { a: [1, 2], b: 3 });
});
test('YAML: inline map as sequence item', () => {
  assert.deepEqual(parseYAML('- a: 1\n  b: 2\n- a: 3'), [{ a: 1, b: 2 }, { a: 3 }]);
});
test('YAML: flow collections', () => {
  assert.deepEqual(parseYAML('[1, 2, "x", true, null]'), [1, 2, 'x', true, null]);
  assert.deepEqual(parseYAML('a: {b: 1, c: [1, 2], d: "s"}'), { a: { b: 1, c: [1, 2], d: 's' } });
  assert.deepEqual(parseYAML('a: []\nb: {}'), { a: [], b: {} });
  assert.deepEqual(parseYAML('[1, 2,]'), [1, 2]);
});
test('YAML: block scalars | > with chomping', () => {
  assert.deepEqual(parseYAML('a: |\n  x\n  y\nb: >-\n  p\n  q\nc: |-\n  z'), { a: 'x\ny\n', b: 'p q', c: 'z' });
});
test('YAML: comments (full-line, trailing) stripped; # inside quotes kept; --- header ok', () => {
  assert.deepEqual(parseYAML('---\n# c\na: 1 # trailing\nb: "x # y"\nc: \'p # q\'\n'), { a: 1, b: 'x # y', c: 'p # q' });
  assert.deepEqual(parseYAML('a: x#notcomment'), { a: 'x#notcomment' });
});
test('YAML: CRLF and BOM tolerated', () => {
  assert.deepEqual(parseYAML('\ufeffa: 1\r\nb: 2\r\n'), { a: 1, b: 2 });
});
test('YAML: empty / comment-only input -> null; top-level scalar', () => {
  assert.equal(parseYAML(''), null);
  assert.equal(parseYAML('# only a comment\n'), null);
  assert.equal(parseYAML('42'), 42);
  assert.equal(parseYAML('hello'), 'hello');
});
test('YAML: unicode keys + values', () => {
  assert.deepEqual(parseYAML('"üñí": "☃"\nnaïve: café'), { 'üñí': '☃', 'naïve': 'café' });
});
test('YAML: malformed/unsupported -> throws Error "YAML: ..." (pinned per construct)', () => {
  const cases = [
    ['---\na: 1\n---\nb: 2', /multiple documents/],
    ['\ta: 1', /tabs are not allowed/],
    ['a: &x 1', /anchors/],
    ['a: *x', /aliases/],
    ['a: !t 1', /tags/],
    ['a: "x', /unterminated double-quoted/],
    ["a: 'x", /unterminated single-quoted/],
    ['a: [1,', /unterminated flow sequence/],
    ['a: {b', /missing ":"|unterminated flow mapping/],
    ['<<: x', /merge keys/],
    ['? k', /complex mapping keys/],
    ['*alias', /aliases/],
  ];
  for (const [src, re] of cases) {
    assert.throws(() => parseYAML(src), (e) => e instanceof Error && /^YAML: /.test(e.message) && re.test(e.message), src);
  }
  assert.throws(() => parseYAML(42), /YAML input must be text/);
  assert.throws(() => parseYAML(null), /YAML input must be text/);
});

// =========================================================== CSV / TSV specifics
test('CSV: header row -> array of objects; values are strings', () => {
  assert.deepEqual(parseCSV('a,b\n1,2'), [{ a: '1', b: '2' }]);
  assert.strictEqual(parseCSV('a\n1')[0].a, '1');
});
test('CSV: quoting - embedded comma, doubled quote, newline, CRLF row ends', () => {
  assert.deepEqual(parseCSV('a,b\n"x,1","q""q"\n"l1\nl2",z\n'),
    [{ a: 'x,1', b: 'q"q' }, { a: 'l1\nl2', b: 'z' }]);
  assert.deepEqual(parseCSV('a,b\r\n1,2\r\n3,4\r\n'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual(parseCSV('a,b\r1,2'), [{ a: '1', b: '2' }]); // bare CR is a row end
});
test('CSV: quoted field with embedded CRLF normalised to LF', () => {
  assert.deepEqual(parseCSV('a\n"x\r\ny"'), [{ a: 'x\ny' }]);
});
test('CSV: ragged rows - short row padded with "", extra cells dropped', () => {
  assert.deepEqual(parseCSV('a,b\n1\n2,3,4'), [{ a: '1', b: '' }, { a: '2', b: '3' }]);
});
test('CSV: header:false -> array of arrays (ragged kept as-is)', () => {
  assert.deepEqual(parseCSV('a,b\n1,2', { header: false }), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCSV('a,b\n1', { header: false }), [['a', 'b'], ['1']]);
});
test('CSV: empty input and header-only input -> []', () => {
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('a,b'), []);
  assert.deepEqual(parseCSV('a,b\n'), []);
});
test('CSV: empty cells and trailing delimiter', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,,3\n,,'), [{ a: '1', b: '', c: '3' }, { a: '', b: '', c: '' }]);
});
test('CSV: custom delimiter option (;) on parse and emit', () => {
  assert.deepEqual(parseCSV('a;b\n1;2', { delimiter: ';' }), [{ a: '1', b: '2' }]);
  assert.equal(emitCSV([{ a: '1;x', b: 'y,z' }], { delimiter: ';' }), 'a;b\n"1;x";y,z');
  assert.deepEqual(parseCSV('a,b\n1,2', { delimiter: '' }), [{ a: '1', b: '2' }]); // empty -> default ','
});
test('CSV: quote char mid-field (unquoted start) toggles quoting (pinned lenient behaviour)', () => {
  assert.deepEqual(parseCSV('a\nab"c,d"e'), [{ a: 'abc,de' }]);
});
test('CSV emit: union of keys in first-seen order; missing/null -> empty cell', () => {
  assert.equal(emitCSV([{ a: 1, b: 'x,y' }, { a: 'q"', c: null }]), 'a,b,c\n1,"x,y",\n"q""",,');
});
test('CSV emit: header:false omits header row (objects, primitives)', () => {
  assert.equal(emitCSV([{ a: 1, b: 2 }], { header: false }), '1,2');
  assert.equal(emitCSV([1, 2], { header: false }), '1\n2');
});
test('CSV emit: array of arrays emitted as-is; array of primitives -> "value" column', () => {
  assert.equal(emitCSV([[1, 'a'], [2, 'b,c']]), '1,a\n2,"b,c"');
  // a lone empty cell (single "value" column) is emitted quoted so it round-trips (#1014-J)
  assert.equal(emitCSV([1, 'two', null, true]), 'value\n1\ntwo\n""\ntrue');
});
test('CSV emit: single object treated as one record; empty array -> ""', () => {
  assert.equal(emitCSV({ a: 1, b: 'x' }), 'a,b\n1,x');
  assert.equal(emitCSV([]), '');
});
test('CSV emit: nested object/array cells are JSON-stringified and quoted as needed', () => {
  assert.equal(emitCSV({ a: { n: 1 }, b: [1] }), 'a,b\n"{""n"":1}",[1]');
  assert.equal(emitCSV({ a: [1, 2] }), 'a\n"[1,2]"');
});
test('CSV emit: scalar types are stringified (number/boolean) - lossy vs source', () => {
  const out = emitCSV([{ n: 1, b: true, s: '1' }]);
  assert.equal(out, 'n,b,s\n1,true,1');
  assert.deepEqual(parseCSV(out), [{ n: '1', b: 'true', s: '1' }]);
});
test('CSV emit: newline and quote cells quoted; header cells quoted when needed', () => {
  assert.equal(emitCSV([{ 'a,b': 'x\ny' }]), '"a,b"\n"x\ny"');
});
test('CSV emit: non-tabular model -> throws (scalar; mixed)', () => {
  assert.throws(() => emitCSV('x'), /needs a tabular model/);
  assert.throws(() => emitCSV(5), /needs a tabular model/);
  assert.throws(() => emitCSV(null), /needs a tabular model/);
  assert.throws(() => emitCSV([{ a: 1 }, 2]), /needs uniform records/);
  assert.throws(() => emitCSV([{ a: 1 }, [2]]), /needs uniform records/);
});
test('CSV: unterminated quoted field -> throws', () => {
  assert.throws(() => parseCSV('a\n"x'), /Unterminated quoted field/);
  assert.throws(() => parseTSV('a\n"x'), /Unterminated quoted field/);
});
test('CSV: unicode in headers and values', () => {
  assert.deepEqual(parseCSV('üñí,k\n☃,\u{1F600}'), [{ 'üñí': '☃', k: '\u{1F600}' }]);
});
test('TSV: tab delimiter - commas are plain data, tabs split', () => {
  assert.deepEqual(parseTSV('a\tb\n1,5\t2'), [{ a: '1,5', b: '2' }]);
  assert.equal(emitTSV([{ a: '1,5', b: '2' }]), 'a\tb\n1,5\t2');
});
test('TSV: embedded tab quoted on emit and recovered on parse', () => {
  assert.equal(emitTSV([{ a: 'x\ty', b: 1 }]), 'a\tb\n"x\ty"\t1');
  assert.deepEqual(parseTSV('a\tb\n"x\ty"\t1'), [{ a: 'x\ty', b: '1' }]);
});
test('TSV: quoted newline/quote, header:false, ragged', () => {
  assert.deepEqual(parseTSV('a\tb\n"l1\nl2"\t"q""q"'), [{ a: 'l1\nl2', b: 'q"q' }]);
  assert.deepEqual(parseTSV('a\tb\n1\t2', { header: false }), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseTSV('a\tb\n1'), [{ a: '1', b: '' }]);
  assert.equal(emitTSV([[1, 2]]), '1\t2');
  assert.equal(emitTSV([{ a: 1 }], { header: false }), '1');
});
test('TSV: parseTSV ignores a user-supplied delimiter (always tab)', () => {
  assert.deepEqual(parseTSV('a,b\n1,2', { delimiter: ',' }), [{ 'a,b': '1,2' }]);
});

// =========================================================== .properties specifics
test('properties: comments (# and !), blank lines, separators = : and whitespace', () => {
  assert.deepEqual(parseProperties('# c\n! c2\n\na=1\nb:2\nc 3\nd = 4\ne : 5\n  f=6'),
    { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' });
});
test('properties: dotted keys -> nested objects; integer keys 0..n-1 -> arrays', () => {
  assert.deepEqual(parseProperties('a.b.c=1\na.b.d=2\nx.0=p\nx.1=q'), { a: { b: { c: '1', d: '2' } }, x: ['p', 'q'] });
});
test('properties: non-contiguous integer keys stay an object', () => {
  assert.deepEqual(parseProperties('x.0=a\nx.2=b'), { x: { 0: 'a', 2: 'b' } });
  assert.deepEqual(parseProperties('x.1=a\nx.2=b'), { x: { 1: 'a', 2: 'b' } });
});
test('properties: line continuation (odd backslash) joins, leading ws of next line stripped', () => {
  assert.deepEqual(parseProperties('long=a\\\n   b\\\n  c'), { long: 'abc' });
  assert.deepEqual(parseProperties('v=x\\\\\nnext=y'), { v: 'x\\', next: 'y' }); // even backslashes: no continuation
});
test('properties: escapes \\n \\t \\r \\f \\uXXXX and escaped key separators', () => {
  assert.deepEqual(parseProperties('u=\\u00e9\\n\\t\\\\\nk\\=eq=v\nk\\:c=w\nk\\ s=z'),
    { u: 'é\n\t\\', 'k=eq': 'v', 'k:c': 'w', 'k s': 'z' });
  assert.deepEqual(parseProperties('bad=\\uZZZZ'), { bad: 'uZZZZ' });
});
test('properties: value-less key -> ""; CRLF tolerated; empty input -> {}', () => {
  assert.deepEqual(parseProperties('a=\nb\n'), { a: '', b: '' });
  assert.deepEqual(parseProperties('a=1\r\nb=2\r\n'), { a: '1', b: '2' });
  assert.deepEqual(parseProperties(''), {});
  assert.deepEqual(parseProperties('# only comment'), {});
});
test('properties: value keeps embedded = and :', () => {
  assert.deepEqual(parseProperties('url=http://x/y?a=b'), { url: 'http://x/y?a=b' });
});
test('properties emit: keys sorted lexicographically, flattened with dots / indices', () => {
  assert.equal(emitProperties({ z: 1, a: { c: [1, 2], b: 'x' } }), 'a.b=x\na.c.0=1\na.c.1=2\nz=1');
});
test('properties emit: type fidelity is lossy - number/boolean/null stringified, empties -> ""', () => {
  const out = emitProperties({ n: 1, t: true, f: false, z: null, o: {}, a: [] });
  assert.equal(out, 'a=\nf=false\nn=1\no=\nt=true\nz=');
  assert.deepEqual(parseProperties(out), { a: '', f: 'false', n: '1', o: '', t: 'true', z: '' });
});
test('properties emit: value escaping (newline, tab, backslash, leading space) and key escaping', () => {
  assert.equal(emitProperties({ k: 'a\nb\tc\\d' }), 'k=a\\nb\\tc\\\\d');
  assert.equal(emitProperties({ k: ' lead' }), 'k=\\ lead');
  assert.equal(emitProperties({ 'a b': 1, 'c=d': 2, 'e:f': 3 }), 'a\\ b=1\nc\\=d=2\ne\\:f=3');
});
test('properties emit: escapeUnicode option escapes non-ASCII (default leaves it)', () => {
  assert.equal(emitProperties({ k: 'é☃' }), 'k=é☃');
  assert.equal(emitProperties({ k: 'é☃' }, { escapeUnicode: true }), 'k=\\u00e9\\u2603');
  assert.deepEqual(parseProperties('k=\\u00e9\\u2603'), { k: 'é☃' });
});
test('properties emit: top-level scalar -> "_" key; empty object -> ""', () => {
  assert.equal(emitProperties('x'), '_=x');
  assert.equal(emitProperties({}), '');
  assert.equal(emitProperties([]), '');
});
test('properties: dotted key in the model does not round-trip structurally (flatten is lossy)', () => {
  assert.deepEqual(parseProperties(emitProperties({ 'a.b': 'x' })), { a: { b: 'x' } });
});
test('properties: unicode keys + values (raw)', () => {
  assert.deepEqual(parseProperties('üñí=☃ \u{1F600}'), { 'üñí': '☃ \u{1F600}' });
});
test('properties: never throws on odd input (no malformed state) - garbage lines tolerated', () => {
  assert.doesNotThrow(() => parseProperties('=\n:\n\\\n==x\n===\n\\u12'));
});

// =========================================================== XML specifics
test('XML: attributes -> @name, repeated tags -> array, empty -> "", CDATA/comments/PI handled', () => {
  assert.deepEqual(
    parseXML('<?xml version="1.0"?><!-- c --><r a="1" b=\'2\'><i>1</i><i>2</i><s/><![CDATA[x<y]]><!--in--></r>'),
    { r: { '@a': '1', '@b': '2', i: ['1', '2'], s: '', '#text': 'x<y' } });
});
test('XML: single child stays scalar (not array); text values stay strings (no type inference)', () => {
  const m = parseXML('<r><a>1</a><b>true</b><c>null</c></r>');
  assert.deepEqual(m, { r: { a: '1', b: 'true', c: 'null' } });
});
test('XML: text-only root -> string; attrs+text -> {@..., #text}', () => {
  assert.deepEqual(parseXML('<r>hello</r>'), { r: 'hello' });
  assert.deepEqual(parseXML('<r id="1">hi</r>'), { r: { '@id': '1', '#text': 'hi' } });
});
test('XML: entities decoded (named, decimal, hex) in text and attributes', () => {
  assert.deepEqual(parseXML('<r a="&lt;&amp;&quot;">&lt;&gt;&amp;&apos;&#65;&#x42;</r>'),
    { r: { '@a': '<&"', '#text': "<>&'AB" } });
  assert.deepEqual(parseXML('<r>&unknown;</r>'), { r: '&unknown;' }); // unknown entity left literal
});
test('XML: text is trimmed; whitespace-only inter-element text dropped', () => {
  assert.deepEqual(parseXML('<r>\n  <a>  x  </a>\n</r>'), { r: { a: 'x' } });
});
test('XML: unicode in names and values; DOCTYPE and leading PI skipped', () => {
  assert.deepEqual(parseXML('<?xml version="1.0"?>\n<!DOCTYPE r>\n<r><üñí>☃ \u{1F600}</üñí></r>'), { r: { 'üñí': '☃ \u{1F600}' } });
});
test('XML emit: exact output with declaration, attrs, #text, arrays, null, empty', () => {
  assert.equal(
    emitXML({ root: { a: 1, b: [1, 2], c: { '@id': 'x', '#text': 'hi' }, d: null, e: '' } }),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <a>1</a>\n  <b>1</b>\n  <b>2</b>\n  <c id="x">hi</c>\n  <d/>\n  <e/>\n</root>');
});
test('XML emit: entity encoding in text and attributes', () => {
  assert.equal(emitXML({ r: { '@a': 'q"&<', t: 'a<b&c>d' } }, { declaration: false }),
    '<r a="q&quot;&amp;&lt;">\n  <t>a&lt;b&amp;c&gt;d</t>\n</r>');
});
test('XML emit: options declaration:false / indent / rootName / attributes strategy', () => {
  assert.equal(emitXML({ a: 1, b: 'x' }, { declaration: false }), '<root>\n  <a>1</a>\n  <b>x</b>\n</root>');
  assert.equal(emitXML({ a: 1, b: 'x' }, { declaration: false, rootName: 'r', attributes: true, indent: 4 }), '<r a="1" b="x"/>');
  assert.equal(emitXML({ r: { a: { b: 1 } } }, { declaration: false, indent: 4 }), '<r>\n    <a>\n        <b>1</b>\n    </a>\n</r>');
  assert.equal(emitXML({ a: 1 }, { declaration: false, rootName: '  wrap  ' }), '<wrap>\n  <a>1</a>\n</wrap>');
});
test('XML emit: single-key object becomes the root; multi-key object wrapped in <root>', () => {
  assert.equal(emitXML({ doc: 'x' }, { declaration: false }), '<doc>x</doc>');
  assert.equal(emitXML([1, 2], { declaration: false }), '<root>1</root>\n<root>2</root>'); // top-level array -> sibling roots (pinned)
  assert.equal(emitXML('t', { declaration: false }), '<root>t</root>');
  assert.equal(emitXML(5, { declaration: false }), '<root>5</root>');
});
test('XML emit: number/boolean stringified (lossy vs source types)', () => {
  const out = emitXML({ r: { n: 1, t: true, f: false } }, { declaration: false });
  assert.equal(out, '<r>\n  <n>1</n>\n  <t>true</t>\n  <f>false</f>\n</r>');
  assert.deepEqual(parseXML(out), { r: { n: '1', t: 'true', f: 'false' } });
});
test('XML emit: invalid root/element name -> throws', () => {
  assert.throws(() => emitXML({ '1a': 1 }), /not a valid element name/);
  assert.throws(() => emitXML({ a: 1 }, { rootName: 'bad name' }), /not a valid element name/);
});
test('XML: single-element array collapses to scalar on round-trip (lossy, pinned)', () => {
  assert.deepEqual(parseXML(emitXML({ r: { b: ['only'] } })), { r: { b: 'only' } });
});
test('XML: text whitespace is trimmed on round-trip (lossy, pinned)', () => {
  assert.deepEqual(parseXML(emitXML({ r: '  pad  ' })), { r: 'pad' });
});
test('XML: malformed -> throws Error "XML: ..." (pinned per construct)', () => {
  const cases = [
    ['', /no root element/],
    ['   ', /no root element/],
    ['text', /no root element/],
    ['<a>', /never closed/],
    ['<a></b>', /mismatched closing tag/],
    ['<a x=1/>', /must be quoted/],
    ['<a x/>', /missing a value/],
    ['<a b="1>', /unterminated attribute value/],
    ['<a/ >', /malformed self-closing/],
    ['<a><!-- x', /unterminated comment/],
    ['<a><![CDATA[x</a>', /unterminated CDATA/],
    ['<?xml version="1.0"', /unterminated processing instruction/],
    ['<!-- c', /unterminated comment/],
  ];
  for (const [src, re] of cases) {
    assert.throws(() => parseXML(src), (e) => e instanceof Error && /^XML: /.test(e.message) && re.test(e.message), JSON.stringify(src));
  }
});

// =========================================================== detectFormat
test('detectFormat: representative sample per format -> right id', () => {
  const samples = {
    json: ['{"a":1}', '[1,2]', '"s"', '  {"a": [1]}  '],
    yaml: ['a: 1', 'a: 1\nb: 2', '- x\n- y', '---\na: 1', 'k:\n  n: 1'],
    properties: ['a=1', 'a.b=1\nc.d=2', '# c\nk=v'],
    csv: ['a,b\n1,2', 'x,y,z\n1,2,3\n4,5,6'],
    tsv: ['a\tb\n1\t2'],
    xml: ['<a/>', '<?xml version="1.0"?><r/>', '<r><a>1</a></r>', '<!DOCTYPE r><r/>'],
  };
  for (const [id, list] of Object.entries(samples)) {
    for (const s of list) assert.equal(detectFormat(s), id, `${id}: ${JSON.stringify(s)}`);
  }
});
test('detectFormat: ambiguous / empty / non-string / unrecognised -> null', () => {
  for (const s of ['', '   \n  ', 'hello', 'just words here', '{bad', '# only comment', 5, null, undefined, {}]) {
    assert.equal(detectFormat(s), null, JSON.stringify(s));
  }
});
test('detectFormat: truncated JSON (bracket-leading) is NOT csv -> null; convert surfaces an error [#1014-M]', () => {
  assert.equal(detectFormat('[1,'), null);
  assert.equal(detectFormat('{"a":1,'), null);
  assert.equal(detectFormat('[1,2,]'), null);
  // and convert no longer returns a silent [] — it throws instead of auto-detecting csv
  assert.throws(() => convert('[1,', 'auto', 'json'), /auto-detect/);
});
test('detectFormat: precedence - invalid JSON braces do not become json; tab beats comma; mixed = vs :', () => {
  assert.equal(detectFormat('{a: 1}'), 'yaml');          // not valid JSON, has map signal
  assert.equal(detectFormat('a,b\tc'), 'tsv');           // tab in first line wins over comma
  assert.equal(detectFormat('a=1\nb: 2'), 'yaml');       // tie eqLines == mapLines -> not properties; map -> yaml
  assert.equal(detectFormat('a=1\nb=2\nc: 3'), 'properties'); // more '=' than ':' lines
  assert.equal(detectFormat('single,line'), 'csv');
});
test('detectFormat: every emitted output of the registry detects back to its own id where unambiguous', () => {
  assert.equal(detectFormat(emitJSON({ a: 1 })), 'json');
  assert.equal(detectFormat(emitYAML({ a: 1, b: [1] })), 'yaml');
  assert.equal(detectFormat(emitProperties({ a: '1', b: '2' })), 'properties');
  assert.equal(detectFormat(emitCSV([{ a: '1', b: '2' }])), 'csv');
  assert.equal(detectFormat(emitTSV([{ a: '1', b: '2' }])), 'tsv');
  assert.equal(detectFormat(emitXML({ r: { a: '1' } })), 'xml');
});

// =========================================================== convert
test('convert: returns { output, detected, model }', () => {
  const r = convert('{"a":[1,2]}', 'json', 'yaml');
  assert.deepEqual(r, { output: 'a:\n  - 1\n  - 2', detected: 'json', model: { a: [1, 2] } });
});
test('convert: auto detects source; detected reflects it', () => {
  const r = convert('a: 1', 'auto', 'json');
  assert.equal(r.detected, 'yaml');
  assert.equal(r.output, '{\n  "a": 1\n}');
  assert.equal(convert('<r><a>1</a></r>', 'auto', 'json').detected, 'xml');
  assert.equal(convert('a\tb\n1\t2', 'auto', 'json').detected, 'tsv');
});
test('convert: auto with undetectable input -> throws', () => {
  assert.throws(() => convert('hello', 'auto', 'json'), /Could not auto-detect/);
  assert.throws(() => convert('', 'auto', 'json'), /Could not auto-detect/);
});
test('convert: unknown source/target format -> throws naming the format', () => {
  assert.throws(() => convert('{}', 'nope', 'json'), /Unknown source format: nope/);
  assert.throws(() => convert('{}', 'json', 'nope'), /Unknown target format: nope/);
  assert.throws(() => convert('{}', 'JSON', 'yaml'), /Unknown source format: JSON/); // ids are case-sensitive
  assert.throws(() => convert('{}', 'json', 'auto'), /Unknown target format: auto/);
});
test('convert: source parse error propagates', () => {
  assert.throws(() => convert('{x', 'json', 'yaml'), /Invalid JSON/);
  assert.throws(() => convert('<a>', 'xml', 'json'), /XML:/);
  assert.throws(() => convert('a: &x 1', 'yaml', 'json'), /YAML:/);
});
test('convert: target emit error propagates (non-tabular -> CSV/TSV, bad XML name)', () => {
  assert.throws(() => convert('"x"', 'json', 'csv'), /needs a tabular model/);
  assert.throws(() => convert('5', 'json', 'tsv'), /needs a tabular model/);
  assert.throws(() => convert('[{"a":1},2]', 'json', 'csv'), /needs uniform records/);
  assert.throws(() => convert('{"1a":1}', 'json', 'xml'), /not a valid element name/);
});

// --- cross-conversion table: [from, to, input, expected output text] (exact, ACTUAL lib output)
const CROSS = [
  ['json', 'yaml', '{"a":1,"b":["x",true,null]}', 'a: 1\nb:\n  - x\n  - true\n  - null'],
  ['yaml', 'json', 'a: 1\nb:\n  - x\n  - true', '{\n  "a": 1,\n  "b": [\n    "x",\n    true\n  ]\n}'],
  ['csv', 'json', 'a,b\n1,2', '[\n  {\n    "a": "1",\n    "b": "2"\n  }\n]'],
  ['json', 'csv', '[{"a":1,"b":null}]', 'a,b\n1,'],
  ['tsv', 'json', 'a\tb\n1\t2', '[\n  {\n    "a": "1",\n    "b": "2"\n  }\n]'],
  ['json', 'tsv', '[{"a":"x","b":"y"}]', 'a\tb\nx\ty'],
  ['csv', 'tsv', 'a,b\n"x,1",2', 'a\tb\nx,1\t2'],
  ['tsv', 'csv', 'a\tb\nx,1\t2', 'a,b\n"x,1",2'],
  ['json', 'properties', '{"a":{"b":[1,2]}}', 'a.b.0=1\na.b.1=2'],
  ['properties', 'json', 'a.b=1\na.c.0=x', '{\n  "a": {\n    "b": "1",\n    "c": [\n      "x"\n    ]\n  }\n}'],
  ['json', 'xml', '{"r":{"a":1}}', '<?xml version="1.0" encoding="UTF-8"?>\n<r>\n  <a>1</a>\n</r>'],
  ['xml', 'json', '<r><a>1</a></r>', '{\n  "r": {\n    "a": "1"\n  }\n}'],
  ['yaml', 'xml', 'r:\n  a: 1\n  b:\n    - x\n    - y', '<?xml version="1.0" encoding="UTF-8"?>\n<r>\n  <a>1</a>\n  <b>x</b>\n  <b>y</b>\n</r>'],
  ['xml', 'yaml', '<r><a>1</a><b>x</b><b>y</b></r>', 'r:\n  a: "1"\n  b:\n    - x\n    - y'],
  ['yaml', 'properties', 'a:\n  b: 1\n  c: [x, y]', 'a.b=1\na.c.0=x\na.c.1=y'],
  ['properties', 'yaml', 'a.b=1\na.c.0=x\na.c.1=y', 'a:\n  b: "1"\n  c:\n    - x\n    - y'],
  ['csv', 'yaml', 'a,b\n1,2', '-\n  a: "1"\n  b: "2"'],
  ['yaml', 'csv', '- a: x\n  b: y\n- a: z\n  b: w', 'a,b\nx,y\nz,w'],
  ['csv', 'xml', 'a,b\n1,2', '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <a>1</a>\n  <b>2</b>\n</root>'.replace(/^/, '')],
];
for (const [from, to, input, expected] of CROSS) {
  test(`convert ${from} -> ${to}: exact output fixture`, () => {
    if (from === 'csv' && to === 'xml') return; // covered separately below (array root -> sibling roots)
    assert.equal(convert(input, from, to).output, expected);
    assert.equal(convert(input, from, to).detected, from);
  });
}
test('convert csv -> xml: array of records becomes sibling <root> elements (pinned)', () => {
  assert.equal(convert('a,b\n1,2', 'csv', 'xml', { xml: { declaration: false } }).output,
    '<root>\n  <a>1</a>\n  <b>2</b>\n</root>');
  assert.equal(convert('a\n1\n2', 'csv', 'xml', { xml: { declaration: false } }).output,
    '<root>\n  <a>1</a>\n</root>\n<root>\n  <a>2</a>\n</root>');
});

// --- A->B->A preserves data, over every ordered pair, for models representable in both formats.
// String-valued tabular records are representable in every format except properties/xml structurally,
// so we use two shared models: TABULAR (csv/tsv/json/yaml) and TREE (json/yaml/xml/properties, strings only).
const TABULAR = [{ name: 'Ada', note: 'x,y' }, { name: 'Bob', note: 'q"z' }];
const TREE = { r: { id: 'a1', tags: ['p', 'q'], nest: { k: 'v' } } };
const TABULAR_FORMATS = ['json', 'yaml', 'csv', 'tsv'];
const TREE_FORMATS = ['json', 'yaml', 'xml'];
const STRING_TREE = { app: { name: 'x', list: ['a', 'b'], sub: { k: 'v' } } };
const PROPS_FORMATS = ['json', 'yaml', 'properties'];
for (const A of TABULAR_FORMATS) for (const B of TABULAR_FORMATS) {
  if (A === B) continue;
  test(`convert tabular ${A} -> ${B} -> ${A} preserves records`, () => {
    const a = convert(REG.find((r) => r.id === A).emit(TABULAR), A, B).output;
    const back = convert(a, B, A).output;
    assert.deepEqual(REG.find((r) => r.id === A).parse(back), TABULAR);
  });
}
for (const A of TREE_FORMATS) for (const B of TREE_FORMATS) {
  if (A === B) continue;
  test(`convert tree ${A} -> ${B} -> ${A} preserves model`, () => {
    const a = convert(REG.find((r) => r.id === A).emit(TREE), A, B).output;
    const back = convert(a, B, A).output;
    assert.deepEqual(REG.find((r) => r.id === A).parse(back), TREE);
  });
}
for (const A of PROPS_FORMATS) for (const B of PROPS_FORMATS) {
  if (A === B) continue;
  test(`convert string-tree ${A} -> ${B} -> ${A} preserves model`, () => {
    const a = convert(REG.find((r) => r.id === A).emit(STRING_TREE), A, B).output;
    const back = convert(a, B, A).output;
    assert.deepEqual(REG.find((r) => r.id === A).parse(back), STRING_TREE);
  });
}

// --- type fidelity across a conversion: formats that carry types keep them; string-only formats stringify.
test('type fidelity: JSON -> YAML -> JSON keeps number/boolean/null/string distinctions', () => {
  const model = { n: 1, s: '1', t: true, ts: 'true', z: null, zs: 'null', f: 1.5, arr: [], obj: {} };
  const y = convert(JSON.stringify(model), 'json', 'yaml').output;
  assert.deepEqual(parseJSON(convert(y, 'yaml', 'json').output), model);
});
test('type fidelity: JSON -> CSV/TSV/properties/XML stringifies scalars (string-only formats)', () => {
  const j = '[{"n":1,"t":true,"s":"1"}]';
  assert.deepEqual(convert(convert(j, 'json', 'csv').output, 'csv', 'json').model, [{ n: '1', t: 'true', s: '1' }]);
  assert.deepEqual(convert(convert(j, 'json', 'tsv').output, 'tsv', 'json').model, [{ n: '1', t: 'true', s: '1' }]);
  assert.deepEqual(convert(convert('{"n":1,"t":true}', 'json', 'properties').output, 'properties', 'json').model, { n: '1', t: 'true' });
  assert.deepEqual(convert(convert('{"r":{"n":1,"t":true}}', 'json', 'xml').output, 'xml', 'json').model, { r: { n: '1', t: 'true' } });
});
test('type fidelity: null / empty containers across string-only formats collapse to "" (pinned)', () => {
  assert.deepEqual(convert(convert('{"r":{"z":null,"a":[],"o":{}}}', 'json', 'properties').output, 'properties', 'json').model, { r: { z: '', a: '', o: '' } });
  assert.deepEqual(convert(convert('{"r":{"z":null}}', 'json', 'xml').output, 'xml', 'json').model, { r: { z: '' } });
  assert.deepEqual(convert(convert('[{"z":null,"y":"k"}]', 'json', 'csv').output, 'csv', 'json').model, [{ z: '', y: 'k' }]);
});
test('type fidelity: unicode keys + values survive every format that can hold them', () => {
  const uni = { r: { 'üñí': '☃ \u{1F600}' } };
  for (const id of ['json', 'yaml', 'properties', 'xml']) {
    const f = REG.find((x) => x.id === id);
    assert.deepEqual(f.parse(f.emit(uni)), uni, id);
  }
  const rows = [{ 'üñí': '☃ \u{1F600}' }];
  for (const id of ['json', 'yaml', 'csv', 'tsv']) {
    const f = REG.find((x) => x.id === id);
    assert.deepEqual(f.parse(f.emit(rows)), rows, id);
  }
});

// --- convert opts routing: per-format sub-options
test('convert: opts routed per format (json.indent, yaml.indent, csv.header, csv.delimiter, xml.declaration)', () => {
  assert.equal(convert('{"a":1}', 'json', 'json', { json: { indent: 0 } }).output, '{"a":1}');
  assert.equal(convert('{"a":{"b":1}}', 'json', 'yaml', { yaml: { indent: 4 } }).output, 'a:\n    b: 1');
  assert.equal(convert('[{"a":1}]', 'json', 'csv', { csv: { header: false } }).output, '1');
  assert.equal(convert('a;b\n1;2', 'csv', 'json', { csv: { delimiter: ';' }, json: { indent: 0 } }).output, '[{"a":"1","b":"2"}]');
  assert.equal(convert('{"r":1}', 'json', 'xml', { xml: { declaration: false } }).output, '<r>1</r>');
  assert.equal(convert('{"a":"é"}', 'json', 'properties', { properties: { escapeUnicode: true } }).output, 'a=\\u00e9');
});
test('convert: same-format identity conversion normalises formatting', () => {
  assert.equal(convert('{"a":   1}', 'json', 'json').output, '{\n  "a": 1\n}');
  assert.equal(convert('a:    1', 'yaml', 'yaml').output, 'a: 1');
});

// =========================================================== FIXED under #1014-J
// A single-column record with an empty value now emits a quoted empty cell (`""`), and parseDelimited
// only drops a trailing empty record that was NOT an explicit quoted-empty — so the record round-trips.
test('CSV round-trip: single-column record with empty value survives [#1014-J]', () => {
  assert.deepEqual(parseCSV(emitCSV([{ a: '' }])), [{ a: '' }]);
  assert.deepEqual(parseCSV(emitCSV([{ a: 'x' }, { a: '' }])), [{ a: 'x' }, { a: '' }]);
});
test('TSV round-trip: single-column record with empty value survives [#1014-J]', () => {
  assert.deepEqual(parseTSV(emitTSV([{ a: '' }])), [{ a: '' }]);
});
test('CSV: multi-column empties survive too; single empty now emits a quoted cell [#1014-J]', () => {
  assert.deepEqual(parseCSV(emitCSV([{ a: '', b: '' }])), [{ a: '', b: '' }]);
  assert.deepEqual(parseCSV(emitCSV([{ a: 'x' }, { a: '' }, { a: 'y' }])), [{ a: 'x' }, { a: '' }, { a: 'y' }]);
  assert.equal(emitCSV([{ a: '' }]), 'a\n""'); // lone empty cell is now quoted so it round-trips
  // a trailing blank line (no quotes) is still dropped as the file's final newline
  assert.deepEqual(parseCSV('a\n'), []);
});
