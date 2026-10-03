// Unit tests for CtPretty.mjs -- SQL + JavaScript ONLY (Phase 10c; completes the CtPretty split).
// JSON/YAML (10a) and HTML/CSS (10b) are covered by other files. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Both engines are PRETTY-PRINT + SAFE-MINIFY only: minify strips comments + insignificant
// whitespace and NEVER renames/rewrites/reorders. The overriding invariant is semantic
// equivalence, asserted via the exported tokenizers: the significant (non-ws, non-comment)
// token stream must survive minify unchanged. Exact fixtures are pinned to the lib's ACTUAL output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeSQL, formatSQL, minifySQL,
  tokenizeJS, formatJS, minifyJS,
} from '../../utils/formats/CtPretty.mjs';

// ------------------------------------------------------------------ helpers
const sig = (toks) => toks.filter((t) => t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment');
const pairs = (toks) => toks.map((t) => [t.type, t.value]);
const sigJS = (src) => pairs(sig(tokenizeJS(src)));
const sigSQL = (src) => pairs(sig(tokenizeSQL(src)));
const jsTok = (src) => pairs(tokenizeJS(src).filter((t) => t.type !== 'ws'));
const sqlTok = (src) => pairs(tokenizeSQL(src).filter((t) => t.type !== 'ws'));

// =========================================================== SQL tokenizer
test('tokenizeSQL: empty -> []', () => {
  assert.deepEqual(tokenizeSQL(''), []);
});

test('tokenizeSQL: exact token array (words, strings w/ escape, quoted id, number, comments, ops)', () => {
  const src = "SELECT a, 'it''s' FROM \"My T\" WHERE x>=1.5e-3 -- c\n/* b */ AND y<>0x1F;";
  assert.deepEqual(tokenizeSQL(src), [
    { type: 'word', value: 'SELECT' }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'a' }, { type: 'punct', value: ',' }, { type: 'ws', value: ' ' },
    { type: 'string', value: "'it''s'" }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'FROM' }, { type: 'ws', value: ' ' },
    { type: 'quotedId', value: '"My T"' }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'WHERE' }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'x' }, { type: 'punct', value: '>' }, { type: 'punct', value: '=' },
    { type: 'number', value: '1.5e-3' }, { type: 'ws', value: ' ' },
    { type: 'lineComment', value: '-- c' }, { type: 'ws', value: '\n' },
    { type: 'blockComment', value: '/* b */' }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'AND' }, { type: 'ws', value: ' ' },
    { type: 'word', value: 'y' }, { type: 'punct', value: '<' }, { type: 'punct', value: '>' },
    { type: 'number', value: '0x1F' }, { type: 'punct', value: ';' },
  ]);
});

test('tokenizeSQL: tokens concatenate back to the exact source (lossless)', () => {
  const src = "SELECT 'a''b', \"q\"\"x\", `bt` /* c */ -- d\nFROM t;";
  assert.equal(tokenizeSQL(src).map((t) => t.value).join(''), src);
});

test('tokenizeSQL: strings/comments captured whole; keywords inside them are not tokens', () => {
  assert.deepEqual(sqlTok("'SELECT -- not a comment /* nor this */'"),
    [['string', "'SELECT -- not a comment /* nor this */'"]]);
  assert.deepEqual(sqlTok('-- SELECT FROM\nx'), [['lineComment', '-- SELECT FROM'], ['word', 'x']]);
  assert.deepEqual(sqlTok('/* a\nb\n*/x'), [['blockComment', '/* a\nb\n*/'], ['word', 'x']]);
});

test('tokenizeSQL: doubled-quote escapes in single-quoted, "double", and `backtick` ids', () => {
  assert.deepEqual(sqlTok("'a''b'"), [['string', "'a''b'"]]);
  assert.deepEqual(sqlTok('"a""b"'), [['quotedId', '"a""b"']]);
  assert.deepEqual(sqlTok('`a``b`'), [['quotedId', '`a``b`']]);
  assert.deepEqual(sqlTok("''"), [['string', "''"]]);
});

test('tokenizeSQL: numbers (int, decimal, leading dot, exponent, hex) and stray +/-', () => {
  assert.deepEqual(sqlTok('42 3.14 .5 1e10 1E+5 0xFF'),
    [['number', '42'], ['number', '3.14'], ['number', '.5'], ['number', '1e10'], ['number', '1E+5'], ['number', '0xFF']]);
  // a +/- that is not an exponent sign terminates the number
  assert.deepEqual(sqlTok('1-2'), [['number', '1'], ['punct', '-'], ['number', '2']]);
  assert.deepEqual(sqlTok('1+2'), [['number', '1'], ['punct', '+'], ['number', '2']]);
});

test('tokenizeSQL: words allow _ @ # $ and digits; each other char is its own punct', () => {
  assert.deepEqual(sqlTok('@v #t $x a_1'), [['word', '@v'], ['word', '#t'], ['word', '$x'], ['word', 'a_1']]);
  assert.deepEqual(sqlTok('a.b(*)'),
    [['word', 'a'], ['punct', '.'], ['word', 'b'], ['punct', '('], ['punct', '*'], ['punct', ')']]);
});

test('tokenizeSQL: a lone "-" is an operator, "--" starts a comment', () => {
  assert.deepEqual(sqlTok('a-b'), [['word', 'a'], ['punct', '-'], ['word', 'b']]);
  assert.deepEqual(sqlTok('a--b'), [['word', 'a'], ['lineComment', '--b']]);
});

test('tokenizeSQL: whitespace runs (incl newlines/tabs) are a single ws token', () => {
  assert.deepEqual(tokenizeSQL('a \n\t b'),
    [{ type: 'word', value: 'a' }, { type: 'ws', value: ' \n\t ' }, { type: 'word', value: 'b' }]);
});

// =========================================================== SQL malformed / edges
test('tokenizeSQL malformed: unterminated string/quoted-id/block-comment are best-effort to EOF (no throw)', () => {
  assert.deepEqual(sqlTok("select 'abc"), [['word', 'select'], ['string', "'abc"]]);
  assert.deepEqual(sqlTok('select "abc'), [['word', 'select'], ['quotedId', '"abc']]);
  assert.deepEqual(sqlTok('select /* abc'), [['word', 'select'], ['blockComment', '/* abc']]);
  assert.deepEqual(sqlTok('select -- abc'), [['word', 'select'], ['lineComment', '-- abc']]);
});

test('SQL malformed: format/minify do not throw; unterminated string is preserved verbatim', () => {
  assert.equal(formatSQL("select 'abc"), "select 'abc");
  assert.equal(minifySQL("select 'abc /* x"), "select 'abc /* x");
  assert.equal(minifySQL('select /* abc'), 'select');
});

test('SQL edges: empty / whitespace-only input -> empty string for both format and minify', () => {
  assert.equal(formatSQL(''), '');
  assert.equal(minifySQL(''), '');
  assert.equal(minifySQL(' \n\t '), '');
  assert.equal(formatSQL('   '), '');
});

test('SQL edges: stray characters become punct tokens and survive minify', () => {
  assert.deepEqual(sqlTok('a ~ ! ^ b'), [['word', 'a'], ['punct', '~'], ['punct', '!'], ['punct', '^'], ['word', 'b']]);
  assert.equal(minifySQL('a ~ ! ^ b'), 'a ~ ! ^ b');
});

test('SQL unicode: quoted ids / strings / comments carry non-ASCII verbatim through format + minify', () => {
  const src = "SELECT \"nomé\", '日本語 \u{1F600}' FROM t -- café\n";
  assert.deepEqual(sqlTok(src).slice(1, 4), [['quotedId', '"nomé"'], ['punct', ','], ['string', "'日本語 \u{1F600}'"]]);
  assert.equal(minifySQL(src), "SELECT \"nomé\", '日本語 \u{1F600}' FROM t");
  assert.ok(formatSQL(src).includes("'日本語 \u{1F600}'"));
  assert.ok(formatSQL(src).includes('"nomé"'));
});

// =========================================================== SQL pretty
test('formatSQL: exact fixture (default: keyword case unchanged, 2-space indent)', () => {
  assert.equal(
    formatSQL('select a,b from t where x=1 and y=2 order by a;'),
    'select a,\n   b\nfrom t\nwhere x = 1\n  and y = 2\norder by a;',
  );
});

test('formatSQL: exact fixture with keywordCase upper + indent 4', () => {
  assert.equal(
    formatSQL('select a,b from t where x=1 and y=2 order by a;', { keywordCase: 'upper', indent: 4 }),
    'SELECT a,\n     b\nFROM t\nWHERE x = 1\n    AND y = 2\nORDER BY a;',
  );
});

test('formatSQL: keywordCase lower / upper / unchanged; non-keywords and quoted/strings untouched', () => {
  const src = 'Select Name From "Select" Where X = \'From\'';
  assert.equal(formatSQL(src, { keywordCase: 'upper' }), 'SELECT Name\nFROM "Select"\nWHERE X = \'From\'');
  assert.equal(formatSQL(src, { keywordCase: 'lower' }), 'select Name\nfrom "Select"\nwhere X = \'From\'');
  assert.equal(formatSQL(src, { keywordCase: 'unchanged' }), 'Select Name\nFrom "Select"\nWhere X = \'From\'');
});

test('formatSQL: indent option -- tab, 0, default 2 (sub-clause AND is indented one level)', () => {
  const src = 'select 1 from t where a=1 and b=2';
  assert.equal(formatSQL(src, { indent: 'tab' }), 'select 1\nfrom t\nwhere a = 1\n\tand b = 2');
  assert.equal(formatSQL(src, { indent: 0 }), 'select 1\nfrom t\nwhere a = 1\nand b = 2');
  assert.equal(formatSQL(src), 'select 1\nfrom t\nwhere a = 1\n  and b = 2');
});

test('formatSQL: multi-word clauses (GROUP BY, ORDER BY, LEFT OUTER JOIN, INSERT INTO) break once', () => {
  assert.equal(
    formatSQL('select a from t left outer join u on t.id=u.id group by a order by a', { keywordCase: 'upper' }),
    'SELECT a\nFROM t\nLEFT OUTER JOIN u\n  ON t.id = u.id\nGROUP BY a\nORDER BY a',
  );
  assert.equal(
    formatSQL("insert into t (a, b) values (1, 'x');", { keywordCase: 'upper' }),
    "INSERT INTO t(a, b)\nVALUES (1, 'x');",
  );
});

test('formatSQL: function-call parens hug, keyword functions (COUNT) hug, commas inside parens stay inline', () => {
  assert.equal(formatSQL('select count(*), max(a) from t'), 'select count(*),\n   max(a)\nfrom t');
  assert.equal(formatSQL('select a from t where a in (1,2,3)'), 'select a\nfrom t\nwhere a in (1, 2, 3)');
});

test('formatSQL: comments are preserved (line comment forces a break after it)', () => {
  const out = formatSQL('select a -- pick a\nfrom t /* tbl */ where 1=1');
  assert.ok(out.includes('-- pick a'));
  assert.ok(out.includes('/* tbl */'));
  assert.deepEqual(sigSQL(out).map(([, v]) => v.toLowerCase()), sigSQL('select a from t where 1=1').map(([, v]) => v.toLowerCase()));
  assert.equal(tokenizeSQL(out).filter((t) => t.type === 'lineComment').length, 1);
});

test('formatSQL: strings with newlines/keywords/semicolons are never reflowed', () => {
  const out = formatSQL("select 'a  from  where ; b' , \"x  y\" from t");
  assert.ok(out.includes("'a  from  where ; b'"));
  assert.ok(out.includes('"x  y"'));
});

test('formatSQL: idempotent -- format(format(x)) === format(x) (several inputs / options)', () => {
  const inputs = [
    'select a,b from t where x=1 and y=2 order by a;',
    'select count(*) from (select id from u) x left outer join y on x.id=y.id where a in (1,2)',
    "insert into t (a,b) values (1,'x'); update t set a=2 where b=3; delete from t where c=4;",
    'select a -- c\nfrom t',
    'WITH x AS (SELECT 1) SELECT * FROM x UNION ALL SELECT 2',
  ];
  for (const src of inputs) {
    for (const opts of [{}, { keywordCase: 'upper' }, { keywordCase: 'lower', indent: 4 }]) {
      const once = formatSQL(src, opts);
      assert.equal(formatSQL(once, opts), once, `not idempotent for ${JSON.stringify(src)} ${JSON.stringify(opts)}`);
    }
  }
});

test('formatSQL: a subquery "(SELECT ...)" opens without a stray blank line [#1014-O.2]', () => {
  assert.equal(formatSQL('SELECT * FROM (SELECT a FROM b)'),
    'SELECT *\nFROM (\n  SELECT a\n  FROM b)');
  // nested subqueries indent one level each, still no blank lines
  assert.equal(formatSQL('select * from (select * from (select 1) a) b'),
    'select *\nfrom (\n  select *\n  from (\n    select 1) a) b');
  assert.ok(!formatSQL('SELECT * FROM (SELECT a FROM b)').includes('\n\n'));
});

test('formatSQL: only whitespace + keyword case change -- significant tokens equal (case-insensitive words)', () => {
  const src = "select a,b,'It''s' from \"T 1\" t where t.x>=1.5 and (y=2 or z<>3) group by a having count(*)>1 order by b desc limit 10;";
  const norm = (arr) => arr.map(([ty, v]) => (ty === 'word' ? [ty, v.toLowerCase()] : [ty, v]));
  assert.deepEqual(norm(sigSQL(formatSQL(src))), norm(sigSQL(src)));
  assert.deepEqual(norm(sigSQL(formatSQL(src, { keywordCase: 'upper' }))), norm(sigSQL(src)));
});

// =========================================================== SQL minify
test('minifySQL: exact fixture (comments stripped, ws collapsed to single spaces, no ws added)', () => {
  assert.equal(minifySQL('SELECT  a ,\n b -- c\n FROM /* x */ t ;'), 'SELECT a , b FROM t ;');
});

test('minifySQL: strings and quoted identifiers survive VERBATIM (inner ws, comment markers, keywords)', () => {
  assert.equal(minifySQL("SELECT 'a  b' FROM \"x  y\""), "SELECT 'a  b' FROM \"x  y\"");
  assert.equal(minifySQL("SELECT '-- not a comment', '/* nor */' , '  ; ' FROM t"),
    "SELECT '-- not a comment', '/* nor */' , '  ; ' FROM t");
  assert.equal(minifySQL("SELECT 'it''s' , `a  b`"), "SELECT 'it''s' , `a  b`");
});

test('minifySQL: strips both comment kinds; a comment between tokens leaves one separating space', () => {
  assert.equal(minifySQL('a/**/b'), 'a b');
  assert.equal(minifySQL('a -- x\nb'), 'a b');
  assert.equal(minifySQL('-- only a comment'), '');
  assert.equal(minifySQL('/* only */'), '');
});

test('minifySQL: adjacent minus operators never fuse into a "--" comment', () => {
  const m = minifySQL('select 1 - -1');
  assert.equal(m, 'select 1 - -1');
  assert.deepEqual(sigSQL(m), sigSQL('select 1 - -1'));
  assert.ok(!tokenizeSQL(m).some((t) => t.type === 'lineComment'));
});

test('minifySQL: leading/trailing whitespace trimmed; idempotent', () => {
  assert.equal(minifySQL('\n  select 1  \n'), 'select 1');
  const inputs = [
    'SELECT  a ,\n b -- c\n FROM /* x */ t ;',
    "select 'a  b', \"x  y\" from t where a  =  1",
    '  select 1  ',
    '',
  ];
  for (const src of inputs) assert.equal(minifySQL(minifySQL(src)), minifySQL(src));
});

test('SQL semantic fidelity: significant token stream identical before/after minify (battery)', () => {
  const battery = [
    'select a,b from t where x=1 and y=2 order by a;',
    "SELECT 'it''s' , \"My  Col\" , `bt` /* c */ FROM t -- end\n",
    'select count(*) from (select id from u) x left outer join y on x.id=y.id where a in (1,2)',
    "insert into t(a,b) values (1,'x -- y'),(2,'/* z */');",
    'select 1 - -1, 2-3, 1e-3, .5, 0xFF from dual',
    'select a\n\n\n\tfrom\n\n t  where\n\n b  =  1',
    "update t set a = 'x;y' where b = \"c  d\"",
    'select * from t -- trailing comment no newline',
    'with x as (select 1) select * from x union all select 2',
    "select '日本' , \"café\" from t",
  ];
  for (const src of battery) {
    assert.deepEqual(sigSQL(minifySQL(src)), sigSQL(src), `significant tokens changed for ${JSON.stringify(src)}`);
  }
});

test('SQL semantic fidelity: format (case-folded words) also preserves the significant stream (battery)', () => {
  const battery = [
    "SELECT 'it''s' , \"My  Col\" FROM t WHERE a=1 -- end\n",
    "insert into t(a,b) values (1,'x -- y'),(2,'/* z */');",
    'select count(*) from (select id from u) x where a in (1,2)',
  ];
  const norm = (arr) => arr.map(([ty, v]) => (ty === 'word' ? [ty, v.toLowerCase()] : [ty, v]));
  for (const src of battery) {
    assert.deepEqual(norm(sigSQL(formatSQL(src))), norm(sigSQL(src)), `format changed tokens for ${JSON.stringify(src)}`);
  }
});

test('SQL: already-minified input is stable under minify; deeply nested parens survive', () => {
  const min = 'SELECT a,b FROM t WHERE x=1';
  assert.equal(minifySQL(min), min);
  const deep = 'select ' + '('.repeat(40) + '1' + ')'.repeat(40);
  assert.deepEqual(sigSQL(minifySQL(deep)), sigSQL(deep));
  const nested = 'select * from (select * from (select * from (select 1) a) b) c';
  assert.deepEqual(sigSQL(minifySQL(formatSQL(nested))), sigSQL(nested).map(([ty, v]) => [ty, v]));
  assert.equal(formatSQL(formatSQL(deep)), formatSQL(deep));
});

// =========================================================== JS tokenizer
test('tokenizeJS: empty -> []', () => {
  assert.deepEqual(tokenizeJS(''), []);
});

test('tokenizeJS: exact token array for a plain statement (types: name/number/string/punct/ws)', () => {
  assert.deepEqual(tokenizeJS("const x = 1 + 'a';"), [
    { type: 'name', value: 'const' }, { type: 'ws', value: ' ' },
    { type: 'name', value: 'x' }, { type: 'ws', value: ' ' },
    { type: 'punct', value: '=' }, { type: 'ws', value: ' ' },
    { type: 'number', value: '1' }, { type: 'ws', value: ' ' },
    { type: 'punct', value: '+' }, { type: 'ws', value: ' ' },
    { type: 'string', value: "'a'" }, { type: 'punct', value: ';' },
  ]);
});

test('tokenizeJS: tokens concatenate back to the exact source (lossless)', () => {
  const src = "a = /re[/]x/gi.test(`t${b + `n${c}`}e`) // c\n/* d */ x /= 2; s = 'q\\'z'";
  assert.equal(tokenizeJS(src).map((t) => t.value).join(''), src);
});

test('tokenizeJS regex-vs-division: identifiers => division (a / b / c)', () => {
  assert.deepEqual(jsTok('a / b / c'),
    [['name', 'a'], ['punct', '/'], ['name', 'b'], ['punct', '/'], ['name', 'c']]);
  assert.deepEqual(jsTok('a/b/c'),
    [['name', 'a'], ['punct', '/'], ['name', 'b'], ['punct', '/'], ['name', 'c']]);
});

test('tokenizeJS regex-vs-division: after regex-keyword (return/typeof/…) => regex', () => {
  assert.deepEqual(jsTok('return /re/g'), [['name', 'return'], ['regex', '/re/g']]);
  assert.deepEqual(jsTok('typeof /x/'), [['name', 'typeof'], ['regex', '/x/']]);
  assert.deepEqual(jsTok('case /x/:'), [['name', 'case'], ['regex', '/x/'], ['punct', ':']]);
});

test('tokenizeJS regex-vs-division: value keywords (this/true/null/…) => division', () => {
  assert.deepEqual(jsTok('this / 2 / 3'),
    [['name', 'this'], ['punct', '/'], ['number', '2'], ['punct', '/'], ['number', '3']]);
  assert.deepEqual(jsTok('true/1/2'),
    [['name', 'true'], ['punct', '/'], ['number', '1'], ['punct', '/'], ['number', '2']]);
});

test('tokenizeJS regex-vs-division: after ")" or "]" => division (so f(x)/re/g is division)', () => {
  assert.deepEqual(jsTok('f(x)/re/g'),
    [['name', 'f'], ['punct', '('], ['name', 'x'], ['punct', ')'], ['punct', '/'], ['name', 're'], ['punct', '/'], ['name', 'g']]);
  assert.deepEqual(jsTok('a[0]/2/1'),
    [['name', 'a'], ['punct', '['], ['number', '0'], ['punct', ']'], ['punct', '/'], ['number', '2'], ['punct', '/'], ['number', '1']]);
});

test('tokenizeJS regex-vs-division: after "}" => regex (block-close = statement position)', () => {
  assert.deepEqual(jsTok('}/re/'), [['punct', '}'], ['regex', '/re/']]);
});

test('tokenizeJS regex-vs-division: after operators / "(" / "," / "=" / start => regex', () => {
  assert.deepEqual(jsTok('/a/.test(x)'), [['regex', '/a/'], ['punct', '.'], ['name', 'test'], ['punct', '('], ['name', 'x'], ['punct', ')']]);
  assert.deepEqual(jsTok('x = /a/g'), [['name', 'x'], ['punct', '='], ['regex', '/a/g']]);
  assert.deepEqual(jsTok('f(/a/, /b/i)'),
    [['name', 'f'], ['punct', '('], ['regex', '/a/'], ['punct', ','], ['regex', '/b/i'], ['punct', ')']]);
  assert.deepEqual(jsTok('a && /x/'), [['name', 'a'], ['punct', '&&'], ['regex', '/x/']]);
});

test('tokenizeJS regex-vs-division: postfix ++/-- yields a value => division', () => {
  assert.deepEqual(jsTok('x = a++ / 2'),
    [['name', 'x'], ['punct', '='], ['name', 'a'], ['punct', '++'], ['punct', '/'], ['number', '2']]);
  assert.deepEqual(jsTok('a-- / 2 / 1'),
    [['name', 'a'], ['punct', '--'], ['punct', '/'], ['number', '2'], ['punct', '/'], ['number', '1']]);
});

test('tokenizeJS regex-vs-division: after number/string/template/regex => division', () => {
  assert.deepEqual(jsTok('1 / 2'), [['number', '1'], ['punct', '/'], ['number', '2']]);
  assert.deepEqual(jsTok("'s' / 2"), [['string', "'s'"], ['punct', '/'], ['number', '2']]);
  assert.deepEqual(jsTok('`t` / 2'), [['template', '`t`'], ['punct', '/'], ['number', '2']]);
  assert.deepEqual(jsTok('/r/ / 2'), [['regex', '/r/'], ['punct', '/'], ['number', '2']]);
});

test('tokenizeJS "/=" vs "/=regex": division-assign after a value, regex after an operator', () => {
  assert.deepEqual(jsTok('a /= 2'), [['name', 'a'], ['punct', '/='], ['number', '2']]);
  assert.deepEqual(jsTok('x = /=a/.test(y)'),
    [['name', 'x'], ['punct', '='], ['regex', '/=a/'], ['punct', '.'], ['name', 'test'], ['punct', '('], ['name', 'y'], ['punct', ')']]);
});

test('tokenizeJS regex: "/" inside a character class does not terminate; escapes; flags', () => {
  assert.deepEqual(jsTok('/[/]/.test(x)'),
    [['regex', '/[/]/'], ['punct', '.'], ['name', 'test'], ['punct', '('], ['name', 'x'], ['punct', ')']]);
  assert.deepEqual(jsTok('/a\\/b/gim'), [['regex', '/a\\/b/gim']]);
  assert.deepEqual(jsTok('/[\\]/]+/u'), [['regex', '/[\\]/]+/u']]);
});

test('tokenizeJS regex: unterminated regex candidate falls back to "/" punct (no throw)', () => {
  assert.deepEqual(jsTok('/abc'), [['punct', '/'], ['name', 'abc']]);
  assert.deepEqual(jsTok('x = /abc\ny'), [['name', 'x'], ['punct', '='], ['punct', '/'], ['name', 'abc'], ['name', 'y']]);
});

test('tokenizeJS comments: line + block are tokens; "//" and "/*" inside a regex/string are NOT comments', () => {
  assert.deepEqual(jsTok('a // c\nb'), [['name', 'a'], ['lineComment', '// c'], ['name', 'b']]);
  assert.deepEqual(jsTok('a /* c */ b'), [['name', 'a'], ['blockComment', '/* c */'], ['name', 'b']]);
  assert.deepEqual(jsTok("x = '//y'"), [['name', 'x'], ['punct', '='], ['string', "'//y'"]]);
  assert.deepEqual(jsTok('x = /\\/\\//'), [['name', 'x'], ['punct', '='], ['regex', '/\\/\\//']]);
  assert.deepEqual(jsTok('x = /[/*]/'), [['name', 'x'], ['punct', '='], ['regex', '/[/*]/']]);
});

test('tokenizeJS strings: quotes, escapes, "//" + keywords + braces inside stay one string token', () => {
  assert.deepEqual(jsTok("'a\\'b' \"c\\\"d\""), [['string', "'a\\'b'"], ['string', '"c\\"d"']]);
  assert.deepEqual(jsTok("'//x' + \"if { return ; }\""),
    [['string', "'//x'"], ['punct', '+'], ['string', '"if { return ; }"']]);
  assert.deepEqual(jsTok("'/* nope */'"), [['string', "'/* nope */'"]]);
});

test('tokenizeJS template: simple template + escaped backtick + "$" without "{"', () => {
  assert.deepEqual(jsTok('`a b`'), [['template', '`a b`']]);
  assert.deepEqual(jsTok('`a\\`b`'), [['template', '`a\\`b`']]);
  assert.deepEqual(jsTok('`$5 {x}`'), [['template', '`$5 {x}`']]);
});

test('tokenizeJS template: ${ } splits head / expression tokens / tail', () => {
  assert.deepEqual(jsTok('`a${b}c`'), [['template', '`a${'], ['name', 'b'], ['template', '}c`']]);
  assert.deepEqual(jsTok('`${a}${b}`'),
    [['template', '`${'], ['name', 'a'], ['template', '}${'], ['name', 'b'], ['template', '}`']]);
});

test('tokenizeJS template: NESTED templates + nested braces inside ${}', () => {
  assert.deepEqual(jsTok('`a${b+`c${d}e`}f`'), [
    ['template', '`a${'], ['name', 'b'], ['punct', '+'],
    ['template', '`c${'], ['name', 'd'], ['template', '}e`'],
    ['template', '}f`'],
  ]);
  // an object literal inside ${} must not be mistaken for the template close
  assert.deepEqual(jsTok('`x${ {a:1}.a }y`'), [
    ['template', '`x${'], ['punct', '{'], ['name', 'a'], ['punct', ':'], ['number', '1'], ['punct', '}'],
    ['punct', '.'], ['name', 'a'], ['template', '}y`'],
  ]);
});

test('tokenizeJS template: "/" after a template tail is division', () => {
  assert.deepEqual(jsTok('`a${b}` / 2'), [['template', '`a${'], ['name', 'b'], ['template', '}`'], ['punct', '/'], ['number', '2']]);
});

// ---- FIXED under #1014-A (was "BUG-1"): regexAllowed() now returns true after a template token that
// ends in "${" (an open head/middle), so a regex that is the FIRST token inside ${ } tokenizes as a
// regex, not division — and minifyJS no longer strips spaces inside its body (no semantic change).
test('tokenizeJS template: regex as first token inside ${ } is a regex, not division [#1014-A]', () => {
  assert.deepEqual(jsTok('`a${/x/.source}`'),
    [['template', '`a${'], ['regex', '/x/'], ['punct', '.'], ['name', 'source'], ['template', '}`']]);
});
test('minifyJS: regex literal as first token inside template ${ } survives VERBATIM [#1014-A]', () => {
  const src = '`a${/x  +  y/.source}`';
  const m = minifyJS(src);
  assert.ok(m.includes('/x  +  y/'), m);
  assert.deepEqual(sigJS(m), sigJS(src));
});

test('tokenizeJS punctuators: ALL multi-char operators use longest match', () => {
  const multi = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
    '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
    '*=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
  for (const p of multi) {
    assert.deepEqual(jsTok(`a ${p} b`), [['name', 'a'], ['punct', p], ['name', 'b']], `punct ${p}`);
  }
  // '/=' after a value
  assert.deepEqual(jsTok('a /= b'), [['name', 'a'], ['punct', '/='], ['name', 'b']]);
});

test('tokenizeJS punctuators: packed run is split by longest match', () => {
  assert.deepEqual(jsTok('a===b>>>=c?.d??e=>f...g**=h'), [
    ['name', 'a'], ['punct', '==='], ['name', 'b'], ['punct', '>>>='], ['name', 'c'], ['punct', '?.'],
    ['name', 'd'], ['punct', '??'], ['name', 'e'], ['punct', '=>'], ['name', 'f'], ['punct', '...'],
    ['name', 'g'], ['punct', '**='], ['name', 'h'],
  ]);
  assert.deepEqual(jsTok('{}()[];,.?:=+-*%<>!~&|^'),
    '{}()[];,.?:=+-*%<>!~&|^'.split('').map((c) => ['punct', c]));
});

test('tokenizeJS numbers: int, float, leading-dot, exponent, hex/octal/binary, separators, BigInt', () => {
  assert.deepEqual(jsTok('1_000 0xFF 0b101 0o17 10n 1.5e+3 .5 2E-4'), [
    ['number', '1_000'], ['number', '0xFF'], ['number', '0b101'], ['number', '0o17'],
    ['number', '10n'], ['number', '1.5e+3'], ['number', '.5'], ['number', '2E-4'],
  ]);
});

test('tokenizeJS names: $ _ and unicode identifiers; stray # and @ are punct', () => {
  assert.deepEqual(jsTok('$a _b été 日本'),
    [['name', '$a'], ['name', '_b'], ['name', 'été'], ['name', '日本']]);
  assert.deepEqual(jsTok('a # b @'), [['name', 'a'], ['punct', '#'], ['name', 'b'], ['punct', '@']]);
});

// =========================================================== JS malformed / edges
test('tokenizeJS malformed: unterminated string stops at newline / EOF (no throw)', () => {
  assert.deepEqual(jsTok("'abc"), [['string', "'abc"]]);
  assert.deepEqual(jsTok("'abc\ndef"), [['string', "'abc"], ['name', 'def']]);
});

test('tokenizeJS malformed: unterminated template / block comment run to EOF (no throw)', () => {
  assert.deepEqual(jsTok('`abc'), [['template', '`abc']]);
  assert.deepEqual(jsTok('`abc${x'), [['template', '`abc${'], ['name', 'x']]);
  assert.deepEqual(jsTok('/* abc'), [['blockComment', '/* abc']]);
  assert.deepEqual(jsTok('// abc'), [['lineComment', '// abc']]);
});

test('tokenizeJS malformed: stray "}" / ")" and unbalanced input tokenize without throwing', () => {
  assert.deepEqual(jsTok('}}))'), [['punct', '}'], ['punct', '}'], ['punct', ')'], ['punct', ')']]);
  assert.doesNotThrow(() => tokenizeJS('((({[['));
});

test('JS malformed: format/minify never throw and keep the broken literal text verbatim', () => {
  assert.equal(minifyJS("'abc"), "'abc");
  assert.equal(minifyJS('`abc'), '`abc');
  assert.equal(minifyJS('/* abc'), '');
  assert.equal(minifyJS('// c'), '');
  assert.equal(minifyJS('x = `abc'), 'x=`abc');
  assert.doesNotThrow(() => formatJS("function ( { 'abc"));
  assert.doesNotThrow(() => formatJS('`abc${'));
  assert.doesNotThrow(() => minifyJS('}}))'));
});

test('JS edges: empty / whitespace-only -> minify "" ; format "" / "\\n" (documented asymmetry)', () => {
  assert.equal(minifyJS(''), '');
  assert.equal(minifyJS('  \n\t '), '');
  assert.equal(formatJS(''), '\n');
  assert.equal(formatJS('   \n'), '\n');
});

test('JS unicode: strings / templates / regex / comments / names carry non-ASCII verbatim', () => {
  const src = "const café = '日本語 \u{1F600}'; // ü\nconst r = /é+/u, t = `ß${café}`;";
  const m = minifyJS(src);
  assert.ok(m.includes("'日本語 \u{1F600}'"));
  assert.ok(m.includes('/é+/u'));
  assert.ok(m.includes('`ß${café}`'));
  assert.ok(!m.includes('// ü'));
  assert.deepEqual(sigJS(m), sigJS(src));
});

// =========================================================== JS pretty
test('formatJS: exact fixture (blocks indented, binary ops spaced, unary tight, import on one line, trailing \\n)', () => {
  assert.equal(
    formatJS("import {a,b} from 'x'\nfunction f(a,b){if(a){return a+b}else{return -b}}\nconst x=[1,2,3].map(n=>n*2);"),
    "import { a, b } from 'x'\nfunction f(a, b) {\n  if (a) {\n    return a + b\n  } else {\n    return -b\n  }\n}\n\nconst x = [1, 2, 3].map(n => n * 2);\n",
  );
});

test('formatJS: indent option -- tab, 4, 0 and default 2', () => {
  const src = 'function f(){return 1}';
  assert.equal(formatJS(src), 'function f() {\n  return 1\n}\n');
  assert.equal(formatJS(src, { indent: 4 }), 'function f() {\n    return 1\n}\n');
  assert.equal(formatJS(src, { indent: 'tab' }), 'function f() {\n\treturn 1\n}\n');
  assert.equal(formatJS(src, { indent: 0 }), 'function f() {\nreturn 1\n}\n');
});

test('formatJS: unary +/- stay tight, binary get spaces; object/array/arrow spacing', () => {
  assert.equal(formatJS('x=-1;y=a-1;z=a- -b;'), 'x = -1;\n\ny = a - 1;\n\nz = a - -b;\n');
  assert.equal(formatJS('const o={a:1,b:[1,2]};'), 'const o = {\n  a: 1, b: [1, 2]\n};\n');
});

test('formatJS: a line comment forces a break after it; comments preserved', () => {
  const out = formatJS('a=1 // note\nb=2');
  assert.ok(out.includes('// note'));
  // actual: no space inserted before a trailing line comment (cosmetic; still a valid comment)
  assert.equal(out, 'a = 1// note\nb = 2\n');
});

test('formatJS: strings / regex / templates are NEVER reflowed (inner ws + structural chars intact)', () => {
  const out = formatJS("const s='a  {  ;  //  b', r=/a  b[/]{1,2}/g, t=`x  ${ y }  z`;");
  assert.ok(out.includes("'a  {  ;  //  b'"));
  assert.ok(out.includes('/a  b[/]{1,2}/g'));
  assert.ok(out.includes('`x  ${'));
  assert.ok(out.includes('}  z`'));
});

test('formatJS: preserves an existing newline (ASI-safe) -- "return\\n1" is never joined', () => {
  const out = formatJS('function f(){\nreturn\n1\n}');
  assert.deepEqual(out.split('\n').map((l) => l.trim()).filter(Boolean), ['function f() {', 'return', '1', '}']);
});

test('formatJS: idempotent -- format(format(x)) === format(x) (several inputs / indents)', () => {
  const inputs = [
    "import {a,b} from 'x'\nfunction f(a,b){if(a){return a+b}else{return -b}}\nconst x=[1,2,3].map(n=>n*2);",
    'const o={a:1,b:{c:[1,2,{d:3}]}};',
    'a=1 // note\nb=2 /* c */\nc = /re[/]/g.test(`t${x}u`)',
    'for(let i=0;i<10;i++){if(i%2===0)continue;console.log(i)}',
    "export {a, b};\nexport * from 'y';",
    'x = a ? b : c ?? d?.e',
    'class A extends B{constructor(){super();this.x=1}get y(){return this.x}}',
  ];
  for (const src of inputs) {
    for (const opts of [{}, { indent: 4 }, { indent: 'tab' }]) {
      const once = formatJS(src, opts);
      assert.equal(formatJS(once, opts), once, `not idempotent for ${JSON.stringify(src)} ${JSON.stringify(opts)}`);
    }
  }
});

test('formatJS: significant token stream is preserved (battery) -- only whitespace moved', () => {
  const battery = [
    'function f(a,b){if(a){return a+b}else{return -b}}',
    'a=1 // note\nb=2 /* c */\nc = /re[/]/g.test(`t${x}u`)',
    "const s='a  {  ;  //  b'; x = a / b / c; y = f(x)/2/1",
    'x = a++ / 2; y = a ?? b; z = a?.b?.[0]',
    'for(let i=0;i<10;i++){continue}',
    'const o={a:1,b:[1,2]}; label: while(1){break label}',
  ];
  for (const src of battery) {
    assert.deepEqual(sigJS(formatJS(src)), sigJS(src), `format changed tokens for ${JSON.stringify(src)}`);
  }
});

// =========================================================== JS minify (SAFE)
test('minifyJS: exact fixture -- strips comments + insignificant ws, keeps newlines, never renames', () => {
  assert.equal(
    minifyJS("a = 1 // c\nb = 2 /* x\ny */ c = /re/g.test(`t ${ x } u`) ; s = '//{;}'"),
    "a=1\nb=2\nc= /re/g.test(`t ${x} u`);s='//{;}'",
  );
});

test('minifyJS: identifiers are NEVER renamed/mangled; long names and keywords intact', () => {
  const m = minifyJS('function  someVeryLongFunctionName ( someParameterName ) { return  someParameterName  +  1 }');
  assert.equal(m, 'function someVeryLongFunctionName(someParameterName){return someParameterName+1}');
  assert.ok(m.includes('someVeryLongFunctionName'));
  assert.ok(m.includes('someParameterName'));
});

test('minifyJS ASI-safety: "return\\n1" is NEVER collapsed to "return 1"', () => {
  assert.equal(minifyJS('return\n1'), 'return\n1');
  assert.equal(minifyJS('function f(){ return\n 1 }'), 'function f(){return\n1}');
  assert.equal(minifyJS('return   \n\n\t  1'), 'return\n1');
});

test('minifyJS ASI-safety: no newline is ever removed -- count of line breaks between tokens preserved as >=1', () => {
  const cases = [
    'a\n++b',                    // would become (a++) b if joined
    'a = b\n(c)',                // would become a = b(c) if joined
    'a = b\n[1].map(f)',         // would become b[1]
    'let x = 1\nlet y = 2',
    'throw\nnew Error("x")',
    'x\n`tpl`',                  // would become tagged template if joined
    'a\n/re/g.test(b)',          // would become division if joined
    'break\nlabel',
    'continue\nlabel',
    'yield\nx',
  ];
  for (const src of cases) {
    const m = minifyJS(src);
    assert.ok(m.includes('\n'), `newline dropped: ${JSON.stringify(src)} -> ${JSON.stringify(m)}`);
    assert.deepEqual(sigJS(m), sigJS(src));
    // the n-th newline-separated segment boundaries are the same tokens
    const lines = (s) => s.split('\n').map((l) => pairs(sig(tokenizeJS(l))).map(([, v]) => v).join(' ')).filter(Boolean);
    assert.equal(m.split('\n').length, src.split('\n').length, `line count changed: ${JSON.stringify(src)} -> ${JSON.stringify(m)}`);
    void lines;
  }
});

test('minifyJS ASI-safety: a line comment / newline-bearing block comment is replaced by a newline, not nothing', () => {
  assert.equal(minifyJS('return // note\n1'), 'return\n1');
  assert.equal(minifyJS('return /* a\nb */ 1'), 'return\n1');
  assert.equal(minifyJS('a // c\nb'), 'a\nb');
  assert.equal(minifyJS('a\n// c\nb'), 'a\nb');
});

test('minifyJS: a single-line block comment between words becomes a space (tokens never fuse)', () => {
  assert.equal(minifyJS('return/**/1'), 'return 1');
  assert.equal(minifyJS('a/**/b'), 'a b');
  assert.equal(minifyJS('typeof/**/x'), 'typeof x');
});

test('minifyJS: tokens that would fuse into a different token keep a separating space', () => {
  assert.equal(minifyJS('a + +b'), 'a+ +b');
  assert.equal(minifyJS('a - -b'), 'a- -b');
  assert.equal(minifyJS('a + ++b'), 'a+ ++b');
  assert.equal(minifyJS('a - --b'), 'a- --b');
  assert.equal(minifyJS('a / /re/.source'), 'a/ /re/ .source');
  assert.equal(minifyJS('1 .toFixed()'), '1 .toFixed()');
  assert.equal(minifyJS('a + -b'), 'a+ -b');
  // never fuse "/" + "/" into a line comment, nor "/" + "*" into a block comment
  assert.deepEqual(sigJS(minifyJS('a / /b/')), sigJS('a / /b/'));
  assert.ok(!tokenizeJS(minifyJS('a / /b/')).some((t) => t.type === 'lineComment'));
});

test('minifyJS: regex literal survives VERBATIM (char class w/ "/", escapes, flags, "//" lookalike)', () => {
  const cases = ['/[/]/g', '/a\\/b/gim', '/\\/\\//', '/[/*]+/u', '/ a  b /'];
  for (const re of cases) {
    const m = minifyJS(`x  =  ${re}.test( y )  ;`);
    assert.ok(m.includes(re), `regex mangled: ${re} -> ${m}`);
    assert.deepEqual(sigJS(m), sigJS(`x = ${re}.test(y);`));
  }
});

test('minifyJS: template literal survives VERBATIM, incl multi-line text, nested templates, and ${} contents tightened only outside text', () => {
  const t1 = '`line1\n  line2   ${ a }   end`';
  const m1 = minifyJS(`x = ${t1}`);
  assert.ok(m1.includes('`line1\n  line2   ${'), m1);
  assert.ok(m1.includes('}   end`'), m1);
  const nested = 'x = `a  ${ b + `c  ${ d }  e` }  f`';
  const m2 = minifyJS(nested);
  assert.ok(m2.includes('`a  ${'));
  assert.ok(m2.includes('`c  ${'));
  assert.ok(m2.includes('}  e`'));
  assert.ok(m2.includes('}  f`'));
  assert.deepEqual(sigJS(m2), sigJS(nested));
});

test('minifyJS: strings containing { } ; // /* keywords and runs of spaces survive VERBATIM', () => {
  const strs = ["'{ } ; // /* */ return  if'", '"a  ;  }  {"', "'\\'  //  \\''", '"http://x.y/z?q=1"'];
  for (const s of strs) {
    const src = `var  q  =  ${s}  ;\n// tail\nfoo( q )`;
    const m = minifyJS(src);
    assert.ok(m.includes(s), `string mangled: ${s} -> ${m}`);
    assert.deepEqual(sigJS(m), sigJS(src));
  }
});

test('minifyJS: idempotent -- minify(minify(x)) === minify(x)', () => {
  const inputs = [
    "a = 1 // c\nb = 2 /* x\ny */ c = /re/g.test(`t ${ x } u`) ; s = '//{;}'",
    'a + +b; a - -b; a+ ++b; x = a / /re/.source',
    'function f ( a , b ) {\n  return\n  a + b\n}',
    'x = `a  ${ b + `c  ${ d }  e` }  f`',
    '',
    '  // only comment\n',
    'a\n++b',
  ];
  for (const src of inputs) assert.equal(minifyJS(minifyJS(src)), minifyJS(src), JSON.stringify(src));
});

test('minifyJS: already-minified input is a fixed point', () => {
  const min = 'function f(a,b){return a+b}var x=[1,2,3].map(n=>n*2);';
  assert.equal(minifyJS(min), min);
});

test('minifyJS: only-comment / empty-after-strip inputs -> ""', () => {
  assert.equal(minifyJS('// hi'), '');
  assert.equal(minifyJS('/* hi */'), '');
  assert.equal(minifyJS('/* a */ // b\n/* c */'), '');
});

test('JS semantic fidelity: significant token stream identical before/after minify (battery)', () => {
  const battery = [
    // regex vs division
    'a / b / c',
    'x = a / b; y = /re/g.test(z)',
    'return /re/g.test(x) ? a / 2 : b / 3',
    'x = f(a)/2/1; y = a[0]/2/1',
    'x = a++ / 2; y = b-- / 3',
    'a /= 2; b = /=x/.test(c)',
    'x = this / 2 / 3',
    '}/re/.test(x)',
    'if (x) {}\n/re/.test(y)',
    // templates
    'x = `a${b+`c${d}e`}f`',
    'x = `${a}${b}${c}`; y = `t` + `u`',
    'x = `a${ {a:1}.a }y`',
    'x = tag`a${b}c` / 2',
    // strings with structural chars / comment lookalikes
    "s = '//{;}' + \"/* x */\" + 'return if else'",
    "u = 'http://example.com/a?b=1'",
    // multi-char punctuators
    'a===b; c!==d; e>>>=f; g??=h; i?.j?.[k]; l=>m; ...n; o**=p; q&&=r; s||=t',
    'a >>> b >> c << d; e ** f; g ?? h',
    // numbers
    'x = 1_000 + 0xFF + 10n + 1.5e+3 + .5 + 0b1 + 0o7',
    // ASI-sensitive
    'let a = 1\nlet b = 2\n++a\n--b',
    'return\n1',
    'a\n(b)\n[c]\n`d`',
    // comments in odd places
    'a /* x */ + /* y */ b // z\n/* w */ c',
    'a/**/b/**/c',
    'x = a /* c */ / b',
    // realistic
    "import {a as b} from './x.js'\nexport default function(){ return b `t${1}` }\nexport {b}",
    'class A extends B { static #p = 1; get x(){ return this.#p } async *g(){ yield* h() } }',
    'async function f(){ for await (const x of y) { await z(x) } }',
    "const re = /^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$/i, ok = re.test('a@b.co')",
    // unicode
    "const café = '日本' + `ß${1}`",
  ];
  for (const src of battery) {
    assert.deepEqual(sigJS(minifyJS(src)), sigJS(src), `significant tokens changed for ${JSON.stringify(src)}`);
  }
});

test('JS semantic fidelity: every newline-separated statement boundary survives minify (newline count never decreases below token-gap count)', () => {
  // Inputs where each source newline sits between two significant tokens: minify must keep
  // a newline in the same gap. Compare the gap-newline sequence before and after.
  const gaps = (src) => {
    const out = [];
    let nl = false;
    for (const t of tokenizeJS(src)) {
      if (t.type === 'ws') { if (t.value.includes('\n')) nl = true; continue; }
      if (t.type === 'lineComment') { nl = true; continue; }
      if (t.type === 'blockComment') { if (t.value.includes('\n')) nl = true; continue; }
      out.push(nl);
      nl = false;
    }
    return out.slice(1);
  };
  const battery = [
    'a\n++b', 'a = b\n(c)', 'return\n1', 'a // c\nb', 'a /* x\n y */ b',
    'let a = 1\nlet b = 2\n\n\nlet c = 3', 'x\n`t`', 'a\n/re/g.test(b)',
  ];
  for (const src of battery) {
    assert.deepEqual(gaps(minifyJS(src)), gaps(src), `newline gaps changed for ${JSON.stringify(src)}`);
  }
});

test('JS deeply nested: 60-level blocks/arrays/templates survive minify + format round-trip', () => {
  const depth = 60;
  const blocks = 'if(a)'.repeat(0) + '{'.repeat(depth) + 'x=1' + '}'.repeat(depth);
  assert.deepEqual(sigJS(minifyJS(blocks)), sigJS(blocks));
  assert.deepEqual(sigJS(formatJS(blocks)), sigJS(blocks));
  assert.equal(formatJS(formatJS(blocks)), formatJS(blocks));
  const arrays = '['.repeat(depth) + '1' + ']'.repeat(depth);
  assert.equal(minifyJS(arrays), arrays);
  let tpl = '`x`';
  for (let i = 0; i < 20; i++) tpl = '`a${' + tpl + '}b`';
  assert.deepEqual(sigJS(minifyJS(tpl)), sigJS(tpl));
  assert.equal(minifyJS(tpl), tpl);
});

test('JS: minified output re-formats to the same token stream as formatting the original', () => {
  const src = "function f(a,b){\n  // add\n  return a+b /* sum */\n}\nconst r=/x[/]y/g, t=`a${f(1,2)}b`;";
  assert.deepEqual(sigJS(formatJS(minifyJS(src))), sigJS(formatJS(src)));
});
