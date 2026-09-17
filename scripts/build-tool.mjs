#!/usr/bin/env node
/*
 * build-tool.mjs — shared, dependency-free builder for a single tool.
 *
 * The SHIPPED artifact for a web tool is always one self-contained `index.html`
 * (opens from file://, no runtime deps, no CDN). A tool that has outgrown
 * comfortable hand-authoring is authored under `source/` instead and assembled
 * back into that one file here. See docs/conventions.md § "Build-assembled tools".
 *
 * A tool opts in by having `source/index.template.html`. The template (and any
 * source file it pulls in) may contain these tokens:
 *
 *   <<ct:include NAME>>   inline a shared include from src/tools/include/NAME
 *                         (footer.html, base.css, gallery.css, confirm.js,
 *                         copy.js) — the manual "paste + md5 hash" chore is gone;
 *                         the build always pulls the current canonical file.
 *   <<ct:inline NAME>>    inline the tool's own source file source/NAME
 *                         (styles.css, logic.mjs, app.mjs, …).
 *
 * Tokens are expanded repeatedly, so an inlined file may itself contain tokens
 * (e.g. app.mjs holds `<<ct:inline logic.mjs>>` where the pure engine slots in).
 *
 * Usage (per-tool package.json wires these):
 *   node ../../../scripts/build-tool.mjs           # cwd tool -> index.html
 *   node ../../../scripts/build-tool.mjs --check   # exit 1 if index.html is stale
 * Also importable: buildTool(dir) -> string, runBuild(dir, {check}) -> boolean.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DIR = join(REPO_ROOT, 'src', 'tools', 'jbc-include');

const BANNER =
  '<!-- GENERATED FILE — do not edit directly. Author in source/, then run: ' +
  'npm run build (see docs/conventions.md § Build-assembled tools) -->\n';

const TOKEN_RE = /<<ct:(include|inline) ([\w.-]+)>>/g;
const MAX_PASSES = 20; // guards against a token cycle (a file that includes itself)

// Assemble a tool's index.html from source/ (pure — returns the string).
export function buildTool(toolDir) {
  const templatePath = join(toolDir, 'source', 'index.template.html');
  let html = readFileSync(templatePath, 'utf8');

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (!TOKEN_RE.test(html)) break;
    TOKEN_RE.lastIndex = 0;
    html = html.replace(TOKEN_RE, (_m, kind, name) => {
      const src = kind === 'include'
        ? join(INCLUDE_DIR, name)
        : join(toolDir, 'source', name);
      return readFileSync(src, 'utf8'); // function replacement => `$` in content stays literal
    });
    TOKEN_RE.lastIndex = 0;
  }
  if (TOKEN_RE.test(html)) {
    TOKEN_RE.lastIndex = 0;
    throw new Error(`unresolved <<ct:…>> tokens after ${MAX_PASSES} passes (cycle?) in ${templatePath}`);
  }

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
