// Unit tests for inline constructs — parseInline plus the inline paths of
// mdToHtml (emphasis, code spans, links/images, autolinks, escapes).
// Dev/test-only. Imports source/logic.mjs directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml, parseInline } from '../../source/logic.mjs';

// Small helper: strip the single wrapping <p>…</p>\n that mdToHtml adds around a
// one-paragraph document, so the tests read as inline assertions.
function inline(md) {
  const html = mdToHtml(md);
  const m = html.match(/^<p>([\s\S]*)<\/p>\n$/);
  return m ? m[1] : html;
}

// ---- emphasis --------------------------------------------------------------
test('bold with ** and __', () => {
  assert.equal(inline('**b** and __b2__'), '<strong>b</strong> and <strong>b2</strong>');
});

test('italic with * and _', () => {
  assert.equal(inline('*i* and _i2_'), '<em>i</em> and <em>i2</em>');
});

test('bold+italic with ***', () => {
  assert.equal(inline('***bi***'), '<strong><em>bi</em></strong>');
});

test('strikethrough with ~~', () => {
  assert.equal(inline('~~gone~~'), '<del>gone</del>');
});

test('intra-word underscores are not emphasis', () => {
  assert.equal(inline('a_b_c'), 'a_b_c');
  assert.equal(inline('snake_case_name'), 'snake_case_name');
});

// ---- inline code -----------------------------------------------------------
test('single-backtick code span', () => {
  assert.equal(inline('`x = 1`'), '<code>x = 1</code>');
});

test('multi-backtick span can contain a backtick', () => {
  assert.equal(inline('``a`b``'), '<code>a`b</code>');
});

test('code span content is escaped and never emphasized', () => {
  assert.equal(inline('`<b>*not*</b>`'), '<code>&lt;b&gt;*not*&lt;/b&gt;</code>');
});

test('a single surrounding space in a code span is stripped', () => {
  assert.equal(inline('` a `'), '<code>a</code>');
});

// ---- links -----------------------------------------------------------------
test('inline link with title', () => {
  assert.equal(inline('[t](http://e.com "ti")'), '<a href="http://e.com" title="ti">t</a>');
});

test('inline link without title', () => {
  assert.equal(inline('[t](http://e.com)'), '<a href="http://e.com">t</a>');
});

test('link text is itself inline-parsed', () => {
  assert.equal(inline('[**bold**](http://e.com)'), '<a href="http://e.com"><strong>bold</strong></a>');
});

test('reference link resolves against a definition', () => {
  assert.equal(
    mdToHtml('[t][r]\n\n[r]: http://e.com "ti"'),
    '<p><a href="http://e.com" title="ti">t</a></p>\n'
  );
});

test('collapsed reference link [r][]', () => {
  assert.equal(mdToHtml('[r][]\n\n[r]: http://e.com'), '<p><a href="http://e.com">r</a></p>\n');
});

test('shortcut reference link [r]', () => {
  assert.equal(mdToHtml('[r]\n\n[r]: http://e.com'), '<p><a href="http://e.com">r</a></p>\n');
});

test('reference keys are case-insensitive and whitespace-normalized', () => {
  assert.equal(
    mdToHtml('[Click Me][My Ref]\n\n[my   ref]: http://e.com'),
    '<p><a href="http://e.com">Click Me</a></p>\n'
  );
});

test('an unresolved reference link is left as literal text', () => {
  assert.equal(mdToHtml('[nope][missing]'), '<p>[nope][missing]</p>\n');
});

// ---- images ----------------------------------------------------------------
test('inline image with alt and title', () => {
  assert.equal(
    inline('![alt text](http://e.com/i.png "ti")'),
    '<img src="http://e.com/i.png" alt="alt text" title="ti">'
  );
});

test('reference image', () => {
  assert.equal(
    mdToHtml('![alt][img]\n\n[img]: http://e.com/i.png'),
    '<p><img src="http://e.com/i.png" alt="alt"></p>\n'
  );
});

// ---- autolinks / emails ----------------------------------------------------
test('URL autolink', () => {
  assert.equal(inline('<http://e.com>'), '<a href="http://e.com">http://e.com</a>');
});

test('email autolink gets a mailto:', () => {
  assert.equal(inline('<a@b.com>'), '<a href="mailto:a@b.com">a@b.com</a>');
});

test('a bare < that is not an autolink is escaped', () => {
  assert.equal(inline('a < b'), 'a &lt; b');
});

// ---- backslash escapes -----------------------------------------------------
test('backslash escapes ASCII punctuation', () => {
  assert.equal(inline('a\\*b'), 'a*b');
  assert.equal(inline('\\[not a link\\]'), '[not a link]');
  assert.equal(inline('\\`not code\\`'), '`not code`');
});

test('a backslash before a non-punctuation char is literal', () => {
  assert.equal(inline('a\\b'), 'a\\b');
});

// ---- parseInline directly --------------------------------------------------
test('parseInline handles a mix of constructs', () => {
  assert.equal(
    parseInline('**b** `c` [t](http://e.com)', {}),
    '<strong>b</strong> <code>c</code> <a href="http://e.com">t</a>'
  );
});

test('parseInline resolves references from the passed refs map', () => {
  assert.equal(
    parseInline('[t][r]', { r: { url: 'http://e.com', title: '' } }),
    '<a href="http://e.com">t</a>'
  );
});

test('parseInline works with no refs argument', () => {
  assert.equal(parseInline('plain **text**'), 'plain <strong>text</strong>');
});
