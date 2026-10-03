// Unit tests for CtMarkdown.mjs — table-driven. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: (1) BLOCK table of {name, md, html} rows asserting the lib's EXACT byte output;
// (2) INLINE table (driving mdToHtml) + direct parseInline spot-checks; (3) SAFETY — explicit
// security assertions (raw HTML always escaped, dangerous URL schemes neutralized, attribute
// escaping) + a sanitizeUrl scheme matrix; (4) escape helpers; (5) edges + determinism.
// Expected strings are what the lib ACTUALLY emits (e.g. a blocked URL yields href="" — the
// attribute is kept but emptied), not a generic CommonMark spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mdToHtml, parseInline, escapeHtmlForMarkdown, escapeAttrForMarkdown, sanitizeUrl,
} from '../../utils/formats/CtMarkdown.mjs';

const run = (rows) => {
  for (const { name, md, html, opts } of rows) {
    test(name, () => assert.equal(mdToHtml(md, opts), html));
  }
};

// ============================================================ 1. BLOCK table
const BLOCK = [
  { name: 'heading levels 1-6', md: '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6',
    html: '<h1>H1</h1>\n<h2>H2</h2>\n<h3>H3</h3>\n<h4>H4</h4>\n<h5>H5</h5>\n<h6>H6</h6>\n' },
  { name: 'heading: closing hashes stripped', md: '# T ##', html: '<h1>T</h1>\n' },
  { name: 'heading: inline markup inside', md: '# h *i*', html: '<h1>h <em>i</em></h1>\n' },
  { name: 'heading: bare # is empty h1', md: '#', html: '<h1></h1>\n' },
  { name: 'heading: 7 hashes is a paragraph', md: '####### seven', html: '<p>####### seven</p>\n' },
  { name: 'heading: no space after # is a paragraph', md: '#nospace', html: '<p>#nospace</p>\n' },
  { name: 'setext h1 (=)', md: 'Title\n=====', html: '<h1>Title</h1>\n' },
  { name: 'setext h2 (-)', md: 'Sub\n---', html: '<h2>Sub</h2>\n' },
  { name: 'paragraph: single', md: 'hello', html: '<p>hello</p>\n' },
  { name: 'paragraph: soft line break keeps \\n', md: 'a\nb', html: '<p>a\nb</p>\n' },
  { name: 'paragraph: blank line separates', md: 'a\nb\n\nc', html: '<p>a\nb</p>\n<p>c</p>\n' },
  { name: 'paragraph: many blank lines collapse', md: 'a\n\n\n\nb', html: '<p>a</p>\n<p>b</p>\n' },
  { name: 'hr: ---', md: '---', html: '<hr>\n' },
  { name: 'hr: ***', md: '***', html: '<hr>\n' },
  { name: 'hr: ___', md: '___', html: '<hr>\n' },
  { name: 'hr: spaced "- - -"', md: '- - -', html: '<hr>\n' },
  { name: 'hr between paragraphs', md: 'a\n\n---\n\nb', html: '<p>a</p>\n<hr>\n<p>b</p>\n' },
  { name: 'blockquote: simple', md: '> a', html: '<blockquote>\n<p>a</p>\n</blockquote>\n' },
  { name: 'blockquote: nested with lazy continuation',
    md: '> a\n> > b\n> c',
    html: '<blockquote>\n<p>a</p>\n<blockquote>\n<p>b\nc</p>\n</blockquote>\n</blockquote>\n' },
  { name: 'blockquote: lazy paragraph continuation', md: '> a\nlazy',
    html: '<blockquote>\n<p>a\nlazy</p>\n</blockquote>\n' },
  { name: 'blockquote: 4 levels deep', md: '> > > > deep',
    html: '<blockquote>\n<blockquote>\n<blockquote>\n<blockquote>\n<p>deep</p>\n</blockquote>\n</blockquote>\n</blockquote>\n</blockquote>\n' },
  { name: 'blockquote: contains heading + list', md: '> # T\n> - a',
    html: '<blockquote>\n<h1>T</h1>\n<ul>\n<li>a</li>\n</ul>\n</blockquote>\n' },
  { name: 'fenced code: ``` no lang', md: '```\nx\n```', html: '<pre><code>x\n</code></pre>\n' },
  { name: 'fenced code: lang -> class="language-X" + escaped body', md: '```js\nvar a=1<2;\n```',
    html: '<pre><code class="language-js">var a=1&lt;2;\n</code></pre>\n' },
  { name: 'fenced code: ~~~ fence, only first info word is the lang', md: '~~~py extra\nx\n~~~',
    html: '<pre><code class="language-py">x\n</code></pre>\n' },
  { name: 'fenced code: markdown inside is NOT rendered', md: '```\n# no *em*\n```',
    html: '<pre><code># no *em*\n</code></pre>\n' },
  { name: 'fenced code: longer closing fence ok, shorter inner fence is content',
    md: '````\n```\nin\n```\n````', html: '<pre><code>```\nin\n```\n</code></pre>\n' },
    { name: 'fenced code: lang attr is attr-escaped', md: '```a"b\nx\n```',
    html: '<pre><code class="language-a&quot;b">x\n</code></pre>\n' },
  { name: 'indented code (4 spaces) is escaped', md: '    <b>&</b>',
    html: '<pre><code>&lt;b&gt;&amp;&lt;/b&gt;\n</code></pre>\n' },
  { name: 'indented code: chunks separated by a blank line preserve the blank [#1014-C]', md: '    code\n\n    more',
    html: '<pre><code>code\n\nmore\n</code></pre>\n' },
  { name: 'indented code: leading tab expands to 4 spaces', md: '\tcode', html: '<pre><code>code\n</code></pre>\n' },
  { name: 'ul: dash', md: '- a\n- b', html: '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n' },
  { name: 'ul: * and + markers', md: '* a\n* b', html: '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n' },
  { name: 'ul: changing marker starts a NEW list', md: '* a\n+ b',
    html: '<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>\n' },
  { name: 'ol: 1. 2.', md: '1. a\n2. b', html: '<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n' },
  { name: 'ol: start number emitted when != 1', md: '3. a\n4. b', html: '<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>\n' },
  { name: 'ol: ")" delimiter', md: '1) a\n2) b', html: '<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n' },
  { name: 'ol: changing delimiter starts a NEW list', md: '1. a\n1) b',
    html: '<ol>\n<li>a</li>\n</ol>\n<ol>\n<li>b</li>\n</ol>\n' },
  { name: 'list: switching ul -> ol starts a new list', md: '- a\n1. b',
    html: '<ul>\n<li>a</li>\n</ul>\n<ol>\n<li>b</li>\n</ol>\n' },
  { name: 'ul: nested (2 levels)', md: '- a\n  - b\n  - c\n- d',
    html: '<ul>\n<li>\na\n<ul>\n<li>b</li>\n<li>c</li>\n</ul>\n</li>\n<li>d</li>\n</ul>\n' },
  { name: 'list: mixed ol > ul nesting', md: '1. a\n   - x\n2. b',
    html: '<ol>\n<li>\na\n<ul>\n<li>x</li>\n</ul>\n</li>\n<li>b</li>\n</ol>\n' },
  { name: 'ul: deep nesting (4 levels)', md: '- a\n  - b\n    - c\n      - d',
    html: '<ul>\n<li>\na\n<ul>\n<li>\nb\n<ul>\n<li>\nc\n<ul>\n<li>d</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n' },
  { name: 'list: TIGHT items are unwrapped (no <p>)', md: '- a\n- b', html: '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n' },
  { name: 'list: LOOSE (blank between items) wraps in <p>', md: '- a\n\n- b',
    html: '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n' },
  { name: 'list: loose via multi-paragraph item', md: '- a\n\n  para\n- b',
    html: '<ul>\n<li>\n<p>a</p>\n<p>para</p>\n</li>\n<li><p>b</p></li>\n</ul>\n' },
  { name: 'list: lazy continuation line joins the item', md: '- a\n\tb',
    html: '<ul>\n<li>\na\n  b\n</li>\n</ul>\n' },
  { name: 'list: task items (ul)', md: '- [ ] t\n- [x] d',
    html: '<ul class="contains-task-list">\n<li class="task-list-item"><input type="checkbox" disabled> t</li>\n<li class="task-list-item"><input type="checkbox" disabled checked> d</li>\n</ul>\n' },
  { name: 'list: task item (ol, capital X)', md: '1. [X] d',
    html: '<ol class="contains-task-list">\n<li class="task-list-item"><input type="checkbox" disabled checked> d</li>\n</ol>\n' },
  { name: 'table: header + body, no alignment', md: 'a | b\n- | -\n1 | 2',
    html: '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n' },
  { name: 'table: left/right alignment', md: '| a | b |\n|:--|--:|\n| 1 | 2 |',
    html: '<table>\n<thead>\n<tr>\n<th style="text-align:left">a</th>\n<th style="text-align:right">b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td style="text-align:left">1</td>\n<td style="text-align:right">2</td>\n</tr>\n</tbody>\n</table>\n' },
  { name: 'table: center align, escaped pipe, short row padded with empty cell',
    md: '| a | b | c |\n|:-:|---|---|\n| 1 | x\\|y |',
    html: '<table>\n<thead>\n<tr>\n<th style="text-align:center">a</th>\n<th>b</th>\n<th>c</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td style="text-align:center">1</td>\n<td>x|y</td>\n<td></td>\n</tr>\n</tbody>\n</table>\n' },
  { name: 'table: inline markup in cells + header-only table',
    md: '| **a** |\n|---|',
    html: '<table>\n<thead>\n<tr>\n<th><strong>a</strong></th>\n</tr>\n</thead>\n<tbody>\n</tbody>\n</table>\n' },
  { name: 'table: ends at blank line; following paragraph separate',
    md: 'a | b\n- | -\n1 | 2\n\npost',
    html: '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n<p>post</p>\n' },
  { name: 'reference-style link definition is consumed (not rendered as text)',
    md: '[r][x]\n\n[x]: http://r.com "T"', html: '<p><a href="http://r.com" title="T">r</a></p>\n' },
  { name: 'mixed document: heading, para, list, code, hr',
    md: '# T\n\ntext\n\n- a\n- b\n\n```\nc\n```\n\n---',
    html: '<h1>T</h1>\n<p>text</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<pre><code>c\n</code></pre>\n<hr>\n' },
];
run(BLOCK);

// FIXED under #1014-C: the blank-line collapse now skips <pre>...</pre> regions
// (collapseBlankLinesOutsidePre), so interior blank lines in fenced and indented code survive verbatim.
test('fenced code preserves interior blank lines [#1014-C]', () => {
  assert.equal(mdToHtml('```\na\n\nb\n```'), '<pre><code>a\n\nb\n</code></pre>\n');
});
test('indented code preserves interior blank lines [#1014-C]', () => {
  assert.equal(mdToHtml('    a\n\n    b'), '<pre><code>a\n\nb\n</code></pre>\n');
});
test('fenced code preserves MULTIPLE interior blank lines verbatim [#1014-C]', () => {
  assert.equal(mdToHtml('```\na\n\n\nb\n```'), '<pre><code>a\n\n\nb\n</code></pre>\n');
});

// ============================================================ 2. INLINE table
const INLINE = [
  { name: 'bold **', md: '**b**', html: '<p><strong>b</strong></p>\n' },
  { name: 'bold __', md: '__b__', html: '<p><strong>b</strong></p>\n' },
  { name: 'italic *', md: '*i*', html: '<p><em>i</em></p>\n' },
  { name: 'italic _', md: '_i_', html: '<p><em>i</em></p>\n' },
  { name: 'bold-italic ***', md: '***bi***', html: '<p><strong><em>bi</em></strong></p>\n' },
  { name: 'bold-italic ___', md: '___bi___', html: '<p><strong><em>bi</em></strong></p>\n' },
  { name: 'strikethrough ~~', md: '~~d~~', html: '<p><del>d</del></p>\n' },
  { name: 'emphasis combined in one line', md: '**b** __b__ *i* _i_ ~~d~~',
    html: '<p><strong>b</strong> <strong>b</strong> <em>i</em> <em>i</em> <del>d</del></p>\n' },
  { name: 'intraword underscores are NOT emphasis', md: 'snake_case_word', html: '<p>snake_case_word</p>\n' },
  { name: 'intraword * IS emphasis (lib behaviour)', md: '2*3*4', html: '<p>2<em>3</em>4</p>\n' },
  { name: 'emphasis needs non-space after opener', md: '* a *', html: '<ul>\n<li>a *</li>\n</ul>\n' },
  { name: 'inline code escapes html', md: '`c<>&`', html: '<p><code>c&lt;&gt;&amp;</code></p>\n' },
  { name: 'inline code suppresses emphasis', md: '`*a*`', html: '<p><code>*a*</code></p>\n' },
  { name: 'inline code: double-backtick fence with inner backtick', md: '`` a`b ``', html: '<p><code>a`b</code></p>\n' },
  { name: 'link', md: '[t](http://x.com)', html: '<p><a href="http://x.com">t</a></p>\n' },
  { name: 'link with "title"', md: '[t](http://x.com "ti")', html: '<p><a href="http://x.com" title="ti">t</a></p>\n' },
  { name: "link with 'title'", md: "[t](u 'ti')", html: '<p><a href="u" title="ti">t</a></p>\n' },
  { name: 'link with (title)', md: '[t](u (p))', html: '<p><a href="u" title="p">t</a></p>\n' },
  { name: 'link with <angle dest> allows spaces', md: '[t](<http://x.com/a b>)', html: '<p><a href="http://x.com/a b">t</a></p>\n' },
  { name: 'link text carries inline markup', md: '[a *b* `c`](u)', html: '<p><a href="u">a <em>b</em> <code>c</code></a></p>\n' },
  { name: 'relative + fragment links pass', md: '[a](/p) [b](#h) [c](./r)',
    html: '<p><a href="/p">a</a> <a href="#h">b</a> <a href="./r">c</a></p>\n' },
  { name: 'shortcut reference link', md: '[x]\n\n[x]: /p', html: '<p><a href="/p">x</a></p>\n' },
  { name: 'reference link, case-insensitive label', md: '[a][FOO]\n\n[foo]: /u', html: '<p><a href="/u">a</a></p>\n' },
  { name: 'unresolved reference stays literal text', md: '[a][nope]', html: '<p>[a][nope]</p>\n' },
  { name: 'autolink <url>', md: '<http://a.com>', html: '<p><a href="http://a.com">http://a.com</a></p>\n' },
  { name: 'autolink <email> -> mailto:', md: '<me@a.com>', html: '<p><a href="mailto:me@a.com">me@a.com</a></p>\n' },
  { name: 'image', md: '![a](i.png)', html: '<p><img src="i.png" alt="a"></p>\n' },
  { name: 'image with title', md: '![a](i.png "t")', html: '<p><img src="i.png" alt="a" title="t"></p>\n' },
  { name: 'line break: two trailing spaces', md: 'a  \nb', html: '<p>a<br>\nb</p>\n' },
  { name: 'line break: backslash newline', md: 'a\\\nb', html: '<p>a<br>\nb</p>\n' },
  { name: 'backslash escapes punctuation', md: '\\*lit\\* \\\\ \\[x\\]', html: '<p>*lit* \\ [x]</p>\n' },
  { name: 'escaped * prevents emphasis', md: '\\*a\\*', html: '<p>*a*</p>\n' },
  { name: 'backslash before non-punct stays literal', md: '\\q', html: '<p>\\q</p>\n' },
  { name: 'escaped HTML char is entity-escaped', md: '\\<', html: '<p>&lt;</p>\n' },
];
run(INLINE);

test('parseInline: direct spot-checks (no block wrapper, no trailing newline)', () => {
  assert.equal(parseInline('*a* **b**'), '<em>a</em> <strong>b</strong>');
  assert.equal(parseInline('[b](c)'), '<a href="c">b</a>');
  assert.equal(parseInline('`x<y`'), '<code>x&lt;y</code>');
  assert.equal(parseInline('a  \nb'), 'a<br>\nb');
  assert.equal(parseInline(''), '');
  assert.equal(parseInline('<b>'), '&lt;b&gt;');
});
test('parseInline: refs map resolves [x][r] and [r]', () => {
  const refs = { r: { url: '/u', title: '' }, t: { url: '/v', title: 'tt' } };
  assert.equal(parseInline('[x][r]', refs), '<a href="/u">x</a>');
  assert.equal(parseInline('[t]', refs), '<a href="/v" title="tt">t</a>');
  assert.equal(parseInline('[x][missing]', refs), '[x][missing]');
});
test('parseInline: javascript: link neutralized when called directly', () => {
  assert.equal(parseInline('[x](javascript:alert(1))'), '<a href="">x</a>');
});

// ============================================================ 3. SAFETY
test('SAFETY: raw <script> is escaped, never emitted as a tag', () => {
  const out = mdToHtml('<script>alert(1)</script>');
  assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
  assert.ok(!/<script/i.test(out));
});
test('SAFETY: raw <div onclick> block HTML is escaped (quotes too)', () => {
  const out = mdToHtml('<div onclick="x">hi</div>');
  assert.equal(out, '<p>&lt;div onclick=&quot;x&quot;&gt;hi&lt;/div&gt;</p>\n');
  assert.ok(!out.includes('<div'));
});
test('SAFETY: raw HTML escaped in every context (heading, list, quote, table, link text)', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const esc = '&lt;img src=x onerror=alert(1)&gt;';
  assert.equal(mdToHtml('# ' + payload), '<h1>' + esc + '</h1>\n');
  assert.equal(mdToHtml('- ' + payload), '<ul>\n<li>' + esc + '</li>\n</ul>\n');
  assert.equal(mdToHtml('> ' + payload), '<blockquote>\n<p>' + esc + '</p>\n</blockquote>\n');
  assert.ok(mdToHtml('| a |\n|---|\n| ' + payload + ' |').includes('<td>' + esc + '</td>'));
  assert.equal(mdToHtml('[' + payload + '](u)'), '<p><a href="u">' + esc + '</a></p>\n');
  assert.equal(mdToHtml('    ' + payload), '<pre><code>' + esc + '\n</code></pre>\n');
});
test('SAFETY: HTML comments and entities-looking text are escaped', () => {
  assert.equal(mdToHtml('<!-- c -->'), '<p>&lt;!-- c --&gt;</p>\n');
  assert.equal(mdToHtml('&lt; &amp;'), '<p>&amp;lt; &amp;amp;</p>\n');
});
test('SAFETY: & < > " escaped in text', () => {
  assert.equal(mdToHtml('a & b < c > d "e"'), '<p>a &amp; b &lt; c &gt; d &quot;e&quot;</p>\n');
});
test('SAFETY: javascript: link href is emptied (any case)', () => {
  for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'JAVASCRIPT:x']) {
    assert.equal(mdToHtml('[x](' + u + ')'), '<p><a href="">x</a></p>\n', u);
  }
});
test('SAFETY: entity-encoded javascript: scheme is emptied', () => {
  assert.equal(mdToHtml('[x](&#106;avascript:alert(1))'), '<p><a href="">x</a></p>\n');
  assert.equal(mdToHtml('[x](&#x6a;avascript:alert(1))'), '<p><a href="">x</a></p>\n');
});
test('SAFETY: vbscript: link emptied', () => {
  assert.equal(mdToHtml('[x](vbscript:msgbox)'), '<p><a href="">x</a></p>\n');
});
test('SAFETY: data: links are emptied (html and image payloads alike) — link context never allows data:', () => {
  assert.equal(mdToHtml('[x](data:text/html,<script>)'), '<p><a href="">x</a></p>\n');
  assert.equal(mdToHtml('[x](data:image/png;base64,AAA)'), '<p><a href="">x</a></p>\n');
});
test('SAFETY: autolink <javascript:...> emptied, text still escaped', () => {
  assert.equal(mdToHtml('<javascript:alert(1)>'), '<p><a href="">javascript:alert(1)</a></p>\n');
});
test('SAFETY: data:image/ in an image is blocked by DEFAULT (opt-in required) [#1014-F]', () => {
  // Default (no opts): data:image is NOT allowed — matches the documented opt-in contract.
  assert.equal(mdToHtml('![x](data:image/png;base64,AAA)'), '<p><img src="" alt="x"></p>\n');
  assert.equal(mdToHtml('![x](data:text/html,x)'), '<p><img src="" alt="x"></p>\n');
  assert.equal(mdToHtml('![x](javascript:alert(1))'), '<p><img src="" alt="x"></p>\n');
});
test('SAFETY: mdToHtml HONORS opts.allowImage for data:image/ [#1014-F]', () => {
  const md = '![x](data:image/png;base64,AAA)';
  // opt-in allows a non-SVG data:image payload...
  assert.equal(mdToHtml(md, { allowImage: true }), '<p><img src="data:image/png;base64,AAA" alt="x"></p>\n');
  // ...and every non-opt-in form blocks it.
  const blocked = '<p><img src="" alt="x"></p>\n';
  assert.equal(mdToHtml(md, { allowImage: false }), blocked);
  assert.equal(mdToHtml(md, undefined), blocked);
  assert.equal(mdToHtml(md, null), blocked);
});
test('SAFETY: data:image/svg+xml stays blocked even with allowImage (SVG is script-capable) [#1014-F]', () => {
  const md = '![x](data:image/svg+xml;base64,PHN2Zz4=)';
  assert.equal(mdToHtml(md, { allowImage: true }), '<p><img src="" alt="x"></p>\n');
});
test('SAFETY: quotes in url/title/alt cannot break out of attributes', () => {
  assert.equal(mdToHtml('[x](" onmouseover="alert(1))'),
    '<p><a href="&quot;" title="onmouseover=&quot;alert(1)">x</a></p>\n');
  assert.equal(mdToHtml('[x](http://a.com/?a=1&b="2")'),
    '<p><a href="http://a.com/?a=1&amp;b=&quot;2&quot;">x</a></p>\n');
  assert.equal(mdToHtml('![x"<](a.png)'), '<p><img src="a.png" alt="x&quot;&lt;"></p>\n');
  assert.equal(mdToHtml('[x](u "a\'b")'), '<p><a href="u" title="a&#39;b">x</a></p>\n');
  assert.equal(mdToHtml('[x](<a\'b>)'), '<p><a href="a&#39;b">x</a></p>\n');
});
test('SAFETY: mailto autolink payload is attr+text escaped', () => {
  // quote cannot reach the attribute context
  assert.equal(mdToHtml('<a"b@c.com>'), '<p><a href="mailto:a&quot;b@c.com">a&quot;b@c.com</a></p>\n');
});
test('SAFETY: no output ever contains an unescaped < other than known tags (fuzz over hostile corpus)', () => {
  const hostile = [
    '<script>x</script>', '<img src=x onerror=1>', '<iframe src=//e>', '<svg/onload=1>',
    '[a](javascript:1)', '[a](data:text/html;base64,PHNjcmlwdD4=)', '<a href="javascript:1">x</a>',
    '`<script>`', '```\n<script>\n```', '| <b> |\n|---|\n| <i> |', '> <u>', '# <h>', '- <li>',
  ];
  const allowed = /<\/?(?:p|h[1-6]|ul|ol|li|a|em|strong|del|code|pre|blockquote|table|thead|tbody|tr|th|td|br|hr|img|input)(?:\s[^<>]*)?>/g;
  for (const h of hostile) {
    const stripped = mdToHtml(h).replace(allowed, '');
    assert.ok(!stripped.includes('<'), 'raw "<" survived for: ' + h);
    assert.ok(!/href="javascript:/i.test(mdToHtml(h)), h);
    assert.ok(!/<script/i.test(mdToHtml(h)), h);
  }
});

// sanitizeUrl matrix: [input, opts, expected]
const SANITIZE = [
  ['http://a', {}, 'http://a'], ['https://a/b?c=d#e', {}, 'https://a/b?c=d#e'],
  ['/rel/path', {}, '/rel/path'], ['./r', {}, './r'], ['../r', {}, '../r'], ['#frag', {}, '#frag'],
  ['page.html', {}, 'page.html'], ['//host/p', {}, '//host/p'],
  ['mailto:a@b.c', {}, 'mailto:a@b.c'], ['tel:123', {}, 'tel:123'],
  ['  http://a  ', {}, 'http://a  '.trim()], // trimmed; original (trimmed) returned
  ['javascript:alert(1)', {}, ''], ['JAVASCRIPT:x', {}, ''], [' javascript:x', {}, ''],
  ['java\nscript:x', {}, ''], ['java\tscript:x', {}, ''], ['\u0001javascript:x', {}, ''],
  ['&#106;avascript:x', {}, ''], ['&#x6a;avascript:x', {}, ''], ['&#106avascript:x', {}, ''],
  ['vbscript:x', {}, ''], ['VBScript:x', {}, ''],
  ['data:text/html,<script>', {}, ''], ['data:text/html,<script>', { allowImage: true }, ''],
  ['data:image/png;base64,A', {}, ''],
  ['data:image/png;base64,A', { allowImage: false }, ''],
  ['data:image/png;base64,A', { allowImage: true }, 'data:image/png;base64,A'],
  ['DATA:IMAGE/png;base64,A', { allowImage: true }, 'DATA:IMAGE/png;base64,A'],
  ['data:application/x,1', { allowImage: true }, ''],
  ['data:image/svg+xml,<svg>', { allowImage: true }, ''], // #1014-F: SVG stays blocked even opted-in
  ['data:image/svg+xml;base64,PHN2Zz4=', { allowImage: true }, ''],
  ['', {}, ''], ['   ', {}, ''], [null, {}, ''], [undefined, {}, ''],
];
for (const [input, opts, want] of SANITIZE) {
  test(`sanitizeUrl(${JSON.stringify(input)}, ${JSON.stringify(opts)}) -> ${JSON.stringify(want)}`, () => {
    assert.equal(sanitizeUrl(input, opts), want);
  });
}
test('sanitizeUrl: second arg optional', () => {
  assert.equal(sanitizeUrl('http://a'), 'http://a');
  assert.equal(sanitizeUrl('javascript:x'), '');
});
test('sanitizeUrl: returns the ORIGINAL (undecoded) url when safe, for the caller to attr-escape', () => {
  assert.equal(sanitizeUrl('/a?x=1&amp;y=2'), '/a?x=1&amp;y=2');
  assert.equal(sanitizeUrl('/a"b'), '/a"b');
});

// ============================================================ 4. ESCAPE HELPERS
test('escapeHtmlForMarkdown: & < > " escaped, single quote NOT', () => {
  assert.equal(escapeHtmlForMarkdown(`&<>"'`), '&amp;&lt;&gt;&quot;\'');
});
test('escapeAttrForMarkdown: & < > " and single quote -> &#39;', () => {
  assert.equal(escapeAttrForMarkdown(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
test('escape helpers: & escaped first (no double-escape of produced entities)', () => {
  assert.equal(escapeHtmlForMarkdown('<'), '&lt;');
  assert.equal(escapeHtmlForMarkdown('&lt;'), '&amp;lt;');
  assert.equal(escapeAttrForMarkdown("&#39;"), '&amp;#39;');
});
test('escape helpers: null/undefined -> "", non-strings coerced, plain text untouched', () => {
  for (const f of [escapeHtmlForMarkdown, escapeAttrForMarkdown]) {
    assert.equal(f(null), '');
    assert.equal(f(undefined), '');
    assert.equal(f(''), '');
    assert.equal(f(42), '42');
    assert.equal(f('héllo 日本 😀'), 'héllo 日本 😀');
  }
});
test('escape helpers: every occurrence replaced (global)', () => {
  assert.equal(escapeHtmlForMarkdown('<<>>&&""'), '&lt;&lt;&gt;&gt;&amp;&amp;&quot;&quot;');
  assert.equal(escapeAttrForMarkdown("''"), '&#39;&#39;');
});

// ============================================================ 5. EDGES + DETERMINISM
const EDGES = [
  { name: 'empty string -> ""', md: '', html: '' },
  { name: 'whitespace/newlines only -> ""', md: '\n\n  \n', html: '' },
  { name: 'null -> ""', md: null, html: '' },
  { name: 'undefined -> ""', md: undefined, html: '' },
  { name: 'trailing newline does not change output', md: 'a\n', html: '<p>a</p>\n' },
  { name: 'many trailing newlines', md: 'a\n\n\n\n', html: '<p>a</p>\n' },
  { name: 'CRLF line endings == LF', md: 'a\r\nb\r\n\r\nc', html: '<p>a\nb</p>\n<p>c</p>\n' },
  { name: 'lone CR line endings == LF', md: 'a\rb', html: '<p>a\nb</p>\n' },
  { name: 'unicode passes through unescaped', md: 'héllo wörld 日本語 😀', html: '<p>héllo wörld 日本語 😀</p>\n' },
  { name: 'unicode in heading + code', md: '# 日本\n\n`é`', html: '<h1>日本</h1>\n<p><code>é</code></p>\n' },
  { name: 'PUA sentinel U+E000 in input is stripped (cannot forge token slots)', md: 'ab0', html: '<p>ab0</p>\n' },
  { name: 'non-string input is coerced', md: 123, html: '<p>123</p>\n' },
  { name: 'malformed: unclosed *', md: 'a *b', html: '<p>a *b</p>\n' },
  { name: 'malformed: unclosed **', md: '**open', html: '<p>**open</p>\n' },
  { name: 'malformed: unclosed `', md: '`open', html: '<p>`open</p>\n' },
  { name: 'malformed: unclosed ``` fence runs to EOF', md: '```\nunclosed', html: '<pre><code>unclosed\n</code></pre>\n' },
  { name: 'malformed: unclosed link paren', md: '[unclosed](x', html: '<p>[unclosed](x</p>\n' },
  { name: 'malformed: dangling [x](', md: '[x](', html: '<p>[x](</p>\n' },
  { name: 'malformed: lone ! and [', md: '! [ ] !', html: '<p>! [ ] !</p>\n' },
  { name: 'malformed: unterminated <angle dest', md: '[t](<http://x', html: '<p>[t](&lt;http://x</p>\n' },
  { name: 'malformed: table delimiter with no header pipe is a paragraph pair', md: '---|---\nx', html: '<p>---|---\nx</p>\n' },
  { name: 'literal < not forming autolink is escaped', md: 'a < b', html: '<p>a &lt; b</p>\n' },
];
run(EDGES);

test('determinism: same input twice -> byte-identical output', () => {
  const doc = [
    '# T', '', 'p *a* **b** `c` [l](u "t") ![i](x.png)', '', '- a', '  - b', '- [x] c', '',
    '1. a', '2. b', '', '> q', '', '```js', 'x<y', '```', '', '| a | b |', '|:-:|--:|', '| 1 | 2 |', '',
    '[r]: /u', '', '<script>x</script>',
  ].join('\n');
  const a = mdToHtml(doc);
  const b = mdToHtml(doc);
  assert.equal(a, b);
  assert.ok(a.length > 100);
  for (let k = 0; k < 20; k++) assert.equal(mdToHtml(doc), a);
});
test('determinism: parseInline same input twice identical; no shared state between calls', () => {
  const s = '*a* [b][r] `c`';
  const refs = { r: { url: '/u', title: '' } };
  assert.equal(parseInline(s, refs), parseInline(s, refs));
  // a reference defined in one document must not leak into the next
  mdToHtml('[x]\n\n[x]: /leak');
  assert.equal(mdToHtml('[x]'), '<p>[x]</p>\n');
});
test('output ends in exactly one \\n when non-empty and never starts/ends with blank lines', () => {
  for (const md of ['a', 'a\n\n\n', '\n\na', '# h\n\n\n- x\n\n\n']) {
    const out = mdToHtml(md);
    assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'), JSON.stringify(out));
    assert.ok(!out.startsWith('\n'), JSON.stringify(out));
  }
});
test('deep nesting (50 blockquote levels) renders without throwing, balanced tags', () => {
  const out = mdToHtml('> '.repeat(50) + 'x');
  assert.equal((out.match(/<blockquote>/g) || []).length, 50);
  assert.equal((out.match(/<\/blockquote>/g) || []).length, 50);
  assert.ok(out.includes('<p>x</p>'));
});
test('large input (5000 paragraphs) renders deterministically', () => {
  const md = Array.from({ length: 5000 }, (_, k) => 'para ' + k).join('\n\n');
  const out = mdToHtml(md);
  assert.equal((out.match(/<p>/g) || []).length, 5000);
  assert.equal(out, mdToHtml(md));
});
