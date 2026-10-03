# Plan — 03-pilot-base64-port

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3d of the lib-cleanup epic: the PILOT. Port exactly ONE tool — `base64-tool` — off the legacy
flat-include lib (`src/lib/jbc-include-old/`, consumed via `<<ct:include …>>` globals) and onto the new
ESM `ct` lib (`src/lib/{utils,components}/`, consumed via the `<<ct:module …>>` / `<<ct:lib …>>` tokens
the Phase-3a build inliner added). This proves the full port recipe end-to-end on one small target
BEFORE the 8-tool fan-out (3e). If the 3a inliner design or the recipe is wrong, we learn it here, on
one tool, not across nine. Do NOT touch any other tool or the shared lib.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| base64-tool's template consumes the new ct lib, not the old flat includes | `src/tools/base64-tool/source/index.template.html` | No `<<ct:include copy.js>>` / `<<ct:include util.js>>` remain; module bodies come in via `<<ct:module components/CtClipboardUtil.mjs>>`, `<<ct:module utils/CtByteUtil.mjs>>` (+ `utils/CtUtil.mjs` if `downloadBlob`/`debounce` are used); CSS + footer resolve from the new lib (`<<ct:lib components/styles/*.css>>`, footer from `src/lib/components/footer.html`) |
| App code uses named imports, not old globals | `src/tools/base64-tool/source/app.mjs` (+ `logic.mjs`) | `jbcUtil.*` → `downloadBlob`/`formatBytes`; `ctCopy`→`copy`; `ctFlash`→`flash`. `grep -nE 'jbcUtil|ctCopy|ctFlash'` over `source/` returns nothing |
| Footer License kept and wired | template + build output | `src/lib/components/CtLicense.mjs` is inlined (it self-wires the `[data-ct-license]` trigger on eval → `openLicense`); footer License button opens the MIT/third-party modal |
| `formatBytes` ships the NEW format (accept-new, per decisions.md) | `logic.mjs`/`app.mjs` + unit tests | Output is `"1.5 KB"`-style (1 decimal, space); NO old-parity options passed; existing unit expectations already match |
| Build regenerates deterministically | built `src/tools/base64-tool/index.html` (regenerated + committed to tree) | `node scripts/build-tool.mjs src/tools/base64-tool` rebuilds; `node scripts/build-all.mjs --check` → 10/10 (base64 now from ct modules, other 8 byte-identical on old includes) |
| Behavior preserved | base64-tool tests | `node --test` unit green; **serial** (`workers:1`) e2e green for base64-tool. Any license-wiring e2e assertion updated to the new import-based wiring (PRE-APPROVED test delta — not a stop-and-surface) |

## Task / method
Determined by the builder per its charter. Known shape (front-loaded, not prescriptive):
1. Swap the template include tokens: old flat `<<ct:include copy.js/util.js>>` → `<<ct:module …>>` for
   the JS modules; `<<ct:include base.css/controls.css>>` → `<<ct:lib components/styles/…>>`; footer →
   the new lib's `components/footer.html`.
2. Rewrite `app.mjs` call sites to the named exports (`copy`, `flash`, `downloadBlob`, `formatBytes`).
3. Add the `CtLicense` module so the footer License button works (the old footer auto-inlined
   `license.js`; the new footer does not — this tool must inline `CtLicense.mjs` itself).
4. Rebuild, run unit + serial e2e, iterate to green.

> **⚠️ Known open question to resolve + report (pilot discovery):** does `<<ct:lib components/footer.html>>`
> apply the `{{project.*}}` token substitution the footer needs, or is a different token/path required? The
> 3a inliner added `<<ct:module>>` (ESM transform) and `<<ct:lib>>` (verbatim). If verbatim `ct:lib` leaves
> `{{project.*}}` unsubstituted in the footer, that is a real finding — surface it (it may mean the footer
> keeps a plain `<<ct:include footer.html>>` against a repointed include dir, or needs a build tweak). Do
> NOT silently ship an unsubstituted footer. This is exactly the kind of gap the pilot exists to catch.

## Tools & MCP
Baseline: this is a local Node/ESM tool repo — use `node` directly, no MCP needed.
- `node scripts/build-tool.mjs src/tools/base64-tool` — build one tool.
- `node scripts/build-all.mjs --check` — stale/determinism gate across all tools (must stay 10/10).
- `node scripts/test-all.mjs` — full suite; or scope to base64-tool: `node --test` in its `tests/unit/`
  and its Playwright e2e (serial, `workers:1` — base config; do NOT change it).
- The 3a inliner lives in `scripts/build-tool.mjs`; its token contract is in `01-esm-inliner/findings/HANDOFF.md`.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/03-pilot-base64-port/` (write findings to `findings/`).
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions (formatBytes
  accept-new; keep footer License via per-tool `CtLicense` import; license test deltas pre-approved).
- `dev/20261002-lib-cleanup/includes-diff.md` — the old→new mapping table (§1, §2d formatBytes, §2c license
  wiring). NOTE: written pre-3a/3b, so its "no inliner / jbc-named" framing is STALE — the inliner exists
  (3a) and the lib is `ct`-named (3b). Trust its behavior notes, not its mechanics.
- `dev/20261002-lib-cleanup/01-esm-inliner/findings/HANDOFF.md` — the `<<ct:module>>` / `<<ct:lib>>` token
  contract you build against (3a). Note its carry-forward: `slice-tool.mjs` not yet exercised on a
  `ct:module` template — watch for it.
- `src/lib/components/` + `src/lib/utils/` — the new lib. Exports you need: `copy`/`flash`
  (`components/CtClipboardUtil.mjs`), `formatBytes` (`utils/CtByteUtil.mjs`), `downloadBlob`/`debounce`
  (`utils/CtUtil.mjs`), `openLicense` (`components/CtLicense.mjs`).
- `src/tools/base64-tool/` — the port target (its current `source/`, `tests/`, and built `index.html`).

## Deliverables
- The ported, green `base64-tool` (source + regenerated `index.html` + updated tests) in the working tree.
- `findings/HANDOFF.md` — the single rolling state doc: what was changed, the exact port recipe that
  worked (for 3e to replicate), the footer-token resolution, any test deltas applied, and gate results
  (build --check output, unit + e2e counts). TLDR + tool-feedback deliverables are config-gated; include a
  tool-feedback note if the 3a inliner needed any workaround.
- No commits (workers never commit — changes land in the tree; the user commits).

## Constraints
- **Scope boundary:** ONLY `src/tools/base64-tool/`. Do NOT modify any other tool, the shared `src/lib/`,
  `scripts/`, or `00-epic-plan/`. If a shared-lib change seems needed, STOP and surface it — do not make it.
- **No `rm`, no `git`** (blocked in this environment). Retire anything by MOVING to `tmp/safe-to-delete/`.
  (Nothing should need retiring in the pilot — `jbc-include-old` stays until 3f.)
- `jbc`→`ct` is SURGICAL: never touch `jbc-include` / `jbc-include-old` path references.
- Playwright stays **serial** (`workers:1`) — e2e flakiness is environmental (#1012); do not chase it or
  switch to parallel.
- Test-review gate: a red test that is NOT a pre-approved license-wiring delta is STOP-and-surface, never a
  silent rewrite.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; base64-tool green (unit + serial e2e) and `build-all --check` 10/10. Final
report = 3–5 lines: ported ✓, the recipe 3e will replicate, the footer-token resolution, any test deltas,
gate results. State PASS/what-remains plainly.
