<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/04-port-uuid-generator" role="verifier" -->

You are a VERIFIER subagent — 04-port-uuid-generator, round r1.

Independently verify the delivered `uuid-generator` port against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, re-port, or re-run-to-green what you check. You exercise the artifact (grep, rebuild, run `--check`, run `node --test`, run the e2e, open the built HTML) but never edit the tool, the lib, or any test to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/04-port-uuid-generator`

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
   - `verification.md` — the **HARD RULE** (independence = verdict, never repair), on-disk evidence, PASS/FAIL-with-evidence format

   **Task reading list:**
   - `findings/HANDOFF.md` (the builder's handoff — what it claims; verify, don't trust).
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the signed-off behavior decisions + the proven recipe. Confirm: footer License kept via `CtLicense`; the ONLY test delta is the pre-approved license-wiring update (same assertion intent), NOT a silent rewrite papering over a regression; the port honored the recipe.
   - `src/tools/uuid-generator/**` — the ported tool (read-only; exercise, never edit): `source/index.template.html`, `source/app.mjs` + `logic.mjs`, `tests/`, built `index.html`.
   - `dev/20261002-lib-cleanup/03-pilot-base64-port/findings/HANDOFF.md` — the pilot reference, to judge whether the recipe was applied correctly.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/04-port-uuid-generator/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/04-port-uuid-generator/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce: `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm|<<ct:include (copy|util)\.js>>" src/tools/uuid-generator` → no matches; `node scripts/build-tool.mjs --dir="src/tools/uuid-generator"` rebuilds and `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; uuid-generator Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test` — the `pretest:*` hooks run `build --check`). Open the built `index.html` and confirm the footer License button is wired (`[data-ct-license]` + `CtLicense`/`openLicense` present), the third-party list still renders in the modal, and the footer carries NO unsubstituted project-identity mustache tokens (project.name / project.repo / project.tagline). Confirm the license e2e delta keeps the SAME assertion intent (did not just delete the check). Confirm the BUILDER's diff scope via mtimes/filesystem (git blocked): only `src/tools/uuid-generator/**` changed — NO other tool, `src/lib/**`, `scripts/**`, or `project.json` edits. On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section.
