// Unit tests for the PURE functions of CtUtil.mjs (clamp, num, clampInt, escapeHtml, escapeAttr,
// slugify, wrapText) plus debounce via node:test mock timers and the CtUtil aggregator identity.
// DOM/BOM functions are deferred (e2e-covered via the tools). Run: node --test src/lib/tests/
//
// Several tests CHARACTERIZE actual behavior that may surprise (marked "characterize"):
//  - clamp(NaN) returns lo; num() coerces ""/null/true/[] to 0/1 rather than the fallback;
//  - clampInt uses parseInt so "1e2" -> 1 and 3.9 -> 3 (truncation, not rounding);
//  - escapeHtml does NOT escape quotes (escapeAttr does); slugify caps at 60 chars.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CtUtil, clamp, num, clampInt, escapeHtml, escapeAttr, slugify, wrapText, debounce,
  downloadBlob, persistState, onceFlag, el, prefersReducedMotion, restartAnimation,
  setupHiDPICanvas, posAt,
} from '../../utils/CtUtil.mjs';

// ---------------------------------------------------------------- clamp
test('clamp: in-range value passes through', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});
test('clamp: below lo -> lo, above hi -> hi', () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(-Infinity, 0, 10), 0);   // -Infinity is below lo -> lo
  assert.equal(clamp(Infinity, 0, 10), 10);   // #1014-O: +Infinity is above hi -> hi
  assert.equal(clamp(NaN, 0, 10), 0);         // NaN has no position -> lo
});
test('clamp: lo === hi pins to that value', () => {
  assert.equal(clamp(3, 5, 5), 5);
  assert.equal(clamp(9, 5, 5), 5);
  assert.equal(clamp(5, 5, 5), 5);
});
test('clamp: negatives and floats', () => {
  assert.equal(clamp(-5, -10, -1), -5);
  assert.equal(clamp(-20, -10, -1), -10);
  assert.equal(clamp(0, -10, -1), -1);
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp(1.0001, 0, 1), 1);
});
test('clamp: NaN / non-numeric -> lo (characterize)', () => {
  assert.equal(clamp(NaN, 2, 8), 2);
  assert.equal(clamp('abc', 2, 8), 2);
  assert.equal(clamp(undefined, 2, 8), 2);
});
test('clamp: coerces numeric strings; null/"" coerce to 0 via Number()', () => {
  assert.equal(clamp('7', 0, 10), 7);
  assert.equal(clamp('99', 0, 10), 10);
  assert.equal(clamp(null, 3, 10), 3);  // Number(null)=0 -> below lo
  assert.equal(clamp('', -5, 10), 0);   // Number('')=0, in range
});

// ---------------------------------------------------------------- num
test('num: valid numbers and numeric strings', () => {
  assert.equal(num(42), 42);
  assert.equal(num(-1.5), -1.5);
  assert.equal(num('3.14'), 3.14);
  assert.equal(num(' 7 '), 7);
  assert.equal(num('1e2'), 100);
  assert.equal(num('0x10'), 16);
});
test('num: non-numeric / NaN / Infinity -> fallback (default 0)', () => {
  assert.equal(num('abc'), 0);
  assert.equal(num(NaN), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num(Infinity), 0);
  assert.equal(num('abc', 9), 9);
  assert.equal(num(NaN, -1), -1);
  assert.equal(num(undefined, 5), 5);
  assert.equal(num({}, 5), 5);
});
test('num: explicit fallbacks of null / 0 are honored; undefined means 0', () => {
  assert.equal(num('x', null), null);
  assert.equal(num('x', undefined), 0);
  assert.equal(num('x', 0), 0);
});
test('num: "" / null / true / [] coerce to a number, NOT the fallback (characterize)', () => {
  assert.equal(num('', 99), 0);
  assert.equal(num(null, 99), 0);
  assert.equal(num(true, 99), 1);
  assert.equal(num([], 99), 0);
  assert.equal(num([7], 99), 7);
});

// ---------------------------------------------------------------- clampInt
test('clampInt: in-range integers and numeric strings', () => {
  assert.equal(clampInt(5, 0, 10, -1), 5);
  assert.equal(clampInt('5', 0, 10, -1), 5);
  assert.equal(clampInt('  8', 0, 10, -1), 8);
  assert.equal(clampInt('7px', 0, 10, -1), 7); // characterize: parseInt prefix parse
});
test('clampInt: out-of-range clamps to bounds', () => {
  assert.equal(clampInt(-5, 0, 10, -1), 0);
  assert.equal(clampInt(50, 0, 10, -1), 10);
  assert.equal(clampInt('999', 1, 100, 0), 100);
});
test('clampInt: non-numeric / "" / NaN / null -> fallback (fallback is NOT clamped)', () => {
  assert.equal(clampInt('abc', 0, 10, 4), 4);
  assert.equal(clampInt('', 0, 10, 4), 4);
  assert.equal(clampInt(NaN, 0, 10, 4), 4);
  assert.equal(clampInt(null, 0, 10, 4), 4);
  assert.equal(clampInt(undefined, 0, 10, 4), 4);
  assert.equal(clampInt('abc', 0, 10, 999), 999);
  assert.equal(clampInt('abc', 0, 10), undefined); // no fallback supplied
});
test('clampInt: floats truncate (parseInt), do not round (characterize)', () => {
  assert.equal(clampInt(3.9, 0, 10, -1), 3);
  assert.equal(clampInt('3.9', 0, 10, -1), 3);
  assert.equal(clampInt(-3.9, -10, 10, 0), -3); // toward zero, unlike Math.floor
});
test('clampInt: "1e2" parses as 1, not 100 (characterize; contrast num("1e2") === 100)', () => {
  assert.equal(clampInt('1e2', 0, 1000, -1), 1);
  assert.equal(num('1e2'), 100);
  assert.equal(clampInt(1e21, 0, 1000, -1), 1); // String(1e21) = "1e+21" -> parseInt 1
  assert.equal(clampInt('0x10', 0, 100, -1), 0); // radix 10: "0" then stops at x
});
test('clampInt: Infinity -> fallback (parseInt("Infinity") is NaN)', () => {
  assert.equal(clampInt(Infinity, 0, 10, 3), 3);
});

// ---------------------------------------------------------------- escapeHtml
test('escapeHtml: escapes & < >', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('<div>'), '&lt;div&gt;');
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
test('escapeHtml: does NOT escape quotes (characterize - text-node escaper only)', () => {
  assert.equal(escapeHtml('say "hi" it\'s'), 'say "hi" it\'s');
});
test('escapeHtml: ampersand first, so already-escaped input is double-escaped', () => {
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});
test('escapeHtml: empty, unicode, and non-string coercion', () => {
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml('café ☃ 😀'), 'café ☃ 😀');
  assert.equal(escapeHtml(123), '123');
  assert.equal(escapeHtml(null), 'null');       // characterize
  assert.equal(escapeHtml(undefined), 'undefined'); // characterize
});
test('escapeHtml: mixed content', () => {
  assert.equal(escapeHtml('a<b>&c>d'), 'a&lt;b&gt;&amp;c&gt;d');
});

// ---------------------------------------------------------------- escapeAttr
test('escapeAttr: escapes & < > " \'', () => {
  assert.equal(escapeAttr('&'), '&amp;');
  assert.equal(escapeAttr('<'), '&lt;');
  assert.equal(escapeAttr('>'), '&gt;');
  assert.equal(escapeAttr('"'), '&quot;');
  assert.equal(escapeAttr("'"), '&#39;');
});
test('escapeAttr: mixed, attribute-breakout payload neutralized', () => {
  assert.equal(escapeAttr('" onclick="x"'), '&quot; onclick=&quot;x&quot;');
  assert.equal(escapeAttr(`<a href='x' title="y">&`), '&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;');
});
test('escapeAttr: already-escaped is double-escaped (& first, no &#39; double of quote step)', () => {
  assert.equal(escapeAttr('&quot;'), '&amp;quot;');
  assert.equal(escapeAttr("&#39;"), '&amp;#39;');
});
test('escapeAttr: empty, unicode, coercion; superset of escapeHtml', () => {
  assert.equal(escapeAttr(''), '');
  assert.equal(escapeAttr('café ☃'), 'café ☃');
  assert.equal(escapeAttr(5), '5');
  assert.equal(escapeAttr(null), 'null');
  const s = 'a<b>&c';
  assert.equal(escapeAttr(s), escapeHtml(s)); // identical when no quotes present
  assert.notEqual(escapeAttr('"'), escapeHtml('"'));
});

// ---------------------------------------------------------------- slugify (default ASCII)
test('slugify: spaces -> hyphen, lowercased', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('My Card!'), 'my-card');
  assert.equal(slugify('ABC def'), 'abc-def');
});
test('slugify: punctuation stripped; quotes removed without a separator', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify("it's"), 'its');
  assert.equal(slugify('say "hi"'), 'say-hi');
  assert.equal(slugify('a_b.c/d'), 'a-b-c-d');
});
test('slugify: leading / trailing / multiple separators collapse and trim', () => {
  assert.equal(slugify('  --Hello---World--  '), 'hello-world');
  assert.equal(slugify('a   b'), 'a-b');
  assert.equal(slugify('---'), '');
  assert.equal(slugify('!!!'), '');
});
test('slugify: empty / null / undefined -> ""', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});
test('slugify: default form DROPS accented letters, splitting around them (characterize)', () => {
  assert.equal(slugify('Café Menu'), 'caf-menu');
  assert.equal(slugify('naïve'), 'na-ve');
  assert.equal(slugify('日本語'), ''); // all non-ASCII -> empty
});
test('slugify: digits kept; non-string coerced; capped at 60 chars', () => {
  assert.equal(slugify('v2.0 Release'), 'v2-0-release');
  assert.equal(slugify(123), '123');
  assert.equal(slugify('a'.repeat(100)), 'a'.repeat(60));
  assert.equal(slugify('a'.repeat(100)).length, 60);
  // #1014-O: the cap no longer leaves a trailing hyphen (59 a's + ' b' -> the hyphen the cut lands on is stripped)
  assert.equal(slugify('a'.repeat(59) + ' b'), 'a'.repeat(59));
});

// ---------------------------------------------------------------- slugify (diacritics variant)
test('slugify {diacritics:true}: strips accents instead of dropping letters', () => {
  assert.equal(slugify('Café Menu', { diacritics: true }), 'cafe-menu');
  assert.equal(slugify('naïve résumé', { diacritics: true }), 'naive-resume');
});
test('slugify {diacritics:true}: camelCase / acronym / digit-run word model', () => {
  assert.equal(slugify('fooBar', { diacritics: true }), 'foo-bar');
  assert.equal(slugify('HTMLParser', { diacritics: true }), 'html-parser');
  assert.equal(slugify('foo2bar', { diacritics: true }), 'foo-2-bar');
});
test('slugify {diacritics:true}: separators, empty/null, cap', () => {
  assert.equal(slugify('  Hello---World!! ', { diacritics: true }), 'hello-world');
  assert.equal(slugify('', { diacritics: true }), '');
  assert.equal(slugify(null, { diacritics: true }), '');
  assert.equal(slugify('!!!', { diacritics: true }), '');
  const long = 'abc '.repeat(50);
  assert.equal(slugify(long, { diacritics: true }).length, 'abc-'.repeat(50).length - 1); // uncapped
  assert.equal(slugify('hello world', { diacritics: true, cap: 5 }), 'hello');
  assert.equal(slugify('hello world', { diacritics: true, cap: null }), 'hello-world');
});

// ---------------------------------------------------------------- wrapText
const len = (s) => s.length; // deterministic 1-unit-per-char measure

test('wrapText: wraps greedily at maxWidth', () => {
  assert.deepEqual(wrapText('aaa bbb ccc', 7, len), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrapText('aaa bbb ccc', 11, len), ['aaa bbb ccc']);
  assert.deepEqual(wrapText('aaa bbb ccc', 3, len), ['aaa', 'bbb', 'ccc']);
});
test('wrapText: width boundary is inclusive (line exactly maxWidth fits)', () => {
  assert.deepEqual(wrapText('aa bb', 5, len), ['aa bb']);
  assert.deepEqual(wrapText('aa bb', 4, len), ['aa', 'bb']);
});
test('wrapText: unbreakable long word kept whole on its own line', () => {
  assert.deepEqual(wrapText('a supercalifragilistic b', 5, len), ['a', 'supercalifragilistic', 'b']);
  assert.deepEqual(wrapText('abcdefghij', 3, len), ['abcdefghij']);
});
test('wrapText: existing newlines are hard breaks (including blank lines)', () => {
  assert.deepEqual(wrapText('a\nb', 100, len), ['a', 'b']);
  assert.deepEqual(wrapText('a\n\nb', 100, len), ['a', '', 'b']);
  assert.deepEqual(wrapText('aaa bbb\nccc ddd', 7, len), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(wrapText('a\n', 100, len), ['a', '']);
});
test('wrapText: empty / null / undefined -> [""]', () => {
  assert.deepEqual(wrapText('', 10, len), ['']);
  assert.deepEqual(wrapText(null, 10, len), ['']);
  assert.deepEqual(wrapText(undefined, 10, len), ['']);
});
test('wrapText: width 0 / negative / non-finite disables wrapping; measure never called', () => {
  let calls = 0;
  const m = (s) => { calls++; return s.length; };
  assert.deepEqual(wrapText('aaa bbb ccc', 0, m), ['aaa bbb ccc']);
  assert.deepEqual(wrapText('aaa bbb ccc', -5, m), ['aaa bbb ccc']);
  assert.deepEqual(wrapText('aaa bbb ccc', NaN, m), ['aaa bbb ccc']);
  assert.deepEqual(wrapText('aaa bbb ccc', 'abc', m), ['aaa bbb ccc']);
  assert.deepEqual(wrapText('a b\nc', 0, m), ['a b', 'c']); // newlines still break
  assert.equal(calls, 0);
});
test('wrapText: width 1 puts each word on its own line', () => {
  assert.deepEqual(wrapText('a b c', 1, len), ['a', 'b', 'c']);
  assert.deepEqual(wrapText('ab c', 1, len), ['ab', 'c']);
});
test('wrapText: whitespace handling - runs preserved mid-line, trimmed at wrap/ends, leading dropped', () => {
  assert.deepEqual(wrapText('a   b', 100, len), ['a   b']);
  assert.deepEqual(wrapText('  a b', 100, len), ['a b']);   // characterize: leading whitespace dropped
  assert.deepEqual(wrapText('a b   ', 100, len), ['a b']);  // trailing trimmed
  assert.deepEqual(wrapText('aaa   bbb', 4, len), ['aaa', 'bbb']);
  assert.deepEqual(wrapText('   ', 10, len), ['']);
});
test('wrapText: uses the injected measure (variable-width), numeric-string width coerced', () => {
  const wide = (s) => s.length * 2;
  assert.deepEqual(wrapText('ab cd', 5, wide), ['ab', 'cd']);
  assert.deepEqual(wrapText('ab cd', 10, wide), ['ab cd']);
  assert.deepEqual(wrapText('aaa bbb ccc', '7', len), ['aaa bbb', 'ccc']);
});
test('wrapText: always returns at least one line', () => {
  for (const t of ['', '\n', ' ', 'x']) assert.ok(wrapText(t, 5, len).length >= 1);
  assert.deepEqual(wrapText('\n', 5, len), ['', '']);
});

// ---------------------------------------------------------------- debounce (mock timers)
test('debounce: collapses rapid calls into one trailing call with last args and `this`', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const obj = { id: 'o', f: debounce(function (x) { calls.push([this.id, x]); }, 100) };
  obj.f(1); t.mock.timers.tick(50);
  obj.f(2); t.mock.timers.tick(50);
  obj.f(3);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(99);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [['o', 3]]);
  t.mock.timers.tick(1000);
  assert.equal(calls.length, 1);
});
test('debounce: separate bursts each fire once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let n = 0;
  const d = debounce(() => { n++; }, 10);
  d(); t.mock.timers.tick(10);
  d(); t.mock.timers.tick(10);
  assert.equal(n, 2);
});

// ---------------------------------------------------------------- aggregator
test('CtUtil aggregator: static members are the same function references as the named exports', () => {
  const named = { downloadBlob, debounce, clamp, num, clampInt, escapeHtml, escapeAttr, persistState,
    onceFlag, el, prefersReducedMotion, restartAnimation, setupHiDPICanvas, posAt, slugify, wrapText };
  for (const [k, fn] of Object.entries(named)) {
    assert.equal(typeof fn, 'function', k);
    assert.equal(CtUtil[k], fn, `CtUtil.${k}`);
  }
});
