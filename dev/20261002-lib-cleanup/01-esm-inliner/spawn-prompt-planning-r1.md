<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/01-esm-inliner" role="planning" -->

You are a PLANNING subagent — 01-esm-inliner, round r1.

Produce the DESIGN for the ESM-inliner — do NOT build it. Deliver a concrete, buildable implementation plan the builder will execute: the inlining algorithm, the key design decision (new `<<ct:module …>>` token vs auto-detecting a `.mjs` include), the module-scoping approach, and a test matrix — all consistent with plan.md's Definition of Done and its ADDITIVE / byte-identical constraint.

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/01-esm-inliner`

Read, in order:
1. `charter-planning.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; the canonical chain + exact paths are in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout (where you may write)
   - `shared-conventions.md` — findings-doc format, terse-by-default comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive
   - `troubleshooting.md` — what to try before declaring a dead end

   **Task reading list (the actual design inputs):**
   - `scripts/build-tool.mjs` — THE file the builder will extend (read in full). Verbatim `TOKEN_RE` expansion; `resolveIncludeDir` default `src/lib/jbc-include-old`; EXACT `BANNER`; injectable `buildTool(dir,{includeDir,project})`.
   - `src/lib/utils/JbcByteUtil.mjs` (leaf: many `export function` + `export class`, no imports), `src/lib/utils/JbcZipUtil.mjs` (`import { crc32 } from './JbcByteUtil.mjs'`), `src/lib/utils/formats/*.mjs` + `src/lib/utils/image/*.mjs` (subdir modules importing `../JbcByteUtil.mjs`, ending in `export { … };` blocks).
   - `src/lib/components/*.mjs` (`JbcComponents`, `JbcConfirm`, `JbcLicense`, `JbcModal`, `JbcClipboardUtil`) + `src/lib/components/styles/*.css` + `footer.html`.
   - `dev/20261002-lib-cleanup/includes-diff.md` — #1010-B old→new include mapping / gaps.
   - `dev/20261002-lib-cleanup/00-epic-plan/epic-plan.md` — the phase map (you are phase 01/3a).
   - `dev/20261002-lib-cleanup/execution-plan.md` — where 3a sits (3b rename jbc→ct, 3c behavior decisions, 3d pilot, 3e fan-out, 3f retire). Design 3a so it does NOT pre-empt those.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/01-esm-inliner/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/01-esm-inliner/tmp/worker-env.md"
```

Model: sonnet

Deliverable: a DESIGN (not code) in `findings/HANDOFF.md` — the inlining algorithm step-by-step; the token-vs-auto-detect decision WITH rationale (why it stays byte-identical for the 9 current tools); how `export function|const|class`, multi-line `export { … };` blocks, and relative `./`/`../` imports are transformed; dedup + dependency-ordering approach; cycle + `export default`/unknown-form error handling; the module-scoping contract 3d will port against; and a concrete test matrix mapping each plan.md DoD row to a proposed test. Flag any open question for the builder rather than guessing. Write `findings/HANDOFF.md`.
