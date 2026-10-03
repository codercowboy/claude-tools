# Verifier r1 v1 - 15-ctcurl-generate (Phase 12b)

## Verdict: PASS (with one genuine fidelity finding to raise: quirk #1)

## DoD evidence
| Claim | Result |
|---|---|
| Suite green | `node --test src/lib/tests/` -> 1519 tests, 1503 pass, 0 fail, 16 todo (matches builder). CtCurl.generate: 40/40 pass. |
| build-all | `node scripts/build-all.mjs --check` -> 10 tools, 0 failed. |
| test-all | `node scripts/test-all.mjs` ran to completion, exit 0, "10/10 suites passed" (lib step green; e2e suites 71/95/205/92/38/27/38/76/41 all passed). No e2e flake this run. |
| No lib source touched | git blocked/unused; CtCurl.mjs mtime Oct 2 21:51 vs new test file Oct 4 00:27 (lib older than test); build-all 10/10. Real lib byte-identical to my pre-mutation copy (`cmp`) after the sweep. |
| Hand re-derivation | I derived fetch + python for POST_JSON by hand from the model (`?q=a%20b` URL, Accept + derived Content-Type + `Authorization: Basic dTpw` [base64 of u:p checked independently], JSON-escaped body, redirect follow; python: basic via `auth=("u","p")` not header, `timeout=30`, no allow_redirects because follow=true). Both match the asserted literals in the test (lines ~297 and ~349) exactly. Not a wrong-but-self-consistent fixture. |
| Structural checks | Cross-language block checks method+url+every header+body+auth per language (not just non-empty); mutations below confirm. |

## Mutation sweep (scratch copy in tmp/mut; real lib never touched). Every mutation turned the suite RED
- **Drop a header** (skip first header): fetch 5, node 3, python 4, httpie 3, powershell 5, go 3, buildCurl 9, buildWget 3 failures. Drop LAST header (fetch): 5. All KILLED.
- **Wrong method** (hardcode GET): fetch 3, node 3, python 3, httpie 3, powershell 3, go 3, wget 4, buildCurl 5. All KILLED.
- buildCurl: -d dropped 4, -H format changed 10, -u 5, -F 3, -L 5, URL without params 5, GET+body -X 1, --compressed 3, -m 5, -k 3, --data-urlencode 1. KILLED.
- Quoting: shellQuote no escape 9, shellQuote never-safe 15, jsStr 4, pyStr 3, goStr 3, psStr 2. KILLED.
- resolvedHeaders: json CT null 10, form CT null 10, basic auth off 7, bearer value broken 10, dup-CT guard removed 1 (weakest, but killed), UA off 6. KILLED.
- Body drop per generator (fetch 1, node 2, python 3, httpie 1, go 3, powershell 3 via different mutation). KILLED.
- Auth drop per generator (python 3, httpie 3, ps 3, go 2, fetch 3, node 2). Query params dropped from URL (fetch 3, python 3). Flags (node timeout, python verify/allow_redirects, ps SkipCertificate/MaximumRedirection, fetch redirect, httpie follow/verify) each 1-2. encodeForm 7, hasBody 2, convert default 1, convert go-dispatch 1, wget user/pass/post-data/multiple. powershell/go form body, multipart file python. All KILLED.
- Survivors: none (the first attempt at two mutations had regex typos and was redone; both then killed).

## Quirk adjudication
1. **Raw body gets no derived Content-Type - GENUINE FIDELITY BUG (severity: medium).**
   Reproduced: `parseCurl('curl -d foo=bar https://x')` -> `{method:POST, body:{type:raw,raw:'foo=bar'}, headers:[]}`. Real curl sends `Content-Type: application/x-www-form-urlencoded`. Generated output omits it everywhere:
   - fetch / node: `fetch("https://x",{method:"POST",body:"foo=bar"})` - a real fetch with a string body sends `text/plain;charset=UTF-8`, so a server form-parser sees a different request than curl produced.
   - python: `requests.request("POST",..., data="foo=bar")` - no Content-Type at all (requests does not add one for a str).
   - go: no Content-Type; httpie `echo foo=bar | http POST` sends none/different; wget `--body-data` sends none. PowerShell happens to default POST string bodies to form-urlencoded, so it accidentally matches.
   - buildCurl is fine (`curl https://x -d foo=bar` re-adds it, so the round trip is unaffected). Explicit `-H Content-Type: text/plain` is preserved correctly. Form-typed bodies (the `-d` default only fires when the UI/model says form) do emit it, so the gap is specifically raw. The builder pinned this as characterization, not a fix.
   - Root cause is split: 12a parse maps `-d` to type raw and drops the implicit header; 12b contentTypeForBody(raw)=null. Recommend raising to the user: either parseCurl should append an explicit `Content-Type: application/x-www-form-urlencoded` header (or type form) when `-d` has no CT, or the non-curl generators should default raw-from-`-d` to form-urlencoded. A hand-entered raw body in the UI is ambiguous, so this is a design decision. Not a test failure; the tests honestly pin current behavior.
2. **buildWget multiline URL glued to last flag line - cosmetic, defensible.** `wget \ --method=POST \ --body-data=a=1 https://x` (wget flags are `--x=v` single tokens, so the URL always lands on the last flag line). Valid shell, ugly. Low; optional raise.
3. **powershell/go multipart is a comment only - by-design omission, low.** PowerShell has `-Form` (6.1+) and Go has mime/multipart, so omission loses the fields; defensible as best-effort, comment tells the user. Optional raise as an enhancement.
4. **powershell/go form as one pre-encoded string - by-design, acceptable.** Semantically equivalent request (same wire bytes, CT header present). No bug.

## Coverage-quality concerns (non-blocking)
- dup-Content-Type guard in resolvedHeaders is caught by only 1 test; thin but present.
- No test asserts that a raw `-d` request through the non-curl generators has the correct Content-Type (the quirk is pinned as "absent", so it will need updating if quirk 1 is fixed).
- joinCmd: a safe-unquoted value starting with `-` could be mis-grouped in multiline; not tested (out of DoD scope, unverified).

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node -e "import('./src/lib/utils/formats/CtCurl.mjs').then(c=>{const m=c.parseCurl('curl -d foo=bar https://x');console.log(c.toFetch(m),c.toPython(m))})"
# mutations: dev/20261003-library-test/15-ctcurl-generate/tmp/mut/run.sh <name> '<perl subst>' (scratch copy of lib + test)
```
No node --test processes left running.

PASS - 40 generate tests green and every mutation (incl. drop-header and wrong-method across all 8 generators/builders) turns the suite red; fetch/python literals match my hand derivation; only open item is the real fidelity gap in quirk #1 (raw `-d` omits curl's default form-urlencoded Content-Type), to raise to the user.
