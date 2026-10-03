#!/usr/bin/env node
/*
 * ct — the claude-tools front door.
 *
 * A tiny, dependency-free dispatcher that forwards a verb to the right repo
 * script (modeled on the same "dumb top dispatcher" idea as claude-tpm's `tpm`).
 * It self-locates its sibling scripts, so it runs from any working directory.
 *
 *   ct build [--check]   assemble every tool's index.html   (scripts/build-all.mjs)
 *   ct test              run the whole test suite            (scripts/test-all.mjs)
 *   ct serve [dir]       serve the gallery over http://      (scripts/serve.mjs; default src, $PORT or 8080)
 *   ct run               open the built gallery in your default browser
 *   ct install           install every tool's dependencies  (scripts/install-all.mjs)
 *
 * Invocation: `ct <verb>` once the package is installed or linked (`npm link`),
 * or `node scripts/ct.mjs <verb>` straight from a clone. Unknown verb or --help
 * prints this menu (exit 2 on an unknown verb).
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(SCRIPTS);
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

const MENU = `ct — claude-tools front door

Usage: ct <verb>            (or from a clone: node scripts/ct.mjs <verb>)

  build [--check]   assemble every tool's index.html, then the preview gif
                    (build-all.mjs + build-preview-gif.mjs; --check skips the gif)
  test              run the whole test suite              (test-all.mjs)
  serve [dir]       serve the gallery over http://         (default src → /gallery/, $PORT or 8080)
  run               open the built gallery in your browser
  install           install every tool's dependencies     (install-all.mjs)
`;

switch (verb) {
  case 'build':   runChain(rest.includes('--check')
                    ? [['build-all.mjs', rest]]
                    : [['build-all.mjs', rest], ['build-preview-gif.mjs', []]]); break;
  case 'test':    runScript('test-all.mjs', rest); break;
  case 'serve':   runScript('serve.mjs', rest.length ? rest : [join(REPO, 'src')]); break;
  case 'run':     openGallery(); break;
  case 'install': runScript('install-all.mjs', rest); break;
  case undefined:
  case 'help':
  case '-h':
  case '--help':  process.stdout.write(MENU); process.exit(0);
  default:        process.stderr.write(`ct: unknown verb "${verb}"\n\n${MENU}`); process.exit(2);
}
