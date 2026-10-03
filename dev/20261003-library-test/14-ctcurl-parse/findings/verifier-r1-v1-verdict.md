# Verifier r1 v1 verdict — 14-ctcurl-parse (Phase 12a)

## VERDICT: PASS
Suite is green with the claimed counts, 27/28 mutations killed (the 1 survivor is an equivalent mutant), fixtures are semantically correct against curl, and TOTAL assertions never expect a throw. Three surfaced issues adjudicated below (one genuine bug, two low).

## DoD evidence
- `node --test src/lib/tests/` -> tests 1479, pass 1463, fail 0, todo 16 (matches claim). The "failing tests:" heading in output is the todo listing, not failures.
- `node --test src/lib/tests/unit/CtCurl.parse.test.mjs` -> 256/256 pass.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- `node scripts/test-all.mjs` -> exit 0, "10/10 suites passed" (no e2e flake this run; nothing to attribute).
- No lib source modified: git is blocked; mtimes: CtCurl.mjs Oct 2 21:51, new test Oct 4 00:13 (lib is older than the test, untouched this round); build-all 10/10. Cannot prove with git; evidence is mtime + build check.

## Mutation sweep (scratch copy in tmp/mut/, real lib never touched; script tmp/mut/run.mjs)
27 of 28 killed. Killed: a1-a4 (tokenizer: sq, dq escape, continuation, adjacent concat), b1-b9 (-H append, POST inference, -X upper, -u first colon, -k, -L, -m, -e ;auto, -F file kind), c1-c3 (-G lift value, -G forces GET, -G clears body), d1,d2,d4,d5 (decodeBasic split, basicHeaderValue, bearer lift, utf8 base64), e1-e7 (splitUrlParams '=' / empty pair, safeDecode '+', applyUrlParams join / ?-vs-& / encode, fullUrl).
Survivor: d3 (removed `.trim()` before decodeBasic in header-lift). Equivalent: splitHeader already trims the value, so the extra trim is unreachable-redundant. Not hollow.

## Independent fixture re-derivation (against curl semantics)
- REAL 1 (copy-as-cURL JSON POST + Bearer): -X POST, query page/per_page split, Authorization lifted to bearer (modeling choice, curl sends the header), --data-raw JSON body kept raw, Content-Type/Accept kept, --compressed. Correct.
- REAL 2 (-sSL -u -A -e --max-time -k): default GET, basic auth, UA/referer/timeout/insecure/follow all right; -s,-S noted. Correct.
- Also checked 3,4,5: -F @file => file kind correct; -G + --data-urlencode lifts to params (curl would percent-encode; model stores decoded, consistent); -d k=v&k=v -> POST, -b -> Cookie header. Correct.
- Concerns (not wrong parses, but worth knowing): (i) curl `-d` is modeled as body.type 'raw', yet real curl sends Content-Type: application/x-www-form-urlencoded by default; a 12b generator/round-trip must not lose that. (ii) wget REAL fixture: `--post-data='{"a":1}'` is modeled as type 'form' with a bogus field `{"a":1}`=''; raw is preserved so it's lossy-but-OK; real wget does send raw bytes as form content-type. Pinned as-is; fine.
- curl is available (8.7.1) and corroborated issue (a) (see below).

## Malformed / TOTAL
`grep assert.throws|rejects` on the test file: zero hits. All TOTAL tests assert returned best-effort models + notes (empty/null/undefined, unknown flags, missing URL, no-colon header, duplicate headers, EOF value flags, unterminated quotes, bad percent escapes). Never expect a throw.

## Adjudication of the three issues (reproduced via /tmp/r.mjs, plus real curl 8.7.1)
(a) `--url`:
- Reproduced: `curl --url https://x.test/a` -> url correct (positional fallthrough) but note "Unrecognized flag --url — left out of the model." (misleading; URL isn't left out). `curl --url=https://x.test/a` -> url "" with the note.
- Reference behavior: real curl accepts `--url <url>`. BUT real curl 8.7.1 rejects `--url=X` ("option --url=...: is unknown"); curl does not support `--opt=value` long syntax at all. So the url=="" case is on input that is invalid curl (the lib's `--flag=value` support is a courtesy). The `--url X` space form is the real compat gap and only gets a false note; edge: `curl https://a --url https://b` yields b as an "Extra argument".
- Severity: LOW (cosmetic false note + multi-URL edge; not data loss for valid curl). Recommend: raise to user as a small fix (add `case '--url'` to the positional logic), not a blocker.
(b) wget `-nv` dead code:
- Reproduced: `wget -nv URL` -> notes "Unrecognized flag -n" + "-v ignored"; `--no-verbose` works. Model unaffected. Real wget `-nv` is valid (no-verbose).
- Severity: LOW (spurious note only, dead `case '-nv'`). Recommendation: just note / batch with (a); same fix class applies to other `-n*` wget cluster flags (-nc, -nH). Not worth a separate user interrupt.
(c) `#fragment` in last query value:
- Reproduced: `curl "https://x.test/p?a=1&b=two#frag"` -> b = "two#frag"; fullUrl rebuilds `...b=two%23frag`. Without a query the fragment stays in url (`.../p#frag`), harmless.
- Reference behavior: curl (and browsers/fetch) never send the fragment; it is client-side only. So the model corrupts the last param value and the regenerated request differs from the real one (the server sees `two%23frag`).
- Severity: MEDIUM-LOW genuine bug (silent request alteration when pasting a URL with an anchor and a query). Recommendation: RAISE to user; fix in splitUrlParams (peel off the `#...` suffix before splitting query, keep it separately or drop). The test pinning current behavior should flip when fixed.

## Extra finding (not in the brief)
wget `--max-redirect=N` always sets followRedirects=true, even `--max-redirect=0` (which DISABLES redirects in wget; wget follows by default). Reproduced (`--max-redirect=0` -> followRedirects true). Low severity; the test pins only `=5`. Mention to user alongside (a)/(b).

## Coverage-quality concerns (not FAILs)
- Equivalent survivor d3 only. No hollow area found in the five requested categories.
- No test pins `--max-redirect=0` semantics (see above) or `-d @file` / `--data-binary @file` handling.
- Pinned quirks (a,b,c) assert current (buggy) behavior; they will need flipping with fixes (builder noted this).

## Reproduction
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/ ; node --test src/lib/tests/unit/CtCurl.parse.test.mjs
node scripts/build-all.mjs --check ; node scripts/test-all.mjs
node dev/20261003-library-test/14-ctcurl-parse/tmp/mut/run.mjs   # mutation sweep on scratch copy
node /tmp/r.mjs ; curl -s --libcurl /dev/stdout --url=https://x.test/a   # issue repro / curl check
