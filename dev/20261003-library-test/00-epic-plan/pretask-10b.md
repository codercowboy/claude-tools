# Pre-task receipt — Phase 10b · ctpretty (HTML + CSS)

Pre-task — ship round: CtPretty HTML+CSS unit tests (p10-ctpretty/PRD.md; sub-round 2 of 3 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p10 PRD (this sub-round = HTML + CSS only): CtPretty.html-css.test.mjs green; HTML
   formatHTML(src,opts indent) + minifyHTML — pretty↔minify, idempotency, round-trip (semantic — parse/
   normalize equivalence), void elements, inline-vs-block whitespace, rawText (script/style/pre), comment
   policy (IE-conditional/bang kept on minify, others dropped), doctype, attributes, edges (empty/
   malformed/unclosed/unicode); CSS formatCSS(src,opts indent) + minifyCSS — pretty↔minify, idempotency,
   round-trip, string/comment/url()-awareness, nesting (@media), blank-line-between-rules, edges; ≥1 EXACT
   fixture per language; test-all + build-all 10/10; handoff HTML/CSS coverage matrix + what remains (10c).
③ Paths — in: p10 PRD · src/lib/utils/formats/CtPretty.mjs (read; CSS ~321-430, HTML ~790-905) ·
   out: src/lib/tests/unit/CtPretty.html-css.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Prefer semantic-equality where formatting is
opinionated, but PIN ≥1 exact fixture per language to catch regressions. A round-trip/idempotency that
SHOULD hold but doesn't is a genuine lib bug → STOP and surface. No lib edits. Cover HTML+CSS ONLY
(JSON/YAML done in 10a; SQL/JS are 10c).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P10 split into 10a/10b/10c is the orchestrator's Gate-A call, which the p10 PRD explicitly delegates.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
