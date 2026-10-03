# Plan — 09-ctmarkdown

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test `src/lib/utils/formats/CtMarkdown.mjs` (623 lines; deterministic, DOM-free MD→HTML renderer).
Public API (confirmed `export { ... }`, 5 entries): `mdToHtml(src, opts)` (the entry: line-based block
parser + inline parser), `parseInline`, `escapeHtmlForMarkdown`, `escapeAttrForMarkdown`, `sanitizeUrl`.
Documented safety model (header): raw HTML is ALWAYS escaped (never passed through); `sanitizeUrl` blocks
`javascript:`/`vbscript:`/`data:` — `data:image/` allowed only for images when `opts.allowImage`. No DOM,
no Date, no randomness → same MD ⇒ byte-identical HTML. Full scope spec:
`dev/20261003-library-test/p09-ctmarkdown/PRD.md`. HIGH-size — table-driven, one focused test per construct.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| All 5 exports covered | `src/lib/tests/unit/CtMarkdown.test.mjs` | each export directly tested; handoff maps export → tests |
| Block constructs exact | same file | headings (#..######, trailing #), paragraphs, blank-line sep, hr, nested blockquotes, fenced code (``` + lang class), indented code, ordered/unordered/nested/mixed lists, loose-vs-tight, tables+alignment (if supported), setext (if supported) — EXACT HTML asserted per construct |
| Inline constructs exact | same file | bold/italic/bold-italic (`*`+`_`), inline code, links `[t](u)`+titles, autolinks, images `![alt](src)`, line breaks (two-space/backslash), backslash escapes `\*` — exact HTML |
| Safety policy pinned | same file | raw HTML / `<script>` escaped (not passed through); `sanitizeUrl` blocks `javascript:`/`vbscript:`/`data:` in links; `data:image/` allowed for images only under `allowImage`; `<`/`&`/`"` escaped in text + attrs — EXPLICIT security assertions |
| Edges graceful & deterministic | same file | empty, trailing newline, CRLF, unicode, deep nesting, malformed (unclosed emphasis/code/fence) → graceful; same MD twice → identical HTML |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtMarkdown.mjs` header + `mdToHtml`/`parseInline`/`sanitizeUrl` bodies to confirm exact output shape
(tag names, attribute order, whether a trailing newline is emitted, how code-fence lang maps to a class)
FIRST — assert what the lib ACTUALLY emits, byte-for-byte, not what a generic MD spec says. Then:
1. **Block table** — `{name, md, html}` rows, one per construct; `assert.equal(mdToHtml(md), html)`.
2. **Inline table** — same shape, driving `mdToHtml` (and spot-checking `parseInline` directly).
3. **Safety** — explicit tests: a `<script>` / raw `<div>` in source is escaped in output; a
   `[x](javascript:alert(1))` link drops/neutralizes the href; `![x](data:image/png;base64,...)` is allowed
   under `allowImage` but a non-image `data:` is blocked; `sanitizeUrl` unit-tested across schemes.
4. **escape helpers** — `escapeHtmlForMarkdown` (`& < > "`), `escapeAttrForMarkdown` (adds `'`) exact.
5. **Edges + determinism** — empty/CRLF/unicode/deep-nest/malformed → graceful; render twice, assert equal.
A renderer that looks UNSAFE (raw HTML surviving, a dangerous scheme passing `sanitizeUrl`) is a
STOP-and-SURFACE, never a weakened test, never a lib edit. If the module is genuinely too large for
thorough coverage in one round, STOP and propose a split (block vs inline+safety) — do not ship shallow.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p09-ctmarkdown/PRD.md` — scope/DoD + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar (exact-output per construct).
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/formats/CtMarkdown.mjs` — the module under test (confirm exact emitted HTML FIRST).

## Deliverables
- `src/lib/tests/unit/CtMarkdown.test.mjs`.
- `findings/HANDOFF.md` — the construct-coverage matrix (construct → tested, exact✓), the test count,
  command outputs, the EXACT raw-HTML/URL safety policy observed (and whether any part looks unsafe), and
  any suspected bug. If you split, say exactly what is deferred and why.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL byte output, not a generic spec.
  An unsafe-looking renderer or a genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtMarkdown.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h (HIGH size — split rather than ship shallow if needed).

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the construct-coverage
matrix, state the exact raw-HTML/URL safety policy (flag anything unsafe), and flag any suspected bug.
Write it to `findings/HANDOFF.md`.
