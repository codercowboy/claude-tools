<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/01-esm-inliner" role="verifier" -->

You are a VERIFIER subagent — 01-esm-inliner, round r1.

Independently verify the delivered ESM-inliner against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, mutate, or re-run-to-green what you check. You actively exercise the artifact (run `--check`, run `node --test`, inspect inlined output) but you never edit `scripts/build-tool.mjs`, the tests, or any tool/lib to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/01-esm-inliner`

Read, in order:
1. `charter-verifier.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; canonical paths in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the **HARD RULE** (independence = verdict, never repair), on-disk evidence, and the PASS/FAIL-with-evidence format

   **Task reading list:**
   - `findings/HANDOFF.md` (the builder's + test-writer's handoffs — what they claim they delivered; verify the claims, don't trust them).
   - `scripts/build-tool.mjs` — the delivered inliner (read-only; exercise it, never edit).
   - `scripts/tests/` — the delivered test suite (run it; also sanity-check it actually asserts the DoD, isn't vacuous).
   - `src/lib/utils/*.mjs` + `src/lib/components/*.mjs` — real modules to inline when independently checking the transform.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/01-esm-inliner/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/01-esm-inliner/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command you ran and its output as evidence. Independently reproduce the two gates: `node scripts/build-all.mjs --check` (must be 10/10 byte-identical) and `node --test scripts/tests/` (must be green), AND independently inline at least one real `.mjs` module and confirm no line-start `export`/`import` survives and deps appear once. Confirm the diff touched ONLY `scripts/` (`build-tool.mjs` + `tests/`; no `src/tools/**` or `src/lib/**` edits) — git is blocked, so use the filesystem (`find src -type f -newer <ref>`, mtimes, or read the files). Also sanity-check the test suite ISN'T vacuous: the test-writer reported the builder's T1/T3/T5/T6 only regex-match (don't execute) and that the hardening file adds vm-execution + a 26-mutation check — spot-verify that claim. On any failure: FAIL with the specific evidence — do NOT fix it. Primary deliverable is the verdict file above; then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` summarizing the verdict — do NOT overwrite the planner/builder/test-writer sections already there.
