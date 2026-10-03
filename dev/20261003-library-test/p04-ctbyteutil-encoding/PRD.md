# PRD — Phase 04 · CtByteUtil: encoding + ids + formatBytes

**Round type:** ship, sonnet, serial. **Size:** medium. **Depends on:** Phase 01.
**Target:** `src/lib/utils/CtByteUtil.mjs` → `src/lib/tests/unit/CtByteUtil.encoding.test.mjs`.

## In scope
- `bytesToBase64` / `base64UrlToBytes` / `utf8ToBase64` — canonical known pairs; round-trip
  `base64UrlToBytes(bytesToBase64(x))` where applicable; base64url vs standard base64 (-_ vs +/, padding);
  empty, 1/2/3-byte (padding boundaries), binary (0x00/0xFF), unicode via utf8ToBase64.
- `textToBytes` — ASCII, unicode/multi-byte (emoji, combining chars), empty; round-trip with a bytes→text
  path if one exists.
- `bytesToHex` — known pairs, empty, 0x00/0xFF, lowercase/length (2 chars/byte).
- `formatBytes(bytes, opts?)` — the #1008-approved NEW format: `0`→"0 B", `1023`→"1023 B", `1024`→"1.0 KB",
  `1536`→"1.5 KB", MB/GB tiers; default 1 decimal + space; cap at GB (per #1008 decisions.md); negative /
  non-finite handling; opts (if any) that change decimals/space/units. Determinism.
- `getRandomBytes(n)` — returns Uint8Array of length n; n=0; distinct across calls (shape/length, not
  statistical). `makeId()` — shape ("s_" + 16 hex per PROVENANCE), uniqueness across calls, length.

## Definition of Done
- `CtByteUtil.encoding.test.mjs` green; round-trips + known pairs + edge cases per fn.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: coverage inventory for these exports; note formatBytes expectations trace to #1008 decisions.

## Notes
No lib edits. formatBytes expectations must match the shipped NEW format (base64-tool's unit tests are a
reference). Don't re-introduce the old compact format.
