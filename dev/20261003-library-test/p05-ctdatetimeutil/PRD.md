# PRD — Phase 05 · CtDateTimeUtil

**Round type:** ship, sonnet, serial. **Size:** medium-high. **Depends on:** Phase 01.
**Target:** `src/lib/utils/CtDateTimeUtil.mjs` (554 lines) → `src/lib/tests/unit/CtDateTimeUtil.test.mjs`.

## In scope
- `formatDuration(...)` and `humanizeDuration(...)` — the two standalone exports.
- The `CtDateTimeUtil` class/object surface: FIRST, enumerate its public methods (it wraps a timezone /
  calendar / date-math engine, ex-`jbcTimezone`, built on `Intl`). Test the PURE, deterministic ones.
- Likely coverage targets (confirm against the actual API): duration formatting across scales
  (ms/sec/min/hour/day), zero duration, negative, very large, fractional seconds, pluralization,
  humanize thresholds ("just now" / "x minutes ago" style), rounding boundaries.
- Date math that is Intl/tz-based: pick a FIXED timezone + fixed input instants so results are
  deterministic (pass explicit tz/locale; do not rely on the host tz). DST boundary + leap-year +
  month-length edge cases if the engine does calendar math.

## Approach
- Enumerate exports/methods first (the file is big; the public surface is what matters). Use fixed
  instants (epoch ms) + explicit tz/locale args for determinism — never `Date.now()` / host tz.
- Characterize-then-assert: if a formatting choice is opinionated, lock the ACTUAL current output as the
  expectation and note it; surface anything that looks wrong rather than editing the lib.

## Definition of Done
- `CtDateTimeUtil.test.mjs` green; formatDuration/humanizeDuration + the pure engine methods covered with
  edge cases (zero/negative/large/DST/leap where relevant); all deterministic (no host-tz/clock reliance).
- `test-all` + `build-all --check` 10/10 green.
- Handoff: method inventory → tested | deferred(reason, e.g. needs live clock/tz).

## Notes
If the public surface turns out large (many engine methods), this is a candidate to split — surface it
rather than thin the coverage. No lib edits.
