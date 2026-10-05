// Guard test: the shipped tool must be HAND-ROLLED — no secure-context-only
// crypto. `crypto.subtle` is undefined over plain LAN HTTP, so relying on it
// would silently break the exact use case this tool exists for (see DESIGN.md
// "Hard requirements" and docs/conventions.md § "No secure-context-only APIs").
// This test fails loudly if anyone "simplifies" a hash into a SubtleCrypto call.
//
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.resolve(__dirname, '../..');

const FILES = [
  'index.html',
  'source/logic.mjs',
  'source/app.mjs',
];

// Strip comments so the guard fires on real CODE only — DESIGN/rationale prose
// deliberately mentions "crypto.subtle" to explain why it is NOT used, and that
// must not trip the test. Removes /* */ block comments, // line comments, and
// <!-- --> HTML comments. (Good enough for a guard; these files have no comment
// markers hidden inside string literals.)
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

// Matches crypto.subtle, window.crypto.subtle, self.crypto.subtle, subtle.digest, etc.
const SUBTLE_RE = /\bcrypto\s*\.\s*subtle\b|\bsubtle\s*\.\s*(digest|sign|verify|importKey|deriveBits|deriveKey)\b/;
const RANDOMUUID_RE = /\bcrypto\s*\.\s*randomUUID\b/;

for (const rel of FILES) {
  test(`${rel}: contains no crypto.subtle usage (must stay hand-rolled)`, () => {
    const src = stripComments(readFileSync(path.join(TOOL_DIR, rel), 'utf8'));
    assert.equal(SUBTLE_RE.test(src), false, `${rel} references crypto.subtle in code`);
  });

  test(`${rel}: contains no secure-context-only crypto.randomUUID`, () => {
    const src = stripComments(readFileSync(path.join(TOOL_DIR, rel), 'utf8'));
    assert.equal(RANDOMUUID_RE.test(src), false, `${rel} references crypto.randomUUID in code`);
  });
}
