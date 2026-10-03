# HANDOFF — 14-ctcurl-parse (Phase 12a, builder r1)

Product: `src/lib/tests/unit/CtCurl.parse.test.mjs` (test-only; no src/lib edits).

## Gate
- `node --test src/lib/tests/unit/CtCurl.parse.test.mjs` -> 256 tests, 256 pass, 0 fail.
- `node --test src/lib/tests/` -> 1479 tests, 1463 pass, 0 fail, 16 todo (todo = pre-existing known-bug markers, e.g. CtDiff).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."

## Coverage matrix
tokenizeShell (24 cases): empty/ws, sq/dq, dq escapes, no $VAR expansion, backslash, trailing backslash, continuation LF/CRLF/in-dquote, adjacent-quote concat, mixed, empty quotes, unterminated quotes, ANSI-C $'..', JSON-in-quotes, non-string coercion.
parseCurl flags tested: URL positional/leading curl/CURL/URL-last-or-middle/query->params; -X/--request/--request=; -XPOST; -H/--header (repeated, colons, trim, no-colon, dup); Authorization Bearer/Basic/other lifted; UA/Referer header lifted; -d/--data/--data-raw/--data-binary/--data-ascii/--data-urlencode/--json; -G/--get (lift, explicit -X, with --json/-F); -F/--form/--form-string (@file, <file); -u/--user; -b/--cookie; -A; -e/--referer(;auto); -L; -k; --compressed; -m/--max-time; clusters -sSL -sSLk -LkG -sXPOST -HAccept:.. -dfoo=bar -uu:p -LXPUT; 3 orderings; -o/-O/-s/-S/-v/-i/-f notes. Method inference: GET default, POST on data, -G forces GET, explicit -X wins. 5 real one-liners asserted to the FULL model.
parseWget: --header, --method, --post-data, --body-data, --post-file/--body-file, --user/--password/--http-user/--http-password, -U/--user-agent, --referer, --no-check-certificate, --compression, --max-redirect, --timeout/--read-timeout, -O/-o/-q/-c/-N notes, -qO- cluster, any order, 1 full real one-liner.
Helpers: constants, emptyModel, normalizeModel (coercion/filter/invalid types/timeout/idempotent/no-alias), modelWithoutSecrets, splitUrlParams (15), applyUrlParams (10), fullUrl, split->apply round-trip + parse->fullUrl, safeDecode, utf8ToBase64/base64ToUtf8 (incl. Buffer cross-check), basicHeaderValue/decodeBasic + round-trip (+ colon-in-user lossy case), parseFormPairs (13).

## Malformed / notes policy (observed, all asserted)
- TOTAL: never throws. Empty/null/undefined/bare `curl`|`wget` -> emptyModel, notes [].
- Unknown flag -> note `Unrecognized flag X — left out of the model.` (`--x=…` marker for inline values); its separate value token is NOT swallowed and may become the URL.
- Extra positional -> first wins, note `Extra argument "…" ignored…`. Missing URL -> url "" , no note.
- Value flag at EOF -> note `<flag> expected a value but none was given.`, nothing set.
- Header w/o colon -> {name, value:''}; duplicate headers kept in order; Authorization/User-Agent/Referer headers are lifted (last wins; header lift overrides -u/-A).
- Display flags (-s -S -v -i -f -#), -o/-O are noted-and-ignored. Bad Basic base64 -> basic with empty creds. Bad %-escapes fall back to raw text.
- Lossy: --data-urlencode does not percent-encode raw; -F beats -d; --json beats -d; -G does not lift json/multipart bodies; '+' in query normalises to %20 on rebuild; bare query key gains '='.

## Suspected bugs / quirks (characterized, NOT weakened; no lib edit)
1. `--url` is not a supported curl flag. `--url X` works only by accident (X falls through as the positional, plus an Unrecognized note); `--url=X` LOSES the URL (url ""), with an Unrecognized note. Lossy but flagged by note, so characterized rather than STOP; recommend adding `--url` to parseCurl. (Pinned in two table rows — update them if fixed.)
2. wget `case '-nv'` is dead code: `-nv` is cluster-split into -n -v, so output is `Unrecognized flag -n` + `-v` ignored note. Pinned.
3. Fragments (`#x`) are not stripped from the query's last param value (pinned).

## Remains for 12b
buildCurl, buildWget, resolvedHeaders, contentTypeForBody, hasBody, encodeForm, shellQuote/jsStr/pyStr/goStr/psStr, toFetch/toNode/toPython/toHttpie/toPowerShell/toGo, convert, CONVERT_LANGS, and build->parse round-trips.

## Repro
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtCurl.parse.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
