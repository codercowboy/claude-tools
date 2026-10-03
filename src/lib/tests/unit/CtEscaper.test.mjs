// Unit tests for CtEscaper.mjs — table-driven. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: (1) a shared input BATTERY round-tripped through every context pair
// (unescapeX(escapeX(s)) === s); (2) per-context EXACT known-output fixtures (round-trip alone
// cannot catch a no-op escaper); (3) metadata + nest(); (4) escapeFilename (one-way).
// Lossy-by-design: filename (one-way, no unescape) is the only non-round-trip context.
// escapeXml is also characterized for null/undefined/non-string/strict handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../utils/formats/CtEscaper.mjs';

const {
  CONTEXTS, CONTEXTS_BY_ID, DEFAULT_ENABLED, nest, escapeFilename,
} = E;

// ------------------------------------------------------------ shared battery
const BATTERY = {
  'empty': '',
  'ascii': 'Hello, World 123',
  'html specials': '<a href="x">Tom & Jerry\'s</a>',
  'entity-lookalike': '&amp; &lt; &#65; &copy;',
  'quotes': `He said "hi" and 'bye' and \`tick\``,
  'backslashes': 'C:\\path\\to\\file \\n \\\\ \\',
  'newlines/tabs': 'line1\nline2\r\nline3\ttab\vvt\fff\bbs',
  'control chars': '\x00\x01\x07\x1b\x1f\x7f end',
  'digit after control': '\x011\x0012',
  'shell specials': 'echo $HOME `id` $(x) "q" \'s\' ! * ? ; | & > <',
  'sql': "O'Brien'; DROP TABLE x;--",
  'csv': 'a,b,"c"\nd',
  'url specials': 'a b&c=d/e?f#g%h+i:j@k',
  'markdown': '# *bold* _it_ `code` [l](u) {x} ~s~ > q | t - + . !',
  'regex': 'a.b*c+d?e^f$g{1}h(i)|j[k]\\l/m-n',
  'unicode': 'héllo wörld — 日本語 ñ',
  'emoji': 'smile 😀 family 👨‍👩‍👧 flag 🇯🇵',
  'BOM': '\uFEFFbom first',
  'long': 'The quick "brown" fox & <dog>\n'.repeat(500),
};

// ------------------------------------------------------------ context table
const PAIRS = [
  { id: 'Base64', escape: E.escapeBase64, unescape: E.unescapeBase64 },
  { id: 'HtmlText', escape: E.escapeHtmlText, unescape: E.unescapeHtmlText },
  { id: 'HtmlAttr', escape: E.escapeHtmlAttr, unescape: E.unescapeHtmlAttr },
  { id: 'Xml', escape: E.escapeXml, unescape: E.unescapeXml },
  { id: 'Json', escape: E.escapeJson, unescape: E.unescapeJson },
  { id: 'JsString', escape: E.escapeJsString, unescape: E.unescapeJsString },
  { id: 'Java', escape: E.escapeJava, unescape: E.unescapeJava },
  { id: 'CString', escape: E.escapeCString, unescape: E.unescapeCString },
  { id: 'Python', escape: E.escapePython, unescape: E.unescapePython },
  { id: 'ShSingle', escape: E.escapeShSingle, unescape: E.unescapeShSingle },
  { id: 'ShDouble', escape: E.escapeShDouble, unescape: E.unescapeShDouble },
  { id: 'ShAnsiC', escape: E.escapeShAnsiC, unescape: E.unescapeShAnsiC },
  { id: 'PowerShell', escape: E.escapePowerShell, unescape: E.unescapePowerShell },
  { id: 'Sql', escape: E.escapeSql, unescape: E.unescapeSql },
  { id: 'Csv', escape: E.escapeCsv, unescape: E.unescapeCsv },
  { id: 'UrlComponent', escape: E.escapeUrlComponent, unescape: E.unescapeUrlComponent },
  { id: 'UrlFull', escape: E.escapeUrlFull, unescape: E.unescapeUrlFull },
  { id: 'Markdown', escape: E.escapeMarkdown, unescape: E.unescapeMarkdown },
  { id: 'Regex', escape: E.escapeRegex, unescape: E.unescapeRegex },
];

test('table covers every exported escape/unescape pair', () => {
  const exported = Object.keys(E).filter((k) => k.startsWith('escape') && k !== 'escapeFilename');
  assert.equal(PAIRS.length, exported.length);
  for (const p of PAIRS) {
    assert.equal(typeof p.escape, 'function', p.id);
    assert.equal(typeof p.unescape, 'function', p.id);
  }
});

for (const p of PAIRS) {
  test(`${p.id}: round-trip over the shared battery`, () => {
    for (const [name, s] of Object.entries(BATTERY)) {
      const enc = p.escape(s);
      assert.equal(typeof enc, 'string', `${p.id}/${name}: escape returns a string`);
      assert.equal(p.unescape(enc), s, `${p.id}/${name}: unescape(escape(s)) === s`);
    }
  });
}

// ------------------------------------------------------------ exact fixtures
// [context, input, expected]. Multiple rows per context allowed; each context has >= 1.
const FIXTURES = [
  ['Base64', '', ''],
  ['Base64', 'Hello', 'SGVsbG8='],
  ['Base64', 'Hi', 'SGk='],
  ['Base64', 'abc', 'YWJj'],
  ['Base64', 'é', 'w6k='],
  ['Base64', '😀', '8J+YgA=='],
  ['HtmlText', '<a & b>"\'', '&lt;a &amp; b&gt;"\''],
  ['HtmlAttr', '<a & "b" \'c\'>', '&lt;a &amp; &quot;b&quot; &#39;c&#39;&gt;'],
  ['Xml', '<a & "b" \'c\'>', '&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;'],
  ['Json', 'a"b\\c\nd', '"a\\"b\\\\c\\nd"'],
  ['Json', 'é\x01', '"é\\u0001"'],
  ['JsString', 'a"b\\c\nd\te', '"a\\"b\\\\c\\nd\\te"'],
  ['JsString', '\x01\x7f\v', '"\\x01\\x7F\\v"'],
  ['JsString', "it's", '"it\'s"'],
  ['Java', 'a"b\\c\n', '"a\\"b\\\\c\\n"'],
  ['Java', '\x01\x07', '"\\u0001\\u0007"'],
  ['CString', 'a"b\\c\n', '"a\\"b\\\\c\\n"'],
  ['CString', '\x01\x07\v\x1b', '"\\001\\a\\v\\033"'],
  ['Python', "it's \"q\"\n", `'it\\'s "q"\\n'`],
  ['Python', '\x01\x7f', "'\\x01\\x7F'"],
  ['ShSingle', "it's", `'it'\\''s'`],
  ['ShSingle', 'a $b "c"', `'a $b "c"'`],
  ['ShSingle', '', "''"],
  ['ShDouble', 'a$b`c"d\\e', '"a\\$b\\`c\\"d\\\\e"'],
  ['ShDouble', "it's\n", `"it's\n"`],
  ['ShAnsiC', "it's\n\t\\", "$'it\\'s\\n\\t\\\\'"],
  ['ShAnsiC', '\x01\x7f', "$'\\x01\\x7F'"],
  ['PowerShell', "it's", "'it''s'"],
  ['PowerShell', '$x "y"', `'$x "y"'`],
  ['Sql', "O'Brien", "'O''Brien'"],
  ['Sql', '', "''"],
  ['Csv', 'plain', 'plain'],
  ['Csv', 'a,b', '"a,b"'],
  ['Csv', 'say "hi"', '"say ""hi"""'],
  ['Csv', 'l1\nl2', '"l1\nl2"'],
  ['Csv', 'l1\rl2', '"l1\rl2"'],
  ['Csv', '', ''],
  ['UrlComponent', 'a b&c=d/e?f#g', 'a%20b%26c%3Dd%2Fe%3Ff%23g'],
  ['UrlComponent', 'é😀', '%C3%A9%F0%9F%98%80'],
  ['UrlFull', 'http://x.com/a b?q=1&r=é#f', 'http://x.com/a%20b?q=1&r=%C3%A9#f'],
  ['Markdown', '*b* _i_ `c` [l](u) # x', '\\*b\\* \\_i\\_ \\`c\\` \\[l\\]\\(u\\) \\# x'],
  ['Markdown', 'a-b+c.d!e|f>g~h{i}\\', 'a\\-b\\+c\\.d\\!e\\|f\\>g\\~h\\{i\\}\\\\'],
  ['Markdown', 'plain text', 'plain text'],
  ['Regex', 'a.b*c+d?e', 'a\\.b\\*c\\+d\\?e'],
  ['Regex', '^$()|[]{}\\/-', '\\^\\$\\(\\)\\|\\[\\]\\{\\}\\\\\\/\\-'],
  ['Regex', 'abc 123', 'abc 123'],
];
const BY_ID = Object.fromEntries(PAIRS.map((p) => [p.id, p]));

test('every context has at least one exact fixture', () => {
  const have = new Set(FIXTURES.map((f) => f[0]));
  for (const p of PAIRS) assert.ok(have.has(p.id), `no fixture for ${p.id}`);
});

for (const [id, input, expected] of FIXTURES) {
  test(`${id}: escape(${JSON.stringify(input)}) === ${JSON.stringify(expected)}`, () => {
    assert.equal(BY_ID[id].escape(input), expected);
  });
  test(`${id}: unescape(${JSON.stringify(expected)}) === ${JSON.stringify(input)}`, () => {
    assert.equal(BY_ID[id].unescape(expected), input);
  });
}

// Fixtures cross-checked against independent canonical implementations.
test('canonical cross-checks (Buffer base64, JSON.stringify, encodeURIComponent)', () => {
  for (const s of Object.values(BATTERY)) {
    assert.equal(E.escapeBase64(s), Buffer.from(s, 'utf8').toString('base64'));
    assert.equal(E.escapeJson(s), JSON.stringify(s));
    assert.equal(E.escapeUrlComponent(s), encodeURIComponent(s));
  }
});

test('Regex: escaped text matches itself literally and only itself', () => {
  const s = 'a.b*c+d?e^f$g{1}h(i)|j[k]\\l/m-n';
  const re = new RegExp('^' + E.escapeRegex(s) + '$');
  assert.ok(re.test(s));
  assert.ok(!re.test('aXb*c+d?e^f$g{1}h(i)|j[k]\\l/m-n'));
});

// ------------------------------------------------------------ characterizations
test('characterize: Base64 BOM survives (ignoreBOM decoder)', () => {
  assert.equal(E.unescapeBase64(E.escapeBase64('\uFEFFx')), '\uFEFFx');
});
test('characterize: Base64 decoder tolerates whitespace/missing padding, rejects bad chars', () => {
  assert.equal(E.unescapeBase64('SGVs\nbG8'), 'Hello');
  assert.throws(() => E.unescapeBase64('SGV$bG8='), /Invalid Base64/);
});
test('characterize: control chars use deterministic forms per language (no ambiguity)', () => {
  assert.equal(E.escapeJsString('\x01'), '"\\x01"');
  assert.equal(E.escapeJava('\x01'), '"\\u0001"');
  assert.equal(E.escapeCString('\x01'), '"\\001"');
  // C octal followed by a digit char must not merge into one escape
  assert.equal(E.escapeCString('\x011'), '"\\0011"');
  assert.equal(E.unescapeCString('"\\0011"'), '\x011');
});
test('characterize: HTML decoders handle numeric/named entities; unknown entities left alone', () => {
  assert.equal(E.unescapeHtmlText('&#65;&#x42;&copy;&nbsp;'), 'AB©\u00a0');
  assert.equal(E.unescapeHtmlText('&bogus; &#xFFFFFFFF;'), '&bogus; &#xFFFFFFFF;');
});
test('characterize: decoders tolerate missing delimiters', () => {
  assert.equal(E.unescapeJsString('a\\nb'), 'a\nb');
  assert.equal(E.unescapeSql("O''Brien"), "O'Brien");
  assert.equal(E.unescapeShSingle("'it'\\''s'"), "it's"); // the '\\'' bridge needs the quoted form
  assert.equal(E.unescapeJson('a\\nb'), 'a\nb');
  assert.equal(E.unescapePython('r"x"'), 'x');
});
test('characterize: UrlFull keeps reserved chars; UrlComponent encodes them', () => {
  assert.equal(E.escapeUrlFull('a:b/c?d=e&f#g'), 'a:b/c?d=e&f#g');
  assert.equal(E.escapeUrlComponent('a:b/c?d=e&f#g'), 'a%3Ab%2Fc%3Fd%3De%26f%23g');
});
test('characterize: URL encoders throw on lone surrogates (native behavior)', () => {
  assert.throws(() => E.escapeUrlComponent('\ud800'), URIError);
  assert.throws(() => E.escapeUrlFull('\ud800'), URIError);
});
test('characterize: Csv unescape of unquoted text is identity', () => {
  assert.equal(E.unescapeCsv('abc'), 'abc');
});
test('escapeXml: null/undefined pass through, non-strings coerced, strict throws', () => {
  assert.equal(E.escapeXml(null), null);
  assert.equal(E.escapeXml(undefined), undefined);
  assert.equal(E.escapeXml(42), '42');
  assert.equal(E.escapeXml(true), 'true');
  assert.throws(() => E.escapeXml(42, true), TypeError);
  assert.equal(E.escapeXml('<', true), '&lt;');
});

// ------------------------------------------------------------ metadata
test('CONTEXTS: every entry has id/label/group/escape; ids unique', () => {
  assert.ok(CONTEXTS.length >= 20);
  const ids = CONTEXTS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CONTEXTS) {
    assert.ok(c.id && typeof c.id === 'string');
    assert.ok(c.label && c.group && c.note);
    assert.equal(typeof c.escape, 'function', c.id);
    assert.equal(typeof c.roundTrip, 'boolean', c.id);
    if (c.roundTrip) assert.equal(typeof c.unescape, 'function', c.id);
    else assert.equal(c.unescape, null, c.id);
  }
});
test('CONTEXTS: only filename is non-round-trip', () => {
  assert.deepEqual(CONTEXTS.filter((c) => !c.roundTrip).map((c) => c.id), ['filename']);
});
test('CONTEXTS_BY_ID maps every context by id to the same object', () => {
  assert.equal(Object.keys(CONTEXTS_BY_ID).length, CONTEXTS.length);
  for (const c of CONTEXTS) assert.equal(CONTEXTS_BY_ID[c.id], c);
});
test('CONTEXTS: metadata functions are the exported pairs and round-trip the battery', () => {
  const ROUNDTRIP = CONTEXTS.filter((c) => c.roundTrip);
  assert.equal(ROUNDTRIP.length, PAIRS.length);
  for (const c of ROUNDTRIP) {
    for (const [name, s] of Object.entries(BATTERY)) {
      assert.equal(c.unescape(c.escape(s)), s, `${c.id}/${name}`);
    }
  }
});
test('DEFAULT_ENABLED is a unique subset of CONTEXTS ids', () => {
  assert.ok(DEFAULT_ENABLED.length > 0);
  assert.equal(new Set(DEFAULT_ENABLED).size, DEFAULT_ENABLED.length);
  for (const id of DEFAULT_ENABLED) assert.ok(id in CONTEXTS_BY_ID, id);
});

// ------------------------------------------------------------ nest
test('nest: composes two contexts in order with per-step values', () => {
  const r = nest(['json', 'sh-double'], 'a"b');
  assert.equal(r.steps.length, 2);
  assert.deepEqual(r.steps[0], { id: 'json', label: 'JSON string', value: '"a\\"b"' });
  assert.equal(r.steps[1].id, 'sh-double');
  // sh-double then escapes \ and " of the JSON output
  assert.equal(r.steps[1].value, '"\\"a\\\\\\"b\\""');
  assert.equal(r.output, r.steps[1].value);
});
test('nest: order matters', () => {
  const a = nest(['html-text', 'url-component'], '<&>').output;
  const b = nest(['url-component', 'html-text'], '<&>').output;
  assert.equal(a, '%26lt%3B%26amp%3B%26gt%3B');
  assert.equal(b, '%3C%26%3E');
  assert.notEqual(a, b);
});
test('nest: unwinding the chain in reverse recovers the input', () => {
  const chain = ['json', 'sh-single', 'base64'];
  const s = `q"uote 'single' \\ \n`;
  let v = nest(chain, s).output;
  for (const id of [...chain].reverse()) v = CONTEXTS_BY_ID[id].unescape(v);
  assert.equal(v, s);
});
test('nest: empty chain is identity; unknown ids are skipped', () => {
  assert.deepEqual(nest([], 'x'), { steps: [], output: 'x' });
  const r = nest(['nope', 'sql'], "a'b");
  assert.equal(r.steps.length, 1);
  assert.equal(r.output, "'a''b'");
});

// ------------------------------------------------------------ escapeFilename (one-way)
test('escapeFilename: illegal chars replaced, collapsed, trimmed', () => {
  assert.equal(escapeFilename('Hello World'), 'hello-world');
  assert.equal(escapeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j'.replace(/-g-/, 'g-'));
  assert.equal(escapeFilename('a   b'), 'a-b');
  assert.equal(escapeFilename('--a--b--'), 'a-b');
  assert.equal(escapeFilename('.hidden.'), 'hidden');
  assert.equal(escapeFilename('keep_under.score-ok.txt'), 'keep_under.score-ok.txt');
  assert.equal(escapeFilename(`it's "x"`), 'its-x');
});
test('escapeFilename: strips diacritics, non-latin collapses to untitled', () => {
  assert.equal(escapeFilename('Café Crème'), 'cafe-creme');
  assert.equal(escapeFilename('日本語'), 'untitled');
  assert.equal(escapeFilename('😀'), 'untitled');
});
test('escapeFilename: empty / all-illegal -> untitled', () => {
  assert.equal(escapeFilename(''), 'untitled');
  assert.equal(escapeFilename('***'), 'untitled');
  assert.equal(escapeFilename('...'), 'untitled');
});
test('escapeFilename: output only [a-z0-9._-] over the battery; one-way (lossy)', () => {
  for (const s of Object.values(BATTERY)) assert.match(escapeFilename(s), /^[a-z0-9._-]+$/);
  assert.equal(escapeFilename('A B'), escapeFilename('a-b')); // distinct inputs collide
});
test('escapeFilename: reserved names get a "_" prefix; no length cap [#1014-O]', () => {
  // Windows-reserved device names are now prefixed with "_" (invalid even with an extension).
  assert.equal(escapeFilename('CON'), '_con');
  assert.equal(escapeFilename('NUL.txt'), '_nul.txt');
  assert.equal(escapeFilename('COM1'), '_com1');
  assert.equal(escapeFilename('lpt9.log'), '_lpt9.log');
  // a non-reserved name that merely contains a reserved substring is untouched
  assert.equal(escapeFilename('console.txt'), 'console.txt');
  // No length cap.
  assert.equal(escapeFilename('a'.repeat(1000)).length, 1000);
});
