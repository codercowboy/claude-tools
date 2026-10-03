# Plan — 04-ctbyteutil-encoding

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Unit-test the ENCODING / id / formatBytes functions of `src/lib/utils/CtByteUtil.mjs`:
`bytesToBase64` · `base64UrlToBytes` · `utf8ToBase64` · `textToBytes` · `bytesToHex` · `formatBytes` ·
`getRandomBytes` · `makeId` (+ the `CtByteUtil` aggregator if cheap). Hashing (P03) and crc32 (P01) are
done — do NOT re-cover. Full scope spec: `dev/20261003-library-test/p04-ctbyteutil-encoding/PRD.md`.
`formatBytes` expectations MUST match the #1008-approved NEW format (units KB/MB/GB, 1 decimal + space,
cap at GB) — NOT the old compact format.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Encoders tested with known pairs + round-trips + edge cases | `src/lib/tests/unit/CtByteUtil.encoding.test.mjs` | `node --test src/lib/tests/` green; base64/base64url/hex/utf8 canonical pairs, padding boundaries (0/1/2/3 byte), binary (0x00/0xFF), unicode |
| formatBytes matches #1008 NEW format | same file | `0`→"0 B", `1023`→"1023 B", `1024`→"1.0 KB", `1536`→"1.5 KB", MB/GB tiers, cap at GB; negative/non-finite handling; determinism |
| ids tested | same file | `getRandomBytes(n)` → Uint8Array len n (incl n=0), distinct across calls; `makeId()` → "s_"+16hex shape, unique across calls |
| Suite stays green | existing wiring | `node scripts/test-all.mjs` lib step green; `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Follow the P01–P03 pattern. Read `CtByteUtil.mjs` to confirm each fn's exact signature + output form
FIRST (e.g. does `base64UrlToBytes` accept standard base64 too? what are `formatBytes` opts: `units`,
`byteUnit`, `sep`, `invalid`, decimals?). Then:
- Encoders: canonical known pairs (e.g. "Man"→"TWFu", `[0x00]`→"AA=="); round-trip
  `base64UrlToBytes(bytesToBase64(x)) === x` where the API round-trips; base64url vs standard (`-_` vs
  `+/`, padding); empty, 1/2/3-byte padding boundaries, binary bytes, unicode via `utf8ToBase64`.
- `textToBytes`: ASCII, unicode/multi-byte (emoji, combining chars), empty; round-trip with a bytes→text
  path if one exists.
- `bytesToHex`: known pairs, empty, 0x00/0xFF, lowercase, 2 chars/byte length.
- `formatBytes`: the NEW-format cases above; probe negative + Infinity/NaN; any opts that change
  decimals/sep/units. Determinism (same input → same output). Expectations trace to #1008 decisions
  (the base64-tool's own unit tests are a reference — mine them).
- `getRandomBytes` / `makeId`: shape/length + uniqueness (NOT statistical randomness).
CHARACTERIZE actual behavior; a genuine bug is STOP-and-surface, never a lib edit or weakened test.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/`, `node scripts/test-all.mjs`,
`node scripts/build-all.mjs --check`. Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p04-ctbyteutil-encoding/PRD.md` — scope/DoD (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — harness conventions.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` — the pattern to copy.
- `src/lib/utils/CtByteUtil.mjs` — the module under test (confirm signatures + formatBytes opts FIRST).
- The base64-tool's unit tests (under `src/tools/base64*` or `../claude-tools-dev`) — formatBytes NEW-format reference.

## Deliverables
- `src/lib/tests/unit/CtByteUtil.encoding.test.mjs`.
- `findings/HANDOFF.md` — coverage inventory for these exports, test count, the three command outputs,
  the note that formatBytes expectations trace to #1008, and any surprise/suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Use the #1008 NEW formatBytes format (not old compact).
- Write only `src/lib/tests/unit/CtByteUtil.encoding.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm lib step + build-all green, give the coverage inventory, note the #1008
formatBytes trace, and flag any surprise. Write it all to `findings/HANDOFF.md`.
