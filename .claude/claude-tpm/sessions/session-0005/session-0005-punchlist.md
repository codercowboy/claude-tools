<!-- tpm-session: 0005 · 2026-10-04 · tpm-session-version: 1.0 · files: session-0005-handoff.md, session-0005-punchlist.md, session-0005-log.md -->
> **Session 0005 memory — three files in this folder.  THIS FILE: punchlist.**
> • **session-0005-handoff.md** — READ FIRST: where we are, next action, what NOT to redo.
> • **session-0005-punchlist.md** — open/done work items (numbered).
> • **session-0005-log.md** — append-only ledger: Decisions + Log (log reads **bottom-to-top**).

# Punchlist — session 0005 — 2026-10-03

## Open
_No open items._

## Done
- [x] #5.1 · library-test epic: 13 phases, serial ship rounds (sonnet), autonomous  [0td0m5, 2026-10-03T18:54:54-07:00] (closed 2026-10-03T20:41:08-07:00)
- [x] #5.2 · library-test P01-P06 PASS (239 lib tests); P07 CtEscaper builder done (138 tests, lib 377/377), verifier IN-FLIGHT at save time — read its verdict file on resume  [orck0w, 2026-10-03T20:41:08-07:00] (closed 2026-10-03T20:46:38-07:00)
- [x] #5.3 · Resume: reconcile P07 (verifier-r1-v1-verdict.md), then run P08 ctdiff -> P09 markdown -> P10 pretty(may split) -> P11 format -> P12 curl -> P13 image-pure  [2d515v, 2026-10-03T20:41:09-07:00] (closed 2026-10-03T20:46:38-07:00)
- [x] #5.4 · Epic-close after P13: full test-all+build-all sweep, update #1013 subtasks, file follow-on tickets for raised lib quirks (see 00-epic-plan/decisions.md), close epic  [y95yw5, 2026-10-03T20:41:09-07:00] (closed 2026-10-04T01:20:36-07:00)
- [x] #5.5 · P01-P07 PASS (377 lib unit tests, all mutation-verified, build-all 10/10). RESUME at P08: run p08-ctdiff -> p09-markdown -> p10-pretty(may split) -> p11-format -> p12-curl -> p13-image-pure, each a sonnet ship round per dev/20261003-library-test/execution-plan.md  [adc6al, 2026-10-03T20:46:38-07:00] (closed 2026-10-04T01:20:36-07:00)
- [x] #5.6 · #1014-A [HIGH] CtPretty.minifyJS regexAllowed(): regex as first token in template ${} — fix + flip 2 todo (CtPretty.sql-js.test.mjs)  [m1chau, 2026-10-04T09:00:52-07:00] (closed 2026-10-04T09:39:36-07:00)
- [x] #5.7 · #1014-B [HIGH] CtPretty YAML quote-test: newline-in-scalar — fix + flip 2 todo (CtPretty.json-yaml.test.mjs)  [rrhfhl, 2026-10-04T09:00:52-07:00] (closed 2026-10-04T09:39:36-07:00)
- [x] #5.8 · #1014-C+D [MED] \n-collapse family: CtMarkdown code-blocks + CtPretty format{HTML,CSS} rawText/comments — shared root-cause fix + flip (CtMarkdown.test.mjs, CtPretty.html-css.test.mjs)  [l49nek, 2026-10-04T09:00:52-07:00] (closed 2026-10-04T09:39:36-07:00)
- [x] #5.9 · #1014-E [MED] CtCurl -d implicit x-www-form-urlencoded Content-Type across parse->generate — fix + flip (CtCurl.generate.test.mjs)  [le38p1, 2026-10-04T09:00:53-07:00] (closed 2026-10-04T09:39:36-07:00)
- [x] #5.10 · #1014-F [MED] CtMarkdown opts ignored: data:image/svg+xml allow-by-default — honor opts + spec-correct default + flip (CtMarkdown.test.mjs)  [417fo9, 2026-10-04T09:04:37-07:00] (closed 2026-10-04T09:39:37-07:00)
- [x] #5.11 · #1014-G [MED] CtPretty parseYAML silently drops over-indented content (vs under-indent throw) — fix + flip (CtPretty.json-yaml.test.mjs)  [m7sz9g, 2026-10-04T09:04:37-07:00] (closed 2026-10-04T09:39:37-07:00)
- [x] #5.12 · #1014-H [MED-LOW] CtDiff.toUnifiedDiff wrong hunk header at context:0 (-0,0) — fix + flip 2 todo (CtDiff.test.mjs)  [mwaefb, 2026-10-04T09:04:38-07:00] (closed 2026-10-04T09:39:37-07:00)
- [x] #5.13 · #1014-I [MED-LOW] CtCurl.fullUrl re-encodes #fragment as %23 query value — strip in splitUrlParams + flip (CtCurl.parse.test.mjs)  [egoc28, 2026-10-04T09:04:38-07:00] (closed 2026-10-04T09:39:38-07:00)
- [x] #5.14 · #1014-J [LOW] CtFormat CSV/TSV lose single-col empty trailing record — fix parseDelimited + emitCSV + flip 2 todo (CtFormat.test.mjs)  [92gyoz, 2026-10-04T09:04:38-07:00] (closed 2026-10-04T09:39:38-07:00)
- [x] #5.15 · #1014-K [LOW] CtPretty.minifyCSS stray spaces by dropped comment + a{;;} keeps ; (non-idempotent) — fix + flip (CtPretty.html-css.test.mjs)  [jeaynm, 2026-10-04T09:04:38-07:00] (closed 2026-10-04T09:39:38-07:00)
- [x] #5.16 · #1014-L [LOW] CtCurl compat nits bundle: --url flag; wget -nv/-nc/-nH dead arms; --max-redirect=0 — fix + flip (CtCurl.parse.test.mjs)  [9rm5m3, 2026-10-04T09:04:39-07:00] (closed 2026-10-04T09:39:38-07:00)
- [x] #5.17 · #1014-M [LOW] CtFormat.detectFormat mis-detects leading-[ / truncated JSON as csv — surface parse error for {/[ starts + flip (CtFormat.test.mjs)  [et9sav, 2026-10-04T09:04:39-07:00] (closed 2026-10-04T09:39:39-07:00)
- [x] #5.18 · #1014-N [LOW/latent] CtImageUtil.resizeRaw('move') misread as east handle — guard + flip (CtImageUtil.test.mjs)  [kzr4at, 2026-10-04T09:04:39-07:00] (closed 2026-10-04T09:39:39-07:00)
- [x] #5.19 · #1014-O [LOW/doc] grab-bag quirks (CtUtil/CtDateTimeUtil/CtByteUtil/CtZipUtil/CtEscaper/CtPretty) — evaluate each, fix or document + flip  [3nppn5, 2026-10-04T09:04:40-07:00] (closed 2026-10-04T09:39:39-07:00)
