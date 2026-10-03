<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/02-jbc-to-ct" role="builder" -->

You are a BUILDER subagent — 02-jbc-to-ct, round r1.

Perform the SURGICAL `jbc`→`ct` rename of the new shared library per `plan.md`. This is NOT a blanket replace — a blanket `jbc→ct` would corrupt references to the legacy `jbc-include-old` dir, which MUST be preserved. Nothing consumes the new lib yet, so the only ripple is the Phase-3a tests (they reference lib modules by name and must be updated in lockstep to stay green).

**The exact mapping (apply in THIS order; see plan.md for the full rule set):**
1. `jbcc` → `ctc` (component class prefix; do first).
2. `data-jbc-` → `data-ct-`.
3. `jbc-` → `ct-` **EXCEPT `jbc-include`** (negative lookahead `jbc-(?!include)` — PRESERVE `jbc-include`/`jbc-include-old`).
4. `Jbc` → `Ct` (case-sensitive; PascalCase symbols + filename stems; safe inside PROVENANCE/JSDoc).
5. Rename 20 `JbcX.mjs` → `CtX.mjs` (via `mv`; git blocked) and update EVERY internal import specifier.
Then update `scripts/tests/esm-inline*.test.mjs` references (filenames + asserted symbol names) — changing ONLY the names, never what a test asserts.

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/02-jbc-to-ct`

(Your deliverable write boundary is `src/lib/utils/**`, `src/lib/components/**`, `scripts/tests/esm-inline*.test.mjs`, and optionally the `scripts/build-tool.mjs` header comment — outside your phase folder by design. `src/tools/**`, `src/gallery/**`, `src/lib/jbc-include-old/**`, `src/lib/test-support/**` are READ-ONLY. Use the phase folder for findings/scratch + any codemod script.)

Read, in order:
1. `charter-builder.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, the full rename spec, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; the canonical chain + exact paths are in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the reproducibility bar your change must clear (you are shipping a code change)

   **Task reading list:**
   - `dev/20261002-lib-cleanup/01-esm-inliner/findings/HANDOFF.md` — the Phase-3a inliner you build on; its tests reference the lib by name (your ripple); the inliner itself is name-agnostic.
   - `src/lib/utils/**` + `src/lib/components/**` — the 20 `Jbc*.mjs` + `components/styles/*.css` to rename; note internal imports (`JbcZipUtil`→`JbcByteUtil`; image modules → `../JbcByteUtil.mjs`).
   - `scripts/tests/esm-inline.test.mjs` + `scripts/tests/esm-inline-hardening.test.mjs` — search for `Jbc`; update filename + symbol references only.
   - `src/lib/utils/PROVENANCE.md` — has `Jbc` symbols (rename) AND `jbc-include` paths (PRESERVE — case-sensitive `Jbc→Ct` leaves lowercase `jbc-include` alone; do not touch it).
   - `scripts/build-tool.mjs` — update only the header doc-comment example names (`JbcConfirm.mjs`→`CtConfirm.mjs`, …) for accuracy; comment-only, re-run `--check` to prove no output change.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/02-jbc-to-ct/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/02-jbc-to-ct/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the renamed, self-consistent lib + updated Phase-3a tests. **Gates, ALL must hold before you claim done:** `grep -rnE "Jbc|jbcc|data-jbc|jbc-(?!include)" src/lib/utils src/lib/components` → no matches; no `Jbc*.mjs` file remains under the lib; `node --test scripts/tests/` → 38/38; `node scripts/build-all.mjs --check` → 10/10; and every `jbc-include`/`jbc-include-old` string is byte-unchanged. The diff must touch only the writable paths above — NO `src/tools/**` edits. If any replacement is ambiguous or would touch `jbc-include`, STOP and surface it rather than guessing. Write `findings/HANDOFF.md` (the mapping applied incl. the `jbc-include` exclusion, the file-rename list, the test references updated, both gate tallies, the exact diff scope, any ambiguity surfaced).