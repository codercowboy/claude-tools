# Plan — 08-port-color-converter

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 5. Port `color-converter` onto the ct lib. Mirrors the uuid-generator port
(CtConfirm + CtClipboardUtil + CtUtil + footer CtLicense; no crc32). Apply the proven recipe (epic
`decisions.md §3d`). Do NOT touch any other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include confirm.js/copy.js/util.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module …>>` for CtConfirm, CtClipboardUtil, CtUtil, CtLicense |
| named imports replace globals | `source/app.mjs` | `ctConfirm`→`confirmDialog`, `ctCopy`→`copy`, `ctFlash`→`flash`, `jbcUtil.debounce`→`debounce` (alias deleted). `grep -rnE 'jbcUtil\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License button opens modal; no unsubstituted project-identity tokens |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/color-converter"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | `node --test tests/unit/*.test.mjs` green; serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green. NO license-wiring test present → expect ZERO test deltas; any red test is STOP-and-surface |

## Task / method
Per the builder's charter + the recipe in `00-epic-plan/decisions.md §3d`. Tool specifics: CtConfirm +
CtClipboardUtil + CtUtil, plus CtLicense for the footer button. Delete the `const debounce =
jbcUtil.debounce` alias after the rename (TDZ). `styles.css:18` mentions `ctConfirm` — inspect it; it's
likely a comment or a `.ctc-*` class reference (CtConfirm self-injects its own `.ctc-*` styles,
unchanged), so probably needs no change — confirm. No crc32/CtByteUtil here → no whole-module-inline
collision risk, but still sanity-check tool-local names vs CtUtil's exports.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/color-converter"` (use `--dir=`);
`build-all --check` (10/10 gate). Run tests DIRECTLY (`node --test tests/unit/*.test.mjs` +
`npx playwright test --config=tests/playwright.config.mjs`) — the `pretest:*` hooks run `build --check`.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/08-port-color-converter/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ signed-off decisions + proven recipe (§3d).
- `dev/20261002-lib-cleanup/04-port-uuid-generator/findings/HANDOFF.md` — the closest worked example (same module set).
- `src/lib/components/` + `src/lib/utils/` — `confirmDialog` (CtConfirm), `copy`/`flash` (CtClipboardUtil), `debounce` (CtUtil), `openLicense` (CtLicense); footer + styles.
- `src/tools/color-converter/` — the port target (`source/`, `tests/`, built `index.html`).

## Deliverables
- The ported, green `color-converter` (source + regenerated `index.html`). No commits.
- `findings/HANDOFF.md` — what changed, the styles.css:18 ctConfirm resolution, any collision renames, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/color-converter/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test is STOP-and-surface (no pre-approved delta expected this round).

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; tool green (unit + serial e2e) and `build-all --check` 10/10. Report 3–5
lines: ported ✓, any surprise, gate results. State PASS/what-remains.
