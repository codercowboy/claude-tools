<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/07-port-inflation-calculator" role="builder" -->

You are a BUILDER subagent — 07-port-inflation-calculator, round r1.

Port exactly ONE tool — `inflation-calculator` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). This is round 4 of the Phase-3e fan-out; base64-tool / uuid-generator / qr-generator already proved the recipe — follow it. This is the SIMPLEST port so far (only copy.js + footer from the lib). Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; worked examples in the prior HANDOFFs):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script><<ct:include copy.js>></script>` block; inside the module script, above `<<ct:inline app.mjs>>`, add `<<ct:module components/CtClipboardUtil.mjs>>` (copy/flash) and `<<ct:module components/CtLicense.mjs>>` (footer License). KEEP the `window.__INFLATION_CPI__ = <<ct:inline cpi-data.json>>;` line and `<<ct:inline app.mjs>>` exactly as they are.
2. In `source/app.mjs`: `ctCopy`→`copy`, `ctFlash`→`flash`.
3. The e2e has a test (~line 412-413) `window.ctLicense() opens the modal programmatically` that calls `await page.evaluate(() => window.ctLicense())`. `window.ctLicense` NO LONGER EXISTS (it's the module-scoped `openLicense`, not a window global). Update that test to the supported mechanism — click the footer `[data-ct-license]` link (see how qr-generator/uuid did their license e2e) — keeping the SAME assertion intent (the license modal opens). PRE-APPROVED license-wiring delta per `00-epic-plan/decisions.md`. Any OTHER red test is STOP-and-surface.
4. Sanity-check nothing tool-local collides with CtClipboardUtil's `copy`/`flash` exports (recon found none). No crc32/CtByteUtil here.

Repo-root `project.json` already exists — footer tokens substitute; do not add or edit it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/07-port-inflation-calculator`

(Your deliverable write boundary is `src/tools/inflation-calculator/**` — source + tests + its regenerated `index.html`. Everything else — other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + proven recipe (§3d).
   - `dev/20261002-lib-cleanup/04-port-uuid-generator/findings/HANDOFF.md` — worked example incl. the license e2e delta.
   - `src/lib/components/CtClipboardUtil.mjs` (`copy`/`flash`) + `CtLicense.mjs` (`openLicense`) + `footer.html` + `styles/`.
   - `src/tools/inflation-calculator/` — the port target: `source/` (template + `app.mjs` + `cpi-data.json`), `tests/` (unit + e2e; the `window.ctLicense()` test ~line 412), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/07-port-inflation-calculator/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/07-port-inflation-calculator/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `inflation-calculator` (source + regenerated `index.html` + the updated license e2e), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|ctCopy|ctFlash" src/tools/inflation-calculator/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/inflation-calculator"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; inflation-calculator Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). A red test that is NOT the pre-approved license-wiring delta is STOP-and-surface. No commits. Write `findings/HANDOFF.md`: what changed, the license-e2e delta, and both gate tallies. State PASS / what-remains plainly.