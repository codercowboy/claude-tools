// Unit tests for the XSS / HTML-safety stance (DESIGN.md § "HTML safety").
// The parser escapes ALL raw HTML and neutralizes dangerous URLs, so nothing a
// user pastes can execute in the preview. Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml, parseInline } from '../../source/logic.mjs';

test('a pasted <script> tag renders as inert, escaped text (no live tag)', () => {
  const html = mdToHtml('<script>alert(1)</script>');
  assert.equal(html, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
  assert.ok(!/<script/i.test(html), 'no live <script> tag in output');
});

test('an <img onerror> payload is escaped, no live onerror handler', () => {
  const html = mdToHtml('<img src=x onerror=alert(1)>');
  assert.ok(!/onerror=/i.test(stripEscaped(html)), 'no live onerror handler');
  assert.ok(!/<img/i.test(html), 'no live <img> tag from raw HTML');
  assert.ok(html.includes('&lt;img'), 'the raw <img> is escaped to text');
});

// Only inspect the part of the string OUTSIDE escaped entities: after escaping,
// the text "onerror=" may appear as literal characters inside &lt;…&gt;, which is
// inert. This helper removes escaped-angle-bracket regions so a genuine live
// attribute would still be caught.
function stripEscaped(html) {
  return html.replace(/&lt;[\s\S]*?&gt;/g, '');
}

test('a javascript: link is neutralized to an empty href', () => {
  const html = mdToHtml('[click](javascript:alert(1))');
  assert.equal(html, '<p><a href="">click</a></p>\n');
  assert.ok(!/javascript:/i.test(html), 'no javascript: scheme survives');
});

test('an entity-encoded javascript: link is neutralized', () => {
  const html = mdToHtml('[x](javascript&#58;alert(1))');
  assert.equal(html, '<p><a href="">x</a></p>\n');
});

test('a vbscript: link is neutralized', () => {
  const html = mdToHtml('[x](vbscript:msgbox(1))');
  assert.equal(html, '<p><a href="">x</a></p>\n');
});

test('a data: link (non-image) is neutralized', () => {
  const html = mdToHtml('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(!/data:text\/html/i.test(html), 'data:text/html not allowed for links');
  assert.ok(html.includes('<a href="">'), 'href neutralized');
});

test('a data:image/* source IS allowed for images', () => {
  // data-image rendering is opt-in in the shared CtMarkdown (#1014-F); the app passes allowImage:true.
  const html = mdToHtml('![x](data:image/png;base64,AAAA)', { allowImage: true });
  assert.equal(html, '<p><img src="data:image/png;base64,AAAA" alt="x"></p>\n');
});

test('a non-image data: source is neutralized for images', () => {
  const html = mdToHtml('![x](data:text/html,hi)');
  assert.equal(html, '<p><img src="" alt="x"></p>\n');
});

test('an autolink to a javascript: URL is neutralized', () => {
  const html = parseInline('<javascript:alert(1)>', {});
  assert.ok(!/href="javascript:/i.test(html), 'autolink href neutralized');
  assert.ok(html.includes('href=""'), 'href empty');
});

test('image alt text with a quote cannot break out of the attribute', () => {
  const html = mdToHtml('![" onerror="alert(1)](http://e.com/i.png)');
  assert.ok(!/onerror="alert/.test(html), 'alt attribute cannot be broken out of');
  assert.ok(html.includes('&quot;'), 'the quote is escaped');
});

test('a link title with a quote is attribute-escaped', () => {
  const html = mdToHtml('[t](http://e.com "a\\" onmouseover=x")');
  // The embedded quote must be escaped, so no raw quote can close the title
  // early and start a new attribute.
  assert.ok(html.includes('&quot;'), 'the embedded quote is escaped');
  assert.ok(!html.includes('" onmouseover'), 'title cannot break out into a new attribute');
});

test('output for a mixed raw-HTML paste contains no executable markup', () => {
  const md = [
    'Normal **text**.',
    '',
    '<script>steal()</script>',
    '',
    '<a href="javascript:alert(1)">bad</a>',
    '',
    '[ok](https://safe.example)',
  ].join('\n');
  const html = mdToHtml(md);
  assert.ok(!/<script/i.test(html), 'no <script>');
  // The raw <a href="javascript:…"> is escaped to inert text, so the literal
  // string survives harmlessly inside &lt;…&gt;. Only a LIVE href (outside an
  // escaped region) would be dangerous — assert none exists.
  assert.ok(!/href="javascript:/i.test(html), 'no live javascript: href');
  assert.ok(html.includes('&lt;a href=&quot;javascript:'), 'the raw anchor is escaped to text');
  // The one legitimate, safe link the parser itself produced survives.
  assert.ok(html.includes('<a href="https://safe.example">ok</a>'));
});
