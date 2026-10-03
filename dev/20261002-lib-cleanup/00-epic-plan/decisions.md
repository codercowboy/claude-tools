# Decisions

> Human + orchestrator decisions across phases. Doubles as the raise-to-user
> queue. CHARTER-CLEAN (subagents read this file): record WHAT was decided, not how a phase is approached.

## Log

### Phase 3c — behavior-diff sign-off (USER-APPROVED 2026-10-03, session 0004)
The jbc-include-old → ct lib port has exactly two tool-facing behavior diffs. Both decided:

1. **`formatBytes` output shape → ACCEPT-NEW.**
   - New default `"1.5 KB"` / `"0 B"` / `"678 B"` (1 decimal, space, capped at GB) is the shipping format.
   - Rationale: the only consumer in this repo is `base64-tool`, and its tests already assert the new format. Do NOT pass old-parity options (`{space:false, byteUnit:'b', decimals:2, units:[…TB]}`).

2. **Footer License → KEEP the License link in every tool's footer.**
   - The new `components/footer.html` dropped the auto-inlined license `<script>`. Tools must accommodate: during the port, each tool that carries the footer adds an explicit `CtLicense` import so the footer License button keeps working.
   - Behavior is unchanged for the user (button still opens the MIT/third-party modal); the wiring moves from footer-inlined to per-tool import.
   - **Test rule:** any test that asserts on the old license wiring gets UPDATED to the new import-based wiring. This is a pre-approved test delta under the Phase-3 inventory exception to the test-review gate — a red license-wiring test in 3d/3e is expected and may be fixed, NOT stop-and-surface.
   - Tools known to reference it: `cron-builder`, `inflation-calculator`, `network-toolkit`, `qr-generator`, `uuid-generator`.

**All other old→new changes are mechanical** (global names → named exports, `ct-`/`jbc-` prefix) and were already resolved by Phase 3a (ESM inliner) + 3b (lib rename). No further behavior sign-off is required before 3d/3e.

### Phase 3d — pilot (base64-tool) PASS (2026-10-03, session 0004)
Verifier r1 PASS (`03-pilot-base64-port/findings/verifier-r1-v1-verdict.md`). base64-tool ported & green (unit 53/53, e2e 71/71 serial, `build-all --check` 10/10). Recipe proven; see `03-pilot-base64-port/findings/HANDOFF.md`. Three carry-forward items for 3e:

1. **`project.json` now exists at repo root** (orchestrator-created this round): `{name: claude-tools, repo: https://github.com/codercowboy/claude-tools, tagline: …}` — restores the values the OLD footer hardcoded. REQUIRED by the new tokenized `footer.html` + `CtLicense.mjs` (they carry `project.name/repo/repoLabel/tagline` + `LICENSE_REPO` mustache tokens; substitution runs AFTER lib/module expansion). Every 3e tool depends on it — do NOT remove it; a plain build without it ships unsubstituted tokens.
2. **Check local-vs-lib duplicates before importing.** base64-tool had its OWN local `formatBytes` (already new format, unit-tested) — the builder correctly did NOT import `CtByteUtil` (would inline ~585 unused lines + collide on the name). Each 3e tool: inspect what it actually uses; import only the lib modules it needs; keep a tool-local util if importing the lib version would bloat/collide. This is a recipe refinement, not a behavior change.
3. **`slice-tool.mjs` still unexercised on a `ct:module` template** (carried from 3a). Watch for it during 3e; surface if it breaks.

### Phase 3e carry-forward — whole-module inline drops ALL exports as top-level consts
uuid-generator (R2) hit a `clampInt` collision: inlining `CtUtil` via `<<ct:module>>` brought CtUtil's `clampInt` as a top-level const, colliding with the tool's own local `clampInt` (different semantics → SyntaxError). Builder renamed the LOCAL one (`clampIntFloor`), preserving behavior. **Rule for every remaining tool:** before adding a `<<ct:module>>`, check the tool's own top-level declarations against that module's exports (CtUtil exports `clamp`/`num`/`clampInt`/`escapeHtml`/`escapeAttr`/`el`/`slugify`/`persistState`/`onceFlag`/… — many common names). On a collision, rename the tool-local one (keep its semantics) unless it's genuinely identical to the lib's.

### Phase 3b gap — `window.jbc*` global family missed (USER-APPROVED fix 2026-10-03, session 0004)
3b renamed `Jbc`→`Ct` + `jbc-`→`ct-`, but four RUNTIME `jbc`+PascalCase window-global names matched neither rule and survived in the new lib (3b's verifier passed only because nothing consumed the lib yet):
- `CtLicense.mjs:97` `window.jbcThirdParty` → should be `window.ctThirdParty` (tools set `ctThirdParty`; affects qr-generator + inflation-calculator License modal third-party list).
- `CtConfirm.mjs:49` `window.jbcConfirmStyles`, `CtModal.mjs:86` `window.jbcModalStyles`, `CtClipboardUtil.mjs:87` `window.jbcCopyStyles` — CSS opt-out flags; tools use the `ct*` names.

**Decision (user chose "verified ship round"):** fix via a dedicated builder+verifier round (Phase 05, `05-lib-ctglobals-fix`) INSERTED before the tools that need it. Rename the 4 runtime globals + their current-API doc comments `jbc*`→`ct*`. Leave PROVENANCE.md + historical lineage comments as-is. Gates: lib grep clean of runtime `window.jbc[A-Z]`; `node --test scripts/tests/` 38/38; rebuild the 2 already-ported tools (base64-tool + uuid-generator inline CtLicense/CtClipboardUtil/CtConfirm) so their e2e + `build-all --check` stay 10/10. Phase 05 DONE + verifier-PASS.

> **`ctThirdParty` validation — RESOLVED (lib-level only).** Recon of qr-generator AND inflation-calculator shows neither sets `window.ctThirdParty` (these are 100%-vanilla tools with no bundled third-party libs; they assert a "100% vanilla" note). No tool in this suite exercises the third-party list, so the Phase-05 `ctThirdParty` rename is correct-but-unexercised-by-tools — it stands verified at the lib level (grep + the opt-out semantics). Stop tracking it as a per-tool validation.

### Phase 3e R6 — color-designer collision (`prefersReducedMotion`) + a new MANDATORY smoke-check (2026-10-03, session 0004)
color-designer R6 builder reported PASS-shaped progress but its e2e ran 40+ min with ~38 tests timing out in `beforeEach` (waiting for `window.__colorDesigner.state.rollResult`). Orchestrator diagnosed via a headless load of the built `index.html`: `[pageerror] Identifier 'prefersReducedMotion' has already been declared`. **Root cause:** CtUtil exports `prefersReducedMotion`; color-designer's `app.mjs` ALSO declares a local `prefersReducedMotion` → inlining CtUtil created a duplicate declaration → the module throws at evaluation → the whole app never initializes (static HTML still renders, so the UI *looks* fine) → every e2e `beforeEach` times out. Builder TaskStopped; orphaned Playwright procs reaped; builder r2 dispatched to rename/dedupe the local.

**Two systemic lessons (apply to ALL remaining tools):**
1. **Collision check must scan ALL of app.mjs, not just column-0.** `build-tool`'s collision guard only covers module-vs-module, NOT a `<<ct:module>>` export vs a declaration inside `<<ct:inline app.mjs>>`. The uuid `clampInt` + this `prefersReducedMotion` are the same class. Before building, for EACH inlined module, grep the tool's source for every one of that module's exported identifiers used as a local declaration (anywhere, any indentation) and rename/dedupe the tool-local one.
2. **MANDATORY fast smoke-check before the full e2e** (catches this class in seconds, not 40 min): after `build-tool`, headlessly load the built `index.html` via `file://` and assert ZERO `pageerror`/`console.error` AND that the tool's test API / expected globals attach. A reusable diag lives at `tmp/claude-501/.../scratchpad/diag.mjs` (adapt the url + the window-API check per tool). Only run the full Playwright e2e once the smoke-check is clean. A `pageerror` = a real init regression (usually a collision) = STOP-and-fix, never let the e2e grind.

### Phase 3e — crypto.randomUUID lib-comment fix (USER-APPROVED 2026-10-03, session 0004)
qr-generator (R3) inlined `CtByteUtil` (for crc32), which dragged CtByteUtil's doc comment NAMING `crypto.randomUUID` into the built HTML → tripped the tool's `conventions compliance > does not reference crypto.randomUUID` e2e (a grep of the built HTML, `/crypto\.randomUUID/`). Builder correctly STOPPED (lib is outside its boundary). **User chose "reword the lib comment":** orchestrator reworded `src/lib/utils/CtByteUtil.mjs:534` to drop the literal `crypto.randomUUID` token (meaning preserved; PROVENANCE.md still records the rule). Verified: scripts/tests 38/38 (inliner-equivalence intact), qr-generator e2e 76/76. **Carry-forward:** this fix PRE-EMPTS the same false-positive in `color-designer` — the only OTHER tool that both inlines CtByteUtil and carries the crypto.randomUUID convention test. color-designer should port cleanly on this axis now.

**The proven per-tool recipe (from the pilot HANDOFF):** CSS/footer → `<<ct:lib components/styles/*.css>>` + `<<ct:lib components/footer.html>>`; delete the classic `<script>` include blocks; inside the module script above `<<ct:inline app.mjs>>` add the needed `<<ct:module …>>` lines (CtClipboardUtil / CtUtil / CtLicense / etc.); rename call sites (`debounce`/`downloadBlob`/`copy`/`flash`); delete any `const debounce = jbcUtil.debounce` alias (TDZ self-ref after rename); rename `__ctCopySync`→`__copySync` (the `ctCopy` gate grep matches it); build via `build-tool --dir=<path>` (a positional path silently builds cwd); run tests directly (`node --test tests/unit/*.test.mjs` + `npx playwright test --config=tests/playwright.config.mjs`) because the `pretest:*` hooks run `build --check`.
