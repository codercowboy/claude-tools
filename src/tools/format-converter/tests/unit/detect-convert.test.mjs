// Unit tests for detectFormat + the convert() entry point (format matrix,
// from='auto', and friendly errors on impossible mappings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { detectFormat, convert } = await loadLogic();

// --- detectFormat -----------------------------------------------------------
test('detectFormat recognizes each format from a representative input', () => {
  assert.equal(detectFormat('<?xml version="1.0"?><a>1</a>'), 'xml');
  assert.equal(detectFormat('<note><to>A</to></note>'), 'xml');
  assert.equal(detectFormat('{"a":1}'), 'json');
  assert.equal(detectFormat('[1,2,3]'), 'json');
  assert.equal(detectFormat('name\tborn\nAda\t1815'), 'tsv');
  assert.equal(detectFormat('a=1\nb=2'), 'properties');
  assert.equal(detectFormat('name: Ada\nborn: 1815'), 'yaml');
  assert.equal(detectFormat('- one\n- two'), 'yaml');
  assert.equal(detectFormat('name,born,city\nAda,1815,London'), 'csv');
});

test('detectFormat returns null on empty/whitespace and ambiguous input', () => {
  assert.equal(detectFormat(''), null);
  assert.equal(detectFormat('   \n  '), null);
  assert.equal(detectFormat('just a bare sentence with no structure'), null);
});

test('detectFormat: a leading --- marks YAML', () => {
  assert.equal(detectFormat('---\nname: Ada'), 'yaml');
});

// --- convert() matrix -------------------------------------------------------
test('convert JSON -> XML preserves the single-key root and nests children', () => {
  const { output } = convert('{"note":{"to":"A","body":"hi"}}', 'json', 'xml', {});
  assert.match(output, /<note>/);
  assert.match(output, /<to>A<\/to>/);
  assert.match(output, /<body>hi<\/body>/);
});

test('convert YAML -> JSON produces the expected object', () => {
  const { output } = convert('name: Ada\nborn: 1815', 'yaml', 'json', { json: { indent: 0 } });
  assert.equal(output, '{"name":"Ada","born":1815}');
});

test('convert JSON -> CSV emits a table from an array of objects', () => {
  const { output } = convert('[{"a":1,"b":2},{"a":3,"b":4}]', 'json', 'csv', {});
  assert.equal(output, 'a,b\n1,2\n3,4');
});

test('convert JSON -> .properties flattens to dotted keys', () => {
  const { output } = convert('{"a":{"b":"c"},"list":["x","y"]}', 'json', 'properties', {});
  assert.equal(output, 'a.b=c\nlist.0=x\nlist.1=y');
});

test('convert CSV -> JSON yields array of string-valued objects (no coercion)', () => {
  const { output } = convert('a,b\n1,2', 'csv', 'json', { json: { indent: 0 } });
  assert.equal(output, '[{"a":"1","b":"2"}]');
});

test('convert XML -> JSON -> XML round-trips through auto entry point', () => {
  const xml = '<note id="1"><to>A</to><tag>x</tag><tag>y</tag></note>';
  const toJson = convert(xml, 'xml', 'json', {}).output;
  const backToXml = convert(toJson, 'json', 'xml', {}).output;
  // Parsing the round-tripped XML must reproduce the original model.
  const m1 = convert(xml, 'xml', 'json', { json: { indent: 0 } }).output;
  const m2 = convert(backToXml, 'xml', 'json', { json: { indent: 0 } }).output;
  assert.equal(m1, m2);
});

test('convert with from="auto" detects the source and reports it', () => {
  const res = convert('name: Ada\nborn: 1815', 'auto', 'json', { json: { indent: 0 } });
  assert.equal(res.detected, 'yaml');
  assert.equal(res.output, '{"name":"Ada","born":1815}');
});

test('convert from="auto" throws a friendly error when detection fails', () => {
  assert.throws(
    () => convert('a bare unstructured sentence', 'auto', 'json', {}),
    /Could not auto-detect/,
  );
});

test('convert to CSV from a non-tabular model raises a friendly error, not a crash', () => {
  assert.throws(
    () => convert('"just a string"', 'json', 'csv', {}),
    /tabular model/,
  );
});

test('convert surfaces the parser error (invalid JSON) as a friendly message', () => {
  assert.throws(() => convert('{ bad json', 'json', 'yaml', {}), /Invalid JSON/);
});

test('convert throws on an unknown source/target format', () => {
  assert.throws(() => convert('x', 'bogus', 'json', {}), /Unknown source format/);
  assert.throws(() => convert('{}', 'json', 'bogus', {}), /Unknown target format/);
});
