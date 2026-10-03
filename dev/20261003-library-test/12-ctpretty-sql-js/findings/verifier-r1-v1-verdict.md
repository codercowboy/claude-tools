# Verifier r1 v1 verdict — 12-ctpretty-sql-js (Phase 10c, SQL + JS)

**VERDICT: PASS** (with BUG-1 independently confirmed as a genuine lib bug that MUST be raised to the user; correctly pinned as `todo`, so it is not a test FAIL).

## 1. Re-run (all claims confirmed)
- `node --test src/lib/tests/unit/CtPretty.sql-js.test.mjs` -> tests 89, pass 87, fail 0, todo 2.
- `node --test src/lib/tests/` -> exit 0; tests 1004, pass 990, fail 0, todo 14. (The "failing tests" block printed at the bottom is just node's listing of `todo` entries, exit 0.)
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- `node scripts/test-all.mjs` ran to completion, exit 0, "10/10 suites passed" (lib step green, all e2e green incl. uuid-generator 41/41). No e2e flake this run, so nothing to attribute.
- No lib source modified: `src/lib/utils/formats/CtPretty.mjs` mtime Oct 2 21:51 (predates the new test file, Oct 3 23:45). `git` unavailable, so this rests on mtime + build-all 10/10; I made no edits to it myself (all mutations in tmp/ copies).

## 2. Mutation sweep (scratch copies in tmp/verifier-r1-v1/, real lib untouched)
Runner: `tmp/verifier-r1-v1/mut.mjs` (copies lib to CtPretty.mut.mjs, rewrites test import, runs node --test).

| mutation | result |
|---|---|
| (a1) regexAllowed always false | KILLED (10 fails) |
| (a2) regexAllowed always true | KILLED (6) |
| (a3) `)` allows regex | KILLED (1) |
| (a4) `return` not a regex keyword | KILLED (1) |
| (a5) `++/--` postfix allows regex | KILLED (1) |
| (a6) `}` -> division | KILLED (1) |
| (b) minifyJS drops newline-gap rule (`return\n1` fuses) | KILLED (5, incl. ASI-safety tests) |
| (c1) JS word-word space removed | KILLED (10) |
| (c2) JS op-char pair (`+ +`, `- -`) space removed | KILLED (2: exact fixture + "tokens that would fuse") |
| (c4) JS `1 .x` number-dot space removed | KILLED (1) |
| (c6) SQL minify drops separating space | KILLED (10) |
| (c7) SQL minify keeps comments | KILLED (4) |
| (d1) SQL keyword case inverted | KILLED (3) |
| (d2) SQL keyword guard removed | KILLED (3) |
| (d3) WHERE no longer a clause | KILLED (5) |
| (d4) AND sub-clause indent | KILLED (4) |
| (d5) GROUP BY clause removed | KILLED (1) |
| (d6) clause newline -> space | KILLED (6) |
| (d7) paren depth++ removed | KILLED (2) |
| (e1) template-head `${` not pushed | KILLED (7) |
| (e3) block `{` not pushed | KILLED (crash/fail) |
| (e4) block `}` not popped | KILLED (1) |
| (e5) middle `}..${` not re-pushed | KILLED (1) |
| (b2) line-comment no longer sets pendingNL | SURVIVED — EQUIVALENT mutant: the trailing `\n` ws token still sets pendingNL |
| (c3) `//`,`/*`-forming rule removed | SURVIVED — EQUIVALENT mutant: `/` is in OP so the generic op-char-pair rule already covers it (redundant lib code) |
| (c5) block-comment-adjacent space removed | SURVIVED — equivalent for minify (block comments are skipped before reaching jsNeedSpace); only matters for formatJS; low-value gap |
| (e2) template-close `braceStack.pop()` removed | SURVIVED — only observable on malformed/unbalanced input (stale 'template' entry then mis-treats a later stray `}`); no balanced-code test can see it. Minor gap: a malformed-input test (`` `${a}` `` followed by stray `}`) would kill it |

All five requested mutation families (a)-(e) are killed. Survivors are equivalent/near-equivalent, not hollow areas.

## 2b. Is the semantic-equivalence method sound?
Yes in principle: the significant-token-stream comparison catches fusions. With the op-pair rule removed, `a + +b`->`a++b`, `a - -b`->`a--b`, `a+ ++b`->`a+++b` all yield a DIFFERENT significant stream (verified in `tmp/verifier-r1-v1/eq.mjs`). Mutations c1 and c6 are caught by the battery tests ("JS/SQL semantic fidelity ... battery") themselves.
**Coverage concern (not a FAIL):** mutations c2 and c4 were NOT caught by the JS semantic battery (it contains no `a + +b` / `a - -b` / `1 .x` inputs); they were caught only by dedicated tests ("tokens that would fuse", exact fixture). Recommend adding `a + +b`, `a - -b`, `a+ ++b`, `1 .toFixed()` to the battery so the invariant test is self-sufficient.

## 2c. Independent re-derivation
- Pinned literals exist for each: formatSQL x2, minifySQL x1, tokenizeSQL x1, formatJS x1, minifyJS x1.
- SQL: `minifySQL('SELECT  a ,\n b -- c\n FROM /* x */ t ;')` — by hand: ws collapses to 1 space, each comment counts as ws, no space added before `;` that wasn't there -> `SELECT a , b FROM t ;` MATCHES the pin.
- JS: `minifyJS("a = 1 // c\nb = 2 /* x\ny */ c = /re/g.test(`t ${ x } u`) ; s = '//{;}'")` — by hand: `a=1`, newline (line comment/ws), `b=2`, newline (block comment containing \n), `c=` + one space before `/re/g` (op-char pair `=` `/`), `${ x }` -> `${x}`, ` ;` -> `;`, string verbatim -> `a=1\nb=2\nc= /re/g.test(`t ${x} u`);s='//{;}'` MATCHES the pin.
- Tricky token array: `tokenizeJS('return /re/g')` -> `[name return][ws ' '][regex /re/g]` (confirmed by running; matches the test's expectation after ws filtering).

## 3. BUG-1 adjudication — GENUINE BUG, semantic change in a "safe" minifier
Reproduced (script `tmp/verifier-r1-v1/bug1.mjs`, run against a copy of the real lib):
- `` `a${/x  +  y/.source}` `` -> `` `a${/x+y/ .source}` ``. Tokens show `punct /`, `name x`, `punct +`, ... i.e. division.
- `` x = `${ /[ ]+ \/ /g.test(s) }` `` -> `` x=`${/[]+\/ /g.test(s)}` `` (character class `[ ]` became `[]`).
- Semantic difference CONFIRMED by evaluating (not just reformatting): input template evaluates to `"ax  +  y"` (regex source `x  +  y`), output evaluates to `"ax+y"` (source `x+y`). `/x  +  y/.test('xxy')` is false but the output regex `/x+y/.test('xxy')` is true; `/a  b/` matches `"a  b"` but not `"a b"`, while the minified `/a b/` matches `"a b"` and not `"a  b"` (printed: false true true false). `[ ]+` matches a space; the output `[]+` is an empty class that never matches (`/[]+/.test(' ')` false).
- Wider than the builder reported: ANY space-bearing regex that is the first token after `${` or after a middle `}...${` is mangled, including nested templates (`` `${`${/a  b/}`}` `` -> `/a b/`), and `` `${ /a  b/.test(s) }` `` -> `` `${/a b/ .test(s)}` ``.
- WORSE (found by me, not in HANDOFF): a regex whose body contains `//` or a quote char is mis-lexed as a comment/string, so CODE IS DELETED, not just whitespace changed: `` x = `${/[//]/.test(s)}`;\ny(); `` minifies to `x=`${/[\ny();` — the rest of the line including the closing `}` and backtick is swallowed as a line comment. Output is a SYNTAX ERROR / lost code.
- Regexes elsewhere in `${}` are correct (confirmed): `` `${f(/a  b/)}` `` verbatim, `` `${x, /a  b/}` `` -> `x,/a  b/` verbatim, `` `${a ? /a  b/ : 1}` `` -> `a? /a  b/:1` verbatim. So the defect is exactly the `${`-head / middle-`}..${` previous-token position. Cause matches the builder's: `regexAllowed()` returns false for any `template` prev token; `jsIsValueEnd` (formatJS) already special-cases `/\$\{$/`, so the two disagree.
- Severity: HIGH for correctness (silent semantics change, and in the `//` / quote case silent code loss, from a minifier advertised as SAFE/never-rewrites), but LOW real-world likelihood (a regex literal as the very first token inside a template substitution is rare; needs spaces/`//` in the body). Net: medium-high; it violates the module's core contract so it warrants fixing even though rare.
- RECOMMENDATION: RAISE TO USER (STOP-and-surface class). Do not silently fix inside this TEST-ONLY epic. Suggested one-line lib fix (not applied): in `regexAllowed`, `if (p.type === 'template') return /\$\{$/.test(p.value);`. Suggest also adding the `[//]` code-loss case and `}b${/a  b/}` middle-position case to the todo tests.
- The 2 `todo` tests honestly characterize it: the tokenizer one asserts `regex /x/` after `` `a${ ``; the minify one asserts the regex survives verbatim and the significant stream is unchanged. Both assert CORRECT behavior and currently fail (shown as todo, exit 0). Confirmed they fail for the right reason (output above). Note they cover only the head `${` position and the `x  +  y` example; the middle-position, nested, and `//` code-loss variants are not pinned.

## 4. Cosmetic observations (verified by running)
- `formatJS('a=1 // note')` -> `"a = 1// note\n"`: defensible-but-ugly; still valid JS (comment preserved, newline forced after). Cosmetic, pinned as actual — acceptable; mention as polish.
- `formatJS('')` -> `"\n"` while `minifyJS('')`, `formatSQL('')`, `minifySQL('')` -> `""`: minor inconsistency; defensible (format always ends with trailing newline) but a trailing-newline-on-empty is arguably a nit. Not pinned? — HANDOFF says noted; acceptable.
- formatSQL blank line after `(` before nested SELECT: `select * from t where id in (select id from u)` -> `...in (\n\n  select id\n  from u)` — a real cosmetic defect (double newline: `nl(depth)` emitted after a line already starts a new line, and `)` hugs the last line). Not a semantic bug. Builder left it unpinned — reasonable (pinning would lock in a likely-to-change quirk), but worth a lib TODO.
- Also observed: SQL `select a,b` continuation indent is 3 spaces (indent+1); pinned as actual, fine.

## 5. Coverage-quality concerns (not FAILs)
1. JS semantic battery lacks op-fusion inputs (`a + +b`, `a - -b`, `1 .x`); c2/c4 were caught only by dedicated tests.
2. e2 (template-close pop) survives; add a malformed-input test (stray `}` after a closed template).
3. BUG-1 todo tests cover only the head position; add middle-position, nested, `//`-in-regex code-loss cases.
4. c3 and c5 survivors indicate redundant rule (c3) / format-only effect (c5); no action required.
5. Tests are genuine behavioral assertions (exact pinned literals + token-stream equivalence), no tautologies seen.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtPretty.sql-js.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/mut.mjs    # mutation sweep (scratch copies)
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/mut2.mjs   # which tests catch c1/c2/c4/c6
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/eq.mjs     # token-stream method catches fusion
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/bug1.mjs   # BUG-1 reproduction + semantic diff
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/bug1c.mjs  # BUG-1 code-loss variant
node dev/20261003-library-test/12-ctpretty-sql-js/tmp/verifier-r1-v1/cos.mjs    # cosmetic observations
```

**PASS** — suite green (89/87/2 todo; 1004/990/14 todo; build 10/10; test-all 10/10), all five mutation families killed (survivors equivalent), pinned fixtures re-derive by hand, and BUG-1 is a real, correctly-`todo`'d lib bug (worse than reported: code loss via `//` in the regex) that must be raised to the user.
