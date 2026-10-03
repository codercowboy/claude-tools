<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/10-port-color-picker" role="verifier" -->

You are a VERIFIER subagent — 10-port-color-picker, round r1.

Independently verify the delivered `color-picker` port against `plan.md`'s Definition of Done and render a PASS/FAIL VERDICT with on-disk, reproducible evidence. **HARD RULE: independence is verdict-not-repair — you render a verdict, you NEVER repair, re-port, or re-run-to-green what you check. You exercise the artifact (grep, rebuild, run `--check`, run `node --test`, run the e2e, open the built HTML) but never edit the tool, the lib, or any test to make a check pass — a PASS you caused is worthless.**

Working folder (write ONLY inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/10-port-color-picker`

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the signed-off decisions + recipe + R6 collision/smoke-check lessons. Confirm: CtUtil was NOT inlined (color-picker keeps its local `clamp`); footer License via CtLicense; NO test changed (no license-wiring test → zero deltas; a changed test is a FAIL signal).
   - `src/tools/color-picker/**` — the ported tool (read-only; exercise, never edit).

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/10-port-color-picker/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/10-port-color-picker/tmp/verifier1-env.md"
```

Model: sonnet

Deliverable: a VERDICT file `findings/verifier-r1-v1-verdict.md` — PASS or FAIL, each DoD row checked with the exact command + output as evidence. Independently reproduce ALL of the following. **FIRST, the smoke-check** (decisive catch for init regressions): from the project root run and confirm `present: true` + ZERO errors —
```
node -e 'const pw=require(process.cwd()+"/src/tools/color-picker/node_modules/playwright");(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});await p.goto("file://"+process.cwd()+"/src/tools/color-picker/index.html",{waitUntil:"load"});await p.waitForTimeout(1500);console.log("present:",await p.evaluate(()=>!!window.__colorPicker));console.log("errors("+e.length+")",e.slice(0,6).join(" | "));await b.close();})();'
```
A non-zero error count or `present: false` is an automatic FAIL. Then: `grep -rnE "jbcUtil|ctCopy|ctFlash|ctConfirm|<<ct:include (confirm|copy)\.js>>" src/tools/color-picker/source` → no matches; confirm the template inlines ONLY CtConfirm + CtClipboardUtil + CtLicense (NOT CtUtil/CtByteUtil) and the tool-local `clamp` is still present in `source/app.mjs`; `node scripts/build-tool.mjs --dir="src/tools/color-picker"` rebuilds and `node scripts/build-all.mjs --check` → 10/10; unit green (from the tool dir: `cd "src/tools/color-picker" && node --test tests/unit/*.test.mjs`); color-picker Playwright e2e green **serial** (from tool dir: `npx playwright test --config=tests/playwright.config.mjs`, `workers:1`). Run tests DIRECTLY (not `npm test`). Open the built `index.html`: footer License wired (`[data-ct-license]` + `CtLicense`/`openLicense`), no unsubstituted project-identity tokens. Confirm NO test file changed this round (a changed test is a FAIL signal; check mtimes). Confirm the diff scope via mtimes/filesystem (git blocked): only `src/tools/color-picker/**` changed — NO other tool, `src/lib/**`, `scripts/**`, or `project.json` edits. On any failure: FAIL with specific evidence — do NOT fix it. Then APPEND a `## Verifier round (r1)` section to `findings/HANDOFF.md` — do NOT overwrite the builder's section.
