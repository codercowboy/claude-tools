# Plan — 14-ctcurl-parse (Phase 12a: CtCurl parse side)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 1 of 2 of the CtCurl split (`src/lib/utils/formats/CtCurl.mjs`, 1099 lines; HTTP-request model +
curl/wget parser + 6-language generator). THIS round covers the **PARSE side** (12b = build + generators).
Exports in scope (~18): `tokenizeShell`, `parseCurl`, `parseWget`, `emptyModel`, `normalizeModel`,
`modelWithoutSecrets`, `splitUrlParams`, `applyUrlParams`, `fullUrl`, `safeDecode`, `utf8ToBase64`,
`base64ToUtf8`, `basicHeaderValue`, `decodeBasic`, `parseFormPairs`, `METHODS`, `AUTH_TYPES`, `BODY_TYPES`.
Model shape: `{method,url,params[],headers[],auth{type,user,pass,token},body{type,raw,fields[],urlencode},
flags{followRedirects,insecure,compressed,timeout,userAgent,referer}}`. Every fn is TOTAL — bad input →
best-effort result + a `notes` entry, NEVER a throw. `parseCurl`/`parseWget` return `{...model, notes}`.
Full spec: `dev/20261003-library-test/p12-ctcurl/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Shell tokenizer correct | `src/lib/tests/unit/CtCurl.parse.test.mjs` | `tokenizeShell` — single/double quotes, backslash escapes, line continuations `\`, mixed; exact token arrays |
| curl flags parsed | same file | `-X`/`--request`, `-H`/`--header` (repeated), `-d`/`--data`/`--data-raw`/`--data-urlencode`, `-F`, `-u`, `--url` vs positional, `-G`, `--compressed`/`-L`/`-k`/`-A`/`-e`/`--max-time`; combined short clusters (`-sSL`, `-XPOST`); flags in any order → expected model fields |
| method inference | same file | GET default; POST when data present + no explicit method; `-G` forces GET + lifts data→params |
| real one-liners → model | same file | ≥2 real-world curl commands asserted to the full expected model |
| wget subset | same file | `parseWget` on supported wget commands → expected model |
| helpers exact | same file | emptyModel shape; normalizeModel (raw→canonical); modelWithoutSecrets (redacts auth); splitUrlParams/applyUrlParams/fullUrl (query round-trip); safeDecode; utf8ToBase64/base64ToUtf8 + basicHeaderValue/decodeBasic (basic-auth round-trip); parseFormPairs |
| TOTAL / malformed | same file | empty, unknown flags, missing URL, header without colon, duplicate headers → ACTUAL best-effort model + `notes` (NEVER a throw) |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read `CtCurl.mjs` — the model (~36-215), `tokenizeShell` (~215), `parseCurl` (~409), `parseWget` (~580),
and the helpers — FIRST to learn the EXACT model fields, the `notes` behavior, method-inference rules, and
how each flag maps. Assert what the lib ACTUALLY produces (it is TOTAL — never expect a throw). Then:
1. **tokenizeShell** — exact token arrays for quoting/escape/continuation cases.
2. **parseCurl** — table `{name, cmd, expectModel}` over the flags above; assert the relevant model slice
   (don't over-assert unrelated defaults); ≥2 full real-world one-liners asserted whole.
3. **parseWget** — the supported subset → model.
4. **Helpers** — direct tests incl the basic-auth round-trip (basicHeaderValue→decodeBasic) and the
   URL-param round-trip (splitUrlParams→applyUrlParams/fullUrl); modelWithoutSecrets redaction.
5. **Malformed / TOTAL** — assert best-effort model + `notes` for each malformed case; NEVER assert a throw.
Use REAL curl one-liners (high signal). A parse that is clearly WRONG (not merely lossy/best-effort) is a
genuine bug → STOP and surface. Characterize best-effort/lossy behavior rather than weakening a test.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p12-ctcurl/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing table-driven `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/formats/CtCurl.mjs` — read the model + tokenizeShell + parseCurl + parseWget + helper
  regions; confirm exact model + notes + flag mapping FIRST.

## Deliverables
- `src/lib/tests/unit/CtCurl.parse.test.mjs`.
- `findings/HANDOFF.md` — the flags-parsed coverage matrix (flag → tested), helper coverage, the test
  count, command outputs, the observed malformed/notes policy, what remains for 12b (builders + 6
  generators + output helpers + round-trip), and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL model/notes (it is TOTAL — never
  expect a throw). A clearly-wrong parse is STOP-and-surface; characterize best-effort/lossy behavior.
- Cover the PARSE side ONLY. Do NOT test builders, the 6 generators, or output helpers (12b owns them).
- Write only `src/lib/tests/unit/CtCurl.parse.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the flags-parsed +
helper coverage matrix, state the malformed/notes policy, flag any suspected bug, and note what remains for
12b. Write it to `findings/HANDOFF.md`.
