<!-- tpm-workflow-spawn phase="dev/20261003-library-test/13-ctformat" role="builder" -->
You are a BUILDER subagent — 13-ctformat (Phase 11), round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/13-ctformat`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtFormat.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/13-ctformat/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/13-ctformat/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/13-ctformat/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p11-ctformat/PRD.md` — the full scope spec + test strategy (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtPretty.json-yaml.test.mjs` — a table-driven sibling, the pattern to COPY.
- `src/lib/utils/formats/CtFormat.mjs` — the module under test. Confirm the EXACT export names, each
  parser's canonical-object shape, each emitter's exact output, the PARSERS/EMITTERS registry + `convert`
  signature, `detectFormat`'s heuristics, and each format's malformed behavior FIRST. Assert the ACTUAL.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtFormat.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing
directly from `../../utils/formats/CtFormat.mjs`. Confirmed public API (16 exports): `FORMATS`,
`parseJSON/emitJSON`, `parseYAML/emitYAML`, `parseCSV/emitCSV`, `parseTSV/emitTSV`,
`parseProperties/emitProperties`, `parseXML/emitXML`, `detectFormat`, `convert`. TABLE-DRIVEN over a format
registry — not 6×N ad-hoc tests:

1. **FORMATS registry** — every entry has id+label; the 6 ids line up with the parse/emit pairs and with
   what `convert` accepts.
2. **Per-format parse** — `parse<Fmt>(sampleText)` deep-equals the expected canonical object (all 6).
3. **Per-format emit** — `emit<Fmt>(sampleModel)` equals an EXACT expected text fixture (≥1 per format).
4. **Round-trip** — `parse<Fmt>(emit<Fmt>(model))` deep-equals `model` over a battery (semantic equality).
5. **convert + detectFormat** — the cross-conversions the API supports (JSON↔YAML, CSV↔JSON, …):
   `convert(text,from,to)` equals expected B; A→B→A preserves data; `detectFormat(sample)` → the right id;
   ambiguous/empty → the documented result.
6. **Type fidelity** — numbers vs numeric strings, booleans, null, nested, empty object/array, unicode in
   keys+values (per format).
7. **CSV/TSV specifics** — quoting, embedded comma/quote/newline, header row, ragged rows, TSV tab delim.
8. **Malformed** — invalid input per format → the ACTUAL failure (throw vs error object); pin it.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtFormat tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the format/conversion coverage matrix, the count, the command outputs, the
  observed malformed policy per format, anything deferred + why, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output. Prefer semantic equality
  for round-trips, but pin ≥1 exact fixture per format per direction. A genuine bug (a round-trip that
  SHOULD hold but doesn't) is STOP-and-surface, never a weakened test and never a lib edit.
- HIGH-size: if you genuinely cannot cover the matrix THOROUGHLY in one round, STOP and propose a split by
  format family (11a JSON/CSV/TSV, 11b YAML/properties/XML) rather than shipping shallow tests.
- Write ONLY `src/lib/tests/unit/CtFormat.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtFormat.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/13-ctformat/findings/HANDOFF.md`). End your final report with a terse status:
what landed, the coverage matrix summary, the malformed policy, whether you split, what (if anything) is
blocked, and the repro commands.
