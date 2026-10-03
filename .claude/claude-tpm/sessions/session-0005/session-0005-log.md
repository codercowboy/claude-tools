<!-- tpm-session: 0005 · 2026-10-03 · tpm-session-version: 1.0 · files: session-0005-handoff.md, session-0005-punchlist.md, session-0005-log.md -->
> **Session 0005 memory — three files in this folder.  THIS FILE: log.**
> • **session-0005-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0005-punchlist.md** — open/done work items (numbered).
> • **session-0005-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# SESSION 0005 — 2026-10-03 — (untitled)

## Decisions
- **Decided:** Run the 13-phase library unit-test epic autonomously (all phases) — User authorized full autonomous run at Gate B; stop only on an unresolvable blocker (verify<->fix cap 2) or a real lib bug a test surfaces  [2026-10-03T18:49:10-07:00]
- **Decided:** Fixed #1014 A-O directly this session (lib source edited under the ticket) — User authorized: 'queue the rest to fix, and you to fix all of them, we have the context headroom'. Flipped all 16 pinned todo/characterize tests; lib suite 1644 pass/0 todo; rebuilt 5 inlining tools; build-all 10/10; test-all 10/10. 2 O sub-items (DST gap-time, formatSQL blank-line) deliberately deferred as documented O.1/O.2.  [2026-10-04T09:40:45-07:00]

## Log
- [ADDED] #5.1 [0td0m5] library-test epic: 13 phases, serial ship rounds (sonnet), autonomous  [2026-10-03T18:54:54-07:00]
- [WIP] Epic init done; Phase 01 (harness) builder spawned on sonnet, running in background  [2026-10-03T18:54:55-07:00]
- [DONE] Phase 01 (harness) PASS — harness+crc32 exemplar green, mutation-verified, build 10/10; advancing to Phase 02  [2026-10-03T19:13:15-07:00]
- [DONE] Phase 02 (ctutil-pure) PASS — 47 CtUtil tests, 35/35 mutants killed; 2 lib quirks raised; advancing to P03  [2026-10-03T19:33:24-07:00]
- [DONE] Phase 03 (hashing) PASS — 38 tests, digests confirmed vs node:crypto, 10/10 mutants killed; lib suite 93/93; advancing to P04  [2026-10-03T19:53:11-07:00]
- [DONE] Phase 04 (encoding) PASS — 44 tests, lib suite 137/137, 19/20 mutants killed; advancing to P05  [2026-10-03T20:07:19-07:00]
- [DONE] Phase 05 (datetime) PASS — 73 tests all 28 members, 15/16 mutants killed, deterministic; lib suite 210/210; advancing to P06  [2026-10-03T20:21:36-07:00]
- [DONE] Phase 06 (zip) PASS — 29 tests, byte-level + round-trip, 30/36 mutants killed; lib 239/239; UTF-8-flag note raised; advancing to P07  [2026-10-03T20:31:57-07:00]
- [CLOSED] #5.1 [0td0m5] library-test epic: 13 phases, serial ship rounds (sonnet), autonomous  [2026-10-03T20:41:08-07:00]
- [ADDED] #5.2 [orck0w] library-test P01-P06 PASS (239 lib tests); P07 CtEscaper builder done (138 tests, lib 377/377), verifier IN-FLIGHT at save time — read its verdict file on resume  [2026-10-03T20:41:08-07:00]
- [ADDED] #5.3 [2d515v] Resume: reconcile P07 (verifier-r1-v1-verdict.md), then run P08 ctdiff -> P09 markdown -> P10 pretty(may split) -> P11 format -> P12 curl -> P13 image-pure  [2026-10-03T20:41:09-07:00]
- [ADDED] #5.4 [y95yw5] Epic-close after P13: full test-all+build-all sweep, update #1013 subtasks, file follow-on tickets for raised lib quirks (see 00-epic-plan/decisions.md), close epic  [2026-10-03T20:41:09-07:00]
- [CHECKPOINT] Session checkpoint at user request. Epic 20261003-library-test: P01-P06 PASS (239 lib unit tests, every phase mutation-verified, build-all 10/10 throughout); P07 CtEscaper builder done (138 tests, lib 377/377), verifier running in background at save time. Autonomous run authorized for all 13 phases (sonnet, verify-loop cap 2).  [2026-10-03T20:41:18-07:00]
- [CLOSED] #5.2 [orck0w] library-test P01-P06 PASS (239 lib tests); P07 CtEscaper builder done (138 tests, lib 377/377), verifier IN-FLIGHT at save time — read its verdict file on resume  [2026-10-03T20:46:38-07:00]
- [CLOSED] #5.3 [2d515v] Resume: reconcile P07 (verifier-r1-v1-verdict.md), then run P08 ctdiff -> P09 markdown -> P10 pretty(may split) -> P11 format -> P12 curl -> P13 image-pure  [2026-10-03T20:46:38-07:00]
- [ADDED] #5.5 [adc6al] P01-P07 PASS (377 lib unit tests, all mutation-verified, build-all 10/10). RESUME at P08: run p08-ctdiff -> p09-markdown -> p10-pretty(may split) -> p11-format -> p12-curl -> p13-image-pure, each a sonnet ship round per dev/20261003-library-test/execution-plan.md  [2026-10-03T20:46:38-07:00]
- [DONE] Phase 07 (ctescaper) PASS reconciled — 138 tests, all 39 no-op mutations caught; lib suite 377/377. Next phase on resume: P08 ctdiff.  [2026-10-03T20:46:39-07:00]
- [CLOSED] #5.5 [adc6al] P01-P07 PASS (377 lib unit tests, all mutation-verified, build-all 10/10). RESUME at P08: run p08-ctdiff -> p09-markdown -> p10-pretty(may split) -> p11-format -> p12-curl -> p13-image-pure, each a sonnet ship round per dev/20261003-library-test/execution-plan.md  [2026-10-04T01:20:36-07:00]
- [CLOSED] #5.4 [y95yw5] Epic-close after P13: full test-all+build-all sweep, update #1013 subtasks, file follow-on tickets for raised lib quirks (see 00-epic-plan/decisions.md), close epic  [2026-10-04T01:20:36-07:00]
- [DONE] EPIC COMPLETE (#1013 finished): library unit-test epic all 13 phases PASS. 1641 lib unit tests (1625 pass/0 fail/16 todo), build-all 10/10, test-all 9/10 (known color-picker #1012 e2e flake, unrelated). No src/lib source modified. 11 genuine lib bugs characterized via todo/pin tests -> follow-on ticket #1014. Cost: 36 subagents, ~2.55M tokens.  [2026-10-04T01:20:37-07:00]
- [ADDED] #5.6 [m1chau] #1014-A [HIGH] CtPretty.minifyJS regexAllowed(): regex as first token in template ${} — fix + flip 2 todo (CtPretty.sql-js.test.mjs)  [2026-10-04T09:00:52-07:00]
- [ADDED] #5.7 [rrhfhl] #1014-B [HIGH] CtPretty YAML quote-test: newline-in-scalar — fix + flip 2 todo (CtPretty.json-yaml.test.mjs)  [2026-10-04T09:00:52-07:00]
- [ADDED] #5.8 [l49nek] #1014-C+D [MED] \n-collapse family: CtMarkdown code-blocks + CtPretty format{HTML,CSS} rawText/comments — shared root-cause fix + flip (CtMarkdown.test.mjs, CtPretty.html-css.test.mjs)  [2026-10-04T09:00:52-07:00]
- [ADDED] #5.9 [le38p1] #1014-E [MED] CtCurl -d implicit x-www-form-urlencoded Content-Type across parse->generate — fix + flip (CtCurl.generate.test.mjs)  [2026-10-04T09:00:53-07:00]
- [ADDED] #5.10 [417fo9] #1014-F [MED] CtMarkdown opts ignored: data:image/svg+xml allow-by-default — honor opts + spec-correct default + flip (CtMarkdown.test.mjs)  [2026-10-04T09:04:37-07:00]
- [ADDED] #5.11 [m7sz9g] #1014-G [MED] CtPretty parseYAML silently drops over-indented content (vs under-indent throw) — fix + flip (CtPretty.json-yaml.test.mjs)  [2026-10-04T09:04:37-07:00]
- [ADDED] #5.12 [mwaefb] #1014-H [MED-LOW] CtDiff.toUnifiedDiff wrong hunk header at context:0 (-0,0) — fix + flip 2 todo (CtDiff.test.mjs)  [2026-10-04T09:04:38-07:00]
- [ADDED] #5.13 [egoc28] #1014-I [MED-LOW] CtCurl.fullUrl re-encodes #fragment as %23 query value — strip in splitUrlParams + flip (CtCurl.parse.test.mjs)  [2026-10-04T09:04:38-07:00]
- [ADDED] #5.14 [92gyoz] #1014-J [LOW] CtFormat CSV/TSV lose single-col empty trailing record — fix parseDelimited + emitCSV + flip 2 todo (CtFormat.test.mjs)  [2026-10-04T09:04:38-07:00]
- [ADDED] #5.15 [jeaynm] #1014-K [LOW] CtPretty.minifyCSS stray spaces by dropped comment + a{;;} keeps ; (non-idempotent) — fix + flip (CtPretty.html-css.test.mjs)  [2026-10-04T09:04:39-07:00]
- [ADDED] #5.16 [9rm5m3] #1014-L [LOW] CtCurl compat nits bundle: --url flag; wget -nv/-nc/-nH dead arms; --max-redirect=0 — fix + flip (CtCurl.parse.test.mjs)  [2026-10-04T09:04:39-07:00]
- [ADDED] #5.17 [et9sav] #1014-M [LOW] CtFormat.detectFormat mis-detects leading-[ / truncated JSON as csv — surface parse error for {/[ starts + flip (CtFormat.test.mjs)  [2026-10-04T09:04:39-07:00]
- [ADDED] #5.18 [kzr4at] #1014-N [LOW/latent] CtImageUtil.resizeRaw('move') misread as east handle — guard + flip (CtImageUtil.test.mjs)  [2026-10-04T09:04:39-07:00]
- [ADDED] #5.19 [3nppn5] #1014-O [LOW/doc] grab-bag quirks (CtUtil/CtDateTimeUtil/CtByteUtil/CtZipUtil/CtEscaper/CtPretty) — evaluate each, fix or document + flip  [2026-10-04T09:04:40-07:00]
- [CLOSED] #5.6 [m1chau] #1014-A [HIGH] CtPretty.minifyJS regexAllowed(): regex as first token in template ${} — fix + flip 2 todo (CtPretty.sql-js.test.mjs)  [2026-10-04T09:39:36-07:00]
- [CLOSED] #5.7 [rrhfhl] #1014-B [HIGH] CtPretty YAML quote-test: newline-in-scalar — fix + flip 2 todo (CtPretty.json-yaml.test.mjs)  [2026-10-04T09:39:36-07:00]
- [CLOSED] #5.8 [l49nek] #1014-C+D [MED] \n-collapse family: CtMarkdown code-blocks + CtPretty format{HTML,CSS} rawText/comments — shared root-cause fix + flip (CtMarkdown.test.mjs, CtPretty.html-css.test.mjs)  [2026-10-04T09:39:36-07:00]
- [CLOSED] #5.9 [le38p1] #1014-E [MED] CtCurl -d implicit x-www-form-urlencoded Content-Type across parse->generate — fix + flip (CtCurl.generate.test.mjs)  [2026-10-04T09:39:36-07:00]
- [CLOSED] #5.10 [417fo9] #1014-F [MED] CtMarkdown opts ignored: data:image/svg+xml allow-by-default — honor opts + spec-correct default + flip (CtMarkdown.test.mjs)  [2026-10-04T09:39:37-07:00]
- [CLOSED] #5.11 [m7sz9g] #1014-G [MED] CtPretty parseYAML silently drops over-indented content (vs under-indent throw) — fix + flip (CtPretty.json-yaml.test.mjs)  [2026-10-04T09:39:37-07:00]
- [CLOSED] #5.12 [mwaefb] #1014-H [MED-LOW] CtDiff.toUnifiedDiff wrong hunk header at context:0 (-0,0) — fix + flip 2 todo (CtDiff.test.mjs)  [2026-10-04T09:39:37-07:00]
- [CLOSED] #5.13 [egoc28] #1014-I [MED-LOW] CtCurl.fullUrl re-encodes #fragment as %23 query value — strip in splitUrlParams + flip (CtCurl.parse.test.mjs)  [2026-10-04T09:39:38-07:00]
- [CLOSED] #5.14 [92gyoz] #1014-J [LOW] CtFormat CSV/TSV lose single-col empty trailing record — fix parseDelimited + emitCSV + flip 2 todo (CtFormat.test.mjs)  [2026-10-04T09:39:38-07:00]
- [CLOSED] #5.15 [jeaynm] #1014-K [LOW] CtPretty.minifyCSS stray spaces by dropped comment + a{;;} keeps ; (non-idempotent) — fix + flip (CtPretty.html-css.test.mjs)  [2026-10-04T09:39:38-07:00]
- [CLOSED] #5.16 [9rm5m3] #1014-L [LOW] CtCurl compat nits bundle: --url flag; wget -nv/-nc/-nH dead arms; --max-redirect=0 — fix + flip (CtCurl.parse.test.mjs)  [2026-10-04T09:39:38-07:00]
- [CLOSED] #5.17 [et9sav] #1014-M [LOW] CtFormat.detectFormat mis-detects leading-[ / truncated JSON as csv — surface parse error for {/[ starts + flip (CtFormat.test.mjs)  [2026-10-04T09:39:39-07:00]
- [CLOSED] #5.18 [kzr4at] #1014-N [LOW/latent] CtImageUtil.resizeRaw('move') misread as east handle — guard + flip (CtImageUtil.test.mjs)  [2026-10-04T09:39:39-07:00]
- [CLOSED] #5.19 [3nppn5] #1014-O [LOW/doc] grab-bag quirks (CtUtil/CtDateTimeUtil/CtByteUtil/CtZipUtil/CtEscaper/CtPretty) — evaluate each, fix or document + flip  [2026-10-04T09:39:39-07:00]
- [DONE] #1014 fully fixed incl O.1 (DST gap forward-shift, per user) + O.2 (formatSQL blank-line); lib 1645 pass/0 todo; build-all + test-all 10/10; #1014 finished  [2026-10-04T10:07:01-07:00]

SEALED 2026-10-04
