# Decisions

> Human + orchestrator decisions across phases. Doubles as the raise-to-user
> queue. CHARTER-CLEAN (subagents read this file): record WHAT was decided, not how a phase is approached.

## Log
- **Phase 01 (harness) — PASS** — 2026-10-03. Builder (sonnet) stood up `src/lib/tests/unit/`, the
  crc32 exemplar (8 tests, real IEEE vectors), the `scripts/test-all.mjs` lib step (SKIP_RELDIRS intact),
  `package.json` `test:lib`, and `src/lib/tests/README.md`. Verifier (sonnet) independently re-ran
  (8/8 green, build-all 10/10) AND mutation-tested the vectors on a scratch copy (polynomial/init/`>>>0`
  mutations each turned tests red → asserts genuinely exercise logic). crc32 is OWNED by Phase 01 →
  Phase 03 covers md5/sha1/sha256/sha512/hmac only. No bug-fixer kickback (concerns, not FAILs).
- **crc32 ownership** — crc32 + crc32Hex are covered in Phase 01; Phase 03 must NOT duplicate them.

## Log (cont.)
- **Phase 02 (ctutil-pure) — PASS** — 2026-10-03. Builder (sonnet) authored `CtUtil.test.mjs`: 47 tests
  over clamp/num/clampInt/escapeHtml/escapeAttr/slugify/wrapText + debounce (mock timers) + the CtUtil
  aggregator; 8 DOM/BOM fns deferred (17 exports total, inventory in handoff). Verifier (sonnet) re-ran
  55/55 green, build-all 10/10, test-all 10/10 on re-run (confirming the 9/10 was the known e2e flake),
  and killed 35/35 mutants on a scratch copy — no can't-fail asserts. No bug-fixer kickback.

## Log (cont. 2)
- **Phase 03 (ctbyteutil-hashing) — PASS** — 2026-10-03. Builder (sonnet) authored
  `CtByteUtil.hashing.test.mjs`: 38 tests over md5/sha1/sha256/sha512/hmac with RFC 1321 / FIPS 180 /
  RFC 2202 / RFC 4231 known-answer vectors + the 1M-'a' vector; crc32 skipped (P01 owns it). API confirmed:
  hashes take BYTES, return raw Uint8Array. Verifier (sonnet) confirmed 93/93 lib tests, build-all 10/10,
  test-all 10/10 (color flake only), and — decisively — re-ran all 38 tests against a `node:crypto` shim
  (every expected digest matches an implementation independent of CtByteUtil) and killed 10/10 mutations.
  No lib bug, no kickback. Lib unit tests now total 93 (8 crc32 + 47 CtUtil + 38 hashing).
- **Phase 03 coverage concerns (deferred, not blocking):** padding-boundary test (55–129B) checks only
  length/distinctness, not exact digests; no test pins string-input-to-hash behavior; mutation covered
  constants/ipad/opad/long-key, not round internals. Note for a possible hardening pass later.

## Log (cont. 3)
- **Phase 04 (ctbyteutil-encoding) — PASS** — 2026-10-03. Builder (sonnet) authored
  `CtByteUtil.encoding.test.mjs`: 44 tests over bytesToBase64/base64UrlToBytes/utf8ToBase64/textToBytes/
  bytesToHex/formatBytes(#1008 NEW format, all opts)/getRandomBytes/makeId + aggregator. Verifier (sonnet)
  confirmed 137/137 lib tests, build-all 10/10, test-all 10/10, independently recomputed base64/hex pairs,
  killed 19/20 mutants (lone survivor: getRandomBytes chunk-stride 65536→65537 — minor gap). All
  characterized edges defensible; no bug-fixer kickback. Lib unit tests now total 137.
- **Phase 04 minor note (optional, lib-side, deferred):** `CtByteUtil.mjs` header says a non-finite
  formatBytes arg "formats as '0 B'", but only NaN does — `Infinity`→"Infinity GB" (the `invalid` opt is
  the intended guard). Low-severity DOC inaccuracy, not a functional bug; optional one-line header fix at
  the user's discretion (not done — test-only epic). Coverage gap noted: getRandomBytes chunk-boundary
  test only checks the last 64 bytes aren't all-zero.

## Log (cont. 4)
- **Phase 05 (ctdatetimeutil) — PASS** — 2026-10-03. Builder (sonnet) covered the FULL surface in one
  round (no split): `CtDateTimeUtil.test.mjs` 73 tests over all 28 statics + formatDuration/humanizeDuration,
  fixed epoch instants + explicit tz. Verifier (sonnet) confirmed 210/210 lib tests, build-all 10/10,
  determinism stable under 3 foreign TZ + de_DE locale, recomputed vectors in Python zoneinfo, killed 15/16
  mutants (survivor = equivalent mutant). No bug-fixer kickback. Lib unit tests now total 210.
- **Phase 05 coverage gap (deferred):** `formatInZone`'s `locale` option is effectively untested — the
  only non-en assertion (de-DE '17:30') renders identically in en-US. A locale-sensitive case
  (`month:'long'`) would pin it. Note for a hardening pass.

## Log (cont. 5)
- **Phase 06 (ctziputil) — PASS** — 2026-10-03. Builder (sonnet) authored `CtZipUtil.test.mjs`: 29 tests
  over u16le/u32le (exact LE bytes) + storeZip (all PK signatures, EOCD, every header field, per-entry CRC
  vs crc32, offsets), edge cases (single/multi/empty/empty-archive/binary/unicode-name/70KB), two round-trip
  proofs (independent central-dir parser + system unzip). Verifier (sonnet) confirmed 239/239, build-all
  10/10, test-all 10/10, built+validated an independent zip (unzip + Python zipfile), killed 30/36 mutants
  (3 equivalent survivors). No bug-fixer kickback. Lib unit tests now total 239.
- **Phase 06 coverage gap (deferred):** central-header disk-start (off 34) / internal-attrs (36) /
  external-attrs (38) not asserted; Zip64 unhandled+untested (module doesn't claim it — acceptable).

## Log (cont. 6)
- **Phase 07 (ctescaper) — PASS** — 2026-10-03. Builder (sonnet) authored `CtEscaper.test.mjs`: 138 tests,
  all 19 escape/unescape context pairs (round-trip over a shared 19-input battery INCL ≥2 exact known-output
  fixtures each — not round-trip-only), + metadata (CONTEXTS/CONTEXTS_BY_ID/DEFAULT_ENABLED) + nest +
  escapeFilename. Verifier (sonnet) confirmed 377/377 lib tests, build-all 10/10; decisively, no-op mutations
  of ALL 19 escapers + 19 unescapers + escapeFilename each went red, and 6 fixtures independently matched
  Buffer/JSON.stringify/encodeURIComponent/RFC4180/entity refs. No bug-fixer kickback. Lib unit tests now 377.
- **Phase 07 process note (not a test defect):** the P07 verifier reported it did NOT read the subagent
  base-chain methodology docs (only charter/plan/HANDOFF). Its verdict stands on strong direct evidence
  (full no-op mutation sweep + independent fixtures), so accepted — but future verifier prompts should
  re-emphasize the step-zero reads land. Lossy items (filename one-way, no reserved-name handling, URL
  URIError on lone surrogates, unescapeShSingle needs quoted form) all defensible; `escapeFilename` reserved
  names passing through (CON→con) flagged as a possible PRODUCT gap, not a test bug.

## Log (cont. 7)
- **Phase 08 (ctdiff) — PASS** — 2026-10-03. Builder (sonnet) authored `CtDiff.test.mjs`: 68 tests over
  all 7 exports (splitLines/normalizeLine/myersDiff/diffLines/tokenizeWords/diffWords/toUnifiedDiff) —
  hand-derived myersDiff op sequences + the Myers-paper D=5 example, pinned diffLines op lists + stats,
  lossless tokenizer battery, EXACT toUnifiedDiff fixtures (single/multi-hunk, context 0/1/3, merge
  boundary, custom names, no-change→''), and a 22-pair reconstruct property (supplement, not sole check).
  Builder correctly STOPPED-and-surfaced a real lib bug via 2 `{todo}` tests rather than weakening a test
  or editing the lib. Verifier (sonnet) confirmed 445/445 (443 pass, 2 todo, 0 fail; CtDiff 68), build-all
  10/10, killed ALL 17 mutants on a scratch copy (myers tie-break/snake/backtrack, merge threshold both
  directions, all 3 normalize options, diffWords coalescing, diffLines op flips, stats, hunk-start
  fallback, tokenizer, splitLines, default context), re-derived fixtures by hand, and INDEPENDENTLY
  adjudicated the bug against GNU `diff -U0` as genuine. No bug-fixer kickback. Lib unit tests now total
  445 (prior 377 + 68 new): 443 passing + 2 todo documenting the toUnifiedDiff bug.
- **Phase 08 orchestrator cleanup (test-file only, no lib):** fixed a stale `todo` test TITLE
  (`toUnifiedDiff: context 0 pure insert ... (-3,0 +2,2)` → `(-1,0 +2,2)`) so it matches its own
  GNU-correct assertion; the `-3,0` in the adjacent explanatory comment refers to the different
  `abc`/`cba` repro case and is left as-is. Verifier flagged the title as stale; assertion was already
  correct.
- **Phase 08 coverage concerns (deferred, not blocking):** two mutants are each caught by only ONE test —
  the hunk-merge threshold (`2*context+1` → `+2`) and the default context (3→2). A second targeted case
  for each would harden them. Noted for a hardening pass.

## Log (cont. 8)
- **Phase 09 (ctmarkdown) — PASS** — 2026-10-03. Builder (sonnet) authored `CtMarkdown.test.mjs`: 177
  tests (175 pass + 2 todo) over all 5 exports (mdToHtml, parseInline, escapeHtmlForMarkdown,
  escapeAttrForMarkdown, sanitizeUrl incl a 31-row scheme matrix), exact-output per block/inline/edge
  construct + explicit SAFETY assertions (raw HTML always escaped; javascript:/vbscript:/data: blocked;
  data:image/ images-only; attr-escaping blocks quote breakout), determinism (same MD→byte-identical).
  No split needed. Verifier (sonnet) confirmed 622/618/0/4, build-all 10/10, test-all 10/10 (ALL 9 e2e
  green this run — no flake), killed 45/46 mutants on scratch copies (46 mutants: escape no-ops, all URL
  scheme blocks, entity-decode/control-strip, block + inline constructs), re-derived 4 outputs by hand.
  No bug-fixer kickback. Lib unit tests now total 622 (prior 445 + 177 new): 618 passing + 4 todo (2 from
  CtDiff P08, 2 new from CtMarkdown's blank-line-in-code bug).
- **Phase 09 adjudications (verifier, independent vs CommonMark):** (a) blank-line code-block loss =
  GENUINE bug (raise); (b) opts-ignored / data:image allow-by-default = GENUINE spec drift (raise,
  needs decision); (c) `2*3*4`→`2<em>3</em>4` = CommonMark-CONFORMANT, NOT a bug (intraword `*` is
  permitted; only `_` is restricted) — not raised.
- **Phase 09 coverage concern (deferred, not blocking):** one mutation survivor — removing
  attribute-escaping on `<img src>` leaves the suite green (no test puts `"`/`&`/`<` in an IMAGE url; the
  lib DOES escape it correctly — `![x](a"b&c)` → `<img src="a&quot;b&amp;c" alt="x">`). Security-adjacent
  (attr breakout) but not a live hole. One-line hardening test closes it; noted for a hardening pass,
  consistent with prior-phase survivor handling (not fixed mid-epic to keep builder authorship clean).

## Log (cont. 9)
- **Phase 10 (ctpretty) — SPLIT into 3 serial ship sub-rounds** — 2026-10-03, orchestrator call at Gate A
  (the p10 PRD explicitly delegates this). CtPretty.mjs is 1796 lines / 6 engines / 21 exports — one round
  would be shallow. Grouping (≤2 languages each, each its own test file): **10a** JSON+YAML + the 3 shared
  helpers (byteLength, indentUnit, lineColFromOffset) → `CtPretty.json-yaml.test.mjs`; **10b** HTML+CSS →
  `CtPretty.html-css.test.mjs`; **10c** SQL+JS (the two safe-minify-only, tokenizer-aware engines — share
  the "string/regex/template aware, never rewrite" invariant + export tokenizeSQL/tokenizeJS) →
  `CtPretty.sql-js.test.mjs`. Each sub-round: pretty+minify+idempotency+round-trip(semantic)+edge, ≥1
  exact fixture per language. Within the standing "run all 13 autonomously" grant (planned-for contingency,
  not a scope change). Work folders auto-number 10/11/12 → downstream P11-P13 work folders shift +2.

## Log (cont. 10)
- **Phase 10a (ctpretty JSON+YAML+shared) — PASS** — 2026-10-03. Builder (sonnet) authored
  `CtPretty.json-yaml.test.mjs`: 90 tests (88 pass + 2 todo) over 8 exports — shared helpers (byteLength
  surrogate-aware, indentUnit, lineColFromOffset) exact; JSON 10-row fixture table + idempotency +
  round-trip (JSON.parse deep-eq) + friendly line/col errors + edges; YAML exact format+minify fixtures +
  10-doc semantic round-trip battery + rich policy observations. Builder did NOT mutation-test (misread it
  as a lib edit); verifier (sonnet) ran it: 712/706/0/6, build-all 10/10, test-all 9/10 (color-picker
  #1012 flake — known), killed 26/28 mutants on a scratch copy (survivors: 1 equivalent byteLength
  fallback, 1 real whitespace-quoting gap), hand-re-derived 3 JSON + both YAML fixtures. No bug-fixer
  kickback. Lib unit tests now total 712 (prior 622 + 90): 706 passing + 6 todo (2 CtDiff, 2 CtMarkdown,
  2 CtPretty-YAML newline).
- **Phase 10a coverage concern (deferred, not blocking):** mutation survivor E5 — turning off
  leading/trailing-whitespace quoting in `yamlScalarNeedsQuote` leaves the suite green (no test pins a
  `" x "`-style value). One pinned fixture closes it; noted for a hardening pass (not fixed mid-epic,
  consistent with prior-phase survivor handling).

## Log (cont. 11)
- **Phase 10b (ctpretty HTML+CSS) — PASS** — 2026-10-03. Builder (sonnet) authored
  `CtPretty.html-css.test.mjs`: 203 tests (197 pass + 6 todo) over 4 exports — HTML (16 exact fixtures +
  void/inline/rawText/doctype/attrs/comment-policy + idempotency + semantic round-trip) + CSS (18 exact
  fixtures + @media/@supports nesting + url()/string/comment awareness + !important + blank-line policy +
  idempotency + convergence). Verifier (sonnet) reproduced all claims: 915/903/0/12, build-all 10/10,
  test-all 10/10 (no flake this run), mutation-killed all 5 core target areas on scratch copies (survivors
  are edge coverage gaps + 1 equivalent mutant), hand-re-derived 2 HTML + 2 CSS outputs. No bug-fixer
  kickback. Lib unit tests now total 915 (prior 712 + 203): 903 passing + 12 todo (2 CtDiff, 2 CtMarkdown,
  2 YAML, 6 HTML/CSS).
- **Phase 10b adjudications (verifier):** (a) minifyCSS stray-space = genuine LOW (raise, small safe fix;
  bundle the `a{...;;}`→`;` double-semicolon quirk with it); (b) formatHTML rawText newline collapse =
  genuine MEDIUM (raise) — AND the same one-line cause also corrupts HTML comments, CSS comments, and CSS
  strings with escaped newlines (broader than the builder saw); (c) minor quirks — `<script src=a.js/>`
  emitting `</script>` is CORRECT per HTML (browsers ignore the self-closing slash), unterminated-comment
  append + lowercased synth close tags are defensible/cosmetic.
- **Phase 10b coverage concerns (deferred, not blocking):** mutation survivors = conditional-comment
  WITHOUT `[endif]` (e.g. `<!--[if !IE]><!-->`), nested-empty-rule brace padding (`@media x{a{}}`), a comma
  inside a quoted selector string, `cssCollapseWS` string skip, `cssReadString` escape handling (`"q\"}"`).
  All are edge gaps in otherwise mutation-protected engines; noted for a hardening pass (not fixed mid-epic).

## Log (cont. 12)
- **Phase 10c (ctpretty SQL+JS) — PASS; P10 CtPretty split COMPLETE** — 2026-10-03. Builder (sonnet)
  authored `CtPretty.sql-js.test.mjs`: 89 tests (87 pass + 2 todo) over 6 exports — SQL (exact token
  arrays + lossless round-trip, pretty casing/clause/indent, minify, 10-input semantic-equivalence battery,
  idempotency, edges) + JS (regex-vs-division token cases, template `${}` nesting, all 32 multi-char
  punctuators, pretty + SAFE-minify with token-stream equivalence over ~30 inputs + ASI newline-gap
  check). Verifier (sonnet) confirmed 1004/990/0/14, build-all 10/10, test-all 10/10 (no flake), killed
  all 5 target mutation families on scratch copies (4 survivors: 2 equivalent, 1 format-only, 1 real-minor
  = template-close `pop` only trips on malformed `}`), verified the token-stream-equivalence method really
  catches a semantic change, hand-re-derived both fixtures + the `return /re/g` token array, and
  INDEPENDENTLY EVALUATED BUG-1 as a true semantic change. No bug-fixer kickback. Lib unit tests now total
  1004 (prior 915 + 89): 990 passing + 14 todo (2 CtDiff, 2 CtMarkdown, 2 YAML, 6 HTML/CSS, 2 SQL/JS).
  **P10 = 10a+10b+10c all PASS; CtPretty fully covered (JSON/YAML/HTML/CSS/SQL/JS + shared helpers).**
- **Phase 10c coverage concern (deferred, not blocking):** the JS semantic battery lacks `a + +b` /
  `a - -b` / `1 .x` inputs — the token-fuse mutations were caught only by the dedicated fuse + exact-fixture
  tests, not the battery. Adding those inputs would harden it. Also the 2 BUG-1 `todo` tests cover only the
  `${`-head position; adding the middle-position, nested, and `//`-code-loss cases would strengthen them.
  Noted for a hardening pass (not fixed mid-epic). formatSQL blank-line-after-`(` is a real cosmetic defect
  (unpinned) worth a lib TODO.

## Log (cont. 13)
- **Phase 11 (ctformat) — PASS** — 2026-10-04. Builder (sonnet) authored `CtFormat.test.mjs`: 219 tests
  (217 pass + 2 todo) over 16 exports — FORMATS registry + 6 parse/emit pairs (JSON/CSV/TSV/YAML/
  properties/XML) + detectFormat + convert; table-driven over a format registry: per-format parse-to-model
  + exact emit fixture + round-trip battery (4-15 models each) + emit idempotency, 19 exact cross-convert
  pairs + A→B→A over all ordered pairs in several format families, type fidelity, CSV/TSV specifics
  (quoting/CRLF/ragged/header:false/delimiter), malformed policy (all throw Error; parseProperties +
  detectFormat never throw). No split needed. Verifier (sonnet) confirmed 1223/1207/0/16, build-all 10/10,
  test-all 10/10 (no flake), killed 32/33 mutants on a scratch copy (survivor = trailing-blank-line parse
  not pinned), hand-re-derived the emitCSV + json→properties fixtures. No bug-fixer kickback. Lib unit
  tests now total 1223 (prior 1004 + 219): 1207 passing + 16 todo (2 CtDiff, 2 CtMarkdown, 2 YAML, 6
  HTML/CSS, 2 SQL/JS, 2 CtFormat-CSV).
- **Phase 11 adjudications (verifier):** (a) CSV/TSV single-column empty-trailing-record loss = genuine
  LOW-MED (raise, no urgency); (b) detectFormat('[1,')→csv = defensible best-effort heuristic, LOW UX nit
  (mention); (c) lossy-by-design (number/bool stringify, null/empty→""/<c/>, XML trim + 1-elem-array
  collapse) = all defensible, NOT raised.
- **Phase 11 coverage concern (deferred, not blocking):** mutation survivor — removing the "drop a trailing
  empty record" rule in `parseDelimited` stays green (no non-todo test pins `parseCSV('a\nx\n\n')`). Also the
  (a) scope-pin test asserts the buggy emit `'a\n'`, so it needs updating when the lib is fixed. Noted for a
  hardening pass (not fixed mid-epic).

## Log (cont. 14)
- **Phase 12 (ctcurl) — SPLIT into 2 serial ship sub-rounds** — 2026-10-04, orchestrator call at Gate A
  (the p12 PRD explicitly endorses a parser-vs-generator split). CtCurl.mjs is 1099 lines with ~40 exports:
  a shell tokenizer + curl/wget parsers + 2 builders + 6 language code generators (fetch/Node/Python/
  HTTPie/PowerShell/Go) + ~20 helpers — more breadth than CtFormat's symmetric pairs. Split on the
  input/output seam: **12a** (parse side) = tokenizeShell, parseCurl, parseWget, emptyModel, normalizeModel,
  modelWithoutSecrets, splitUrlParams, applyUrlParams, fullUrl, safeDecode, utf8ToBase64, base64ToUtf8,
  basicHeaderValue, decodeBasic, parseFormPairs + METHODS/AUTH_TYPES/BODY_TYPES → `CtCurl.parse.test.mjs`;
  **12b** (generate side) = buildCurl, buildWget, toFetch, toNode, toPython, toHttpie, toPowerShell, toGo,
  convert, CONVERT_LANGS, shellQuote, jsStr, pyStr, goStr, psStr, resolvedHeaders, contentTypeForBody,
  hasBody, encodeForm + round-trip parse(buildCurl(model))≈model → `CtCurl.generate.test.mjs`. Within the
  standing "run all 13 autonomously" grant (planned-for contingency). Work folders auto-number 14/15 →
  P13 work folder shifts to 16.

## Log (cont. 15)
- **Phase 12a (ctcurl parse side) — PASS** — 2026-10-04. Builder (sonnet) authored `CtCurl.parse.test.mjs`:
  256 tests (all pass, 0 todo) over ~18 parse-side exports — tokenizeShell (24 exact-token cases), parseCurl
  (~120 flag rows + method inference + 5 full real one-liners), parseWget subset, all model/URL/encoding
  helpers + base64/basic-auth round-trips, and a detailed TOTAL/best-effort+notes malformed policy (never a
  throw). Verifier (sonnet) confirmed 1479/1463/0/16, build-all 10/10, test-all 10/10 (no flake), killed
  27/28 mutants on a scratch copy (1 equivalent = redundant `.trim()`), and VERIFIED all 5 real-one-liner
  fixtures against real curl 8.7.1 — none wrong. No bug-fixer kickback. Lib unit tests now total 1479
  (prior 1223 + 256): 1463 passing + 16 todo (unchanged todo set; 12a used passing pins, not todos).
- **Phase 12a adjudications (verifier, vs real curl 8.7.1):** (a) `--url` = LOW — `--url X` works (just a
  misleading note), `--url=X` gives empty URL but real curl ALSO rejects `--url=X` (no `--opt=value` syntax)
  so that's invalid input; (b) wget `-nv` dead code = LOW (batch with a); (c) `#fragment` in last query
  value = GENUINE MED-LOW bug (raise); extra: wget `--max-redirect=0` sets followRedirects=true but 0 should
  DISABLE = LOW (mention). The equivalent-mutant survivor is not a coverage gap.
- **Phase 12a → 12b carry-forward (IMPORTANT):** curl `-d` is modeled as `body.type:'raw'`, but real curl
  defaults to `Content-Type: application/x-www-form-urlencoded`. The 12b generators + round-trips MUST NOT
  lose that default content-type. Also the wget `--post-data='{"a":1}'` fixture becomes a `form` body with a
  bogus field (raw text kept) — lossy, pinned. 12b should assert `contentTypeForBody`/`resolvedHeaders`
  reflect the right defaults.

## Log (cont. 16)
- **Phase 12b (ctcurl generate side) — PASS; P12 CtCurl split COMPLETE** — 2026-10-04. Builder (sonnet)
  authored `CtCurl.generate.test.mjs`: 40 tests (all pass) over ~19 generate-side exports — 5 string-quoting
  helpers (exact escaping tables), encodeForm/hasBody/contentTypeForBody/resolvedHeaders,
  buildCurl/buildWget (exact for GET/json/raw/form/multipart/bearer/basic), the 6 generators (fetch+python
  EXACT, httpie/powershell/go/node structural + a 4-model cross-language field-presence check), convert
  dispatch, and a 12-model × 4-option round-trip. Verifier (sonnet) confirmed 1519/1503/0/16, build-all
  10/10, test-all 10/10 (no flake), ran ~75 mutations on a scratch copy with ZERO survivors — drop-a-header
  failed 3-9 tests/generator and wrong-method 3-5, proving the structural checks bite — and hand-re-derived
  the fetch+python snippets (incl `Basic dTpw`). No bug-fixer kickback. Lib unit tests now total 1519 (prior
  1479 + 40): 1503 passing + 16 todo (unchanged set). **P12 = 12a parse + 12b generate both PASS; CtCurl
  fully covered.**
- **Phase 12b adjudications (verifier):** quirk #1 (raw `-d` body no Content-Type) = GENUINE MED fidelity
  bug (raise, cross-cuts 12a+12b); #2 buildWget multiline URL glued to last flag line = cosmetic LOW
  (optional); #3 powershell/go multipart as comment-only = defensible best-effort (enhancement
  opportunity); #4 powershell/go form as one pre-encoded string = acceptable (same wire bytes + CT header).
- **Phase 12b coverage concerns (deferred, not blocking):** duplicate-Content-Type guard in resolvedHeaders
  caught by only 1 test; the raw-body-CT quirk is pinned as "absent" (needs updating if #1 is fixed); a
  `joinCmd` value starting with `-` in multiline output is untested. Noted for a hardening pass.

## Log (cont. 17)
- **Phase 13 (image-pure) — SPLIT into 2 serial ship sub-rounds** — 2026-10-04, orchestrator call at Gate A
  (the p13 PRD endorses a dither+pdf vs imageutil split). On inspection CtImageUtil's PURE surface is MUCH
  bigger than the PRD's "color math + checkImageLimits + canvasFormats" estimate: the rect-gizmo geometry
  (normalizeRect/HANDLE_IDS/oppositeHandle/handlePoints/hitTestHandle), the fit helpers (coverRect/
  containRect/coverSrcRect), and the crop-aspect math (ASPECT_PRESETS/aspectRatioFor/clampRectToImage/
  constrainRectToAspect/resizeRaw) are ALL pure number-math (no DOM) — ~25 pure fns total. Only loadImageFile/
  canvasToBlob/canvasToPngBytes truly need DOM (deferred to e2e). Split: **13a** = CtDither (nearestColorIndex/
  floydSteinberg/atkinson/bayerMatrix/bayer — known-output dither) + CtImagesToPdf (22 exports; PDF-1.4 byte
  structure + determinism) → `CtDither.test.mjs` + `CtImagesToPdf.test.mjs`; **13b** = CtImageUtil ~25 pure
  helpers → `CtImageUtil.test.mjs` (defer the 3 DOM fns). Splitting keeps the subtle algorithm/binary work
  (dither hand-computation, PDF bytes) from being crowded out by the broad geometry surface. Within the
  standing "run all 13 autonomously" grant (planned-for contingency). Work folders auto-number 16/17.

## Log (cont. 18)
- **Phase 13a (image: CtDither + CtImagesToPdf) — PASS (via FAIL→fix→PASS loop)** — 2026-10-04. Builder r1
  (sonnet) authored `CtDither.test.mjs` (26) + `CtImagesToPdf.test.mjs` (38), hand-computed, no canvas/DOM.
  **Verifier r1 FAILed** (correctly): the oracle was independent and CtImagesToPdf killed 22/22 mutants, but
  CtDither's error-diffusion WEIGHTS were unpinned — every dither test used only gray-128 on ≤3 rows
  (threshold decisions independent of the exact weights), so FS 7/16→6/16, Atkinson /8→/7, BAYER_STRENGTH,
  and default-order mutants all SURVIVED. Fixer (builder r2, sonnet) extended CtDither.test.mjs 26→33 with
  weight-sensitive hand-computed cases (FS/Atkinson 3×3 non-128 + colour, bayer default-order/strength/+0.5)
  found via an independent simulator. **Verifier r2 PASS:** independently reproduced all 6 r1-surviving
  mutants now RED, re-derived the new literals in a non-importing script, no regression, no lib edit. The
  epic's ONLY verify↔fix cycle (cap 2, used 1) — caught a genuine coverage hole. Lib unit tests now total
  1590 (prior 1519 + 64 r1 + 7 r2): 1574 passing + 16 todo. No lib bug in CtDither/CtImagesToPdf.
- **Phase 13a residual concerns (deferred, not blocking):** r2 verifier independently re-checked the 6 key
  mutants; the fixer's extra claimed kills (FS 7→9/5→4/1→2, Atkinson /6, tap-move) + bayer order-8 were not
  independently re-run (fixer-reported only). FS individual tap-position swaps not isolated. Noted.

## Log (cont. 19) — EPIC AUTHORING COMPLETE
- **Phase 13b (CtImageUtil pure helpers) — PASS; P13 COMPLETE; ALL 13 PHASES DONE** — 2026-10-04. Builder
  (sonnet) authored `CtImageUtil.test.mjs`: 51 tests over all 28 pure named exports + the CtImageUtil
  aggregator class (colour, formats registry, the strict-`>` limit checker, rect-gizmo geometry, fit math,
  crop-aspect), with the 3 DOM/canvas fns (loadImageFile/canvasToBlob/canvasToPngBytes) deferred to e2e.
  Verifier (sonnet) confirmed 1641/1625/0/16, build-all 10/10, test-all 10/10 (no flake), killed 41/45
  mutants on a scratch copy (EVERY `>`→`>=` limit flip RED — strict thresholds genuinely pinned; 4
  survivors = 2 equivalent + 2 minor boundary gaps), re-derived coverRect/containRect/limits/aspect by hand,
  and confirmed the aggregator loop (28 exports, length-pinned). No lib bug. Lib unit tests now total 1641
  (prior 1590 + 51): 1625 passing + 16 todo. **Epic test authoring COMPLETE — 13/13 phases PASS.**
- **Phase 13b observations (verifier-adjudicated, all correctly pinned, none a bug):** clampByte TRUNCATES
  (not rounds — matches source comment; the plan's "round" wording was wrong); constrainRectToAspect 'center'
  is width-driven; hitTestHandle ties → later handle (deterministic `d<=bestD`). resizeRaw('move') reads the
  'e' as east = real but LOW quirk → optional hardening (not pinned; callers only pass the 8 handle ids).
- **Phase 13b coverage concerns (deferred):** 2 surviving mutants are minor boundary gaps — hitTestHandle
  right-edge-inclusive (`(110,35)` on the test rect should be 'move') and clampByte at exactly 256 (a
  `[256,255]` row would catch it). Noted for a hardening pass.
- **Operational note:** the 13b verifier's `test-all` (Playwright) left `chrome-headless-shell` processes
  running; to be reaped at epic close (orchestrator, with user visibility).

## Raise to user
- **CtImageUtil.resizeRaw('move', …) misreads 'move' as the east handle (LOW, optional).** `id.includes('e')`
  is true for "move", so `resizeRaw('move',...)` moves the right edge. Callers only pass the 8 handle ids
  (never 'move'), so it's latent; a guard would harden it. NOT fixed (test-only epic).
- **CtCurl loses the implicit `application/x-www-form-urlencoded` Content-Type of `curl -d` across
  parse→generate, so generated code DIFFERS from the real request (genuine bug, MEDIUM severity).**
  `parseCurl('curl -d foo=bar https://x')` yields a RAW body with no headers; `contentTypeForBody(raw)` is
  null, so the non-curl generators emit the WRONG content-type: fetch/node → `text/plain;charset=UTF-8`,
  python/go/httpie/wget → none, powershell → form-urlencoded only by its own default. Real `curl -d` sends
  `application/x-www-form-urlencoded`, so the regenerated fetch/node/python/go/httpie request behaves
  differently from the curl the user pasted. (`buildCurl` is fine — curl re-adds it; a FORM-typed body is
  fine — it emits the header.) Fix is a design call: either `parseCurl` records the implicit header (or
  marks `-d` as a form body) when no `-H content-type` is given, or the non-curl generators default it for
  a raw body. Characterized via a passing pin (the raw-body-CT test asserts "absent" and must flip on fix).
  Candidate follow-on ticket; NOT fixed (test-only epic).
- **CtCurl.fullUrl rebuilds a URL fragment as a query value (`#frag`→`%23frag`), silently changing the
  request (genuine bug, MED-LOW severity).** When a curl URL has BOTH a query and a `#fragment`
  (`…?a=1&b=two#frag`), `splitUrlParams` keeps the fragment on the last value (`b="two#frag"`) and `fullUrl`
  re-emits it percent-encoded (`…&b=two%23frag`) — but curl and browsers never SEND a fragment, so the
  regenerated request differs from the original. (With no query, the fragment stays harmlessly in `url`.)
  Fix: strip the `#…` suffix in `splitUrlParams` before splitting the query. Characterized via a passing pin
  test (flip when fixed). Candidate follow-on ticket; NOT fixed (test-only epic).
- **CtCurl minor curl/wget-compat nits (LOW, optional one-line fixes, bundle into one ticket):** (1) `--url`
  is not handled as a real flag — `--url X` parses via positional fallthrough with a misleading
  "Unrecognized flag" note, and in `curl A --url B` the `B` is dropped; a `case '--url'` fixes it. (2) wget
  `-nv` (and `-nc`/`-nH`) are split by the short-cluster expander so their `case` arms are dead → spurious
  "Unrecognized flag -n" note. (3) wget `--max-redirect=0` sets `followRedirects=true` where `0` should
  DISABLE redirects. All characterized/pinned; NOT fixed (test-only epic).
- **CtFormat CSV/TSV lose a single-column row whose last record is empty (genuine bug, LOW-MED severity,
  silent).** `parseDelimited`'s "drop a single trailing empty record" rule + `emitCSV` not quoting a lone
  empty cell means `parseCSV(emitCSV([{a:''}]))` → `[]` and `[{a:'x'},{a:''}]` → `[{a:'x'}]` (TSV identical;
  also hits a trailing `null` row and primitive arrays like `['x','']`). Mid-table + multi-column empties are
  fine; even a quoted `a\n""\n` parses to `[]`. Rare (single column + blank last row) but silent. Fix needs
  BOTH: quote a lone empty cell on emit AND don't drop a record whose single field was quoted-empty.
  Characterized via 2 `{todo}` tests. Candidate follow-on ticket (no urgency); NOT fixed (test-only epic).
- **CtFormat.detectFormat mis-detects truncated/leading-`[` JSON as CSV (LOW-severity UX nit).**
  `detectFormat('[1,')` (and `[1,2`, `{"a":1,`, `[1,2,]`, `[a,b]`) returns `csv`, so `convert('[1,','auto',
  'json')` returns `[]` with NO error — a user pasting truncated JSON gets a silent empty result instead of a
  syntax error. Best-effort heuristic, defensible, but worth an optional fix: surface a JSON parse error when
  text starts with `{`/`[` and fails to parse. NOT fixed (test-only epic).
- **CtPretty.minifyJS SILENTLY CHANGES REGEX SEMANTICS — and in the worst case LOSES CODE — when a regex
  is the first token in a template `${…}` (genuine bug, HIGH correctness severity, low likelihood). TOP
  PRIORITY of the raised bugs.** A regex at a `${`-head or middle `}…${` position (incl nested templates)
  is mis-tokenized as DIVISION, so `minifyJS` strips spaces inside the regex body: `` `a${/x  +  y/.source}`
  `` → `` `a${/x+y/ .source}` `` (verifier EVALUATED both: input →"ax  +  y", output →"ax+y"; `/x+y/`
  matches `xxy`, `/x  +  y/` does not); `[ ]`→`[]` (empty class, never matches a space). WORSE: a regex body
  containing `//` makes the minifier swallow the rest of the line as a comment — `` x=`${/[//]/.test(s)}`;
  \ny(); `` minifies to broken, code-losing output (a syntax error). This violates the engine's core
  "SAFE minify — never change meaning" contract. Cause: `regexAllowed()` treats any previous `template`
  token as a value; the sibling `formatJS`/`jsIsValueEnd` already special-cases `${`. One-line fix:
  `if (p.type==='template') return /\$\{$/.test(p.value)`. Characterized via 2 `{todo}` tests (head
  position). Candidate follow-on ticket; NOT fixed (test-only epic).
- **CtPretty CSS/HTML formatters/minifiers have a shared whitespace-collapse family of bugs (genuine).**
  (1) `formatHTML` + `formatCSS` run a global `.replace(/\n{3,}/g,'\n\n')` over the WHOLE output, so 3+
  blank lines inside RAWTEXT (`<pre>`/`<textarea>`/`<script>`/`<style>`), inside multi-line HTML/CSS
  comments, and inside CSS strings with escaped newlines are collapsed — MEDIUM severity (data/meaning loss
  in `<pre>`/`<textarea>` and in `<script>` template literals; verified by Phase 10b). Same root-cause class
  as the CtMarkdown code-block bug; one-line fix is to exempt preformatted/raw regions from the collapse.
  (2) `minifyCSS` leaves STRAY SPACES where a dropped `/* comment */` sat next to a structural char
  (`color:red/* in */;`→`red ;`; `}\n/*c*/\nb`→`}  b`), so minify is NOT idempotent — LOW severity (CSS
  semantics unchanged, quality/idempotency only); also `a{color:red;;}` keeps one `;` on first pass. A
  dropped comment should get the same neighbour-trimming as whitespace. Characterized via 6 `{todo}` tests
  (flip when fixed). Candidate follow-on ticket(s); NOT fixed (test-only epic).
- **CtPretty YAML: a scalar containing a newline is NEVER quoted → format produces INVALID YAML and minify
  SILENTLY CHANGES THE VALUE (genuine bug, HIGH severity).** `yamlScalarNeedsQuote`/the flow dump omit
  `\n` (also `\r`, `\t`) from the quote test. `formatYAML('r: "line\nbreak"\nz: 1')` emits a raw newline
  → re-parsing that output throws `Expected "key: value" (line 2)`; `minifyYAML` on the same input
  re-parses to `"line break"` (meaning changed). Also breaks sequence items and keys. Tab/CR scalars
  round-trip fine. Reference: double-quote with an escaped `\n` (e.g. `r: "line\nbreak"`) — `JSON.stringify`
  already escapes these. Characterized via 2 `{todo}` tests (flip when fixed). Candidate follow-on ticket;
  NOT fixed (test-only epic).
- **CtPretty YAML: `parseYAML` SILENTLY DROPS over-indented content (data loss, MEDIUM severity).**
  `parseYAML('a: 1\n b: 2')` → `{a:1}` (the `b` line vanishes); also `a:\n  b: 1\n    c: 2`, `- 1\n  - 2`,
  and trailing garbage after a value lose content. Real YAML either errors or folds text into the scalar,
  never discards it — and this same parser THROWS `Bad indentation` for UNDER-indent, so the silent drop
  is internally inconsistent. Data loss on pasted input. Recommend throwing `Bad indentation (line N)`.
  Characterized via a passing pin test (goes red when fixed). Candidate follow-on ticket (lower priority
  than the newline bug); NOT fixed (test-only epic).
- **CtMarkdown.mdToHtml DELETES blank lines inside code blocks (data corruption).** A trailing global
  `.replace(/\n{2,}/g,'\n')` collapses blank lines everywhere, including inside `<pre><code>` — fenced,
  indented, and fenced-inside-a-list. CommonMark/GitHub PRESERVE blank lines in code verbatim, so any
  pasted code with an empty line is silently corrupted on render. Severity MEDIUM-HIGH (common input,
  silent). Characterized via 2 `{todo}` tests + 1 pin-current test (+ a pinned BLOCK row) — flip them when
  fixed. Candidate follow-on ticket; NOT fixed (test-only epic).
- **CtMarkdown.mdToHtml ignores its `opts` arg → `data:image/*` (incl `svg+xml`) allowed by default, no
  off switch (spec drift, needs a decision).** The module header documents "data: allowed only when
  opts.allowImage" (opt-IN), but `mdToHtml` never reads `opts`: `{allowImage:false}`, `true`, undefined
  and null ALL emit `data:image` URIs including `image/svg+xml`. No direct XSS today (SVG in `<img>` is
  script-inert) but exposure if the rendered HTML is ever opened top-level or reused in object/embed/
  iframe. No in-repo consumers of `mdToHtml` yet, so cheap to fix. Recommend: honor `opts.allowImage`
  (default false) and/or exclude `image/svg+xml`. Characterized via an observation test (goes red on fix).
  NOT fixed (test-only epic).
- **CtDiff.toUnifiedDiff emits a wrong zero-count hunk header at `context:0` (GENUINE lib bug, confirmed
  by Phase 08 verifier vs GNU `diff -U0`).** A hunk with no a-side (pure insert) is headed `-0,0` and one
  with no b-side (pure delete) `+0,0`, regardless of position — because `aStart`/`bStart` fall back to `0`
  when a side has zero lines (`CtDiff.mjs:258-259`). Standard unified diff uses the line BEFORE the hunk
  (e.g. GNU gives `-1,0 +2` / `+1,0`). Effect: `patch(1)` misplaces a mid-file pure-INSERT at context 0
  (puts it at the top); pure-delete still applies. Severity LOW-MODERATE and ONLY at context 0 — the
  DEFAULT context (3) is unaffected, so the diff tool's normal output is fine. Characterized via 2 `{todo}`
  tests (flip them green once fixed). Candidate follow-on ticket — NOT fixed (test-only epic).
- **The `test-all` red suite is NOT always the color-picker #1012 flake — it shifts.** Phase 08's verifier
  found `test-all` 9/10 with the failing suite = **color-converter e2e #94** (License modal `toBeVisible`),
  while color-picker passed 205/205 that run. So the e2e flakiness is broader than #1012 as first scoped
  (multiple tools' e2e intermittently fail under the full sweep). STILL unrelated to this lib epic — the
  lib step is green and build-all is 10/10 every run — but the user should not treat `test-all` 10/10 as a
  gate while this is unresolved. Recommend widening #1012 (or a sibling ticket) to the e2e runner's
  order/timing flakiness across tools, not just color-picker.
- **CtZipUtil.storeZip does not set the UTF-8 name flag (general-purpose bit 11).** Non-ASCII filenames are
  written without the UTF-8 flag, so `unzip` (and other extractors) can mangle them. Minor lib limitation
  surfaced by Phase 06 (tests characterize current behavior). Candidate follow-on ticket (not fixed —
  test-only epic).
- **color-picker e2e now fails REPRODUCIBLY (was flaky).** As of P05 verification, color-picker's
  "remove-all clears the on-screen list surviving reload" test fails the same way when run alone, not just
  under load. Still UNRELATED to the lib epic (no tool references the lib modules under test; color-picker
  files predate the new tests; lib step + build-all stay green). Belongs to task **#1012** / a color-picker
  bug-hunt — recommend the user look before relying on `test-all` being 10/10. NOT this epic's to fix.
- **Two more CtDateTimeUtil lib quirks (characterized, not fixed — test-only epic), for follow-on tickets:**
  1. `zonedTimeToUtc` resolves a spring-forward GAP time to the pre-gap instant (02:30 NY → 06:30Z), where
     the usual convention shifts forward (→ 07:30Z); `meetingGrid` inherits this (cols share an instant).
  2. `formatDiff` returns "-0s" for a negative sub-second diff (cosmetic).

## Raise to user
- **Two CtUtil lib quirks surfaced by Phase 02 (characterized, NOT fixed — test-only epic).** The tests
  pin CURRENT behavior and are marked "characterize"; they must be FLIPPED when the lib is fixed. To be
  filed as follow-on tickets at epic-close:
  1. `CtUtil.clamp(+Infinity)` returns `lo` where the clamp contract says `hi`. (`-Infinity`→`lo` is
     correct; the header documents "non-finite → lo", so intentional-but-arguably-wrong.)
  2. `CtUtil.slugify` can leave a TRAILING hyphen after the 60-char cap — the hyphen-strip runs before
     the length cap (confirmed: 59×"a" + " b" → 59 a's + "-").
  Minor coverage gaps noted for later: non-monotonic `measure` in wrapText; emoji/surrogate pairs in slugify.
- **Confirm the git diff at commit time** — this workspace blocks `git` for the agents, so the
  "no `src/lib` source modified" claim rests on file inspection + `build-all --check` 10/10 (which would
  catch a broken source). Before committing, confirm `git diff HEAD -- src/lib` shows only the new
  `src/lib/tests/` tree (plus `scripts/test-all.mjs` + `package.json`).
- **color-picker e2e flake** — `node scripts/test-all.mjs` reads 9/10 because one color-picker e2e test
  ("localStorage persistence … reload") fails intermittently (different assertion each run) yet passes
  92/92 in isolation. Unrelated to the lib work. This is exactly task **#1012** (harden the e2e runner
  against order-dependent timing flakiness) — no new ticket needed; noting it recurs.
- **Minor coverage concerns (Phase 01, deferred — not blocking)** — large-input/determinism crc32 tests
  have no known-answer vector; no error-path test; the `padStart` mutation wasn't exercised. Acceptable
  for the exemplar; later phases should carry the known-answer + error-path habit.
