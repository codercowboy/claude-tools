# PRD — Phase 07 · CtEscaper

**Round type:** ship, sonnet, serial. **Size:** medium-high (big surface, mechanical). **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtEscaper.mjs` (539 lines) → `src/lib/tests/unit/CtEscaper.test.mjs`.

## In scope — ~20 escape/unescape context PAIRS
`escape/unescape` for: Base64, HtmlText, HtmlAttr, Xml, Json, JsString, Java, CString, Python, ShSingle,
ShDouble, ShAnsiC, PowerShell, Sql, Csv, UrlComponent, UrlFull, Markdown, Regex; plus `escapeFilename`
(one-way); and the metadata exports `CONTEXTS`, `CONTEXTS_BY_ID`, `DEFAULT_ENABLED`, `nest`.

## Test strategy (keep it systematic, not 40 ad-hoc tests)
- **Round-trip identity per pair:** for each context, `unescapeX(escapeX(s)) === s` over a shared battery
  of inputs: empty, plain ASCII, the context's special chars, unicode/emoji, newlines/tabs, quotes,
  backslashes, a long string. Drive it as a table over CONTEXTS so adding a context is one row.
- **Known fixtures per context:** a few canonical escape results (e.g. HtmlText `&<>"'`, Json `\n\t\"\\`,
  Csv quoting + embedded comma/quote/newline, Url percent-encoding, Regex metachar escaping) asserted
  exactly — round-trip alone can pass with a no-op, so pin real escape output too.
- **`CONTEXTS` / `CONTEXTS_BY_ID` / `DEFAULT_ENABLED`:** shape/consistency — every CONTEXT has an id,
  CONTEXTS_BY_ID maps them, DEFAULT_ENABLED ⊆ CONTEXTS ids. `nest(...)` — compose two contexts and verify.
- **Asymmetric cases:** `escapeFilename` (one-way) — illegal chars replaced, reserved names, empty, length.

## Definition of Done
- `CtEscaper.test.mjs` green; every context pair has round-trip + ≥1 known-output fixture; metadata +
  filename + nest covered.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: table of contexts → {roundtrip ✓, fixture ✓}, plus any context where round-trip is NOT exact
  (lossy by design) called out with the reason.

## Notes
No lib edits. Round-trip-only is insufficient (a no-op escaper would pass) — ALWAYS pair it with a
real known-output assertion. Surface any context whose round-trip is lossy rather than weakening the test.
