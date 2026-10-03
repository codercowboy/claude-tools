# Plan — 10-ctpretty-json-yaml (Phase 10a: JSON + YAML + shared helpers)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 1 of 3 of the CtPretty split (`src/lib/utils/formats/CtPretty.mjs`, 1796 lines / 6 engines).
THIS round covers **JSON + YAML + the 3 shared helpers** only (10b=HTML+CSS, 10c=SQL+JS are separate
rounds). Exports in scope (8): shared `byteLength` (UTF-8 byte count, surrogate-aware), `indentUnit`
(number/'tab'/'\t' → indent string, default 2 spaces), `lineColFromOffset` (1-based line/col); JSON
`formatJSON(src,opts)` (wraps JSON.parse+stringify; `opts.indent` default 2, accepts `'tab'`/`'\t'`;
friendly `Invalid JSON: … (line L, col C)` on bad input) + `minifyJSON(src)`; YAML `parseYAML(src)`,
`formatYAML(src,opts)`, `minifyYAML(src)`. Full spec: `dev/20261003-library-test/p10-ctpretty/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Shared helpers exact | `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` | `byteLength` ASCII/multibyte/emoji(surrogate); `indentUnit` 2/4/0/'tab'/'\t'/bad→default; `lineColFromOffset` first/mid/newline/past-end (1-based) |
| JSON pretty + minify | same file | `formatJSON` default 2sp, indent 4, tab; `minifyJSON` strips all insignificant ws; exact fixtures |
| JSON idempotency + round-trip | same file | `formatJSON(formatJSON(x))===formatJSON(x)`; `minifyJSON(minifyJSON(x))===minifyJSON(x)`; `JSON.parse(pretty)` deep-equals `JSON.parse(minify)` deep-equals original value |
| JSON errors + edges | same file | invalid JSON → throws `Error` w/ friendly message + (line,col); empty/number/string/null/nested/unicode; trailing comma rejected |
| YAML pretty + minify | same file | `formatYAML`/`minifyYAML` exact fixture(s); scalars, maps, sequences, nesting |
| YAML idempotency + round-trip | same file | `format(format(x))===format(x)`; `parseYAML(pretty)` deep-equals `parseYAML(minify)` (semantic parse-compare, since YAML formatting is opinionated) |
| YAML edges | same file | empty, comments (per policy), unicode, deep nesting, malformed → documented behavior (throw vs best-effort — assert what it DOES) |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read the JSON engine (~97-120), YAML engine (`parseYAML` ~946, `formatYAML` ~1271, `minifyYAML` ~1304),
and shared helpers (~32-70) FIRST to learn EXACT emitted output + error message shape + YAML's comment/
scalar policy. Then:
1. **Shared helpers** — direct exact-value tests (byteLength surrogate-aware; indentUnit mapping incl the
   bad→'  ' default; lineColFromOffset 1-based incl newline + clamp past end).
2. **JSON** — table of `{name, input, pretty, min}`; assert `formatJSON`/`minifyJSON` exact; idempotency;
   round-trip via `JSON.parse` deep-equality; `assert.throws` with a message regex for invalid input
   (and that it carries line/col); indent options (2/4/tab).
3. **YAML** — prefer SEMANTIC equality (parseYAML before/after deep-equals) for round-trip/idempotency
   since formatting is opinionated; PIN ≥1 exact pretty fixture + 1 exact minify fixture to catch
   formatter regressions. Cover scalars/maps/sequences/nesting/comments/unicode + malformed behavior.
Prefer parse/compare over brittle exact-string where opinionated, but ALWAYS pin ≥1 exact fixture per
language. An idempotency/round-trip that SHOULD hold but doesn't is a genuine lib bug → STOP and surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p10-ctpretty/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/formats/CtPretty.mjs` — the module (read JSON + YAML + shared-helper regions; confirm
  exact output + error shape + YAML comment/scalar policy FIRST).

## Deliverables
- `src/lib/tests/unit/CtPretty.json-yaml.test.mjs`.
- `findings/HANDOFF.md` — language-coverage matrix (JSON/YAML/shared → pretty✓/minify✓/idempotent✓/
  roundtrip✓/edge✓/fixture✓), the test count, command outputs, YAML's observed comment/malformed policy,
  what remains for 10b (HTML+CSS) and 10c (SQL+JS), and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output. Prefer semantic-equality
  where formatting is opinionated but pin ≥1 exact fixture per language. A genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the JSON/YAML/shared
coverage matrix, state YAML's observed comment/malformed policy, flag any suspected bug, and note what
remains for 10b/10c. Write it to `findings/HANDOFF.md`.
