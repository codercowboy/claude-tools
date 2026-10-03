<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/06-port-qr-generator" role="builder" -->

You are a BUILDER subagent — 06-port-qr-generator, round r1.

Port exactly ONE tool — `qr-generator` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). This is round 3 of the Phase-3e fan-out; the pilot (base64-tool) and uuid-generator already proved the recipe — follow it. qr-generator exercises the widest lib surface yet (crc32 + the License third-party list), so it also validates the Phase-05 lib fix. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; worked examples in the pilot + uuid HANDOFFs):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script>` include blocks for `copy.js`/`crc32.js`/`util.js`; inside the module script, above `<<ct:inline app.mjs>>`, add `<<ct:module utils/CtByteUtil.mjs>>` (for crc32), `<<ct:module utils/CtUtil.mjs>>` (debounce), `<<ct:module components/CtClipboardUtil.mjs>>` (copy/flash), `<<ct:module components/CtConfirm.mjs>>` (confirmDialog), `<<ct:module components/CtLicense.mjs>>` (footer License).
2. In `source/app.mjs`: DELETE `const crc32 = jbcCrc32` (line ~95 — crc32 is now a top-level const from the inlined CtByteUtil module; the alias would collide / be a TDZ self-ref). `jbcUtil.debounce`→`debounce` (delete any alias); `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog` (also template ~line uses ctConfirm). Keep all `crc32(...)` call sites — they now resolve to the module export.
3. **Collision check (uuid lesson):** CtByteUtil exports MANY names (base64/hex/md5/sha*/formatBytes/makeId/getRandomBytes/…) and CtUtil exports clamp/num/clampInt/escapeHtml/el/slugify/…; inlining a whole module drops ALL its exports as top-level consts. Before finalizing, grep qr-generator's own top-level declarations for any name matching those exports; on a collision, rename the TOOL-LOCAL one (keep its semantics). Recon showed no obvious collisions, but verify.
4. Accept inlining the whole CtByteUtil (~585 lines) for just crc32 — note the size in the handoff; do NOT refactor the lib into a crc32-only module (out of scope).
5. The e2e references the OLD `window.ctLicense()` global AND sets `window.ctThirdParty` to assert the License modal lists third parties. Update the `ctLicense` ref to the new wiring (PRE-APPROVED license delta per `00-epic-plan/decisions.md`), keeping the same assertion intent. The `ctThirdParty` assertion should now PASS as-is because Phase 05 fixed `CtLicense` to read `window.ctThirdParty` — keep it; it validates that fix. Any OTHER red test is STOP-and-surface.

Repo-root `project.json` already exists — footer tokens substitute; do not add or edit it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/06-port-qr-generator`

(Your deliverable write boundary is `src/tools/qr-generator/**` — source + tests + its regenerated `index.html`. Everything else — other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + proven recipe (§3d) + carry-forwards (project.json; check local-vs-lib dups; whole-module-inline collisions).
   - `dev/20261002-lib-cleanup/03-pilot-base64-port/findings/HANDOFF.md` + `dev/20261002-lib-cleanup/04-port-uuid-generator/findings/HANDOFF.md` — two worked examples (uuid shows the license e2e delta + a collision rename).
   - `src/lib/components/` + `src/lib/utils/` — exports: `crc32` (`utils/CtByteUtil.mjs`), `debounce` (`utils/CtUtil.mjs`), `copy`/`flash` (`components/CtClipboardUtil.mjs`), `confirmDialog` (`components/CtConfirm.mjs`), `openLicense` (`components/CtLicense.mjs`, reads `window.ctThirdParty`).
   - `src/tools/qr-generator/` — the port target: `source/` (template + `app.mjs`), `tests/` (unit + e2e; License/ctThirdParty assertions ~lines 1130/1133/1176), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/06-port-qr-generator/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/06-port-qr-generator/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `qr-generator` (source + regenerated `index.html` + the updated license e2e), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm" src/tools/qr-generator/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/qr-generator"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; qr-generator Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`), INCLUDING the ctThirdParty third-party-list assertion. Run tests DIRECTLY (not `npm test`). A red test that is NOT the pre-approved license-wiring delta is STOP-and-surface. No commits. Write `findings/HANDOFF.md`: what changed, the license-e2e delta, whether the ctThirdParty assertion passed (Phase-05 validation), the CtByteUtil-inline size note, any collision renames, and both gate tallies. State PASS / what-remains plainly.