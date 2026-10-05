// Unit tests — SQL engine (source/logic.mjs). node --test, no browser/DOM.
// See DESIGN.md § "SQL". Format only moves whitespace + re-cases keywords;
// minify only strips comments + collapses whitespace. Neither may ever add,
// drop, reorder, or rewrite a (non-comment) token — verified against the
// exported tokenizer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSQL, minifySQL, tokenizeSQL, SAMPLES, sqlStream } from './_helpers.mjs';

const INPUTS = {
  simple: 'select id, name from users where active = true',
  join: 'select u.id, o.total from users u left join orders o on o.user_id = u.id',
  aggregate: 'select count(*), sum(total), avg(total) from orders group by user_id',
  subquery: 'select * from (select id from users where id > 10) t order by id desc limit 5',
  insert: "insert into users (id, name) values (1, 'alice'), (2, 'bob')",
  update: "update users set name = 'x', active = false where id = 1",
  del: 'delete from users where id in (1, 2, 3)',
  strings: "select 'select from where', 'it''s escaped' from t",
  quotedIds: 'select "select", `from` from "my table"',
  caseExpr: "select case when x > 0 then 'pos' else 'neg' end as sign from t",
  sample: SAMPLES.sql,
};

test('formatSQL preserves the non-whitespace token stream (keywords case-normalized)', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    // format keeps comments, so compare the full non-ws stream.
    assert.deepEqual(sqlStream(formatSQL(src)), sqlStream(src), name);
  }
});

test('minifySQL preserves the token stream minus comments', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    assert.deepEqual(sqlStream(minifySQL(src)), sqlStream(src, { dropComments: true }), name);
  }
});

test('formatSQL: fmt(fmt(x)) === fmt(x) — idempotent', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const once = formatSQL(src);
    assert.equal(formatSQL(once), once, name);
  }
});

test('minifySQL: min(min(x)) === min(x) — idempotent, single line', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const once = minifySQL(src);
    assert.equal(minifySQL(once), once, name);
    assert.doesNotMatch(once, /\n/, `${name} should be one line`);
  }
});

test('formatSQL: keyword casing never alters string-literal contents', () => {
  const out = formatSQL("select 'from where select and or' as x from t", { keywordCase: 'upper' });
  assert.ok(out.includes("'from where select and or'"), out);
  const lower = formatSQL("SELECT 'FROM WHERE' FROM t", { keywordCase: 'lower' });
  assert.ok(lower.includes("'FROM WHERE'"), lower);
});

test('formatSQL: keyword casing never alters quoted identifiers', () => {
  const out = formatSQL('select "from" from "select" ', { keywordCase: 'upper' });
  assert.ok(out.includes('"from"'), out);
  assert.ok(out.includes('"select"'), out);
});

test('formatSQL: keyword case option — upper / lower / unchanged', () => {
  assert.match(formatSQL('select 1 from t', { keywordCase: 'upper' }), /SELECT 1\nFROM t/);
  assert.match(formatSQL('SELECT 1 FROM t', { keywordCase: 'lower' }), /select 1\nfrom t/);
  const un = formatSQL('SeLeCt 1 FrOm t', { keywordCase: 'unchanged' });
  assert.ok(un.includes('SeLeCt') && un.includes('FrOm'), un);
});

test('formatSQL: keyword case DEFAULT is "unchanged" (leaves casing as typed)', () => {
  // No keywordCase option → keywords keep the exact case from the source.
  const mixed = formatSQL('SeLeCt id FrOm users');
  assert.ok(mixed.includes('SeLeCt') && mixed.includes('FrOm'), mixed);
  assert.equal(formatSQL('select 1 from t'), formatSQL('select 1 from t', { keywordCase: 'unchanged' }));
});

test('formatSQL: COUNT(*) keeps no space before "(" (keyword-named functions)', () => {
  assert.ok(formatSQL('select count(*) from t', { keywordCase: 'upper' }).includes('COUNT(*)'));
  assert.ok(formatSQL('select sum(x), avg(y) from t', { keywordCase: 'upper' }).includes('SUM(x)'));
  // Spacing is independent of casing: with the default (unchanged) there is
  // still no space between the function name and its "(".
  assert.ok(formatSQL('select count(*) from t').includes('count(*)'));
});

test('formatSQL: WHERE ( and IN ( keep their space before "("', () => {
  assert.match(formatSQL('select * from t where (a = 1)', { keywordCase: 'upper' }), /WHERE \(/);
  assert.match(formatSQL('select * from t where id in (1, 2, 3)', { keywordCase: 'upper' }), /IN \(/);
  // and with the default casing
  assert.match(formatSQL('select * from t where (a = 1)'), /where \(/);
});

test('minifySQL: strips line (--) and block (/* */) comments', () => {
  const src = 'select 1 -- a line comment\nfrom t /* a block comment */ where a = 1';
  const out = minifySQL(src);
  assert.doesNotMatch(out, /--/);
  assert.doesNotMatch(out, /\/\*/);
  assert.equal(out, 'select 1 from t where a = 1');
});

test('minifySQL: a "--" inside a string is NOT treated as a comment', () => {
  const out = minifySQL("select 'a -- b', 'c /* d */ e' from t");
  assert.ok(out.includes("'a -- b'"), out);
  assert.ok(out.includes("'c /* d */ e'"), out);
});

test('minifySQL: collapses runs of whitespace to a single space', () => {
  assert.equal(minifySQL('select    a,\n\n\tb   from     t'), 'select a, b from t');
});

test("tokenizeSQL: '' inside a string does not end the literal", () => {
  const toks = tokenizeSQL("'it''s fine'");
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, 'string');
  assert.equal(toks[0].value, "'it''s fine'");
});

test('tokenizeSQL: classifies strings, quoted ids, comments, numbers and words', () => {
  const toks = tokenizeSQL("select 1 -- c\nfrom \"t\" where a = 'x'").filter((t) => t.type !== 'ws');
  const types = toks.map((t) => t.type);
  assert.ok(types.includes('lineComment'));
  assert.ok(types.includes('string'));
  assert.ok(types.includes('quotedId'));
  assert.ok(types.includes('number'));
  assert.ok(types.includes('word'));
});

test('SQL sample: format & minify both preserve the token stream', () => {
  const src = SAMPLES.sql;
  assert.deepEqual(sqlStream(formatSQL(src)), sqlStream(src));
  assert.deepEqual(sqlStream(minifySQL(src)), sqlStream(src, { dropComments: true }));
});
