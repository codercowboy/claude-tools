#!/usr/bin/env node
/*
 * Root postinstall / `npm run install:all`.
 *
 * This repo is deliberately NOT an npm workspace: each package under src/tools
 * is standalone and gets its OWN isolated node_modules.
 * That keeps installs from racing and lets tools be tested in parallel.
 *
 * There is NO ledger of packages to maintain — this script DISCOVERS every
 * package.json in the repo (skipping node_modules / .git and the root itself)
 * and runs `npm install` in each. Add a new tool and it's picked up automatically.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const pkgDirs = [];
function walk(dir) {
  if (dir !== repoRoot && existsSync(join(dir, 'package.json'))) pkgDirs.push(dir);
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
pkgDirs.sort();

if (pkgDirs.length === 0) {
  console.log('No sub-package package.json files found under the repo.');
  process.exit(0);
}

let failures = 0;
for (const dir of pkgDirs) {
  const rel = relative(repoRoot, dir);
  console.log(`\n\u{1F4E6} npm install — ${rel}`);
  const res = spawnSync('npm', ['install'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error(`  ✗ ${rel} failed (exit ${res.status})`);
    failures++;
  }
}

console.log(`\n${pkgDirs.length - failures}/${pkgDirs.length} package installs succeeded.`);
process.exit(failures ? 1 : 0);
