#!/usr/bin/env node
/*
 * `npm run test:all` — run every tool's e2e suite (each package.json that has a
 * `test:e2e` script), sequentially. Auto-discovers packages (no ledger); skips
 * node_modules / .git and the root. Requires deps installed
 * (`npm run install:all`) and Playwright browsers (`npx playwright install chromium`).
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
    walk(join(dir, e.name));
  }
}
walk(repoRoot);
dirs.sort();

if (dirs.length === 0) {
  console.log('No packages with a "test:e2e" script found.');
  process.exit(0);
}

let failures = 0;
const failed = [];
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

console.log(`\n${dirs.length - failures}/${dirs.length} suites passed.`);
if (failed.length) console.log(`Failed: ${failed.join(', ')}`);
process.exit(failures ? 1 : 0);
