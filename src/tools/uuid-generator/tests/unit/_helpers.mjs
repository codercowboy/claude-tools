// Tool-specific unit-test helpers for tools/uuid-generator/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../test-support/unit.mjs); this file re-exports it and keeps the
// tool-specific fixture helpers below.
import { loadLogic as loadSharedLogic } from '../../../test-support/unit.mjs';

// loadLogic() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadLogic() {
  return loadSharedLogic(import.meta.url);
}

// A deterministic 0..(n-1) byte array — handy for exact-output assertions.
export function ramp(n) {
  return Uint8Array.from({ length: n }, (_, i) => i & 0xff);
}

// A fixed-value byte array.
export function fill(n, v) {
  return new Uint8Array(n).fill(v & 0xff);
}

// Strip hyphens/braces/urn prefix → 32 lowercase hex chars.
export function bareHex(uuid) {
  return String(uuid).replace(/^urn:uuid:/i, '').replace(/[{}-]/g, '').toLowerCase();
}
