// Tool-specific unit-test helpers for tools/color-converter/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../test-support/unit.mjs); this file re-exports it under the tool's
// historical name so existing test files keep working. Tool-specific unit
// extras (if any) would live here alongside.
import { loadLogic } from '../../../test-support/unit.mjs';

// loadColorConverter() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadColorConverter() {
  return loadLogic(import.meta.url);
}
