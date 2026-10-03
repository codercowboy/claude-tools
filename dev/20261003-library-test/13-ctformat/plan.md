# Plan — 13-ctformat (Phase 11: CtFormat)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test `src/lib/utils/formats/CtFormat.mjs` (1095 lines; structured-data format-conversion engine,
DOM-free). Public API (confirmed `export { ... }`, 16 entries): `FORMATS` (registry of {id,label} for
json/csv/tsv/yaml/properties/xml), six parse/emit pairs — `parseJSON`/`emitJSON`, `parseYAML`/`emitYAML`,
`parseCSV`/`emitCSV`, `parseTSV`/`emitTSV`, `parseProperties`/`emitProperties`, `parseXML`/`emitXML`,
`detectFormat(text)` (auto-detect source format), and `convert(text, from, to, opts)` (registry-driven
round-trip). Each `parse<Fmt>(text,opts)` → plain JS value; each `emit<Fmt>(model,opts)` → text. YAML/XML
are documented-subset hand-written parsers. Full spec: `dev/20261003-library-test/p11-ctformat/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| FORMATS registry consistent | `src/lib/tests/unit/CtFormat.test.mjs` | every FORMATS entry has id+label; the 6 ids match the parse/emit pairs + PARSERS/EMITTERS registry convert() uses |
| Each format parse→object | same file | `parse<Fmt>` on a known fixture → the expected canonical object (all 6 formats) |
| Each format emit object→text | same file | `emit<Fmt>` on a known object → the expected exact text (≥1 exact fixture per format) |
| Round-trip semantic equality | same file | `parse<Fmt>(emit<Fmt>(x))` deep-equals `x` over a battery per format |
| Cross-conversions | same file | `convert(fixture, A, B)` equals expected B; `convert(convert(x,A,B),B,A)` preserves data (semantic) for the pairs the API supports |
| Type fidelity | same file | numbers vs numeric strings, booleans, null, nested objects/arrays, empty object/array, unicode in keys+values — asserted per format that supports them |
| CSV/TSV specifics | same file | quoting, embedded comma/quote/newline, header row, ragged rows; tab delimiter for TSV |
| detectFormat | same file | each format's representative text auto-detects to the right id; ambiguous/empty → documented result |
| Malformed per format | same file | invalid input → the ACTUAL failure mode (throw vs error object) pinned per format |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtFormat.mjs` to confirm the EXACT export names, each parser's canonical-object shape, each
emitter's exact output, the PARSERS/EMITTERS registry + `convert` signature, `detectFormat`'s heuristics,
and each format's malformed behavior FIRST. Assert what the lib ACTUALLY does. Then, TABLE-DRIVEN over a
format registry `[{id, sampleText, sampleModel, parse, emit}]`:
1. **Per-format parse** — `parse<Fmt>(sampleText)` deep-equals `sampleModel`.
2. **Per-format emit** — `emit<Fmt>(sampleModel)` equals an exact expected text fixture.
3. **Round-trip** — `parse<Fmt>(emit<Fmt>(model))` deep-equals `model` (semantic) over a battery.
4. **convert + detectFormat** — the cross-conversions the API supports (JSON↔YAML, CSV↔JSON, etc.):
   `convert(text,from,to)` equals expected; A→B→A preserves data; `detectFormat` on each sample → right id.
5. **Type fidelity + CSV/TSV specifics + malformed** — per the DoD table; pin the ACTUAL throw/error shape.
Prefer semantic (parse-and-compare) equality for round-trips; pin exact-output for ≥1 direction per format.
A round-trip that SHOULD hold but doesn't is a genuine lib bug → STOP and surface. If the matrix is
genuinely too large for thorough coverage in one round, STOP and propose a split by format family
(11a JSON/CSV/TSV, 11b YAML/properties/XML) rather than thinning coverage.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p11-ctformat/PRD.md` — scope/DoD + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` (e.g. the CtPretty json-yaml sibling) — the pattern to copy.
- `src/lib/utils/formats/CtFormat.mjs` — the module under test (confirm exports + canonical shapes +
  convert/detectFormat + malformed policy FIRST).

## Deliverables
- `src/lib/tests/unit/CtFormat.test.mjs`.
- `findings/HANDOFF.md` — the format/conversion coverage matrix (format → parse✓/emit✓/roundtrip✓/
  fixture✓; which convert pairs tested; detectFormat✓), the test count, command outputs, the observed
  malformed policy per format, what (if anything) is deferred + why, and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output. Prefer semantic equality
  for round-trips but pin ≥1 exact fixture per format per direction. A genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtFormat.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h (HIGH size — split by format family rather than ship shallow if needed).

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the format/conversion
coverage matrix, state the observed malformed policy, flag any suspected bug, and note anything deferred.
Write it to `findings/HANDOFF.md`.
