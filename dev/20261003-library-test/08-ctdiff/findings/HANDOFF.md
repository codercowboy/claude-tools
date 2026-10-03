# HANDOFF — 08-ctdiff builder r1

Artifact: `src/lib/tests/unit/CtDiff.test.mjs` (68 tests: 66 pass, 2 `todo`, 0 fail). No src/lib source touched.

## Public-API inventory (export -> tested)
- splitLines -> empty/null, LF/CRLF/CR/mixed, trailing newline, non-string
- normalizeLine -> identity, null, ignoreCase, ignoreAllWhitespace, ignoreLeadingTrailingWhitespace, precedence, combos
- myersDiff -> empty/empty, one-side empty, identical, HAND-DERIVED [a,b,c] vs [a,x,c], insert/delete at start/mid/end, Myers-paper ABCABBA->CBABAC (D=5), disjoint, custom eq, repeats
- diffLines -> identical, pure ins/del, replace, prefix+suffix (full op list pinned by hand), empty<->non-empty, CRLF/CR, trailing newline, offsets, stats, coalescing, 3 ignore-* options (original text asserted)
- tokenizeWords -> pinned tokens, lossless battery
- diffWords -> pinned segments (replace, punctuation, whitespace run, ins/del), coalescing, side reconstruction
- toUnifiedDiff -> EXACT text: single hunk, names, insert-into-empty, delete-to-empty, 2 hunks ctx1, ctx0, ctx3 merged, default ctx, merge boundary (2*ctx vs 2*ctx+1), offset numbering, coercion of context, CRLF-only -> '', trailing newline, opts passthrough, no-change -> ''
- Reconstruct property (supplement): diffLines ops, raw myers (also LCS-optimality), unified-diff apply (ctx 1,3), word segments, over a 22-pair fixed battery.

## Gates
- `node --test src/lib/tests/` -> tests 445, pass 443, fail 0, todo 2
- `node scripts/build-all.mjs --check` -> Checked 10 tool(s); 0 failed.
- Mutation check (copy of lib in scratchpad, not repo): 5 mutants (context coercion, merge threshold, Myers tie-break, ignoreAllWhitespace, segment coalescing) each turned the suite red.

## Untested options
None. All three ignore-* options + ignoreCase, context, aName, bName covered.

## SUSPECTED BUG (surface, not fixed — lib is read-only for this round)
`toUnifiedDiff` with a hunk that has zero a-side (pure insert) or zero b-side (pure delete) emits start `0`
instead of the line BEFORE the hunk. Repro: `toUnifiedDiff('a\nb\nc','c\nb\na',{},{context:0})` emits
`@@ -0,0 +2,2 @@` for the trailing insert (standard: `-3,0 +2,2`) and `@@ -1,2 +0,0 @@`-style `+0,0` mid-file.
Only reachable mid-file with context 0 (with context>=1 a hunk always has both sides unless the whole side is empty,
where 0 is correct). Applying such a diff with patch(1) mis-places the hunk.
Two tests are marked `{ todo }` (node reports them, suite stays green): "unified diff context 0 applies correctly (battery)"
and "context 0 pure insert mid-file header per standard (-1,0 +2,2)". Remove `todo` once fixed.
