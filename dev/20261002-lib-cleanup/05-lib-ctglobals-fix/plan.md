# Plan — 05-lib-ctglobals-fix

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
A targeted correctness fix on the shared `ct` lib. Phase 3b renamed `Jbc`→`Ct` and `jbc-`→`ct-`, but
four RUNTIME window-global names are `jbc`+PascalCase (`window.jbcThirdParty`, `window.jbcConfirmStyles`,
`window.jbcModalStyles`, `window.jbcCopyStyles`) — they matched neither 3b rule and survived. The tools
use the `ct*` names, so the lib currently reads the wrong globals (e.g. the License modal's third-party
list won't populate for qr-generator / inflation-calculator). This round fixes the lib so the remaining
3e tool ports land on correct globals. Inserted before those tools by user decision ("verified ship round").

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| The 4 runtime globals renamed to `ct*` | `src/lib/components/{CtLicense,CtConfirm,CtModal,CtClipboardUtil}.mjs` | `window.jbcThirdParty`→`ctThirdParty`, `jbcConfirmStyles`→`ctConfirmStyles`, `jbcModalStyles`→`ctModalStyles`, `jbcCopyStyles`→`ctCopyStyles`. `grep -rnE "window\.jbc[A-Z]" src/lib` → no RUNTIME matches |
| Current-API doc comments match | same files | the header/inline comments that DOCUMENT these opt-outs/globals (the live API) updated to `ct*`. PROVENANCE.md + historical lineage comments ("was foo.mjs — jbcBar") left ALONE |
| 3a inliner tests unbroken | `scripts/tests/esm-inline*.test.mjs` | `node --test scripts/tests/` → 38/38 (do NOT edit the tests) |
| Ported tools still green after lib change | `src/tools/base64-tool/`, `src/tools/uuid-generator/` | both inline these modules → rebuild each (`build-tool --dir=<path>`); `node scripts/build-all.mjs --check` → 10/10; each tool's unit + serial e2e still green |

## Task / method
Per the builder's charter. Mechanical: find each runtime `window.jbc<Pascal>` read in the four module
files and rename to `window.ct<Pascal>`; update the doc comments that describe the CURRENT opt-out/global
API to match. Then rebuild the two already-ported tools (base64-tool, uuid-generator) because they inline
CtLicense / CtClipboardUtil / CtConfirm — their shipped `index.html` must be regenerated so `--check`
stays byte-clean. Confirm nothing else in `src/tools` references these globals yet (the other 7 tools are
still on `jbc-include-old` and unaffected). Do NOT touch PROVENANCE.md or historical lineage comments.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/tools/<t>"` to rebuild a tool;
`node scripts/build-all.mjs --check` (10/10 gate); `node --test scripts/tests/` (the 3a inliner suite,
38/38); per-tool tests DIRECTLY (`node --test tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`, serial).

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/05-lib-ctglobals-fix/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the "Phase 3b gap" write-up (exact files/lines).
- `src/lib/components/{CtLicense,CtConfirm,CtModal,CtClipboardUtil}.mjs` — the four files to fix.
- `src/tools/base64-tool/` + `src/tools/uuid-generator/` — the ported tools to rebuild + re-test.

## Deliverables
- The four lib files fixed + base64-tool/uuid-generator `index.html` regenerated, in the working tree.
  No commits (the user commits).
- `findings/HANDOFF.md` — the exact renames (file:line before→after), which doc comments were updated vs
  left as historical, and gate tallies (lib grep, scripts/tests 38/38, build-all --check, both tools' e2e).

## Constraints
- **Scope boundary:** ONLY the four named lib files + the two ported tools' regenerated `index.html`. Do
  NOT touch the other 7 tools, `scripts/`, `project.json`, the 3a tests, or PROVENANCE.md. If a rename
  looks ambiguous or would hit a non-runtime/historical reference, leave it and note it.
- No `rm`, no `git`. Playwright serial (`workers:1`).
- Test-review gate: a red test is STOP-and-surface (there is NO pre-approved test delta in this round —
  the lib rename must not require any test change; if a test goes red, that's a real signal).

## Time budget
1h.

## When done
`findings/HANDOFF.md` written; lib grep clean of runtime `window.jbc[A-Z]`; `scripts/tests` 38/38;
`build-all --check` 10/10; base64-tool + uuid-generator e2e green. Report 3–5 lines with the renames + gates.
State PASS/what-remains.
