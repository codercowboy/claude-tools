// Unit tests for the escaping helpers — escapeHtmlForMarkdown / escapeAttrForMarkdown.
// Dev/test-only. Imports source/logic.mjs directly (DOM-free pure logic).
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtmlForMarkdown, escapeAttrForMarkdown } from '../../source/logic.mjs';

test('escapeHtmlForMarkdown escapes &, <, > and double-quote (not single-quote)', () => {
  assert.equal(escapeHtmlForMarkdown('<a> & "b" \'c\''), '&lt;a&gt; &amp; &quot;b&quot; \'c\'');
});

test('escapeHtmlForMarkdown escapes & first so entities are not double-mangled', () => {
  // A literal ampersand followed by a tag must yield &amp; then &lt;.
  assert.equal(escapeHtmlForMarkdown('&<'), '&amp;&lt;');
  assert.equal(escapeHtmlForMarkdown('a & b'), 'a &amp; b');
});

test('escapeHtmlForMarkdown neutralizes a script tag into inert text', () => {
  assert.equal(
    escapeHtmlForMarkdown('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

test('escapeHtmlForMarkdown handles null / undefined as empty string', () => {
  assert.equal(escapeHtmlForMarkdown(null), '');
  assert.equal(escapeHtmlForMarkdown(undefined), '');
});

test('escapeHtmlForMarkdown coerces non-strings', () => {
  assert.equal(escapeHtmlForMarkdown(42), '42');
});

test('escapeAttrForMarkdown additionally escapes single-quote to &#39;', () => {
  assert.equal(escapeAttrForMarkdown('<a> & "b" \'c\''), '&lt;a&gt; &amp; &quot;b&quot; &#39;c&#39;');
});

test('escapeAttrForMarkdown neutralizes an attribute-breakout attempt', () => {
  // A value that tries to close the attribute and add an event handler.
  assert.equal(
    escapeAttrForMarkdown('" onerror="alert(1)'),
    '&quot; onerror=&quot;alert(1)'
  );
});

test('escapeAttrForMarkdown handles null / undefined as empty string', () => {
  assert.equal(escapeAttrForMarkdown(null), '');
  assert.equal(escapeAttrForMarkdown(undefined), '');
});
