# src/lib unit tests (ct library)

Zero-dependency unit tests for the shared `ct` lib. Pure Node, no DOM, no browser.

- **Location:** `src/lib/tests/unit/<Module>.<topic>.test.mjs` (one file per module, or per
  function group for big modules, e.g. `CtByteUtil.crc32.test.mjs`).
- **Runner:** `node:test` + `node:assert/strict` only. Import the lib module DIRECTLY:
  `import { crc32 } from '../../utils/CtByteUtil.mjs';`
- **Run:** `node --test src/lib/tests/` (or `npm run test:lib`). The suite also runs as the named
  "src/lib unit tests" step of `node scripts/test-all.mjs`.
- **Do not** put tests under `src/lib/tests/` that need Playwright/DOM; DOM components stay e2e.
- **Test-only:** never edit lib source to make a test pass. A real lib bug is surfaced, not hidden;
  never weaken a test.

## Adding a module's tests
1. Copy `unit/CtByteUtil.crc32.test.mjs`, rename, fix the import.
2. Header comment: how to run + where each vector came from (RFC / published vector / dev-repo origin test).
3. Use KNOWN vectors from a spec or independent reference (e.g. `node:crypto`), not values
   computed by the code under test.
4. Cover: empty/edge input, canonical vector, each input type accepted, output type/format
   (unsigned, padding, case), determinism, no input mutation, error paths.
5. One behavior per `test()`, descriptive names. Run `node --test src/lib/tests/` and
   `node scripts/test-all.mjs`.

Ownership: crc32/crc32Hex are covered in `CtByteUtil.crc32.test.mjs` (Phase 01); other CtByteUtil
hash functions go in their own files.
