#!/usr/bin/env node
/*
 * build-all.mjs — build (or --check) every build-assembled tool in the repo,
 * or just the one(s) named on the command line.
 *
 * Discovers each dir under src/tools/* that has opted in (it has
 * `source/index.template.html`) and runs the shared builder on it.
 * Tools not yet build-assembled (no source/) are simply skipped.
 *
 * Scan roots are configurable via $JC_BUILD_ROOTS (comma/colon-separated,
 * default `src/tools`). The landing gallery (src/gallery) is built as its own
 * section.
 *
 * Optional positional tool-name filter(s): `build-all.mjs color-picker` builds
 * only that tool; `build-all.mjs gallery` builds only the gallery. With none,
 * everything is built. This is what `ct build <tool>` and
 * `npm run build -- <tool>` forward to.
 *
 * Root package.json wires:
 *   npm run build         # assemble every tool's index.html
 *   npm run build:check   # exit 1 if any committed index.html is out of date
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './build-tool.mjs';

// Default to THIS engine's own repo; a consuming project targets its own tools
// via $JC_REPO_ROOT (see build-tool.mjs). runBuild reads the same env, so the two
// stay consistent without threading params.
const REPO_ROOT = process.env.JC_REPO_ROOT
  ? resolve(process.env.JC_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = (process.env.JC_BUILD_ROOTS || 'src/tools')
  .split(/[,:]/).map((s) => s.trim()).filter(Boolean);
// The landing gallery is its own buildable section (src/gallery/source -> src/gallery/index.html).
const GALLERY = 'src/gallery';
const check = process.argv.includes('--check');
// Bare (non-flag) args are tool-name filters; none => build everything.
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('-')));
const wantAll = only.size === 0;

const toolDirs = [];
// The gallery section itself (named 'gallery' for the filter).
const galleryDir = join(REPO_ROOT, GALLERY);
if ((wantAll || only.has('gallery')) &&
    existsSync(join(galleryDir, 'source', 'index.template.html'))) {
  toolDirs.push(galleryDir);
}
// Each build-assembled tool under src/tools/*.
for (const rel of ROOTS) {
  const base = join(REPO_ROOT, rel);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const dir = join(base, name);
    if ((wantAll || only.has(name)) &&
        statSync(dir).isDirectory() &&
        existsSync(join(dir, 'source', 'index.template.html'))) {
      toolDirs.push(dir);
    }
  }
}

// A named filter that matched nothing is a typo, not a no-op — fail loudly.
if (!wantAll) {
  const matched = new Set(toolDirs.map((d) => basename(d)));
  const missing = [...only].filter((n) => !matched.has(n));
  if (missing.length) {
    console.error(`No build-assembled tool matched: ${missing.join(', ')}`);
    console.error('(a tool is build-assembled only once it has source/index.template.html)');
    process.exit(1);
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
