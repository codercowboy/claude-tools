# Plan — 03-ctbyteutil-hashing

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Add known-answer unit-test coverage for the HASHING functions of `src/lib/utils/CtByteUtil.mjs`:
`md5` · `sha1` · `sha256` · `sha512` · `hmac`. crc32 / crc32Hex are OWNED by Phase 01 — SKIP them here
(note the skip). Full scope spec: `dev/20261003-library-test/p03-ctbyteutil-hashing/PRD.md`.
Hashing is where a wrong assertion is worst, so the bar is: real RFC/NIST known-answer vectors, cited.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Each hash fn has ≥3 known-answer vectors + an edge case | `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` | `node --test src/lib/tests/` green; vectors cited from RFC/NIST; covers `""`, `"abc"`, the fox pangram, a multi-block input, a unicode string |
| hmac uses RFC 4231/2202 vectors | same file | key+msg→mac cases incl. empty key, key > block size, empty message |
| crc32 not duplicated | — | handoff states crc32 covered in P01, skipped here |
| Suite stays green | existing wiring | `node scripts/test-all.mjs` lib step green; `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Follow the Phase 01/02 pattern (`src/lib/tests/README.md` + existing `*.test.mjs`). FIRST read
`CtByteUtil.mjs` to confirm each fn's INPUT type (`md5(msg)` etc. — string or bytes? does it accept
both?) and OUTPUT encoding (hex string vs byte array), and write the tests against the ACTUAL API.
- `md5`/`sha1`/`sha256`/`sha512`: known-answer vectors for `""`, `"abc"`, the fox pangram, a
  multi-block (>64B for md5/sha1/sha256; >128B for sha512) input, and a unicode/multi-byte string.
  Cite each vector's source (RFC 1321 / FIPS 180 / common published digests) in a comment.
- `hmac(hashName, keyBytes, msgBytes)`: RFC 4231 (SHA-2) / RFC 2202 (MD5/SHA1) vectors for the supported
  hash(es); empty key, key longer than block size, empty message. Note hmac takes BYTE arrays — convert
  keys/messages from the RFC hex/ascii accordingly.
- Test both string and Uint8Array inputs where the API accepts both. Determinism: same input → same digest.
PORT/adapt vectors from the dev origin tests (`../claude-tools-dev/src/tools/{hasher,favicon-kit,apng-maker}/
tests/unit/`) where they exist. If a digest MISMATCHES a known vector, that is a REAL BUG — STOP and
surface it loudly in the handoff; do NOT adjust the expected value to match the code.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/`, `node scripts/test-all.mjs`,
`node scripts/build-all.mjs --check`. Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p03-ctbyteutil-hashing/PRD.md` — scope/DoD (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar (known-answer vectors cited).
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — harness conventions + crc32-ownership note.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` — the pattern to copy.
- `src/lib/utils/CtByteUtil.mjs` — the module under test (confirm input/output encodings FIRST).
- `../claude-tools-dev/src/tools/hasher/tests/unit/` (`hashes.test.mjs`, `hmac.test.mjs`) — origin vectors to port.

## Deliverables
- `src/lib/tests/unit/CtByteUtil.hashing.test.mjs`.
- `findings/HANDOFF.md` — fns covered + vector sources, the crc32-skip note, test count, the three
  command outputs, and any mismatch/suspected bug surfaced loudly.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. A digest mismatch is STOP-and-surface, never a
  weakened test and never a lib edit.
- Write only `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm the lib step + build-all are green, list fns covered + vector sources,
confirm crc32 was skipped (P01 owns it), and flag any mismatch. Write it all to `findings/HANDOFF.md`.
