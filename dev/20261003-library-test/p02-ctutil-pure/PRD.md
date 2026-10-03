# PRD — Phase 02 · CtUtil (pure functions)

**Round type:** ship, sonnet, serial. **Size:** small-medium. **Depends on:** Phase 01 (harness).
**Target:** `src/lib/utils/CtUtil.mjs` → `src/lib/tests/unit/CtUtil.test.mjs`.

## In scope (pure fns — unit-test these)
- `clamp(v, min, max)` — in-range, below-min, above-max, min===max, negatives, floats, NaN handling.
- `num(v, fallback?)` — numeric coercion: valid number, numeric string, "", null/undefined, "1e2", NaN → fallback.
- `clampInt(v, min, max)` — parseInt semantics (contrast with a tool-local floor variant seen in #1008);
  test "", "1e2", floats, out-of-range, non-numeric.
- `escapeHtml(s)` / `escapeAttr(s)` — `& < > " '` and attr-specific escaping; empty, unicode, already-escaped, mixed.
- `slugify(s)` — spaces→-, case, punctuation stripping, unicode/diacritics, leading/trailing/multiple separators, empty.
- `wrapText(s, width, ...)` — wrap at width, long unbreakable word, existing newlines, empty, width edge (0/1).

## Deferred (DOM / timers — NOT unit-tested here; list in handoff with reason)
`downloadBlob`, `el`, `persistState`, `onceFlag`, `posAt`, `prefersReducedMotion`, `setupHiDPICanvas`,
`restartAnimation` — DOM/BOM dependent → e2e-covered via tools. `debounce` — timer-based; OPTIONAL to
test with node fake timers (`node:test` mock timers) if cheap; otherwise defer and note it.

## Definition of Done
- `CtUtil.test.mjs` green under `node --test`; meaningful assertions per in-scope fn (edge cases above).
- `test-all` + `build-all --check` 10/10 stay green.
- Handoff lists every CtUtil export → tested | deferred(reason).

## Notes
Pure-logic only; no lib edits. If `clampInt`/`num` behavior surprises you, document the ACTUAL behavior
as the test's expectation (characterization) — do not "fix" the lib; surface anything that looks like a bug.
