# Verifier r1 v1 — 03-ctbyteutil-hashing

## VERDICT: PASS

## DoD evidence
1. `node --test src/lib/tests/` -> tests 93, pass 93, fail 0 (38 hashing + 47 CtUtil + 8 crc32). Matches builder.
2. `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." (10/10).
3. `node scripts/test-all.mjs` run to completion: lib step 93/93 green; 8/10 suites passed. Failures = color-designer (accordion re-roll, 36s timeout, retried) and color-picker (ctConfirm Cancel, 36s timeout) — both e2e UI timeouts, nothing hashing-related. Re-ran each suite alone (`npm run test:e2e` in src/tools/color-picker, src/tools/color-designer): 92/92 and 205/205 pass. Known flake, not caused by this round.
4. No lib source modified: git blocked. `src/lib/utils/CtByteUtil.mjs` mtime is Oct 3 14:26, before the phase start (charters/plan 19:33); the other utils are Oct 2. Only new test file is `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` (19:36). build-all 10/10 supports "no source drift". (Inference from mtimes, not git.)

## Vector authenticity (independent)
- Built a scratch copy of the test file whose imports point at a `node:crypto` (OpenSSL) shim instead of the module under test, then ran all 38 tests: 38/38 pass. So EVERY expected digest in the file (md5, sha1, sha256, sha512, million-a, all HMAC literals incl. RFC 2202/4231 and the `[node:crypto]` ones) is confirmed by an implementation independent of CtByteUtil. Also `openssl dgst` spot checks: md5("abc")=900150983cd2...(RFC 1321), sha512("abc")=ddaf35a1...(FIPS 180).
- Attribution is correct: md5 vectors = RFC 1321 A.5 values; sha1/256/512 = FIPS 180 ("abc", 448/896-bit, 1M x a); HMAC = RFC 2202 (md5/sha1) and RFC 4231 (sha256/512). `[node:crypto]` labelled values (200xa, unicode, empty-key/empty-msg HMAC) match OpenSSL.
- Small note: the "key"/fox HMAC values are labelled "Wikipedia" — confirmed by node:crypto, fine.

## Mutation testing (scratch copies only, real files untouched)
Every fault turned the suite red (baseline 38/38): md5 init a0 (7 fail), sha1 init h4 (8), sha256 K[0] (9), sha256 K[63] (9), sha512 K[0] (8), sha512 K mid (8), hmac ipad 0x36->0x37 (8), hmac opad (8), hmac long-key-hash skipped (1 fail), unsupported-hash message changed (1 fail), flipped sha1 abc expected digest (1 fail), flipped hmac sha512 RFC4231 case6 digest (1 fail). No can't-fail asserts found.

## Coverage confirmed
Uint8Array/plain array/Buffer agreement for all 4 hashes and hmac; determinism + fresh array + no input mutation; output length/type; multi-block (200B, 1M, 55..129 boundaries); unicode; empty inputs; key > block size (80B, 131B); unsupported-hash throw (`Unsupported hash for HMAC: sha3`).

## Concerns (non-blocking)
- Padding-boundary test only checks length + distinctness (self-consistency), not exact digests — a boundary padding bug would be caught only by the 56B/112B/200B/1M known vectors. Could add node:crypto literals for 55/56/64/119/120/128 bytes.
- Hashing functions are only tested with byte inputs (by design; strings are unsupported). No test pins what happens for a string input (throws? garbage?) — behavior unspecified.
- Reporting `[node:crypto]` vectors are consistent with OpenSSL, but sha1 HMAC RFC 2202 case 3 is tagged inside an RFC 4231 test (cosmetic).
- Mutation of sha1/md5 round internals other than init/K constants was not exhaustively tried.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
(cd src/tools/color-picker && npm run test:e2e); (cd src/tools/color-designer && npm run test:e2e)
```
Independent check: copy the test file to scratch, replace the import with a node:crypto shim (createHash/createHmac), `node --test`. Mutations: copy CtByteUtil.mjs to scratch, perturb constants with perl, run copied test against the copy.
