// Shared test-only helpers for tests/unit/*.test.mjs. Dev/test-only — never
// referenced by index.html.
//
// This tool is build-assembled (docs/conventions.md § "Build-assembled
// tools"), so its pure engine lives in a real module — `source/logic.mjs` —
// that the shipped `index.html` inlines. The unit tests import that source
// module directly: no browser, no DOM, no extraction hack. (`npm test` runs
// `build --check` first via pretest, so the source can't drift from the
// shipped file.)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Re-export the whole engine so each test file can pull what it needs.
export * from '../../source/logic.mjs';

import {
  tokenizeJS as _tokenizeJS,
  tokenizeSQL as _tokenizeSQL,
} from '../../source/logic.mjs';

// ---------------------------------------------------------------------------
// JS token helpers
// ---------------------------------------------------------------------------

// The ordered stream of *significant* JS tokens (comments + whitespace
// dropped) as {type, value}. This is the "meaning" of the program at the
// token level: format/minify must never change it.
export function jsSignificant(src) {
  return _tokenizeJS(src)
    .filter((t) => t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment')
    .map((t) => ({ type: t.type, value: t.value }));
}

// Just the values, for compact deep-equal comparisons and messages.
export function jsSignificantValues(src) {
  return jsSignificant(src).map((t) => t.value);
}

// ---------------------------------------------------------------------------
// SQL token helpers
// ---------------------------------------------------------------------------

// The ordered non-whitespace SQL token stream. When dropComments is true,
// comments are removed too (that is exactly what minify is allowed to do).
// Word tokens (keywords AND identifiers) are compared case-insensitively so a
// keyword-casing change is treated as equivalent; every other token
// (string/quotedId/number/punct) is compared byte-for-byte, so any change to
// a string or quoted identifier is caught.
export function sqlStream(src, { dropComments = false } = {}) {
  return _tokenizeSQL(src)
    .filter((t) => t.type !== 'ws' && !(dropComments && (t.type === 'lineComment' || t.type === 'blockComment')))
    .map((t) => ({ type: t.type, value: t.type === 'word' ? t.value.toUpperCase() : t.value }));
}

// ---------------------------------------------------------------------------
// Parse validators — a formatter/minifier that emits code which no longer
// parses is a hard failure.
// ---------------------------------------------------------------------------

// Parse a *script* / statement-list snippet. Uses vm.Script, which compiles
// top-level code exactly like a normal <script> (so `let`, classes, template
// literals, regex, etc. all validate; `import`/`export`/top-level `return`
// do not — use jsParsesAsModule for those).
export function jsParsesAsScript(code) {
  try { new vm.Script(code); return true; }
  catch { return false; }
}

// Parse a snippet as the *body of a function* (so a bare `return` is legal).
export function jsParsesAsFunctionBody(code) {
  try { new Function(code); return true; }
  catch { return false; }
}

// Parse a *module* snippet (import/export allowed) via `node --check` on a
// temp .mjs file — the most faithful check available without extra flags.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function jsParsesAsModule(code) {
  const file = path.join(os.tmpdir(), `pp-jsparse-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  try {
    fs.writeFileSync(file, code, 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}
