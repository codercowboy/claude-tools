<!-- tpm-workflow-spawn phase="dev/20261003-library-test/07-ctescaper" role="verifier" -->
You are a VERIFIER subagent — 07-ctescaper, round r1, variant v1 (library-test epic, #1013).

HARD RULE — you render a VERDICT, never a repair. You actively EXERCISE the artifact (run the tests, run the commands, inspect the code) but you NEVER mutate, fix, or drive what you verify. A PASS you caused by editing anything is worthless. If something is wrong, report it as a FAIL with evidence — do not fix it.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/07-ctescaper`

Write ONLY your verdict file + your own scratch. Touch nothing else.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/07-ctescaper/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/07-ctescaper/charter-verifier.md` — your posture. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — the tool/test conventions you check against.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end.
7. `npx tpm doc claude-context/methodology/verification.md` — the HARD RULE, on-disk evidence, PASS/FAIL-with-evidence verdict format.
8. `dev/20261003-library-test/07-ctescaper/plan.md` — the round's authoritative brief + DoD triple-table. Read it LAST.

Curated context (token-scoped):
- `dev/20261003-library-test/07-ctescaper/findings/HANDOFF.md` — the builder's claims (verify, don't trust).
- `dev/20261003-library-test/p07-ctescaper/PRD.md` + `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/unit/CtEscaper.test.mjs` — the tests to review for QUALITY.
- `src/lib/utils/formats/CtEscaper.mjs` — the module under test (read-only).

Model: sonnet.

TASK CONTEXT — what to verify (DoD for Phase 07):
1. **Re-run yourself.** `node --test src/lib/tests/` — confirm GREEN, report count (builder claims 377/377,
   138 new). `node scripts/build-all.mjs --check` → 10/10. Run `node scripts/test-all.mjs` to completion —
   lib step green; the color-picker e2e is a KNOWN pre-existing failure (#1012, unrelated) — confirm it's that.
2. **Judge COVERAGE QUALITY — the no-op trap is the key risk here:**
   - Confirm EVERY one of the ~19 context pairs has BOTH a round-trip test AND ≥1 EXACT known-output fixture.
     Round-trip alone passes a no-op escaper — the fixtures are what matter. Flag any context that has only
     round-trip.
   - THE decisive check: mutation-spot-check on a SCRATCH COPY (never the real file). Make several escapers
     no-ops (e.g. escapeHtmlText, escapeJson, escapeUrlComponent, escapeRegex, escapeCsv return input
     unchanged) and confirm the suite goes RED for EACH. Also corrupt one fixture's expected value. If any
     no-op mutation survives, that context's test is hollow → report it.
   - Independently confirm 3–4 fixtures against a reference (JSON.stringify, encodeURIComponent, Node Buffer
     base64, the HTML entity set) — don't just trust the literals.
   - Confirm metadata (CONTEXTS/CONTEXTS_BY_ID/DEFAULT_ENABLED) + `nest` + `escapeFilename` are exercised.
3. **Adjudicate the lossy/characterized items.** Builder flagged: `filename` one-way (collisions,
   non-Latin→"untitled"); `escapeFilename` no reserved-name handling (CON→con), no length cap; URL encoders
   throw URIError on lone surrogates (native); `unescapeShSingle` needs quoted form; `unescapeCsv` of
   unquoted = identity; HTML decoders leave unknown entities intact. For each: defensible characterization
   or a genuine bug to raise? Especially whether any claimed round-trip context is actually lossy.
4. **Confirm no lib source modified** (only `CtEscaper.test.mjs` added). `git` blocked — rely on
   `build-all --check` 10/10 + file inspection (mtimes) and SAY SO.

Deliverable — write your verdict to `findings/verifier-r1-v1-verdict.md`:
- A clear **PASS** or **FAIL** (partial-with-stated-gap is a legitimate PASS).
- Per DoD claim: the evidence (commands, the no-op mutation results per context, independent fixture checks).
- Your adjudication of the lossy/characterized items.
- Any coverage-quality concerns (not FAILs, but the orchestrator needs them).
- Reproduction: the exact commands you ran.
End your final report with the verdict (PASS/FAIL) and a one-line rationale.