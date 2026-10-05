// Unit tests for unified-diff generation (source/logic.mjs § toUnifiedDiff):
// the `--- / +++ / @@` format, 1-based hunk ranges, 3-line context, hunk
// merging, the context/name config, and option pass-through. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { toUnifiedDiff } = await loadLogic();

const nlines = (n, prefix = 'l') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join('\n');
const hunkHeaders = (out) => out.split('\n').filter((l) => l.startsWith('@@'));

test('toUnifiedDiff: identical inputs -> empty string (no diff to show)', () => {
  assert.equal(toUnifiedDiff('a\nb\nc', 'a\nb\nc'), '');
});

test('toUnifiedDiff: both empty -> empty string', () => {
  assert.equal(toUnifiedDiff('', ''), '');
});

test('toUnifiedDiff: default names are "a" / "b" in the file header', () => {
  const out = toUnifiedDiff('x', 'y');
  const lines = out.split('\n');
  assert.equal(lines[0], '--- a');
  assert.equal(lines[1], '+++ b');
});

test('toUnifiedDiff: custom aName / bName appear in the header', () => {
  const out = toUnifiedDiff('x', 'y', {}, { aName: 'A', bName: 'B' });
  const lines = out.split('\n');
  assert.equal(lines[0], '--- A');
  assert.equal(lines[1], '+++ B');
});

test('toUnifiedDiff: a single mid-file change renders the canonical hunk', () => {
  const out = toUnifiedDiff('a\nb\nc\nd\ne', 'a\nb\nX\nd\ne', {}, { aName: 'A', bName: 'B' });
  assert.equal(out, [
    '--- A',
    '+++ B',
    '@@ -1,5 +1,5 @@',
    ' a',
    ' b',
    '-c',
    '+X',
    ' d',
    ' e',
  ].join('\n'));
});

test('toUnifiedDiff: hunk header ranges are 1-based line/count for A and B', () => {
  // insert a line: A has 2 lines, B has 3.
  const out = toUnifiedDiff('a\nb', 'a\nNEW\nb');
  const header = hunkHeaders(out)[0];
  assert.equal(header, '@@ -1,2 +1,3 @@');
});

test('toUnifiedDiff: context is capped at 3 lines around a change', () => {
  // Change line 5 of a 10-line file. Only l2..l8 should appear (3 context
  // each side); l1 and l9/l10 fall outside the hunk.
  const a = nlines(10);
  const b = a.replace('l5', 'CHANGED');
  const out = toUnifiedDiff(a, b);
  assert.ok(out.includes(' l2') && out.includes(' l3') && out.includes(' l4'), 'has 3 leading context');
  assert.ok(out.includes(' l6') && out.includes(' l7') && out.includes(' l8'), 'has 3 trailing context');
  assert.ok(!out.split('\n').some((l) => l === ' l1'), 'l1 is outside the 3-line context');
  assert.ok(!out.split('\n').some((l) => l === ' l10'), 'l10 is outside the 3-line context');
  assert.equal(hunkHeaders(out).length, 1);
});

test('toUnifiedDiff: context=0 emits no surrounding context lines', () => {
  const out = toUnifiedDiff('a\nb\nc', 'a\nX\nc', {}, { context: 0 });
  const body = out.split('\n').slice(2); // drop the --- / +++ header
  // Only the @@ header plus the -/+ pair, no ' ' context lines.
  assert.deepEqual(body, ['@@ -2,1 +2,1 @@', '-b', '+X']);
});

test('toUnifiedDiff: two nearby changes merge into a single hunk', () => {
  // Changes at l4 and l6 (gap of 1 line) with default context 3 -> one hunk.
  const a = nlines(10);
  const b = a.replace('l4', 'X4').replace('l6', 'X6');
  const out = toUnifiedDiff(a, b);
  assert.equal(hunkHeaders(out).length, 1, 'nearby changes share one hunk');
});

test('toUnifiedDiff: two far-apart changes produce two separate hunks', () => {
  // Change l1 and l20 in a 20-line file — far beyond 2*context -> two hunks.
  const a = nlines(20);
  const b = a.replace(/^l1$/m, 'X1').replace(/^l20$/m, 'X20');
  const out = toUnifiedDiff(a, b);
  assert.equal(hunkHeaders(out).length, 2, 'distant changes get their own hunks');
});

test('toUnifiedDiff: hunk header counts equal the tagged lines in the hunk', () => {
  const a = nlines(12);
  const b = a.replace('l6', 'X6');
  const out = toUnifiedDiff(a, b);
  const lines = out.split('\n');
  const header = hunkHeaders(out)[0];
  const m = header.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/);
  assert.ok(m, 'header parses');
  const [, , aCount, , bCount] = m.map(Number);
  const hunkBody = lines.slice(lines.indexOf(header) + 1);
  const aLines = hunkBody.filter((l) => l.startsWith(' ') || l.startsWith('-')).length;
  const bLines = hunkBody.filter((l) => l.startsWith(' ') || l.startsWith('+')).length;
  assert.equal(aLines, aCount, 'A count matches context+deleted lines');
  assert.equal(bLines, bCount, 'B count matches context+inserted lines');
});

test('toUnifiedDiff: pure insertion at the top of the file', () => {
  const out = toUnifiedDiff('a\nb', 'NEW\na\nb');
  assert.equal(out, [
    '--- a',
    '+++ b',
    '@@ -1,2 +1,3 @@',
    '+NEW',
    ' a',
    ' b',
  ].join('\n'));
});

test('toUnifiedDiff: pure deletion at the end of the file', () => {
  const out = toUnifiedDiff('a\nb\nc', 'a\nb');
  assert.equal(out, [
    '--- a',
    '+++ b',
    '@@ -1,3 +1,2 @@',
    ' a',
    ' b',
    '-c',
  ].join('\n'));
});

test('toUnifiedDiff: options pass through — ignoreCase makes a case-only change empty', () => {
  // Without the option there IS a diff:
  assert.notEqual(toUnifiedDiff('Hello', 'hello'), '');
  // With ignoreCase the two are equal -> empty unified diff.
  assert.equal(toUnifiedDiff('Hello', 'hello', { ignoreCase: true }), '');
});

test('toUnifiedDiff: options pass through — ignoreAllWhitespace collapses a spacing-only change', () => {
  assert.notEqual(toUnifiedDiff('a  b', 'a b'), '');
  assert.equal(toUnifiedDiff('a  b', 'a b', { ignoreAllWhitespace: true }), '');
});

test('toUnifiedDiff: shown text is the original, not the normalized key', () => {
  // Under ignoreCase, "FOO" vs "bar" differ; the emitted lines keep original text.
  const out = toUnifiedDiff('FOO', 'bar', { ignoreCase: true });
  assert.ok(out.includes('-FOO'));
  assert.ok(out.includes('+bar'));
});
