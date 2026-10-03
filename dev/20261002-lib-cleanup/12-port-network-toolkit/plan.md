# Plan — 12-port-network-toolkit

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 9 — the FINAL tool. Port `network-toolkit` onto the ct lib. Same shape as
cron-builder: copy.js + footer only (CtClipboardUtil + CtLicense). Hardened recipe (epic `decisions.md §3d`
+ R6 lessons). Do NOT touch any other tool or the shared `src/lib/`. After this, Phase 3f retires
`jbc-include-old`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include copy.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module …>>` for CtClipboardUtil + CtLicense ONLY (NOT CtConfirm/CtUtil/CtByteUtil) |
| named imports replace globals | `source/app.mjs` | `ctCopy`→`copy`, `ctFlash`→`flash`. `grep -rnE 'jbcUtil\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| App initializes | built `index.html` | SMOKE-CHECK: headless load → `window.__networkToolkit` present AND zero pageerror/console.error |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License opens modal; no unsubstituted project-identity tokens |
| License e2e updated to new wiring | `tests/*e2e*.mjs` (line ~475) | the `window.ctLicense() opens the modal programmatically` test → click the footer `[data-ct-license]` link instead (window.ctLicense is gone). SAME intent (modal opens + MIT text). PRE-APPROVED license delta |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/network-toolkit"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | unit green (from tool dir); serial e2e (`workers:1`) green |

## Task / method
Per the builder's charter + the hardened recipe; cron-builder + inflation-calculator are the closest
examples. Inline ONLY CtClipboardUtil + CtLicense. Update the programmatic-open license test to click the
footer button (pre-approved, same intent — mirror inflation-calculator's delta). Run the FULL collision
scan (few names; unlikely). Run the MANDATORY smoke-check (`window.__networkToolkit` + 0 errors) BEFORE the
full e2e.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/network-toolkit"` (use `--dir=`);
`build-all --check` (10/10). Tests DIRECTLY from the tool dir (`cd src/tools/network-toolkit && node --test
tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`).

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/12-port-network-toolkit/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ recipe (§3d) + R6 collision/smoke-check lessons.
- `dev/20261002-lib-cleanup/11-port-cron-builder/findings/HANDOFF.md` + `07-port-inflation-calculator/findings/HANDOFF.md` — identical-shape examples (the 2nd shows the programmatic-open→footer-click delta).
- `src/lib/components/` — `copy`/`flash` (CtClipboardUtil), `openLicense` (CtLicense); footer + styles.
- `src/tools/network-toolkit/` — the port target (`source/`, `tests/` incl. `window.__networkToolkit` API + the `window.ctLicense()` test at ~475, built `index.html`).

## Deliverables
- The ported, green `network-toolkit` (source + regenerated `index.html` + the updated license e2e). No commits.
- `findings/HANDOFF.md` — what changed, the license-e2e delta, smoke output, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/network-toolkit/`. No other tool, `src/lib/`, `scripts/`, `project.json`, `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test that is NOT the pre-approved license-wiring delta is STOP-and-surface.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; smoke clean; tool green (unit + serial e2e) and `build-all --check` 10/10.
Report 3–5 lines: ported ✓, license-e2e delta, smoke result, gate results. State PASS/what-remains.
