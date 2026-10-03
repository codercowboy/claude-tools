// test-support/setup.mjs — e2e navigation & first-load setup.
//
// Dev/test-only ESM. IMPORTED (not inlined) by a tool's tests/*.e2e.mjs — a
// single-file tool's shipped index.html never references this. Distilled from
// the byte-identical preambles every tool re-rolled; see PROVENANCE.md.
//
// Import from a tool's e2e spec (which lives in tests/):
//   import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// toolUrl(import.meta.url) -> the file:// URL of the tool's built index.html.
// Called from a tool's tests/*.e2e.mjs, so index.html is one level up (../).
export function toolUrl(importMetaUrl) {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  return pathToFileURL(path.resolve(dir, '../index.html')).href;
}

// helpSeenKey(toolName) -> the localStorage key guarding the first-load Help
// popup for a tool (auto-shows once, then never again).
export function helpSeenKey(toolName) {
  return `${toolName}:help-seen:v1`;
}

// seedHelpSeen(page, key) -> mark the first-load Help popup as already seen
// BEFORE the page's own script runs, so it never auto-opens over unrelated
// assertions. The setItem is wrapped in try/catch because file:// / blocked
// storage can throw. `key` is a helpSeenKey(toolName) value.
export function seedHelpSeen(page, key) {
  return page.addInitScript((k) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* storage unavailable */ }
  }, key);
}
