# Verifier r1 v1 verdict — 11-ctpretty-html-css (Phase 10b)

**VERDICT: PASS** (with stated coverage gaps and two genuine lib bugs to raise).

## 1. Re-run (independent)
- `node --test --test-reporter=tap src/lib/tests/` -> tests 915, pass 903, fail 0, todo 12. Matches claim.
- `node --test ... CtPretty.html-css.test.mjs` -> 203 tests, 197 pass, 0 fail, 6 todo. Matches.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- `node scripts/test-all.mjs` ran to completion: lib step green, every e2e suite green (base64 71, color-converter 95, ..., uuid-generator 41), final "10/10 suites passed", exit 0. No e2e flake this run.
- Stack traces in the lib output are the `todo` tests' expected failures (reported as todo, not fail).

## 2. Mutation sweep (scratch copies in `tmp/mut`, real lib untouched)
Scripts: `tmp/mut-sweep.mjs`, `tmp/mut-sweep2.mjs`; raw results `tmp/mut-results.txt`. Baseline no-op: 197 pass / 0 fail.

| Area | Mutation | Result |
|---|---|---|
| (a) void set | drop br / img / meta / hr / empty set | KILLED (11/6/5/6/13 fails) |
| (b) inline vs block | drop span / drop a / inlineAll never / minify inline-neighbour as block | KILLED (4/2/44/4) |
| (b) inline vs block | "any element counts as inline" in inlineAll | SURVIVED, equivalent mutant (htmlRenderInline already returns null for non-inline children; the guard is redundant) |
| (c) htmlKeepComment | drop `[endif]` / drop bang / keep all / return false | KILLED (1/2/3/4) |
| (c) htmlKeepComment | remove the `^<!--[if` clause only | **SURVIVED** — GAP: no test uses a conditional comment lacking `[endif]`, e.g. `<!--[if !IE]><!-->` (downlevel-revealed opener). Real lib behavior is correct (I confirmed it is kept), but the clause is unpinned. |
| (d) CSS blank line | remove blank line / only rule-rule | KILLED (10/6) |
| (d) CSS indent | nested no indent / default indent 4 / decl colon spacing | KILLED (48/46/48) |
| (d) CSS indent | closing brace of an EMPTY rule unpadded | **SURVIVED** — GAP: no test has a nested empty rule (`@media x{a{}}`). |
| (e) string/url skip | minify no string skip / minify no url skip / parser no string skip / parser no url skip / isUrlAt false / url terminator broken / last-`;` kept | KILLED (4/1/7/6/3/2/22) |
| (e) string skip | `cssSplitTopLevel` no string skip (`a[title="x,y"]{}`) | **SURVIVED** — GAP: comma inside a quoted selector string is untested. |
| (e) string skip | `cssCollapseWS` no string skip | **SURVIVED** — GAP: multi-space inside a string in a declaration through formatCSS is untested. |
| (e) string skip | `cssReadString` escape handling removed (`"q\"}"`) | **SURVIVED** — GAP: escaped quote inside a string is never exercised. |
| rawText | remove formatHTML `\n{3,}` collapse | KILLED (1) (the todo/characterization test) |

Core targets (a)-(e) each have killed mutations, so none is wholesale hollow. The survivors are secondary branches listed above. Not FAIL-worthy, but cheap to add (5 tiny tests).

Pinned exact fixtures: both languages have pinned literals (HTML tables ~16 fixtures, CSS ~18, each with `pretty` and `min` literals).

Independent hand derivations (computed from the lib source before running, then confirmed by running):
- HTML nesting `<div><ul><li>a</li><li>b <b>c</b></li></ul></div>` -> `<div>\n  <ul>\n    <li>a</li>\n    <li>b <b>c</b></li>\n  </ul>\n</div>\n`. Matches lib; the same shape is asserted in the suite.
- HTML inline collapse `<p>Hello <b>big</b>   <i>world</i></p><br>` -> `<p>Hello <b>big</b> <i>world</i></p>\n<br>\n` (inline-only children go on one line; runs of spaces collapse to one; void `br` is not closed). Matches.
- CSS `@media (max-width:600px){a{color:red}b,c{margin:0 !important}}` -> `@media (max-width:600px) {\n  a {\n    color: red;\n  }\n  b,\n  c {\n    margin: 0 !important;\n  }\n}\n` (one selector per line, `: ` after colon). Matches; the suite's analogous `@media` literal (test file line ~407) agrees.
- minifyCSS `a { color : red ; }\n\nb>c { margin : 0 auto ; }` -> `a{color:red}b>c{margin:0 auto}` and `a{background:url( x y.png );content:"a  {  }" }` -> `a{background:url( x y.png );content:"a  {  }"}`. Matches.

## 3. Adjudication

### (a) minifyCSS stray spaces around dropped comments — GENUINE BUG, low severity
Reproduced: `minifyCSS('a{color:red}\n/* c */\nb{x:y}')` -> `a{color:red}  b{x:y}`; `a{color:red/* in */;margin:0}` -> `a{color:red ;margin:0}`; `a{/* c */color:red}` -> `a{ color:red}`; `a /*c*/ b{x:y}` -> `a  b{x:y}` (two spaces). `minifyCSS(minifyCSS(x)) !== minifyCSS(x)` (second pass yields `a{color:red}b{x:y}`), and `minifyCSS(formatCSS(x)) === minifyCSS(x)` still holds only because both carry the same defect.
Reference behavior: a dropped comment is whitespace; output must equal minifying the same input with the comment replaced by a single space (`a{color:red} b{x:y}` -> `a{color:red}b{x:y}`), i.e. `a{color:red}b{x:y}`, `a{color:red;margin:0}`, `a{color:red}`; and the function must be idempotent. Cause: the comment branch (lines ~345-349) appends `' '` without the STRUCT-neighbour check the whitespace branch applies.
Severity: low. CSS semantics are unchanged (extra whitespace is insignificant); it is a minifier-quality and idempotency defect. Recommendation: raise to user as a small, safe fix (merge the comment branch into the whitespace-run logic); the 5 `todo` tests become live regression tests. Not blocking.

### (b) formatHTML collapses 3+ newlines inside pre/script/style/textarea — GENUINE BUG, medium severity
Reproduced: `<pre>a\n\n\n\nb</pre>` -> `<pre>a\n\nb</pre>`; also textarea, style, script, and a `<script>` template literal (`` `a\n\n\nb` `` -> `` `a\n\nb` ``). `minifyHTML` preserves them verbatim (`a\n\n\n\nb`). Same root-cause class as the Markdown code-block bug: a global `\n{3,}` collapse over the whole joined output (line ~878) is not exempt for preformatted regions. Mutation f1 (remove the collapse) turns only the characterization test red, which confirms the replace is the sole cause and is not needed for anything else (emitted lines never contain empty strings except inside raw text).
Reference behavior: rawText content must be byte-identical to the input (`<pre>a\n\n\n\nb</pre>` stays as is); formatHTML must be lossless for rawText, as minify already is. Also affects JS in `<script>` (template literal / string contents change: a semantic change, not just whitespace).
Related, same class, unreported by builder: the same collapse eats blank lines inside multi-line HTML comments (`<!-- a\n\n\n\nb -->` -> `a\n\nb`), CSS comments (`/* a\n\n\n\nb */` -> `a\n\nb`) and CSS strings with escaped newlines (`content:"x\\\n\n\n\ny"` -> `\n\n`). Lower impact, same one-line fix (formatCSS line ~331, formatHTML ~878).
Severity: medium (user-visible data loss in `<pre>`/`<textarea>`, possible semantic change in `<script>`). Recommendation: RAISE to user; fix is deleting/limiting the global collapse. The lone `todo` is correctly asserting the right behavior.

### (c) Minor quirks — characterizations are defensible, with notes
1. Unterminated comment not a fixed point (`<div><!-- never` appends `</div>` per pass; reproduced through pass 3): garbage-in behavior, defensible for a tolerant formatter; low. Mention only (idempotency is documented as a property of valid input).
2. `<script src=a.js/>` -> `<script src=a.js/></script>`: in HTML a self-closing slash on `script` is ignored by browsers, so the browser needs the `</script>` and the output is actually correct. Defensible; not a bug.
3. Synthesized close tags lowercased (`<P>x</p>`, `<DIV><P>x` -> `...</div>`): harmless in HTML (case-insensitive); cosmetic. Defensible.
4. `minifyCSS('a{color:red;;}')` -> `a{color:red;}`, then `a{color:red}` on pass 2: a second idempotency break (non-comment) from the `;}` drop being a single non-repeating pass. Bug-class same as (a) (minify not idempotent), cosmetic (1 byte). Recommend bundling with (a) as "minifyCSS idempotency" rather than a separate raise; valid-but-sloppy input (`;;` is legal CSS). Low.

## 4. No lib source modified
`git` is blocked; evidence: `src/lib/utils/formats/CtPretty.mjs` mtime Oct 2 21:51:25 vs the new test file Oct 3 23:29:32 (lib file predates the work; every mutation was written only to `tmp/mut/...`); `build-all --check` 10/10; the real lib reproduces identical behavior to what the todo tests describe. Many other src/lib files are newer than CtPretty.mjs from other rounds, none under this phase's scope.

## 5. Coverage-quality concerns (not FAILs)
- Unpinned: `<!--[if` clause without `[endif]`; nested empty rule closing-brace padding; comma in quoted selector; whitespace inside a quoted string via formatCSS; escaped quote in a string.
- Equivalent-mutant note on `inlineAll` element guard (dead redundancy in lib, not a test gap).
- Builder missed that the (b) defect also hits comments in both languages and CSS strings.

## 6. Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test --test-reporter=tap src/lib/tests/ | grep -E '^# (tests|pass|fail|todo)'
node --test --test-reporter=tap src/lib/tests/unit/CtPretty.html-css.test.mjs | grep -E '^# (tests|pass|fail|todo)'
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node dev/20261003-library-test/11-ctpretty-html-css/tmp/mut-sweep.mjs
node dev/20261003-library-test/11-ctpretty-html-css/tmp/mut-sweep2.mjs
node dev/20261003-library-test/11-ctpretty-html-css/tmp/repro.mjs
node dev/20261003-library-test/11-ctpretty-html-css/tmp/repro2.mjs
```

**PASS** — suite is green and the core HTML/CSS behaviors are mutation-protected; both surfaced lib bugs are real and correctly characterized (a: low, b: medium, raise).
