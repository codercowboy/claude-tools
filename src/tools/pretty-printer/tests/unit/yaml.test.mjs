// Unit tests — YAML engine (source/logic.mjs). node --test, no browser/DOM.
// See DESIGN.md § "YAML (subset …)". The engine covers a documented common
// subset and MUST reject every out-of-scope feature with a clear error rather
// than mis-parse it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYAML, formatYAML, minifyYAML, SAMPLES } from './_helpers.mjs';

// Inputs that live entirely inside the supported subset.
const SUPPORTED = {
  blockMap: 'name: pretty-printer\nversion: 0.1.0\nactive: true',
  blockSeq: '- one\n- two\n- three',
  nestedMap: 'server:\n  host: localhost\n  port: 8080\n  tls:\n    enabled: false',
  seqOfMaps: 'users:\n  - name: a\n    age: 1\n  - name: b\n    age: 2',
  mapOfSeqs: 'tags:\n  - json\n  - yaml\nports:\n  - 80\n  - 443',
  scalars: 'n: null\nt: true\nf: false\ni: 42\nfl: 3.14\nneg: -7\ns: hello',
  quoted: 'single: \'a: b # c\'\ndouble: "x\\ty"\nempty: ""',
  flowSeq: 'items: [1, 2, 3]\nmixed: [a, true, null, 4]',
  flowMap: 'point: {x: 1, y: 2}\nnested: {a: {b: 1}}',
  flowNested: 'matrix: [{os: linux, node: 20}, {os: macos, node: 22}]',
  leadingDoc: '---\nname: doc\nvalue: 1',
  comments: '# top comment\nname: x  # trailing\nvalue: 1',
  blanks: 'a: 1\n\n\nb: 2\n',
};

test('parseYAML(formatYAML(x)) deep-equals parseYAML(x) — format is meaning-preserving', () => {
  for (const [name, src] of Object.entries(SUPPORTED)) {
    assert.deepEqual(parseYAML(formatYAML(src)), parseYAML(src), name);
  }
});

test('parseYAML(minifyYAML(x)) deep-equals parseYAML(x) — minify is meaning-preserving', () => {
  for (const [name, src] of Object.entries(SUPPORTED)) {
    assert.deepEqual(parseYAML(minifyYAML(src)), parseYAML(src), name);
  }
});

test('formatYAML: fmt(fmt(x)) === fmt(x) — idempotent', () => {
  for (const [name, src] of Object.entries(SUPPORTED)) {
    const once = formatYAML(src);
    assert.equal(formatYAML(once), once, name);
  }
});

test('minifyYAML: min(min(x)) === min(x) — idempotent', () => {
  for (const [name, src] of Object.entries(SUPPORTED)) {
    const once = minifyYAML(src);
    assert.equal(minifyYAML(once), once, name);
  }
});

test('parseYAML: scalar typing (null / bool / number / string)', () => {
  const v = parseYAML('n: null\ntilde: ~\nt: true\nf: false\ni: 42\nfl: 3.14\nhex: 0xff\ns: plain');
  assert.deepEqual(v, { n: null, tilde: null, t: true, f: false, i: 42, fl: 3.14, hex: 255, s: 'plain' });
});

test('parseYAML: quoted scalars keep characters that would otherwise be structural', () => {
  const v = parseYAML('a: \'x: y # z\'\nb: "has \\"quotes\\""\nc: "tab\\there"');
  assert.deepEqual(v, { a: 'x: y # z', b: 'has "quotes"', c: 'tab\there' });
});

test('parseYAML: comments are ignored, not parsed as values', () => {
  assert.deepEqual(parseYAML('# comment\nk: v # trailing'), { k: 'v' });
  // A "#" inside quotes is NOT a comment.
  assert.deepEqual(parseYAML('k: "a # b"'), { k: 'a # b' });
});

test('parseYAML: nested block + flow combinations', () => {
  const v = parseYAML('root:\n  list: [1, 2]\n  obj: {a: 1, b: [true, null]}');
  assert.deepEqual(v, { root: { list: [1, 2], obj: { a: 1, b: [true, null] } } });
});

test('parseYAML: a single leading "---" is accepted', () => {
  assert.deepEqual(parseYAML('---\na: 1\nb: 2'), { a: 1, b: 2 });
});

test('formatYAML: emits canonical block YAML that re-parses identically', () => {
  const out = formatYAML(SAMPLES.yaml);
  // Block style: no flow braces at the top level for the map.
  assert.match(out, /^name: pretty-printer/m);
  assert.deepEqual(parseYAML(out), parseYAML(SAMPLES.yaml));
});

test('minifyYAML: emits compact flow style', () => {
  const out = minifyYAML('a: 1\nb:\n  - 1\n  - 2');
  assert.equal(out, '{a: 1, b: [1, 2]}');
});

test('formatYAML/minifyYAML: comments are dropped (documented behavior)', () => {
  const withComments = '# header\nname: x  # inline\nvalue: 1';
  assert.doesNotMatch(formatYAML(withComments), /#/);
  assert.doesNotMatch(minifyYAML(withComments), /#/);
});

// --- Unsupported features: each must throw the documented message ----------

const UNSUPPORTED = [
  ['anchors', 'a: &anchor 1', /^Unsupported YAML feature: anchors \(line 1\)$/],
  ['aliases', 'a: *ref', /^Unsupported YAML feature: aliases \(line 1\)$/],
  ['tags', 'a: !!str 1', /^Unsupported YAML feature: tags \(line 1\)$/],
  ['single-bang tag', 'a: !custom 1', /^Unsupported YAML feature: tags \(line 1\)$/],
  ['complex keys', '? a\n: b', /^Unsupported YAML feature: complex keys \(line 1\)$/],
  ['block scalar |', 'a: |\n  text', /^Unsupported YAML feature: block scalars \(line 1\)$/],
  ['block scalar >', 'a: >\n  text', /^Unsupported YAML feature: block scalars \(line 1\)$/],
  ['block scalar |-', 'a: |-\n  text', /^Unsupported YAML feature: block scalars \(line 1\)$/],
  ['tab indentation', 'a:\n\tb: 1', /^Unsupported YAML feature: tab indentation \(line 2\)$/],
  ['multiple documents', 'a: 1\n---\nb: 2', /^Unsupported YAML feature: multiple documents \(line 2\)$/],
  ['top-level anchor', '&anchor\na: 1', /^Unsupported YAML feature: anchors \(line 1\)$/],
];

test('parseYAML: every unsupported feature throws the documented "Unsupported YAML feature: …" error', () => {
  for (const [name, src, re] of UNSUPPORTED) {
    assert.throws(() => parseYAML(src), (e) => e instanceof Error && re.test(e.message), name);
  }
});

test('formatYAML/minifyYAML: unsupported features propagate the same error', () => {
  for (const [name, src, re] of UNSUPPORTED) {
    assert.throws(() => formatYAML(src), (e) => re.test(e.message), `format ${name}`);
    assert.throws(() => minifyYAML(src), (e) => re.test(e.message), `minify ${name}`);
  }
});

test('parseYAML: malformed key/value lines throw a friendly error with a line number', () => {
  assert.throws(() => parseYAML('just a bare line'), (e) => /Expected "key: value" \(line 1\)/.test(e.message));
});

test('YAML sample: round-trips through both format and minify', () => {
  const src = SAMPLES.yaml;
  const base = parseYAML(src);
  assert.deepEqual(parseYAML(formatYAML(src)), base);
  assert.deepEqual(parseYAML(minifyYAML(src)), base);
});
