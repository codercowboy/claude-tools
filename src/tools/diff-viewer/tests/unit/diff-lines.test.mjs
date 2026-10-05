// Unit tests for line-level diffing (source/logic.mjs § diffLines) — op
// sequences (equal / insert / delete / replace), the op range fields, stats
// accounting, and the ignore-* options. node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { diffLines } = await loadLogic();

// The ordered op TYPES of a line diff, as a compact array for assertions.
const types = (a, b, opts) => diffLines(a, b, opts).ops.map((o) => o.type);

test('diffLines: both empty -> no ops, zero stats', () => {
  const { ops, stats } = diffLines('', '');
  assert.deepEqual(ops, []);
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 0 });
});

test('diffLines: identical -> a single equal op spanning everything', () => {
  const { ops, stats } = diffLines('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(ops.map((o) => o.type), ['equal']);
  assert.deepEqual(ops[0].aLines, ['a', 'b', 'c']);
  assert.deepEqual(ops[0].bLines, ['a', 'b', 'c']);
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 0 });
});

test('diffLines: empty A -> one insert op of all B lines, stats.added counts them', () => {
  const { ops, stats } = diffLines('', 'x\ny');
  assert.deepEqual(ops.map((o) => o.type), ['insert']);
  assert.deepEqual(ops[0].bLines, ['x', 'y']);
  assert.deepEqual(ops[0].aLines, []);
  assert.deepEqual(stats, { added: 2, removed: 0, changed: 0 });
});

test('diffLines: empty B -> one delete op of all A lines, stats.removed counts them', () => {
  const { ops, stats } = diffLines('x\ny\nz', '');
  assert.deepEqual(ops.map((o) => o.type), ['delete']);
  assert.deepEqual(ops[0].aLines, ['x', 'y', 'z']);
  assert.deepEqual(stats, { added: 0, removed: 3, changed: 0 });
});

test('diffLines: pure insertion in the middle -> equal / insert / equal', () => {
  const { ops, stats } = diffLines('a\nc', 'a\nb\nc');
  assert.deepEqual(ops.map((o) => o.type), ['equal', 'insert', 'equal']);
  const ins = ops[1];
  assert.deepEqual(ins.bLines, ['b']);
  assert.equal(ins.aStart, 1); // after line "a"
  assert.equal(ins.bStart, 1);
  assert.deepEqual(stats, { added: 1, removed: 0, changed: 0 });
});

test('diffLines: pure deletion in the middle -> equal / delete / equal', () => {
  const { ops, stats } = diffLines('a\nb\nc', 'a\nc');
  assert.deepEqual(ops.map((o) => o.type), ['equal', 'delete', 'equal']);
  assert.deepEqual(ops[1].aLines, ['b']);
  assert.deepEqual(stats, { added: 0, removed: 1, changed: 0 });
});

test('diffLines: a one-for-one line change becomes a replace op, counted as changed', () => {
  const { ops, stats } = diffLines('a\nB\nc', 'a\nX\nc');
  assert.deepEqual(ops.map((o) => o.type), ['equal', 'replace', 'equal']);
  const rep = ops[1];
  assert.deepEqual(rep.aLines, ['B']);
  assert.deepEqual(rep.bLines, ['X']);
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 1 });
});

test('diffLines: replace stats — surplus deleted lines add to removed', () => {
  // three old lines, one new line: 1 changed (paired) + 2 removed (surplus).
  const { ops, stats } = diffLines('one\ntwo\nthree', 'ONE', { });
  assert.deepEqual(ops.map((o) => o.type), ['replace']);
  assert.deepEqual(stats, { added: 0, removed: 2, changed: 1 });
});

test('diffLines: replace stats — surplus inserted lines add to added', () => {
  const { ops, stats } = diffLines('one', 'ONE\nTWO\nTHREE');
  assert.deepEqual(ops.map((o) => o.type), ['replace']);
  assert.deepEqual(stats, { added: 2, removed: 0, changed: 1 });
});

test('diffLines: entirely different content -> a single replace op', () => {
  const { ops, stats } = diffLines('a\nb', 'x\ny');
  assert.deepEqual(ops.map((o) => o.type), ['replace']);
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 2 });
});

test('diffLines: single-line inputs that differ -> replace, changed 1', () => {
  const { stats, ops } = diffLines('hello', 'hallo');
  assert.deepEqual(ops.map((o) => o.type), ['replace']);
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 1 });
});

test('diffLines: trailing newline is a real (empty) final line and shows up in the diff', () => {
  // "a" vs "a\n": B has an extra trailing empty line -> one insert.
  const { ops, stats } = diffLines('a', 'a\n');
  assert.deepEqual(ops.map((o) => o.type), ['equal', 'insert']);
  assert.deepEqual(ops[1].bLines, ['']);
  assert.deepEqual(stats, { added: 1, removed: 0, changed: 0 });
});

test('diffLines: very different lengths (short A, long B)', () => {
  const a = 'x';
  const b = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const { stats } = diffLines(a, b);
  // "x" doesn't match any of the 50 -> 1 changed paired + 49 added surplus,
  // OR fully replaced; either way added+changed accounts for the new content.
  assert.equal(stats.added + stats.changed, 50);
  assert.equal(stats.removed, 0);
});

test('diffLines: CRLF vs LF only -> identical (newlines normalized before diff)', () => {
  const { stats, ops } = diffLines('a\r\nb\r\nc', 'a\nb\nc');
  assert.deepEqual(stats, { added: 0, removed: 0, changed: 0 });
  assert.deepEqual(ops.map((o) => o.type), ['equal']);
});

// ---- options change what counts as equal ------------------------------
test('option ignoreLeadingTrailingWhitespace: leading/trailing-only change becomes equal', () => {
  const dirty = diffLines('  a  \nb', 'a\nb');
  assert.equal(dirty.stats.changed, 1, 'without the option, the trimmed line differs');
  const clean = diffLines('  a  \nb', 'a\nb', { ignoreLeadingTrailingWhitespace: true });
  assert.deepEqual(clean.stats, { added: 0, removed: 0, changed: 0 });
});

test('option ignoreLeadingTrailingWhitespace: an INNER whitespace change still differs', () => {
  const r = diffLines('a  b', 'a b', { ignoreLeadingTrailingWhitespace: true });
  assert.equal(r.stats.changed, 1, 'trim does not touch interior whitespace');
});

test('option ignoreAllWhitespace: interior whitespace change becomes equal', () => {
  const dirty = diffLines('a  b', 'a b');
  assert.equal(dirty.stats.changed, 1);
  const clean = diffLines('a  b', 'a b', { ignoreAllWhitespace: true });
  assert.deepEqual(clean.stats, { added: 0, removed: 0, changed: 0 });
});

test('option ignoreCase: a case-only change becomes equal', () => {
  const dirty = diffLines('Hello\nWorld', 'hello\nworld');
  assert.equal(dirty.stats.changed, 2);
  const clean = diffLines('Hello\nWorld', 'hello\nworld', { ignoreCase: true });
  assert.deepEqual(clean.stats, { added: 0, removed: 0, changed: 0 });
});

test('options: displayed text is preserved verbatim even when compared as equal', () => {
  // Under ignoreCase the lines compare equal, so a single equal op carries the
  // ORIGINAL (differently-cased) text on each side — nothing is normalized away.
  const { ops } = diffLines('HELLO', 'hello', { ignoreCase: true });
  assert.deepEqual(ops.map((o) => o.type), ['equal']);
  assert.deepEqual(ops[0].aLines, ['HELLO']);
  assert.deepEqual(ops[0].bLines, ['hello']);
});

test('options combine: ignoreAllWhitespace + ignoreCase', () => {
  const r = diffLines('  Foo Bar  ', 'foobar', { ignoreAllWhitespace: true, ignoreCase: true });
  assert.deepEqual(r.stats, { added: 0, removed: 0, changed: 0 });
});

test('diffLines: line numbers (aStart/bStart) stay consistent across a mixed diff', () => {
  // A: a b c d      B: a X c d e
  // b -> X (replace at index 1), then equal c d, then insert e.
  const { ops } = diffLines('a\nb\nc\nd', 'a\nX\nc\nd\ne');
  const rep = ops.find((o) => o.type === 'replace');
  assert.equal(rep.aStart, 1);
  assert.equal(rep.bStart, 1);
  const ins = ops.find((o) => o.type === 'insert');
  assert.deepEqual(ins.bLines, ['e']);
  assert.equal(ins.bStart, 4);
});
