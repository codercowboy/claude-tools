# Pre-task receipt — Phase 10a · ctpretty (JSON + YAML + shared helpers)

Pre-task — ship round: CtPretty JSON+YAML unit tests (p10-ctpretty/PRD.md; sub-round 1 of 3 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p10 PRD (this sub-round = JSON + YAML + the 3 shared helpers): CtPretty.json-yaml.test.mjs
   green; shared helpers byteLength (UTF-8 bytes, surrogate-aware), indentUnit (number/'tab'/'\t'→unit,
   default 2sp), lineColFromOffset (1-based line/col) tested exactly; JSON formatJSON (indent opt incl
   tab, default 2) + minifyJSON — pretty↔minify, idempotency, round-trip (JSON.parse equality), friendly
   error (invalid→throw with line/col), edges (empty/number/string/nested/unicode/trailing-comma reject);
   YAML parseYAML + formatYAML + minifyYAML — pretty+minify+idempotency+round-trip(semantic parse-compare)
   + edges; ≥1 EXACT fixture per language; test-all + build-all 10/10; handoff language-coverage matrix +
   what remains for 10b/10c.
③ Paths — in: p10 PRD · src/lib/utils/formats/CtPretty.mjs (read; JSON ~97-120, YAML ~946-1330, shared
   ~32-70) · out: src/lib/tests/unit/CtPretty.json-yaml.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Prefer semantic-equality (parse/compare) over brittle
exact-string where formatting is opinionated, but PIN ≥1 exact fixture per language to catch regressions.
A round-trip/idempotency that SHOULD hold but doesn't is a genuine lib bug → STOP and surface. No lib edits.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P10 split into 10a/10b/10c is the orchestrator's Gate-A call, which the p10 PRD explicitly delegates.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
