<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/08-port-color-converter" role="builder" -->

You are a BUILDER subagent — 08-port-color-converter, round r1.

Port exactly ONE tool — `color-converter` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Round 5 of the Phase-3e fan-out; the recipe is proven (base64/uuid/qr/inflation). This tool mirrors uuid-generator (CtConfirm + CtClipboardUtil + CtUtil + footer CtLicense; no crc32). Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; closest example = the uuid HANDOFF):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script>` blocks for `confirm.js`/`copy.js`/`util.js`; inside the module script, above `<<ct:inline app.mjs>>`, add `<<ct:module components/CtConfirm.mjs>>`, `<<ct:module components/CtClipboardUtil.mjs>>`, `<<ct:module utils/CtUtil.mjs>>`, `<<ct:module components/CtLicense.mjs>>`.
2. In `source/app.mjs`: `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`, `jbcUtil.debounce`→`debounce` (DELETE the `const debounce = jbcUtil.debounce` alias — TDZ self-ref after rename).
3. `styles.css:18` mentions `ctConfirm` — inspect it; it's likely a comment or a `.ctc-*` class reference (CtConfirm self-injects its own `.ctc-*` styles, unchanged), so probably no change needed — confirm and note.
4. Collision check: no crc32/CtByteUtil here, but still grep color-converter's top-level declarations against CtUtil's exports (clamp/num/clampInt/escapeHtml/el/slugify/debounce/…) before finalizing; on a collision rename the TOOL-LOCAL one (keep semantics).
5. No license-wiring e2e is present in this tool, so expect ZERO test deltas. Any red test is STOP-and-surface — do not rewrite a test.

Repo-root `project.json` already exists — footer tokens substitute; do not add or edit it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/08-port-color-converter`

(Your deliverable write boundary is `src/tools/color-converter/**` — source + tests + its regenerated `index.html`. Everything else — other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + proven recipe (§3d) + carry-forwards.
   - `dev/20261002-lib-cleanup/04-port-uuid-generator/findings/HANDOFF.md` — the closest worked example (same module set).
   - `src/lib/components/` + `src/lib/utils/` — `confirmDialog` (`components/CtConfirm.mjs`), `copy`/`flash` (`components/CtClipboardUtil.mjs`), `debounce` (`utils/CtUtil.mjs`), `openLicense` (`components/CtLicense.mjs`); footer + styles.
   - `src/tools/color-converter/` — the port target: `source/` (template + `app.mjs` + `styles.css`), `tests/` (unit + e2e), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/08-port-color-converter/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/08-port-color-converter/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `color-converter` (source + regenerated `index.html`), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm" src/tools/color-converter/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/color-converter"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; color-converter Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). A red test is STOP-and-surface (no pre-approved delta expected). No commits. Write `findings/HANDOFF.md`: what changed, the styles.css:18 ctConfirm resolution, any collision renames, and both gate tallies. State PASS / what-remains plainly.