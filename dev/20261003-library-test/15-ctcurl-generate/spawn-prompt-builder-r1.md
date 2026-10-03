<!-- tpm-workflow-spawn phase="dev/20261003-library-test/15-ctcurl-generate" role="builder" -->
You are a BUILDER subagent — 15-ctcurl-generate (Phase 12b), round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/15-ctcurl-generate`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtCurl.generate.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring. You cover the GENERATE side ONLY — tokenizeShell/parseCurl/parseWget are 12a (done); you may import parseCurl read-only for the round-trip, but do not re-test it.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/15-ctcurl-generate/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/15-ctcurl-generate/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/15-ctcurl-generate/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p12-ctcurl/PRD.md` — the full scope spec + the split note (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `dev/20261003-library-test/14-ctcurl-parse/findings/HANDOFF.md` — the 12a model shape, lossy notes, and the `-d` content-type carry-forward.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtCurl.parse.test.mjs` — the 12a sibling, the pattern + the model fixtures to COPY.
- `src/lib/utils/formats/CtCurl.mjs` — the module. Read ONLY the regions you need: helpers (~680-725),
  `buildCurl` (~727), `buildWget` (~792), the 6 generators (~868-1077), `convert` (~1077). Confirm the
  EXACT emitted strings + how each represents method/url/headers/body/auth FIRST. Assert the ACTUAL.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtCurl.generate.test.mjs`, zero-dep (`node:test` + `node:assert/strict`),
importing directly from `../../utils/formats/CtCurl.mjs`. Scope = ~19 GENERATE-side exports: `buildCurl,
buildWget, toFetch, toNode, toPython, toHttpie, toPowerShell, toGo, convert, CONVERT_LANGS, shellQuote,
jsStr, pyStr, goStr, psStr, resolvedHeaders, contentTypeForBody, hasBody, encodeForm`. Every fn is TOTAL
(never throws). Build request MODELS as fixtures (copy the shape from the 12a test file).

1. **Output helpers** — `shellQuote`/`jsStr`/`pyStr`/`goStr`/`psStr` exact escaping per language (quotes,
   backslashes, specials, newlines); `encodeForm` (fields→`a=1&b=2` urlencoded); `hasBody`;
   `contentTypeForBody`; `resolvedHeaders` — MUST reflect the `-d` default `Content-Type:
   application/x-www-form-urlencoded` (12a carry-forward), the auth header, and the
   `{includeContentType, includeAuth}` options.
2. **buildCurl / buildWget** — a known model → EXACT expected command (method, `-H`, `-d`, `-u`, flags);
   opts honored.
3. **Generators** — a shared known model → EXACT snippet for ~2 languages (e.g. fetch + python); the other
   4 asserted STRUCTURALLY (method + url + every header + body + auth appear — via substring or a tolerant
   parse-back). Cover a GET, a POST-with-body, and an auth+headers case.
4. **convert** — `convert(model,lang) === to<Lang>(model)` for every CONVERT_LANGS id; unknown lang →
   fetch default; assert CONVERT_LANGS content.
5. **Round-trip** — `parseCurl(buildCurl(model))` semantic-deep-equals `model` over a battery (note the
   documented lossy fields: `-d` type:raw vs form, `#fragment`); CONFIRM the content-type default survives.
6. **Edges / TOTAL** — empty model, no-body GET, multipart `-F`, basic auth, query params → ACTUAL output;
   NEVER assert a throw.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtCurl.generate tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the generator coverage matrix (language → exact✓/structural✓ + field coverage),
  builder/helper coverage, round-trip results + lossy fields, the count, command outputs, a note that this
  COMPLETES P12, and any suspected bug.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. Assert the lib's ACTUAL output (it is TOTAL — never
  expect a throw). Pin EXACT for ≥1-2 languages, structural for the rest. A generator that DROPS or
  CORRUPTS a modeled field (lost header/body/auth, wrong method) is STOP-and-surface, never a weakened
  test and never a lib edit; characterize lossy-by-design behavior.
- Cover the GENERATE side ONLY. Do NOT re-test the parse side (12a owns it) beyond importing parseCurl for
  the round-trip.
- Write ONLY `src/lib/tests/unit/CtCurl.generate.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtCurl.generate.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/15-ctcurl-generate/findings/HANDOFF.md`). End your final report with a terse
status: what landed, the generator coverage matrix summary, round-trip fidelity + lossy fields,
confirmation P12 is COMPLETE, what (if anything) is blocked, and the repro commands.

IMPORTANT: when you are completely done, do not leave any `node --test` or other command running in the
background — wait for every command to finish before you hand back, so you don't leave a stray process.
