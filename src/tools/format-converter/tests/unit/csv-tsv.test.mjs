// Unit tests for CSV/TSV parse/emit — RFC-4180 edge cases, header on/off,
// custom delimiter, TSV via tab, and the tabular-model constraints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const {
  parseCSV, emitCSV, parseTSV, emitTSV,
} = await loadLogic();

test('parseCSV: header row on (default) -> array of row objects', () => {
  const rows = parseCSV('name,born,city\nAda,1815,London\nGrace,1906,New York');
  assert.deepEqual(rows, [
    { name: 'Ada', born: '1815', city: 'London' },
    { name: 'Grace', born: '1906', city: 'New York' },
  ]);
});

test('parseCSV: header row off -> array of arrays', () => {
  const rows = parseCSV('a,b\n1,2\n3,4', { header: false });
  assert.deepEqual(rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('parseCSV RFC-4180: quoted field with an embedded comma', () => {
  const rows = parseCSV('name,city\nGrace,"New York, NY"');
  assert.deepEqual(rows, [{ name: 'Grace', city: 'New York, NY' }]);
});

test('parseCSV RFC-4180: escaped quotes ("" -> ") inside a quoted field', () => {
  const rows = parseCSV('quote\n"He said ""hi"" today"');
  assert.deepEqual(rows, [{ quote: 'He said "hi" today' }]);
});

test('parseCSV RFC-4180: embedded newline inside a quoted field', () => {
  const rows = parseCSV('note\n"line1\nline2"');
  assert.deepEqual(rows, [{ note: 'line1\nline2' }]);
});

test('parseCSV: CRLF line endings are normalized', () => {
  const rows = parseCSV('a,b\r\n1,2\r\n');
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parseCSV: a single trailing newline does not yield a phantom empty row', () => {
  const rows = parseCSV('a\n1\n');
  assert.deepEqual(rows, [{ a: '1' }]);
});

test('parseCSV: custom delimiter (semicolon)', () => {
  const rows = parseCSV('a;b\n1;2', { delimiter: ';' });
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parseCSV: unterminated quoted field throws a friendly error', () => {
  assert.throws(() => parseCSV('a\n"unterminated'), /Unterminated quoted field/);
});

test('parseTSV parses tab-delimited rows', () => {
  const rows = parseTSV('name\tborn\nAda\t1815');
  assert.deepEqual(rows, [{ name: 'Ada', born: '1815' }]);
});

test('emitCSV: array of objects -> header + rows (columns = union, first-seen order)', () => {
  const out = emitCSV([{ a: 1, b: 2 }, { a: 3, c: 4 }]);
  assert.equal(out, 'a,b,c\n1,2,\n3,,4');
});

test('emitCSV quotes only cells needing it (delimiter / quote / newline)', () => {
  const out = emitCSV([{ name: 'a,b', q: 'say "hi"', nl: 'x\ny', plain: 'ok' }]);
  assert.equal(out, 'name,q,nl,plain\n"a,b","say ""hi""","x\ny",ok');
});

test('emitCSV: header off omits the header line', () => {
  const out = emitCSV([{ a: 1, b: 2 }], { header: false });
  assert.equal(out, '1,2');
});

test('emitCSV: array of arrays emits as-is', () => {
  const out = emitCSV([['a', 'b'], ['1', '2']]);
  assert.equal(out, 'a,b\n1,2');
});

test('emitCSV: array of primitives -> single "value" column', () => {
  const out = emitCSV(['x', 'y', 'z']);
  assert.equal(out, 'value\nx\ny\nz');
});

test('emitCSV: a single plain object is treated as one row', () => {
  const out = emitCSV({ a: 1, b: 2 });
  assert.equal(out, 'a,b\n1,2');
});

test('emitCSV: nested cell values are JSON.stringify-ed', () => {
  const out = emitCSV([{ a: { b: 1 } }]);
  assert.equal(out, 'a\n"{""b"":1}"');
});

test('emitCSV: a non-tabular scalar model raises a friendly error, not a crash', () => {
  assert.throws(() => emitCSV('hello'), /tabular model/);
  assert.throws(() => emitCSV(42), /tabular model/);
});

test('emitCSV: non-uniform records (object + primitive) raise a friendly error', () => {
  assert.throws(() => emitCSV([{ a: 1 }, 'str']), /uniform records/);
});

test('emitTSV emits with a tab delimiter', () => {
  const out = emitTSV([{ a: 1, b: 2 }]);
  assert.equal(out, 'a\tb\n1\t2');
});

test('CSV round-trips an array of row objects losslessly (strings)', () => {
  const model = [
    { name: 'Ada', note: 'a,b "c"\nd' },
    { name: 'Grace', note: 'plain' },
  ];
  assert.deepEqual(parseCSV(emitCSV(model)), model);
});

test('TSV round-trips an array of row objects losslessly', () => {
  const model = [{ x: '1', y: 'two words' }, { x: '3', y: 'four' }];
  assert.deepEqual(parseTSV(emitTSV(model)), model);
});
