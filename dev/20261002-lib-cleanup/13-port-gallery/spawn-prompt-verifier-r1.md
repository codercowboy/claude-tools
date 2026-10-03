<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/13-port-gallery" role="verifier" -->

You are a VERIFIER subagent — 13-port-gallery, round r1 (Phase 3f, Round A).

Independently verify the delivered `src/gallery` port against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, re-port, or re-run-to-green what you check. You exercise the artifact (grep, rebuild, run `--check`, headless-load the built page) but never edit the gallery, the lib, or any file to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/13-port-gallery`

Read, in order:
1. `charter-verifier.md` (in your working folder) — your posture / definition of done.
2. `plan.md` (in your working folder) — the task, the Definition of Done, constraints.
3. The curated reading list below — the step-zero methodology chain FIRST, then the task files.

   **Methodology chain (base — fetch each with `npx tpm doc <path>`; canonical paths in `npx tpm doc claude-context/methodology/subagent/reading-list.md`):**
   - `project-workspace.md` — read/write boundaries + the `dev/<task>/` layout
   - `shared-conventions.md` — findings-doc format, terse comms, resumption protocol
   - `handbook.md` — how you operate as a subagent; the step-zero env ritual
   - `tool-conventions.md` — copy-then-modify, the no-hardcoded-paths directive
   - `troubleshooting.md` — what to try before declaring a dead end
   - `verification.md` — the **HARD RULE** (independence = verdict, never repair), on-disk evidence, PASS/FAIL-with-evidence format

   **Task reading list:**
   - `findings/HANDOFF.md` (the builder's handoff — what it claims; verify, don't trust).
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the signed-off decisions + recipe + R6 smoke-check lesson.
   - `src/gallery/**` — the ported page (read-only; exercise, never edit).
   - `src/lib/components/CtLicense.mjs` — to confirm the License modal markup/testid for your smoke-check.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/13-port-gallery/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/13-port-gallery/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce ALL of the following. **FIRST, the smoke-check** (the behavior gate — the gallery has no test harness): from the project root run and confirm `btn: true` / `modalVisible: true` / `errors (0)` —
```
node -e 'const pw=require(process.cwd()+"/src/tools/base64-tool/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/gallery/index.html",{waitUntil:"load"});await p.waitForTimeout(800);const btn=await p.evaluate(()=>!!document.querySelector("[data-ct-license]"));await p.click("[data-ct-license]").catch(()=>{});await p.waitForTimeout(400);const modal=await p.evaluate(()=>{const m=document.querySelector("[data-testid=\"license-modal\"]")||document.querySelector("[role=\"dialog\"]");return !!(m && (m.offsetParent!==null || getComputedStyle(m).display!=="none"));});console.log("btn:",btn,"modalVisible:",modal,"errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
A non-zero error count, `btn: false`, or `modalVisible: false` is an automatic FAIL (adjust the modal selector per `CtLicense.mjs` markup if needed — but the modal MUST visibly open). Then: `grep -nE "<<ct:include" src/gallery/source` → no matches; confirm the template uses `<<ct:lib components/styles/gallery.css>>` + `<<ct:lib components/footer.html>>` + a `<<ct:module components/CtLicense.mjs>>` script; `node scripts/build-tool.mjs --dir="src/gallery"` rebuilds and `node scripts/build-all.mjs --check` → 10/10; open the built `index.html` and confirm `[data-ct-license]` + `CtLicense`/`openLicense` present and no unsubstituted project-identity tokens. Confirm the diff scope via mtimes/filesystem (git blocked): only `src/gallery/**` changed — NO tool, `src/lib/**` (incl. jbc-include-old), `scripts/**`, or `project.json` edits. On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section.
