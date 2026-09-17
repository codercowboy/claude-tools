// Tool-specific unit-test helpers for tools/cron-builder/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific date fixtures below.
import { loadLogic as loadSharedLogic } from '../../../test-support/unit.mjs';

// loadLogic() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadLogic() {
  return loadSharedLogic(import.meta.url);
}

// nextRuns uses local-time Date math, so tests build `from` with the local
// Date constructor and assert on local getters — keeping them deterministic in
// any time zone the CI/dev machine happens to be in.
export function localDate(y, mo, d, hh = 0, mi = 0, ss = 0) {
  return new Date(y, mo - 1, d, hh, mi, ss, 0); // mo is 1-based here for readability
}

// Compact local stamp for a Date, for readable assertions.
export function stamp(date) {
  return {
    y: date.getFullYear(),
    mo: date.getMonth() + 1, // 1-based
    d: date.getDate(),
    hh: date.getHours(),
    mi: date.getMinutes(),
    ss: date.getSeconds(),
    dow: date.getDay(), // 0=Sun..6=Sat
  };
}
