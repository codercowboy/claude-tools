#!/usr/bin/env node
/*
 * build-all.mjs — build (or --check) every build-assembled tool in the repo.
 *
 * Discovers each dir under src/tools/* that has opted in (it has
 * `source/index.template.html`) and runs the shared builder on it.
 * Tools not yet build-assembled (no source/) are simply skipped.
 *
 * Scan roots are configurable via $JC_BUILD_ROOTS (comma/colon-separated,
 * default `src/tools`). The landing gallery (src/gallery) is built as its own
 * section.
 *
 * Root package.json wires:
 *   npm run build         # assemble every tool's index.html
 *   npm run build:check   # exit 1 if any committed index.html is out of date
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './build-tool.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = (process.env.JC_BUILD_ROOTS || 'src/tools')
  .split(/[,:]/).map((s) => s.trim()).filter(Boolean);
// The landing gallery is its own buildable section (src/gallery/source -> src/gallery/index.html).
const GALLERY = 'src/gallery';
const check = process.argv.includes('--check');

const toolDirs = [];
// The gallery section itself.
const galleryDir = join(REPO_ROOT, GALLERY);
if (existsSync(join(galleryDir, 'source', 'index.template.html'))) toolDirs.push(galleryDir);
// Each build-assembled tool under src/tools/*.
for (const rel of ROOTS) {
  const base = join(REPO_ROOT, rel);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const dir = join(base, name);
    if (statSync(dir).isDirectory() && existsSync(join(dir, 'source', 'index.template.html'))) {
      toolDirs.push(dir);
    }
  }
}

if (toolDirs.length === 0) {
  console.log('No build-assembled tools found (none have source/index.template.html).');
  process.exit(0);
}

let failed = 0;
for (const dir of toolDirs.sort()) {
  if (!runBuild(dir, { check })) failed++;
}

console.log(`${check ? 'Checked' : 'Built'} ${toolDirs.length} tool(s); ${failed} failed.`);
process.exit(failed ? 1 : 0);
