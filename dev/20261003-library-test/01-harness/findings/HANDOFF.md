# HANDOFF — 01-harness r1

## Landed
- `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` (8 tests; vectors cited in header: hasher/favicon-kit/apng-maker origins)
- `src/lib/tests/README.md` (pattern doc)
- `scripts/test-all.mjs`: explicit named step `=== src/lib unit tests — node --test src/lib/tests/ ===` run BEFORE e2e packages;
  counts as a suite in the final `N/N suites passed` (total = e2e dirs + 1). `SKIP_RELDIRS` untouched (template not re-discovered).
- `package.json`: `"test:lib": "node --test src/lib/tests/"`.
- No src/lib source touched.

## Location / wiring
`src/lib/tests/unit/<Module>.<topic>.test.mjs`, zero-dep node:test + assert/strict, import `../../utils/<Module>.mjs` directly.
Runner `node --test src/lib/tests/` (auto-discovers `*.test.mjs`). Later phases just add files; no wiring changes.

## Gate
1. `node --test src/lib/tests/` -> tests 8, pass 8, fail 0.
2. `node scripts/test-all.mjs` section: lib step printed 8 ✔ / pass 8 / fail 0. Overall run was 9/10 suites passed
   in the FIRST run: `src/tools/color-picker` e2e failed 1 test (localStorage persistence reload, toHaveCount) —
   FLAKY and unrelated: color-picker `npm run test:e2e` re-run alone = 92 passed. Lib step itself green. (Note: the
   total is now e2e dirs + 1 = 10 suites, 9 tools + lib.)
3. `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." (10/10).

## crc32 OWNERSHIP
crc32 and crc32Hex are covered HERE (Phase 01). Phase 03 does md5/sha1/sha256/sha512/hmac only.

## Surprises / gaps
- Flaky color-picker e2e under full-suite load (above); not caused by this change.
- crc32Hex lives in CtByteUtil.mjs (local); crc32 body is likewise in that file (comments mention a sibling import, stale).

## Repro
cd to repo root; `node --test src/lib/tests/`; `node scripts/test-all.mjs`; `node scripts/build-all.mjs --check`.
