<!-- tpm-workflow-spawn phase="dev/20261003-library-test/12-ctpretty-sql-js" role="verifier" -->
You are a VERIFIER subagent — 12-ctpretty-sql-js (Phase 10c), round r1, variant v1 (library-test epic, #1013).

HARD RULE — you render a VERDICT, never a repair. You actively EXERCISE the artifact (run the tests, run the commands, inspect the code) but you NEVER mutate, fix, or drive what you verify. A PASS you caused by editing anything is worthless. If something is wrong, report it as a FAIL with evidence — do not fix it. This is a TEST-ONLY epic: you NEVER edit `src/lib` source either.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/12-ctpretty-sql-js`

Write ONLY your verdict file + your own scratch (use `tmp/` for scratch copies — NEVER touch the real lib file). Touch nothing else.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/12-ctpretty-sql-js/tmp/subagent.env" 2>/dev/null || true
```

Read, in order — ACTUALLY FETCH EACH ONE (do not skip the methodology reads). Fetch each methodology doc with `npx tpm doc <path>` from the project root:
1. `dev/20261003-library-test/12-ctpretty-sql-js/charter-verifier.md` — your posture. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — the tool/test conventions you check against.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end.
7. `npx tpm doc claude-context/methodology/verification.md` — the HARD RULE, on-disk evidence, PASS/FAIL-with-evidence verdict format.
8. `dev/20261003-library-test/12-ctpretty-sql-js/plan.md` — the round's authoritative brief + DoD triple-table. Read it LAST.

Curated context (token-scoped):
- `dev/20261003-library-test/12-ctpretty-sql-js/findings/HANDOFF.md` — the builder's claims (verify, don't trust).
- `dev/20261003-library-test/p10-ctpretty/PRD.md` + `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/unit/CtPretty.sql-js.test.mjs` — the tests to review for QUALITY.
- `src/lib/utils/formats/CtPretty.mjs` — the module under test (read the SQL ~406-700 + JS ~1338-1796 regions; read-only).

Model: sonnet.

TASK CONTEXT — what to verify (DoD for Phase 10c = SQL + JS ONLY; both are pretty + SAFE-minify engines):
1. **Re-run yourself.** `node --test src/lib/tests/` — confirm GREEN, report counts (builder claims 1004
   total, 990 pass, 14 todo, 0 fail; CtPretty.sql-js 89 = 87 pass + 2 todo). `node scripts/build-all.mjs
   --check` → 10/10. Run `node scripts/test-all.mjs` to completion — lib step green; note WHICH e2e suite
   (if any) fails (the flake shifts — color-picker #1012 / color-converter #94 — confirm it is unrelated).
2. **Judge COVERAGE QUALITY — the 6 in-scope exports (tokenizeSQL, formatSQL, minifySQL, tokenizeJS,
   formatJS, minifyJS). DO the mutation sweep on a SCRATCH COPY in your `tmp/` (never the real file):**
   - Make targeted mutations and confirm the suite goes RED for EACH: (a) break the JS regex-vs-division
     decision (`regexAllowed`); (b) make minifyJS drop the newline-gap rule (so `return\n1` fuses — an ASI
     break); (c) make minifyJS/minifySQL fuse adjacent tokens without the needed space (`- -`→`--`,
     word-word); (d) corrupt a SQL keyword-casing or clause-newline branch in formatSQL; (e) break JS
     template `${}` brace tracking. If any survives, that area's tests are hollow → report it.
   - CONFIRM THE SEMANTIC-EQUIVALENCE METHOD IS SOUND: the tests compare the SIGNIFICANT token stream
     (ws/comments filtered) of `tokenizeX(src)` vs `tokenizeX(minifyX(src))`. Verify this actually catches a
     semantic change (your mutation (c) should trip it). Confirm ≥1 exact fixture per language is a PINNED
     literal; independently re-derive 1 SQL + 1 JS output (and 1 tricky token array — e.g. `return /re/g`)
     by hand and confirm they match.
3. **ADJUDICATE BUG-1 (the headline — a semantics-changing minify, the STOP-and-surface class).** Builder:
   a regex literal that is the FIRST token inside a template `${ }` is tokenized as DIVISION, so `minifyJS`
   strips spaces inside the regex body and CHANGES ITS MEANING — `` `a${/x  +  y/.source}` `` →
   `` `a${/x+y/ .source}` ``; `` `${ /[ ]+ \/ /g.test(s) }` `` loses the space inside `[ ]`. Cause:
   `regexAllowed()` returns false for a previous `template` token incl an open `${` head. INDEPENDENTLY:
   - Reproduce both examples. Confirm the output regex is semantically DIFFERENT from the input (not just
     reformatted) — e.g. `/x  +  y/` vs `/x+y/` match different strings.
   - Confirm regexes elsewhere inside `${}` (`f(/a/)`, `x, /a  b/`, `a ? /a  b/ : 1`) are handled correctly
     (so the bug is specifically the `${`-head position).
   - Verdict: genuine bug (yes/no) + severity (this is a CORRECTNESS/semantic change in a "safe" minifier →
     argue the severity) + raise-to-user recommendation. Confirm the 2 `todo` tests honestly characterize it.
4. **Adjudicate the cosmetic observations** (`formatJS('a=1 // note')`→`a = 1// note`; `formatJS('')`→`"\n"`
   vs `minifyJS('')`→`""`; formatSQL blank line after `(` before SELECT) — defensible characterizations or
   bugs? Judge briefly.
5. **Confirm no lib source modified** (only `CtPretty.sql-js.test.mjs` added). `git` blocked — rely on
   `build-all --check` 10/10 + file inspection (mtimes of `src/lib/utils/formats/CtPretty.mjs` vs the new
   test file) and SAY SO.

Deliverable — write your verdict to `findings/verifier-r1-v1-verdict.md`:
- A clear **PASS** or **FAIL** (partial-with-stated-gap is a legitimate PASS; a correctly characterized
  lib bug surfaced via `todo` is NOT a FAIL of the tests).
- Per DoD claim: the evidence (commands, per-mutation red/green results, your independent re-derivations,
  your check that the token-stream-equivalence method really catches a semantic change).
- Your adjudication of BUG-1 (with the independently-confirmed semantic difference + severity + raise rec)
  and the cosmetic observations.
- Any coverage-quality concerns (not FAILs, but the orchestrator needs them).
- Reproduction: the exact commands you ran.
End your final report with the verdict (PASS/FAIL) and a one-line rationale.
