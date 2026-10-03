# Plan — 06-port-qr-generator

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3e fan-out, round 3. Port `qr-generator` onto the ct lib. This tool exercises the widest lib
surface yet — `crc32` (CtByteUtil) AND the License modal's third-party list (`window.ctThirdParty`, which
Phase 05 just fixed in the lib) — so it doubles as the end-to-end validation of the Phase-05 fix. Apply
the proven recipe (epic `decisions.md §3d`). Do NOT touch any other tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| qr-generator consumes the ct lib, not old flat includes | `source/index.template.html` | no `<<ct:include copy.js/crc32.js/util.js/footer.html/base.css/controls.css>>`; CSS/footer via `<<ct:lib …>>`; JS via `<<ct:module …>>` for CtByteUtil, CtUtil, CtClipboardUtil, CtConfirm, CtLicense |
| named imports replace globals | `source/app.mjs` | `const crc32 = jbcCrc32` DELETED (crc32 now the inlined-module const); `jbcUtil.debounce`→`debounce`; `ctCopy`→`copy`; `ctFlash`→`flash`; `ctConfirm`→`confirmDialog`. `grep -rnE 'jbcUtil\|jbcCrc32\|ctCopy\|ctFlash\|ctConfirm'` over `source/` → nothing |
| Footer License kept & wired; third-party list populates | template + built html + e2e | `CtLicense` inlined; footer License opens modal; the e2e's `window.ctThirdParty` list renders (validates Phase 05). Footer has no unsubstituted project-identity tokens |
| License e2e updated to new wiring | `tests/*e2e*.mjs` | old `window.ctLicense()` ref → new wiring, SAME assertion intent. PRE-APPROVED license delta. The `ctThirdParty` assertion should PASS as-is (lib fixed) — keep it |
| Build regenerates deterministically | built `index.html` | `node scripts/build-tool.mjs --dir="src/tools/qr-generator"`; `node scripts/build-all.mjs --check` → 10/10 |
| Behavior preserved | tests | `node --test tests/unit/*.test.mjs` green; serial e2e (`npx playwright test --config=tests/playwright.config.mjs`, `workers:1`) green |

## Task / method
Per the builder's charter + the recipe in `00-epic-plan/decisions.md §3d`. Tool specifics (front-loaded):
`crc32` comes in by inlining the whole `CtByteUtil` module — that's ~585 lines for one function; accept
the size (do NOT refactor the lib into a crc32-only module — out of scope), just note it in the handoff.
Delete the `const crc32 = jbcCrc32` alias (it collides with the module's `crc32` const / becomes a TDZ
self-ref). Check the tool's top-level declarations against CtByteUtil's many exports (base64/hex/md5/
sha*/formatBytes/makeId…) and CtUtil's exports before inlining — rename any local collision (keep its
semantics), per the uuid-generator lesson. The e2e references the old `window.ctLicense()` global — update
to the new wiring (pre-approved), keeping the same behavioral assertion; the `window.ctThirdParty`
third-party-list assertion should now pass because Phase 05 fixed `CtLicense` to read `ctThirdParty`.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/qr-generator"` (use `--dir=`);
`node scripts/build-all.mjs --check` (10/10 gate). Run tests DIRECTLY (`node --test tests/unit/*.test.mjs`
+ `npx playwright test --config=tests/playwright.config.mjs`) — the `pretest:*` hooks run `build --check`.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/06-port-qr-generator/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ signed-off decisions + the proven recipe (§3d)
  + carry-forwards (project.json dependency; check local-vs-lib dups; whole-module-inline collisions).
- `dev/20261002-lib-cleanup/03-pilot-base64-port/findings/HANDOFF.md` +
  `04-port-uuid-generator/findings/HANDOFF.md` — two worked examples (uuid shows the license e2e delta +
  a collision rename).
- `src/lib/components/` + `src/lib/utils/` — exports: `crc32` (`utils/CtByteUtil.mjs`), `debounce`
  (`utils/CtUtil.mjs`), `copy`/`flash` (`components/CtClipboardUtil.mjs`), `confirmDialog`
  (`components/CtConfirm.mjs`), `openLicense` (`components/CtLicense.mjs`, now reads `window.ctThirdParty`).
- `src/tools/qr-generator/` — the port target (`source/`, `tests/` incl. the e2e License/ctThirdParty
  assertions at ~lines 1130/1133/1176, built `index.html`).

## Deliverables
- The ported, green `qr-generator` (source + regenerated `index.html` + the updated license e2e). No commits.
- `findings/HANDOFF.md` — what changed, the license-e2e delta, the CtByteUtil-inline size note, any
  collision renames, whether the ctThirdParty assertion passed, and gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/tools/qr-generator/`. Do NOT modify any other tool, `src/lib/`,
  `scripts/`, `project.json`, or `00-epic-plan/`. If a shared change seems needed, STOP and surface it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test that is NOT the pre-approved license-wiring delta is STOP-and-surface.

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; qr-generator green (unit + serial e2e, incl. ctThirdParty) and
`build-all --check` 10/10. Report 3–5 lines: ported ✓, license-e2e delta, ctThirdParty validation result,
CtByteUtil size note, gate results. State PASS/what-remains.
