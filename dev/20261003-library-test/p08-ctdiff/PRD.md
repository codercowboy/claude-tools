# PRD — Phase 08 · CtDiff

**Round type:** ship, sonnet, serial. **Size:** medium. **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtDiff.mjs` (278 lines; Myers O(ND) engine) → `src/lib/tests/unit/CtDiff.test.mjs`.

## In scope
- FIRST enumerate the `export { ... }` list (the public API — likely line-diff, word-diff, and a
  unified-diff formatter). Test each public entry.
- **Myers line diff:** identical inputs → no changes; pure insertions; pure deletions; replacements;
  common-prefix/suffix; empty↔non-empty; CRLF vs LF; trailing-newline handling; a known small case with a
  hand-computed expected op sequence (add/del/equal).
- **Word-level diff** (if exported): intra-line changes, punctuation, whitespace runs.
- **Unified diff** (if exported): correct `@@ -a,b +c,d @@` hunk headers, context lines, `+`/`-` markers,
  multiple hunks, configurable context size if supported.
- **Correctness property:** applying the diff's deletions+insertions to the "before" reconstructs the
  "after" (edit-script soundness) for a battery of random-ish but fixed pairs.

## Definition of Done
- `CtDiff.test.mjs` green; each public fn covered with known cases + the reconstruct-after property.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: public-API inventory → tested; note any formatting option left untested + why.

## Notes
No lib edits. Pin at least one hand-computed op sequence (not just the reconstruct property) so a wrong
-but-self-consistent diff can't pass.
