// Unit tests for CtDiff.mjs (Myers O(ND) diff engine). Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: (1) HAND-DERIVED exact op lists / exact unified-diff text (catch a wrong-but-self-
// consistent diff); (2) a FIXED battery of (before, after) pairs run through the reconstruct
// property (apply the edit script -> rebuild `after`) as a SUPPLEMENT; (3) option tests proving
// ignore-* options change equality while emitted ops carry the ORIGINAL text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitLines, normalizeLine, myersDiff, diffLines, tokenizeWords, diffWords, toUnifiedDiff,
} from '../../utils/formats/CtDiff.mjs';

const types = (ops) => ops.map((o) => o.type);
const mk = (type, aStart, bStart, aLines, bLines) => ({ type, aStart, bStart, aLines, bLines });

// ------------------------------------------------------------ splitLines
test('splitLines: empty/null/undefined -> []', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines(null), []);
  assert.deepEqual(splitLines(undefined), []);
});
test('splitLines: basic, CRLF, lone CR, mixed', () => {
  assert.deepEqual(splitLines('a'), ['a']);
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.deepEqual(splitLines('a\r\nb'), ['a', 'b']);
  assert.deepEqual(splitLines('a\rb'), ['a', 'b']);
  assert.deepEqual(splitLines('a\r\nb\nc\rd'), ['a', 'b', 'c', 'd']);
});
test('splitLines: trailing newline yields a final empty line; lone newline -> two empties', () => {
  assert.deepEqual(splitLines('a\n'), ['a', '']);
  assert.deepEqual(splitLines('\n'), ['', '']);
  assert.deepEqual(splitLines('a\n\nb'), ['a', '', 'b']);
});
test('splitLines: non-string coerced', () => {
  assert.deepEqual(splitLines(42), ['42']);
});

// ------------------------------------------------------------ normalizeLine
test('normalizeLine: no options is identity; null/undefined -> ""', () => {
  assert.equal(normalizeLine('  A b  '), '  A b  ');
  assert.equal(normalizeLine(null), '');
  assert.equal(normalizeLine(undefined, {}), '');
});
test('normalizeLine: ignoreCase', () => {
  assert.equal(normalizeLine('HeLLo', { ignoreCase: true }), 'hello');
});
test('normalizeLine: ignoreAllWhitespace removes every whitespace run', () => {
  assert.equal(normalizeLine(' a \t b  c ', { ignoreAllWhitespace: true }), 'abc');
});
test('normalizeLine: ignoreLeadingTrailingWhitespace keeps interior whitespace', () => {
  assert.equal(normalizeLine('  a  b \t', { ignoreLeadingTrailingWhitespace: true }), 'a  b');
});
test('normalizeLine: ignoreAllWhitespace takes precedence over leading/trailing', () => {
  assert.equal(
    normalizeLine(' a b ', { ignoreAllWhitespace: true, ignoreLeadingTrailingWhitespace: true }), 'ab');
});
test('normalizeLine: options combine with ignoreCase', () => {
  assert.equal(normalizeLine('  A B ', { ignoreAllWhitespace: true, ignoreCase: true }), 'ab');
  assert.equal(normalizeLine('  A B ', { ignoreLeadingTrailingWhitespace: true, ignoreCase: true }), 'a b');
});

// ------------------------------------------------------------ myersDiff
test('myersDiff: empty/empty -> []', () => {
  assert.deepEqual(myersDiff([], []), []);
});
test('myersDiff: empty a -> all inserts; empty b -> all deletes', () => {
  assert.deepEqual(myersDiff([], ['x', 'y']), [{ type: 'insert' }, { type: 'insert' }]);
  assert.deepEqual(myersDiff(['x', 'y', 'z'], []), [{ type: 'delete' }, { type: 'delete' }, { type: 'delete' }]);
});
test('myersDiff: identical -> all equal', () => {
  assert.deepEqual(myersDiff(['a', 'b', 'c'], ['a', 'b', 'c']), [
    { type: 'equal' }, { type: 'equal' }, { type: 'equal' },
  ]);
});
test('myersDiff: HAND-DERIVED [a,b,c] vs [a,x,c] -> equal, delete, insert, equal', () => {
  // d=0: snake a=a -> v[0]=1. d=1: neither k=-1 nor k=1 reaches (3,3). d=2: k=0 comes from
  // the k=1 (right/delete) neighbour then down (insert) and snakes c=c to the end.
  // Backtrack yields: equal(a), delete(b), insert(x), equal(c).
  assert.deepEqual(myersDiff(['a', 'b', 'c'], ['a', 'x', 'c']), [
    { type: 'equal' }, { type: 'delete' }, { type: 'insert' }, { type: 'equal' },
  ]);
});
test('myersDiff: single replacement [a] vs [b] -> delete, insert', () => {
  assert.deepEqual(types(myersDiff(['a'], ['b'])), ['delete', 'insert']);
});
test('myersDiff: pure insertion at end / start / middle', () => {
  assert.deepEqual(types(myersDiff(['a', 'b'], ['a', 'b', 'c'])), ['equal', 'equal', 'insert']);
  assert.deepEqual(types(myersDiff(['b', 'c'], ['a', 'b', 'c'])), ['insert', 'equal', 'equal']);
  assert.deepEqual(types(myersDiff(['a', 'c'], ['a', 'b', 'c'])), ['equal', 'insert', 'equal']);
});
test('myersDiff: pure deletion at end / start / middle', () => {
  assert.deepEqual(types(myersDiff(['a', 'b', 'c'], ['a', 'b'])), ['equal', 'equal', 'delete']);
  assert.deepEqual(types(myersDiff(['a', 'b', 'c'], ['b', 'c'])), ['delete', 'equal', 'equal']);
  assert.deepEqual(types(myersDiff(['a', 'b', 'c'], ['a', 'c'])), ['equal', 'delete', 'equal']);
});
test('myersDiff: Myers paper example ABCABBA -> CBABAC is minimal (D=5, LCS=4)', () => {
  const a = [...'ABCABBA'];
  const b = [...'CBABAC'];
  const ops = myersDiff(a, b);
  assert.deepEqual(types(ops), ['delete', 'delete', 'equal', 'insert', 'equal', 'equal', 'delete', 'equal', 'insert']);
  assert.equal(ops.filter((o) => o.type !== 'equal').length, 5);
  assert.equal(ops.filter((o) => o.type === 'equal').length, 4);
});
test('myersDiff: completely disjoint arrays -> N deletes then M inserts, D=N+M', () => {
  const ops = myersDiff(['a', 'b'], ['x', 'y', 'z']);
  assert.equal(ops.length, 5);
  assert.equal(ops.filter((o) => o.type === 'equal').length, 0);
  assert.equal(ops.filter((o) => o.type === 'delete').length, 2);
  assert.equal(ops.filter((o) => o.type === 'insert').length, 3);
});
test('myersDiff: custom eq function is honoured', () => {
  const ci = (x, y) => x.toLowerCase() === y.toLowerCase();
  assert.deepEqual(types(myersDiff(['A', 'b'], ['a', 'B'], ci)), ['equal', 'equal']);
  assert.deepEqual(types(myersDiff(['A', 'b'], ['a', 'B'])), ['delete', 'delete', 'insert', 'insert']);
});
test('myersDiff: repeated elements (a,a,a vs a,a) deletes exactly one', () => {
  const ops = myersDiff(['a', 'a', 'a'], ['a', 'a']);
  assert.equal(ops.filter((o) => o.type === 'delete').length, 1);
  assert.equal(ops.filter((o) => o.type === 'equal').length, 2);
  assert.equal(ops.filter((o) => o.type === 'insert').length, 0);
});

// ------------------------------------------------------------ diffLines
const ZERO_STATS = { added: 0, removed: 0, changed: 0 };

test('diffLines: identical -> single equal op, zero stats', () => {
  const r = diffLines('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(r.ops, [mk('equal', 0, 0, ['a', 'b', 'c'], ['a', 'b', 'c'])]);
  assert.deepEqual(r.stats, ZERO_STATS);
});
test('diffLines: both empty -> no ops', () => {
  assert.deepEqual(diffLines('', ''), { ops: [], stats: ZERO_STATS });
  assert.deepEqual(diffLines(null, undefined), { ops: [], stats: ZERO_STATS });
});
test('diffLines: pure insertion in the middle', () => {
  const r = diffLines('a\nc', 'a\nb\nc');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['a'], ['a']),
    mk('insert', 1, 1, [], ['b']),
    mk('equal', 1, 2, ['c'], ['c']),
  ]);
  assert.deepEqual(r.stats, { added: 1, removed: 0, changed: 0 });
});
test('diffLines: pure deletion in the middle', () => {
  const r = diffLines('a\nb\nc', 'a\nc');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['a'], ['a']),
    mk('delete', 1, 1, ['b'], []),
    mk('equal', 2, 1, ['c'], ['c']),
  ]);
  assert.deepEqual(r.stats, { added: 0, removed: 1, changed: 0 });
});
test('diffLines: HAND-PINNED full op list - replacement with common prefix + suffix', () => {
  // a: [head, one, two, tail]   b: [head, 1, 2, 3, tail]
  // equal(head) ; replace(one,two -> 1,2,3) ; equal(tail)
  const r = diffLines('head\none\ntwo\ntail', 'head\n1\n2\n3\ntail');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['head'], ['head']),
    mk('replace', 1, 1, ['one', 'two'], ['1', '2', '3']),
    mk('equal', 3, 4, ['tail'], ['tail']),
  ]);
  // 2 paired -> changed 2; 1 extra b line -> added 1
  assert.deepEqual(r.stats, { added: 1, removed: 0, changed: 2 });
});
test('diffLines: replace with more deletes than inserts counts the surplus as removed', () => {
  const r = diffLines('x\na\nb\nc\ny', 'x\nZ\ny');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['x'], ['x']),
    mk('replace', 1, 1, ['a', 'b', 'c'], ['Z']),
    mk('equal', 4, 2, ['y'], ['y']),
  ]);
  assert.deepEqual(r.stats, { added: 0, removed: 2, changed: 1 });
});
test('diffLines: empty -> non-empty is one insert; non-empty -> empty is one delete', () => {
  assert.deepEqual(diffLines('', 'a\nb'), {
    ops: [mk('insert', 0, 0, [], ['a', 'b'])], stats: { added: 2, removed: 0, changed: 0 },
  });
  assert.deepEqual(diffLines('a\nb', ''), {
    ops: [mk('delete', 0, 0, ['a', 'b'], [])], stats: { added: 0, removed: 2, changed: 0 },
  });
});
test('diffLines: CRLF vs LF vs CR normalize to all-equal', () => {
  const r = diffLines('a\r\nb\r\nc', 'a\nb\nc');
  assert.deepEqual(r.ops, [mk('equal', 0, 0, ['a', 'b', 'c'], ['a', 'b', 'c'])]);
  assert.deepEqual(diffLines('a\rb', 'a\nb').stats, ZERO_STATS);
});
test('diffLines: trailing newline yields a final empty line (pinned)', () => {
  const r = diffLines('a\nb', 'a\nb\n');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['a', 'b'], ['a', 'b']),
    mk('insert', 2, 2, [], ['']),
  ]);
  assert.deepEqual(r.stats, { added: 1, removed: 0, changed: 0 });
  // and the reverse
  assert.deepEqual(diffLines('a\nb\n', 'a\nb').ops, [
    mk('equal', 0, 0, ['a', 'b'], ['a', 'b']),
    mk('delete', 2, 2, [''], []),
  ]);
});
test('diffLines: aStart/bStart track positions in the original arrays', () => {
  const r = diffLines('1\n2\n3\n4\n5', '1\nA\n3\nB\n5');
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['1'], ['1']),
    mk('replace', 1, 1, ['2'], ['A']),
    mk('equal', 2, 2, ['3'], ['3']),
    mk('replace', 3, 3, ['4'], ['B']),
    mk('equal', 4, 4, ['5'], ['5']),
  ]);
  assert.deepEqual(r.stats, { added: 0, removed: 0, changed: 2 });
});
test('diffLines: totally different -> one replace', () => {
  const r = diffLines('a\nb', 'x\ny\nz');
  assert.deepEqual(r.ops, [mk('replace', 0, 0, ['a', 'b'], ['x', 'y', 'z'])]);
  assert.deepEqual(r.stats, { added: 1, removed: 0, changed: 2 });
});
test('diffLines: no two adjacent ops share a type (coalesced)', () => {
  const r = diffLines('a\nb\nc\nd\ne\nf', 'a\nX\nY\nd\nZ\nf');
  for (let i = 1; i < r.ops.length; i++) assert.notEqual(r.ops[i].type, r.ops[i - 1].type);
});

// ------------------------------------------------------------ options (diffLines)
test('diffLines ignoreCase: equal by key, ops carry ORIGINAL text of each side', () => {
  const r = diffLines('Hello\nWORLD', 'hello\nworld', { ignoreCase: true });
  assert.deepEqual(r.ops, [mk('equal', 0, 0, ['Hello', 'WORLD'], ['hello', 'world'])]);
  assert.deepEqual(r.stats, ZERO_STATS);
  // without the option they differ
  assert.deepEqual(types(diffLines('Hello', 'hello').ops), ['replace']);
});
test('diffLines ignoreAllWhitespace: spacing differences are equal; original text kept', () => {
  const r = diffLines('a  b\n c d', 'ab\nc\td', { ignoreAllWhitespace: true });
  assert.deepEqual(r.ops, [mk('equal', 0, 0, ['a  b', ' c d'], ['ab', 'c\td'])]);
  assert.deepEqual(types(diffLines('a  b', 'ab').ops), ['replace']);
});
test('diffLines ignoreLeadingTrailingWhitespace: edge ws ignored, interior ws still differs', () => {
  const eq = diffLines('  a b  \nc', 'a b\n\tc', { ignoreLeadingTrailingWhitespace: true });
  assert.deepEqual(eq.ops, [mk('equal', 0, 0, ['  a b  ', 'c'], ['a b', '\tc'])]);
  const ne = diffLines('a  b', 'a b', { ignoreLeadingTrailingWhitespace: true });
  assert.deepEqual(ne.ops, [mk('replace', 0, 0, ['a  b'], ['a b'])]);
});
test('diffLines options: a real change is still reported with original (un-normalized) text', () => {
  const r = diffLines('Keep\nOLD', 'keep\nNew', { ignoreCase: true });
  assert.deepEqual(r.ops, [
    mk('equal', 0, 0, ['Keep'], ['keep']),
    mk('replace', 1, 1, ['OLD'], ['New']),
  ]);
});

// ------------------------------------------------------------ tokenizeWords
test('tokenizeWords: empty/null -> []', () => {
  assert.deepEqual(tokenizeWords(''), []);
  assert.deepEqual(tokenizeWords(null), []);
  assert.deepEqual(tokenizeWords(undefined), []);
});
test('tokenizeWords: word runs, whitespace runs, single punctuation chars (pinned)', () => {
  assert.deepEqual(tokenizeWords('foo_1  bar, (baz)'),
    ['foo_1', '  ', 'bar', ',', ' ', '(', 'baz', ')']);
  assert.deepEqual(tokenizeWords('a.b'), ['a', '.', 'b']);
  assert.deepEqual(tokenizeWords('!!'), ['!', '!']);
  assert.deepEqual(tokenizeWords(' \t\n'), [' \t\n']);
});
test('tokenizeWords: lossless over a battery (join === input)', () => {
  const battery = [
    '', 'a', ' ', 'hello world', '  lead', 'trail  ', 'a\tb\nc', 'x=1;y=2', 'snake_case-kebab',
    '<div class="x">', 'héllo wörld', '日本語 text', 'emoji 😀 ok', '\r\n', 'a  b   c',
  ];
  for (const s of battery) assert.equal(tokenizeWords(s).join(''), s, JSON.stringify(s));
});

// ------------------------------------------------------------ diffWords
const joinSide = (segs, side) => segs
  .filter((s) => s.type === 'equal' || s.type === side).map((s) => s.text).join('');

test('diffWords: identical -> one equal segment; both empty -> []', () => {
  assert.deepEqual(diffWords('foo bar', 'foo bar'), [{ type: 'equal', text: 'foo bar' }]);
  assert.deepEqual(diffWords('', ''), []);
});
test('diffWords: empty <-> non-empty', () => {
  assert.deepEqual(diffWords('', 'hi there'), [{ type: 'insert', text: 'hi there' }]);
  assert.deepEqual(diffWords('hi there', ''), [{ type: 'delete', text: 'hi there' }]);
});
test('diffWords: HAND-PINNED intra-line edit - one word replaced, tail extended', () => {
  // tokens a: [foo,' ',bar]  b: [foo,' ',baz,' ',qux]
  assert.deepEqual(diffWords('foo bar', 'foo baz qux'), [
    { type: 'equal', text: 'foo ' },
    { type: 'delete', text: 'bar' },
    { type: 'insert', text: 'baz qux' },
  ]);
});
test('diffWords: single word change inside a sentence', () => {
  assert.deepEqual(diffWords('the quick fox', 'the slow fox'), [
    { type: 'equal', text: 'the ' },
    { type: 'delete', text: 'quick' },
    { type: 'insert', text: 'slow' },
    { type: 'equal', text: ' fox' },
  ]);
});
test('diffWords: punctuation is its own token', () => {
  assert.deepEqual(diffWords('hello, world', 'hello! world'), [
    { type: 'equal', text: 'hello' },
    { type: 'delete', text: ',' },
    { type: 'insert', text: '!' },
    { type: 'equal', text: ' world' },
  ]);
});
test('diffWords: whitespace runs are single tokens (changing run width replaces it)', () => {
  assert.deepEqual(diffWords('a  b', 'a b'), [
    { type: 'equal', text: 'a' },
    { type: 'delete', text: '  ' },
    { type: 'insert', text: ' ' },
    { type: 'equal', text: 'b' },
  ]);
});
test('diffWords: pure insertion / deletion of a word', () => {
  assert.deepEqual(diffWords('a c', 'a b c'), [
    { type: 'equal', text: 'a ' },
    { type: 'insert', text: 'b ' },
    { type: 'equal', text: 'c' },
  ]);
  assert.deepEqual(diffWords('a b c', 'a c'), [
    { type: 'equal', text: 'a ' },
    { type: 'delete', text: 'b ' },
    { type: 'equal', text: 'c' },
  ]);
});
test('diffWords: adjacent same-type segments are coalesced and sides reconstruct (battery)', () => {
  const pairs = [
    ['foo bar', 'foo baz qux'], ['the quick brown fox', 'a quick red fox jumps'],
    ['x = 1;', 'x = 2; y = 3;'], ['', 'new'], ['gone', ''], ['same', 'same'],
    ['a  b', 'a b'], ['f(a, b)', 'f(a,b,c)'], ['日本 語', '日本 text'],
  ];
  for (const [a, b] of pairs) {
    const segs = diffWords(a, b);
    for (let i = 1; i < segs.length; i++) {
      assert.notEqual(segs[i].type, segs[i - 1].type, `adjacent same type in ${JSON.stringify([a, b])}`);
    }
    assert.equal(joinSide(segs, 'delete'), a, `a side of ${JSON.stringify([a, b])}`);
    assert.equal(joinSide(segs, 'insert'), b, `b side of ${JSON.stringify([a, b])}`);
  }
});

// ------------------------------------------------------------ toUnifiedDiff
test('toUnifiedDiff: no change -> empty string (also for empty/empty and with context 0)', () => {
  assert.equal(toUnifiedDiff('a\nb', 'a\nb'), '');
  assert.equal(toUnifiedDiff('', ''), '');
  assert.equal(toUnifiedDiff('a\nb', 'a\nb', {}, { context: 0 }), '');
});
test('toUnifiedDiff: EXACT single hunk (default context 3, whole file within context)', () => {
  assert.equal(
    toUnifiedDiff('one\ntwo\nthree', 'one\n2\nthree'),
    [
      '--- a',
      '+++ b',
      '@@ -1,3 +1,3 @@',
      ' one',
      '-two',
      '+2',
      ' three',
    ].join('\n'),
  );
});
test('toUnifiedDiff: EXACT custom aName / bName', () => {
  assert.equal(
    toUnifiedDiff('x', 'y', {}, { aName: 'old.txt', bName: 'new.txt' }),
    ['--- old.txt', '+++ new.txt', '@@ -1,1 +1,1 @@', '-x', '+y'].join('\n'),
  );
});
test('toUnifiedDiff: EXACT pure insert into empty (a-start 0, a-count 0)', () => {
  assert.equal(
    toUnifiedDiff('', 'a\nb'),
    ['--- a', '+++ b', '@@ -0,0 +1,2 @@', '+a', '+b'].join('\n'),
  );
});
test('toUnifiedDiff: EXACT pure delete to empty (b-start 0, b-count 0)', () => {
  assert.equal(
    toUnifiedDiff('a\nb', ''),
    ['--- a', '+++ b', '@@ -1,2 +0,0 @@', '-a', '-b'].join('\n'),
  );
});

const TEN_A = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
const TEN_B = 'a\nB\nc\nd\ne\nf\ng\nh\nI\nj';

test('toUnifiedDiff: EXACT two hunks with context 1', () => {
  assert.equal(
    toUnifiedDiff(TEN_A, TEN_B, {}, { context: 1 }),
    [
      '--- a', '+++ b',
      '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c',
      '@@ -8,3 +8,3 @@', ' h', '-i', '+I', ' j',
    ].join('\n'),
  );
});
test('toUnifiedDiff: EXACT context 0 -> bare change hunks', () => {
  assert.equal(
    toUnifiedDiff(TEN_A, TEN_B, {}, { context: 0 }),
    [
      '--- a', '+++ b',
      '@@ -2,1 +2,1 @@', '-b', '+B',
      '@@ -9,1 +9,1 @@', '-i', '+I',
    ].join('\n'),
  );
});
test('toUnifiedDiff: EXACT larger context (3) merges the two changes into one hunk', () => {
  // changed rows at flat indexes 1..2 and 9..10; gap 9-2=7 <= 2*3+1 -> merged
  assert.equal(
    toUnifiedDiff(TEN_A, TEN_B, {}, { context: 3 }),
    [
      '--- a', '+++ b',
      '@@ -1,10 +1,10 @@',
      ' a', '-b', '+B', ' c', ' d', ' e', ' f', ' g', ' h', '-i', '+I', ' j',
    ].join('\n'),
  );
});
test('toUnifiedDiff: default context equals 3', () => {
  assert.equal(toUnifiedDiff(TEN_A, TEN_B), toUnifiedDiff(TEN_A, TEN_B, {}, { context: 3 }));
});
test('toUnifiedDiff: merge boundary - gap of exactly 2*context equal lines merges; 2*context+1 splits', () => {
  // Changes at lines 2 and 5 with 2 equal lines between (c,d): context 1 -> 2 <= 2*1 -> merged
  const a = 'a\nb\nc\nd\ne\nf';
  const merged = toUnifiedDiff(a, 'a\nB\nc\nd\nE\nf', {}, { context: 1 });
  assert.equal(merged, [
    '--- a', '+++ b', '@@ -1,6 +1,6 @@',
    ' a', '-b', '+B', ' c', ' d', '-e', '+E', ' f',
  ].join('\n'));
  // Three equal lines between (c,d,e): context 1 -> 3 > 2 -> two hunks
  const split = toUnifiedDiff('a\nb\nc\nd\ne\nf\ng', 'a\nB\nc\nd\ne\nF\ng', {}, { context: 1 });
  assert.equal(split, [
    '--- a', '+++ b',
    '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c',
    '@@ -5,3 +5,3 @@', ' e', '-f', '+F', ' g',
  ].join('\n'));
});
test('toUnifiedDiff: EXACT hunk with uneven counts (insert shifts b numbering)', () => {
  // a: 1..6 ; b inserts X after 1 and removes 6 -> second hunk numbers must reflect the offset
  assert.equal(
    toUnifiedDiff('1\n2\n3\n4\n5\n6', '1\nX\n2\n3\n4\n5', {}, { context: 1 }),
    [
      '--- a', '+++ b',
      '@@ -1,2 +1,3 @@', ' 1', '+X', ' 2',
      '@@ -5,2 +6,1 @@', ' 5', '-6',
    ].join('\n'),
  );
});
test('toUnifiedDiff: negative / fractional context coerced (negative -> 0, 1.9 -> 1)', () => {
  assert.equal(toUnifiedDiff(TEN_A, TEN_B, {}, { context: -5 }), toUnifiedDiff(TEN_A, TEN_B, {}, { context: 0 }));
  assert.equal(toUnifiedDiff(TEN_A, TEN_B, {}, { context: 1.9 }), toUnifiedDiff(TEN_A, TEN_B, {}, { context: 1 }));
});
test('toUnifiedDiff: CRLF-only difference -> empty; trailing newline add -> exact', () => {
  assert.equal(toUnifiedDiff('a\r\nb', 'a\nb'), '');
  assert.equal(
    toUnifiedDiff('a', 'a\n'),
    ['--- a', '+++ b', '@@ -1,1 +1,2 @@', ' a', '+'].join('\n'),
  );
});
test('toUnifiedDiff: opts (ignoreCase) passed through; context lines show ORIGINAL a-side text', () => {
  assert.equal(toUnifiedDiff('Hello\nx', 'hello\ny', { ignoreCase: true }),
    ['--- a', '+++ b', '@@ -1,2 +1,2 @@', ' Hello', '-x', '+y'].join('\n'));
  assert.equal(toUnifiedDiff('Hello', 'hello', { ignoreCase: true }), '');
});

// ------------------------------------------------------------ reconstruct property (SUPPLEMENT)
const PAIRS = [
  ['', ''], ['', 'a'], ['a', ''], ['a', 'a'], ['a', 'b'], ['a\nb\nc', 'a\nx\nc'],
  ['a\nb\nc', 'c\nb\na'], ['a\nb', 'a\nb\nc\nd'], ['a\nb\nc\nd', 'c\nd'],
  ['a\na\na', 'a\na'], ['a\na', 'a\na\na\na'], ['x\ny\nz', 'p\nq'],
  ['a\nb\nc\nd\ne', 'a\nc\ne'], ['a\nc\ne', 'a\nb\nc\nd\ne'],
  ['line1\nline2\nline3\n', 'line1\nLINE2\nline3\nline4\n'],
  ['one\r\ntwo\r\n', 'one\ntwo\nthree\n'], ['\n\n\n', '\n'], ['', '\n'],
  ['A\nB\nC\nA\nB\nB\nA', 'C\nB\nA\nB\nA\nC'], [TEN_A, TEN_B],
  ['the\nquick\nbrown\nfox', 'the\nslow\nbrown\ndog\nruns'],
  ['héllo\n日本語\n😀', 'héllo\n日本\n😀\nnew'],
];

function applyLineOps(ops) {
  const out = [];
  for (const op of ops) {
    if (op.type === 'equal') out.push(...op.bLines);
    else out.push(...op.bLines); // delete: [] ; insert/replace: bLines
  }
  return out;
}

test('reconstruct: line ops rebuild `after` AND `before` over the fixed battery', () => {
  for (const [before, after] of PAIRS) {
    const { ops } = diffLines(before, after);
    assert.deepEqual(applyLineOps(ops), splitLines(after), `after of ${JSON.stringify([before, after])}`);
    const aSide = ops.flatMap((o) => o.aLines);
    assert.deepEqual(aSide, splitLines(before), `before of ${JSON.stringify([before, after])}`);
    // positions are consistent running offsets
    let ai = 0; let bi = 0;
    for (const op of ops) {
      assert.equal(op.aStart, ai); assert.equal(op.bStart, bi);
      ai += op.aLines.length; bi += op.bLines.length;
    }
  }
});
test('reconstruct: raw myersDiff op script rebuilds `after` and is minimal vs LCS (battery)', () => {
  const lcs = (a, b) => {
    const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
      }
    }
    return t[a.length][b.length];
  };
  for (const [before, after] of PAIRS) {
    const a = splitLines(before);
    const b = splitLines(after);
    const ops = myersDiff(a, b);
    const out = []; let ai = 0; let bi = 0;
    for (const op of ops) {
      if (op.type === 'equal') { assert.equal(a[ai], b[bi]); out.push(b[bi]); ai++; bi++; }
      else if (op.type === 'delete') ai++;
      else { out.push(b[bi]); bi++; }
    }
    assert.equal(ai, a.length); assert.equal(bi, b.length);
    assert.deepEqual(out, b);
    assert.equal(ops.filter((o) => o.type === 'equal').length, lcs(a, b),
      `LCS-optimal for ${JSON.stringify([before, after])}`);
  }
});
function applyUnified(before, after, context) {
  const diff = toUnifiedDiff(before, after, {}, { context });
  const a = splitLines(before);
  if (diff === '') return a;
  const out = []; let ai = 0;
  for (const l of diff.split('\n').slice(2)) {
    const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(l);
    if (m) {
      // standard rule: a zero-count range's start is the line BEFORE the hunk
      const target = m[2] === '0' ? Number(m[1]) : Number(m[1]) - 1;
      while (ai < target) out.push(a[ai++]);
    } else if (l[0] === ' ') out.push(a[ai++]);
    else if (l[0] === '-') ai++;
    else out.push(l.slice(1));
  }
  while (ai < a.length) out.push(a[ai++]);
  return out;
}
test('reconstruct: applying a unified diff to `before` yields `after` (battery, context 1 and 3)', () => {
  for (const [before, after] of PAIRS) {
    for (const context of [1, 3]) {
      assert.deepEqual(applyUnified(before, after, context), splitLines(after),
        `ctx ${context} ${JSON.stringify([before, after])}`);
    }
  }
});
// FIXED under #1014-H: with context 0, a zero-count side (pure insert/delete) is now headed with the
// line BEFORE the hunk (GNU diff -U0 / patch convention), e.g. `-1,0 +2,2`, instead of a bare `-0,0`.
test('reconstruct: unified diff context 0 applies correctly (battery) [#1014-H]', () => {
  for (const [before, after] of PAIRS) {
    assert.deepEqual(applyUnified(before, after, 0), splitLines(after), JSON.stringify([before, after]));
  }
});
test('toUnifiedDiff: context 0 pure insert mid-file header per standard (-1,0 +2,2) [#1014-H]', () => {
  assert.equal(
    toUnifiedDiff('a\nb\nc', 'a\nX\nY\nb\nc', {}, { context: 0 }),
    ['--- a', '+++ b', '@@ -1,0 +2,2 @@', '+X', '+Y'].join('\n'),
  );
});
test('reconstruct: word segments rebuild both sides (battery of lines)', () => {
  for (const [before, after] of PAIRS) {
    const segs = diffWords(before, after);
    assert.equal(joinSide(segs, 'delete'), before);
    assert.equal(joinSide(segs, 'insert'), after);
  }
});
