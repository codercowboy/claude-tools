// Unit tests for CtPretty.mjs -- HTML + CSS ONLY (Phase 10b).
// JSON/YAML (10a) and SQL/JS (10c) are covered by other files. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: table-driven exact fixtures pinned to the lib's ACTUAL output, plus structural
// (tags + words) semantic equality for round-trips, since HTML whitespace policy is opinionated.
// Neither engine throws on malformed input (unlike JSON) -- the edge tests characterize what
// each emits. Cases where an idempotency/round-trip SHOULD hold but does not are marked `todo`
// (they run and report, but do not fail the suite) and are flagged in the 10b HANDOFF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHTML, minifyHTML, formatCSS, minifyCSS } from '../../utils/formats/CtPretty.mjs';

// Structural fingerprint of an HTML string: comments removed, tags (raw) and whitespace-collapsed
// words in document order. Insensitive to inter-element whitespace/indent.
function htmlShape(s) {
  const noC = s.replace(/<!--[\s\S]*?-->/g, '');
  const parts = noC.split(/(<[^>]*>)/).filter((p) => p !== '');
  const out = [];
  for (const p of parts) {
    if (p.startsWith('<')) out.push(p);
    else for (const w of p.split(/\s+/)) if (w) out.push(w);
  }
  return out;
}

// =========================================================== HTML: exact pretty + minify
// {name, src, pretty (indent 2), min}
const HTML_CASES = [
  {
    name: 'block nesting re-indents, minify strips inter-block ws',
    src: '<div><p>Hello</p><p>World</p></div>',
    pretty: '<div>\n  <p>Hello</p>\n  <p>World</p>\n</div>\n',
    min: '<div><p>Hello</p><p>World</p></div>',
  },
  {
    name: 'already-indented list re-emitted identically; minify strips indent',
    src: '<ul>\n  <li>one</li>\n  <li>two <b>x</b></li>\n</ul>',
    pretty: '<ul>\n  <li>one</li>\n  <li>two <b>x</b></li>\n</ul>\n',
    min: '<ul><li>one</li><li>two <b>x</b></li></ul>',
  },
  {
    name: 'doctype + void elements (br/img/hr/input/meta) + attributes kept verbatim (both quote styles)',
    src: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body><h1 class="a" id=\'b\'>Hi</h1><br><img src="x.png" alt="y"><hr><input type="text"></body></html>',
    pretty:
      '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <title>T</title>\n  </head>\n' +
      '  <body>\n    <h1 class="a" id=\'b\'>Hi</h1>\n    <br>\n    <img src="x.png" alt="y">\n    <hr>\n    <input type="text">\n  </body>\n</html>\n',
    min: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body><h1 class="a" id=\'b\'>Hi</h1><br><img src="x.png" alt="y"><hr><input type="text"></body></html>',
  },
  {
    name: 'inline-only children collapse onto ONE line (em/strong/a)',
    src: '<p>Some <em>em</em> and <strong>bold</strong> and <a href="/x">link</a> text</p>',
    pretty: '<p>Some <em>em</em> and <strong>bold</strong> and <a href="/x">link</a> text</p>\n',
    min: '<p>Some <em>em</em> and <strong>bold</strong> and <a href="/x">link</a> text</p>',
  },
  {
    name: 'adjacent inline siblings keep their single space',
    src: '<div><span>a</span> <span>b</span></div>',
    pretty: '<div><span>a</span> <span>b</span></div>\n',
    min: '<div><span>a</span> <span>b</span></div>',
  },
  {
    name: 'mixed text + block child -> block layout, text on own lines',
    src: '<div>text <p>block</p> more</div>',
    pretty: '<div>\n  text\n  <p>block</p>\n  more\n</div>\n',
    min: '<div>text <p>block</p> more</div>',
  },
  {
    name: 'inline <br> inside text stays on the single collapsed line',
    src: '<p>a<br>b</p>',
    pretty: '<p>a<br>b</p>\n',
    min: '<p>a<br>b</p>',
  },
  {
    name: 'self-closing syntax (<br/>, <img ... />) preserved, no close tag added',
    src: '<br/><img src=x />',
    pretty: '<br/>\n<img src=x />\n',
    min: '<br/><img src=x />',
  },
  {
    name: 'empty element and whitespace-only element -> <x></x>',
    src: '<div>  </div>',
    pretty: '<div></div>\n',
    min: '<div></div>',
  },
  {
    name: 'rawText <script>: content verbatim (incl. "<" and runs of spaces)',
    src: '<script>\n  if (a < b) {  x = 1;  }\n</script>',
    pretty: '<script>\n  if (a < b) {  x = 1;  }\n</script>\n',
    min: '<script>\n  if (a < b) {  x = 1;  }\n</script>',
  },
  {
    name: 'rawText <style> verbatim; following block goes on its own line',
    src: '<style>\n a{color:red}\n</style><div>x</div>',
    pretty: '<style>\n a{color:red}\n</style>\n<div>x</div>\n',
    min: '<style>\n a{color:red}\n</style><div>x</div>',
  },
  {
    name: 'rawText <pre>: whitespace + newlines preserved byte-for-byte',
    src: '<pre>  keep\n    this  </pre>',
    pretty: '<pre>  keep\n    this  </pre>\n',
    min: '<pre>  keep\n    this  </pre>',
  },
  {
    name: 'rawText <textarea> verbatim',
    src: '<textarea>\n a  b\n</textarea>',
    pretty: '<textarea>\n a  b\n</textarea>\n',
    min: '<textarea>\n a  b\n</textarea>',
  },
  {
    name: 'attribute value containing ">" is not mistaken for end of tag',
    src: '<div class="a>b">x</div>',
    pretty: '<div class="a>b">x</div>\n',
    min: '<div class="a>b">x</div>',
  },
  {
    name: 'unicode (accents, BMP symbol, astral emoji) survives',
    src: '<p>café ☃ \u{1F600}</p>',
    pretty: '<p>café ☃ \u{1F600}</p>\n',
    min: '<p>café ☃ \u{1F600}</p>',
  },
  {
    name: 'inline <button> collapses like other inline elements',
    src: '<button>ok</button>',
    pretty: '<button>ok</button>\n',
    min: '<button>ok</button>',
  },
];

for (const c of HTML_CASES) {
  test(`HTML formatHTML exact: ${c.name}`, () => assert.equal(formatHTML(c.src), c.pretty));
  test(`HTML minifyHTML exact: ${c.name}`, () => assert.equal(minifyHTML(c.src), c.min));
  test(`HTML idempotent (format & minify): ${c.name}`, () => {
    assert.equal(formatHTML(c.pretty), c.pretty);
    assert.equal(formatHTML(formatHTML(c.src)), formatHTML(c.src));
    assert.equal(minifyHTML(c.min), c.min);
    assert.equal(minifyHTML(minifyHTML(c.src)), minifyHTML(c.src));
  });
  test(`HTML semantic round-trip pretty<->minify (tags + words preserved): ${c.name}`, () => {
    const shape = htmlShape(c.src);
    assert.deepEqual(htmlShape(formatHTML(c.src)), shape);
    assert.deepEqual(htmlShape(minifyHTML(c.src)), shape);
    assert.deepEqual(htmlShape(minifyHTML(formatHTML(c.src))), shape);
    assert.deepEqual(htmlShape(formatHTML(minifyHTML(c.src))), shape);
  });
}

// =========================================================== HTML: indent option
test('HTML indent: 2 (default) vs 4 vs tab vs explicit 2', () => {
  const src = '<ul><li>one</li><li>two</li></ul>';
  assert.equal(formatHTML(src), '<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>\n');
  assert.equal(formatHTML(src, { indent: 2 }), formatHTML(src));
  assert.equal(formatHTML(src, { indent: 4 }), '<ul>\n    <li>one</li>\n    <li>two</li>\n</ul>\n');
  assert.equal(formatHTML(src, { indent: 'tab' }), '<ul>\n\t<li>one</li>\n\t<li>two</li>\n</ul>\n');
  assert.equal(formatHTML(src, { indent: '\t' }), formatHTML(src, { indent: 'tab' }));
});
test('HTML indent: tab / 4 each scale with depth and are idempotent', () => {
  const src = '<div><div><p>x</p></div></div>';
  assert.equal(formatHTML(src, { indent: 4 }), '<div>\n    <div>\n        <p>x</p>\n    </div>\n</div>\n');
  assert.equal(formatHTML(src, { indent: 'tab' }), '<div>\n\t<div>\n\t\t<p>x</p>\n\t</div>\n</div>\n');
  for (const indent of [2, 4, 'tab']) {
    const once = formatHTML(src, { indent });
    assert.equal(formatHTML(once, { indent }), once);
  }
});
test('HTML indent: re-formatting at a different indent re-indents (does not stack)', () => {
  const four = formatHTML('<div><p>x</p></div>', { indent: 4 });
  assert.equal(formatHTML(four, { indent: 2 }), '<div>\n  <p>x</p>\n</div>\n');
});

// =========================================================== HTML: comment policy
test('HTML comment policy: minifyHTML DROPS a normal comment', () => {
  assert.equal(minifyHTML('<div><!-- x --><p>a</p></div>'), '<div><p>a</p></div>');
  assert.equal(minifyHTML('<!-- only -->'), '');
});
test('HTML comment policy: minifyHTML KEEPS an IE-conditional comment verbatim', () => {
  assert.equal(
    minifyHTML('<!--[if IE]><p>ie</p><![endif]--><p>a</p>'),
    '<!--[if IE]><p>ie</p><![endif]--><p>a</p>',
  );
  assert.equal(minifyHTML('<!--[IF lt IE 9]>x<![endif]-->'), '<!--[IF lt IE 9]>x<![endif]-->'); // case-insensitive
});
test('HTML comment policy: minifyHTML KEEPS a bang comment <!--! x -->', () => {
  assert.equal(minifyHTML('<!--! bang --><p>a</p>'), '<!--! bang --><p>a</p>');
});
test('HTML comment policy: minifyHTML KEEPS a comment containing [endif] even without leading [if', () => {
  assert.equal(minifyHTML('<!-- x [endif] --><p>a</p>'), '<!-- x [endif] --><p>a</p>');
});
test('HTML comment policy: keep and drop mixed in one document', () => {
  assert.equal(
    minifyHTML('<!-- drop --><div><!--! keep --><!-- drop2 --></div>'),
    '<div><!--! keep --></div>',
  );
});
test('HTML comment policy: formatHTML KEEPS every comment (normal, IE, bang) on its own line', () => {
  assert.equal(formatHTML('<div><!-- x --><p>a</p></div>'), '<div>\n  <!-- x -->\n  <p>a</p>\n</div>\n');
  assert.equal(formatHTML('<!--[if IE]><p>ie</p><![endif]--><p>a</p>'), '<!--[if IE]><p>ie</p><![endif]-->\n<p>a</p>\n');
  assert.equal(formatHTML('<!--! bang --><p>a</p>'), '<!--! bang -->\n<p>a</p>\n');
});
test('HTML comment policy: an element holding a comment is NOT collapsed to one line', () => {
  assert.equal(formatHTML('<span><!-- c -->x</span>'), '<span>\n  <!-- c -->\n  x\n</span>\n');
});
test('HTML comment policy: kept comments are idempotent through format and minify', () => {
  for (const s of ['<!--[if IE]><p>ie</p><![endif]--><p>a</p>', '<!--! bang --><p>a</p>', '<div><!-- x --></div>']) {
    assert.equal(formatHTML(formatHTML(s)), formatHTML(s));
    assert.equal(minifyHTML(minifyHTML(s)), minifyHTML(s));
  }
});
test('HTML comment policy: comment-bearing doc round-trips (minify(format(x)) == minify(x))', () => {
  for (const s of ['<div><!-- x --><p>a</p></div>', '<!--! b --><div><p>a</p></div>', '<!--[if IE]><p>i</p><![endif]--><p>a</p>']) {
    assert.equal(minifyHTML(formatHTML(s)), minifyHTML(s));
  }
});

// =========================================================== HTML: structural awareness
test('HTML void: no close tag is ever emitted for void elements', () => {
  const src = '<div><br><hr><img src="a"><input><meta charset="u"><link rel="s" href="x"><area><base><col><embed><param><source><track><wbr></div>';
  for (const out of [formatHTML(src), minifyHTML(src)]) {
    assert.doesNotMatch(out, /<\/(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)>/);
  }
});
test('HTML void: an unclosed void does not swallow following siblings', () => {
  assert.equal(formatHTML('<div><hr><p>after</p></div>'), '<div>\n  <hr>\n  <p>after</p>\n</div>\n');
});
test('HTML inline vs block: all-inline parent collapses, a block child forces block layout', () => {
  assert.equal(formatHTML('<p><span>a</span><em>b</em></p>'), '<p><span>a</span><em>b</em></p>\n');
  assert.equal(formatHTML('<span><div>b</div></span>'), '<span>\n  <div>b</div>\n</span>\n');
});
test('HTML inline: whitespace between inline siblings is kept as one space by minify; dropped between blocks', () => {
  assert.equal(minifyHTML('<p><b>a</b>   \n   <i>b</i></p>'), '<p><b>a</b> <i>b</i></p>');
  assert.equal(minifyHTML('<div>\n  <p>a</p>\n  <p>b</p>\n</div>'), '<div><p>a</p><p>b</p></div>');
});
test('HTML minify: internal text whitespace runs collapse to a single space', () => {
  assert.equal(minifyHTML('<p>a   b\n\n  c</p>'), '<p>a b c</p>');
  assert.equal(formatHTML('<p>a   b\n\n  c</p>'), '<p>a b c</p>\n');
});
test('HTML rawText: script/style/pre/textarea content is byte-identical through format AND minify', () => {
  const bodies = {
    script: '\n  var s = "<div>  x  </div>";\n    if (1 < 2) { go(); }\n',
    style: '\n  a   >   b { color : red }\n\n',
    pre: '  line1\n\n      line2   ',
    textarea: '\n   typed   text\n',
  };
  for (const [tag, body] of Object.entries(bodies)) {
    const src = `<div><${tag}>${body}</${tag}></div>`;
    assert.ok(formatHTML(src).includes(`<${tag}>${body}</${tag}>`), `format keeps ${tag}`);
    assert.ok(minifyHTML(src).includes(`<${tag}>${body}</${tag}>`), `minify keeps ${tag}`);
  }
});
// FIXED under #1014-D: formatHTML no longer runs a global .replace(/\n{3,}/g,'\n\n') that collapsed
// interior blank lines INSIDE rawText (pre/script/style/textarea). The emitter never inserts blank
// lines structurally, so raw content is preserved verbatim.
test('HTML rawText: 2+ interior blank lines are preserved by formatHTML [#1014-D]', () => {
  const src = '<pre>a\n\n\n\nb</pre>';
  assert.equal(formatHTML(src), '<pre>a\n\n\n\nb</pre>\n');
});
test('HTML rawText: minifyHTML preserves 2+ interior blank lines (only format is affected)', () => {
  assert.equal(minifyHTML('<pre>a\n\n\n\nb</pre>'), '<pre>a\n\n\n\nb</pre>');
});
test('HTML rawText: <script> with attributes + a nested "</div>" string is not parsed as markup', () => {
  const src = '<script type="module">const x = "</div>"; </script><p>after</p>';
  // Raw content ends at the first "</script", so the "</div>" inside is plain script text.
  assert.equal(formatHTML(src), '<script type="module">const x = "</div>"; </script>\n<p>after</p>\n');
  assert.equal(minifyHTML(src), src);
});
test('HTML rawText: self-closing <script/> is not treated as opening raw content (following sibling still parsed) -- but a spurious </script> IS emitted (quirk, see HANDOFF)', () => {
  assert.equal(formatHTML('<script src="a.js"/><p>x</p>'), '<script src="a.js"/></script>\n<p>x</p>\n');
  assert.equal(minifyHTML('<script src="a.js"/><p>x</p>'), '<script src="a.js"/></script><p>x</p>');
});
test('HTML doctype: preserved verbatim (case + legacy public id) and on its own line', () => {
  const dt = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">';
  assert.equal(formatHTML(dt + '<html></html>'), dt + '\n<html></html>\n');
  assert.equal(minifyHTML(dt + '<html></html>'), dt + '<html></html>');
  assert.equal(formatHTML('<!doctype html><p>x</p>'), '<!doctype html>\n<p>x</p>\n');
});
test('HTML attributes: multiple, mixed quoting, boolean, and spacing inside the tag are kept verbatim', () => {
  const src = '<input   type="checkbox"  checked data-x=\'a "b"\'  disabled>';
  assert.equal(formatHTML(src), src + '\n');
  assert.equal(minifyHTML(src), src);
});
test('HTML tag names: case-insensitive matching for void/inline/close (open tags keep source case; synthesized close tags are lowercased)', () => {
  assert.equal(formatHTML('<DIV><P>x</P></DIV>'), '<DIV>\n  <P>x</p>\n</div>\n');
  assert.equal(minifyHTML('<DIV><P>x</P></DIV>'), '<DIV><P>x</p></div>');
  assert.equal(formatHTML('<p>a<BR>b</p>'), '<p>a<BR>b</p>\n');
});
test('HTML whitespace-only text between blocks produces no blank output lines', () => {
  assert.equal(formatHTML('<div>\n\n\n<p>a</p>\n\n\n<p>b</p>\n\n</div>'), '<div>\n  <p>a</p>\n  <p>b</p>\n</div>\n');
});

// =========================================================== HTML: round-trip notes
test('HTML round-trip: block-only documents converge exactly (minify(format(x)) == minify(x), format(minify(x)) == format(x))', () => {
  const docs = [
    '<div><p>Hello</p><p>World</p></div>',
    '<ul><li>one</li><li>two</li></ul>',
    '<table><tr><td>a</td><td>b</td></tr></table>',
    '<section><h1>T</h1><div><p>x</p></div></section>',
  ];
  for (const s of docs) {
    assert.equal(minifyHTML(formatHTML(s)), minifyHTML(s));
    assert.equal(formatHTML(minifyHTML(s)), formatHTML(s));
  }
});
test('HTML round-trip: format puts inline VOID siblings (br/img) on separate lines beside a block, so minify then keeps ONE space between them (documented whitespace shift)', () => {
  const src = '<div><p>x</p><br><img src="x"></div>';
  assert.equal(minifyHTML(src), src);
  assert.equal(formatHTML(src), '<div>\n  <p>x</p>\n  <br>\n  <img src="x">\n</div>\n');
  const m = minifyHTML(formatHTML(src));
  assert.equal(m, '<div><p>x</p> <br> <img src="x"> </div>');
  // ...but it is stable after that first shift, and tags + words are preserved.
  assert.equal(minifyHTML(m), m);
  assert.deepEqual(htmlShape(m), htmlShape(src));
});

// =========================================================== HTML: edges
test('HTML edge: empty and whitespace-only input', () => {
  assert.equal(formatHTML(''), '\n');
  assert.equal(formatHTML('   \n\t '), '\n');
  assert.equal(minifyHTML(''), '');
  assert.equal(minifyHTML('   \n\t '), '');
});
test('HTML edge: plain text with no tags', () => {
  assert.equal(formatHTML('just   some\n text'), 'just some text\n');
  assert.equal(minifyHTML('  just   some\n text  '), 'just some text');
});
test('HTML edge: deeply nested (50 levels) re-indents correctly and is idempotent', () => {
  const depth = 50;
  const src = '<div>'.repeat(depth) + '<p>deep</p>' + '</div>'.repeat(depth);
  const out = formatHTML(src);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, depth * 2 + 1);
  assert.equal(lines[depth], '  '.repeat(depth) + '<p>deep</p>');
  assert.equal(lines[lines.length - 1], '</div>');
  assert.equal(formatHTML(out), out);
  assert.equal(minifyHTML(out), src);
});
test('HTML edge: unclosed tags are auto-closed on emit (graceful, no throw)', () => {
  assert.equal(formatHTML('<div><p>unclosed'), '<div>\n  <p>unclosed</p>\n</div>\n');
  assert.equal(minifyHTML('<div><p>unclosed'), '<div><p>unclosed</p></div>');
});
test('HTML edge: stray end tag with no opener is silently dropped', () => {
  assert.equal(formatHTML('<div>a</div></span>'), '<div>a</div>\n');
  assert.equal(minifyHTML('<div>a</div></span>'), '<div>a</div>');
});
test('HTML edge: misnested end tag pops to the nearest matching open element', () => {
  // </div> closes the inner <p> implicitly (lenient pop-to-match).
  assert.equal(minifyHTML('<div><p>a</div>b'), '<div><p>a</p></div>b');
});
test('HTML edge: stray "<" is kept as text (never throws)', () => {
  assert.equal(minifyHTML('a < b and c > d'), 'a < b and c > d');
  assert.equal(formatHTML('<div>1 < 2</div>'), '<div>1 < 2</div>\n');
  assert.equal(minifyHTML('<div>1 < 2</div>'), '<div>1 < 2</div>');
});
test('HTML edge: unterminated comment swallows the rest of input; minify drops it', () => {
  assert.equal(minifyHTML('<div><!-- unterminated <p>x</p>'), '<div></div>');
  assert.equal(formatHTML('<div><!-- unterminated <p>x</p>'), '<div>\n  <!-- unterminated <p>x</p>\n</div>\n');
});
test('HTML edge: unterminated comment -- format output is NOT a fixed point: each pass appends another </div> (garbage-in characterization, see HANDOFF)', () => {
  const p1 = formatHTML('<div><!-- unterminated <p>x</p>');
  const p2 = formatHTML(p1);
  const p3 = formatHTML(p2);
  assert.equal(p1, '<div>\n  <!-- unterminated <p>x</p>\n</div>\n');
  assert.equal(p2, '<div>\n  <!-- unterminated <p>x</p>\n</div>\n</div>\n');
  assert.equal(p3, '<div>\n  <!-- unterminated <p>x</p>\n</div>\n</div>\n</div>\n');
});
test('HTML edge: unterminated start tag is consumed to end of input (no throw)', () => {
  assert.equal(minifyHTML('<div class="a'), '<div class="a</div>');
});
test('HTML edge: unicode in text and attribute values', () => {
  const src = '<div title="üñî"><p>日本語 \u{1F600}</p></div>';
  assert.equal(formatHTML(src), '<div title="üñî">\n  <p>日本語 \u{1F600}</p>\n</div>\n');
  assert.equal(minifyHTML(src), src);
});
test('HTML edge: CRLF line endings are normalized to LF in format output', () => {
  assert.equal(formatHTML('<div>\r\n<p>a</p>\r\n</div>'), '<div>\n  <p>a</p>\n</div>\n');
});

// =========================================================== CSS: exact pretty + minify
const CSS_CASES = [
  {
    name: 'simple rule',
    src: 'a{color:red}',
    pretty: 'a {\n  color: red;\n}\n',
    min: 'a{color:red}',
  },
  {
    name: 'multiple selectors -> one per line; minify joins with ","',
    src: 'a,b , c{color:red;margin:0}',
    pretty: 'a,\nb,\nc {\n  color: red;\n  margin: 0;\n}\n',
    min: 'a,b,c{color:red;margin:0}',
  },
  {
    name: 'pseudo-class selector list',
    src: 'a:hover,a:focus{x:y}',
    pretty: 'a:hover,\na:focus {\n  x: y;\n}\n',
    min: 'a:hover,a:focus{x:y}',
  },
  {
    name: 'combinators > + ~ and descendant space',
    src: 'a>b+c~d e{x:y}',
    pretty: 'a>b+c~d e {\n  x: y;\n}\n',
    min: 'a>b+c~d e{x:y}',
  },
  {
    name: 'nested @media with two rules',
    src: '@media (max-width:600px){a{color:red}b{margin:0}}',
    pretty: '@media (max-width:600px) {\n  a {\n    color: red;\n  }\n  b {\n    margin: 0;\n  }\n}\n',
    min: '@media (max-width:600px){a{color:red}b{margin:0}}',
  },
  {
    name: 'nested @supports > @media > rule',
    src: '@supports (display:grid){@media print{a{x:y}}}',
    pretty: '@supports (display:grid) {\n  @media print {\n    a {\n      x: y;\n    }\n  }\n}\n',
    min: '@supports (display:grid){@media print{a{x:y}}}',
  },
  {
    name: 'url(): unquoted w/ ";" and ":" inside, quoted w/ space, padded -- never split or rewritten',
    src: 'a{background:url(data:image/png;base64,AAA=;x)}b{background:url("a b.png")}c{background:url( x.png )}',
    pretty:
      'a {\n  background: url(data:image/png;base64,AAA=;x);\n}\n\n' +
      'b {\n  background: url("a b.png");\n}\n\n' +
      'c {\n  background: url( x.png );\n}\n',
    min: 'a{background:url(data:image/png;base64,AAA=;x)}b{background:url("a b.png")}c{background:url( x.png )}',
  },
  {
    name: 'strings: ";" "{" "}" "," inside quotes are data, not syntax',
    src: 'a::before{content:"a;b{c}";font-family:\'Foo, Bar\'}',
    pretty: 'a::before {\n  content: "a;b{c}";\n  font-family: \'Foo, Bar\';\n}\n',
    min: 'a::before{content:"a;b{c}";font-family:\'Foo, Bar\'}',
  },
  {
    name: '!important (spaced and unspaced)',
    src: 'a{margin:0 !important;color:red!important}',
    pretty: 'a {\n  margin: 0 !important;\n  color: red!important;\n}\n',
    min: 'a{margin:0 !important;color:red!important}',
  },
  {
    name: 'insignificant whitespace inside declarations collapses',
    src: 'a { margin : 0   auto ; padding:1px  2px }',
    pretty: 'a {\n  margin: 0 auto;\n  padding: 1px 2px;\n}\n',
    min: 'a{margin:0 auto;padding:1px 2px}',
  },
  {
    name: 'calc() keeps its inner spaces',
    src: 'a{b:calc(1px + 2px)}',
    pretty: 'a {\n  b: calc(1px + 2px);\n}\n',
    min: 'a{b:calc(1px + 2px)}',
  },
  {
    name: 'blank line between top-level rules; runs of blank lines collapse',
    src: 'a{color:red}\n\n\n\nb{color:blue}',
    pretty: 'a {\n  color: red;\n}\n\nb {\n  color: blue;\n}\n',
    min: 'a{color:red}b{color:blue}',
  },
  {
    name: 'at-rules without body (@import url(), @charset) followed by a rule',
    src: '@import url(foo.css);a{x:y}',
    pretty: '@import url(foo.css);\n\na {\n  x: y;\n}\n',
    min: '@import url(foo.css);a{x:y}',
  },
  {
    name: '@charset with string',
    src: '@charset "utf-8";a{x:y}',
    pretty: '@charset "utf-8";\n\na {\n  x: y;\n}\n',
    min: '@charset "utf-8";a{x:y}',
  },
  {
    name: '@font-face',
    src: '@font-face{font-family:X;src:url(x.woff)}',
    pretty: '@font-face {\n  font-family: X;\n  src: url(x.woff);\n}\n',
    min: '@font-face{font-family:X;src:url(x.woff)}',
  },
  {
    name: 'empty rule body',
    src: 'a{}',
    pretty: 'a {\n}\n',
    min: 'a{}',
  },
  {
    name: 'trailing ";" in last declaration is re-added by format / dropped by minify',
    src: 'a{color:red;}',
    pretty: 'a {\n  color: red;\n}\n',
    min: 'a{color:red}',
  },
  {
    name: 'unicode in selector and string',
    src: '.é{content:"☃"}',
    pretty: '.é {\n  content: "☃";\n}\n',
    min: '.é{content:"☃"}',
  },
];

for (const c of CSS_CASES) {
  test(`CSS formatCSS exact: ${c.name}`, () => assert.equal(formatCSS(c.src), c.pretty));
  test(`CSS minifyCSS exact: ${c.name}`, () => assert.equal(minifyCSS(c.src), c.min));
  test(`CSS idempotent (format & minify): ${c.name}`, () => {
    assert.equal(formatCSS(c.pretty), c.pretty);
    assert.equal(formatCSS(formatCSS(c.src)), formatCSS(c.src));
    assert.equal(minifyCSS(c.min), c.min);
    assert.equal(minifyCSS(minifyCSS(c.src)), minifyCSS(c.src));
  });
  test(`CSS round-trip pretty<->minify converge: ${c.name}`, () => {
    assert.equal(minifyCSS(formatCSS(c.src)), minifyCSS(c.src));
    assert.equal(formatCSS(minifyCSS(c.src)), formatCSS(c.src));
  });
}

// =========================================================== CSS: indent option
test('CSS indent: 2 (default) vs 4 vs tab vs explicit 2', () => {
  const src = '@media (max-width:600px){a{color:red}b{margin:0}}';
  assert.equal(formatCSS(src), '@media (max-width:600px) {\n  a {\n    color: red;\n  }\n  b {\n    margin: 0;\n  }\n}\n');
  assert.equal(formatCSS(src, { indent: 2 }), formatCSS(src));
  assert.equal(
    formatCSS(src, { indent: 4 }),
    '@media (max-width:600px) {\n    a {\n        color: red;\n    }\n    b {\n        margin: 0;\n    }\n}\n',
  );
  assert.equal(
    formatCSS(src, { indent: 'tab' }),
    '@media (max-width:600px) {\n\ta {\n\t\tcolor: red;\n\t}\n\tb {\n\t\tmargin: 0;\n\t}\n}\n',
  );
});
test('CSS indent: multi-selector continuation lines align to the nesting pad; each indent idempotent', () => {
  const src = '@media print{a,b{x:y}}';
  assert.equal(formatCSS(src, { indent: 4 }), '@media print {\n    a,\n    b {\n        x: y;\n    }\n}\n');
  for (const indent of [2, 4, 'tab']) {
    const once = formatCSS(src, { indent });
    assert.equal(formatCSS(once, { indent }), once);
  }
});
test('CSS indent: re-formatting at a different indent re-indents (does not stack)', () => {
  assert.equal(formatCSS(formatCSS('a{x:y}', { indent: 4 }), { indent: 2 }), 'a {\n  x: y;\n}\n');
});

// =========================================================== CSS: comments
test('CSS comments: formatCSS keeps a top-level comment on its own line, blank-line separated from rules', () => {
  assert.equal(formatCSS('/* hi */a{color:red}'), '/* hi */\n\na {\n  color: red;\n}\n');
  assert.equal(
    formatCSS('a{color:red;}\n/* c */\nb{x:y}'),
    'a {\n  color: red;\n}\n\n/* c */\n\nb {\n  x: y;\n}\n',
  );
});
test('CSS comments: formatCSS keeps a comment inside a rule body at the body indent', () => {
  assert.equal(formatCSS('a{/* c */color:red}'), 'a {\n  /* c */\n  color: red;\n}\n');
});
test('CSS comments: minifyCSS drops comments', () => {
  assert.equal(minifyCSS('/* hi */a{color:red}'), 'a{color:red}');
  assert.doesNotMatch(minifyCSS('a{color:red}/* tail */'), /\*/);
});
test('CSS comments: comment-looking text inside strings and url() is NOT a comment', () => {
  const src = 'a{content:"/* not */";background:url(/*x*/.png)}';
  assert.equal(minifyCSS(src), src);
  assert.equal(formatCSS(src), 'a {\n  content: "/* not */";\n  background: url(/*x*/.png);\n}\n');
});
test('CSS comments: a comment containing braces/semicolons does not break structure', () => {
  assert.equal(minifyCSS('/* a{b:c;} */d{e:f}'), 'd{e:f}');
  assert.equal(formatCSS('/* a{b:c;} */d{e:f}'), '/* a{b:c;} */\n\nd {\n  e: f;\n}\n');
});
test('CSS comments: format is idempotent with comments (top-level and in-body)', () => {
  for (const s of ['/* hi */a{color:red}', 'a{/* c */color:red}', 'a{color:red;}\n/* c */\nb{x:y}', '/* a{b:c;} */d{e:f}']) {
    assert.equal(formatCSS(formatCSS(s)), formatCSS(s));
  }
});
// FIXED under #1014-K: a dropped comment now gets the same neighbour-trimming as a whitespace run,
// so minifyCSS inserts a separating space only between two real tokens — never adjacent to a
// structural char. minify is now idempotent and minify(format(x)) == minify(x).
test('CSS comments: minify between rules leaves NO stray space [#1014-K]', () => {
  assert.equal(minifyCSS('a{color:red}\n/* c */\nb{x:y}'), 'a{color:red}b{x:y}');
});
test('CSS comments: minify before ";" leaves NO stray space [#1014-K]', () => {
  assert.equal(minifyCSS('a{color:red/* in */;margin:0}'), 'a{color:red;margin:0}');
});
test('CSS comments: minify is idempotent with comments [#1014-K]', () => {
  for (const s of ['a{color:red}\n/* c */\nb{x:y}', '/* hi */a{color:red/* in */;margin:0 !important}']) {
    assert.equal(minifyCSS(minifyCSS(s)), minifyCSS(s));
  }
});
test('CSS comments: minify(format(x)) == minify(x) with comments [#1014-K]', () => {
  const s = '/* hi */a{color:red/* in */;margin:0 !important}';
  assert.equal(minifyCSS(formatCSS(s)), minifyCSS(s));
});
test('CSS comments: minify after "{" leaves NO stray space [#1014-K]', () => {
  assert.equal(minifyCSS('a{/* c */color:red}'), 'a{color:red}');
});
test('CSS comments: minify output never loses or reorders content (whitespace-stripped equality)', () => {
  // Guard: content is never lost or reordered by comment handling.
  const strip = (x) => x.replace(/\s+/g, '');
  assert.equal(strip(minifyCSS('a{color:red}\n/* c */\nb{x:y}')), 'a{color:red}b{x:y}');
  assert.equal(strip(minifyCSS('a{color:red/* in */;margin:0}')), 'a{color:red;margin:0}');
  assert.equal(strip(minifyCSS('a{/* c */color:red}')), 'a{color:red}');
});

// =========================================================== CSS: round-trip
test('CSS round-trip: a realistic stylesheet converges both ways and is stable', () => {
  const src =
    '@charset "utf-8";\n:root{--c:#fff;--font:"Helvetica Neue",Arial}\n' +
    'body,html{margin:0;font:14px/1.4 var(--font)}\n' +
    '@media (min-width:600px) and (max-width:900px){.a>.b{color:red!important}.c::after{content:"}"}}\n' +
    '.i{background:url(data:image/svg+xml;utf8,<svg xmlns=\'x\'/>) no-repeat}\n';
  const f = formatCSS(src);
  const m = minifyCSS(src);
  assert.equal(formatCSS(f), f);
  assert.equal(minifyCSS(m), m);
  assert.equal(minifyCSS(f), m);
  assert.equal(formatCSS(m), f);
  assert.ok(f.includes('content: "}";'));
  assert.ok(m.includes('content:"}"'));
  assert.ok(m.includes('url(data:image/svg+xml;utf8,<svg xmlns=\'x\'/>)'));
});

// =========================================================== CSS: edges
test('CSS edge: empty and whitespace-only input', () => {
  assert.equal(formatCSS(''), '\n');
  assert.equal(formatCSS(' \n\t '), '\n');
  assert.equal(minifyCSS(''), '');
  assert.equal(minifyCSS(' \n\t '), '');
});
test('CSS edge: deeply nested at-rules (30 levels of @media) indent correctly and are idempotent', () => {
  const depth = 30;
  const src = '@media print{'.repeat(depth) + 'a{x:y}' + '}'.repeat(depth);
  const out = formatCSS(src);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, depth * 2 + 3);
  assert.equal(lines[depth], '  '.repeat(depth) + 'a {');
  assert.equal(lines[depth + 1], '  '.repeat(depth + 1) + 'x: y;');
  assert.equal(formatCSS(out), out);
  assert.equal(minifyCSS(out), '@media print{'.repeat(depth) + 'a{x:y}' + '}'.repeat(depth));
});
test('CSS edge: unclosed brace -- format auto-closes (graceful); minify passes through unchanged', () => {
  assert.equal(formatCSS('a{color:red'), 'a {\n  color: red;\n}\n');
  assert.equal(minifyCSS('a{color:red'), 'a{color:red');
});
test('CSS edge: stray "}" -- format drops everything after it; minify passes it through', () => {
  assert.equal(formatCSS('a{color:red}}b{x:y}'), 'a {\n  color: red;\n}\n');
  assert.equal(minifyCSS('a{color:red}}b{x:y}'), 'a{color:red}}b{x:y}');
});
test('CSS edge: unterminated comment -- format keeps it as a comment; minify drops it to end of input', () => {
  assert.equal(formatCSS('/* unterminated a{x:y}'), '/* unterminated a{x:y}\n');
  assert.equal(minifyCSS('/* unterminated a{x:y}'), '');
  assert.equal(minifyCSS('b{x:y}/* unterminated'), 'b{x:y}');
});
test('CSS edge: unterminated string swallows to end of input (no throw)', () => {
  assert.equal(minifyCSS('a{content:"unterminated}'), 'a{content:"unterminated}');
  assert.equal(formatCSS('a{content:"unterminated}'), 'a {\n  content: "unterminated};\n}\n');
});
test('CSS edge: doubled ";" -- format normalizes; minify collapses "; ;" and drops the last before "}" [#1014-K]', () => {
  assert.equal(formatCSS('a{color:red;;}'), 'a {\n  color: red;\n}\n');
  assert.equal(minifyCSS('a{color:red;;}'), 'a{color:red}');
  assert.equal(minifyCSS('a{color:red;}'), 'a{color:red}');
});
test('CSS edge: declaration without a colon is kept as-is with ";"', () => {
  assert.equal(formatCSS('a{foo}'), 'a {\n  foo;\n}\n');
});
test('CSS edge: CRLF line endings normalized', () => {
  assert.equal(formatCSS('a{\r\n  color:red;\r\n}\r\n'), 'a {\n  color: red;\n}\n');
  assert.equal(minifyCSS('a{\r\n  color:red;\r\n}\r\n'), 'a{color:red}');
});
test('CSS edge: formatted output is a fixed point and minify of it equals minify of the source (no-comment, well-formed sources)', () => {
  for (const c of CSS_CASES) {
    const f = formatCSS(c.src);
    assert.equal(formatCSS(f), f, c.name);
    assert.equal(minifyCSS(f), minifyCSS(c.src), c.name);
  }
});
