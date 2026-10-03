# HANDOFF — 15-ctcurl-generate (Phase 12b, builder r1)

Product: `src/lib/tests/unit/CtCurl.generate.test.mjs` (test-only; no src/lib edits). **Completes P12** (12a parse + 12b generate).

## Gate
- `node --test src/lib/tests/unit/CtCurl.generate.test.mjs` -> 40 tests, 40 pass, 0 fail.
- `node --test src/lib/tests/` -> 1519 tests, 1503 pass, 0 fail, 16 todo (pre-existing; was 1479 -> +40).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."

## Generator coverage matrix
| lang | exact | structural | fields covered |
|---|---|---|---|
| fetch | GET, POST json+basic, form, multipart | cross-lang | method/url/headers/body/auth(Basic hdr)/redirect/-k note |
| python | GET, json+basic (auth=), bearer raw (hdr), form, multipart (partial) | cross-lang | + verify/timeout/allow_redirects |
| node | — | prefix, headers, body, redirect, AbortSignal, form/multipart, -k note | all |
| httpie | GET, json+basic, bearer raw, form, multipart, -k | cross-lang | all (CT suppressed, -a for basic, Authorization item for bearer) |
| powershell | GET, json+basic, form/multipart structure | cross-lang | all (multipart = guidance comment only) |
| go | GET exact | POST json, form, multipart comment, -k note | all (multipart = comment only) |
Cross-language check: 4 models (GET, POST json+basic, PUT raw+bearer+hdrs, POST form) x 6 langs assert method+url+every header+body+auth; multipart x 6; UA/Referer x 5 (+httpie); special-char escaping; query params folded into URL x 6 + curl/wget.

## Builders/helpers
buildCurl: exact commands (GET/json/raw/form/multipart/bearer/basic), method rules (explicit GET+body, implied POST), longFlags, multiline (exact), flags -L -k --compressed -m, UA/Referer as -H, --data-urlencode, form raw fallback. buildWget: exact (json/raw/form), flags, multiline, multipart note. shellQuote/jsStr/pyStr/goStr/psStr exact escaping tables; encodeForm; hasBody; contentTypeForBody; resolvedHeaders (derived CT, auth, UA/Referer, both options, no-dup CT, no mutation). convert === to<Lang> for all CONVERT_LANGS x 6 models; unknown -> fetch.

## Round-trip (parseCurl(buildCurl(m)))
12 models x 4 option combos: semantic equality (effective headers incl. Content-Type, payload text, method/url/params/auth/flags), notes empty. Content-Type default SURVIVES: form body emits explicit `-H Content-Type: application/x-www-form-urlencoded` and parses back as a header; resolvedHeaders of the parsed model adds no duplicate.
Lossy-by-design (pinned): json -> raw (+explicit CT header); form fields[] -> raw urlencoded string; '+' in query -> %20; bearer returns as auth (Authorization header lifted); UA/Referer return as flags. Multipart fields (kind data/file) survive.

## Quirks (characterized, none is a dropped/corrupted field -> no STOP)
1. Raw body has no derived Content-Type (`contentTypeForBody(raw)===null`), though real curl `-d` sends x-www-form-urlencoded. Generators (fetch etc.) therefore send no CT for raw. Recommend considering a default; pinned in "quirk:" test.
2. buildWget multiline: trailing URL is glued to the last value-flag line (`--body-data='x' https://...`) via joinCmd grouping. Pinned. (buildCurl multiline puts URL on line 1, fine.)
3. powershell/go render multipart as a comment only (fields omitted); wget omits multipart with a `# note:` line. Documented lossy.
4. powershell/go send form as a pre-encoded string; fetch/node/python/httpie per-field.

## Repro
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtCurl.generate.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
