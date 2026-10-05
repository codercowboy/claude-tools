// Unit tests for XML parse/emit — the element/attribute/text convention,
// repeated tags -> arrays, root-name preservation, declaration toggle, and
// the attributes strategy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseXML, emitXML } = await loadLogic();

test('parseXML: attributes become @name keys, text becomes the value', () => {
  const model = parseXML('<person id="1"><name>Ada</name></person>');
  assert.deepEqual(model, { person: { '@id': '1', name: 'Ada' } });
});

test('parseXML: a bare text element becomes its value directly (no #text)', () => {
  assert.deepEqual(parseXML('<name>Ada</name>'), { name: 'Ada' });
});

test('parseXML: element with attributes AND text uses a #text key', () => {
  assert.deepEqual(
    parseXML('<a href="x">hi</a>'),
    { a: { '@href': 'x', '#text': 'hi' } },
  );
});

test('parseXML: repeated child tags become an array', () => {
  const model = parseXML('<list><item>a</item><item>b</item><item>c</item></list>');
  assert.deepEqual(model, { list: { item: ['a', 'b', 'c'] } });
});

test('parseXML: an empty element becomes "" (or {} with attributes)', () => {
  assert.deepEqual(parseXML('<a></a>'), { a: '' });
  assert.deepEqual(parseXML('<a/>'), { a: '' });
  assert.deepEqual(parseXML('<a x="1"/>'), { a: { '@x': '1' } });
});

test('parseXML: decodes entities and CDATA', () => {
  assert.deepEqual(parseXML('<a>1 &lt; 2 &amp; 3</a>'), { a: '1 < 2 & 3' });
  assert.deepEqual(parseXML('<a><![CDATA[<raw> & stuff]]></a>'), { a: '<raw> & stuff' });
});

test('parseXML: ignores the <?xml …?> declaration and comments', () => {
  const model = parseXML('<?xml version="1.0"?>\n<!-- hi -->\n<a>x</a>');
  assert.deepEqual(model, { a: 'x' });
});

test('parseXML: mismatched closing tag throws a friendly error', () => {
  assert.throws(() => parseXML('<a><b></a>'), /mismatched closing tag|never closed/i);
});

test('parseXML: no root element throws a friendly error', () => {
  assert.throws(() => parseXML('   '), /no root element/i);
});

test('emitXML: preserves the root element name for a single-key model', () => {
  const out = emitXML({ note: { to: 'A', body: 'hi' } }, {});
  assert.match(out, /<note>/);
  assert.match(out, /<\/note>/);
});

test('emitXML: emits (and can suppress) the XML declaration', () => {
  const withDecl = emitXML({ a: '1' }, { declaration: true });
  const noDecl = emitXML({ a: '1' }, { declaration: false });
  assert.match(withDecl, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.doesNotMatch(noDecl, /<\?xml/);
});

test('emitXML: @-keys render as attributes, #text as element text', () => {
  const out = emitXML({ a: { '@href': 'x', '#text': 'hi' } }, { declaration: false });
  assert.equal(out, '<a href="x">hi</a>');
});

test('emitXML: attributes strategy turns primitive keys into attributes', () => {
  const out = emitXML({ p: { id: '1', name: 'Ada' } }, { attributes: true, declaration: false });
  assert.equal(out, '<p id="1" name="Ada"/>');
});

test('emitXML: arrays render as repeated elements sharing the key name', () => {
  const out = emitXML({ list: { item: ['a', 'b'] } }, { declaration: false });
  assert.match(out, /<item>a<\/item>/);
  assert.match(out, /<item>b<\/item>/);
});

test('emitXML: entity-escapes special characters in text', () => {
  const out = emitXML({ a: '1 < 2 & 3' }, { declaration: false });
  assert.equal(out, '<a>1 &lt; 2 &amp; 3</a>');
});

test('emitXML: an invalid root element name throws a friendly error', () => {
  assert.throws(() => emitXML({ a: 1 }, { rootName: '1bad' }), /not a valid element name/);
});

test('XML -> model -> XML round-trips (root name, attrs, repeated tags)', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<note id="1">\n  <to>A</to>\n  <tag>x</tag>\n  <tag>y</tag>\n</note>';
  const model = parseXML(xml);
  const out = emitXML(model, {});
  // Re-parse the emitted XML; the model must be identical.
  assert.deepEqual(parseXML(out), model);
});
