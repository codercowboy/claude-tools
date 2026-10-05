// Unit tests — JavaScript engine (source/logic.mjs). node --test, no browser.
// See DESIGN.md § "JavaScript". This is the crux suite: for a large
// adversarial battery, BOTH formatJS and minifyJS must be (a) token-equivalent
// to the input (same ordered significant-token stream) and (b) still parse.
// minifyJS additionally must never join tokens across an existing newline and
// never edit the contents of a string, template, or regex.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJS, minifyJS, tokenizeJS, SAMPLES,
  jsSignificantValues, jsParsesAsScript, jsParsesAsFunctionBody, jsParsesAsModule,
} from './_helpers.mjs';

// ---------------------------------------------------------------------------
// The adversarial token battery — every entry must stay token-equivalent
// through both format and minify. (Parseability is checked separately, since
// a few entries are intentionally invalid as standalone programs.)
// ---------------------------------------------------------------------------
const TOKEN_BATTERY = [
  // regex vs division
  'return /a/g',
  'a=b/c/d',
  'x++ / y / z',
  '}/re/',
  'typeof /re/',
  'this/x/y',
  '/[/]/',
  '/a\\/b/g',
  'const re = /\\/(\\d+)\\//g',
  'a = b /c/ d',
  'let m = s.match(/\\d+/g)',
  // templates
  '`a${`b${c}d`}e`',
  '${ {a:1}.a }',
  'const x = `t ${ {a:1}.a } u`',
  'const y = `line1\nline2 ${v} end`',
  'tag`a${b}c`',
  '`${a}${b}${c}`',
  // strings with tricky contents
  'let s = "a // b /* c */ ` d"',
  "let s2 = 'it\\'s a /regex/ and // not a comment'",
  'let s3 = "line\\nbreak\\tand\\"quote"',
  // numbers
  'let n = 1_000_000',
  'let b = 0xFF_FF',
  'let big = 9007199254740993n',
  'let f = 6.022e23',
  'let bin = 0b1010_1010',
  // modern operators
  'let o = a?.b ?? c',
  'obj?.method?.()?.[0]',
  'x ??= y',
  'a &&= b',
  // private fields / class
  'class A { #x = 1; get v() { return this.#x } }',
  'class B extends A { constructor() { super() } }',
  // arrows / chains
  'const nums = [1,2,3].map(n => n*2).filter(n => n > 2)',
  'const g = (a, b) => ({ sum: a + b })',
  // operator adjacency that must not merge
  'let d = a - -b',
  'let p = a + +b',
  'let q = i++ + j',
  'let r = a-- - b',
  // structure
  'if (a) { b() } else { c() }',
  'for (let i = 0; i < 10; i++) { total += i }',
  'const obj = { a: 1, b: 2, "c d": 3, [k]: 4 }',
  'switch (x) { case 1: break; default: break }',
  // ASI corners
  'a\n++b',
  'throw\nx',
  'return\n a',
  'function f() { return\n a }',
];

test('formatJS is token-equivalent to the input across the whole battery', () => {
  for (const src of TOKEN_BATTERY) {
    assert.deepEqual(jsSignificantValues(formatJS(src)), jsSignificantValues(src),
      `format changed the token stream for: ${JSON.stringify(src)}`);
  }
});

test('minifyJS is token-equivalent to the input across the whole battery', () => {
  for (const src of TOKEN_BATTERY) {
    assert.deepEqual(jsSignificantValues(minifyJS(src)), jsSignificantValues(src),
      `minify changed the token stream for: ${JSON.stringify(src)}`);
  }
});

// ---------------------------------------------------------------------------
// Parseability — a formatter/minifier that emits code that no longer parses is
// a hard failure. Categorised by the strictest context each snippet is valid
// in.
// ---------------------------------------------------------------------------
const VALID_AS_SCRIPT = [
  'a=b/c/d',
  'x++ / y / z',
  'typeof /re/',
  'this/x/y',
  'let r = /[/]/',
  'let r2 = /a\\/b/g',
  'const re = /\\/(\\d+)\\//g',
  'let m = "s".match(/\\d+/g)',
  'let t = `a${`b${c}d`}e`',
  'let u = `t ${ {a:1}.a } u`',
  'let s = "a // b /* c */ ` d"',
  'let n = 1_000_000',
  'let big = 9007199254740993n',
  'let o = a?.b ?? c',
  'class A { #x = 1; get v() { return this.#x } }',
  'const nums = [1,2,3].map(n => n*2).filter(n => n > 2)',
  'const g = (a, b) => ({ sum: a + b })',
  'let d = a - -b',
  'let q = i++ + j',
  'if (a) { b() } else { c() }',
  'for (let i = 0; i < 10; i++) { total += i }',
  'const obj = { a: 1, b: 2, "c d": 3 }',
  'a\n++b',
];

test('formatJS output still parses (valid-as-script battery)', () => {
  for (const src of VALID_AS_SCRIPT) {
    assert.ok(jsParsesAsScript(formatJS(src)), `format broke parse: ${JSON.stringify(src)} -> ${JSON.stringify(formatJS(src))}`);
  }
});

test('minifyJS output still parses (valid-as-script battery)', () => {
  for (const src of VALID_AS_SCRIPT) {
    assert.ok(jsParsesAsScript(minifyJS(src)), `minify broke parse: ${JSON.stringify(src)} -> ${JSON.stringify(minifyJS(src))}`);
  }
});

const VALID_AS_FUNCTION_BODY = [
  'return /a/g.test(x)',
  'return\n a',
  'return a ? /x/ : b / c',
];

test('formatJS/minifyJS output parses as a function body (top-level return cases)', () => {
  for (const src of VALID_AS_FUNCTION_BODY) {
    assert.ok(jsParsesAsFunctionBody(formatJS(src)), `format: ${JSON.stringify(src)}`);
    assert.ok(jsParsesAsFunctionBody(minifyJS(src)), `minify: ${JSON.stringify(src)}`);
  }
});

const VALID_AS_MODULE = [
  "import { readFile } from 'node:fs/promises';\nexport const x = 1;",
  "import def, { a, b } from 'mod';\nexport { a, b };\nexport default def;",
  SAMPLES.js,
];

test('formatJS/minifyJS output parses as a module (import/export cases)', () => {
  for (const src of VALID_AS_MODULE) {
    assert.ok(jsParsesAsModule(formatJS(src)), `format broke module parse: ${JSON.stringify(src.slice(0, 40))}…`);
    assert.ok(jsParsesAsModule(minifyJS(src)), `minify broke module parse: ${JSON.stringify(src.slice(0, 40))}…`);
  }
});

// ---------------------------------------------------------------------------
// ASI safety — minifyJS must never join two tokens across an existing newline.
// ---------------------------------------------------------------------------
test('minifyJS preserves newlines that separate tokens (ASI safety)', () => {
  assert.ok(minifyJS('a\n++b').includes('\n'), 'a\\n++b');
  assert.ok(minifyJS('throw\nx').includes('throw\nx'), 'throw\\nx');
  assert.ok(minifyJS('function f(){return\n a}').includes('return\n'), 'return\\n a');
  // A newline between two identifiers is never collapsed to nothing (which
  // would merge them) — it stays a newline.
  const out = minifyJS('const a = 1\nconst b = 2');
  assert.ok(out.includes('\n'), out);
  assert.deepEqual(jsSignificantValues(out), jsSignificantValues('const a = 1\nconst b = 2'));
});

test('minifyJS keeps a multi-line program multi-line (does not risk-collapse)', () => {
  const out = minifyJS(SAMPLES.js);
  assert.ok(out.includes('\n'), 'expected preserved newlines in the minified sample');
});

// ---------------------------------------------------------------------------
// Literal-content integrity — strings, templates and regexes are opaque.
// ---------------------------------------------------------------------------
test('minifyJS never edits the contents of strings, templates, or regexes', () => {
  const cases = [
    ['let s = "keep  spaces  and // slashes /* here */"', '"keep  spaces  and // slashes /* here */"'],
    // The literal *text* spans of a template are opaque; only the interpolated
    // ${…} expression (real code) is minified — so the text runs survive verbatim.
    ['let t = `tpl  with   spaces ${x}  and\ttabs`', '`tpl  with   spaces ${x}  and\ttabs`'],
    ['let r = /a  b\\/c/gi', '/a  b\\/c/gi'],
    ["let q = 'single // not a comment'", "'single // not a comment'"],
  ];
  for (const [src, literal] of cases) {
    assert.ok(minifyJS(src).includes(literal), `minify altered literal in ${JSON.stringify(src)} -> ${JSON.stringify(minifyJS(src))}`);
    assert.ok(formatJS(src).includes(literal), `format altered literal in ${JSON.stringify(src)}`);
  }
});

test('minifyJS: template literal text spans are preserved even as the ${…} expression is minified', () => {
  // Spaces in the text ("a  b") stay; spaces inside the interpolation collapse.
  assert.equal(minifyJS('`a  b ${  x  +  y  } c  d`'), '`a  b ${x+y} c  d`');
});

test('minifyJS strips comments but leaves surrounding tokens intact', () => {
  const src = 'const a = 1; // a line comment\n/* block */ const b = 2;';
  const out = minifyJS(src);
  assert.doesNotMatch(out, /line comment/);
  assert.doesNotMatch(out, /block/);
  assert.deepEqual(jsSignificantValues(out), jsSignificantValues('const a = 1;\nconst b = 2;'));
});

// ---------------------------------------------------------------------------
// tokenizeJS — the crux mechanism, tested directly.
// ---------------------------------------------------------------------------
function types(src) {
  return tokenizeJS(src).filter((t) => t.type !== 'ws').map((t) => t.type);
}
function hasType(src, ty) {
  return tokenizeJS(src).some((t) => t.type === ty);
}

test('tokenizeJS: distinguishes regex literals from division', () => {
  assert.ok(hasType('return /a/g', 'regex'), 'after return → regex');
  assert.ok(hasType('typeof /re/', 'regex'), 'after typeof → regex');
  assert.ok(hasType('}/re/', 'regex'), 'after } → regex');
  assert.ok(!hasType('a/b/c', 'regex'), 'a/b/c → division, not regex');
  assert.ok(!hasType('x++ / y', 'regex'), 'after ++ → division');
  assert.ok(!hasType('this/x', 'regex'), 'after this → division');
  assert.ok(!hasType('foo()/2', 'regex'), 'after ) → division');
});

test('tokenizeJS: a regex character class can contain an unescaped "/"', () => {
  const toks = tokenizeJS('/[/]/').filter((t) => t.type !== 'ws');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, 'regex');
  assert.equal(toks[0].value, '/[/]/');
});

test('tokenizeJS: nested templates tokenize without swallowing the outer text', () => {
  assert.deepEqual(jsSignificantValues('`a${`b${c}d`}e`'),
    ['`a${', '`b${', 'c', '}d`', '}e`']);
});

test('tokenizeJS: strings and comments are separate token types', () => {
  const t = types('let s = "x"; // c\n/* b */ let n = 1');
  assert.ok(t.includes('string'));
  assert.ok(t.includes('lineComment'));
  assert.ok(t.includes('blockComment'));
  assert.ok(t.includes('number'));
});

test('tokenizeJS: numeric separators, BigInt, hex/binary are single number tokens', () => {
  for (const num of ['1_000_000', '0xFF_FF', '0b1010', '9007199254740993n', '6.022e23']) {
    const toks = tokenizeJS(num).filter((t) => t.type !== 'ws');
    assert.equal(toks.length, 1, num);
    assert.equal(toks[0].type, 'number', num);
    assert.equal(toks[0].value, num, num);
  }
});

// ---------------------------------------------------------------------------
// Idempotency.
// ---------------------------------------------------------------------------
test('formatJS: fmt(fmt(x)) === fmt(x) — idempotent across the battery', () => {
  for (const src of VALID_AS_SCRIPT) {
    const once = formatJS(src);
    assert.equal(formatJS(once), once, JSON.stringify(src));
  }
});

test('minifyJS: min(min(x)) === min(x) — idempotent across the battery', () => {
  for (const src of VALID_AS_SCRIPT) {
    const once = minifyJS(src);
    assert.equal(minifyJS(once), once, JSON.stringify(src));
  }
});

// ---------------------------------------------------------------------------
// formatJS spacing — the re-worked formatter adds token-level spacing while
// staying token-preserving. Each case below is ALSO covered by the
// token-equivalence + parseability batteries above; here we assert the actual
// spacing shows up in the output.
// ---------------------------------------------------------------------------
test('formatJS: spaces around binary operators (|| && + comparisons =>)', () => {
  assert.match(formatJS('let x = a||b'), /a \|\| b/);
  assert.match(formatJS('let x = a&&b'), /a && b/);
  assert.match(formatJS('let x = a+b'), /a \+ b/);
  assert.match(formatJS('let x = a>b'), /a > b/);
  assert.match(formatJS('let x = a===b'), /a === b/);
  assert.match(formatJS('const f = n=>n'), /n => n/);
});

test('formatJS: spaces around "=" in assignments and declarations', () => {
  assert.match(formatJS('let x=y'), /let x = y/);
  assert.match(formatJS('a=1'), /a = 1/);
  assert.match(formatJS('x+=2'), /x \+= 2/);
});

test('formatJS: does NOT space unary operators or the regex/division cases', () => {
  assert.match(formatJS('let d = a - -b'), /a - -b/);   // binary minus spaced, unary minus tight
  assert.match(formatJS('let q = i++ + j'), /i\+\+ \+ j/); // postfix tight, binary + spaced
  assert.ok(formatJS('let n = !x').includes('!x'), formatJS('let n = !x'));
  assert.ok(formatJS('let r = /\\d+/g').includes('/\\d+/g')); // regex untouched
  assert.match(formatJS('a=b/c/d'), /b \/ c \/ d/);      // division IS a binary op → spaced
});

test('formatJS: a space after every comma', () => {
  assert.match(formatJS('f(a,b,c)'), /f\(a, b, c\)/);
  assert.match(formatJS('const a=[1,2,3]'), /\[1, 2, 3\]/);
});

test('formatJS: a space before a block "{" and in ") {" / "} else {"', () => {
  assert.match(formatJS('function foo(){}'), /function foo\(\) \{/);
  assert.match(formatJS('if(x){a()}'), /if \(x\) \{/);
  assert.match(formatJS('if(x){a()}else{b()}'), /\} else \{/);
});

test('formatJS: import statements stay on a single line', () => {
  const out = formatJS("import {a,b} from 'm';\nconst x = 1;");
  assert.ok(out.includes("import { a, b } from 'm';"), out);
  // the import must not be broken across lines
  const importLine = out.split('\n').find((l) => l.startsWith('import'));
  assert.ok(importLine.includes('from'), 'import kept on one line: ' + JSON.stringify(importLine));
  // a default + named import is also one line
  assert.ok(formatJS("import def,{a,b} from 'm';").includes("import def, { a, b } from 'm';"));
});

test('formatJS: blank line between the import group and the first declaration', () => {
  const out = formatJS("import a from 'a';\nimport b from 'b';\nconst x = 1;\nfunction f(){}");
  // imports grouped together (no blank line between the two imports)
  assert.match(out, /import a from 'a';\nimport b from 'b';/);
  // blank line before the first non-import statement …
  assert.match(out, /import b from 'b';\n\nconst x = 1;/);
  // … and between the top-level declarations
  assert.match(out, /const x = 1;\n\nfunction f\(\) \{/);
});

test('formatJS: spacing additions never change the token stream or break parse', () => {
  const cases = [
    'let x = a||b', 'f(a,b,c)', 'const x=y', 'function foo(){}',
    'if(x){a()}else{b()}', "import {a,b} from 'm';\nconst x = 1;",
  ];
  for (const src of cases) {
    assert.deepEqual(jsSignificantValues(formatJS(src)), jsSignificantValues(src), src);
  }
});

test('JS sample: format & minify are token-equivalent and both still parse (module)', () => {
  const src = SAMPLES.js;
  assert.deepEqual(jsSignificantValues(formatJS(src)), jsSignificantValues(src));
  assert.deepEqual(jsSignificantValues(minifyJS(src)), jsSignificantValues(src));
  assert.ok(jsParsesAsModule(formatJS(src)));
  assert.ok(jsParsesAsModule(minifyJS(src)));
});
