<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/04-port-uuid-generator" role="builder" -->

You are a BUILDER subagent — 04-port-uuid-generator, round r1.

Port exactly ONE tool — `uuid-generator` — off the legacy flat-include lib (`src/lib/jbc-include-old/`, consumed via `<<ct:include …>>` globals) and onto the new ESM `ct` lib (`src/lib/{utils,components}/`, consumed via the `<<ct:module …>>` / `<<ct:lib …>>` tokens). This is round 2 of the Phase-3e fan-out; the pilot (3d, base64-tool) already proved the recipe — follow it. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; worked example in the pilot HANDOFF):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script><<ct:include copy.js>></script>` / `util.js` blocks; inside the module script, above `<<ct:inline app.mjs>>`, add `<<ct:module components/CtClipboardUtil.mjs>>`, `<<ct:module utils/CtUtil.mjs>>`, `<<ct:module components/CtConfirm.mjs>>`, `<<ct:module components/CtLicense.mjs>>`.
2. In `source/app.mjs`: `ctCopy`→`copy`, `ctFlash`→`flash`, `ctConfirm`→`confirmDialog`, `jbcUtil.debounce`→`debounce` (DELETE the `const debounce = jbcUtil.debounce` alias — it becomes a TDZ self-reference after the rename). If a `__ctCopySync`-style helper exists, rename it (`__copySync`) so the `ctCopy` gate grep is clean. Also check the template (line ~29 uses `ctConfirm`).
3. `CtLicense` self-wires the footer `[data-ct-license]` trigger → `openLicense` on evaluation. The tool sets a third-party list for the license modal — confirm `CtLicense` reads it correctly (`window.ctThirdParty`, post-3b rename) and the modal still lists them.
4. The e2e references the OLD `window.ctLicense()` global — update it to the new wiring (PRE-APPROVED license-wiring delta per `00-epic-plan/decisions.md`). Keep the SAME assertion intent (button opens an accessible modal; focus trap; Esc/✕/backdrop close). This is the ONE allowed test delta — any OTHER red test is STOP-and-surface.

Repo-root `project.json` already exists (created in the pilot) — the footer tokens will substitute; do not add or edit it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/04-port-uuid-generator`

(Your deliverable write boundary is `src/tools/uuid-generator/**` — source + tests + its regenerated `index.html`. Everything else — other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + the proven per-tool recipe (§3d) + carry-forwards (project.json dependency; check local-vs-lib util duplicates before importing; slice-tool unexercised).
   - `dev/20261002-lib-cleanup/03-pilot-base64-port/findings/HANDOFF.md` — the pilot's worked example of this exact port; your closest reference.
   - `src/lib/components/` + `src/lib/utils/` — exports: `copy`/`flash` (`components/CtClipboardUtil.mjs`), `debounce`/`downloadBlob` (`utils/CtUtil.mjs`), `confirmDialog` (`components/CtConfirm.mjs`), `openLicense` (`components/CtLicense.mjs`); footer at `components/footer.html`, CSS at `components/styles/`.
   - `src/tools/uuid-generator/` — the port target: current `source/` (template + `app.mjs` + `logic.mjs` + `styles.css`), `tests/` (unit + e2e; the e2e references the License), and the built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/04-port-uuid-generator/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/04-port-uuid-generator/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `uuid-generator` (source + regenerated `index.html` + the updated license e2e) in the working tree, plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm" src/tools/uuid-generator/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/uuid-generator"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; uuid-generator Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1` — do NOT change it). Run tests DIRECTLY (not via `npm test` — the `pretest:*` hooks run `build --check`). A red test that is NOT the pre-approved license-wiring delta is STOP-and-surface, never a silent rewrite. No commits. Write `findings/HANDOFF.md`: what changed, the license-e2e delta + why pre-approved, any tool-specific surprise (e.g. ctThirdParty wiring), and both gate tallies. State PASS / what-remains plainly.
