# Cost ledger

One row per spawned subagent, written by the orchestrator at teardown from the completion
notification's usage figures. `tokens` is authoritative (the subagent can't introspect its own);
`calls` is the subagent-observable cross-check. Append-only — run `tpm-workflow-cost-ledger.js --summary` for totals.

| Date | Round / phase | Agent | Role | Model | Tokens | Calls | Verdict | Notes |
|------|---------------|-------|------|-------|-------:|------:|---------|-------|
| 2026-10-03 | 1 | builder-r1 | builder | sonnet | 51,352 | 10 | pass |  |
| 2026-10-03 | 1 | verifier-r1-v1 | verifier | sonnet | 43,523 | 8 | pass |  |
| 2026-10-03 | 1 | builder-r1 | builder | sonnet | 55,917 | 14 | pending |  |
| 2026-10-03 | 1 | p02-verifier-r1-v1 | verifier | sonnet | 44,000 | 12 | pass |  |
| 2026-10-03 | 1 | p03-builder-r1 | builder | sonnet | 68,437 | 17 | pass |  |
| 2026-10-03 | 1 | p03-verifier-r1-v1 | verifier | sonnet | 63,574 | 20 | pass |  |
| 2026-10-03 | 1 | p04-builder-r1 | builder | sonnet | 60,099 | 13 | pass |  |
| 2026-10-03 | 1 | p04-verifier-r1-v1 | verifier | sonnet | 64,849 | 10 | pass |  |
| 2026-10-03 | 1 | p05-builder-r1 | builder | sonnet | 77,224 | 8 | pass |  |
| 2026-10-03 | 1 | p05-verifier-r1-v1 | verifier | sonnet | 88,938 | 25 | pass |  |
| 2026-10-03 | 1 | p06-builder-r1 | builder | sonnet | 46,705 | 6 | pass |  |
| 2026-10-03 | 1 | p06-verifier-r1-v1 | verifier | sonnet | 59,421 | 12 | pass |  |
| 2026-10-03 | 1 | p07-builder-r1 | builder | sonnet | 59,606 | 12 | pass |  |
| 2026-10-03 | 1 | p07-verifier-r1-v1 | verifier | sonnet | 65,463 | 21 | pass |  |
| 2026-10-03 |  | p08-builder-r1 | builder | sonnet | 66,918 | 17 | pass | CtDiff 68 tests; stop-and-surfaced toUnifiedDiff bug via 2 todo |
| 2026-10-03 |  | p08-verifier-r1-v1 | verifier | sonnet | 61,993 | 15 | pass | 17/17 mutants killed; adjudicated bug genuine vs GNU diff -U0 |
| 2026-10-03 |  | p09-builder-r1 | builder | sonnet | 78,267 | 12 | pass | CtMarkdown 177 tests; surfaced code-block data-loss + opts/svg drift |
| 2026-10-03 |  | p09-verifier-r1-v1 | verifier | sonnet | 85,944 | 17 | pass | 45/46 mutants; adjudicated (a) bug (b) drift raise, (c) conformant |
| 2026-10-03 |  | p10a-builder-r1 | builder | sonnet | 66,034 | 10 | pass | CtPretty JSON+YAML 90 tests; surfaced YAML newline bug |
| 2026-10-03 |  | p10a-verifier-r1-v1 | verifier | sonnet | 61,087 | 15 | pass | 26/28 mutants; adjudicated YAML newline HIGH + over-indent MED |
| 2026-10-03 |  | p10b-builder-r1 | builder | sonnet | 85,358 | 19 | pass | CtPretty HTML+CSS 203 tests; surfaced minifyCSS + formatHTML newline bugs |
| 2026-10-03 |  | p10b-verifier-r1-v1 | verifier | sonnet | 79,070 | 19 | pass | mutation-killed 5 core areas; (a) LOW (b) MED, \n-collapse family broader |
| 2026-10-03 |  | p10c-builder-r1 | builder | sonnet | 97,513 | 29 | pass | CtPretty SQL+JS 89 tests; surfaced BUG-1 regex-in-template minify semantic change |
| 2026-10-03 |  | p10c-verifier-r1-v1 | verifier | sonnet | 80,459 | 23 | pass | 5 mutation families killed; BUG-1 confirmed semantic change + code loss, HIGH |
| 2026-10-04 |  | p11-builder-r1 | builder | sonnet | 93,911 | 17 | pass | CtFormat 219 tests 6 formats; surfaced CSV empty-trailing-record loss |
| 2026-10-04 |  | p11-verifier-r1-v1 | verifier | sonnet | 60,207 | 17 | pass | 32/33 mutants; (a) CSV loss LOW-MED (b) detectFormat UX nit (c) lossy OK |
| 2026-10-04 |  | p12a-builder-r1 | builder | sonnet | 88,291 | 14 | pass | CtCurl parse 256 tests; --url/-nv/#fragment pins |
| 2026-10-04 |  | p12a-verifier-r1-v1 | verifier | sonnet | 77,659 | 17 | pass | 27/28 mutants; one-liners vs real curl 8.7.1; #fragment MED-LOW raise |
| 2026-10-04 |  | p12b-builder-r1 | builder | sonnet | 75,801 | 17 | pass | CtCurl generate 40 tests 6 langs; raw-body content-type quirk |
| 2026-10-04 |  | p12b-verifier-r1-v1 | verifier | sonnet | 73,883 | 20 | pass | 75 mutations 0 survivors; raw -d Content-Type MED fidelity bug raise |
| 2026-10-04 |  | p13a-verifier-r1-v1 | verifier | sonnet | 83,361 | 22 | fail | oracle independent; PDF 22/22 killed; FAIL: CtDither weights unpinned (gray-128 only) |
| 2026-10-04 |  | p13a-builder-r2-fixer | builder | sonnet | 69,762 | 18 | pass | fix: CtDither 26→33 weight-sensitive cases; 4 targeted + 9 mutants now killed |
| 2026-10-04 |  | p13a-builder-r1 | builder | sonnet | 77,518 | 16 | pass | CtDither 26 + CtImagesToPdf 38 hand-computed; PDF byte structure |
| 2026-10-04 |  | p13a-verifier-r2-v1 | verifier | sonnet | 66,794 | 19 | pass | re-verify: all 6 r1 mutants now killed, literals independently re-derived — gap closed |
| 2026-10-04 |  | p13b-builder-r1 | builder | sonnet | 73,955 | 12 | pass | CtImageUtil 51 tests, 28 pure exports; 3 DOM fns deferred |
| 2026-10-04 |  | p13b-verifier-r1-v1 | verifier | sonnet | 97,011 | 18 | pass | 41/45 mutants; every limit >→>= flip killed; hand-derivations match — EPIC COMPLETE |
