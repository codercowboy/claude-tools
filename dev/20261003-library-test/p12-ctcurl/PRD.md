# PRD — Phase 12 · CtCurl

**Round type:** ship, sonnet, serial. **Size:** high (1099 lines). **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtCurl.mjs` → `src/lib/tests/unit/CtCurl.test.mjs`.

## In scope
An HTTP-request model + curl/wget command parser + multi-language code generator. FIRST enumerate the
`export { ... }` API. Test (all pure — string in, model/string out):
- **curl parsing:** `-X`/`--request`, `-H`/`--header` (repeated), `-d`/`--data`/`--data-raw`/`--data-urlencode`,
  `-F` multipart, `-u` basic auth, `--url` vs positional URL, `-G` (data→query), method inference (GET vs
  POST when data present), query-string parsing, quoting (single/double, escaped), line continuations `\`,
  flags in any order; a couple of real-world curl one-liners → expected model.
- **wget parsing** (if supported): the subset it handles → model.
- **Code generation** (the model → language snippets, if exported): for each target language, a known
  request → expected snippet (exact or structurally asserted); headers/body/method/auth all represented.
- **Round-trip:** `parse(generateCurl(model))` ≈ model (semantic equality) where both directions exist.
- **Edge/malformed:** empty, unknown flags (ignored vs error — pin actual), missing URL, header without
  colon, duplicate headers, URL-encoding of data.

## Definition of Done
- `CtCurl.test.mjs` green; parser (curl + wget) + generator (per language) + round-trip + malformed
  covered with fixtures.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: coverage matrix (flags parsed, languages generated, what's deferred).

## Notes
No lib edits. Use real curl one-liners as fixtures (high signal). If parser + multi-language generator is
too much for one round, surface a split (parser round vs generator round). Pin exact snippets for at least
one language; structural asserts are fine for the rest.
