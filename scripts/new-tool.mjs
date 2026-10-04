#!/usr/bin/env node
/*
 * new-tool.mjs — scaffold a new single-file tool from new-tool-template/.
 *
 * Copies the canonical template directory (the four-file source/ set, both test
 * layers, and the README/DESIGN/PLAN stubs) into a new tool directory,
 * substituting the __PLACEHOLDER__ tokens (see new-tool-template/TEMPLATE.md for
 * the token table). Dependency-free: Node stdlib only, ES module, Node >= 20.
 *
 * There is no per-tool package.json: the dev/test dependencies (Playwright and
 * the e2e helpers) live once at the repo root, so a scaffolded tool needs no
 * install of its own.
 *
 * Usage:
 *   node new-tool.mjs --name=color-picker [options]
 *
 * Options:
 *   --name=<kebab>     REQUIRED. Unscoped package/folder name, kebab-case.
 *   --title=<str>      Display title.        (default: Title Case of --name)
 *   --desc=<str>       One-line description. (default: "<title> — a small tool.")
 *   --hook=<ident>     window.__<hook> test-hook name.
 *                                            (default: camelCase of --name)
 *   --scope=<@scope>   npm scope.            (default: @codercowboy)
 *   --group=<id>       reverse-DNS groupId.  (default: com.codercowboy)
 *   --dest=<path>      Destination tool dir. (default: ./<name>)
 *   --force            Allow writing into an existing (empty) --dest.
 *   -h, --help         Show this help.
 *
 * Exit codes: 0 ok · 1 bad usage · 2 template missing · 3 dest exists/not-empty
 *             · 4 I/O error.
 */
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(SCRIPT_DIR, 'new-tool-template');

// Files/dirs never copied into a scaffolded tool.
const SKIP_NAMES = new Set(['TEMPLATE.md', 'node_modules', 'index.html', 'test-results', '.DS_Store']);

const HELP = `new-tool.mjs — scaffold a new single-file tool from new-tool-template/

Usage:
  node new-tool.mjs --name=color-picker [--title=..] [--desc=..] [--hook=..]
                    [--scope=@codercowboy] [--group=com.codercowboy]
                    [--dest=PATH] [--force]

  --name    REQUIRED, kebab-case folder/package name.
  --title   display title      (default: Title Case of --name)
  --desc    one-line summary    (default: "<title> — a small tool.")
  --hook    window.__<hook> name (default: camelCase of --name)
  --scope   npm scope           (default: @codercowboy)
  --group   reverse-DNS groupId (default: com.codercowboy)
  --dest    destination dir      (default: ./<name>)
  --force   allow an existing but empty --dest
  -h, --help
`;

function fail(code, msg) {
  process.stderr.write(`new-tool: ${msg}\n`);
  process.exit(code);
}

function titleCase(kebab) {
  return kebab.split('-').filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function camelCase(kebab) {
  const parts = kebab.split('-').filter(Boolean);
  return parts.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      name: { type: 'string' },
      title: { type: 'string' },
      desc: { type: 'string' },
      hook: { type: 'string' },
      scope: { type: 'string', default: '@codercowboy' },
      group: { type: 'string', default: 'com.codercowboy' },
      dest: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  fail(1, err.message);
}

const { values } = parsed;
if (values.help) { process.stdout.write(HELP); process.exit(0); }

const name = values.name;
if (!name) fail(1, 'missing required --name (kebab-case). Try --help.');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
  fail(1, `--name "${name}" must be kebab-case (lowercase letters, digits, single hyphens).`);
}

const title = values.title || titleCase(name);
const desc = values.desc || `${title} — a small tool.`;
const hook = values.hook || camelCase(name);
const scope = values.scope.startsWith('@') ? values.scope : `@${values.scope}`;

const subs = {
  __TOOL_NAME__: name,
  __TOOL_TITLE__: title,
  __TOOL_DESC__: desc,
  // The full window test-hook property name. The convention is `window.__<tool>`,
  // so the token expands to the dunder-prefixed identifier (e.g. `__colorPicker`)
  // and the template writes `window.__TOOL_HOOK__` cleanly.
  __TOOL_HOOK__: `__${hook}`,
  __TOOL_SCOPE__: scope,
  __GROUP_ID__: values.group,
};

function substitute(text) {
  return text.replace(/__(?:TOOL_NAME|TOOL_TITLE|TOOL_DESC|TOOL_HOOK|TOOL_SCOPE|GROUP_ID)__/g,
    (m) => subs[m]);
}

if (!existsSync(TEMPLATE_DIR)) {
  fail(2, `template dir not found at ${TEMPLATE_DIR}.`);
}

const dest = resolve(values.dest || join(process.cwd(), name));
if (existsSync(dest)) {
  if (!statSync(dest).isDirectory()) fail(3, `--dest ${dest} exists and is not a directory.`);
  if (readdirSync(dest).length > 0 && !values.force) {
    fail(3, `--dest ${dest} is not empty (use --force to write into it).`);
  }
}

let fileCount = 0;
function copyDir(srcDir, outDir, isRoot) {
  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (SKIP_NAMES.has(entry)) continue;
    const srcPath = join(srcDir, entry);
    const outPath = join(outDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, outPath, false);
    } else {
      const content = substitute(readFileSync(srcPath, 'utf8'));
      writeFileSync(outPath, content);
      fileCount++;
    }
  }
}

try {
  copyDir(TEMPLATE_DIR, dest, true);
} catch (err) {
  fail(4, `failed writing ${basename(dest)}: ${err.message}`);
}

process.stdout.write(
  `✓ scaffolded ${scope}/${name} → ${dest} (${fileCount} files)\n` +
  `  next: build + test from the repo root —\n` +
  `        npx ct build ${name} && npx ct test ${name}\n` +
  `        (first time only: npm install && npx playwright install chromium)\n`
);
process.exit(0);
