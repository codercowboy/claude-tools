# Plan — 04-port-uuid-generator

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e of the lib-cleanup epic (fan-out, round 2 of the per-tool sequence; the pilot 3d proved the
recipe on base64-tool). Port exactly ONE tool — `uuid-generator` — off the legacy flat-include lib
(`<<ct:include …>>` globals) and onto the new ESM `ct` lib (`<<ct:module …>>` / `<<ct:lib …>>`). Apply
the pilot-proven recipe verbatim; this tool adds `CtConfirm` and a license-wiring e2e delta the pilot
didn't exercise. Do NOT touch any other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| uuid-generator consumes the ct lib, not old flat includes | `source/index.template.html` | No `<<ct:include copy.js/util.js/footer.html/base.css/controls.css>>` remain; CSS/footer via `<<ct:lib …>>`; JS via `<<ct:module …>>` for CtClipboardUtil, CtUtil, CtConfirm, CtLicense |
| app code uses named imports, not old globals | `source/app.mjs` | `ctCopy`→`copy`, `ctFlash`→`flash`, `ctConfirm`→`confirmDialog`, `jbcUtil.debounce`→`debounce` (alias deleted). `grep -rnE 'jbcUtil\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| Footer License kept & wired | template + built html | `CtLicense` inlined (self-wires `[data-ct-license]`→`openLicense`); footer License button opens modal; footer carries no unsubstituted project-identity tokens (repo-root `project.json` already exists) |
| License e2e updated to new wiring | `tests/*e2e*.mjs` | The old `window.ctLicense()` reference → the new wiring (the button/modal still asserted). PRE-APPROVED license-wiring delta (epic decisions.md) — allowed, and must keep the SAME assertion intent |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/uuid-generator"` rebuilds; `node scripts/build-all.mjs --check` → 10/10 |
| Behavior preserved | tests | `node --test tests/unit/*.test.mjs` green; serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green |

## Task / method
Per the builder's charter + the pilot recipe in `00-epic-plan/decisions.md §3d`. Known tool specifics
(front-loaded): modules needed are CtClipboardUtil (`copy`/`flash`), CtUtil (`debounce`), CtConfirm
(`confirmDialog`; template line 29 uses `ctConfirm`), CtLicense (footer). The tool sets a third-party
list for the license modal — confirm CtLicense reads it correctly post-port (`window.ctThirdParty` after
the 3b rename). Check for any tool-local util duplicate before importing a lib module (pilot lesson). The
e2e references the old `ctLicense` global — update that to the new wiring (pre-approved), keeping the
same behavioral assertion (button opens modal; focus trap; Esc/✕/backdrop close).

## Tools & MCP
Local Node/ESM repo; no MCP. `node scripts/build-tool.mjs --dir="src/tools/uuid-generator"` (positional
path silently builds cwd — use `--dir=`). `node scripts/build-all.mjs --check` (10/10 gate). Run tests
DIRECTLY (`node --test tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`)
— the `pretest:*` npm hooks run `build --check` and will interfere.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/04-port-uuid-generator/` (findings → `findings/`).
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ the signed-off behavior decisions + the
  proven per-tool recipe (§3d) + carry-forwards (project.json dependency; check local-vs-lib dups;
  slice-tool unexercised).
- `dev/20261002-lib-cleanup/03-pilot-base64-port/findings/HANDOFF.md` — the pilot's worked example of the
  exact same port; your closest reference.
- `src/lib/components/` + `src/lib/utils/` — exports: `copy`/`flash` (CtClipboardUtil), `debounce`/
  `downloadBlob` (CtUtil), `confirmDialog` (CtConfirm), `openLicense` (CtLicense); footer at
  `components/footer.html`, CSS at `components/styles/`.
- `src/tools/uuid-generator/` — the port target (current `source/`, `tests/`, built `index.html`).

## Deliverables
- The ported, green `uuid-generator` (source + regenerated `index.html` + the updated license e2e) in the
  working tree. No commits (the user commits).
- `findings/HANDOFF.md` — what changed, the license-e2e delta applied + why it's pre-approved, any
  tool-specific surprise (e.g. ctThirdParty wiring), and gate tallies (build --check + unit/e2e counts).

## Constraints
- **Scope boundary:** ONLY `src/tools/uuid-generator/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git` (blocked). Playwright stays serial (`workers:1`).
- Test-review gate: a red test that is NOT the pre-approved license-wiring delta is STOP-and-surface,
  never a silent rewrite.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; uuid-generator green (unit + serial e2e) and `build-all --check` 10/10.
Final report 3–5 lines: ported ✓, the license-e2e delta, any surprise, gate results. State PASS/what-remains.
