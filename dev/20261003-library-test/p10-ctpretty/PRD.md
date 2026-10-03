# PRD — Phase 10 · CtPretty

**Round type:** ship, sonnet, serial. **Size:** VERY HIGH (1796 lines, the heaviest). **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtPretty.mjs` → `src/lib/tests/unit/CtPretty.*.test.mjs`.

## In scope
A multi-language pretty-printer / minifier (6 languages per PROVENANCE — likely JSON, XML/HTML, CSS, JS,
SQL, and one more; confirm from the `export { ... }` list + code). For EACH language, both directions:
- **Pretty / format:** minified input → correctly indented output (indent width option if any), stable key/
  attr handling, nesting, comments preserved-or-stripped per policy.
- **Minify:** pretty input → whitespace-stripped output that is still semantically equivalent.
- **Idempotency:** `pretty(pretty(x)) === pretty(x)`; `minify(minify(x)) === minify(x)`.
- **Round-trip stability:** `minify(pretty(x))` and `pretty(minify(x))` converge (semantic equivalence —
  e.g. for JSON, `JSON.parse` equality before/after).
- **Edge/malformed:** empty, already-formatted, deeply nested, invalid input (how it fails — throw vs
  best-effort), unicode, large input, comments, trailing commas (where the language allows/forbids).

## STRONGLY consider splitting (builder's judgment, surface at planning)
This module is large enough that one round risks thin coverage. Preferred: **split per language group**
into sibling rounds (e.g. 10a JSON+XML/HTML, 10b CSS+SQL, 10c JS+other) — each its own `ship` round, each
its own `CtPretty.<lang>.test.mjs`. Keep the per-round surface to ≤2 languages so coverage stays deep.
The executing orchestrator should make this split call at this phase's Gate A.

## Definition of Done (per sub-round if split)
- Target language(s) pretty+minify+idempotency+round-trip+edge covered with exact or semantic-equality
  assertions; green under `node --test`.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: language coverage matrix; if split, which languages this sub-round covered + what remains.

## Notes
No lib edits. Prefer semantic-equality checks (parse/compare) over brittle exact-string where formatting
is opinionated, but pin at least one exact-output fixture per language to catch formatter regressions.
