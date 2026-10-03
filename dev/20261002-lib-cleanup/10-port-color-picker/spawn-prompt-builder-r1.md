<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/10-port-color-picker" role="builder" -->

You are a BUILDER subagent — 10-port-color-picker, round r1.

Port exactly ONE tool — `color-picker` — off the legacy flat-include lib (`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Round 7 of the Phase-3e fan-out; the recipe is proven and now HARDENED after R6. color-picker uses a SMALL module set. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; full spec + DoD in `plan.md`; closest example = the color-converter HANDOFF):**
1. In `source/index.template.html`: CSS → `<<ct:lib components/styles/base.css>>` + `controls.css`; footer → `<<ct:lib components/footer.html>>`; delete the classic `<script>` blocks for `confirm.js`/`copy.js`; inside the module script, above `<<ct:inline app.mjs>>`, add ONLY `<<ct:module components/CtConfirm.mjs>>`, `<<ct:module components/CtClipboardUtil.mjs>>`, `<<ct:module components/CtLicense.mjs>>`. **Do NOT add `<<ct:module utils/CtUtil.mjs>>` or CtByteUtil** — color-picker uses neither.
2. In `source/app.mjs`: `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`. **KEEP the tool-local `function clamp` at line ~149** — it is SAFE precisely because you are NOT inlining CtUtil (which also exports `clamp`). If you inlined CtUtil, it would collide (the R6-class bug) — so don't.
3. `styles.css` may mention `ctConfirm` in a comment — reword it if the source grep gate flags it.
4. **FULL collision scan (R6 lesson):** for each module you DO inline (CtConfirm, CtClipboardUtil, CtLicense), grep ALL of `source/app.mjs` (any indentation) for a local declaration matching any of that module's exports; rename/dedupe any collision. (These three export few names — `confirmDialog`, `copy`, `flash`, `openLicense` — so collisions are unlikely, but check.)
5. **MANDATORY smoke-check BEFORE the full e2e** (the R6 catch — a dup-decl or init error renders a green-looking UI with dead JS). After `build-tool`, from the project root run and confirm `present: true` + `errors (0)`:
```
node -e 'const pw=require(process.cwd()+"/src/tools/color-picker/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/tools/color-picker/index.html",{waitUntil:"load"});await p.waitForTimeout(1500);console.log("present:",await p.evaluate(()=>!!window.__colorPicker));console.log("errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
   If `present: false` or any error, FIX before running the e2e. (`window.__colorPicker` is color-picker's test API; the e2e `beforeEach` waits on it.)
6. Only once the smoke-check is clean, run the gates. No license-wiring e2e is present → expect ZERO test deltas; any red test is STOP-and-surface.

Repo-root `project.json` already exists — do not touch it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/10-port-color-picker`

(Deliverable write boundary: `src/tools/color-picker/**` only. Other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` are READ-ONLY. If a shared change seems necessary, STOP and surface it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off decisions + recipe (§3d) + the R6 collision/smoke-check lessons.
   - `dev/20261002-lib-cleanup/08-port-color-converter/findings/HANDOFF.md` — the closest worked example (CtConfirm + CtClipboardUtil).
   - `src/lib/components/` — `confirmDialog` (`CtConfirm.mjs`), `copy`/`flash` (`CtClipboardUtil.mjs`), `openLicense` (`CtLicense.mjs`); footer + styles.
   - `src/tools/color-picker/` — the port target: `source/` (template + `app.mjs` + `styles.css`), `tests/` (unit + e2e; test API `window.__colorPicker`), built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/10-port-color-picker/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/10-port-color-picker/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `color-picker` (source + regenerated `index.html`), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** the smoke-check prints `present: true` / `errors (0)`; `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm" src/tools/color-picker/source` → no matches; `node scripts/build-tool.mjs --dir="src/tools/color-picker"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10; unit green (from tool dir: `cd src/tools/color-picker && node --test tests/unit/*.test.mjs`); color-picker Playwright e2e green **serial** (from tool dir: `npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). A red test is STOP-and-surface (no pre-approved delta expected). No commits. Write `findings/HANDOFF.md`: what changed, confirmation CtUtil was NOT inlined (local clamp kept), the smoke-check output, and both gate tallies. State PASS / what-remains plainly.