import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scan } from '../../source/logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('built index.html has no stray import/export lines (clean inline)', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(/^\s*(export|import)\s/m.test(html), false);
});

test('shipped source and tests contain no raw invisible/bidi characters (dogfood)', () => {
  const dirs = ['source', 'tests', 'tests/unit'];
  for (const d of dirs) {
    for (const f of readdirSync(path.join(root, d))) {
      if (!/\.(mjs|html|css)$/.test(f)) continue;
      const text = readFileSync(path.join(root, d, f), 'utf8');
      const bad = scan(text).items.filter((i) => i.category !== 'confusable' && i.category !== 'space' && i.category !== 'separator');
      assert.deepEqual(bad.map((i) => i.hex), [], d + '/' + f);
    }
  }
});

test('app.mjs never assigns user text through innerHTML', () => {
  const app = readFileSync(path.join(root, 'source/app.mjs'), 'utf8');
  assert.equal(/\.innerHTML\s*=/.test(app), false);
  assert.equal(/\bhtml:/.test(app), false);
});
