# HANDOFF — 12-ctpretty-sql-js (Phase 10c, builder r1)

Artifact: `src/lib/tests/unit/CtPretty.sql-js.test.mjs` (zero-dep, node:test). No `src/lib` source touched.
**This COMPLETES the P10 CtPretty split** (10a JSON/YAML, 10b HTML/CSS, 10c SQL/JS).

## Gate
- `node --test src/lib/tests/unit/CtPretty.sql-js.test.mjs` -> tests 89, pass 87, fail 0, todo 2.
- `node --test src/lib/tests/` -> tests 1004, pass 990, fail 0, todo 14 (2 of the todos are this file's BUG-1).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."

## SUSPECTED LIB BUG (BUG-1) -- minify changes regex semantics inside template `${ }`
`tokenizeJS.regexAllowed()` returns false for ANY previous `template` token, including an OPEN head/middle
(`` `a${ `` / `}b${`). So a regex literal that is the first token inside `${ }` is tokenized as division
(`/`, `x`, `/`...), and `minifyJS` then treats its body as code and strips/adjusts spaces inside the regex:
- `` `a${/x  +  y/.source}` `` -> `` `a${/x+y/ .source}` ``   (regex body changed)
- `` x = `${ /[ ]+ \/ /g.test(s) }` `` -> `` x=`${/[]+\/ /g.test(s)}` ``   (char class `[ ]` became `[]`)
Note `formatJS`'s own `jsIsValueEnd` already special-cases an open `${` head; the tokenizer rule does not.
Fix sketch (lib, not done): in `regexAllowed`, `p.type==='template'` -> `return /\$\{$/.test(p.value)`.
Pinned as two `todo` tests (correct behavior asserted; they flip to failures-to-fix once `todo` is removed
after the fix): "regex as first token inside ${ }" (tokenizer) and "regex literal ... survives VERBATIM" (minify).
Regex AFTER other tokens inside `${ }` (e.g. `f(/a/)`, `x, /a  b/`, `a ? /a  b/ : 1`) is correct.

## Coverage matrix
| Lang | tokenizer | pretty | minify | semantic-equiv | idempotent | edges | exact fixture |
|------|-----------|--------|--------|----------------|------------|-------|---------------|
| SQL  | yes (exact arrays, lossless) | yes (case/indent/clauses/comments) | yes | yes (battery of 10) | format + minify | empty, ws-only, malformed, unicode, stray chars, deep parens | formatSQL x2, minifySQL x1, tokenizeSQL x1 |
| JS   | yes (regex-vs-division x10 cases, `/=`, template nesting, all 32 multi-char punctuators, numbers, names, comments) | yes (indent opts, unary/binary, idempotent, token-preserving) | yes (SAFE) | yes (battery of ~30 + newline-gap check) | format + minify | empty, ws-only, unterminated string/template/comment/regex, stray `}`/`)`, unicode, 60-deep nesting, 20-deep templates | formatJS x1, minifyJS x1 |

## Observed minify SAFE boundary
- SQL: drops `--` and `/* */` comments and collapses ws runs to ONE space (a comment also counts as ws). Never adds
  space where none existed (`"x", 'y'` stays tight; `a , b` stays spaced). Strings / quoted ids (`"..."`, backtick) verbatim.
  Adjacent minus ops never fuse into `--`.
- JS: drops comments + ws; token text never changed (no rename). Between two significant tokens it emits: `\n` if
  ANY newline/line-comment/newline-bearing block comment was between them (so `return\n1` stays, ASI-safe),
  else one space only when `jsNeedSpace` (word-word, number+`.`, op-char pairs like `+ +`, `a- -b`, `/` `/`, any
  block comment), else nothing. Strings, regex, template text verbatim (except BUG-1 context).
## Observed malformed policy (no throws anywhere)
Best-effort: unterminated SQL string/quotedId/block-comment run to EOF; unterminated JS string stops at newline;
unterminated template / block comment run to EOF; unterminated regex candidate falls back to `/` punct;
stray chars (`#`, `@`, `~`) become punct. format/minify of all of these return text, never throw.
## Cosmetic notes (not bugs; pinned as actual)
- `formatJS('a=1 // note')` -> `a = 1// note` (no space before trailing line comment).
- `formatJS('')` -> `"\n"` while `formatJS`-family others return `''` (minifyJS('') = '').
- `formatSQL('... (select ...')` emits a blank line after `(`; not pinned.
- Object literal commas do not break lines in formatJS (`a: 1, b: [1, 2]`).

## Repro
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtPretty.sql-js.test.mjs
node --test src/lib/tests/
node scripts/build-all.mjs --check
```
