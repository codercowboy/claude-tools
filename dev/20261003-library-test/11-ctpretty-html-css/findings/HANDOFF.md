# HANDOFF — 11-ctpretty-html-css (Phase 10b) builder r1

Artifact: `src/lib/tests/unit/CtPretty.html-css.test.mjs` (only src file touched; no lib source edited).

## Counts / gate
- New file: 203 tests (197 pass, 0 fail, 6 todo). Full `node --test src/lib/tests/`: 915 tests, 903 pass, 0 fail, 12 todo (6 mine + 6 pre-existing from other files).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."

## Coverage matrix
| Lang | pretty exact | minify exact | idempotent | round-trip | edge | indent 2/4/tab |
|---|---|---|---|---|---|---|
| HTML (16 table fixtures x4 + ~35 targeted) | Y | Y | Y | Y (tags+words shape; exact for block-only) | Y | Y |
| CSS (18 table fixtures x4 + ~25 targeted) | Y | Y | Y | Y (exact converge) | Y | Y |
Covered: nesting, void, inline-collapse vs block, rawText verbatim, doctype, attrs, comment policy, @media/@supports nesting, url()/strings/comments awareness, !important, blank line between top-level rules, unicode, CRLF, 50/30-deep nesting.

## Observed policy
- HTML comments: minify DROPS normal; KEEPS `<!--[if ...`, `<!--!`, and any comment containing `[endif]` (case-insens.). formatHTML keeps ALL comments on their own line; an element containing a comment is not inline-collapsed.
- HTML malformed (never throws): unclosed tags auto-closed on emit; stray end tag dropped; misnested end pops to nearest match; stray `<` is text; unterminated comment swallows rest (minify drops it); unterminated start tag eaten to EOF.
- CSS malformed (never throws): unclosed brace -> format auto-closes, minify passes through; stray `}` -> format DROPS everything after it, minify passes through; unterminated comment -> format keeps, minify drops to EOF; unterminated string swallows to EOF.

## Suspected lib bugs (all pinned as `todo` tests asserting CORRECT behavior, or as characterization; NOT weakened, lib NOT edited)
1. **minifyCSS stray spaces around dropped comments** (valid CSS): `a{color:red}\n/* c */\nb{x:y}` -> `a{color:red}  b{x:y}` (double space); `color:red/* in */;` -> `red ;`; `a{/* c */color:red}` -> `a{ color:red}`. Consequence: minifyCSS NOT idempotent and minify(format(x)) != minify(x) when comments adjoin structural chars. Cause: comment branch appends ' ' unless out ends in whitespace, without checking STRUCT neighbours. 5 todo tests.
2. **formatHTML collapses blank lines inside rawText**: final `.replace(/\n{3,}/g,'\n\n')` hits `<pre>a\n\n\n\nb</pre>` -> `a\n\nb` (same root cause as the existing markdown "KNOWN BUG" todo). minify is unaffected. 1 todo + characterization + minify guard test.
3. Minor / garbage-in quirks, characterized only: (a) formatHTML on an unterminated comment is not a fixed point and appends a `</div>` per pass; (b) `<script src=a.js/>` emits a spurious `</script>` (rawText check precedes self-close); (c) synthesized close tags are lowercased (`<P>x</p>`); (d) minifyCSS(`a{color:red;;}`) -> `a{color:red;}` (second pass trims); (e) formatCSS unterminated string appends `;` inside it; (f) format of inline voids (br/img) beside a block puts them on separate lines so minify(format(x)) gains single spaces (pinned as documented whitespace shift, stable thereafter).

## Remains for 10c
SQL + JS: formatSQL/minifySQL, formatJS/minifyJS (and anything else in CtPretty.mjs outside JSON/YAML/HTML/CSS). Not touched here.

## Repro
```
node --test src/lib/tests/unit/CtPretty.html-css.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
```
No commits made; user to commit.
