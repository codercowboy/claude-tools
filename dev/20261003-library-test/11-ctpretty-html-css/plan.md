# Plan — 11-ctpretty-html-css (Phase 10b: HTML + CSS)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 2 of 3 of the CtPretty split (`src/lib/utils/formats/CtPretty.mjs`, 1796 lines). THIS round
covers **HTML + CSS** only (10a=JSON+YAML done; 10c=SQL+JS separate). Exports in scope (4): `formatHTML`
(src,opts; `opts.indent` default 2; node tree re-indent; void/inline/rawText aware; trims + trailing \n),
`minifyHTML` (block-aware whitespace collapse; keeps IE-conditional/bang comments, drops others),
`formatCSS` (src,opts indent default 2; string/comment/url()-aware node tree; blank line between top-level
rules; trims + trailing \n), `minifyCSS` (single string-aware pass). Full spec:
`dev/20261003-library-test/p10-ctpretty/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| HTML pretty + minify | `src/lib/tests/unit/CtPretty.html-css.test.mjs` | `formatHTML` re-indents nesting (indent 2/4/tab); `minifyHTML` collapses ws; exact fixtures |
| HTML structural awareness | same file | void elements (br/img/hr/input…) not closed; inline (span/a/em) vs block whitespace; rawText (script/style/pre) content preserved verbatim; doctype + attributes kept |
| HTML comment policy | same file | minify DROPS normal comments but KEEPS IE-conditional (`<!--[if`) + bang (`<!--!`) — assert both |
| HTML idempotency + round-trip | same file | `formatHTML(formatHTML(x))===formatHTML(x)`; `minifyHTML(minifyHTML(x))===minifyHTML(x)`; semantic: pretty↔minify preserve structure/text |
| CSS pretty + minify | same file | `formatCSS` indent 2/4/tab, blank line between top-level rules; `minifyCSS` strips insignificant ws; exact fixtures |
| CSS awareness | same file | strings ('/"), comments (/* */), url() incl unquoted not misread; nesting (@media/@supports); multiple selectors; !important |
| CSS idempotency + round-trip | same file | `format(format(x))===format(x)`; `minify(minify(x))===minify(x)`; pretty↔minify converge |
| Edges | same file | empty, already-formatted, deeply nested, malformed (unclosed tag/brace/comment) → graceful documented behavior; unicode |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read the CSS engine (~321-430: formatCSS/minifyCSS + cssParseNodes/cssEmit) and HTML engine (~790-905:
htmlEmit/formatHTML/minifyHTML + HTML_VOID/HTML_INLINE/htmlKeepComment) FIRST to learn the EXACT emitted
output (indent, blank-line policy, how inline-all children collapse to one line, comment-keep rules).
Assert what the lib ACTUALLY emits. Then:
1. **HTML** — table `{name, src, pretty, min}`; exact fixtures for nesting, void, inline-collapse, rawText,
   doctype, attributes; comment policy (keep IE-cond/bang, drop normal) as explicit tests; idempotency;
   semantic round-trip (structure/text preserved). Indent options.
2. **CSS** — table of fixtures: simple rule, multiple selectors, nested @media, url()/strings/comments,
   !important; `minifyCSS` exact; blank-line-between-rules in format; idempotency; round-trip.
3. **Edges** — empty, already-formatted (idempotent), deep nesting, malformed (unclosed tag/brace/comment,
   stray `<`/`}`) → assert the ACTUAL graceful behavior; unicode.
Prefer semantic-equality where formatting is opinionated, but ALWAYS pin ≥1 exact fixture per language.
An idempotency/round-trip that SHOULD hold but doesn't is a genuine lib bug → STOP and surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p10-ctpretty/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` (10a — the sibling pattern to copy).
- `src/lib/utils/formats/CtPretty.mjs` — read the CSS + HTML regions; confirm exact output + comment/
  whitespace policy FIRST.

## Deliverables
- `src/lib/tests/unit/CtPretty.html-css.test.mjs`.
- `findings/HANDOFF.md` — HTML/CSS coverage matrix (pretty✓/minify✓/idempotent✓/roundtrip✓/edge✓/fixture✓),
  the test count, command outputs, observed comment/malformed policy, what remains for 10c (SQL+JS), and
  any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output. Prefer semantic-equality
  where formatting is opinionated but pin ≥1 exact fixture per language. A genuine bug is STOP-and-surface.
- Cover HTML + CSS ONLY. Do NOT write JSON/YAML/SQL/JS tests (other rounds own them).
- Write only `src/lib/tests/unit/CtPretty.html-css.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the HTML/CSS coverage
matrix, state the observed comment/malformed policy, flag any suspected bug, and note what remains for 10c.
Write it to `findings/HANDOFF.md`.
