# Plan — 07-ctescaper

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test `src/lib/utils/formats/CtEscaper.mjs` (539 lines): ~20 `escape<Ctx>`/`unescape<Ctx>` context
PAIRS (Base64, HtmlText, HtmlAttr, Xml, Json, JsString, Java, CString, Python, ShSingle, ShDouble,
ShAnsiC, PowerShell, Sql, Csv, UrlComponent, UrlFull, Markdown, Regex), plus one-way `escapeFilename`, the
metadata exports `CONTEXTS` / `CONTEXTS_BY_ID` / `DEFAULT_ENABLED`, and `nest(chain, text)`. Full scope
spec: `dev/20261003-library-test/p07-ctescaper/PRD.md`. Big but mechanical — TABLE-DRIVEN, not 40 ad-hoc tests.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Every context pair round-trips | `src/lib/tests/unit/CtEscaper.test.mjs` | table over CONTEXTS: `unescapeX(escapeX(s))===s` over a shared battery (empty, ASCII, the context's specials, unicode/emoji, newlines/tabs, quotes, backslashes, long string) |
| Every context has a real known-output fixture | same file | ≥1 canonical escape result asserted EXACTLY per context (HtmlText `&<>"'`, Json `\n\t\"\\`, Csv quoting+embedded comma/quote/newline, Url %-encoding, Regex metachars, etc.) — NOT round-trip-only |
| Metadata consistent | same file | every CONTEXT has an id; CONTEXTS_BY_ID maps them; DEFAULT_ENABLED ⊆ CONTEXTS ids; `nest(chain,text)` composes two contexts correctly |
| Asymmetric cases | same file | `escapeFilename`: illegal chars replaced, reserved names, empty, length |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green; `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtEscaper.mjs` to enumerate the exact export names + any lossy/asymmetric notes in its header
(e.g. "default decoder strips a leading BOM" — Base64 note; octal-escape determinism). Then:
1. Build a SHARED input battery array + a table of `{id, escape, unescape}` rows over all context pairs;
   loop it to assert round-trip identity per input. Adding a context = one row.
2. For EACH context, assert ≥1 exact known-output fixture (this is what catches a no-op escaper that would
   still pass round-trip). Pull canonical results from the context's spec (HTML entities, JSON.stringify,
   RFC 4180 CSV, percent-encoding, regex metachar set, shell quoting).
3. Metadata: assert shape/consistency of CONTEXTS / CONTEXTS_BY_ID / DEFAULT_ENABLED; test `nest` composing
   two contexts both directions.
4. `escapeFilename`: illegal-char replacement, reserved names (CON/PRN/etc. if handled), empty, length cap.
CHARACTERIZE any context whose round-trip is LOSSY BY DESIGN (call it out with the reason) rather than
weakening the test. A genuine bug (round-trip should hold but doesn't) is STOP-and-surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p07-ctescaper/PRD.md` — scope/DoD + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar (round-trip + known-output).
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/formats/CtEscaper.mjs` — the module under test (enumerate exports + header notes FIRST).

## Deliverables
- `src/lib/tests/unit/CtEscaper.test.mjs`.
- `findings/HANDOFF.md` — a table of contexts → {roundtrip ✓, fixture ✓}, the test count, the command
  outputs, any lossy-by-design context (with reason), and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Round-trip-ONLY is insufficient — always pair with a
  known-output assert. A genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtEscaper.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the context table
(roundtrip/fixture per context), call out any lossy context, and flag any suspected bug. Write it to
`findings/HANDOFF.md`.
