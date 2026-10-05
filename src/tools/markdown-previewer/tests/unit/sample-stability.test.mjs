// Unit tests for SAMPLE_MARKDOWN rendering and output stability/determinism.
// Dev/test-only. Imports source/logic.mjs directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml, SAMPLE_MARKDOWN } from '../../source/logic.mjs';

test('SAMPLE_MARKDOWN is a non-empty string', () => {
  assert.equal(typeof SAMPLE_MARKDOWN, 'string');
  assert.ok(SAMPLE_MARKDOWN.length > 100);
});

test('SAMPLE_MARKDOWN renders without throwing and produces HTML', () => {
  let html;
  assert.doesNotThrow(() => { html = mdToHtml(SAMPLE_MARKDOWN); });
  assert.ok(html.length > 0);
});

test('SAMPLE_MARKDOWN exercises many constructs at once', () => {
  const html = mdToHtml(SAMPLE_MARKDOWN);
  assert.ok(html.includes('<h1>'), 'has an h1');
  assert.ok(html.includes('<h2>'), 'has an h2');
  assert.ok(html.includes('<strong>'), 'has bold');
  assert.ok(html.includes('<em>'), 'has italic');
  assert.ok(html.includes('<del>'), 'has strikethrough');
  assert.ok(html.includes('<code>'), 'has an inline code span');
  assert.ok(html.includes('<pre><code class="language-js">'), 'has a fenced code block with lang');
  assert.ok(html.includes('<ul>'), 'has an unordered list');
  assert.ok(html.includes('<ol>'), 'has an ordered list');
  assert.ok(html.includes('contains-task-list'), 'has a task list');
  assert.ok(html.includes('<input type="checkbox" disabled checked>'), 'has a checked task');
  assert.ok(html.includes('<blockquote>'), 'has a blockquote');
  assert.ok(html.includes('<table>'), 'has a table');
  assert.ok(html.includes('text-align:'), 'has table alignment');
  assert.ok(html.includes('<hr>'), 'has a horizontal rule');
  assert.ok(html.includes('<a href="https://example.com"'), 'has a link');
  assert.ok(html.includes('<br>'), 'has a hard break');
});

test('the sample keeps its <script> example inert', () => {
  const html = mdToHtml(SAMPLE_MARKDOWN);
  assert.ok(!/<script/i.test(html), 'the demonstrated script tag is escaped, not live');
  assert.ok(html.includes('&lt;script&gt;'), 'shown as escaped text');
});

test('output is deterministic — same input yields byte-identical HTML', () => {
  const a = mdToHtml(SAMPLE_MARKDOWN);
  const b = mdToHtml(SAMPLE_MARKDOWN);
  assert.equal(a, b);
});

test('a representative fixture renders identically across repeated calls', () => {
  const md = [
    '# Title',
    '',
    'A paragraph with **bold**, *italic*, and `code`.',
    '',
    '- item one',
    '- item two',
    '',
    '| A | B |',
    '| :- | -: |',
    '| 1 | 2 |',
  ].join('\n');
  const first = mdToHtml(md);
  for (let i = 0; i < 5; i++) {
    assert.equal(mdToHtml(md), first, 'render must be stable across calls');
  }
});

test('the private placeholder sentinel (U+E000) is stripped from input', () => {
  // mdToHtml strips U+E000 so a user cannot smuggle a placeholder that would
  // splice raw HTML back in during token restoration.
  const SENT = String.fromCharCode(0xe000);
  const html = mdToHtml('a' + SENT + '0' + SENT + 'b **x**');
  assert.ok(!html.includes(SENT), 'no raw sentinel survives');
  assert.ok(html.includes('<strong>x</strong>'), 'normal parsing still works');
});
