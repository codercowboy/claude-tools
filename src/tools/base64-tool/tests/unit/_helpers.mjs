// Tool-specific unit-test helpers for tools/base64-tool/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file just re-exports it under the
// tool's historical name so existing test files keep working. Tool-specific
// unit extras (if any) would live here alongside.
import { loadLogic } from '../../../../lib/test-support/unit.mjs';

// loadBase64Tool() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadBase64Tool() {
  return loadLogic(import.meta.url);
}
