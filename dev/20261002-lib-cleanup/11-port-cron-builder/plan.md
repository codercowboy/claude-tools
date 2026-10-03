# Plan — 11-port-cron-builder

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 8. Port `cron-builder` onto the ct lib. SMALL set: copy.js + footer only (like
inflation-calculator, plus a license-wiring e2e delta). It does NOT use confirm/util/crc32, so inline
CtClipboardUtil + CtLicense only. Hardened recipe (epic `decisions.md §3d` + R6 lessons). Do NOT touch any
other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Tool consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include copy.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; `<<ct:module …>>` for CtClipboardUtil + CtLicense ONLY (NOT CtConfirm/CtUtil/CtByteUtil) |
| named imports replace globals | `source/app.mjs` | `ctCopy`→`copy`, `ctFlash`→`flash`. Template:29 `ctConfirm` COMMENT reworded (unused `--ctc-accent` var may stay). Function-scoped `const el` (app.mjs:523) kept (safe — CtUtil not inlined). `grep -rnE 'jbcUtil\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| App initializes | built `index.html` | SMOKE-CHECK: headless load → `window.__cronBuilder` present AND zero pageerror/console.error |
| Footer License kept & wired | template + built html | `CtLicense` inlined; footer License opens modal; no unsubstituted project-identity tokens |
| License e2e updated to new wiring | `tests/*e2e*.mjs` (line ~512) | the `typeof window.ctLicense === 'function'` assertion → the new wiring (footer `[data-ct-license]` present / modal opens — the surrounding test already asserts the modal). SAME intent. PRE-APPROVED license delta |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/cron-builder"`; `build-all --check` → 10/10 |
| Behavior preserved | tests | unit green (from tool dir); serial e2e (`workers:1`) green |

## Task / method
Per the builder's charter + the hardened recipe. Inline ONLY CtClipboardUtil + CtLicense. Reword the
template:29 `ctConfirm` comment so the grep gate passes. Update the e2e's old `window.ctLicense` assertion
to the new wiring (pre-approved). Run the FULL collision scan (CtClipboardUtil/CtLicense export few names;
unlikely to collide — verify). Run the MANDATORY smoke-check (`window.__cronBuilder` + 0 errors) BEFORE the
full e2e.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/cron-builder"` (use `--dir=`);
`build-all --check` (10/10). Tests DIRECTLY from the tool dir (`cd src/tools/cron-builder && node --test
tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`).

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/11-port-cron-builder/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ recipe (§3d) + R6 collision/smoke-check lessons.
- `dev/20261002-lib-cleanup/07-port-inflation-calculator/findings/HANDOFF.md` — closest example (copy+footer+license delta).
- `src/lib/components/` — `copy`/`flash` (CtClipboardUtil), `openLicense` (CtLicense); footer + styles.
- `src/tools/cron-builder/` — the port target (`source/`, `tests/` incl. the `window.__cronBuilder` API + the `window.ctLicense` e2e at ~512, built `index.html`).

## Deliverables
- The ported, green `cron-builder` (source + regenerated `index.html` + the updated license e2e). No commits.
- `findings/HANDOFF.md` — what changed, the license-e2e delta, the ctConfirm-comment reword, smoke output, gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/cron-builder/`. No other tool, `src/lib/`, `scripts/`, `project.json`, `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test that is NOT the pre-approved license-wiring delta is STOP-and-surface.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; smoke clean; tool green (unit + serial e2e) and `build-all --check` 10/10.
Report 3–5 lines: ported ✓, license-e2e delta, smoke result, gate results. State PASS/what-remains.
