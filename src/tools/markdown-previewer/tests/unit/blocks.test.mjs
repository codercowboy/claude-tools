// Unit tests for block constructs — mdToHtml over headings, paragraphs, code
// blocks, blockquotes, lists, tables, and horizontal rules.
// Dev/test-only. Imports source/logic.mjs directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml } from '../../source/logic.mjs';

// ---- headings --------------------------------------------------------------
test('ATX headings h1–h6', () => {
  assert.equal(mdToHtml('# H1'), '<h1>H1</h1>\n');
  assert.equal(mdToHtml('###### H6'), '<h6>H6</h6>\n');
  assert.equal(mdToHtml('# H1\n## H2\n###### H6'), '<h1>H1</h1>\n<h2>H2</h2>\n<h6>H6</h6>\n');
});

test('ATX heading with optional closing hashes', () => {
  assert.equal(mdToHtml('# H1 ###'), '<h1>H1</h1>\n');
});

test('ATX heading content is inline-parsed', () => {
  assert.equal(mdToHtml('# A **bold** title'), '<h1>A <strong>bold</strong> title</h1>\n');
});

test('seven hashes is not a heading', () => {
  assert.equal(mdToHtml('####### nope'), '<p>####### nope</p>\n');
});

test('setext headings: === → h1, --- → h2', () => {
  assert.equal(mdToHtml('Title\n==='), '<h1>Title</h1>\n');
  assert.equal(mdToHtml('Sub\n---'), '<h2>Sub</h2>\n');
});

// ---- paragraphs / hard breaks ----------------------------------------------
test('a paragraph joins soft-wrapped lines', () => {
  assert.equal(mdToHtml('one\ntwo'), '<p>one\ntwo</p>\n');
});

test('two blank-separated paragraphs', () => {
  assert.equal(mdToHtml('one\n\ntwo'), '<p>one</p>\n<p>two</p>\n');
});

test('hard break via two trailing spaces', () => {
  assert.equal(mdToHtml('a  \nb'), '<p>a<br>\nb</p>\n');
});

test('hard break via trailing backslash', () => {
  assert.equal(mdToHtml('a\\\nb'), '<p>a<br>\nb</p>\n');
});

// ---- code blocks -----------------------------------------------------------
test('fenced code block with language class', () => {
  assert.equal(mdToHtml('```js\ncode()\n```'), '<pre><code class="language-js">code()\n</code></pre>\n');
});

test('fenced code block without language', () => {
  assert.equal(mdToHtml('```\nplain\n```'), '<pre><code>plain\n</code></pre>\n');
});

test('tilde fences work like backtick fences', () => {
  assert.equal(mdToHtml('~~~\nx\n~~~'), '<pre><code>x\n</code></pre>\n');
});

test('code block content is escaped and not inline-parsed', () => {
  assert.equal(
    mdToHtml('```\n<b>*x*</b>\n```'),
    '<pre><code>&lt;b&gt;*x*&lt;/b&gt;\n</code></pre>\n'
  );
});

test('indented (4-space) code block', () => {
  assert.equal(mdToHtml('    code line'), '<pre><code>code line\n</code></pre>\n');
});

// ---- blockquotes -----------------------------------------------------------
test('simple blockquote', () => {
  assert.equal(mdToHtml('> quoted'), '<blockquote>\n<p>quoted</p>\n</blockquote>\n');
});

test('nested blockquote (> >)', () => {
  assert.equal(
    mdToHtml('> a\n>\n> > b'),
    '<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>\n'
  );
});

// ---- lists -----------------------------------------------------------------
test('unordered list (tight)', () => {
  assert.equal(mdToHtml('- one\n- two'), '<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n');
});

test('ordered list (tight)', () => {
  assert.equal(mdToHtml('1. one\n2. two'), '<ol>\n<li>one</li>\n<li>two</li>\n</ol>\n');
});

test('ordered list preserves a non-1 start', () => {
  assert.equal(mdToHtml('3. three\n4. four'), '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n');
});

test('nested list by indentation', () => {
  assert.equal(
    mdToHtml('- a\n  - b'),
    '<ul>\n<li>\na\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n'
  );
});

test('loose list wraps items in <p> (blank line between items)', () => {
  assert.equal(mdToHtml('- a\n\n- b'), '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n');
});

test('tight list does not wrap items in <p>', () => {
  const html = mdToHtml('- a\n- b');
  assert.ok(!html.includes('<p>'), 'tight list should not introduce <p>');
});

// ---- task lists ------------------------------------------------------------
test('GitHub task list emits disabled checkboxes and task classes', () => {
  assert.equal(
    mdToHtml('- [x] done\n- [ ] todo'),
    '<ul class="contains-task-list">\n' +
    '<li class="task-list-item"><input type="checkbox" disabled checked> done</li>\n' +
    '<li class="task-list-item"><input type="checkbox" disabled> todo</li>\n' +
    '</ul>\n'
  );
});

test('uppercase [X] is treated as checked', () => {
  const html = mdToHtml('- [X] done');
  assert.ok(html.includes('checked'), 'uppercase X should check the box');
});

// ---- horizontal rules ------------------------------------------------------
test('horizontal rules from ---, ***, ___', () => {
  assert.equal(mdToHtml('---'), '<hr>\n');
  assert.equal(mdToHtml('***'), '<hr>\n');
  assert.equal(mdToHtml('___'), '<hr>\n');
});

// ---- tables ----------------------------------------------------------------
test('pipe table with left/right alignment', () => {
  assert.equal(
    mdToHtml('| A | B |\n| :--- | ---: |\n| 1 | 2 |'),
    '<table>\n<thead>\n<tr>\n' +
    '<th style="text-align:left">A</th>\n' +
    '<th style="text-align:right">B</th>\n' +
    '</tr>\n</thead>\n<tbody>\n<tr>\n' +
    '<td style="text-align:left">1</td>\n' +
    '<td style="text-align:right">2</td>\n' +
    '</tr>\n</tbody>\n</table>\n'
  );
});

test('pipe table center alignment (:-:)', () => {
  const html = mdToHtml('| A |\n| :-: |\n| 1 |');
  assert.ok(html.includes('<th style="text-align:center">A</th>'));
  assert.ok(html.includes('<td style="text-align:center">1</td>'));
});

test('table cells are inline-parsed', () => {
  const html = mdToHtml('| A |\n| --- |\n| **b** |');
  assert.ok(html.includes('<td><strong>b</strong></td>'));
});

test('a column with no alignment marker has no style attribute', () => {
  const html = mdToHtml('| A |\n| --- |\n| 1 |');
  assert.ok(html.includes('<th>A</th>'), 'unaligned header has no inline style');
  assert.ok(html.includes('<td>1</td>'));
});

// ---- empty / whitespace input ----------------------------------------------
test('empty input yields empty string', () => {
  assert.equal(mdToHtml(''), '');
  assert.equal(mdToHtml('   \n  \n'), '');
  assert.equal(mdToHtml(null), '');
  assert.equal(mdToHtml(undefined), '');
});

// ---- CRLF normalization ----------------------------------------------------
test('CRLF line endings are normalized', () => {
  assert.equal(mdToHtml('# H1\r\n\r\npara'), '<h1>H1</h1>\n<p>para</p>\n');
});
