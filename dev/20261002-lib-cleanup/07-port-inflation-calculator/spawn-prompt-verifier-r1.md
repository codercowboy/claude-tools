<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/07-port-inflation-calculator" role="verifier" -->

You are a VERIFIER subagent — 07-port-inflation-calculator, round r1.

Independently verify the delivered `inflation-calculator` port against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, re-port, or re-run-to-green what you check. You exercise the artifact (grep, rebuild, run `--check`, run `node --test`, run the e2e, open the built HTML) but never edit the tool, the lib, or any test to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/07-port-inflation-calculator`

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the signed-off decisions + recipe. Confirm: footer License via CtLicense; the ONLY test delta is the pre-approved license-wiring update (the `window.ctLicense()` test → footer-button click, SAME intent), NOT a silent rewrite.
   - `src/tools/inflation-calculator/**` — the ported tool (read-only; exercise, never edit).

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/07-port-inflation-calculator/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/07-port-inflation-calculator/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce: `grep -rnE "jbcUtil|ctCopy|ctFlash|<<ct:include (copy)\.js>>" src/tools/inflation-calculator` → no matches; `node scripts/build-tool.mjs --dir="src/tools/inflation-calculator"` rebuilds and `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; inflation-calculator Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). Open the built `index.html`: footer License wired (`[data-ct-license]` + `CtLicense`/`openLicense`), no unsubstituted project-identity tokens, and the `<<ct:inline cpi-data.json>>` data still present (the calculator needs it). Confirm the license e2e delta keeps the SAME assertion intent (modal opens via the footer button) and did NOT just delete the test. Confirm the diff scope via mtimes/filesystem (git blocked): only `src/tools/inflation-calculator/**` changed — NO other tool, `src/lib/**`, `scripts/**`, or `project.json` edits. On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section.
