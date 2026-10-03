# PRD — Phase 11 · CtFormat

**Round type:** ship, sonnet, serial. **Size:** high (1095 lines). **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtFormat.mjs` → `src/lib/tests/unit/CtFormat.test.mjs`.

## In scope
A structured-data format-conversion engine. FIRST enumerate the `export { ... }` API + the supported
formats (likely JSON / YAML / TOML / CSV / XML / query-string — confirm from code). Test the conversion
matrix that the module actually supports:
- **Parse each format → canonical object** and **serialize object → each format**, with known fixtures.
- **Cross-conversions** the API exposes (e.g. JSON↔YAML, CSV↔JSON): a fixture converted A→B equals the
  expected B; and A→B→A preserves data (semantic equality via parse-compare).
- **Type fidelity:** numbers vs numeric strings, booleans, null, nested objects/arrays, empty object/array,
  dates (if handled), special chars/unicode in keys+values.
- **CSV specifics** (if present): quoting, embedded commas/quotes/newlines, header row, ragged rows.
- **Malformed input per format:** clear failure (throw vs error object) — pin the actual behavior.

## Definition of Done
- `CtFormat.test.mjs` green; the supported parse/serialize/convert matrix covered with fixtures +
  round-trip semantic-equality + malformed cases.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: the format/conversion coverage matrix (what's supported, what's tested, what's deferred).

## Notes
No lib edits. Prefer semantic (parse-and-compare) equality for round-trips; pin exact-output fixtures for
at least one direction per format. If the conversion matrix is large, surface a split (e.g. by format
family) rather than thinning coverage.
