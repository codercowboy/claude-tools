// Hardening suite for the ESM inliner (<<ct:module>> / <<ct:lib>>) in build-tool.mjs.
// Complements esm-inline.test.mjs: these tests EXECUTE the emitted bundle (not just
// regex it), cover the edges the first suite skipped, and pin the --check gate.
// Fixtures live in os.tmpdir(); real lib/tools are only read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTool, transformModule, resolveLibDir } from '../build-tool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const REAL_LIB = resolveLibDir(REPO);
const BUILD_TOOL = join(REPO, 'scripts', 'build-tool.mjs');

function fixtureLib(files) {
  const lib = mkdtempSync(join(tmpdir(), 'ct-lib-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(lib, p)), { recursive: true });
    writeFileSync(join(lib, p), c);
  }
  return lib;
}
function mkTool(body, files = {}) {
  const tool = mkdtempSync(join(tmpdir(), 'ct-tool-'));
  mkdirSync(join(tool, 'source'));
  writeFileSync(join(tool, 'source', 'index.template.html'), `<!doctype html>\n${body}`);
  for (const [n, c] of Object.entries(files)) writeFileSync(join(tool, 'source', n), c);
  return tool;
}
function build(body, { lib, files = {} } = {}) {
  const tool = mkTool(body, files);
  return buildTool(tool, { includeDir: join(tool, 'source'), project: null, libDir: lib });
}
const js = (out) => out.replace(/^<!doctype html>\n/, '').replace(/^<!-- GENERATED[^\n]*\n/, '').replace(/<\/?script[^>]*>/g, '');
const count = (s, re) => (s.match(re) || []).length;
const run = (out, expr, ctx = {}) => vm.runInNewContext(js(out) + '\n' + expr, ctx);

test('H1 executed semantics: imported + aliased bindings work at runtime, classes/generators/async survive', async () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export function dep(x) { return x + 1; }\nexport const K = 10;\n',
    'M.mjs': [
      "import { dep as d, K } from './Dep.mjs';",
      'export function* gen() { yield d(K); }',
      'export async function af() { return d(1); }',
      'export async function* ag() { yield 5; }',
      'export class C { v() { return d(0); } }',
      '',
    ].join('\n'),
  });
  const out = build('<script type="module">\n<<ct:module M.mjs>>\n</script>', { lib });
  assert.deepEqual([...run(out, '[...gen()]')], [11]);
  assert.equal(run(out, 'new C().v()'), 1);
  assert.equal(await run(out, 'af()'), 2);
  assert.equal(typeof run(out, 'ag'), 'function');
});

test('H2 export-block edges: comments, trailing comma, text after block preserved, no leak of private names', () => {
  const lib = fixtureLib({
    'M.mjs': [
      'const a = 1, b = 2, secret = 3;',
      'export {',
      '  a, // line comment',
      '  /* block */ b as bee,',
      '};',
      'const after = a + b;',
      'export const seen = after;',
      '',
    ].join('\n'),
  });
  const out = build('<<ct:module M.mjs>>', { lib });
  assert.match(out, /const after = a \+ b;/); // statement following the block survives
  assert.equal(run(out, 'bee'), 2);
  assert.equal(run(out, 'a'), 1);
  assert.equal(run(out, 'seen'), 3);
  assert.equal(run(out, 'typeof secret'), 'undefined'); // module-private stays private
});

test('H3 export-form failures: as default, duplicate export name, bad binding', () => {
  const cases = [
    ['const x = 1;\nexport { x as default };', /export \{ x as default \}/],
    ['export function f() {}\nexport { f };', /duplicate export name 'f'/],
    ["export { a b };", /unsupported export binding/],
    ['export const { a } = {};', /unsupported export form/],
  ];
  for (const [code, re] of cases) {
    const lib = fixtureLib({ 'Bad.mjs': code + '\n' });
    assert.throws(() => build('<<ct:module Bad.mjs>>', { lib }), (e) => {
      assert.match(e.message, /ESM inliner: Bad\.mjs:\d+:/);
      assert.match(e.message, re, code);
      return true;
    }, code);
  }
});

test('H4 multi-line import with alias, trailing comma and comments; failures report the right line', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const a = 1;\nexport const b = 2;\n',
    'M.mjs': ["import {", '  a, // first', '  b as bb,', "} from './Dep.mjs';", 'export const r = a + bb;', ''].join('\n'),
    'Late.mjs': "export const ok = 1;\n\n\nexport default 5;\n",
  });
  const out = build('<<ct:module M.mjs>>', { lib });
  assert.match(out, /const \{ a, b: bb \} = __ct_Dep;/);
  assert.equal(run(out, 'r'), 3);
  assert.throws(() => build('<<ct:module Late.mjs>>', { lib }), /Late\.mjs:4: unsupported construct: export default/);
});

test('H5 CRLF sources are normalised (no stray \\r, no leftover import/export)', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const D = 1;\r\n',
    'M.mjs': "import { D } from './Dep.mjs';\r\nexport const M = D;\r\nexport {\r\n  D as D2,\r\n};\r\n",
  });
  const out = build('<<ct:module M.mjs>>', { lib });
  assert.ok(!out.includes('\r'));
  assert.ok(!/^(export|import)\b/m.test(out));
  assert.equal(run(out, 'M + D2'), 2);
});

test('H6 column-0 identifiers that merely START with import/export are left alone', () => {
  const lib = fixtureLib({
    'P.mjs': [
      'const exportList = [];',
      'exportList.push(1);',
      'const importer = { n: 1 };',
      'importer.n++;',
      'export const total = exportList.length + importer.n;',
      '',
    ].join('\n'),
  });
  assert.equal(run(build('<<ct:module P.mjs>>', { lib }), 'total'), 3);
});

test('H7 module-level side effects run once, dependencies first', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'globalThis.log.push("dep");\nexport const D = 1;\n',
    'A.mjs': "import { D } from './Dep.mjs';\nglobalThis.log.push('A');\nexport const A = D;\n",
    'B.mjs': "import { D } from './Dep.mjs';\nglobalThis.log.push('B');\nexport const B = D;\n",
  });
  const log = [];
  const ctx = vm.createContext({ log });
  vm.runInContext(js(build('<<ct:module A.mjs>><<ct:module B.mjs>>', { lib })), ctx);
  assert.deepEqual(log, ['dep', 'A', 'B']);
});

test('H8 root binding sits at its token site, right after its own chunks', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const D = 1;\n',
    'A.mjs': "import { D } from './Dep.mjs';\nexport const A = D;\n",
    'B.mjs': 'export const B = 2;\n',
  });
  const out = build('X1<<ct:module A.mjs>>X2<<ct:module B.mjs>>X3', { lib });
  const at = (s) => out.indexOf(s);
  assert.ok(at('X1') < at('/* ct:module Dep.mjs */'));
  assert.ok(at('const { A } = __ct_A;') < at('X2'));
  assert.ok(at('X2') < at('/* ct:module B.mjs */'));
  assert.ok(at('const { B } = __ct_B;') < at('X3'));
});

test('H9 a module already emitted as a dependency can still be bound later as a root', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const D = 1;\n',
    'A.mjs': "import { D } from './Dep.mjs';\nexport const A = D;\n",
  });
  const out = build('<<ct:module A.mjs>><<ct:module Dep.mjs>>', { lib });
  assert.equal(count(out, /const D = 1;/g), 1);
  assert.match(out, /const \{ D \} = __ct_Dep;/);
  assert.equal(run(out, 'A + D'), 2);
});

test('H10 module with no exports emits no empty root binding and still parses', () => {
  const lib = fixtureLib({ 'E.mjs': 'globalThis.touched = 1;\n' });
  const out = build('<<ct:module E.mjs>>', { lib });
  assert.ok(!/const \{\s*\} =/.test(out));
  const ctx = vm.createContext({});
  vm.runInContext(js(out), ctx);
  assert.equal(ctx.touched, 1);
});

test('H11 module ids that would collide get disambiguated and both run', () => {
  const lib = fixtureLib({
    'a-b.mjs': 'export const x = 1;\n',
    'a_b.mjs': 'export const y = 2;\n',
  });
  const out = build('<<ct:module a-b.mjs>><<ct:module a_b.mjs>>', { lib });
  assert.match(out, /const __ct_a_b = /);
  assert.match(out, /const __ct_a_b_2 = /);
  assert.equal(run(out, 'x + y'), 3);
});

test('H12 tokens carried inside an inlined file are expanded in document order', () => {
  const lib = fixtureLib({ 'A.mjs': 'export const A = 1;\n', 'B.mjs': 'export const B = 2;\n' });
  const out = build('<<ct:module A.mjs>>\n<<ct:inline app.mjs>>', {
    lib, files: { 'app.mjs': '<<ct:module B.mjs>>\nconst z = A + B;' },
  });
  assert.ok(out.indexOf('/* ct:module A.mjs */') < out.indexOf('/* ct:module B.mjs */'));
  assert.equal(run(out, 'z'), 3);
});

test('H13 literal <<ct: in a module body fails loud (not silently re-scanned)', () => {
  const lib = fixtureLib({ 'T.mjs': "export const t = '<<ct:module X.mjs>>';\n" });
  assert.throws(() => build('<<ct:module T.mjs>>', { lib }), /literal <<ct:/);
  const lib2 = fixtureLib({ 'T.css': '/* <<ct:module X.mjs>> */' });
  assert.throws(() => build('<<ct:lib T.css>>', { lib: lib2 }), /literal <<ct:/);
});

test('H14 longer cycle and transitive failure names the whole chain / right file', () => {
  const lib = fixtureLib({
    'A.mjs': "import { b } from './B.mjs';\nexport const a = 1;\n",
    'B.mjs': "import { c } from './C.mjs';\nexport const b = 1;\n",
    'C.mjs': "import { a } from './A.mjs';\nexport const c = 1;\n",
    'R.mjs': "import { x } from './Bad.mjs';\nexport const r = 1;\n",
    'Bad.mjs': 'export default 1;\n',
  });
  assert.throws(() => build('<<ct:module A.mjs>>', { lib }), /import cycle: A\.mjs -> B\.mjs -> C\.mjs -> A\.mjs/);
  assert.throws(() => build('<<ct:module R.mjs>>', { lib }), /Bad\.mjs:1: unsupported construct: export default/);
});

test('H15 no module-level state leaks: failed build does not poison the next one', () => {
  const lib = fixtureLib({
    'A.mjs': "import { b } from './B.mjs';\nexport const a = 1;\n",
    'B.mjs': "import { a } from './A.mjs';\nexport const b = 1;\n",
    'Ok.mjs': 'export const ok = 1;\n',
  });
  assert.throws(() => build('<<ct:module A.mjs>>', { lib }));
  assert.equal(run(build('<<ct:module Ok.mjs>>', { lib }), 'ok'), 1);
  assert.throws(() => build('<<ct:module A.mjs>>', { lib }), /import cycle/);
});

test('H16 transformModule export map: names, aliases, order', () => {
  const t = transformModule(
    "export function f() {}\nexport const g = 1;\nexport class H {}\nconst p = 1;\nexport { p as q };\n",
    '/lib/M.mjs', '/lib');
  assert.deepEqual([...t.exports], [['f', 'f'], ['g', 'g'], ['H', 'H'], ['q', 'p']]);
});

test('H17 whole-lib: every pure util bundle EVALUATES in a vm and its export keys equal native import()', async () => {
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : [];
  });
  const files = walk(join(REAL_LIB, 'utils'));
  assert.ok(files.length > 5);
  for (const f of files) {
    const rel = f.slice(REAL_LIB.length + 1);
    const out = build(`<<ct:module ${rel}>>`, { lib: REAL_LIB });
    const id = out.match(/\nconst (__ct_[\w]+) = \(\(\) => \{[\s\S]*\}\)\(\);\nconst \{[^}]*\} = \1;\s*$/)?.[1]
      ?? out.match(/const (__ct_[\w]+) = \(\(\)/g).pop().match(/__ct_\w+/)[0];
    const keys = vm.runInNewContext(
      js(out).replace(/\nconst \{[^}]*\} = __ct_\w+;\s*$/, '\n') + `\nObject.keys(${id})`,
      { TextEncoder, TextDecoder, URL, console, Uint8Array, Math, Date, JSON });
    const native = Object.keys(await import(pathToFileURL(f).href)).sort();
    assert.deepEqual([...keys].sort(), native, rel);
  }
});

test('H19 indented import/export text inside template literals / bodies is prose, left byte-for-byte', () => {
  const body = [
    'export const tpl = `',
    "  import { x } from './nope.mjs';",
    '  export default 1;',
    '  export { y };',
    '`;',
    'export function f() {',
    '  const s = [',
    "    'a',",
    '  ];',
    '  return s.length;',
    '}',
    '',
  ].join('\n');
  const lib = fixtureLib({ 'P.mjs': body });
  const out = build('<<ct:module P.mjs>>', { lib });
  assert.ok(out.includes("  import { x } from './nope.mjs';\n  export default 1;\n  export { y };\n"));
  assert.match(run(out, 'tpl'), /import \{ x \} from/);
  assert.equal(run(out, 'f()'), 1);
});

test('H18 --check gate: build writes, --check passes, stale/missing index.html exits 1; ct:module via default libDir', () => {
  const tool = mkTool('<script type="module">\n<<ct:module utils/CtByteUtil.mjs>>\n</script>\n');
  const cli = (...a) => spawnSync(process.execPath, [BUILD_TOOL, `--dir=${tool}`, ...a], { encoding: 'utf8' });
  assert.equal(cli('--check').status, 1, 'missing index.html is stale');
  assert.equal(cli().status, 0);
  const built = readFileSync(join(tool, 'index.html'), 'utf8');
  assert.equal(built, buildTool(tool), 'written file is byte-identical to buildTool()');
  assert.equal(cli('--check').status, 0);
  writeFileSync(join(tool, 'index.html'), built + ' ');
  assert.equal(cli('--check').status, 1, 'one extra byte is stale');
  writeFileSync(join(tool, 'index.html'), built);
  assert.equal(cli('--check').status, 0);
  writeFileSync(join(tool, 'source', 'index.template.html'), '<!doctype html>\n<<ct:module utils/Nope.mjs>>');
  const bad = cli('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /module not found: utils\/Nope\.mjs/);
});
