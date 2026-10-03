// node:test suite for the ESM inliner (<<ct:module>> / <<ct:lib>>) in build-tool.mjs.
// Fixtures are generated in os.tmpdir(); real lib/tools are only ever READ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTool, bundleModule, createModuleState, transformModule, resolveLibDir } from '../build-tool.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_LIB = resolveLibDir(REPO);

function fixtureLib(files) {
  const lib = mkdtempSync(join(tmpdir(), 'ct-lib-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(lib, p)), { recursive: true });
    writeFileSync(join(lib, p), c);
  }
  return lib;
}
// Build a temp tool whose template is `body`; returns the output html.
function build(body, { lib, files = {} } = {}) {
  const tool = mkdtempSync(join(tmpdir(), 'ct-tool-'));
  mkdirSync(join(tool, 'source'));
  writeFileSync(join(tool, 'source', 'index.template.html'), `<!doctype html>\n${body}`);
  for (const [n, c] of Object.entries(files)) writeFileSync(join(tool, 'source', n), c);
  return buildTool(tool, { includeDir: join(tool, 'source'), project: null, libDir: lib });
}
const js = (out) => out.replace(/^<!doctype html>\n/, '').replace(/^<!-- GENERATED[^\n]*\n/, '').replace(/<\/?script[^>]*>/g, '');
const count = (s, re) => (s.match(re) || []).length;
const noEsm = (out) => assert.ok(!/^(export|import)\b/m.test(out), 'no line-start import/export');

test('T1 strips export forms and export blocks; no line-start import/export', () => {
  const lib = fixtureLib({
    'utils/Dep.mjs': 'export function dep() { return 1; }\n',
    'utils/M.mjs': [
      "import { dep } from './Dep.mjs';",
      'export async function af() { return dep(); }',
      'export const X = [',
      '  1,',
      '  2,',
      '];',
      'export class C {}',
      'function hidden() {}',
      'export { hidden as pub, dep as dep2 };',
      'export {',
      '  hidden,',
      '};',
      '',
    ].join('\n'),
  });
  const out = build('<script type="module">\n<<ct:module utils/M.mjs>>\n</script>\n', { lib });
  noEsm(out);
  assert.equal(count(out, /function dep\(/g), 1);
  assert.match(out, /const \{ dep \} = __ct_utils_Dep;/);
  assert.match(out, /return \{ af, X, C, pub: hidden, dep2: dep, hidden \};/);
  assert.match(out, /const \{ af, X, C, pub, dep2, hidden \} = __ct_utils_M;/);
  new vm.Script(js(out)); // syntax-valid
});

test('T2 prose safety: "importable", indented import, JSDoc import left untouched', () => {
  const body = [
    '/**',
    ' * An importable helper.',
    " *     import { x } from 'y';",
    ' */',
    'export function f() {',
    "  // import { z } from 'q';",
    "  const s = 'export default nothing';",
    '  return s;',
    '}',
    '',
  ].join('\n');
  const lib = fixtureLib({ 'utils/P.mjs': body });
  const out = build('<<ct:module utils/P.mjs>>', { lib });
  assert.ok(out.includes(body.replace('export function f', 'function f')));
});

test('T3 relative imports: ./ and ../ (cross-subdir), dedup + order', () => {
  const lib = fixtureLib({
    'utils/Dep.mjs': 'export function dep() {}\n',
    'utils/formats/A.mjs': "import { dep as d } from '../Dep.mjs';\nexport function a() { return d(); }\n",
    'utils/B.mjs': "import { dep } from './Dep.mjs';\nexport function b() { return dep(); }\n",
  });
  const out = build('<<ct:module utils/formats/A.mjs>>\n<<ct:module utils/B.mjs>>', { lib });
  assert.equal(count(out, /function dep\(/g), 1);
  assert.match(out, /const \{ dep: d \} = __ct_utils_Dep;/);
  assert.ok(out.indexOf('function dep(') < out.indexOf('function a('));
  assert.ok(out.indexOf('function a(') < out.indexOf('function b('));
});

test('T3b three-deep chain emits leaf first', () => {
  const lib = fixtureLib({
    'utils/Leaf.mjs': 'export function leaf() {}\n',
    'utils/image/Mid.mjs': "import { leaf } from '../Leaf.mjs';\nexport function mid() { leaf(); }\n",
    'utils/image/Top.mjs': "import { mid } from './Mid.mjs';\nexport function top() { mid(); }\n",
  });
  const out = build('<<ct:module utils/image/Top.mjs>>', { lib });
  const i = ['function leaf(', 'function mid(', 'function top('].map((s) => out.indexOf(s));
  assert.ok(i[0] > -1 && i[0] < i[1] && i[1] < i[2]);
});

test('T4 shared dep imported by two modules emitted once, above both', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const D = 1;\n',
    'A.mjs': "import { D } from './Dep.mjs';\nexport const A = D;\n",
    'B.mjs': "import { D } from './Dep.mjs';\nexport const B = D;\n",
    'Root.mjs': "import { A } from './A.mjs';\nimport { B } from './B.mjs';\nexport const R = A + B;\n",
  });
  const out = build('<<ct:module Root.mjs>>', { lib });
  assert.equal(count(out, /const D = 1;/g), 1);
  assert.ok(out.indexOf('const D = 1;') < out.indexOf('const A = D;'));
  assert.ok(out.indexOf('const D = 1;') < out.indexOf('const B = D;'));
  const code = js(out);
  assert.equal(vm.runInNewContext(code + '\nR'), 2);
});

test('T4b two root tokens sharing a dep: dep once; T4d deterministic; per-call state', () => {
  const lib = fixtureLib({
    'Dep.mjs': 'export const D = 1;\n',
    'A.mjs': "import { D } from './Dep.mjs';\nexport const A = D;\n",
    'B.mjs': "import { D } from './Dep.mjs';\nexport const B = D;\n",
  });
  const tpl = '<<ct:module A.mjs>>\n<<ct:module B.mjs>>';
  const o1 = build(tpl, { lib });
  assert.equal(count(o1, /const D = 1;/g), 1);
  assert.equal(build(tpl, { lib }), o1);
  // another build in the same process must carry its own copy (no leaked state)
  assert.equal(count(build('<<ct:module B.mjs>>', { lib }), /const D = 1;/g), 1);
});

test('T4c same dep reached via ./ and ../ spellings emitted once', () => {
  const lib = fixtureLib({
    'u/Dep.mjs': 'export const D = 1;\n',
    'u/s/A.mjs': "import { D } from '../Dep.mjs';\nexport const A = D;\n",
    'u/B.mjs': "import { D } from './Dep.mjs';\nexport const B = D;\n",
  });
  const out = build('<<ct:module u/s/A.mjs>><<ct:module u/B.mjs>>', { lib });
  assert.equal(count(out, /const D = 1;/g), 1);
});

test('T4e repeated identical root token emits nothing twice', () => {
  const lib = fixtureLib({ 'A.mjs': 'export const A = 1;\n' });
  const out = build('<<ct:module A.mjs>><<ct:module A.mjs>>', { lib });
  assert.equal(count(out, /const A = 1;/g), 1);
});

test('T5 real lib: utils, components, deep chain parse; names bound', () => {
  for (const p of ['utils/CtByteUtil.mjs', 'utils/CtZipUtil.mjs', 'components/CtConfirm.mjs', 'utils/image/CtDither.mjs']) {
    const out = build(`<script type="module">\n<<ct:module ${p}>>\n</script>`, { lib: REAL_LIB });
    noEsm(out);
    new vm.Script(js(out));
  }
  const dither = build('<<ct:module utils/image/CtDither.mjs>>', { lib: REAL_LIB });
  assert.equal(count(dither, /function clampByte\(/g), 1);
  assert.ok(dither.indexOf('/* ct:module utils/CtByteUtil.mjs */') < dither.indexOf('/* ct:module utils/image/CtImageUtil.mjs */'));
  assert.ok(dither.indexOf('/* ct:module utils/image/CtImageUtil.mjs */') < dither.indexOf('/* ct:module utils/image/CtDither.mjs */'));
  assert.match(dither, /const \{ nearestColorIndex, floydSteinberg, atkinson, bayerMatrix, bayer \} = __ct_utils_image_CtDither;/);
});

test('T5b ct:lib pastes real css/html verbatim (with $ literal), project tokens filled after', () => {
  for (const p of ['components/styles/base.css', 'components/footer.html']) {
    const out = build(`<<ct:lib ${p}>>`, { lib: REAL_LIB });
    const real = readFileSync(join(REAL_LIB, p), 'utf8');
    assert.ok(out.includes(real), p);
  }
  const lib = fixtureLib({ 'x.css': "a::after{content:'$&$1'}\n{{project.name}}" });
  const tool = mkdtempSync(join(tmpdir(), 'ct-tool-'));
  mkdirSync(join(tool, 'source'));
  writeFileSync(join(tool, 'source', 'index.template.html'), '<!doctype html>\n<<ct:lib x.css>>');
  const out = buildTool(tool, { includeDir: tool, libDir: lib, project: { name: 'NM', repo: '', repoLabel: '', tagline: '' } });
  assert.ok(out.includes("content:'$&$1'") && out.includes('NM'));
});

// Collect every real lib .mjs
function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : [];
  });
}
test('T6 whole-lib equivalence: every module transforms, parses, and export names match native import()', async () => {
  const files = [...walk(join(REAL_LIB, 'utils')), ...walk(join(REAL_LIB, 'components'))];
  assert.ok(files.length > 10);
  for (const f of files) {
    const rel = f.slice(REAL_LIB.length + 1);
    const out = build(`<<ct:module ${rel}>>`, { lib: REAL_LIB });
    noEsm(out);
    new vm.Script(js(out));
    const t = transformModule(readFileSync(f, 'utf8'), f, REAL_LIB);
    if (rel.startsWith('utils/')) {
      const native = Object.keys(await import(pathToFileURL(f).href)).sort();
      assert.deepEqual([...t.exports.keys()].sort(), native, rel);
    }
  }
});

test('T6b pure util bundle evaluates in vm with same export keys as native', async () => {
  const f = join(REAL_LIB, 'utils/CtByteUtil.mjs');
  const out = build('<<ct:module utils/CtByteUtil.mjs>>', { lib: REAL_LIB });
  const keys = vm.runInNewContext(js(out).replace(/\nconst \{[^}]*\} = __ct_utils_CtByteUtil;\s*$/, '\n') + '\nObject.keys(__ct_utils_CtByteUtil)');
  assert.deepEqual([...keys].sort(), Object.keys(await import(pathToFileURL(f).href)).sort());
});

test('T7 unsupported constructs fail loud with file, line, construct', () => {
  const cases = [
    ['export default function () {}', /ExportDefault|export default/],
    ["export * from './x.mjs';", /export \*/],
    ["export { x } from './x.mjs';", /re-export/],
    ["import X from './x.mjs';", /unsupported import form/],
    ["import * as n from './x.mjs';", /unsupported import form/],
    ["import './x.mjs';", /unsupported import form/],
    ["import { a } from 'lodash';", /unsupported import specifier 'lodash'/],
    ["import { a } from './noext';", /must end in \.mjs/],
    ["import { a } from './x.js';", /must end in \.mjs/],
    ['export let q = 1;', /mutable export not supported/],
    ['export var q = 1;', /mutable export not supported/],
    ['import.meta.url;', /unsupported import form/],
    ["import('./x.mjs');", /unsupported import form/],
    ['export const a, b = 2;', /multiple declarators/],
  ];
  for (const [code, re] of cases) {
    const lib = fixtureLib({ 'Bad.mjs': `// ok\n${code}\n` });
    assert.throws(() => build('<<ct:module Bad.mjs>>', { lib }), (e) => {
      assert.match(e.message, /ESM inliner: Bad\.mjs:2:/, code);
      assert.match(e.message, re, code);
      return true;
    }, code);
  }
});

test('T8 cycles, self-import, path escape, missing file', () => {
  const lib = fixtureLib({
    'A.mjs': "import { b } from './B.mjs';\nexport const a = 1;\n",
    'B.mjs': "import { a } from './A.mjs';\nexport const b = 1;\n",
    'S.mjs': "import { s } from './S.mjs';\nexport const s = 1;\n",
    'E.mjs': "import { o } from '../outside.mjs';\nexport const e = 1;\n",
    'M.mjs': "import { o } from './Nope.mjs';\nexport const m = 1;\n",
  });
  assert.throws(() => build('<<ct:module A.mjs>>', { lib }), /import cycle: A\.mjs -> B\.mjs -> A\.mjs/);
  assert.throws(() => build('<<ct:module S.mjs>>', { lib }), /import cycle: S\.mjs -> S\.mjs/);
  assert.throws(() => build('<<ct:module E.mjs>>', { lib }), /outside the lib dir/);
  assert.throws(() => build('<<ct:module ../x.mjs>>', { lib }), /outside the lib dir/);
  assert.throws(() => build('<<ct:lib ../x.css>>', { lib }), /outside the lib dir/);
  assert.throws(() => build('<<ct:module M.mjs>>', { lib }), /module not found: Nope\.mjs.*imported from M\.mjs/);
  assert.throws(() => build('<<ct:module Gone.mjs>>', { lib }), /module not found: Gone\.mjs/);
  assert.throws(() => build('<<ct:module A.css>>', { lib }), /must end in \.mjs/);
});

test('T8c root-vs-root export collision throws naming both tokens', () => {
  const lib = fixtureLib({ 'A.mjs': 'export const same = 1;\n', 'B.mjs': 'export const same = 2;\n' });
  assert.throws(() => build('<<ct:module A.mjs>><<ct:module B.mjs>>', { lib }),
    /'same'.*<<ct:module A\.mjs>>.*<<ct:module B\.mjs>>/);
});

test('T8d isolation: same private top-level name in two modules does not collide', () => {
  const lib = fixtureLib({
    'A.mjs': 'function helper() { return 1; }\nexport const a = helper();\n',
    'B.mjs': 'function helper() { return 2; }\nexport const b = helper();\n',
  });
  const out = build('<<ct:module A.mjs>><<ct:module B.mjs>>', { lib });
  assert.equal(vm.runInNewContext(js(out) + '\n[a, b].join()'), '1,2');
});

test('T9 additive: every shipped tool builds byte-identical', () => {
  const dirs = [];
  for (const base of ['src/tools', 'src/gallery']) {
    const root = join(REPO, base);
    if (existsSync(join(root, 'source', 'index.template.html'))) dirs.push(root);
    else if (existsSync(root)) for (const n of readdirSync(root)) {
      const d = join(root, n);
      if (existsSync(join(d, 'source', 'index.template.html'))) dirs.push(d);
    }
  }
  assert.ok(dirs.length >= 9);
  for (const d of dirs) assert.equal(buildTool(d), readFileSync(join(d, 'index.html'), 'utf8'), d);
});

test('T9c/T10 include/inline stay verbatim alongside ct:module; includeDir + libDir injectable', () => {
  const lib = fixtureLib({ 'A.mjs': 'export const A = 1;\n' });
  const out = build('<<ct:include inc.txt>>|<<ct:inline own.txt>>|<<ct:module A.mjs>>', {
    lib, files: { 'inc.txt': 'INC$&', 'own.txt': 'OWN$1' },
  });
  assert.ok(out.includes('INC$&|OWN$1|/* ct:module A.mjs */'));
});

test('bundleModule is pure per state', () => {
  const lib = fixtureLib({ 'A.mjs': 'export const A = 1;\n' });
  const s = createModuleState();
  assert.ok(bundleModule('A.mjs', { libDir: lib, state: s }).includes('const A = 1;'));
  assert.ok(!bundleModule('A.mjs', { libDir: lib, state: s }).includes('const A = 1;'));
  assert.ok(bundleModule('A.mjs', { libDir: lib, state: createModuleState() }).includes('const A = 1;'));
});
