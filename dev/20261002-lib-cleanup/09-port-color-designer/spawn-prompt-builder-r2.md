<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/09-port-color-designer" role="builder" -->

You are a BUILDER subagent — 09-port-color-designer, round r2 (FIX round).

Round r1 completed the port on disk but shipped a RUNTIME regression. The orchestrator diagnosed it by headlessly loading the built `index.html`: the module throws at evaluation with:

```
[pageerror] Identifier 'prefersReducedMotion' has already been declared
```

**Root cause:** `src/lib/utils/CtUtil.mjs` EXPORTS `prefersReducedMotion`; color-designer's `source/app.mjs` ALSO declares a local `prefersReducedMotion`. Inlining `<<ct:module utils/CtUtil.mjs>>` hoisted CtUtil's export as a top-level const, so the tool's module now has TWO `prefersReducedMotion` declarations → SyntaxError at evaluation → the whole app never initializes → `window.__colorDesigner` never attaches → all ~38 e2e tests time out in `beforeEach`. (The static HTML still renders, so the UI *looks* fine — it is NOT.)

**Your job — fix it properly and prove it:**
1. In `source/app.mjs`, resolve the `prefersReducedMotion` duplicate: if the tool-local one is semantically identical to CtUtil's export, DELETE the local and use the inlined one; if it differs, RENAME the tool-local one (keep its exact behavior). Pick whichever is correct — verify the semantics match before deleting.
2. **Do a COMPLETE collision scan** (r1 missed this one): for EACH inlined module (CtByteUtil, CtUtil, CtClipboardUtil, CtConfirm, CtLicense), take its exported identifiers and grep ALL of `source/app.mjs` (any indentation, not just column 0) for a local declaration of the same name. The CtUtil + CtByteUtil export list includes: `clamp num clampInt escapeHtml escapeAttr el slugify persistState onceFlag posAt prefersReducedMotion restartAnimation setupHiDPICanvas wrapText downloadBlob debounce formatBytes crc32 crc32Hex base64UrlToBytes bytesToBase64 bytesToHex textToBytes utf8ToBase64 getRandomBytes makeId md5 sha1 sha256 sha512 hmac`. Rename/dedupe EVERY collision, not just prefersReducedMotion.
3. Rebuild: `node scripts/build-tool.mjs --dir="src/tools/color-designer"`.
4. **MANDATORY smoke-check BEFORE the full e2e** (catches init regressions in seconds). Run this and confirm it prints `present: true` / `rollResult: true` / `errors (0)`:
```
node -e '
const pw=require("src/tools/color-designer/node_modules/playwright");
(async()=>{const b=await pw.chromium.launch();const p=await b.newPage();const e=[];
p.on("pageerror",x=>e.push("[pageerror] "+(x.stack||x.message)));
p.on("console",m=>{if(m.type()==="error")e.push("[console.error] "+m.text());});
await p.goto("file://"+process.cwd()+"/src/tools/color-designer/index.html",{waitUntil:"load"});
await p.waitForTimeout(1500);
console.log("present:",await p.evaluate(()=>!!window.__colorDesigner));
console.log("rollResult:",await p.evaluate(()=>!!(window.__colorDesigner&&window.__colorDesigner.state&&window.__colorDesigner.state.rollResult)));
console.log("errors ("+e.length+")\n"+e.slice(0,8).join("\n"));
await b.close();})();'
```
   Run it from the project root. If it reports any pageerror or `present: false`, you have another collision/init bug — fix it and re-smoke BEFORE running the e2e.
5. Only once the smoke-check is clean, run the gates (below). The e2e should now be FAST (no beforeEach timeouts).

Repo-root `project.json` already exists — do not touch it. Do NOT touch `src/lib/**` — the collision is fixed on the TOOL side (rename the local), not by changing the lib.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/09-port-color-designer`

(Deliverable write boundary: `src/tools/color-designer/**` only. Other tools, `src/lib/**`, `scripts/**`, `project.json`, `00-epic-plan/**` are READ-ONLY.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off decisions + recipe (§3d) + the "Phase 3e R6 collision + smoke-check" entry (this exact failure).
   - `findings/HANDOFF.md` — the r1 handoff (what r1 changed). Build on it; do not redo the whole port.
   - `src/lib/utils/CtUtil.mjs` — confirm the `prefersReducedMotion` export semantics to decide delete-vs-rename.
   - `src/tools/color-designer/` — the port target (already mostly ported by r1; `source/app.mjs`, built `index.html`, `tests/`).

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/09-port-color-designer/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/09-port-color-designer/tmp/worker-env-r2.md"
```

Model: sonnet

Deliverable: the FIXED, green `color-designer` (source + regenerated `index.html`), plus an updated `findings/HANDOFF.md` (append an r2 section; keep r1's). **Gates — ALL must hold before you claim done:** the smoke-check above prints `present: true` / `rollResult: true` / `errors (0)`; `grep -rnE "jbcUtil|jbcCrc32|ctCopy|ctFlash|ctConfirm" src/tools/color-designer/source` → no matches; `node scripts/build-all.mjs --check` → 10/10; `node --test tests/unit/*.test.mjs` green; color-designer Playwright e2e green **serial** (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) — the full suite now passes (no beforeEach timeouts), including the `does not reference crypto.randomUUID` convention test. Run tests DIRECTLY (not `npm test`). A red test that is NOT a pre-approved license-wiring delta is STOP-and-surface. No commits. In `findings/HANDOFF.md` r2 section: the prefersReducedMotion resolution (deleted vs renamed + why), any OTHER collisions the full scan found, the smoke-check output, and all gate tallies. State PASS / what-remains plainly.