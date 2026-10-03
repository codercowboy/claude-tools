# Pre-task receipt — Phase 11 · ctformat

Pre-task — ship round: CtFormat unit tests (p11-ctformat/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p11 PRD: CtFormat.test.mjs green; cover the 16 exports — FORMATS registry (id+label),
   parse/emit pairs for all 6 formats (JSON, CSV, TSV, YAML, .properties, XML), detectFormat(text),
   convert(text,from,to,opts). Per format: parse→canonical object + emit object→text with known fixtures;
   round-trip SEMANTIC equality (parse(emit(x)) deep-equals x) + ≥1 EXACT output fixture per format per
   direction; cross-conversions the API exposes (A→B equals expected B; A→B→A preserves data); type
   fidelity (numbers vs numeric strings, bool, null, nested, empty, unicode in keys+values); CSV/TSV
   specifics (quoting, embedded commas/quotes/newlines, header row, ragged rows); detectFormat correctness;
   malformed per format (throw vs error object — pin ACTUAL behavior); test-all + build-all 10/10; handoff
   format/conversion coverage matrix.
③ Paths — in: p11 PRD · src/lib/utils/formats/CtFormat.mjs (read) ·
   out: src/lib/tests/unit/CtFormat.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. HIGH-size (1095 lines, 6 formats) but repetitive —
TABLE-DRIVEN over a format registry, not ad-hoc. Prefer semantic (parse-and-compare) equality for
round-trips; pin exact-output for ≥1 direction per format. If the conversion matrix is genuinely too large
for thorough coverage in one round, STOP and propose a split by format family (e.g. 11a JSON/CSV/TSV, 11b
YAML/properties/XML) rather than thinning coverage. A round-trip that SHOULD hold but doesn't is a genuine
lib bug → STOP and surface. No lib edits.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
