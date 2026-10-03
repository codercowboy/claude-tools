<!-- tpm-workflow-spawn phase="dev/20261003-library-test/11-ctpretty-html-css" role="builder" -->
You are a BUILDER subagent — 11-ctpretty-html-css (Phase 10b), round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/11-ctpretty-html-css`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtPretty.html-css.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring. You cover HTML + CSS ONLY — JSON/YAML (10a, done) and SQL/JS (10c) are OTHER rounds; do not test them.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/11-ctpretty-html-css/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/11-ctpretty-html-css/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/11-ctpretty-html-css/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p10-ctpretty/PRD.md` — the full scope spec + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` — the 10a sibling, the pattern to COPY.
- `src/lib/utils/formats/CtPretty.mjs` — the module. Read ONLY the regions you need: the CSS engine
  (~321-430: formatCSS/minifyCSS + cssParseNodes/cssEmit) and the HTML engine (~790-905: htmlEmit/
  formatHTML/minifyHTML + HTML_VOID/HTML_INLINE/htmlKeepComment). Confirm the EXACT emitted output, the
  blank-line + inline-collapse policy, and the comment-keep rules FIRST. Assert what it ACTUALLY emits.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtPretty.html-css.test.mjs`, zero-dep (`node:test` + `node:assert/strict`),
importing directly from `../../utils/formats/CtPretty.mjs`. Scope = 4 exports:
`formatHTML, minifyHTML, formatCSS, minifyCSS`. TABLE-DRIVEN, asserting the lib's EXACT output.

1. **HTML** — table `{name, src, pretty, min}`: nesting re-indent (indent 2/4/tab); void elements
   (br/img/hr/input/meta…) emitted without a close tag; inline (span/a/em/strong) collapsed onto one line
   vs block elements on their own lines; rawText elements (script/style/pre) content preserved VERBATIM;
   doctype preserved; attributes kept. COMMENT POLICY as explicit tests: `minifyHTML` DROPS a normal
   `<!-- x -->` but KEEPS an IE-conditional `<!--[if IE]>…<![endif]-->` and a bang `<!--! x -->`.
   Idempotency (`formatHTML(formatHTML(x))===formatHTML(x)`, same for minify); semantic round-trip
   (structure + text survive pretty↔minify).
2. **CSS** — table of exact fixtures: simple rule, multiple selectors, nested `@media`/`@supports`,
   `url(...)` (quoted + unquoted) / strings / `/* comments */` not misread, `!important`, blank line
   between top-level rules in format. `minifyCSS` exact (strips insignificant ws). Idempotency + round-trip.
3. **Edges** — empty, already-formatted (idempotent), deeply nested, malformed (unclosed tag / unbalanced
   brace / unterminated comment, stray `<` or `}`) → assert the ACTUAL graceful behavior (it does NOT
   throw for HTML/CSS the way JSON does — characterize what it emits); unicode.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtPretty.html-css tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the HTML/CSS coverage matrix, the count, the command outputs, the observed
  comment/malformed policy, what remains for 10c (SQL+JS), and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output. Prefer semantic-equality
  where formatting is opinionated, but pin ≥1 exact fixture per language. A genuine bug (an idempotency/
  round-trip that SHOULD hold but doesn't) is STOP-and-surface, never a weakened test and never a lib edit.
- Cover HTML + CSS ONLY. Do NOT write JSON/YAML/SQL/JS tests (other rounds own them).
- Write ONLY `src/lib/tests/unit/CtPretty.html-css.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtPretty.html-css.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/11-ctpretty-html-css/findings/HANDOFF.md`). End your final report with a terse
status: what landed, the coverage matrix summary, the comment/malformed policy, what remains for 10c, what
(if anything) is blocked, and the repro commands.
