<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/14-retire-jbc-include-old" role="builder" -->

You are a BUILDER subagent — 14-retire-jbc-include-old, round r1 (Phase 3f, Round B — the epic's FINAL round).

All 10 build targets (9 tools + gallery) are ported to the ct lib and ZERO `<<ct:include>>` tokens remain anywhere, so the legacy `src/lib/jbc-include-old/` is dead. Retire it, clean the toolchain's stale references, update scripts/README (#1011), and prove everything stays green. This round touches shared `scripts/` — that is expected and approved.

**Tasks (full spec + DoD in `plan.md`):**
1. **Confirm preconditions FIRST:** `grep -rnE "<<ct:include " src --include="*.html" --include="*.template.html" | grep -v "jbc-include-old/"` → must be EMPTY (nothing still uses flat includes). If it is NOT empty, STOP and surface (a port missed something) — do not retire.
2. **Retire (move, do not delete):** `mkdir -p tmp/safe-to-delete && mv "src/lib/jbc-include-old" "tmp/safe-to-delete/"`. Afterward `src/lib/jbc-include-old` must not exist and `tmp/safe-to-delete/jbc-include-old/` must.
3. **Clean the toolchain honesty:** in `scripts/build-tool.mjs` the `resolveIncludeDir` default candidate points at `src/lib/jbc-include-old` (~line 88) with a comment (~line 51); `scripts/slice-tool.mjs` has a matching comment (~line 11). The flat `<<ct:include>>` mechanism is now UNUSED. Use your judgment: either remove the dead `jbc-include-old` candidate/path (and, if the whole flat-include code path is now dead, you MAY mark it legacy rather than fully rip it out — keep the change minimal and safe), or at minimum drop the dangling `jbc-include-old` reference and update the comments to reflect that flat includes are retired. **MUST NOT break `build-all --check` (10/10).** Do NOT touch unrelated build-tool behavior (the `<<ct:lib>>`/`<<ct:module>>` resolvers, project tokens, ESM inlining — leave them).
4. **#1011 — scripts/README.md:** rewrite the stale parts so it describes the ACTUAL current claude-tools layout (it still describes the old jason-code layout). Factual accuracy only; keep it skimmable; every claim must match the repo. (The broader doc-writing is the separate #1001 epic — don't expand into it.) If `docs/technical.md` has stale `jbc-include`/`jason-code` mentions, NOTE them in your handoff as a #1001 follow-up — do NOT fix them here.
5. **Full green sweep:** `node scripts/build-all.mjs --check` → 10/10; `node scripts/test-all.mjs` → full suite green; `grep -rnE "jbc-include|jbcUtil|jbcCrc32|ctCopy\b|ctFlash\b|ctConfirm\b" src/tools src/gallery scripts` → no LIVE-code matches (historical comments are OK — list any you leave); confirm `src/lib/jbc-include-old` is gone and present under `tmp/safe-to-delete/`.

If any step looks like it would break a build or needs a tool-source edit, STOP and surface it rather than guessing.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/14-retire-jbc-include-old`

(Deliverable write boundary for this round: the `mv` of `src/lib/jbc-include-old` → `tmp/safe-to-delete/`, plus edits to `scripts/build-tool.mjs`, `scripts/slice-tool.mjs`, `scripts/README.md`. Do NOT edit any tool source, `src/lib/{utils,components}/**`, `project.json`, or `00-epic-plan/**`. No `rm`, no `git`.)

Read, in order:
1. `charter-builder.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; the canonical chain + exact paths are in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive, the tool-ledger honesty rule
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the reproducibility bar your change must clear (you are shipping a code change)

   **Task reading list:**
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the full epic decision log.
   - `dev/20261002-lib-cleanup/execution-plan.md` — the epic roadmap (this is phase 3f, the final step).
   - `scripts/build-tool.mjs` (`resolveIncludeDir` ~L85-91 + comment ~L51), `scripts/slice-tool.mjs` (~L11), `scripts/README.md` (the #1011 target), `scripts/build-all.mjs` + `scripts/test-all.mjs` (the gates).
   - `src/lib/jbc-include-old/` — the dir to move.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/14-retire-jbc-include-old/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/14-retire-jbc-include-old/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the retired lib + cleaned toolchain + current scripts/README, plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `src/lib/jbc-include-old` gone + present under `tmp/safe-to-delete/`; `grep -nE "jbc-include-old" scripts/` → no live references; `node scripts/build-all.mjs --check` → 10/10; `node scripts/test-all.mjs` → full suite green; the straggler grep over `src/tools src/gallery scripts` → no live-code matches. No commits. Write `findings/HANDOFF.md`: the move confirmation, exactly what you changed in build-tool/slice-tool (remove vs mark-legacy + why), the scripts/README changes, the straggler-grep result (+ any historical exceptions you left), the full-sweep tallies (build-all --check + test-all), and the docs/technical.md #1001 follow-up note. State PASS / what-remains plainly. This is the epic's final round.