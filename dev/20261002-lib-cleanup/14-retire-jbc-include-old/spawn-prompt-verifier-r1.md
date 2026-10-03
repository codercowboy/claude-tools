<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/14-retire-jbc-include-old" role="verifier" -->

You are a VERIFIER subagent — 14-retire-jbc-include-old, round r1 (Phase 3f, Round B — the epic's final round).

Independently verify the retire + toolchain/README cleanup against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, move, or re-run-to-green what you check. You exercise the artifact (grep, `ls`, rebuild, run `--check`, run `test-all`) but never edit a file, move a dir, or touch anything to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/14-retire-jbc-include-old`

Read, in order:
1. `charter-verifier.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; canonical paths in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol; the DOC voice/anti-pattern remit
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive, the tool-ledger honesty rule
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the **HARD RULE** (independence = verdict, never repair), on-disk evidence, PASS/FAIL-with-evidence format

   **Task reading list:**
   - `findings/HANDOFF.md` (the builder's handoff — what it claims; verify, don't trust).
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` + `execution-plan.md` — the epic context (this is 3f final).
   - `scripts/build-tool.mjs`, `scripts/slice-tool.mjs`, `scripts/README.md` — the edited files.
   - `src/lib/` and `tmp/safe-to-delete/` — to confirm the move.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/14-retire-jbc-include-old/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/14-retire-jbc-include-old/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce:
- **Retire:** `ls src/lib/jbc-include-old` → not found; `ls tmp/safe-to-delete/jbc-include-old` → present (all 10 legacy files).
- **Toolchain honesty:** `grep -rnE "jbc-include-old" scripts/` → no LIVE references (a comment explicitly marking it retired/legacy is acceptable if it names no live path; judge honestly).
- **No stragglers:** `grep -rnE "jbc-include|jbcUtil|jbcCrc32|ctCopy\b|ctFlash\b|ctConfirm\b" src/tools src/gallery scripts` → no live-code matches (historical comments/PROVENANCE OK — confirm each survivor the builder listed is genuinely historical, not a live reference).
- **Green:** `node scripts/build-all.mjs --check` → 10/10; `node scripts/test-all.mjs` → full suite green (serial). Capture the tallies.
- **#1011:** read `scripts/README.md` and spot-check 3-4 of its layout claims against the actual repo (paths exist, commands run) — it must describe the CURRENT claude-tools layout, no stale jason-code layout. Apply the DOC voice remit from shared-conventions (flag generic LLM-isms / off-voice phrasing if any) — report, don't rewrite.
- **Scope:** confirm (mtimes/filesystem; git blocked) that only the move + `scripts/build-tool.mjs` + `scripts/slice-tool.mjs` + `scripts/README.md` changed — NO tool source, `src/lib/{utils,components}`, or `project.json` edits.

On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section. If PASS, say so clearly: this verdict closes the lib-cleanup epic.