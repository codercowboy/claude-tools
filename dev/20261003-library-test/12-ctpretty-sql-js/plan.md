# Plan — 12-ctpretty-sql-js (Phase 10c: SQL + JS)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 3 of 3 (COMPLETES the CtPretty split; `src/lib/utils/formats/CtPretty.mjs`, 1796 lines). THIS
round covers **SQL + JS** only (10a=JSON+YAML, 10b=HTML+CSS done). Both are PRETTY-PRINT + **SAFE-MINIFY-
only** engines (per the module header: comments + insignificant whitespace only — never identifier
renaming, dead-code removal, or AST rewriting; fully string/regex/template aware; minify never joins
tokens across an existing newline). Exports in scope (6): `tokenizeSQL`, `formatSQL(src,opts)`,
`minifySQL(src)`, `tokenizeJS`, `formatJS(src,opts)`, `minifyJS(src)`. The tokenizers are exported
expressly so consumers can assert token-stream equivalence. Full spec:
`dev/20261003-library-test/p10-ctpretty/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| SQL tokenizer correct | `src/lib/tests/unit/CtPretty.sql-js.test.mjs` | `tokenizeSQL` emits typed tokens (ws, lineComment `--`, blockComment `/* */`, string, keyword, ident, number, punct); strings + comments captured whole; exact token arrays for fixtures |
| SQL pretty + minify | same file | `formatSQL` keyword casing + clause newlines + indent (opts); `minifySQL` collapses insignificant ws; ≥1 exact pretty fixture; minify idempotent |
| SQL semantic fidelity | same file | significant (non-ws/comment) token stream is identical before/after minify; strings + quoted idents + comments-per-policy not mangled |
| JS tokenizer correct | same file | `tokenizeJS` disambiguates regex-vs-division (JS_REGEX_KEYWORDS vs value tokens), handles template literals (incl `${}` nesting), all multi-char punctuators, strings; exact token arrays |
| JS pretty + minify (SAFE) | same file | `formatJS` indents blocks; `minifyJS` strips comments + insignificant ws ONLY — NEVER renames/rewrites; preserves strings/regex/templates VERBATIM; NEVER joins across an existing newline (ASI-safety); ≥1 exact fixture; idempotent |
| Semantic equivalence | same file | for a battery of SQL + JS inputs, the significant token stream (via the exported tokenizers) is preserved through minify; a regex literal, a template literal, and a string with keywords/`//` inside survive untouched |
| Edges | same file | empty, already-formatted, deeply nested, malformed input (how each fails — throw vs best-effort), unicode, comments |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read the SQL engine (tokenizeSQL ~406, formatSQL ~508, minifySQL ~623) and JS engine (tokenizeJS ~1338,
formatJS ~1612, minifyJS ~1758) FIRST to learn the EXACT token shapes, the format output (casing/clause/
indent policy), and minify's safe-transform boundary. Assert what the lib ACTUALLY emits. Then:
1. **Tokenizers** — assert exact token arrays for representative inputs: SQL (keywords, `--`/`/* */`
   comments, single-quoted strings + escapes, `"quoted ident"`, numbers, operators); JS (the
   regex-vs-division cases — `a/b/c` division vs `return /re/g` regex vs `)/re/`; template literal with
   `${expr}` nesting; strings with `//` and keywords inside; all punctuators). These catch the subtle bugs.
2. **Pretty** — ≥1 exact `formatSQL` + `formatJS` fixture; indent options; idempotency (`format(format(x))
   ===format(x)`).
3. **Minify (SAFE)** — the overriding invariant: `minify` preserves the SIGNIFICANT token stream (compare
   `tokenizeX(src)` filtered to non-ws/comment vs `tokenizeX(minifyX(src))` filtered) and NEVER joins
   across an existing newline (construct an ASI case — e.g. `return\n1` must not become `return 1`). A
   regex/template/string with structural chars inside survives verbatim. Idempotency.
4. **Edges** — empty, already-minified, deep nesting, malformed (unterminated string/comment/template,
   stray chars) → assert the ACTUAL behavior; unicode.
Prefer semantic/token-stream equality (these formats are opinionated) but ALWAYS pin ≥1 exact fixture per
language. A minify that CHANGES SEMANTICS (ASI break, mangled string/regex, rename) is a genuine bug →
STOP and surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p10-ctpretty/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` (10a — the sibling pattern to copy).
- `src/lib/utils/formats/CtPretty.mjs` — read the SQL + JS regions; confirm token shapes + format policy +
  minify's safe boundary FIRST.

## Deliverables
- `src/lib/tests/unit/CtPretty.sql-js.test.mjs`.
- `findings/HANDOFF.md` — SQL/JS coverage matrix (tokenizer✓/pretty✓/minify✓/semantic-equiv✓/idempotent✓/
  edge✓/fixture✓), the test count, command outputs, the observed minify safe-boundary + malformed policy,
  a note that this COMPLETES the P10 CtPretty split, and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output / token stream. Prefer
  semantic/token-stream equality but pin ≥1 exact fixture per language. A semantics-changing minify is
  STOP-and-surface.
- Cover SQL + JS ONLY. Do NOT re-test JSON/YAML/HTML/CSS (other rounds own them).
- Write only `src/lib/tests/unit/CtPretty.sql-js.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the SQL/JS coverage
matrix, state the observed minify safe-boundary + malformed policy, confirm the P10 split is COMPLETE, and
flag any suspected bug. Write it to `findings/HANDOFF.md`.
