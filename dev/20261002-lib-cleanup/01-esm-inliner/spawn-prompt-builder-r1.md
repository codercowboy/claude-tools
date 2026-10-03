<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/01-esm-inliner" role="builder" -->

You are a BUILDER subagent — 01-esm-inliner, round r1.

Implement the ESM-inlining capability in `scripts/build-tool.mjs` per `plan.md` and the planner's design (`findings/HANDOFF.md`), keeping the 9 shipped tools BYTE-IDENTICAL. This is the riskiest enabler of the epic; it is ADDITIVE only — no tool and no library module may be edited.

**LOCKED orchestrator decisions on the planner's open questions (O1–O8) — follow these, do NOT re-litigate:**
- **O1 (tokens):** TWO single-purpose tokens — `<<ct:module PATH>>` (ESM transform) + `<<ct:lib PATH>>` (verbatim paste, for `components/styles/*.css` + `footer.html`), both resolved against a new injectable `libDir` (default `src/lib`). Leave `TOKEN_RE`, `BANNER`, `resolveIncludeDir` (and its `src/lib/jbc-include-old` default), `PROJECT_TOKEN_RE`, and the include/inline loop byte-for-byte untouched.
- **O2 (namespace `as ns`):** DEFER — do NOT build it in 3a. BUT DO implement the build-time root-vs-root export-collision check (throw, naming both tokens).
- **O3 (multi-site/worker re-emission):** OUT OF SCOPE for 3a.
- **O4 (`import * as ns`):** THROW (unsupported).
- **O5 (`export let|var`):** THROW ("mutable export not supported").
- **O6 (`libDir` default):** stays `src/lib`, INDEPENDENT of `resolveIncludeDir` — do not merge the two knobs (a 3f note).
- **O7 (specifier form):** a non-`.mjs` or extensionless lib specifier THROWS — never guess.
- **O8 (Node):** assume the current Node; no action.
- **Scoping:** per-module function scope (IIFE + export object) is REQUIRED — flat concatenation is rejected (the planner found 8 real top-level name collisions across lib modules; flat concat would SyntaxError).

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/01-esm-inliner`

(Your write boundary for the DELIVERABLE itself is `scripts/` — `scripts/build-tool.mjs` plus new `scripts/tests/…`. That is outside your phase folder by design for this round; everything else under `src/**` is READ-ONLY. Use the phase folder for findings/scratch.)

Read, in order:
1. `charter-builder.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; the canonical chain + exact paths are in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the reproducibility bar your change must clear (you are shipping a code change)

   **Task reading list:**
   - `findings/HANDOFF.md` / `findings/planning-design-r1.md` (the PLANNING agent's design — read BEFORE touching code; it is your blueprint, incl. the algorithm, scoping contract, and test matrix T1–T10).
   - `scripts/build-tool.mjs` — THE file to extend. Preserve EXACTLY: `BANNER` text, the `ct:` token prefix, `TOKEN_RE`, `resolveIncludeDir` default (`src/lib/jbc-include-old`), the project-identity (`project.json`) token handling, the pure `buildTool(dir,{includeDir,project})` seam.
   - `scripts/build-all.mjs` — how `--check` iterates every tool (your byte-identical gate).
   - `src/lib/utils/*.mjs` (+ `formats/`, `image/` subdirs), `src/lib/components/*.mjs` (+ `styles/*.css`, `footer.html`) — the ESM to inline; shapes: `export function|const|class`, multi-line `export { … };` blocks, relative `./`/`../` imports between modules.
   - `dev/20261002-lib-cleanup/includes-diff.md` — #1010-B context.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/01-esm-inliner/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/01-esm-inliner/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the extended `scripts/build-tool.mjs` (ESM-inlining added; existing verbatim include/inline behavior untouched) + a `node:test` suite under `scripts/tests/` covering every DoD row. **Gates, both MUST hold before you claim done:** `node scripts/build-all.mjs --check` → **10/10 up to date, 0 failed** (byte-identical — if not, your change is wrong; never edit a tool's index.html to pass), and `node --test scripts/tests/` green. The diff must touch ONLY `scripts/`. If a DoD row cannot be met without editing a tool or a lib module, STOP and surface it rather than widening scope. For your handoff, APPEND a `## Builder round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the planner's design that is already in that file (it is also preserved at `findings/planning-design-r1.md`). Your section: what you built, the mechanism + why, test inventory, the two tallies (`build-all --check` + `node --test`), exact files touched, and the one-line handoff telling 3d how a tool invokes ESM inlining.
