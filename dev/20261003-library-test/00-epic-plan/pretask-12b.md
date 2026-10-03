# Pre-task receipt — Phase 12b · ctcurl (generate side)

Pre-task — ship round: CtCurl generate-side unit tests (p12-ctcurl/PRD.md; sub-round 2 of 2 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p12 PRD (this sub-round = GENERATE side; COMPLETES P12): CtCurl.generate.test.mjs green; cover
   buildCurl, buildWget, the 6 generators toFetch/toNode/toPython/toHttpie/toPowerShell/toGo, convert,
   CONVERT_LANGS, and output helpers shellQuote, jsStr, pyStr, goStr, psStr, resolvedHeaders,
   contentTypeForBody, hasBody, encodeForm. Per generator: a known request model → ≥1 EXACT snippet
   (pick ~2 languages for exact, structural asserts for the rest — method/url/headers/body/auth all
   represented). buildCurl/buildWget exact for a known model. ROUND-TRIP: parse(buildCurl(model)) ≈ model
   (semantic). convert dispatches per CONVERT_LANGS (+ default). Quoting helpers exact per language. CARRY-
   FORWARD from 12a: curl `-d` default Content-Type application/x-www-form-urlencoded MUST be reflected by
   resolvedHeaders/contentTypeForBody and survive round-trip. Edges/malformed (empty model, no-body,
   multipart, auth) → ACTUAL output (TOTAL — never throws). test-all + build-all 10/10; handoff generator
   coverage matrix.
③ Paths — in: p12 PRD · src/lib/utils/formats/CtCurl.mjs (read; helpers ~680-725, buildCurl ~727,
   buildWget ~792, generators ~868-1077, convert ~1077) · out: src/lib/tests/unit/CtCurl.generate.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Pin EXACT snippets for ≥1-2 languages; structural asserts
fine for the rest (headers/body/method/auth represented). Round-trip is semantic (parse∘build≈model). A
generator that DROPS or CORRUPTS a modeled field (lost header/body/auth, wrong method) is a genuine bug →
STOP and surface. No lib edits. Cover GENERATE side ONLY (parse side done in 12a).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P12 split into 12a/12b is the orchestrator's Gate-A call, which the p12 PRD explicitly endorses.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
