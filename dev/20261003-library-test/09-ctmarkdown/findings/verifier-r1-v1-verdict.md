# Verifier verdict — 09-ctmarkdown r1 v1

**VERDICT: PASS** (with 1 minor coverage gap and 2 lib issues to raise to the user; none are test failures).

## DoD evidence

| Claim | Result |
|---|---|
| `node --test src/lib/tests/` green | tests 622, pass 618, fail 0, todo 4 (matches builder) |
| CtMarkdown file | tests 177, pass 175, fail 0, todo 2 (matches) |
| `node scripts/build-all.mjs --check` | "Checked 10 tool(s); 0 failed." |
| `node scripts/test-all.mjs` | ran to completion: lib step green, ALL 9 e2e suites passed (71/95/205/92/38/27/38/76/41), "10/10 suites passed", exit 0. No e2e flake this run, so nothing to attribute. |
| No lib source touched | `git` blocked. mtimes: `CtMarkdown.mjs` Oct 2 21:51 (pre-round); `CtMarkdown.test.mjs` Oct 3 23:05 (new). build-all 10/10. Lib source unmodified by the builder as far as inspectable. |
| All 5 exports covered | mdToHtml (block/inline/safety/edge tables), parseInline (3 tests), escapeHtml/escapeAttr (5), sanitizeUrl (31-row matrix + 2). Confirmed by reading the file. |
| Exact-output assertions | All block/inline/edge rows are `assert.equal(mdToHtml(md), literalHtml)`. Safety tests use exact literals; the only loose asserts (`includes('<td>…')` for the table cell, `!/<script/`) are supplementary to exact ones or inside the fuzz. |

## Mutation testing (scratch copy in `tmp/verifier-r1-v1/m/`, real lib never touched)
Harness: `tmp/verifier-r1-v1/mut.mjs`, `m2.mjs`. Baseline copy: fail 0 / pass 175 / todo 2. 46 mutants, results:

- (a) escapeHtml: `<` no-op RED(16), `&` no-op RED(7), `"` no-op RED(6); escapeAttr `'` no-op RED(3), `"` no-op RED(4).
- (b) sanitizeUrl: drop javascript:/vbscript: block RED(19); drop vbscript only RED(3); drop entity decode RED(2); drop control-char/whitespace strip RED(3); drop trim RED(2).
- (c) data: — drop data: block RED(7); allow image w/o allowImage RED(3); allow any data: under allowImage RED(3); link context given allowImage:true RED(1).
- (d) block: heading cap RED(1), list nesting RED(5), ol start RED(1), hr RED(6), tight-unwrap RED(19), table align RED(2), fence lang class RED(3), blockquote nesting RED(8), setext RED(1), CRLF RED(1), task list RED(2), PUA-sentinel strip RED(1), indented code RED(4).
- (e) inline: link href RED(19), title RED(7), bold RED(4), em RED(6), strike RED(2), inline-code escape RED(3), img alt escape RED(1), autolink sanitize RED(1), mailto escape RED(1), backslash-newline break RED(1), two-space break RED(2), backslash escape RED(3), link title attr-escape RED(1), fence-lang attr-escape RED(1), code-block escape RED(2).
- **SURVIVED: 1.** Removing `escapeAttrForMarkdown` on the **`<img src>`** value (`'<img src="' + safe`) leaves the suite green (175 pass). No test puts `"`, `&`, `<` or `'` in an image URL (only alt and link href/title are exercised). Because the url is placed in an attribute, this is a real safety-test gap: quote breakout via image src is unguarded by tests. Recommend one added assertion, e.g. `mdToHtml('![x](a"b&c)')` == `<p><img src="a&quot;b&amp;c" alt="x"></p>\n` (I verified the lib emits exactly this).
- Removing the global `\n{2,}` collapse (f1) turns 2 tests red (the pin tests) and the 2 todos would flip to passing: the issue-(a) characterization is real and bites.

## Independent re-derivations (by hand, then compared to asserted literals; all matched)
- `# H1` -> `<h1>H1</h1>\n`; `[t](http://x.com "ti")` -> `<p><a href="http://x.com" title="ti">t</a></p>\n`; ```` ```js\nvar a=1<2;\n``` ```` -> `<pre><code class="language-js">var a=1&lt;2;\n</code></pre>\n`; `sanitizeUrl('&#106;avascript:x')` -> `''` (decode -> `javascript:`), `sanitizeUrl('  http://a  ')` -> `'http://a'` (trim). Also probed `[x](&#x6a;avascript:alert(1))` -> `<a href="">`.

## Adjudication of the three surfaced issues

### (a) Blank lines inside code blocks deleted — GENUINE BUG, severity MEDIUM-HIGH (correctness / data loss; not security)
- Reproduced: `"```\na\n\nb\n```"` -> `<pre><code>a\nb\n</code></pre>\n`; `"    a\n\n    b"` -> same; also inside a list item (`- a\n\n  ```\n  x\n\n  y\n  ```` -> `x\ny`).
- Reference (CommonMark/GitHub, per spec examples for fenced and indented code): blank lines in code are preserved verbatim: `<pre><code>a\n\nb\n</code></pre>`. Cause: `mdToHtml` ends with `.replace(/\n{2,}/g,'\n')` over the whole output; only `<pre>` content can contain `\n\n` otherwise (blocks emit single `\n`; inline newlines are joined), so the global collapse is pure collateral damage. Also silently mutates Python/YAML/shell snippets (semantically meaningful in e.g. heredocs, multi-line strings).
- The test file characterizes it honestly: 2 `todo` tests assert the CORRECT output (visible in reports, flip green on fix) + 1 pin test of current behavior + one BLOCK row ("indented code: chunks separated by a blank line") that also pins buggy output, labelled in its name. Nothing hidden. Minor note: that BLOCK row and the pin test will go red on fix and need updating.
- **Raise to user: YES** — recommend a lib fix (collapse only outside `<pre>`, or drop the collapse), in a separate non-test-only round.

### (b) `opts` ignored; `data:image/*` (incl. `svg+xml`) always allowed for images — GENUINE SPEC DRIFT, severity LOW-MEDIUM (defense-in-depth; fail-open default)
- Reproduced: `mdToHtml(md,{allowImage:false})`, `{allowImage:true}`, `undefined`, `null` all emit `<img src="data:image/png;...">`; `![x](data:image/svg+xml;base64,...)` emitted unchanged under `{allowImage:false}`. Source: `parseLinkOrImage` hard-codes `allowImage: isImage`; `mdToHtml` assigns `opts = opts || {}` and never uses it. `sanitizeUrl` itself honors the flag (tested).
- Reference: header comment documents "data: allowed only for images **when opts.allowImage**" — implies opt-in/default-deny. Actual is default-allow with no off switch. Safety: in a plain `<img>` an SVG data URI does not execute script (browsers run SVG-as-image in a no-script mode), so no direct XSS in current usage; risk arises if the URL is ever opened top-level (right-click "open image in new tab"), reused in `<object>/<embed>/<iframe>/CSS, or the output is post-processed. Also data URIs permit arbitrary large inline payloads. No in-repo consumers of `mdToHtml` exist yet (grep), so zero current exposure.
- Test posture: pinned as observation test; adequate and honest. Note the pin will go red when the lib is fixed.
- **Raise to user: YES** (decision needed): honor `opts.allowImage` (default false), and/or exclude `image/svg+xml` even when allowed. Cheap to fix before first consumer adopts it.

### (c) `2*3*4` -> `2<em>3</em>4` — NOT A BUG (defensible; matches CommonMark), severity NONE/INFO
- Reproduced; also `a*b*c` -> `a<em>b</em>c`, `x*y` stays literal, `5 * 3 * 2` stays literal, `snake_case_x` stays literal. CommonMark permits intraword `*` emphasis (only `_` is restricted), so `2*3*4` -> `2<em>3</em>4` is spec-correct (dingus/commonmark.js produce the same). The lib is consistent with that (intraword `_` correctly not emphasis).
- **Raise to user: NO** (characterization test is appropriate; maybe rename the test label "lib behaviour" to "CommonMark-conformant").

## Other coverage notes (not FAILs)
- GAP (above): img `src` attribute-escaping unasserted (mutant survived).
- Intentionally weak-ish: table cell safety assertion uses `.includes`; acceptable since the exact table shape is asserted elsewhere.
- `mailto:` autolink accepts `"` in local part (attr-escaped, safe) — pinned. Not raised.
- Pre-existing PUA-sentinel test relies on an invisible U+E000 in source; works (mutant d12 RED).

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node --test src/lib/tests/unit/CtMarkdown.test.mjs
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node dev/20261003-library-test/09-ctmarkdown/tmp/verifier-r1-v1/mut.mjs dev/20261003-library-test/09-ctmarkdown/tmp/verifier-r1-v1/m
node dev/20261003-library-test/09-ctmarkdown/tmp/verifier-r1-v1/m2.mjs
node dev/20261003-library-test/09-ctmarkdown/tmp/verifier-r1-v1/probe.mjs
```

**PASS** — suite re-runs green (622/618/0/4; 177 file), 45/46 mutants killed including all safety/escape/sanitize mutants, the three issues are honestly characterized; one minor gap (img src attr-escaping untested).
