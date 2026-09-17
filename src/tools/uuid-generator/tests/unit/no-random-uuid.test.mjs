// Guard test (source-level regression): the shipped tool must NEVER call
// crypto.randomUUID() — it is secure-context-only and throws over plain LAN
// HTTP (documented repo bug class; see docs/conventions.md § "Single-file HTML
// tools" and DESIGN.md § "CRITICAL — randomness source"). Randomness comes from
// crypto.getRandomValues only.
//
// The tool's *comments* legitimately mention crypto.randomUUID() in prose to
// explain WHY it's banned, so this test strips comments before scanning — it
// asserts there is no actual INVOCATION in executable code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.resolve(__dirname, '../..');

// Strip // line-comments and /* */ block-comments so only executable code
// remains. Good enough for JS/HTML-embedded JS scanning (no need to honor
// string literals — none of our files put "//" inside a meaningful string).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep http:// etc.)
}

const FILES = [
  'index.html',
  'source/logic.mjs',
  'source/app.mjs',
  'source/index.template.html',
];

for (const rel of FILES) {
  test(`${rel}: no crypto.randomUUID() invocation in executable code`, () => {
    const raw = readFileSync(path.join(TOOL_DIR, rel), 'utf8');
    // Sanity: prose mentions are allowed and expected (documents the ban).
    const code = stripComments(raw);
    assert.ok(
      !/crypto\.randomUUID\s*\(/.test(code),
      `Found a crypto.randomUUID( call in executable code of ${rel} — use crypto.getRandomValues instead.`
    );
    // Also forbid a bare reference (e.g. `const f = crypto.randomUUID;`).
    assert.ok(
      !/crypto\.randomUUID\b/.test(code),
      `Found a crypto.randomUUID reference in executable code of ${rel}.`
    );
  });
}

test('index.html DOES use crypto.getRandomValues (the sanctioned source)', () => {
  const raw = readFileSync(path.join(TOOL_DIR, 'index.html'), 'utf8');
  assert.match(raw, /crypto[\s\S]{0,40}getRandomValues|getRandomValues/);
});
