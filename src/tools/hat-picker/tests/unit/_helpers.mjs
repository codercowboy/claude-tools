// Tool-specific unit-test helpers for tools/hat-picker/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific fixture helper below.
import { loadLogic as loadSharedLogic } from '../../../../lib/test-support/unit.mjs';

// loadHatPicker() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadHatPicker() {
  return loadSharedLogic(import.meta.url);
}

// Deterministic seeded PRNG for tests (mulberry32) — a test-only utility,
// NOT exported by the tool itself. The tool's own defaultRng() is backed by
// crypto.getRandomValues and has no reproducibility requirement; tests that
// need a specific pick inject this instead.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
