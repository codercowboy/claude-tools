# PRD — Phase 01 · Test harness + exemplar (FOUNDATION — blocks all later phases)

**Round type:** ship (builder + verifier), sonnet, serial. **Size:** small-medium. **Depends on:** nothing.

## Goal
Stand up the lib unit-test harness and prove it end-to-end with ONE exemplar module's tests, so every
later phase just copies the pattern. This is the only phase that edits `scripts/`.

## Deliverables
1. **Harness location:** create `src/lib/tests/unit/` (mirrors the existing `src/lib/test-support/tests/`
   precedent). Tests are `*.test.mjs`, zero-dep (`node:test` + `node:assert/strict`), importing the lib
   module directly (e.g. `import { crc32, crc32Hex } from '../../utils/CtByteUtil.mjs'`).
2. **Suite wiring:** add a lib-unit-test step to `scripts/test-all.mjs` so `node scripts/test-all.mjs`
   runs `node --test src/lib/tests/` (and/or add a `test:lib` npm script). `test-all.mjs` currently
   SKIPS `src/lib` for tool discovery — add the lib step WITHOUT re-enabling tool-style discovery of the
   template. Keep the output legible (named section, pass/fail count).
3. **Exemplar tests:** `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` covering `crc32` + `crc32Hex` with
   KNOWN CRC-32 (IEEE, reflected 0xEDB88320) vectors — e.g. `crc32("")`=0, `crc32("123456789")`=0xCBF43926,
   plus a bytes-input case and the hex formatting of `crc32Hex`. Port/adapt from
   `../claude-tools-dev/src/tools/{hasher,favicon-kit,apng-maker}/tests/unit/crc32.test.mjs`.
4. **Pattern doc:** a short `src/lib/tests/README.md` (or a header comment) stating the conventions
   (location, runner, how to add a module's tests, the quality bar) so later builders copy it.

## Definition of Done
- `node --test src/lib/tests/` runs green and includes the crc32 exemplar (report count).
- `node scripts/test-all.mjs` now runs the lib tests as a named step and is green.
- `node scripts/build-all.mjs --check` → 10/10 (no source touched beyond the scripts/test-all wiring).
- Handoff documents the chosen location + wiring precisely (later phases depend on it) and the exemplar
  pattern.

## Notes / judgment
- Decide crc32 ownership: doing crc32 here as the exemplar means Phase 03 covers only md5/sha*/hmac. Say
  so in the handoff so Phase 03 doesn't duplicate.
- Do NOT modify any lib source. The only non-test edit allowed this phase is the `test-all.mjs` wiring
  (+ optional `package.json` `test:lib` script).
