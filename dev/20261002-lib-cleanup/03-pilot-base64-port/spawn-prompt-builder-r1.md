<!-- tpm-workflow-spawn phase="dev/20261002-lib-cleanup/03-pilot-base64-port" role="builder" -->

You are a BUILDER subagent — 03-pilot-base64-port, round r1.

Port exactly ONE tool — `base64-tool` — off the legacy flat-include lib (`src/lib/jbc-include-old/`, consumed via `<<ct:include …>>` globals) and onto the new ESM `ct` lib (`src/lib/{utils,components}/`, consumed via the Phase-3a `<<ct:module …>>` / `<<ct:lib …>>` tokens). This is the PILOT that proves the port recipe before the 8-tool fan-out — so the recipe you land matters as much as the green gate. Do NOT touch any other tool or the shared `src/lib/`.

**Known port shape (front-loaded; the full spec + DoD is in `plan.md`):**
1. In `source/index.template.html`: replace `<<ct:include copy.js>>` / `<<ct:include util.js>>` with `<<ct:module components/CtClipboardUtil.mjs>>` / `<<ct:module utils/CtByteUtil.mjs>>` (+ `<<ct:module utils/CtUtil.mjs>>` if `downloadBlob`/`debounce` are used); point CSS at the new lib via `<<ct:lib components/styles/base.css>>` / `controls.css`; resolve the footer from `src/lib/components/footer.html`.
2. In `source/app.mjs` (+ `logic.mjs`): rewrite call sites to named exports — `jbcUtil.formatBytes`→`formatBytes`, `jbcUtil.downloadBlob`→`downloadBlob`, `ctCopy`→`copy`, `ctFlash`→`flash`.
3. Add `<<ct:module components/CtLicense.mjs>>` so the footer License button works (the old footer auto-inlined `license.js`; the new one does NOT — this tool must inline `CtLicense.mjs` itself; it self-wires the `[data-ct-license]` trigger → `openLicense` on evaluation).
4. `formatBytes` ships the NEW format (accept-new, per `00-epic-plan/decisions.md`) — do NOT pass old-parity options.

**⚠️ Pilot discovery to resolve AND report:** does `<<ct:lib components/footer.html>>` apply the project-identity mustache substitution the footer needs (the `project.name` / `project.repo` / `project.repoLabel` / `project.tagline` tokens), or is a different token/path required? `<<ct:lib>>` is verbatim (per the 3a contract). If verbatim leaves those project-identity tokens unsubstituted, that is a real finding — surface it in `findings/HANDOFF.md` and do NOT ship a footer with unsubstituted tokens. Resolving this cleanly is a core pilot deliverable for 3e to replicate.

Working folder (write ONLY findings/scratch inside here; paths may contain spaces, quote them):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261002-lib-cleanup/03-pilot-base64-port`

(Your deliverable write boundary is `src/tools/base64-tool/**` — source + tests + its regenerated `index.html`, outside your phase folder by design. Everything else — other tools, `src/lib/**`, `scripts/**`, `00-epic-plan/**` — is READ-ONLY. If a shared-lib change seems necessary, STOP and surface it; do not make it.)

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
   - `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions (formatBytes accept-new; keep footer License via a per-tool `CtLicense` import; license-wiring test deltas PRE-APPROVED).
   - `dev/20261002-lib-cleanup/includes-diff.md` — old→new mapping (§1 table, §2c license wiring, §2d formatBytes). STALE on mechanics (written pre-3a/3b: the inliner now exists and the lib is `ct`-named) — trust its behavior notes, not its "no inliner / jbc-named" framing.
   - `dev/20261002-lib-cleanup/01-esm-inliner/findings/HANDOFF.md` — the `<<ct:module>>` / `<<ct:lib>>` token contract you build against; note its carry-forward that `slice-tool.mjs` is not yet exercised on a `ct:module` template.
   - `src/lib/components/` + `src/lib/utils/` — the new lib. Exports: `copy`/`flash` (`components/CtClipboardUtil.mjs`), `formatBytes` (`utils/CtByteUtil.mjs`), `downloadBlob`/`debounce` (`utils/CtUtil.mjs`), `openLicense` (`components/CtLicense.mjs`); footer at `components/footer.html`, CSS at `components/styles/`.
   - `src/tools/base64-tool/` — the port target: current `source/` (template + `app.mjs` + `logic.mjs` + `styles.css`), `tests/` (unit + e2e; the e2e references the License), and the built `index.html`.

Step zero (before any doc reads) — from the PROJECT ROOT, source your env in ONE bash call:
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && \
  set -a && source "dev/20261002-lib-cleanup/03-pilot-base64-port/tmp/subagent.env" && set +a && \
  env | sort > "dev/20261002-lib-cleanup/03-pilot-base64-port/tmp/worker-env.md"
```

Model: sonnet

Deliverable: the ported, green `base64-tool` (source + regenerated `index.html` + any updated tests) in the working tree, plus `findings/HANDOFF.md`. **Gates — ALL must hold before you claim done:** `grep -rnE "jbcUtil|ctCopy|ctFlash" src/tools/base64-tool/source` → no matches; `node scripts/build-tool.mjs src/tools/base64-tool` rebuilds cleanly; `node scripts/build-all.mjs --check` → 10/10 (base64 via ct modules, other 8 byte-identical); `node --test` unit green; base64-tool Playwright e2e green **serial** (`workers:1` — do NOT change it). A red test that is NOT a pre-approved license-wiring delta is STOP-and-surface, never a silent rewrite. No commits (changes land in the tree; the user commits). Write `findings/HANDOFF.md`: the exact recipe that worked (for 3e to replicate), the footer-token resolution, any test deltas applied + why pre-approved, and both gate tallies (build --check + unit/e2e counts). State PASS / what-remains plainly.
