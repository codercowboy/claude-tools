# PRD — Phase 09 · CtMarkdown

**Round type:** ship, sonnet, serial. **Size:** high. **Depends on:** Phase 01.
**Target:** `src/lib/utils/formats/CtMarkdown.mjs` (623 lines; deterministic MD→HTML, DOM-free) →
`src/lib/tests/unit/CtMarkdown.test.mjs`.

## In scope
Enumerate the `export { ... }` API (likely a `render`/`toHtml` entry + maybe helpers). Test the renderer
across Markdown constructs — one focused test per construct, asserting the exact HTML output:
- **Block:** headings (#..######, with/without trailing #), paragraphs, blank-line separation, hr,
  blockquotes (nested), fenced code blocks (``` and language class), indented code, ordered/unordered
  lists (nested, mixed, loose vs tight), tables (if supported, alignment), setext headings (if supported).
- **Inline:** bold/italic/bold-italic (`*`/`_` variants), inline code, links `[t](u)` + titles,
  autolinks, images `![alt](src)`, line breaks (two-space / backslash), escapes `\*`.
- **Safety (critical for a renderer):** raw HTML / script handling — confirm the documented policy
  (escaped vs passed through vs stripped); `javascript:` URL handling in links/images; `<` `&` escaping in
  text. Pin these as explicit security-relevant assertions.
- **Edge:** empty input, trailing newline, CRLF, unicode, deeply nested, malformed (unclosed emphasis/code/
  fence) → graceful, deterministic output.

## Definition of Done
- `CtMarkdown.test.mjs` green; each construct + the safety/XSS policy has exact-output assertions;
  determinism (same MD → same HTML) checked.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: construct coverage matrix + the exact raw-HTML/URL safety policy observed (note if it looks
  unsafe — that's a surface-to-user, not a test to weaken).

## Notes
Big module — if it's genuinely too large for thorough coverage in one round, STOP and propose a split
(e.g. block-constructs vs inline+safety) rather than shipping shallow tests. No lib edits.
