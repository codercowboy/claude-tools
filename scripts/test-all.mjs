#!/usr/bin/env node
/*
 * `npm run test:all` — run every tool's e2e suite (each package.json that has a
 * `test:e2e` script), sequentially. Auto-discovers packages (no ledger); skips
 * node_modules / .git and the root. Requires deps installed
 * (`npm run install:all`) and Playwright browsers (`npx playwright install chromium`).
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Subtrees that are never e2e targets even though they may contain a package.json
// with a `test:e2e` script. src/lib holds shared support + the new-tool TEMPLATE
// (whose index.html is intentionally full of {{project.*}}/__TOOL_NAME__
// placeholders, so its build:check can never pass in place). Scoped by relative
// path (not bare dir name) so a tool literally named `lib` wouldn't be skipped.
const SKIP_RELDIRS = new Set(['src' + sep + 'lib']);

const dirs = [];
function walk(dir) {
  const pkg = join(dir, 'package.json');
  if (dir !== repoRoot && existsSync(pkg)) {
    try {
      const j = JSON.parse(readFileSync(pkg, 'utf8'));
      if (j.scripts && j.scripts['test:e2e']) dirs.push(dir);
    } catch {
      /* ignore unparseable package.json */
    }
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const child = join(dir, e.name);
    if (SKIP_RELDIRS.has(relative(repoRoot, child))) continue;
    walk(child);
  }
}
walk(repoRoot);
dirs.sort();

// Explicit lib-unit-test step. src/lib is skipped by tool discovery above (template
// guard), so the zero-dep node:test suite in src/lib/tests/ is run as its own named step.
let failures = 0;
const failed = [];
{
  console.log('\n=== src/lib unit tests — node --test src/lib/tests/ ===');
  const res = spawnSync(process.execPath, ['--test', 'src/lib/tests/'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    failures++;
    failed.push('src/lib unit tests');
  }
}

if (dirs.length === 0) {
  console.log('No packages with a "test:e2e" script found.');
  process.exit(failures ? 1 : 0);
}
for (const dir of dirs) {
  const rel = relative(repoRoot, dir);
  console.log(`\n=== ${rel} — npm run test:e2e ===`);
  const res = spawnSync('npm', ['run', 'test:e2e'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    failures++;
    failed.push(rel);
  }
}

const total = dirs.length + 1; // e2e packages + the lib unit-test step
console.log(`\n${total - failures}/${total} suites passed.`);
if (failed.length) console.log(`Failed: ${failed.join(', ')}`);
process.exit(failures ? 1 : 0);
