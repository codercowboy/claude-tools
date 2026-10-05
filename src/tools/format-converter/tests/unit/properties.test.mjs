// Unit tests for .properties parse/emit — dotted-key nesting, numeric-index
// arrays, separators, comments, continuations, and Java-style escaping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseProperties, emitProperties } = await loadLogic();

test('emitProperties flattens a nested object to dotted keys', () => {
  const out = emitProperties({ a: { b: { c: '1' } }, name: 'Ada' });
  // Output is sorted for stable diffs.
  assert.equal(out, 'a.b.c=1\nname=Ada');
});

test('emitProperties uses numeric index segments for arrays (list.0=, list.1=)', () => {
  const out = emitProperties({ list: ['x', 'y'] });
  assert.equal(out, 'list.0=x\nlist.1=y');
});

test('parseProperties un-flattens dotted keys into a nested object', () => {
  const model = parseProperties('a.b.c=1\naddress.city=London');
  assert.deepEqual(model, { a: { b: { c: '1' } }, address: { city: 'London' } });
});

test('parseProperties rebuilds an array from consecutive integer segments (0..n-1)', () => {
  const model = parseProperties('list.0=x\nlist.1=y\nlist.2=z');
  assert.deepEqual(model, { list: ['x', 'y', 'z'] });
});

test('parseProperties keeps integer-looking segments as object keys when not 0..n-1', () => {
  const model = parseProperties('m.1=a\nm.3=b');
  assert.deepEqual(model, { m: { 1: 'a', 3: 'b' } });
});

test('object <-> dotted-key round-trip is lossless (strings)', () => {
  const model = { a: { b: { c: '1' } }, list: ['x', 'y'], name: 'Ada' };
  assert.deepEqual(parseProperties(emitProperties(model)), model);
});

test('parseProperties accepts =, :, and whitespace separators', () => {
  const model = parseProperties('a=1\nb:2\nc 3');
  assert.deepEqual(model, { a: '1', b: '2', c: '3' });
});

test('parseProperties skips # and ! comment lines and blank lines', () => {
  const model = parseProperties('# a comment\n! another\n\nkey=value');
  assert.deepEqual(model, { key: 'value' });
});

test('parseProperties joins line continuations (trailing backslash)', () => {
  const model = parseProperties('key=one \\\n  two');
  assert.equal(model.key, 'one two');
});

test('parseProperties decodes \\uXXXX and \\n \\t escapes in values', () => {
  const model = parseProperties('u=caf\\u00e9\ntabbed=a\\tb\\nc');
  assert.equal(model.u, 'café');
  assert.equal(model.tabbed, 'a\tb\nc');
});

test('parseProperties decodes escaped separators inside keys (\\= \\: and spaces)', () => {
  const model = parseProperties('key\\ with\\ space=hello\ncolon\\:key=v\nequ\\=key=w');
  assert.deepEqual(model, {
    'key with space': 'hello',
    'colon:key': 'v',
    'equ=key': 'w',
  });
});

test('emitProperties escapes key specials (space, :, =) and value newlines', () => {
  const out = emitProperties({ 'a b': 'v', 'c:d': 'x', 'e=f': 'y', multi: 'l1\nl2' });
  // sorted: 'a b', 'c:d', 'e=f', 'multi'
  assert.equal(out, 'a\\ b=v\nc\\:d=x\ne\\=f=y\nmulti=l1\\nl2');
});

test('emitProperties escapeUnicode option \\uXXXX-escapes non-ASCII', () => {
  assert.equal(emitProperties({ u: 'café' }, { escapeUnicode: true }), 'u=caf\\u00e9');
  assert.equal(emitProperties({ u: 'café' }, { escapeUnicode: false }), 'u=café');
});

test('emitProperties escapes a leading space in a value', () => {
  assert.equal(emitProperties({ k: ' leading' }), 'k=\\ leading');
});
