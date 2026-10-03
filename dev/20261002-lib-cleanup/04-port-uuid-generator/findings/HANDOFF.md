# 04-port-uuid-generator HANDOFF (r1)

STATUS: PASS.

## Changed (src/tools/uuid-generator only)
- template: CSS/footer via `<<ct:lib …>>`; classic copy.js/util.js script blocks removed; module script now inlines CtClipboardUtil, CtUtil, CtConfirm, CtLicense above app.mjs. Comment on line 29 reworded (ctConfirm -> confirmDialog).
- app.mjs: ctCopy->copy, ctFlash->flash, `const debounce = jbcUtil.debounce` alias deleted.
- Rebuilt index.html (0 `{{project` tokens).

## Surprise: local clampInt collision
app.mjs had a top-level `clampInt` (floor(Number(v)) semantics) that collides with CtUtil's exported `clampInt` (parseInt semantics, differs on e.g. "" or "1e2") -> module SyntaxError "Identifier 'clampInt' has already been declared", Help popup never opened. Fix: renamed the local to `clampIntFloor` (behavior parity preserved; not switched to the lib version). Possible later dedupe decision.
Also: CtConfirm is imported per recipe though confirmDialog is not called by app.mjs (no confirm ships); harmless.

## License
- e2e delta (pre-approved): `expect(typeof window.ctLicense).toBe('function')` replaced by `expect(modal).toHaveAttribute('aria-modal','true')` (button opens accessible modal; the rest of the license tests unchanged, passing).
- ctThirdParty: uuid-generator sets no third-party list. NOTE for lib owner: CtLicense.mjs still reads `window.jbcThirdParty` (line ~97, and its header comment), not `window.ctThirdParty` as the plan assumed. Not touched (shared lib); irrelevant here, may matter for other tools.

## Gates
- grep jbcUtil|ctCopy|ctFlash|ctConfirm over source: 0 matches.
- build-tool --dir: clean. build-all --check: 10/10 (0 failed).
- unit: 58/58. e2e serial (workers:1 untouched): 41/41.
