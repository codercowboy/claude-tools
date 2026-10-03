# Plan — 09-port-color-designer

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 6. Port `color-designer` onto the ct lib. Like qr-generator (crc32 via
CtByteUtil) plus confirm.js — the fullest module set so far: CtByteUtil + CtUtil + CtClipboardUtil +
CtConfirm + CtLicense. The `does not reference crypto.randomUUID` convention test (which qr-generator hit)
should PASS here because the Phase-3e lib-comment reword already removed the literal from CtByteUtil.
Apply the proven recipe (epic `decisions.md §3d`). Do NOT touch any other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include confirm.js/copy.js/crc32.js/util.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module …>>` for CtByteUtil, CtUtil, CtClipboardUtil, CtConfirm, CtLicense |
| named imports replace globals | `source/app.mjs` | `const crc32 = jbcCrc32` alias DELETED (crc32 now the inlined-module const); `jbcUtil.debounce`→`debounce`; `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog`. `grep -rnE 'jbcUtil\|jbcCrc32\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License button opens modal; no unsubstituted project-identity tokens |
| crypto.randomUUID convention test passes | built `index.html` + e2e | `grep -nE 'crypto\.randomUUID' src/tools/color-designer/index.html` → no matches; the convention test is green (lib comment already reworded) |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/color-designer"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | `node --test tests/unit/*.test.mjs` green; serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green. NO license-wiring test present → expect ZERO test deltas; any red test is STOP-and-surface |

## Task / method
Per the builder's charter + the recipe in `00-epic-plan/decisions.md §3d`; qr-generator is the closest
worked example (CtByteUtil inline for crc32). Delete the `const crc32 = jbcCrc32` alias (TDZ/collision)
and the `const debounce = jbcUtil.debounce` alias. `styles.css:17` has a `ctConfirm` comment — reword it
(the grep gate scans `source/`). Accept inlining the whole CtByteUtil (~585 lines) for crc32; note size.
Collision check: grep color-designer's top-level declarations against CtByteUtil + CtUtil exports before
inlining (recon found none). The crypto.randomUUID convention test should pass as-is now.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/color-designer"` (use `--dir=`);
`build-all --check` (10/10 gate). Run tests DIRECTLY (`node --test tests/unit/*.test.mjs` +
`npx playwright test --config=tests/playwright.config.mjs`) — the `pretest:*` hooks run `build --check`.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/09-port-color-designer/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ signed-off decisions + proven recipe (§3d) + carry-forwards (incl. the crypto.randomUUID lib fix that pre-empts this tool's convention test).
- `dev/20261002-lib-cleanup/06-port-qr-generator/findings/HANDOFF.md` — the closest worked example (CtByteUtil inline for crc32).
- `src/lib/components/` + `src/lib/utils/` — `crc32` (CtByteUtil), `debounce` (CtUtil), `copy`/`flash` (CtClipboardUtil), `confirmDialog` (CtConfirm), `openLicense` (CtLicense); footer + styles.
- `src/tools/color-designer/` — the port target (`source/`, `tests/`, built `index.html`).

## Deliverables
- The ported, green `color-designer` (source + regenerated `index.html`). No commits.
- `findings/HANDOFF.md` — what changed, the styles.css:17 ctConfirm resolution, CtByteUtil-inline size note, any collision renames, confirmation the crypto.randomUUID test passed, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/color-designer/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test is STOP-and-surface (no pre-approved delta expected this round).

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; tool green (unit + serial e2e, incl. the crypto.randomUUID convention test)
and `build-all --check` 10/10. Report 3–5 lines: ported ✓, any surprise, gate results. State PASS/what-remains.
