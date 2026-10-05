// Tool-specific unit-test helpers for tools/hasher/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific convenience helper below.
import { loadLogic as loadSharedLogic } from '../../../../lib/test-support/unit.mjs';

// loadHasher() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadHasher() {
  return loadSharedLogic(import.meta.url);
}

// Convenience: hex digest of a UTF-8 string for a given hash fn.
export function hexOf(fn, bytesToHex, textToBytes, str) {
  return bytesToHex(fn(textToBytes(str)));
}
