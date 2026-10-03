// tests/unit/logic.test.mjs — offline `node --test` unit tests for the pure
// engine. They import source/logic.mjs directly (no browser, no build step) —
// the same file the build inlines into the shipped app. See testing.md.
//
// Note the glob in the test:unit script (`node --test tests/unit/*.test.mjs`);
// a bare directory fails on some Node versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform, summarize } from '../../source/logic.mjs';

test('transform reverses text', () => {
  assert.equal(transform('abc'), 'cba');
});

test('transform is a no-op-safe on empty / non-string input', () => {
  assert.equal(transform(''), '');
  assert.equal(transform(undefined), '');
  assert.equal(transform(null), '');
});

test('summarize counts characters and words', () => {
  assert.deepEqual(summarize('hello world'), { chars: 11, words: 2 });
  assert.deepEqual(summarize('  '), { chars: 2, words: 0 });
  assert.deepEqual(summarize(''), { chars: 0, words: 0 });
});
