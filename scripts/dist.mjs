#!/usr/bin/env node
/*
 * dist.mjs — assemble the deployable `dist/` tree from the already-built tools.
 *
 * This is the COPY step, run after the normal build (which is unchanged). It does
 * not build anything itself — `ct dist` and `npm run dist` run the build first.
 * It copies each tool's single-file deliverable into its own dist subfolder and
 * puts the landing gallery at the dist root:
 *
 *   dist/
 *     index.html              <- src/gallery/index.html, tool links rewritten
 *     preview.png             <- src/gallery/preview.png (gallery og:image)
 *     color-picker/index.html <- src/tools/color-picker/index.html
 *     qr-generator/index.html <- src/tools/qr-generator/index.html
 *     …                       (one subfolder per build-assembled tool)
 *
 * It's generic: tools are discovered by walking `src/tools/` (same rule the build
 * uses — a dir with `source/index.template.html`), so adding a tool needs no edit
 * here. The gallery's built links are `../tools/<tool>/index.html`; in the dist
 * layout the gallery sits a level up from the tools, so those are rewritten to
 * `<tool>/index.html` when the gallery is copied. The source files are never
 * touched — everything is copied, nothing moved.
 *
 * dist/ is cleaned and rewritten on each run, so it always reflects the current
 * build. Dependency-free: Node stdlib only, ES module, Node >= 20.
 */
import { readdirSync, existsSync, rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(REPO_ROOT, 'src', 'tools');
const GALLERY_DIR = join(REPO_ROOT, 'src', 'gallery');
const DIST = join(REPO_ROOT, 'dist');

function fail(msg) {
  console.error(`dist: ${msg}`);
  process.exit(1);
}

// Build-assembled tools: a dir under src/tools/ with source/index.template.html
// (the same opt-in rule build-all.mjs uses). Its built index.html must exist.
function discoverTools() {
  if (!existsSync(TOOLS_DIR)) return [];
  return readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() &&
      existsSync(join(TOOLS_DIR, e.name, 'source', 'index.template.html')))
    .map((e) => e.name)
    .sort();
}

const tools = discoverTools();
if (tools.length === 0) fail('no build-assembled tools found under src/tools/.');

// Fresh dist/ every run.
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// One subfolder per tool, holding just the single-file index.html deliverable.
let copied = 0;
for (const name of tools) {
  const src = join(TOOLS_DIR, name, 'index.html');
  if (!existsSync(src)) fail(`${name} has no built index.html — run the build first (ct build).`);
  const outDir = join(DIST, name);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(src, join(outDir, 'index.html'));
  copied++;
}

// The gallery at the dist root. Its built tool links are ../tools/<tool>/… ; in
// dist/ the gallery sits one level above the tool folders, so drop the ../tools/
// prefix to point at the sibling subfolders.
const gallerySrc = join(GALLERY_DIR, 'index.html');
if (!existsSync(gallerySrc)) fail('no built gallery at src/gallery/index.html — run the build first (ct build).');
const gallery = readFileSync(gallerySrc, 'utf8').replaceAll('../tools/', '');
writeFileSync(join(DIST, 'index.html'), gallery);

// The gallery's og:image, referenced as preview.png beside it.
const galleryPreview = join(GALLERY_DIR, 'preview.png');
if (existsSync(galleryPreview)) copyFileSync(galleryPreview, join(DIST, 'preview.png'));

console.log(`Assembled dist/ — ${copied} tool(s) + the gallery at dist/index.html.`);
