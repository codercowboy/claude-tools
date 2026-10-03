<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/13-port-gallery" role="builder" -->

You are a BUILDER subagent — 13-port-gallery, round r1 (Phase 3f, Round A).

Port `src/gallery` — the landing page and 10th `build-all` target — off the legacy flat-include lib and onto the new ESM `ct` lib. It is the LAST consumer of flat `<<ct:include>>` tokens; porting it unblocks the retire of `jbc-include-old` (Round B). The gallery is a STATIC page: `source/index.template.html` + `styles.css`, no `app.mjs`, no tests. Do NOT touch any tool or the shared `src/lib/` or `jbc-include-old` (that's Round B).

**Known port shape (front-loaded; full spec + DoD in `plan.md`):**
1. In `source/index.template.html`: `<<ct:include gallery.css>>` → `<<ct:lib components/styles/gallery.css>>` (line ~14); `<<ct:include footer.html>>` → `<<ct:lib components/footer.html>>` (line ~80); keep `<<ct:inline styles.css>>`.
2. The old footer inlined `license.js` (so the footer License button worked); the new `footer.html` does NOT. ADD, after the footer include, a module script so the License button still works:
   `<script type="module"><<ct:module components/CtLicense.mjs>></script>`
   (`CtLicense` self-wires the `[data-ct-license]` trigger → `openLicense` on evaluation.)
3. No `app.mjs` → no collision risk. Rebuild: `node scripts/build-tool.mjs --dir="src/gallery"`.
4. **MANDATORY smoke-check** (the behavior gate — the gallery has no test harness). From the project root (borrow any tool's playwright):
```
node -e 'const pw=require(process.cwd()+"/src/tools/base64-tool/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/gallery/index.html",{waitUntil:"load"});await p.waitForTimeout(800);const btn=await p.evaluate(()=>!!document.querySelector("[data-ct-license]"));await p.click("[data-ct-license]").catch(()=>{});await p.waitForTimeout(400);const modal=await p.evaluate(()=>{const m=document.querySelector("[data-testid=\"license-modal\"]")||document.querySelector("[role=\"dialog\"]");return !!(m && (m.offsetParent!==null || getComputedStyle(m).display!=="none"));});console.log("btn:",btn,"modalVisible:",modal,"errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
   Require: `btn: true`, `modalVisible: true`, `errors(0)`. If the modal selector differs, inspect `CtLicense.mjs` for the actual modal testid/markup and adjust the check — but the License modal MUST visibly open. Fix any error before claiming done.

Repo-root `project.json` already exists — do not touch it.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/13-port-gallery`

(Deliverable write boundary: `src/gallery/**` only — `source/` + the regenerated `index.html`. Everything else — tools, `src/lib/**` (incl. `jbc-include-old`), `scripts/**`, `project.json`, `00-epic-plan/**` — is READ-ONLY. If a shared change seems necessary, STOP and surface it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off decisions + recipe (§3d) + R6 smoke-check lesson.
   - `dev/20261002-lib-cleanup/07-port-inflation-calculator/findings/HANDOFF.md` — a footer + CtLicense wiring example.
   - `src/lib/components/` — `footer.html`, `CtLicense.mjs` (`openLicense`; check its modal markup/testid), `styles/gallery.css`.
   - `src/gallery/source/` — `index.template.html` (flat includes ~lines 14, 80) + `styles.css`; built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/13-port-gallery/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/13-port-gallery/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `src/gallery` (source + regenerated `index.html`), plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** the smoke-check prints `btn: true` / `modalVisible: true` / `errors (0)`; `grep -nE "<<ct:include" src/gallery/source` → no matches; `node scripts/build-tool.mjs --dir="src/gallery"` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10. No commits. Write `findings/HANDOFF.md`: what changed, the CtLicense wiring added, the smoke-check output (incl. the modal-opens check), and the gate tallies. State PASS / what-remains plainly.