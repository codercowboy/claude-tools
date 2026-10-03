<!-- tpm-workflow-spawn phase="dev/20261003-library-test/13-ctformat" role="verifier" -->
You are a VERIFIER subagent — 13-ctformat (Phase 11), round r1, variant v1 (library-test epic, #1013).

HARD RULE — you render a VERDICT, never a repair. You actively EXERCISE the artifact (run the tests, run the commands, inspect the code) but you NEVER mutate, fix, or drive what you verify. A PASS you caused by editing anything is worthless. If something is wrong, report it as a FAIL with evidence — do not fix it. This is a TEST-ONLY epic: you NEVER edit `src/lib` source either.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/13-ctformat`

Write ONLY your verdict file + your own scratch (use `tmp/` for scratch copies — NEVER touch the real lib file). Touch nothing else.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/13-ctformat/tmp/subagent.env" 2>/dev/null || true
```

Read, in order — ACTUALLY FETCH EACH ONE (do not skip the methodology reads). Fetch each methodology doc with `npx tpm doc <path>` from the project root:
1. `dev/20261003-library-test/13-ctformat/charter-verifier.md` — your posture. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — the tool/test conventions you check against.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end.
7. `npx tpm doc claude-context/methodology/verification.md` — the HARD RULE, on-disk evidence, PASS/FAIL-with-evidence verdict format.
8. `dev/20261003-library-test/13-ctformat/plan.md` — the round's authoritative brief + DoD triple-table. Read it LAST.

Curated context (token-scoped):
- `dev/20261003-library-test/13-ctformat/findings/HANDOFF.md` — the builder's claims (verify, don't trust).
- `dev/20261003-library-test/p11-ctformat/PRD.md` + `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/unit/CtFormat.test.mjs` — the tests to review for QUALITY.
- `src/lib/utils/formats/CtFormat.mjs` — the module under test (read-only).

Model: sonnet.

TASK CONTEXT — what to verify (DoD for Phase 11 = CtFormat, 6 formats + detectFormat + convert):
1. **Re-run yourself.** `node --test src/lib/tests/` — confirm GREEN, report counts (builder claims 1223
   total, 1207 pass, 16 todo, 0 fail; CtFormat 219 = 217 pass + 2 todo). `node scripts/build-all.mjs
   --check` → 10/10. Run `node scripts/test-all.mjs` to completion — lib step green; note WHICH e2e suite
   (if any) fails (the flake shifts — color-picker #1012 / color-converter #94 — confirm it is unrelated).
2. **Judge COVERAGE QUALITY — the 16 exports (FORMATS, 6 parse/emit pairs, detectFormat, convert). The
   builder did NOT mutation-test — YOU do it, on a SCRATCH COPY in your `tmp/` (never the real file):**
   - Make targeted mutations and confirm the suite goes RED for EACH: (a) break the CSV quote/escape rule;
     (b) break a `detectFormat` heuristic branch; (c) break the `convert` registry routing (wrong
     emitter); (d) break the YAML or XML parser on nesting; (e) break a type coercion (number vs string).
     If any survives, that area's tests are hollow → report it.
   - Confirm each format has a PINNED exact fixture for ≥1 direction (not parse-compare-only), and that
     the cross-conversion pairs assert exact expected B (not just A→B→A). Independently re-derive 2 outputs
     (one emit fixture, one convert pair) by hand and confirm they match.
3. **ADJUDICATE THE SURFACED ITEMS — independently reproduce each:**
   - **(a) CSV/TSV single-column empty-trailing-record loss (the 2 `todo`).** Builder:
     `parseCSV(emitCSV([{a:''}]))` → `[]`; `[{a:'x'},{a:''}]` → `[{a:'x'}]`. Cause: the "drop a single
     trailing empty record" rule in `parseDelimited` + `emitCSV` not quoting an empty cell. Reproduce.
     Genuine round-trip/data-loss bug? Severity (how common is a trailing empty single-column row?) +
     raise recommendation. Confirm the 2 `todo` honestly characterize it and the scope-limiting pin is right.
   - **(b) `detectFormat('[1,')` → `csv`.** A string that looks like the start of JSON is detected as CSV.
     Reproduce; also probe a few near-JSON inputs. Is this a defensible heuristic limitation (detectFormat
     is best-effort) or a genuine misdetection worth raising? Judge briefly.
   - **(c) The lossy-by-design items** (CSV/TSV/properties/XML stringify numbers+booleans; null/empty
     containers → `""`; XML trims text + collapses 1-element arrays). For each: defensible characterization
     (these formats are inherently stringly / lossy) or a genuine surprise worth raising? Judge briefly.
4. **Confirm no lib source modified** (only `CtFormat.test.mjs` added). `git` blocked — rely on
   `build-all --check` 10/10 + file inspection (mtimes of `src/lib/utils/formats/CtFormat.mjs` vs the new
   test file) and SAY SO.

Deliverable — write your verdict to `findings/verifier-r1-v1-verdict.md`:
- A clear **PASS** or **FAIL** (partial-with-stated-gap is a legitimate PASS; a correctly characterized
  lib bug surfaced via `todo` is NOT a FAIL of the tests).
- Per DoD claim: the evidence (commands, per-mutation red/green results, your independent re-derivations).
- Your adjudication of (a), (b), and the lossy-by-design items — reference behavior + severity + a
  raise-to-user recommendation for each genuine bug.
- Any coverage-quality concerns (not FAILs, but the orchestrator needs them).
- Reproduction: the exact commands you ran.
End your final report with the verdict (PASS/FAIL) and a one-line rationale.
