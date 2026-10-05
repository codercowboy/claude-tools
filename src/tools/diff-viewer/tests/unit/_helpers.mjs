// Tool-specific unit-test helpers for tests/unit/*.test.mjs. Dev/test-only —
// never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file re-exports it and keeps the
// tool-specific fixture helpers below.
import { loadLogic as loadSharedLogic } from '../../../../lib/test-support/unit.mjs';

// loadLogic() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadLogic() {
  return loadSharedLogic(import.meta.url);
}

// Compact representation of a myersDiff result: a string of one char per op
// ('='/'-'/'+') so an op sequence can be asserted at a glance.
export function opString(ops) {
  return ops
    .map((o) => (o.type === 'equal' ? '=' : o.type === 'delete' ? '-' : '+'))
    .join('');
}

// Reconstruct the two inputs from a myersDiff op list, given the source
// element arrays, to prove the ops describe a valid edit script:
//   deletes+equals -> a ;  inserts+equals -> b
export function reconstruct(ops, a, b) {
  let ai = 0;
  let bi = 0;
  const outA = [];
  const outB = [];
  for (const op of ops) {
    if (op.type === 'equal') { outA.push(a[ai++]); outB.push(b[bi++]); }
    else if (op.type === 'delete') { outA.push(a[ai++]); }
    else { outB.push(b[bi++]); }
  }
  return { a: outA, b: outB };
}
