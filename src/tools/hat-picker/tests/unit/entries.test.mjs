// isBlank() / clampText() / isDuplicateText() / removeEntryById() unit
// tests (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHatPicker } from './_helpers.mjs';

const { MAX_LEN, isBlank, clampText, isDuplicateText, removeEntryById } = await loadHatPicker();

test('isBlank() is true for an empty string', () => {
  assert.equal(isBlank(''), true);
});

test('isBlank() is true for whitespace-only text', () => {
  assert.equal(isBlank('   \n\t  '), true);
});

test('isBlank() is false for text with non-whitespace content', () => {
  assert.equal(isBlank('  hi  '), false);
});

test('clampText() trims leading/trailing whitespace', () => {
  assert.equal(clampText('  Alice  '), 'Alice');
});

test('clampText() hard-caps at MAX_LEN characters after trimming', () => {
  const long = 'x'.repeat(MAX_LEN + 50);
  const result = clampText(long);
  assert.equal(result.length, MAX_LEN);
  assert.equal(result, 'x'.repeat(MAX_LEN));
});

test('clampText() leaves text at or under MAX_LEN untouched (besides trimming)', () => {
  const exact = 'y'.repeat(MAX_LEN);
  assert.equal(clampText(exact), exact);
});

test('isDuplicateText() finds an exact-text match in the entry list', () => {
  const entries = [{ id: '1', text: 'Alice' }, { id: '2', text: 'Bob' }];
  assert.equal(isDuplicateText(entries, 'Bob'), true);
});

test('isDuplicateText() is false for text not present in the list', () => {
  const entries = [{ id: '1', text: 'Alice' }];
  assert.equal(isDuplicateText(entries, 'Carol'), false);
});

test('isDuplicateText() is case-sensitive (exact text match only)', () => {
  const entries = [{ id: '1', text: 'Alice' }];
  assert.equal(isDuplicateText(entries, 'alice'), false);
});

test('isDuplicateText() is false against an empty entry list', () => {
  assert.equal(isDuplicateText([], 'Alice'), false);
});

test('removeEntryById() returns a new array without the matching entry', () => {
  const entries = [{ id: '1', text: 'Alice' }, { id: '2', text: 'Bob' }, { id: '3', text: 'Carol' }];
  const result = removeEntryById(entries, '2');
  assert.deepEqual(result, [{ id: '1', text: 'Alice' }, { id: '3', text: 'Carol' }]);
});

test('removeEntryById() does not mutate the input array', () => {
  const entries = [{ id: '1', text: 'Alice' }, { id: '2', text: 'Bob' }];
  const before = JSON.stringify(entries);
  removeEntryById(entries, '1');
  assert.equal(JSON.stringify(entries), before);
});

test('removeEntryById() is a no-op (returns an equivalent array) when the id is not found', () => {
  const entries = [{ id: '1', text: 'Alice' }];
  assert.deepEqual(removeEntryById(entries, 'missing'), entries);
});

test('removeEntryById() on an empty list returns an empty list', () => {
  assert.deepEqual(removeEntryById([], '1'), []);
});
