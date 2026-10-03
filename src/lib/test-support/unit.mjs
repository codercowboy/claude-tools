// test-support/unit.mjs — shared unit-test loader.
//
// Dev/test-only ESM. IMPORTED by a tool's tests/unit/*.test.mjs. Replaces the
// per-tool `_helpers.mjs` core (a memoized dynamic import of the tool's pure
// engine) that every tool copy-pasted; see PROVENANCE.md. Tool-specific unit
// extras still live alongside in the tool's own _helpers.mjs.
//
// A build-assembled tool's pure, DOM-free engine lives in source/logic.mjs,
// which the shipped index.html inlines. Unit tests import that module directly
// — no browser, no DOM. (`npm test` runs `build --check` first, so the source
// can't drift from the shipped file.)
//
// Import from a tool's unit test (which lives in tests/unit/):
//   import { loadLogic } from '../../../test-support/unit.mjs';
//   const { someExport } = await loadLogic(import.meta.url);

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cache = new Map();

// loadLogic(import.meta.url) -> Promise of the tool's source/logic.mjs module
// namespace, memoized per resolved path. Called from tests/unit/*.test.mjs, so
// logic.mjs is at ../../source/logic.mjs relative to the test file.
export function loadLogic(importMetaUrl) {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  const logicPath = path.resolve(dir, '../../source/logic.mjs');
  let pending = cache.get(logicPath);
  if (!pending) {
    pending = import(pathToFileURL(logicPath).href);
    cache.set(logicPath, pending);
  }
  return pending;
}
