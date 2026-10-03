# Plan — 10-port-color-picker

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 7. Port `color-picker` onto the ct lib. SMALL module set: confirm.js + copy.js +
footer only — it uses NEITHER util.js NOR crc32.js. So inline CtConfirm + CtClipboardUtil + CtLicense and
NOTHING else; in particular do NOT inline CtUtil (color-picker has its own `clamp` that would collide with
CtUtil's `clamp` export — the R6 lesson). Apply the hardened recipe (epic `decisions.md §3d` + the R6
collision/smoke-check entry). Do NOT touch any other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include confirm.js/copy.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module …>>` for CtConfirm, CtClipboardUtil, CtLicense ONLY (NOT CtUtil/CtByteUtil) |
| named imports replace globals; local clamp kept | `source/app.mjs` | `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`. The tool-local `function clamp` (line ~149) REMAINS (safe — CtUtil not inlined). `grep -rnE 'jbcUtil\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| App initializes (no collision/init regression) | built `index.html` | SMOKE-CHECK: headless load → `window.__colorPicker` present AND zero pageerror/console.error |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License opens modal; no unsubstituted project-identity tokens |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/color-picker"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | unit green (from tool dir); serial e2e (`workers:1`) green. NO license-wiring test → expect ZERO test deltas; any red test is STOP-and-surface |

## Task / method
Per the builder's charter + the hardened recipe. Inline ONLY the three modules color-picker uses. KEEP the
local `clamp`. Run the FULL collision scan anyway (confirm nothing else collides with the three inlined
modules' exports). Run the MANDATORY smoke-check (assert `window.__colorPicker` + 0 errors) BEFORE the full
e2e. styles.css may have a `ctConfirm` comment — reword if the grep gate flags it.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/color-picker"` (use `--dir=`);
`build-all --check` (10/10 gate). Run tests DIRECTLY from the tool dir (`cd src/tools/color-picker && node
--test tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`) — the `pretest:*`
hooks run `build --check`; the repo root has no `tests/` dir.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/10-port-color-picker/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ signed-off decisions + recipe (§3d) + the R6 collision/smoke-check lessons.
- `dev/20261002-lib-cleanup/08-port-color-converter/findings/HANDOFF.md` — closest worked example (CtConfirm+CtClipboardUtil).
- `src/lib/components/` — `confirmDialog` (CtConfirm), `copy`/`flash` (CtClipboardUtil), `openLicense` (CtLicense); footer + styles.
- `src/tools/color-picker/` — the port target (`source/`, `tests/` incl. the `window.__colorPicker` e2e API, built `index.html`).

## Deliverables
- The ported, green `color-picker` (source + regenerated `index.html`). No commits.
- `findings/HANDOFF.md` — what changed, confirmation CtUtil was NOT inlined (local clamp kept), the smoke-check output, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/color-picker/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test is STOP-and-surface (no pre-approved delta expected this round).

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; smoke-check clean; tool green (unit + serial e2e) and `build-all --check`
10/10. Report 3–5 lines: ported ✓, CtUtil-not-inlined confirmation, smoke result, gate results. State PASS/what-remains.
