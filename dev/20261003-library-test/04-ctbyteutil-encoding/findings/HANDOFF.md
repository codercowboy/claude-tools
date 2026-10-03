# HANDOFF — 04-ctbyteutil-encoding r1

Landed: `src/lib/tests/unit/CtByteUtil.encoding.test.mjs` (44 tests, zero-dep, node:test). No lib source touched.

## Gate
- `node --test src/lib/tests/` -> 137 tests, 137 pass, 0 fail (44 new here).
- `node scripts/test-all.mjs` -> lib step green; "10/10 suites passed."
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."

## Coverage inventory
- bytesToBase64 (5): RFC 4648 vectors, "Man"->TWFu, 0/1/2/3-byte padding, 0x00/0xFF, +/ alphabet, Buffer cross-check lengths 0..40 + all 256 bytes, array/Buffer input.
- base64UrlToBytes (7): padded/unpadded, -_ vs +/ equivalence, whitespace stripped, throws (empty/null/undefined, len%4==1, bad chars), round-trip 1..64 bytes + url-safe unpadded 256 bytes, empty-array non-round-trip.
- utf8ToBase64 (4): ASCII, empty, 2/3/4-byte unicode literals, Buffer agreement, TextDecoder round-trip, == bytesToBase64(textToBytes).
- textToBytes (4): ASCII, empty, 2/3/4-byte, emoji, ZWJ, combining chars (precomposed != decomposed), null/undefined -> empty, non-string stringified, TextDecoder round-trip.
- bytesToHex (3): known pairs, empty, 00/ff, nibble padding, lowercase, 2 chars/byte, all 256 values vs Buffer, array/Buffer input.
- formatBytes (15): #1008 tiers, negatives, NaN/null/undefined/non-numeric, Infinity, determinism/purity, opts base/decimals(number+fn)/space/units/byteUnit/invalid/invalidWhen.
- getRandomBytes (4): Uint8Array len n incl 0, >65536 chunk boundary, distinct across calls, fresh buffers.
- makeId (2): ^s_[0-9a-f]{16}$, 1000 unique.
- CtByteUtil aggregator (1): all 8 statics are identical references.

## #1008 formatBytes trace
Expectations are the NEW format ("0 B", "1023 B", "1.0 KB", "1.5 KB", MB/GB, GB cap, space-separated), the same cases as `src/tools/base64-tool/tests/unit/misc.test.mjs`. A shape test asserts the old compact form (no space, lowercase, TB) never appears.

## Characterized behavior worth knowing (not bugs per the documented contract)
- formatBytes(-1024) -> "-1024 B" (negatives hit the sub-base branch; never scaled).
- formatBytes(Infinity) -> "Infinity GB"; formatBytes(-Infinity) -> "-Infinity B"; NaN/null/undefined/'abc' -> "0 B". Only `invalid` opt catches Infinity.
- formatBytes('12', {invalid:'?'}) -> '?' (Number.isFinite does not coerce), but formatBytes('2048') -> "2.0 KB" without `invalid`. Inconsistent but pinned.
- formatBytes(1048575) -> "1024.0 KB" (toFixed rounds at tier edge, no re-tier).
- base64UrlToBytes('') throws, so bytesToBase64(empty) does not round-trip.
- base64UrlToBytes accepts standard base64 too.

No suspected bugs; nothing blocked.

Repro: `node --test src/lib/tests/` ; `node scripts/test-all.mjs` ; `node scripts/build-all.mjs --check`
