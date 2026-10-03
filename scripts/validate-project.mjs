#!/usr/bin/env node
/*
 * validate-project.mjs — validate a project.json against the identity contract.
 *
 * Hardens the {{project.*}} identity contract (see ../README.md) that
 * build-tool.mjs consumes — WITHOUT modifying the builder. Checks:
 *   - `name`     required, non-empty string.
 *   - `repo`     required, non-empty string that looks like an http(s) URL.
 *   - `tagline`  optional; if present, must be a string.
 * Unknown extra keys are allowed (reported as a note, not a failure).
 *
 * Dependency-free: Node stdlib only, ES module, Node >= 20.
 *
 * Usage:
 *   node validate-project.mjs [path/to/project.json]
 *   node validate-project.mjs --file=path/to/project.json
 *
 * With no path, searches (first that exists):
 *   ./.claude/jason-code/project.json  →  ./project.json
 * (mirrors build-tool.mjs's own search order).
 *
 * Options:
 *   --file=<path>   explicit project.json path.
 *   -h, --help      show this help.
 *
 * Exit codes: 0 valid · 1 bad usage · 2 not found · 3 invalid JSON
 *             · 4 failed validation.
 */
import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const HELP = `validate-project.mjs — validate a project.json against the identity contract

Usage:
  node validate-project.mjs [PATH]
  node validate-project.mjs --file=PATH

Checks: name (required, non-empty), repo (required, http(s) URL),
        tagline (optional string). See ../README.md for the contract.

Options:
  --file=<path>   explicit project.json path
  -h, --help

Exit codes: 0 valid · 1 bad usage · 2 not found · 3 invalid JSON · 4 invalid.
`;

function fail(code, msg) {
  process.stderr.write(`validate-project: ${msg}\n`);
  process.exit(code);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  fail(1, err.message);
}

const { values, positionals } = parsed;
if (values.help) { process.stdout.write(HELP); process.exit(0); }
if (values.file && positionals.length) {
  fail(1, 'pass a path OR --file, not both.');
}

let path = values.file || positionals[0];
if (!path) {
  const candidates = [
    join(process.cwd(), '.claude', 'jason-code', 'project.json'),
    join(process.cwd(), 'project.json'),
  ];
  path = candidates.find((p) => existsSync(p));
  if (!path) {
    fail(2, `no project.json found (searched ${candidates.join(', ')}). Pass a path or --file.`);
  }
}
path = resolve(path);

if (!existsSync(path)) fail(2, `project.json not found at ${path}.`);

let raw;
try {
  raw = readFileSync(path, 'utf8');
} catch (err) {
  fail(2, `cannot read ${path}: ${err.message}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(3, `${path} is not valid JSON: ${err.message}`);
}

const errors = [];
const notes = [];

if (data === null || typeof data !== 'object' || Array.isArray(data)) {
  fail(4, `${path}: top level must be a JSON object.`);
}

// name — required, non-empty string.
if (typeof data.name !== 'string' || data.name.trim() === '') {
  errors.push('`name` is required and must be a non-empty string.');
}

// repo — required, non-empty string that looks like an http(s) URL.
if (typeof data.repo !== 'string' || data.repo.trim() === '') {
  errors.push('`repo` is required and must be a non-empty string.');
} else {
  let ok = false;
  try {
    const u = new URL(data.repo);
    ok = u.protocol === 'http:' || u.protocol === 'https:';
  } catch { ok = false; }
  if (!ok) errors.push(`\`repo\` ("${data.repo}") must be a full http(s):// URL.`);
}

// tagline — optional; if present must be a string.
if ('tagline' in data && typeof data.tagline !== 'string') {
  errors.push('`tagline` is optional but, when present, must be a string.');
}

const known = new Set(['name', 'repo', 'tagline']);
const extra = Object.keys(data).filter((k) => !known.has(k));
if (extra.length) notes.push(`note: extra key(s) ignored by the contract: ${extra.join(', ')}.`);

if (errors.length) {
  process.stderr.write(`✗ ${path}: invalid project.json\n`);
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.exit(4);
}

for (const n of notes) process.stdout.write(`${n}\n`);
process.stdout.write(`✓ ${path}: valid (name="${data.name}", repo="${data.repo}").\n`);
process.exit(0);
