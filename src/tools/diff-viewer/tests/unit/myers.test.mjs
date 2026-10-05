// Unit tests for the Myers O(ND) core (source/logic.mjs § myersDiff) plus the
// lossless helpers splitLines / normalizeLine / tokenizeWords it builds on.
// node --test, no browser/DOM. See DESIGN.md and docs/conventions.md
// § "Pure-logic unit tests".
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, opString, reconstruct } from './_helpers.mjs';

const { myersDiff, splitLines, normalizeLine, tokenizeWords } = await loadLogic();

// The exported ops carry only a `type`; equal runs are one op per element (the
// grouping into ranges happens later in diffLines), so op counts are exact.
function counts(ops) {
  const c = { equal: 0, insert: 0, delete: 0 };
  for (const o of ops) c[o.type]++;
  return c;
}

test('myersDiff: both empty -> no ops', () => {
  assert.deepEqual(myersDiff([], []), []);
});

test('myersDiff: empty a -> all inserts', () => {
  const ops = myersDiff([], ['x', 'y', 'z']);
  assert.equal(opString(ops), '+++');
});

test('myersDiff: empty b -> all deletes', () => {
  const ops = myersDiff(['x', 'y', 'z'], []);
  assert.equal(opString(ops), '---');
});

test('myersDiff: identical sequences -> all equal, no edits', () => {
  const a = ['a', 'b', 'c', 'd'];
  const ops = myersDiff(a, a.slice());
  assert.equal(opString(ops), '====');
  assert.deepEqual(counts(ops), { equal: 4, insert: 0, delete: 0 });
});

test('myersDiff: entirely different sequences -> deletes then inserts, no shared snake', () => {
  const ops = myersDiff(['a', 'b'], ['x', 'y']);
  assert.equal(counts(ops).equal, 0);
  assert.equal(counts(ops).delete, 2);
  assert.equal(counts(ops).insert, 2);
});

test('myersDiff: single insertion in the middle', () => {
  // a b c  ->  a X b c
  const ops = myersDiff(['a', 'b', 'c'], ['a', 'X', 'b', 'c']);
  assert.deepEqual(counts(ops), { equal: 3, insert: 1, delete: 0 });
});

test('myersDiff: single deletion in the middle', () => {
  // a X b c  ->  a b c
  const ops = myersDiff(['a', 'X', 'b', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(counts(ops), { equal: 3, insert: 0, delete: 1 });
});

test('myersDiff: classic ABCABBA -> CBABAC edit distance is 5', () => {
  // The canonical example from Myers 1986; SES length (inserts+deletes) is 5.
  const a = 'ABCABBA'.split('');
  const b = 'CBABAC'.split('');
  const ops = myersDiff(a, b);
  const { insert, delete: del } = counts(ops);
  assert.equal(insert + del, 5, 'shortest edit script has 5 edits');
});

test('myersDiff: ops always reconstruct both inputs (fuzz over random strings)', () => {
  const alpha = 'abcde';
  const rnd = (n) => Array.from({ length: n }, () => alpha[Math.floor(Math.random() * alpha.length)]);
  for (let i = 0; i < 300; i++) {
    const a = rnd(Math.floor(Math.random() * 9));
    const b = rnd(Math.floor(Math.random() * 9));
    const ops = myersDiff(a, b);
    const { a: ra, b: rb } = reconstruct(ops, a, b);
    assert.deepEqual(ra, a, `A reconstruct failed for ${a} / ${b}`);
    assert.deepEqual(rb, b, `B reconstruct failed for ${a} / ${b}`);
  }
});

test('myersDiff: edit-script length never exceeds N+M (fuzz)', () => {
  const alpha = 'ab';
  const rnd = (n) => Array.from({ length: n }, () => alpha[Math.floor(Math.random() * alpha.length)]);
  for (let i = 0; i < 200; i++) {
    const a = rnd(Math.floor(Math.random() * 8));
    const b = rnd(Math.floor(Math.random() * 8));
    const ops = myersDiff(a, b);
    const { insert, delete: del } = counts(ops);
    assert.ok(insert + del <= a.length + b.length);
    // Sanity: equals + deletes == |a|, equals + inserts == |b|.
    assert.equal(counts(ops).equal + del, a.length);
    assert.equal(counts(ops).equal + insert, b.length);
  }
});

test('myersDiff: custom eq comparator is honored', () => {
  const ci = (x, y) => x.toLowerCase() === y.toLowerCase();
  const ops = myersDiff(['Hello', 'World'], ['hello', 'WORLD'], ci);
  assert.equal(opString(ops), '==');
});

// ---- splitLines -------------------------------------------------------
test('splitLines: empty / null contribute zero lines', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines(null), []);
  assert.deepEqual(splitLines(undefined), []);
});

test('splitLines: normalizes CRLF and lone CR to LF', () => {
  assert.deepEqual(splitLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
});

test('splitLines: a trailing newline yields a final empty line', () => {
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b', '']);
  assert.deepEqual(splitLines('a'), ['a']);
});

// ---- normalizeLine ----------------------------------------------------
test('normalizeLine: no options is identity (stringified)', () => {
  assert.equal(normalizeLine('  Hi There  '), '  Hi There  ');
  assert.equal(normalizeLine(null), '');
});

test('normalizeLine: ignoreLeadingTrailingWhitespace trims both ends only', () => {
  assert.equal(normalizeLine('  a  b  ', { ignoreLeadingTrailingWhitespace: true }), 'a  b');
});

test('normalizeLine: ignoreAllWhitespace strips every whitespace char', () => {
  assert.equal(normalizeLine('a b\tc ', { ignoreAllWhitespace: true }), 'abc');
});

test('normalizeLine: ignoreAllWhitespace takes precedence over trim', () => {
  const s = normalizeLine(' a b ', { ignoreAllWhitespace: true, ignoreLeadingTrailingWhitespace: true });
  assert.equal(s, 'ab');
});

test('normalizeLine: ignoreCase lowercases', () => {
  assert.equal(normalizeLine('AbC', { ignoreCase: true }), 'abc');
});

test('normalizeLine: options compose (trim + case)', () => {
  assert.equal(normalizeLine('  Foo Bar  ', { ignoreLeadingTrailingWhitespace: true, ignoreCase: true }), 'foo bar');
});

// ---- tokenizeWords ----------------------------------------------------
test('tokenizeWords: lossless — join reproduces the input', () => {
  const samples = ['', 'hello world', '  a =  b(c) ', 'foo_bar123 + baz!', 'CJK 你好 世界'];
  for (const s of samples) {
    assert.equal(tokenizeWords(s).join(''), s, `lossless for ${JSON.stringify(s)}`);
  }
});

test('tokenizeWords: splits words, whitespace runs, and single other chars', () => {
  assert.deepEqual(tokenizeWords('a = b'), ['a', ' ', '=', ' ', 'b']);
  assert.deepEqual(tokenizeWords('foo123_bar'), ['foo123_bar']);
  assert.deepEqual(tokenizeWords('a  b'), ['a', '  ', 'b']);
});

test('tokenizeWords: empty string -> empty array', () => {
  assert.deepEqual(tokenizeWords(''), []);
  assert.deepEqual(tokenizeWords(null), []);
});
