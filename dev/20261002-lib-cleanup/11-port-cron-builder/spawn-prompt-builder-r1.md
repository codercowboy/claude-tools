<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/11-port-cron-builder" role="builder" -->

You are a BUILDER subagent — 11-port-cron-builder, round r1.

Port exactly ONE tool — `cron-builder` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Round 8 of the Phase-3e fan-out; the recipe is proven and HARDENED (R6). cron-builder uses a SMALL set. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; closest example = the inflation-calculator HANDOFF):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script><<ct:include copy.js>></script>` block; inside the module script, above `<<ct:inline app.mjs>>`, add ONLY `<<ct:module components/CtClipboardUtil.mjs>>` and `<<ct:module components/CtLicense.mjs>>`. **Do NOT inline CtConfirm** (template line ~29 `ctConfirm` is a COMMENT on an unused `--ctc-accent` var — cron-builder has no confirm dialogs) **nor CtUtil/CtByteUtil**.
2. In `source/app.mjs`: `ctCopy`→`copy`, `ctFlash`→`flash`. The function-scoped `const el` at app.mjs:523 is SAFE (you are NOT inlining CtUtil, which exports `el`) — keep it.
3. Reword the template line ~29 `ctConfirm` comment (e.g. "shared confirm component accents") so the source grep gate (`ctConfirm`) passes. The `--ctc-accent` CSS var may stay.
4. The e2e (line ~512) asserts `expect(await page.evaluate(() => typeof window.ctLicense)).toBe('function')` — the OLD global, now gone. Update that ONE assertion to the new wiring (e.g. assert the footer `[data-ct-license]` button is present, or that clicking it opens the modal — the surrounding test already asserts the modal's MIT text + close). Keep the SAME intent. PRE-APPROVED license-wiring delta per `00-epic-plan/decisions.md`. Any OTHER red test is STOP-and-surface.
5. **FULL collision scan (R6 lesson):** for each module you inline (CtClipboardUtil, CtLicense), grep ALL of `source/app.mjs` for a TOP-LEVEL local declaration matching its exports (`copy`, `flash`, `openLicense`); rename/dedupe any. (Unlikely, but check — a top-level `const copy`/`flash` would collide.)
6. **MANDATORY smoke-check BEFORE the full e2e** (R6 catch). After `build-tool`, from the project root run and confirm `present: true` + `errors (0)`:
```
node -e 'const pw=require(process.cwd()+"/src/tools/cron-builder/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/tools/cron-builder/index.html",{waitUntil:"load"});await p.waitForTimeout(1500);console.log("present:",await p.evaluate(()=>!!window.__cronBuilder));console.log("errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
   If `present: false` or any error, FIX before the e2e. (`window.__cronBuilder` is the tool's test API.)
7. Only once the smoke-check is clean, run the gates.

Repo-root `project.json` already exists — do not touch it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/11-port-cron-builder`

(Deliverable write boundary: `src/tools/cron-builder/**` only. Other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` are READ-ONLY. If a shared change seems necessary, STOP and surface it.)

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
   - `dev/20261002-lib-cleanup/07-port-inflation-calculator/findings/HANDOFF.md` — the closest worked example (copy+footer+license delta).
   - `src/lib/components/` — `copy`/`flash` (`CtClipboardUtil.mjs`), `openLicense` (`CtLicense.mjs`); footer + styles.
   - `src/tools/cron-builder/` — the port target: `source/` (template + `app.mjs` + `styles.css`), `tests/` (unit + e2e; test API `window.__cronBuilder`; the `window.ctLicense` assertion ~line 512), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/11-port-cron-builder/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/11-port-cron-builder/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `cron-builder` (source + regenerated `index.html` + the updated license e2e), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** the smoke-check prints `present: true` / `errors (0)`; `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm" src/tools/cron-builder/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/cron-builder"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; unit green (from tool dir); cron-builder Playwright e2e green **serial** (from tool dir: `npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). A red test that is NOT the pre-approved license-wiring delta is STOP-and-surface. No commits. Write `findings/HANDOFF.md`: what changed, the license-e2e delta, the ctConfirm-comment reword, the smoke-check output, and both gate tallies. State PASS / what-remains plainly.