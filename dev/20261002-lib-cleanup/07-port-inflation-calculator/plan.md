# Plan — 07-port-inflation-calculator

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 4. Port `inflation-calculator` onto the ct lib. This is the SIMPLEST port so
far: the tool only consumes `copy.js` + the footer from the shared lib (no crc32, no util/debounce, no
confirm). Apply the proven recipe (epic `decisions.md §3d`). Do NOT touch any other tool or `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include copy.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module components/CtClipboardUtil.mjs>>` + `<<ct:module components/CtLicense.mjs>>`. The `<<ct:inline cpi-data.json>>` + `<<ct:inline app.mjs>>` stay as-is |
| named imports replace globals | `source/app.mjs` | `ctCopy`→`copy`, `ctFlash`→`flash`. `grep -rnE 'jbcUtil\|ctCopy\|ctFlash'` over `source/` → nothing |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License button opens modal; no unsubstituted project-identity tokens |
| License e2e updated to new wiring | `tests/*e2e*.mjs` (line ~412-413) | the `window.ctLicense()` programmatic-open test → click the footer `[data-ct-license]` button instead (window.ctLicense no longer exists). SAME assertion intent (modal opens). PRE-APPROVED license delta |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/inflation-calculator"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | `node --test tests/unit/*.test.mjs` green; serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green |

## Task / method
Per the builder's charter + the recipe in `00-epic-plan/decisions.md §3d`. Tool specifics: only copy.js +
footer come from the lib. The e2e's `window.ctLicense()` call (the old global, now gone) must change to
the supported mechanism — click the footer `[data-ct-license]` link — keeping the same "modal opens"
assertion (see how qr-generator / uuid handled their license e2e). No crc32/CtByteUtil here, so no
whole-module-inline collision risk; still sanity-check that nothing tool-local collides with
CtClipboardUtil's `copy`/`flash` exports.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/inflation-calculator"` (use `--dir=`);
`build-all --check` (10/10 gate). Run tests DIRECTLY (`node --test tests/unit/*.test.mjs` +
`npx playwright test --config=tests/playwright.config.mjs`) — the `pretest:*` hooks run `build --check`.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/07-port-inflation-calculator/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ signed-off decisions + the proven recipe (§3d).
- `dev/20261002-lib-cleanup/04-port-uuid-generator/findings/HANDOFF.md` — worked example incl. the license e2e delta.
- `src/lib/components/CtClipboardUtil.mjs` (`copy`/`flash`) + `CtLicense.mjs` (`openLicense`) + `footer.html` + `styles/`.
- `src/tools/inflation-calculator/` — the port target (`source/` template + `app.mjs` + `cpi-data.json`, `tests/` incl. the `window.ctLicense()` e2e at ~line 412).

## Deliverables
- The ported, green `inflation-calculator` (source + regenerated `index.html` + the updated license e2e). No commits.
- `findings/HANDOFF.md` — what changed, the license-e2e delta, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/inflation-calculator/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test that is NOT the pre-approved license-wiring delta is STOP-and-surface.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; tool green (unit + serial e2e) and `build-all --check` 10/10. Report 3–5
lines: ported ✓, license-e2e delta, gate results. State PASS/what-remains.
