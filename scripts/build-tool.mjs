#!/usr/bin/env node
/*
 * build-tool.mjs — portable, dependency-free builder for a single tool.
 *
 * The SHIPPED artifact for a web tool is always one self-contained `index.html`
 * (opens from file://, no runtime deps, no CDN). A tool that has outgrown
 * comfortable hand-authoring is authored under `source/` instead and assembled
 * back into that one file here. See docs/conventions.md § Build-assembled tools.
 *
 * A tool opts in by having `source/index.template.html`. The template (and any
 * source file it pulls in) may contain these tokens:
 *
 *   <<ct:include NAME>>   LEGACY / RETIRED. Flat include from an include dir. No
 *                         tool uses it any more (the old flat include
 *                         lib was retired; use <<ct:lib>> / <<ct:module>> instead). The
 *                         mechanism is kept only for the injectable `includeDir`
 *                         test seam and an explicit $JC_INCLUDE_DIR override; with
 *                         neither, a <<ct:include>> token throws a clear error.
 *   <<ct:inline NAME>>    inline the tool's own source file source/NAME
 *                         (styles.css, logic.mjs, app.mjs, …).
 *
 *   <<ct:module PATH>>    ESM-inline the library module PATH (relative to the lib
 *                         dir, default <repo>/src/lib, e.g. utils/CtZipUtil.mjs).
 *                         `import`/`export` statements are rewritten: each module
 *                         becomes `const __ct_<id> = (() => { ...; return {exports}; })();`
 *                         (own function scope, so top-level names never collide),
 *                         relative imports are resolved + inlined ONCE (page-wide,
 *                         dependencies first), and the ROOT module's exports are
 *                         bound as `const { a, b } = __ct_<id>;` at the token site.
 *                         Place it inside the tool's <script type="module">, above
 *                         the code that uses the names. Throws on `export default`,
 *                         `export *`, re-exports, `export let|var`, `import X from`,
 *                         `import * as`, bare / non-.mjs specifiers, cycles.
 *   <<ct:lib PATH>>       paste the file PATH from the lib dir VERBATIM
 *                         (components/styles/base.css, components/footer.html, …).
 *
 * Include/inline tokens are expanded repeatedly, so an inlined file may itself
 * contain tokens (e.g. app.mjs holds `<<ct:inline logic.mjs>>` where the pure
 * engine slots in). (The `ct` prefix is an internal name — not project
 * identity.)
 *
 * PROJECT IDENTITY TOKENS. After include/inline expansion, `{{project.*}}`
 * mustache tokens are filled from a project.json (see the identity contract in
 * docs/conventions.md):
 *   {{project.name}}       <- project.json "name"      (verbatim)
 *   {{project.repo}}       <- project.json "repo"      (full URL, used in hrefs)
 *   {{project.repoLabel}}  <- DERIVED: "repo" with a leading http(s):// stripped
 *   {{project.tagline}}    <- project.json "tagline"   (README boilerplate)
 *
 * CONFIG KNOBS
 *   Include dir (LEGACY — flat <<ct:include>> is retired; there is no default):
 *     $JC_INCLUDE_DIR  (absolute, or relative to cwd). Unset => no include dir,
 *     and any <<ct:include>> token fails the build with an explanatory error.
 *   project.json (search order; first that exists wins):
 *     1. <repo>/.claude/jason-code/project.json
 *     2. <repo>/project.json
 *     If none is found, `{{project.*}}` tokens are LEFT UNSUBSTITUTED and a
 *     single warning is written to stderr (the build does not crash). A real
 *     consuming repo always ships a project.json, so `build:check` stays sane;
 *     the warning only fires in a scratch/misconfigured checkout.
 *   <repo> is the parent of this script's directory (scripts/..).
 *
 * Usage (per-tool package.json wires these):
 *   node ../../../scripts/build-tool.mjs           # cwd tool -> index.html
 *   node ../../../scripts/build-tool.mjs --check    # exit 1 if index.html is stale
 * Also importable: buildTool(dir) -> string, runBuild(dir, {check}) -> boolean.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BANNER =
  '<!-- GENERATED FILE — do not edit directly. Author in source/, then run: ' +
  'npm run build (see docs/conventions.md § Build-assembled tools) -->\n';

const TOKEN_RE = /<<ct:(include|inline) ([\w.-]+)>>/g;
const PROJECT_TOKEN_RE = /\{\{project\.(name|repo|repoLabel|tagline)\}\}/g;
const MODULE_RE = /<<ct:module ([\w./-]+)>>/g;
const LIB_RE = /<<ct:lib ([\w./-]+)>>/g;
const MAX_PASSES = 20; // guards against a token cycle (a file that includes itself)

// LEGACY: resolve the flat-include directory (see CONFIG KNOBS above). The flat
// <<ct:include>> mechanism is retired, so there is no default location: returns
// $JC_INCLUDE_DIR if set, else null.
export function resolveIncludeDir(_repoRoot = REPO_ROOT) {
  if (process.env.JC_INCLUDE_DIR) return resolve(process.env.JC_INCLUDE_DIR);
  return null;
}

// Resolve the ESM library dir used by <<ct:module>> / <<ct:lib>>. Independent of
// the include dir (resolveIncludeDir) on purpose — see header.
export function resolveLibDir(repoRoot = REPO_ROOT) {
  return join(repoRoot, 'src', 'lib');
}

// ---------------------------------------------------------------------------
// ESM inliner (<<ct:module>>). Column-0 line-anchored transform: every real
// import/export statement in the lib starts at column 0; prose/JSDoc mentions do
// not. No comment/string tokenizer on purpose.
// ---------------------------------------------------------------------------
export function createModuleState() {
  return { emitted: new Map(), ids: new Set(), stack: [], chunks: [], boundRoots: new Map(), rootNames: new Map() };
}

function libRel(libDir, abs) {
  return relative(libDir, abs).split(sep).join('/');
}

function checkUnderLib(libDir, abs, what) {
  const rel = relative(libDir, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`ESM inliner: ${what} resolves outside the lib dir (${abs})`);
  }
}

function lineOf(src, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

function makeId(rel, state) {
  const base = '__ct_' + rel.replace(/\.mjs$/, '').replace(/[/.-]/g, '_');
  let id = base;
  for (let n = 2; state.ids.has(id); n++) id = `${base}_${n}`;
  state.ids.add(id);
  return id;
}

// Parse + rewrite one module. Returns { body, imports: [{abs, names}], exports: Map(exportName -> local) }.
export function transformModule(source, absPath, libDir) {
  const rel = libRel(libDir, absPath);
  const src = source.replace(/\r\n/g, '\n');
  const fail = (idx, msg) => { throw new Error(`ESM inliner: ${rel}:${lineOf(src, idx)}: ${msg}`); };
  const imports = [];
  const exportsMap = new Map();
  const addExport = (idx, name, local) => {
    if (exportsMap.has(name)) fail(idx, `duplicate export name '${name}'`);
    exportsMap.set(name, local);
  };
  let out = '';
  let last = 0;
  const stmtRe = /^(import|export)(?![\w$])/gm;
  let m;
  while ((m = stmtRe.exec(src))) {
    const at = m.index;
    const rest = src.slice(at);
    if (m[1] === 'import') {
      const im = /^import\s*\{([^}]*)\}\s*from\s*(['"])([^'"\n]+)\2\s*;?/.exec(rest);
      if (!im) {
        const head = rest.split('\n', 1)[0];
        fail(at, `unsupported import form: ${head}`);
      }
      const spec = im[3];
      if (!(spec.startsWith('./') || spec.startsWith('../'))) fail(at, `unsupported import specifier '${spec}' (only relative ./ or ../ paths)`);
      if (!spec.endsWith('.mjs')) fail(at, `unsupported import specifier '${spec}' (must end in .mjs)`);
      const innerImp = im[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const names = innerImp.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
        const pm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(x);
        if (!pm) fail(at, `unsupported import binding '${x}'`);
        if (pm[1] === 'default') fail(at, "unsupported import of 'default'");
        return { imported: pm[1], local: pm[2] || pm[1] };
      });
      const depAbs = resolve(dirname(absPath), spec);
      checkUnderLib(libDir, depAbs, `import '${spec}' in ${rel}`);
      const idx = imports.push({ abs: depAbs, names }) - 1;
      out += src.slice(last, at) + `\0IMPORT${idx}\0`;
      last = at + im[0].length;
      stmtRe.lastIndex = last;
      continue;
    }
    // export
    let em;
    if ((em = /^export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(rest))) {
      addExport(at, em[1], em[1]);
      out += src.slice(last, at) + rest.slice('export '.length, em[0].length).replace(/^\s+/, '');
      last = at + em[0].length;
    } else if ((em = /^export\s+(const|class)\s+([\w$]+)(\s*,)?/.exec(rest))) {
      if (em[3]) fail(at, 'multiple declarators in one `export const` are not supported');
      addExport(at, em[2], em[2]);
      out += src.slice(last, at) + rest.slice(0, em[0].length).replace(/^export\s+/, '');
      last = at + em[0].length;
    } else if ((em = /^export\s+(let|var)\s/.exec(rest))) {
      fail(at, `mutable export not supported (export ${em[1]})`);
    } else if (/^export\s+default(?![\w$])/.test(rest)) {
      fail(at, 'unsupported construct: export default');
    } else if (/^export\s*\*/.test(rest)) {
      fail(at, 'unsupported construct: export * (re-export)');
    } else if ((em = /^export\s*\{([^}]*)\}(\s*from\b)?\s*;?[ \t]*\n?/.exec(rest))) {
      if (em[2]) fail(at, 'unsupported construct: export { … } from (re-export)');
      // names-only list: comments inside the braces (line or block) are dropped
      const inner = em[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const part of inner.split(',').map((x) => x.trim()).filter(Boolean)) {
        const pm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part);
        if (!pm) fail(at, `unsupported export binding '${part}'`);
        if ((pm[2] || pm[1]) === 'default') fail(at, 'unsupported construct: export { x as default }');
        addExport(at, pm[2] || pm[1], pm[1]);
      }
      out += src.slice(last, at);
      last = at + em[0].length;
    } else {
      fail(at, `unsupported export form: ${rest.split('\n', 1)[0]}`);
    }
    stmtRe.lastIndex = last;
  }
  out += src.slice(last);
  return { body: out, imports, exports: exportsMap };
}

function emitModule(abs, libDir, state, trail) {
  const known = state.emitted.get(abs);
  if (known) return known;
  const rel = libRel(libDir, abs);
  if (state.stack.includes(abs)) {
    const chain = [...state.stack.slice(state.stack.indexOf(abs)), abs].map((p) => libRel(libDir, p)).join(' -> ');
    throw new Error(`ESM inliner: import cycle: ${chain}`);
  }
  if (!abs.endsWith('.mjs')) throw new Error(`ESM inliner: ${rel}: module path must end in .mjs`);
  let source;
  try { source = readFileSync(abs, 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`ESM inliner: module not found: ${rel} (expected at ${abs})${trail ? ` — ${trail}` : ''}`);
    throw err;
  }
  state.stack.push(abs);
  const t = transformModule(source, abs, libDir);
  const depIds = t.imports.map((imp) => emitModule(imp.abs, libDir, state, `imported from ${rel}`));
  state.stack.pop();
  let body = t.body.replace(/\0IMPORT(\d+)\0/g, (_m, i) => {
    const imp = t.imports[+i];
    const list = imp.names.map((n) => (n.imported === n.local ? n.local : `${n.imported}: ${n.local}`)).join(', ');
    return `const { ${list} } = ${depIds[+i].id};`;
  });
  if (!body.endsWith('\n')) body += '\n';
  const id = makeId(rel, state);
  const ret = [...t.exports].map(([name, local]) => (name === local ? name : `${name}: ${local}`)).join(', ');
  state.chunks.push({ abs, exportNames: [...t.exports.keys()] });
  const entry = { id, exportNames: [...t.exports.keys()] };
  state.emitted.set(abs, entry);
  entry.text = `/* ct:module ${rel} */\nconst ${id} = (() => {\n${body}return { ${ret} };\n})();\n`;
  return entry;
}

// Expand one <<ct:module PATH>> root token -> text (new module chunks + root binding).
export function bundleModule(relPath, { libDir = resolveLibDir(), state = createModuleState() } = {}) {
  const abs = resolve(libDir, relPath);
  checkUnderLib(libDir, abs, `<<ct:module ${relPath}>>`);
  if (!abs.endsWith('.mjs')) throw new Error(`ESM inliner: <<ct:module ${relPath}>>: path must end in .mjs`);
  const before = state.chunks.length;
  // emitModule returns the entry; gather text of every newly emitted module in order
  const entry = emitModule(abs, libDir, state, `<<ct:module ${relPath}>>`);
  let text = '';
  for (const c of state.chunks.slice(before)) text += state.emitted.get(c.abs).text;
  if (!state.boundRoots.has(abs)) {
    state.boundRoots.set(abs, relPath);
    for (const n of entry.exportNames) {
      const prev = state.rootNames.get(n);
      if (prev) throw new Error(`ESM inliner: export name '${n}' is bound by both <<ct:module ${prev}>> and <<ct:module ${relPath}>>`);
      state.rootNames.set(n, relPath);
    }
    if (entry.exportNames.length) text += `const { ${entry.exportNames.join(', ')} } = ${entry.id};\n`;
  }
  return text;
}

function readLibVerbatim(relPath, libDir) {
  const abs = resolve(libDir, relPath);
  checkUnderLib(libDir, abs, `<<ct:lib ${relPath}>>`);
  return readFileSync(abs, 'utf8');
}

// Load the project identity from project.json (see CONFIG KNOBS above).
// Returns { name, repo, repoLabel, tagline, _path } or null if none is found.
let _projectCache;
export function loadProject(repoRoot = REPO_ROOT) {
  if (_projectCache !== undefined) return _projectCache;
  const candidates = [
    join(repoRoot, '.claude', 'jason-code', 'project.json'),
    join(repoRoot, 'project.json'),
  ];
  for (const p of candidates) {
    let raw;
    try { raw = readFileSync(p, 'utf8'); } catch { continue; }
    const data = JSON.parse(raw);
    const missing = ['name', 'repo'].filter((k) => !data[k]);
    if (missing.length) {
      console.error(
        `⚠ build-tool: project.json (${p}) is missing required field(s): ` +
        `${missing.join(', ')} — footer/license links will be incomplete.`
      );
    }
    const repo = data.repo || '';
    _projectCache = {
      name: data.name || '',
      repo,
      repoLabel: repo.replace(/^https?:\/\//, ''), // derived, not authored
      tagline: data.tagline || '',
      _path: p,
    };
    return _projectCache;
  }
  _projectCache = null;
  return null;
}

let _warnedNoProject = false;
function applyProjectTokens(html, project) {
  if (!project) {
    PROJECT_TOKEN_RE.lastIndex = 0;
    if (PROJECT_TOKEN_RE.test(html) && !_warnedNoProject) {
      _warnedNoProject = true;
      console.error(
        '⚠ build-tool: no project.json found (searched .claude/jason-code/project.json, ' +
        'project.json) — {{project.*}} tokens left unsubstituted.'
      );
    }
    PROJECT_TOKEN_RE.lastIndex = 0;
    return html;
  }
  return html.replace(PROJECT_TOKEN_RE, (_m, key) => project[key] ?? '');
}

// Assemble a tool's index.html from source/ (pure — returns the string).
// `includeDir`/`project` are injectable for testing; both default to the
// resolved values described in CONFIG KNOBS.
export function buildTool(toolDir, { includeDir = resolveIncludeDir(), project = loadProject(), libDir = resolveLibDir() } = {}) {
  const templatePath = join(toolDir, 'source', 'index.template.html');
  let html = readFileSync(templatePath, 'utf8');

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (!TOKEN_RE.test(html)) break;
    TOKEN_RE.lastIndex = 0;
    html = html.replace(TOKEN_RE, (_m, kind, name) => {
      if (kind === 'include' && !includeDir) {
        throw new Error(`<<ct:include ${name}>> is retired (no include dir). Use <<ct:lib>> / <<ct:module>>, or set $JC_INCLUDE_DIR; in ${templatePath}`);
      }
      const src = kind === 'include'
        ? join(includeDir, name)
        : join(toolDir, 'source', name);
      return readFileSync(src, 'utf8'); // function replacement => `$` in content stays literal
    });
    TOKEN_RE.lastIndex = 0;
  }
  if (TOKEN_RE.test(html)) {
    TOKEN_RE.lastIndex = 0;
    throw new Error(`unresolved <<ct:…>> tokens after ${MAX_PASSES} passes (cycle?) in ${templatePath}`);
  }

  // ESM / lib tokens (additive; the regexes match nothing in a template that
  // does not use them). Expanded after the include/inline fixpoint so tokens
  // carried by inlined files are seen in true document order. Dedup state is
  // per buildTool call (page-wide), never module-level.
  const modState = createModuleState();
  const noTokens = (text, what) => {
    if (text.includes('<<ct:')) throw new Error(`${what} output contains a literal <<ct:…>> token (not re-scanned)`);
    return text;
  };
  html = html.replace(LIB_RE, (_m, p) => noTokens(readLibVerbatim(p, libDir), `<<ct:lib ${p}>>`));
  html = html.replace(MODULE_RE, (_m, p) => noTokens(bundleModule(p, { libDir, state: modState }), `<<ct:module ${p}>>`));

  // Fill project-identity tokens from project.json (after include expansion, so
  // tokens carried by shared includes like footer.html get substituted too).
  html = applyProjectTokens(html, project);

  // "Generated" banner right after the doctype (keeps the doctype first).
  return html.replace('<!doctype html>\n', '<!doctype html>\n' + BANNER);
}

// Write or --check one tool. Returns true on success (built / up-to-date).
export function runBuild(toolDir, { check = false } = {}) {
  const outPath = join(toolDir, 'index.html');
  const label = toolDir.replace(REPO_ROOT + '/', '');
  let built;
  try {
    built = buildTool(toolDir);
  } catch (err) {
    console.error(`✗ ${label}: ${err.message}`);
    return false;
  }
  if (check) {
    let current = '';
    try { current = readFileSync(outPath, 'utf8'); } catch { /* missing => stale */ }
    if (current !== built) {
      console.error(`✗ ${label}: index.html is out of date with source/ — run \`npm run build\` and commit.`);
      return false;
    }
    console.log(`✓ ${label}: up to date`);
    return true;
  }
  writeFileSync(outPath, built);
  console.log(`✓ ${label}: built index.html (${built.length} chars)`);
  return true;
}

// CLI: operate on the current working directory (a tool dir), or --dir=PATH.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const check = process.argv.includes('--check');
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  const toolDir = dirArg ? resolve(dirArg.slice('--dir='.length)) : process.cwd();
  process.exit(runBuild(toolDir, { check }) ? 0 : 1);
}
