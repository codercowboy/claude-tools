#!/usr/bin/env node
/*
 * ct — the claude-tools front door.
 *
 * A tiny, dependency-free dispatcher that forwards a verb to the right repo
 * script (modeled on the same "dumb top dispatcher" idea as claude-tpm's `tpm`).
 * It self-locates its sibling scripts, so it runs from any working directory.
 *
 *   ct build [--check] [tool]   assemble every tool's index.html, or just <tool>  (scripts/build-all.mjs)
 *   ct dist                     build, then copy the deliverables into dist/      (scripts/dist.mjs)
 *   ct test [tool...]           run the whole suite, or just <tool>'s unit + e2e  (scripts/test-all.mjs)
 *   ct serve [tool|dir]         serve a tool (or dir) over http://                (scripts/serve.mjs)
 *   ct run                      open the built gallery in your default browser
 *
 * Dev/test deps live once at the repo root — a plain `npm install` installs them,
 * so there is no per-tool install step anymore.
 *
 * Invocation: `ct <verb>` once the package is installed or linked (`npm link`),
 * or `node scripts/ct.mjs <verb>` straight from a clone. Unknown verb or --help
 * prints this menu (exit 2 on an unknown verb).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// SCRIPTS = where the engine lives (always on-disk next to this file). REPO = the
// project being operated on: this engine's own repo by default, or a consuming
// project via $JC_REPO_ROOT (serve/run target it; build/test forward the env to
// the child scripts, which resolve it themselves).
const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.JC_REPO_ROOT ? resolve(process.env.JC_REPO_ROOT) : dirname(SCRIPTS);
const GALLERY = join(REPO, 'src', 'gallery', 'index.html');

const [verb, ...rest] = process.argv.slice(2);

// Forward to a sibling repo script as `node <script> <args...>`, inheriting
// stdio and propagating its exit code.
function runScript(name, args = []) {
  const child = spawn(process.execPath, [join(SCRIPTS, name), ...args], { stdio: 'inherit' });
  child.on('error', (err) => { console.error(`ct ${verb}: ${err.message}`); process.exit(1); });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
}

// Run a sequence of sibling scripts, stopping at the first non-zero exit.
function runChain(steps, i = 0) {
  if (i >= steps.length) return process.exit(0);
  const [name, args] = steps[i];
  const child = spawn(process.execPath, [join(SCRIPTS, name), ...args], { stdio: 'inherit' });
  child.on('error', (err) => { console.error(`ct ${verb}: ${err.message}`); process.exit(1); });
  child.on('exit', (code, signal) => { if (signal || code) return process.exit(signal ? 1 : code); runChain(steps, i + 1); });
}

// Open the built gallery index.html in the OS default browser.
function openGallery() {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [GALLERY]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', GALLERY]] :
    ['xdg-open', [GALLERY]];
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('error', () => {
    console.error(`ct run: couldn't launch a browser. Open this file yourself:\n  ${GALLERY}`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// `ct serve <arg>`: a bare tool name serves src/tools/<name>; anything else is
// passed through to serve.mjs as a directory. No arg serves the whole src/ site.
function serveArgs(args) {
  if (args.length === 0) return [join(REPO, 'src')];
  const [first, ...more] = args;
  const toolDir = join(REPO, 'src', 'tools', first);
  if (!first.startsWith('-') && existsSync(toolDir)) return [toolDir, ...more];
  return args;
}

const MENU = `ct — claude-tools front door

Usage: ct <verb>            (or from a clone: node scripts/ct.mjs <verb>)

  build [--check] [tool]  assemble every tool's index.html (then the preview gif),
                          or just <tool>  (build-all.mjs; --check skips the gif)
  dist                    build, then copy the deliverables into dist/ (dist.mjs):
                          dist/index.html is the gallery, dist/<tool>/index.html each tool
  test [tool...]          run the whole suite, or just <tool>'s unit + e2e  (test-all.mjs)
  serve [tool|dir]        serve a tool (or dir) over http:// (default src → /gallery/, $PORT or 8080)
  run                     open the built gallery in your browser

Dev/test deps install once at the repo root: \`npm install\` (+ \`npx playwright install chromium\`).
`;

// A build is "full" (and gets the preview gif) only when it builds everything:
// no --check and no named tool.
const named = rest.some((a) => !a.startsWith('-'));
const fullBuild = !rest.includes('--check') && !named;

switch (verb) {
  case 'build':   runChain(fullBuild
                    ? [['build-all.mjs', rest], ['build-preview-gif.mjs', []]]
                    : [['build-all.mjs', rest]]); break;
  case 'dist':    runChain([['build-all.mjs', []], ['dist.mjs', []]]); break;
  case 'test':    runScript('test-all.mjs', rest); break;
  case 'serve':   runScript('serve.mjs', serveArgs(rest)); break;
  case 'run':     openGallery(); break;
  case undefined:
  case 'help':
  case '-h':
  case '--help':  process.stdout.write(MENU); process.exit(0);
  default:        process.stderr.write(`ct: unknown verb "${verb}"\n\n${MENU}`); process.exit(2);
}
