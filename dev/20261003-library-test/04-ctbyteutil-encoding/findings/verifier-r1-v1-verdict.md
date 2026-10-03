# Verifier verdict — 04-ctbyteutil-encoding r1 v1

## VERDICT: PASS

Nothing was mutated in the real tree. Mutations ran only on a scratch copy under `tmp/mut/`.

## DoD evidence
| Claim | Evidence | Result |
|---|---|---|
| Suite green | `node --test src/lib/tests/` -> tests 137, pass 137, fail 0 (matches builder; 44 new in the encoding file) | PASS |
| build-all | `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." | PASS |
| test-all | `node scripts/test-all.mjs` ran to completion -> "10/10 suites passed." No red suites, so no flake adjudication needed. | PASS |
| No lib source touched | git is blocked. Evidence: build-all --check 10/10, and `src/lib/utils/CtByteUtil.mjs` mtime is Oct 3 14:26, earlier than every test file (18:55-19:56). The only new file in `src/lib/tests/unit/` is the encoding test. This is inference from mtimes, not a diff. | PASS (by inspection) |
| Encoders | Reviewed the test file in full. Independent check with Node `Buffer`/`atob`: "Man"->TWFu, [0]->AA==, "foob"<-Zm9vYg==, [0xfb,0xff] base64url -> "-_8". All agree with the test literals. RFC 4648 section 10 vectors are present. Padding boundaries 0/1/2/3 bytes are covered. 0x00/0xFF, +/ vs -_, whitespace, and Buffer cross-checks for lengths 0..40 and all 256 bytes are covered. Round-trips for lengths 1..64 and an unpadded url-safe 256-byte case are genuine (decode of encode compared to the input). Expected values are literals, not derived from the code under test. | PASS |
| formatBytes #1008 | 0->"0 B", 1023->"1023 B", 1024->"1.0 KB", 1536->"1.5 KB", MB/GB tiers, cap at GB (1024^5 -> "1048576.0 GB"), and a shape regex that rejects the old compact form (no space, lowercase, TB). Space-separated and 1 decimal. | PASS |
| ids | getRandomBytes: Uint8Array of length n incl. 0, a >65536 chunk-boundary case, distinct across calls, fresh buffers. makeId: `^s_[0-9a-f]{16}$` and 1000 unique. | PASS |

## Mutation spot-check
Scratch copy, 19 mutations, each run against the copied test file. 19/19 killed after one correction (below). The mutations were:
- base64: alphabet swap, `==` pad on rem 1, base64url `_` mapping removed, base64url rem-3 padding, whitespace strip removed.
- hex: nibble alphabet, nibble mask.
- formatBytes: `<` changed to `<=` at the tier threshold, cap removed, default decimals 1 to 2, separator, default base 1024 to 1000, `Number.isFinite` to `isFinite`.
- utf8: Latin1 instead of UTF-8.
- textToBytes: null handling.
- getRandomBytes: constant fill.
- makeId: prefix, length.

One mutation survived: the getRandomBytes chunk stride `off += 65536` changed to `off += 65537`. That leaves a 1-byte zero gap per chunk. It survives because the chunk-boundary test only checks that the last 64 bytes are not all zero. This is a minor adequacy gap. A stronger test would assert that no isolated zero gap exists across a boundary, but that is not realistic for a random fill.

My first `invalid_isfinite` mutation was a no-op. It hit the doc comment, not the code. I re-ran it against the code line and it was killed.

## Adjudication of characterized edges
- **`formatBytes(-1024)` -> "-1024 B": characterize-OK.** There is no negative-size semantics; negatives hit `n < base`. Harmless, and pinning it documents the behavior.
- **`formatBytes(Infinity)` -> "Infinity GB" (and `-Infinity` -> "-Infinity B"): characterize-OK, with a low-severity doc discrepancy to raise.** The lib header says a non-finite argument "formats as '0 B'" via `Number(bytes) || 0`. That is true for NaN, but Infinity is truthy, so it passes through. The `invalid` option exists to catch Infinity, and the tests pin that. This is a doc inaccuracy, not a functional bug. A one-line doc fix is optional and is the orchestrator's call, not a test change.
- **NaN/null/undefined/'abc' -> "0 B": characterize-OK.** This matches the documented coercion.
- **`formatBytes('12', {invalid:'?'})` -> '?' vs `formatBytes('2048')` -> "2.0 KB": characterize-OK.** `Number.isFinite` does not coerce strings, and the default path coerces. The inconsistency is real but narrow, since a caller using `invalid` is expected to pass numbers. It is pinned by the test, which is the right treatment. Not a bug to raise.
- **`base64UrlToBytes('')` throws "Empty segment", so the empty array does not round-trip: characterize-OK.** The throw is explicit and deliberate (the JWT-segment origin, and the lib header says error text is preserved byte-stable). The test pins both the throw and the non-round-trip rather than hiding them.
- **`base64UrlToBytes` accepts standard base64: characterize-OK.** This is documented ("or standard"), and it is covered.
- **`formatBytes(1048575)` -> "1024.0 KB" (no re-tier after rounding): characterize-OK.** It is a cosmetic edge, and the test pins it with a comment.

No genuine bugs to raise.

## Coverage-quality concerns (not FAILs)
1. The getRandomBytes chunk-stride mutation survives (see above).
2. The handoff and one test comment describe `Number.isFinite(null)` as "isFinite(null)". The behavior asserted is correct. This is a comment wording issue only.
3. `bytesToHex` and `bytesToBase64` are tested only for typed arrays, plain arrays and Buffers. Invalid elements (e.g. 256, -1, non-numbers) are not probed. The lib does not define behavior for them, so this is acceptable.
4. The combining-character test relies on source-file Unicode normalization. It passes, and it asserts length 2 vs 3 so it would catch normalization drift.

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node dev/20261003-library-test/04-ctbyteutil-encoding/tmp/mut/run.mjs src/lib/utils/CtByteUtil.mjs "$PWD/dev/20261003-library-test/04-ctbyteutil-encoding/tmp/mut"
node -e 'console.log(Buffer.from("Man").toString("base64"),Buffer.from([0]).toString("base64"))'
```
The mutation harness is `tmp/mut/run.mjs`. Its scratch lib copy and test copy are under `tmp/mut/`.
