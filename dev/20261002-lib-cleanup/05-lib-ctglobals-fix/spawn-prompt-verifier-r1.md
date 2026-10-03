<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/05-lib-ctglobals-fix" role="verifier" -->

You are a VERIFIER subagent — 05-lib-ctglobals-fix, round r1.

Independently verify the shared-lib global-rename fix against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, rename, or re-run-to-green what you check. You exercise the artifact (grep, rebuild, run `node --test`, run the e2e) but never edit the lib, a tool, or a test to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/05-lib-ctglobals-fix`

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the "Phase 3b gap" write-up: the 4 expected renames.
   - `src/lib/components/{CtLicense,CtConfirm,CtModal,CtClipboardUtil}.mjs` — the fixed files (read-only; exercise, never edit).
   - `src/tools/base64-tool/` + `src/tools/uuid-generator/` — the two tools that inline these modules.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/05-lib-ctglobals-fix/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/05-lib-ctglobals-fix/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce: `grep -rnE "window\.jbc[A-Z]" src/lib` → no RUNTIME matches (confirm any survivor is a historical/PROVENANCE comment the builder deliberately left, not a live read); confirm all four expected renames are present as RUNTIME reads (`window.ctThirdParty`, `window.ctConfirmStyles`, `window.ctModalStyles`, `window.ctCopyStyles`); `node --test scripts/tests/` → 38/38 (and confirm those test files were NOT edited — check mtimes); `node scripts/build-tool.mjs --dir="src/tools/base64-tool"` + `--dir="src/tools/uuid-generator"` rebuild and `node scripts/build-all.mjs --check` → 10/10; base64-tool AND uuid-generator unit (`node --test tests/unit/*.test.mjs`) + serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green. Confirm NO test file changed this round (there is no approved test delta — a changed test is a FAIL signal). Confirm diff scope via mtimes/filesystem (git blocked): only the four `src/lib/components/*.mjs` + the two tools' `index.html` changed — NO other tool, `src/lib/utils/**`, `scripts/**`, or `project.json` edits. On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section.
