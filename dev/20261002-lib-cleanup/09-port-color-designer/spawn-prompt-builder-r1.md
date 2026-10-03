<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/09-port-color-designer" role="builder" -->

You are a BUILDER subagent — 09-port-color-designer, round r1.

Port exactly ONE tool — `color-designer` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Round 6 of the Phase-3e fan-out; the recipe is proven. This tool is like qr-generator (crc32 via CtByteUtil) plus confirm.js — the fullest module set: CtByteUtil + CtUtil + CtClipboardUtil + CtConfirm + CtLicense. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; closest example = the qr-generator HANDOFF):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script>` blocks for `confirm.js`/`copy.js`/`crc32.js`/`util.js`; inside the module script, above `<<ct:inline app.mjs>>`, add `<<ct:module utils/CtByteUtil.mjs>>` (crc32), `<<ct:module utils/CtUtil.mjs>>` (debounce), `<<ct:module components/CtClipboardUtil.mjs>>` (copy/flash), `<<ct:module components/CtConfirm.mjs>>` (confirmDialog), `<<ct:module components/CtLicense.mjs>>` (footer License).
2. In `source/app.mjs`: DELETE the `const crc32 = jbcCrc32` alias (crc32 now a top-level const from the inlined CtByteUtil); `jbcUtil.debounce`→`debounce` (delete that alias too); `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog`. Keep all `crc32(...)` call sites.
3. `styles.css:17` mentions `ctConfirm` in a comment — reword it (the grep gate scans `source/`).
4. Collision check: inlining whole CtByteUtil + CtUtil drops ALL their exports as top-level consts (crc32/base64/hex/md5/sha*/formatBytes/makeId + clamp/num/clampInt/escapeHtml/el/slugify/debounce/…). Grep color-designer's own top-level declarations against those before finalizing; on a collision rename the TOOL-LOCAL one (keep semantics). Recon found none — verify.
5. Accept inlining the whole CtByteUtil (~585 lines) for crc32 — note the size; do NOT refactor the lib.
6. The `does not reference crypto.randomUUID` convention test should now PASS (the lib comment that named it was already reworded in an earlier round). No license-wiring e2e is present → expect ZERO test deltas. Any red test is STOP-and-surface.

Repo-root `project.json` already exists — footer tokens substitute; do not add or edit it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/09-port-color-designer`

(Your deliverable write boundary is `src/tools/color-designer/**` — source + tests + its regenerated `index.html`. Everything else — other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + proven recipe (§3d) + carry-forwards (incl. the crypto.randomUUID lib fix that pre-empts this tool's convention test).
   - `dev/20261002-lib-cleanup/06-port-qr-generator/findings/HANDOFF.md` — the closest worked example (CtByteUtil inline for crc32).
   - `src/lib/components/` + `src/lib/utils/` — `crc32` (`utils/CtByteUtil.mjs`), `debounce` (`utils/CtUtil.mjs`), `copy`/`flash` (`components/CtClipboardUtil.mjs`), `confirmDialog` (`components/CtConfirm.mjs`), `openLicense` (`components/CtLicense.mjs`); footer + styles.
   - `src/tools/color-designer/` — the port target: `source/` (template + `app.mjs` + `styles.css`), `tests/` (unit + e2e), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/09-port-color-designer/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/09-port-color-designer/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `color-designer` (source + regenerated `index.html`), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm" src/tools/color-designer/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/color-designer"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; color-designer Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`), INCLUDING the `does not reference crypto.randomUUID` convention test (confirm `grep -nE "crypto\.randomUUID" src/tools/color-designer/index.html` → no matches). Run tests DIRECTLY (not `npm test`). A red test is STOP-and-surface (no pre-approved delta expected). No commits. Write `findings/HANDOFF.md`: what changed, the styles.css:17 ctConfirm resolution, the CtByteUtil-inline size note, any collision renames, confirmation the crypto.randomUUID test passed, and both gate tallies. State PASS / what-remains plainly.