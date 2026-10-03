# HANDOFF — 03-ctbyteutil-hashing r1

Status: DONE. No mismatch, no bug found. Only file added: `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` (+ this handoff). No lib source touched.

## API confirmed (CtByteUtil.mjs)
md5/sha1/sha256/sha512 take BYTES (Uint8Array / plain array / Buffer all work; NOT strings) and return a raw Uint8Array (16/20/32/64 B), not hex. hmac(hashName, keyBytes, msgBytes) -> Uint8Array; hashName in md5|sha1|sha256|sha512, else throws `Unsupported hash for HMAC`. Tests convert strings with TextEncoder and hex via `bytesToHex`.

## Covered
- md5: RFC 1321 A.5 (``, a, abc, message digest, a-z, A-Za-z0-9, 80-byte digits multi-block), fox, 200xa multi-block, unicode.
- sha1 / sha256: FIPS 180 (``, abc, 448-bit 2-block), fox, 200xa, unicode.
- sha512: FIPS 180-4 (``, abc, 896-bit 2-block), fox, 200xa (>128B), unicode.
- All four: FIPS 1,000,000 x 'a'; input-type agreement (Uint8Array/array/Buffer); determinism + no input mutation; avalanche; 12 padding-boundary lengths (55..65 / 111..129); output type+length.
- hmac: RFC 2202 cases 1, 2, 3(sha1), 6 (MD5/SHA-1); RFC 4231 cases 1, 2, 3, 4, 6, 7 (SHA-256/512); Wikipedia "key"/fox (md5/sha1/sha256); empty key, empty message, empty+empty (all 4 algos); key > block size (80 B and 131 B); unsupported-hash throws.
- Vectors from Node's independent OpenSSL (marked `[node:crypto]` in the file; pasted as literals, never from the code under test): 200xa, unicode string `héllo wörld ✓ 日本語 🚀`, empty-key/empty-message HMAC (not in any RFC).
- Origin vectors ported from ../claude-tools-dev hasher hashes.test.mjs / hmac.test.mjs.

## crc32 skip
crc32 / crc32Hex deliberately NOT covered here — owned by Phase 01 (CtByteUtil.crc32.test.mjs). Noted in the file header.

## Counts / commands
- New file: 38 tests, 38 pass.
- `node --test src/lib/tests/` -> tests 93, pass 93, fail 0.
- `node scripts/test-all.mjs` -> lib step ran inside it: tests 93 / pass 93 / fail 0 (e2e tool packages continue after; unrelated to this change, not awaited to the end at handoff time).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." (10/10).

## Mismatches
None. Every vector matched on first run.

## Repro
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/unit/CtByteUtil.hashing.test.mjs
node --test src/lib/tests/
node scripts/test-all.mjs
node scripts/build-all.mjs --check
