// Tool-specific unit-test helpers for tools/color-designer/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific RNG fixture below.
import { loadLogic } from '../../../../lib/test-support/unit.mjs';

// loadColorDesigner() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadColorDesigner() {
  return loadLogic(import.meta.url);
}

// Deterministic RNG for tests that call generateScheme/roll directly with an
// explicit `rng` — a fixed sequence cycling through the given values (mirrors
// the tool's own makeSeqRng, duplicated here so tests don't depend on the
// extracted module's internals beyond what they're asserting).
export function seqRng(seq) {
  let i = 0;
  return () => { const v = seq[i % seq.length]; i++; return v; };
}
