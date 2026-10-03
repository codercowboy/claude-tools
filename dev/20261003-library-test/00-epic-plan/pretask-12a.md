# Pre-task receipt — Phase 12a · ctcurl (parse side)

Pre-task — ship round: CtCurl parse-side unit tests (p12-ctcurl/PRD.md; sub-round 1 of 2 per the split)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p12 PRD (this sub-round = PARSE side): CtCurl.parse.test.mjs green; cover tokenizeShell,
   parseCurl, parseWget + model/URL/encoding helpers (emptyModel, normalizeModel, modelWithoutSecrets,
   splitUrlParams, applyUrlParams, fullUrl, safeDecode, utf8ToBase64, base64ToUtf8, basicHeaderValue,
   decodeBasic, parseFormPairs) + constants (METHODS, AUTH_TYPES, BODY_TYPES). tokenizeShell: single/
   double quotes, escapes, line continuations `\`, combined short clusters. parseCurl: -X/--request,
   -H/--header (repeated), -d/--data/--data-raw/--data-urlencode, -F multipart, -u basic auth, --url vs
   positional, -G (data→query), method inference (GET default / POST when data / -G forces GET), query
   parsing, flags in any order; ≥2 real-world curl one-liners → expected model. parseWget: supported
   subset → model. Model returned as `{...model, notes}` (TOTAL — never throws; best-effort + notes).
   Malformed (empty, unknown flags, missing URL, header w/o colon, dup headers) → pin ACTUAL behavior.
   test-all + build-all 10/10; handoff flags-parsed coverage matrix + what remains (12b generators).
③ Paths — in: p12 PRD · src/lib/utils/formats/CtCurl.mjs (read; model ~36-215, tokenizeShell ~215,
   parseCurl ~409, parseWget ~580) · out: src/lib/tests/unit/CtCurl.parse.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. Use REAL curl one-liners as fixtures (high signal).
Every fn is TOTAL (best-effort + note, never throws) — assert the ACTUAL model + notes, not an idealized
parse. A parse that is clearly WRONG (not just lossy) is a genuine bug → STOP and surface. No lib edits.
Cover PARSE side ONLY (builders + 6 generators + output helpers = 12b).

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).
P12 split into 12a/12b is the orchestrator's Gate-A call, which the p12 PRD explicitly endorses.

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
