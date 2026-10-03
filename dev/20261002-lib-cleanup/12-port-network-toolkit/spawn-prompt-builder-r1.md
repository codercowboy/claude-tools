<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/12-port-network-toolkit" role="builder" -->

You are a BUILDER subagent — 12-port-network-toolkit, round r1 (the FINAL tool port).

Port exactly ONE tool — `network-toolkit` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Round 9 of the Phase-3e fan-out; the recipe is proven and HARDENED (R6). Same shape as cron-builder: copy.js + footer only. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; closest examples = the cron-builder + inflation-calculator HANDOFFs):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script><<ct:include copy.js>></script>` block; inside the module script, above `<<ct:inline app.mjs>>`, add ONLY `<<ct:module components/CtClipboardUtil.mjs>>` and `<<ct:module components/CtLicense.mjs>>`. **Do NOT inline CtConfirm/CtUtil/CtByteUtil.**
2. In `source/app.mjs`: `ctCopy`→`copy`, `ctFlash`→`flash`.
3. The e2e (line ~475) is `test('window.ctLicense() opens the modal programmatically', …)` calling `await page.evaluate(() => window.ctLicense())`. `window.ctLicense` is GONE. Update it to click the footer `[data-ct-license]` link (mirror inflation-calculator's delta — rename the test to "footer License link opens the modal" and click the link), keeping the SAME assertions (modal visible, contains "MIT License"). PRE-APPROVED license-wiring delta per `00-epic-plan/decisions.md`. Any OTHER red test is STOP-and-surface.
4. **FULL collision scan (R6 lesson):** grep ALL of `source/app.mjs` for a TOP-LEVEL local declaration matching CtClipboardUtil/CtLicense exports (`copy`, `flash`, `openLicense`); rename/dedupe any. (Recon found none — verify.)
5. **MANDATORY smoke-check BEFORE the full e2e** (R6 catch). After `build-tool`, from the project root run and confirm `present: true` + `errors (0)`:
```
node -e 'const pw=require(process.cwd()+"/src/tools/network-toolkit/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/tools/network-toolkit/index.html",{waitUntil:"load"});await p.waitForTimeout(1500);console.log("present:",await p.evaluate(()=>!!window.__networkToolkit));console.log("errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
   If `present: false` or any error, FIX before the e2e. (`window.__networkToolkit` is the tool's test API.)
6. Only once the smoke-check is clean, run the gates.

Repo-root `project.json` already exists — do not touch it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/12-port-network-toolkit`

(Deliverable write boundary: `src/tools/network-toolkit/**` only. Other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` are READ-ONLY. If a shared change seems necessary, STOP and surface it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off decisions + recipe (§3d) + R6 collision/smoke-check lessons.
   - `dev/20261002-lib-cleanup/11-port-cron-builder/findings/HANDOFF.md` + `dev/20261002-lib-cleanup/07-port-inflation-calculator/findings/HANDOFF.md` — identical-shape examples (inflation shows the programmatic-open→footer-click delta).
   - `src/lib/components/` — `copy`/`flash` (`CtClipboardUtil.mjs`), `openLicense` (`CtLicense.mjs`); footer + styles.
   - `src/tools/network-toolkit/` — the port target: `source/` (template + `app.mjs` + `styles.css`), `tests/` (unit + e2e; test API `window.__networkToolkit`; the `window.ctLicense()` test ~line 475), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/12-port-network-toolkit/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/12-port-network-toolkit/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `network-toolkit` (source + regenerated `index.html` + the updated license e2e), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** the smoke-check prints `present: true` / `errors (0)`; `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm" src/tools/network-toolkit/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/network-toolkit"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; unit green (from tool dir); network-toolkit Playwright e2e green **serial** (from tool dir: `npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). A red test that is NOT the pre-approved license-wiring delta is STOP-and-surface. No commits. Write `findings/HANDOFF.md`: what changed, the license-e2e delta, the smoke-check output, and both gate tallies. State PASS / what-remains plainly.