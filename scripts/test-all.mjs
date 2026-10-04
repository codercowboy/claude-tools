#!/usr/bin/env node
/*
 * `npm run test:all` — run the test suite(s).
 *
 * With no arguments: the repo-wide run — the src/lib unit tests, then every
 * tool's Playwright e2e suite (each src/tools/* dir that has a
 * tests/playwright.config.mjs), sequentially.
 *
 * With one or more tool-name arguments (`test-all.mjs color-picker`): just that
 * tool's own two layers — its node --test unit tests under tests/unit/, then its
 * Playwright e2e suite. This is what `ct test <tool>` forwards to and restores
 * the old per-tool `npm test`.
 *
 * Dependencies live once at the repo root now (no per-tool package.json): a plain
 * `npm install` at the root installs Playwright and the e2e helper libs, and
 * every tool's tests/playwright.config.mjs resolves `@playwright/test` from the
 * root node_modules. Playwright browsers still need `npx playwright install chromium`.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS_DIR = join(REPO_ROOT, 'src', 'tools');
const isWin = process.platform === 'win32';

// Discover every tool with a Playwright e2e config. A tool opts into the e2e
// layer purely by having tests/playwright.config.mjs — no package.json, no
// ledger. Add a tool with that file and it's picked up automatically.
function discoverE2eTools() {
  const dirs = [];
  if (!existsSync(TOOLS_DIR)) return dirs;
  for (const name of readdirSync(TOOLS_DIR, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const dir = join(TOOLS_DIR, name.name);
    if (existsSync(join(dir, 'tests', 'playwright.config.mjs'))) dirs.push(dir);
  }
  return dirs.sort();
}

// Run one tool's Playwright e2e suite from the repo root. Playwright resolves its
// own binary + @playwright/test from the root node_modules; the config resolves
// its relative imports (the shared base) against its own location.
function runE2e(toolDir) {
  const config = relative(REPO_ROOT, join(toolDir, 'tests', 'playwright.config.mjs'));
  return spawnSync('npx', ['playwright', 'test', `--config=${config}`], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: isWin,
  });
}

// Gate: rebuild one tool in --check mode so a committed index.html that drifted
// from its source/ fails the run before any test executes (this is what the old
// per-tool `pretest` hook did, now that tools carry no package.json).
function buildCheck(name) {
  return spawnSync(process.execPath,
    [join(REPO_ROOT, 'scripts', 'build-all.mjs'), '--check', name],
    { cwd: REPO_ROOT, stdio: 'inherit' });
}

// Run one tool's node --test unit layer (tests/unit/*.test.mjs). Zero-dep, so it
// runs straight from the root with no install.
function runUnit(toolDir) {
  const unitDir = join(toolDir, 'tests', 'unit');
  if (!existsSync(unitDir)) return { status: 0, skipped: true };
  return spawnSync(process.execPath, ['--test', relative(REPO_ROOT, unitDir) + '/'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let failures = 0;
const failed = [];

if (requested.length === 0) {
  // Repo-wide run: lib unit tests + every tool's e2e.
  console.log('\n=== src/lib unit tests — node --test src/lib/tests/ ===');
  const lib = spawnSync(process.execPath, ['--test', 'src/lib/tests/'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (lib.status !== 0) { failures++; failed.push('src/lib unit tests'); }

  const tools = discoverE2eTools();
  if (tools.length === 0) {
    console.log('No tools with a tests/playwright.config.mjs found.');
    process.exit(failures ? 1 : 0);
  }
  for (const dir of tools) {
    const rel = relative(REPO_ROOT, dir);
    const name = rel.split('/').pop();
    console.log(`\n=== ${rel} — build --check + playwright e2e ===`);
    if (buildCheck(name).status !== 0) { failures++; failed.push(`${rel} (stale build)`); continue; }
    if (runE2e(dir).status !== 0) { failures++; failed.push(rel); }
  }

  const total = tools.length + 1; // e2e suites + the lib unit-test step
  console.log(`\n${total - failures}/${total} suites passed.`);
  if (failed.length) console.log(`Failed: ${failed.join(', ')}`);
  process.exit(failures ? 1 : 0);
}

// Named run: each requested tool's own unit + e2e layers.
for (const name of requested) {
  const dir = join(TOOLS_DIR, name);
  if (!existsSync(join(dir, 'tests', 'playwright.config.mjs'))) {
    console.error(`No tool "${name}" with a tests/playwright.config.mjs under src/tools/.`);
    failures++; failed.push(name);
    continue;
  }
  console.log(`\n=== ${name} — build --check ===`);
  if (buildCheck(name).status !== 0) { failures++; failed.push(`${name} (stale build)`); continue; }

  console.log(`\n=== ${name} — node --test unit ===`);
  const unit = runUnit(dir);
  if (unit.skipped) console.log('(no tests/unit/ — skipping unit layer)');
  else if (unit.status !== 0) { failures++; failed.push(`${name} (unit)`); }

  console.log(`\n=== ${name} — playwright e2e ===`);
  if (runE2e(dir).status !== 0) { failures++; failed.push(`${name} (e2e)`); }
}

if (failed.length) console.log(`\nFailed: ${failed.join(', ')}`);
else console.log(`\nAll requested suites passed.`);
process.exit(failures ? 1 : 0);
