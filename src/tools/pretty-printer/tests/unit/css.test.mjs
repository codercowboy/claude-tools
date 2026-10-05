// Unit tests — CSS engine (source/logic.mjs). node --test, no browser/DOM.
// See DESIGN.md § "CSS (full)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCSS, minifyCSS, SAMPLES } from './_helpers.mjs';

const INPUTS = {
  simple: 'a{color:red;background:blue}',
  multiSelector: '.a,.b,.c{margin:0;padding:0}',
  nestedAtRule: '@media (max-width:640px){.card{flex-direction:column;gap:8px}}',
  keyframes: '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
  vars: ':root{--gap:8px;--fg:#1c1c1f}body{color:var(--fg);gap:var(--gap)}',
  url: '.bg{background:url("bg.png") no-repeat}.bg2{background:url(plain.svg)}',
  emptyRule: '.empty{}',
  fontFace: '@font-face{font-family:"My Font";src:url(f.woff2)}',
};

test('formatCSS: fmt(fmt(x)) === fmt(x) — idempotent', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const once = formatCSS(src);
    assert.equal(formatCSS(once), once, name);
  }
});

test('minifyCSS: min(min(x)) === min(x) — idempotent', () => {
  for (const [name, src] of Object.entries(INPUTS)) {
    const once = minifyCSS(src);
    assert.equal(minifyCSS(once), once, name);
  }
});

test('minifyCSS re-parses to the same rule/declaration set as the original', () => {
  // Minifying the *formatted* form must yield the exact same bytes as
  // minifying the original — i.e. format and minify agree on the rule and
  // declaration set. (This is comment-safe: minify strips comments on both
  // sides, so a preserved top-level comment in the formatted form doesn't
  // create a spurious difference.)
  for (const [name, src] of Object.entries(INPUTS)) {
    assert.equal(minifyCSS(formatCSS(src)), minifyCSS(src), name);
  }
});

test('minifyCSS: strings are preserved byte-for-byte (structural chars inside untouched)', () => {
  const src = 'a::before{content:"a ; b : c { } ,"}';
  assert.equal(minifyCSS(src), 'a::before{content:"a ; b : c { } ,"}');
  assert.ok(minifyCSS(src).includes('"a ; b : c { } ,"'));
});

test('minifyCSS: url() contents (quoted and unquoted, with inner spaces) are preserved', () => {
  assert.ok(minifyCSS('a{background:url( bg.png )}').includes('url( bg.png )'));
  assert.ok(minifyCSS('a{background:url("my file.png")}').includes('url("my file.png")'));
  assert.ok(minifyCSS('a{background:url(data:image/svg+xml;base64,AAAA)}').includes('url(data:image/svg+xml;base64,AAAA)'));
});

test('minifyCSS: removes spaces around { } : ; , and drops the last ";" in a block', () => {
  assert.equal(minifyCSS('.a { color : red ; }'), '.a{color:red}');
  assert.equal(minifyCSS('.a , .b { x : 1 ; y : 2 ; }'), '.a,.b{x:1;y:2}');
  assert.equal(minifyCSS('a{b:1;c:2;}'), 'a{b:1;c:2}');
});

test('minifyCSS: comments are stripped', () => {
  // Both the leading and the inline comment are removed (an inline comment
  // acts like whitespace, so a harmless space can remain in its place).
  const out = minifyCSS('/* c */a{color:red/* inline */}');
  assert.doesNotMatch(out, /\/\*/);
  assert.doesNotMatch(out, /inline/);
  assert.equal(out.replace(/\s+/g, ''), 'a{color:red}');
  assert.doesNotMatch(minifyCSS(SAMPLES.css), /\/\*/);
});

test('formatCSS: one declaration per line, "prop: value;" shape', () => {
  const out = formatCSS('a{color:red;margin:0}');
  assert.equal(out.trim(), 'a {\n  color: red;\n  margin: 0;\n}');
});

test('formatCSS: honors indent option (2 / 4 / tab)', () => {
  const src = 'a{color:red}';
  assert.match(formatCSS(src, { indent: 2 }), /\n {2}color: red;/);
  assert.match(formatCSS(src, { indent: 4 }), /\n {4}color: red;/);
  assert.match(formatCSS(src, { indent: '\t' }), /\n\tcolor: red;/);
});

test('formatCSS: top-level comments are preserved', () => {
  const out = formatCSS('/* theme */\na{color:red}');
  assert.ok(out.includes('/* theme */'));
});

test('formatCSS: nested at-rule blocks are indented one level deeper', () => {
  const out = formatCSS('@media (max-width:640px){.card{color:red}}');
  assert.match(out, /@media \(max-width:640px\) \{/);
  // The inner rule and its declaration are indented inside the at-rule.
  assert.match(out, /\n {2}\.card \{/);
  assert.match(out, /\n {4}color: red;/);
});

test('formatCSS: multiple selectors are split one per line', () => {
  const out = formatCSS('.a,.b,.c{margin:0}');
  assert.match(out, /\.a,\n\.b,\n\.c \{/);
});

test('formatCSS: strings and url() survive formatting unchanged', () => {
  const out = formatCSS('a{content:"x { y }";background:url( sp ace.png )}');
  assert.ok(out.includes('"x { y }"'));
  assert.ok(out.includes('url( sp ace.png )'));
});

test('CSS sample: minify re-parses to the same set and format is idempotent', () => {
  const src = SAMPLES.css;
  assert.equal(minifyCSS(formatCSS(src)), minifyCSS(src));
  const f = formatCSS(src);
  assert.equal(formatCSS(f), f);
});
