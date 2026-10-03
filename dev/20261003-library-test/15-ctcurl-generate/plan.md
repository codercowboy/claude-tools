# Plan — 15-ctcurl-generate (Phase 12b: CtCurl generate side)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Sub-round 2 of 2 (COMPLETES the CtCurl split; `src/lib/utils/formats/CtCurl.mjs`, 1099 lines). THIS round
covers the **GENERATE side** (12a = parse side, done). Exports in scope (~19): `buildCurl`, `buildWget`,
`toFetch`, `toNode`, `toPython`, `toHttpie`, `toPowerShell`, `toGo`, `convert`, `CONVERT_LANGS`,
`shellQuote`, `jsStr`, `pyStr`, `goStr`, `psStr`, `resolvedHeaders`, `contentTypeForBody`, `hasBody`,
`encodeForm`. Request model shape (from 12a): `{method,url,params[],headers[],auth{type,user,pass,token},
body{type,raw,fields[],urlencode},flags{...}}`. Every fn is TOTAL (best-effort, never throws).
`convert(model,lang)` dispatches to the 6 `to<Lang>` (default fetch). Full spec:
`dev/20261003-library-test/p12-ctcurl/PRD.md`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Output helpers exact | `src/lib/tests/unit/CtCurl.generate.test.mjs` | `shellQuote`/`jsStr`/`pyStr`/`goStr`/`psStr` escaping per language (quotes, specials, newlines); `encodeForm` (fields→urlencoded); `hasBody`; `contentTypeForBody` |
| resolvedHeaders defaults | same file | reflects the `-d` default `Content-Type: application/x-www-form-urlencoded` (12a carry-forward), auth header, and the includeContentType/includeAuth options |
| buildCurl / buildWget | same file | a known model → exact expected command string (method, -H, -d, -u, flags); opts honored |
| Each generator represents the request | same file | toFetch/toNode/toPython/toHttpie/toPowerShell/toGo on a known model: method + url + headers + body + auth all present; ≥2 languages asserted EXACTLY, the rest structurally (assert key substrings / parsed-back equivalence) |
| convert dispatch | same file | `convert(model,lang)` === `to<Lang>(model)` for every CONVERT_LANGS id; unknown → fetch default; CONVERT_LANGS content |
| Round-trip | same file | `parse(buildCurl(model))` ≈ `model` (semantic deep-eq, modulo documented lossy fields) over a battery |
| Edges / TOTAL | same file | empty model, no-body GET, multipart `-F`, basic auth, query params → ACTUAL output; never a throw |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green (report count); `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Read the helpers (~680-725), `buildCurl` (~727), `buildWget` (~792), the 6 generators (~868-1077), and
`convert` (~1077) FIRST to learn the EXACT emitted strings + how each represents headers/body/auth/method.
Import `parseCurl` (read-only) for the round-trip. Assert what the lib ACTUALLY emits. Then:
1. **Helpers** — per-language string escaping exact; encodeForm; hasBody; contentTypeForBody; resolvedHeaders
   incl the `-d` default content-type (12a carry-forward) and the include* options.
2. **buildCurl/buildWget** — exact command for a representative model (GET, POST+JSON, form, auth, headers).
3. **Generators** — a shared known model → EXACT snippet for ~2 languages (e.g. fetch + python); structural
   for the other 4 (assert method/url/each header/body/auth appear, via substring or a tolerant parse-back).
   Cover a GET, a POST-with-body, and an auth+headers case.
4. **convert** — `convert(model,lang)===to<Lang>(model)` for all 6; default; CONVERT_LANGS shape.
5. **Round-trip** — `parse(buildCurl(model))` semantic-deep-equals `model` over a battery (note documented
   lossy fields — e.g. `-d` type:raw vs form, fragment); assert the content-type default survives.
6. **Edges/TOTAL** — empty model, no body, multipart, auth → actual output; never expect a throw.
Pin EXACT for ≥1-2 languages; structural for the rest. A generator that DROPS or CORRUPTS a modeled field
(lost header/body/auth, wrong method) is a genuine bug → STOP and surface. Characterize lossy-by-design.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p12-ctcurl/PRD.md` — scope/DoD + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `dev/20261003-library-test/14-ctcurl-parse/findings/HANDOFF.md` — the 12a model shape + lossy notes + the content-type carry-forward.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtCurl.parse.test.mjs` (the 12a sibling) — the pattern to copy + the model fixtures.
- `src/lib/utils/formats/CtCurl.mjs` — read the helper + build + generator + convert regions; confirm exact output FIRST.

## Deliverables
- `src/lib/tests/unit/CtCurl.generate.test.mjs`.
- `findings/HANDOFF.md` — the generator coverage matrix (language → exact✓/structural✓; field coverage),
  builder/helper coverage, round-trip results, the test count, command outputs, a note that this COMPLETES
  P12, and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output (it is TOTAL — never expect
  a throw). Pin exact for ≥1-2 languages, structural for the rest. A generator dropping/corrupting a modeled
  field is STOP-and-surface; characterize lossy-by-design.
- Cover the GENERATE side ONLY. Do NOT re-test tokenizeShell/parseCurl/parseWget (12a owns them) beyond
  importing parseCurl for the round-trip.
- Write only `src/lib/tests/unit/CtCurl.generate.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the generator coverage
matrix, state round-trip fidelity (+ documented lossy fields), confirm P12 is COMPLETE, and flag any
suspected bug. Write it to `findings/HANDOFF.md`.
