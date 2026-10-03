# Punchlist

> Running ledger — updated after each phase reconciles.

## Pending
- **(authoring) NONE — all 13 phases PASS.** Remaining = EPIC CLOSE: final test-all + build-all sweep · update #1013 subtasks · file follow-on tickets for the raise-to-user queue · cost rollup + close · reap stray chrome-headless-shell.

> Phase 13 (`p13-image-pure`) was SPLIT into 2 sub-rounds — both PASS (see Done): 13a CtDither+CtImagesToPdf
> (`16-image-dither-pdf`), 13b CtImageUtil pure helpers (`17-image-util-pure`). P13 complete.

> Phase 12 (`p12-ctcurl`, HIGH) was SPLIT into 2 sub-rounds — both PASS (see Done): 12a parse
> (`14-ctcurl-parse`), 12b generate (`15-ctcurl-generate`). P12 complete.

> Phase 10 (`p10-ctpretty`, VERY HIGH) was SPLIT into 3 sub-rounds — all PASS (see Done): 10a JSON+YAML
> (`10-ctpretty-json-yaml`), 10b HTML+CSS (`11-ctpretty-html-css`), 10c SQL+JS (`12-ctpretty-sql-js`).

> Note: P10's split shifts WORK-FOLDER numbers for P11–P13 by +2 (the tool auto-numbers sequentially).
> Logical phase identity stays tied to the `pNN-*` PRD folders; the mapping above is authoritative.

## Done
- **Phase 01 — harness** (01-harness) — PASS 2026-10-03. Harness at `src/lib/tests/unit/`, crc32
  exemplar (8 tests, mutation-verified), test-all lib step wired, README pattern doc. build-all 10/10.
- **Phase 02 — ctutil-pure** (02-ctutil-pure) — PASS 2026-10-03. `CtUtil.test.mjs` 47 tests (lib suite
  55/55), 35/35 mutants killed, build-all 10/10. 2 lib quirks raised (clamp(+Inf), slugify trailing-hyphen).
- **Phase 03 — ctbyteutil-hashing** (03-ctbyteutil-hashing) — PASS 2026-10-03. `CtByteUtil.hashing.test.mjs`
  38 tests (lib suite 93/93), digests confirmed vs node:crypto shim, 10/10 mutants killed, build-all 10/10.
- **Phase 04 — ctbyteutil-encoding** (04-ctbyteutil-encoding) — PASS 2026-10-03. `CtByteUtil.encoding.test.mjs`
  44 tests (lib suite 137/137), base64/hex pairs independently recomputed, 19/20 mutants killed, build-all
  10/10, test-all 10/10. Minor: formatBytes(Infinity) header-doc inaccuracy (optional lib fix, deferred).
- **Phase 05 — ctdatetimeutil** (05-ctdatetimeutil) — PASS 2026-10-03. `CtDateTimeUtil.test.mjs` 73 tests,
  all 28 members (lib suite 210/210), deterministic under foreign TZ+locale, vectors recomputed in Python,
  15/16 mutants killed, build-all 10/10. 2 lib quirks raised (gap-time resolution, formatDiff "-0s").
- **Phase 06 — ctziputil** (06-ctziputil) — PASS 2026-10-03. `CtZipUtil.test.mjs` 29 tests (lib suite
  239/239), byte-level zip structure + CRC + 2 round-trips (parser + unzip), 30/36 mutants killed, build-all
  10/10. 1 lib note raised (storeZip no UTF-8 name flag).
- **Phase 07 — ctescaper** (07-ctescaper) — PASS 2026-10-03. `CtEscaper.test.mjs` 138 tests, 19 context
  pairs round-trip + ≥2 exact fixtures each (lib suite 377/377), all 39 no-op mutations caught, fixtures
  independently confirmed, build-all 10/10. escapeFilename reserved-name pass-through flagged (product gap).
- **Phase 08 — ctdiff** (08-ctdiff) — PASS 2026-10-03. `CtDiff.test.mjs` 68 tests over all 7 exports
  (lib suite 445: 443 pass + 2 todo), hand-derived op sequences + exact unified-diff fixtures + 22-pair
  reconstruct property, 17/17 mutants killed, build-all 10/10. GENUINE lib bug found & characterized (not
  fixed): toUnifiedDiff zero-count hunk header `-0,0` at context 0 → raise-to-user. Stale test title fixed.
- **Phase 09 — ctmarkdown** (09-ctmarkdown) — PASS 2026-10-03. `CtMarkdown.test.mjs` 177 tests (lib suite
  622: 618 pass + 4 todo) over all 5 exports incl 31-row sanitizeUrl matrix + explicit XSS/safety asserts,
  exact-output per construct, determinism; 45/46 mutants killed, build-all 10/10, test-all 10/10. TWO
  genuine lib issues found & characterized (not fixed) → raise-to-user: (a) blank-line-in-code data loss
  [med-high], (b) opts-ignored/data:image svg+xml allow-by-default [spec drift, needs decision]. `2*3*4`
  emphasis ruled CommonMark-conformant. img-src attr-escape mutation survivor noted (coverage gap).
- **Phase 10a — ctpretty JSON+YAML+shared** (10-ctpretty-json-yaml) — PASS 2026-10-03.
  `CtPretty.json-yaml.test.mjs` 90 tests (lib suite 712: 706 pass + 6 todo) over 8 exports — shared helpers
  + JSON (10-row fixtures, idempotency, round-trip, line/col errors) + YAML (fixtures + semantic
  round-trip battery); 26/28 mutants killed, build-all 10/10, test-all 9/10 (color-picker #1012). TWO
  genuine YAML lib bugs found & characterized (not fixed) → raise-to-user: (a) newline-in-scalar not
  quoted [HIGH — invalid output / silent value change], (b) over-indent silent drop [MED — data loss].
  Whitespace-quoting mutation survivor noted (coverage gap).
- **Phase 10b — ctpretty HTML+CSS** (11-ctpretty-html-css) — PASS 2026-10-03. `CtPretty.html-css.test.mjs`
  203 tests (lib suite 915: 903 pass + 12 todo) — HTML 16 + CSS 18 exact fixtures, void/inline/rawText/
  comment-policy, @media nesting, url()/string/comment awareness, idempotency + round-trip; mutation-killed
  all 5 core areas, build-all 10/10, test-all 10/10. TWO genuine lib bugs found & characterized (not fixed)
  → raise-to-user: (a) minifyCSS stray-space/non-idempotent [LOW], (b) format{HTML,CSS} global \n-collapse
  corrupts rawText/pre/comments/strings [MED, same family as the Markdown code-block bug]. `<script/>`
  close ruled HTML-correct. 5 edge mutation survivors noted (coverage gaps).
- **Phase 10c — ctpretty SQL+JS** (12-ctpretty-sql-js) — PASS 2026-10-03; **P10 COMPLETE**.
  `CtPretty.sql-js.test.mjs` 89 tests (lib suite 1004: 990 pass + 14 todo) — SQL + JS tokenizers (exact
  token arrays), pretty, SAFE-minify with token-stream semantic-equivalence + ASI newline-gap; all 5 target
  mutation families killed, build-all 10/10, test-all 10/10. ONE genuine HIGH-severity bug found &
  characterized (not fixed) → raise-to-user (TOP priority): minifyJS silently changes regex semantics / in
  the `//` case LOSES CODE when a regex is first in a template `${}`. formatSQL blank-line + battery-input
  hardening noted (coverage gaps).
- **Phase 11 — ctformat** (13-ctformat) — PASS 2026-10-04. `CtFormat.test.mjs` 219 tests (lib suite 1223:
  1207 pass + 16 todo) over 16 exports — 6 formats parse/emit + detectFormat + convert, table-driven, 19
  exact cross-convert pairs + all-ordered-pair round-trips, type fidelity + CSV/TSV specifics + malformed
  policy; 32/33 mutants killed, build-all 10/10, test-all 10/10. ONE genuine bug characterized (not fixed)
  → raise-to-user: CSV/TSV single-column empty-trailing-record loss [LOW-MED, silent]. detectFormat '[1,'
  →csv noted as LOW UX nit. Lossy-by-design items ruled defensible. Trailing-blank-line survivor noted.
- **Phase 12a — ctcurl parse side** (14-ctcurl-parse) — PASS 2026-10-04. `CtCurl.parse.test.mjs` 256 tests
  (lib suite 1479: 1463 pass + 16 todo) — tokenizeShell (24 exact-token) + parseCurl (~120 flag rows + 5
  real one-liners) + parseWget + all parse-side helpers + TOTAL/best-effort+notes malformed policy; 27/28
  mutants killed, build-all 10/10, test-all 10/10, all 5 one-liners verified vs real curl 8.7.1. ONE genuine
  bug → raise-to-user: fullUrl rebuilds `#fragment` as `%23frag` query value [MED-LOW]. Minor curl/wget
  compat nits (--url, -nv, --max-redirect=0) bundled as one LOW ticket. Carry-forward to 12b: `-d` default
  Content-Type must survive generators/round-trip.
- **Phase 12b — ctcurl generate side** (15-ctcurl-generate) — PASS 2026-10-04; **P12 COMPLETE**.
  `CtCurl.generate.test.mjs` 40 tests (lib suite 1519: 1503 pass + 16 todo) — 5 quoting helpers + builders
  (exact) + 6 generators (fetch/python exact, rest structural + cross-language field-presence) + convert +
  12-model round-trip; ~75 mutations ALL killed (drop-header/wrong-method bite), build-all 10/10, test-all
  10/10, fetch/python snippets hand-verified. ONE genuine bug → raise-to-user: `-d` raw-body loses the
  implicit x-www-form-urlencoded Content-Type across parse→generate [MED fidelity]. Quirks 2-4 ruled
  cosmetic/defensible. 3 coverage concerns noted.

- **Phase 13a — image (CtDither + CtImagesToPdf)** (16-image-dither-pdf) — PASS 2026-10-04 via FAIL→fix→PASS.
  `CtDither.test.mjs` (33, hand-computed error-diffusion incl weight-sensitive + colour) + `CtImagesToPdf.test.mjs`
  (38, PDF-1.4 byte structure + determinism) → lib suite 1590 (1574 pass + 16 todo). r1 verifier FAILed on a
  CtDither weight-pinning gap (gray-128-only tests); fixer added weight-sensitive cases (26→33); r2 verifier
  confirmed all 6 surviving mutants now killed + oracle independent. CtImagesToPdf killed 22/22 mutants. NO lib
  bug (first phase with none). build-all 10/10, test-all 10/10. Epic's only verify↔fix cycle (cap 2, used 1).
- **Phase 13b — CtImageUtil pure helpers** (17-image-util-pure) — PASS 2026-10-04; **P13 + EPIC AUTHORING COMPLETE**.
  `CtImageUtil.test.mjs` 51 tests (lib suite 1641: 1625 pass + 16 todo) over all 28 pure exports + aggregator
  class (colour/formats/strict-`>`-limits/rect-gizmo/fit/crop-aspect); 3 DOM fns deferred. 41/45 mutants killed
  (every `>`→`>=` limit flip RED; 4 survivors = 2 equivalent + 2 minor boundary gaps), hand-derivations match,
  build-all 10/10, test-all 10/10. NO lib bug. resizeRaw('move') east-handle quirk raised [LOW, optional].

## Cut / deferred
- color-picker e2e flake surfacing in `test-all` → tracked by existing task #1012 (not this epic).
