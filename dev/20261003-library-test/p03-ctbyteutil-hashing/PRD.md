# PRD — Phase 03 · CtByteUtil: hashing

**Round type:** ship, sonnet, serial. **Size:** medium-high (many vectors). **Depends on:** Phase 01.
**Target:** `src/lib/utils/CtByteUtil.mjs` → `src/lib/tests/unit/CtByteUtil.hashing.test.mjs`.

## In scope
- `md5`, `sha1`, `sha256`, `sha512` — KNOWN-ANSWER vectors from RFCs / NIST. At minimum: hash of `""`,
  `"abc"`, `"The quick brown fox jumps over the lazy dog"`, a multi-block (>64/128 byte) input, and a
  unicode/multi-byte string. Cite the vector source in comments. Confirm output encoding (hex? bytes?)
  and test that form.
- `hmac` — RFC 4231 / RFC 2202 test vectors (key + message → mac) for the supported hash(es); empty key,
  key longer than block size, empty message.
- `crc32` / `crc32Hex` — ONLY if Phase 01 did NOT already cover them (check the Phase-01 handoff). If 01
  covered crc32, skip here and note it.

## Approach
- Port/adapt the dev origin crc32 tests (`../claude-tools-dev/src/tools/{hasher,favicon-kit,apng-maker}/
  tests/unit/crc32.test.mjs`) and any hash tests in `hasher`. Keep their vectors.
- Test both string and byte-array (Uint8Array) inputs if the API accepts both.
- Determinism: same input → same digest across calls.

## Definition of Done
- `CtByteUtil.hashing.test.mjs` green; each hash fn has ≥3 known-answer vectors + an edge case.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: which fns covered, vector sources, and the crc32 ownership decision (01 vs here).

## Notes
No lib edits. If a digest mismatches a known vector, that's a REAL bug — STOP and surface (do not adjust
the expected value to match the code).
