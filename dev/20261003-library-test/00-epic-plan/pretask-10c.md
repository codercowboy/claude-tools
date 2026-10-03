# Pre-task receipt — Phase 10c · ctpretty (SQL + JS)

Pre-task — ship round: CtPretty SQL+JS unit tests (p10-ctpretty/PRD.md; sub-round 3 of 3 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p10 PRD (this sub-round = SQL + JS only; both are PRETTY + SAFE-MINIFY-only engines):
   CtPretty.sql-js.test.mjs green; SQL tokenizeSQL (typed token stream: ws/lineComment(--)/blockComment/
   string/keyword/ident/number/punct) + formatSQL(opts) (keyword casing, clause newlines, indent) +
   minifySQL — token-stream equivalence (significant tokens preserved), pretty exact fixture, minify
   semantic equivalence, idempotency, strings/comments/identifiers not mangled, edges; JS tokenizeJS
   (regex-vs-division disambiguation, template literals, nested braces, all punctuators) + formatJS(opts) +
   minifyJS (SAFE: strips comments + insignificant ws ONLY — never renames/rewrites, never joins across an
   existing newline, string/regex/template aware) — token-stream equivalence, pretty exact fixture, minify
   preserves semantics verbatim (ASI-safety: no newline-joining), idempotency, edges; ≥1 EXACT fixture per
   language; test-all + build-all 10/10; handoff SQL/JS coverage matrix (COMPLETES the P10 CtPretty split).
③ Paths — in: p10 PRD · src/lib/utils/formats/CtPretty.mjs (read; SQL ~395-700, JS ~1320-1796) ·
   out: src/lib/tests/unit/CtPretty.sql-js.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. These engines' OVERRIDING invariant is semantic
equivalence (minify must NOT change meaning — assert token-stream / regex / template / string fidelity,
not brittle whole-string). PIN ≥1 exact fixture per language. A minify that CHANGES SEMANTICS (joins
across a newline breaking ASI, mangles a string/regex, renames) is a genuine bug → STOP and surface. No
lib edits. Cover SQL+JS ONLY (JSON/YAML=10a, HTML/CSS=10b done).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P10 split into 10a/10b/10c is the orchestrator's Gate-A call, which the p10 PRD explicitly delegates.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
