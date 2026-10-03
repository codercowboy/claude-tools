<!-- tpm-workflow-spawn phase="dev/20261003-library-test/11-ctpretty-html-css" role="verifier" -->
You are a VERIFIER subagent — 11-ctpretty-html-css (Phase 10b), round r1, variant v1 (library-test epic, #1013).

HARD RULE — you render a VERDICT, never a repair. You actively EXERCISE the artifact (run the tests, run the commands, inspect the code) but you NEVER mutate, fix, or drive what you verify. A PASS you caused by editing anything is worthless. If something is wrong, report it as a FAIL with evidence — do not fix it. This is a TEST-ONLY epic: you NEVER edit `src/lib` source either.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/11-ctpretty-html-css`

Write ONLY your verdict file + your own scratch (use `tmp/` for scratch copies — NEVER touch the real lib file). Touch nothing else.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/11-ctpretty-html-css/tmp/subagent.env" 2>/dev/null || true
```

Read, in order — ACTUALLY FETCH EACH ONE (do not skip the methodology reads). Fetch each methodology doc with `npx tpm doc <path>` from the project root:
1. `dev/20261003-library-test/11-ctpretty-html-css/charter-verifier.md` — your posture. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — the tool/test conventions you check against.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end.
7. `npx tpm doc claude-context/methodology/verification.md` — the HARD RULE, on-disk evidence, PASS/FAIL-with-evidence verdict format.
8. `dev/20261003-library-test/11-ctpretty-html-css/plan.md` — the round's authoritative brief + DoD triple-table. Read it LAST.

Curated context (token-scoped):
- `dev/20261003-library-test/11-ctpretty-html-css/findings/HANDOFF.md` — the builder's claims (verify, don't trust).
- `dev/20261003-library-test/p10-ctpretty/PRD.md` + `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/unit/CtPretty.html-css.test.mjs` — the tests to review for QUALITY.
- `src/lib/utils/formats/CtPretty.mjs` — the module under test (read the CSS ~321-430 + HTML ~790-905 regions; read-only).

Model: sonnet.

TASK CONTEXT — what to verify (DoD for Phase 10b = HTML + CSS ONLY):
1. **Re-run yourself.** `node --test src/lib/tests/` — confirm GREEN, report counts (builder claims 915
   total, 903 pass, 12 todo, 0 fail; CtPretty.html-css 203 = 197 pass + 6 todo). `node scripts/build-all.mjs
   --check` → 10/10. Run `node scripts/test-all.mjs` to completion — lib step green; note WHICH e2e suite
   (if any) fails (the flake shifts — color-picker #1012 / color-converter #94 — confirm it is unrelated).
2. **Judge COVERAGE QUALITY — the 4 in-scope exports (formatHTML, minifyHTML, formatCSS, minifyCSS). DO
   the mutation sweep on a SCRATCH COPY in your `tmp/` (never the real file):**
   - Make targeted mutations and confirm the suite goes RED for EACH: (a) break the HTML void-element set;
     (b) break the inline-vs-block decision; (c) break `htmlKeepComment` (drop IE-conditional retention);
     (d) break the CSS blank-line-between-rules or the indent emission; (e) break CSS string/url()
     skipping so a `{`/`}` inside a string is misread. If any survives, that area's tests are hollow → report.
   - Confirm ≥1 EXACT fixture per language is a PINNED literal. Independently re-derive 2 HTML outputs
     (one nesting, one with an inline-collapse) + 2 CSS outputs (one nested @media, one minify) by hand and
     confirm they match the asserted literals.
3. **ADJUDICATE THE SURFACED ISSUES — independently reproduce each:**
   - **(a) `minifyCSS` stray spaces around dropped comments (5 `todo`).** Builder: `a{color:red}\n/* c */\n
     b{x:y}` → `a{color:red}  b{x:y}`; `color:red/* in */;` → `red ;`. So `minifyCSS` is NOT idempotent and
     `minify(format(x)) !== minify(x)` with comments. Reproduce. Is this a genuine bug (a minifier must be
     idempotent and must not leave stray whitespace)? Severity + raise recommendation.
   - **(b) `formatHTML` collapses 3+ newlines inside `pre`/`script`/`style`/`textarea` (1 `todo`).**
     Builder: the trailing `\n{3,}`-over-whole-output replace eats blank lines in preformatted content
     (`<pre>a\n\n\n\nb</pre>`). Reproduce. Note this is the SAME ROOT-CAUSE CLASS as the CtMarkdown
     blank-line-in-code bug (a global whitespace collapse not exempting preformatted regions). Severity +
     raise recommendation (data loss in `<pre>`/`<textarea>` is user-visible).
   - **(c) The 4 minor quirks** (unterminated-comment not a `formatHTML` fixed point → appends `</div>` each
     pass; `<script src=a.js/>` emits spurious `</script>`; synthesized close tags lowercased;
     `minifyCSS('a{color:red;;}')` leaves one `;`). For each: defensible characterization or a genuine bug
     worth raising? Judge briefly.
4. **Confirm no lib source modified** (only `CtPretty.html-css.test.mjs` added). `git` blocked — rely on
   `build-all --check` 10/10 + file inspection (mtimes of `src/lib/utils/formats/CtPretty.mjs` vs the new
   test file) and SAY SO.

Deliverable — write your verdict to `findings/verifier-r1-v1-verdict.md`:
- A clear **PASS** or **FAIL** (partial-with-stated-gap is a legitimate PASS; a correctly characterized
  lib bug surfaced via `todo` is NOT a FAIL of the tests).
- Per DoD claim: the evidence (commands, per-mutation red/green results, your independent re-derivations).
- Your adjudication of (a), (b), and the 4 minor quirks — with independently-derived reference behavior +
  severity + a raise-to-user recommendation for each genuine bug.
- Any coverage-quality concerns (not FAILs, but the orchestrator needs them).
- Reproduction: the exact commands you ran.
End your final report with the verdict (PASS/FAIL) and a one-line rationale.
