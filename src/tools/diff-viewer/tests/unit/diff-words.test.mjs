// Unit tests for word-level (intra-line) diffing (source/logic.mjs § diffWords).
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { diffWords } = await loadLogic();

// Reconstruct each side from the segment list: equal+delete -> a, equal+insert -> b.
function sides(segs) {
  let a = '';
  let b = '';
  for (const s of segs) {
    if (s.type === 'equal') { a += s.text; b += s.text; }
    else if (s.type === 'delete') { a += s.text; }
    else { b += s.text; }
  }
  return { a, b };
}

test('diffWords: identical strings -> a single equal segment', () => {
  const segs = diffWords('hello world', 'hello world');
  assert.deepEqual(segs.map((s) => s.type), ['equal']);
  assert.equal(segs[0].text, 'hello world');
});

test('diffWords: both empty -> no segments', () => {
  assert.deepEqual(diffWords('', ''), []);
});

test('diffWords: one word replaced within a line', () => {
  const segs = diffWords('the quick fox', 'the slow fox');
  const { a, b } = sides(segs);
  assert.equal(a, 'the quick fox');
  assert.equal(b, 'the slow fox');
  // there is at least one delete and one insert, and "the " / " fox" stay equal.
  assert.ok(segs.some((s) => s.type === 'delete' && s.text.includes('quick')));
  assert.ok(segs.some((s) => s.type === 'insert' && s.text.includes('slow')));
  assert.ok(segs.some((s) => s.type === 'equal' && s.text.includes('the')));
});

test('diffWords: pure insertion of a trailing word', () => {
  const segs = diffWords('a b', 'a b c');
  const { a, b } = sides(segs);
  assert.equal(a, 'a b');
  assert.equal(b, 'a b c');
  assert.equal(segs.filter((s) => s.type === 'delete').length, 0);
  assert.ok(segs.some((s) => s.type === 'insert'));
});

test('diffWords: pure deletion of a word', () => {
  const segs = diffWords('a b c', 'a c');
  const { a, b } = sides(segs);
  assert.equal(a, 'a b c');
  assert.equal(b, 'a c');
  assert.equal(segs.filter((s) => s.type === 'insert').length, 0);
});

test('diffWords: adjacent same-type ops are coalesced into one segment', () => {
  // completely different -> exactly one delete seg then one insert seg (each
  // spanning the whole side), never many tiny same-type runs.
  const segs = diffWords('abc', 'xyz');
  const dels = segs.filter((s) => s.type === 'delete');
  const inss = segs.filter((s) => s.type === 'insert');
  assert.equal(dels.length, 1);
  assert.equal(inss.length, 1);
  assert.equal(dels[0].text, 'abc');
  assert.equal(inss[0].text, 'xyz');
});

test('diffWords: no two consecutive segments share a type (coalescing invariant)', () => {
  const samples = [
    ['the quick brown fox', 'the lazy brown dog'],
    ['a=b+c', 'a = b + c'],
    ['foo(bar, baz)', 'foo(qux, baz, extra)'],
  ];
  for (const [a, b] of samples) {
    const segs = diffWords(a, b);
    for (let i = 1; i < segs.length; i++) {
      assert.notEqual(segs[i].type, segs[i - 1].type, `consecutive same-type in ${a} / ${b}`);
    }
    const r = sides(segs);
    assert.equal(r.a, a);
    assert.equal(r.b, b);
  }
});

test('diffWords: whitespace-only change is captured at token granularity', () => {
  const segs = diffWords('a b', 'a  b');
  const { a, b } = sides(segs);
  assert.equal(a, 'a b');
  assert.equal(b, 'a  b');
  assert.notDeepEqual(segs.map((s) => s.type), ['equal']);
});
