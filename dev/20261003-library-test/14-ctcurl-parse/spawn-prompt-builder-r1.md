<!-- tpm-workflow-spawn phase="dev/20261003-library-test/14-ctcurl-parse" role="builder" -->
You are a BUILDER subagent — 14-ctcurl-parse (Phase 12a), round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/14-ctcurl-parse`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtCurl.parse.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring. You cover the PARSE side ONLY — the builders, the 6 language generators, and the output helpers are 12b; do not test them.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/14-ctcurl-parse/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/14-ctcurl-parse/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/14-ctcurl-parse/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p12-ctcurl/PRD.md` — the full scope spec + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + a table-driven `src/lib/tests/unit/*.test.mjs` (e.g. CtFormat or CtPretty json-yaml) — the pattern to COPY.
- `src/lib/utils/formats/CtCurl.mjs` — the module. Read ONLY the regions you need: the model (~36-215),
  `tokenizeShell` (~215), `parseCurl` (~409), `parseWget` (~580), and the helpers. Confirm the EXACT model
  fields, the `notes` behavior, method-inference rules, and each flag's mapping FIRST. Assert the ACTUAL.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtCurl.parse.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing
directly from `../../utils/formats/CtCurl.mjs`. Scope = ~18 PARSE-side exports: `tokenizeShell, parseCurl,
parseWget, emptyModel, normalizeModel, modelWithoutSecrets, splitUrlParams, applyUrlParams, fullUrl,
safeDecode, utf8ToBase64, base64ToUtf8, basicHeaderValue, decodeBasic, parseFormPairs, METHODS, AUTH_TYPES,
BODY_TYPES`. Every fn is TOTAL — bad input → best-effort model + a `notes` entry, NEVER a throw.
`parseCurl`/`parseWget` return `{...model, notes}`. TABLE-DRIVEN:

1. **tokenizeShell** — exact token arrays: single/double quotes, backslash escapes, line continuations `\`,
   adjacent-quote concatenation, mixed.
2. **parseCurl** — table `{name, cmd, expect}` over: `-X`/`--request`; `-H`/`--header` repeated;
   `-d`/`--data`/`--data-raw`/`--data-urlencode`; `-F` multipart; `-u` basic auth; `--url` vs positional
   URL; `-G` (data→query); `--compressed`/`-L`/`-k`/`-A`/`-e`/`--max-time`; combined short clusters
   (`-sSL`, `-XPOST`); flags in ANY order. Method inference: GET default / POST when data + no method / `-G`
   forces GET. Assert the relevant model slice (don't over-assert unrelated defaults). Include ≥2 REAL
   curl one-liners asserted to the full expected model.
3. **parseWget** — the supported wget subset → model.
4. **Helpers** — emptyModel shape; normalizeModel (raw→canonical); modelWithoutSecrets (auth redacted);
   the URL-param round-trip (splitUrlParams→applyUrlParams/fullUrl); safeDecode; the basic-auth round-trip
   (basicHeaderValue→decodeBasic); utf8ToBase64/base64ToUtf8; parseFormPairs.
5. **Malformed / TOTAL** — empty, unknown flags, missing URL, header without colon, duplicate headers →
   assert the ACTUAL best-effort model + `notes`. NEVER assert a throw (the module is total).

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtCurl.parse tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the flags-parsed + helper coverage matrix, the count, the command outputs, the
  observed malformed/notes policy, what remains for 12b, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL model/notes (it is TOTAL — never
  expect a throw). A CLEARLY-WRONG parse (not merely lossy/best-effort) is STOP-and-surface, never a
  weakened test and never a lib edit; characterize best-effort/lossy behavior.
- Cover the PARSE side ONLY. Do NOT test builders, the 6 generators, or output helpers (12b owns them).
- Write ONLY `src/lib/tests/unit/CtCurl.parse.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtCurl.parse.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/14-ctcurl-parse/findings/HANDOFF.md`). End your final report with a terse status:
what landed, the coverage matrix summary, the malformed/notes policy, what remains for 12b, what (if
anything) is blocked, and the repro commands.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back, so you don't leave a stray process.
