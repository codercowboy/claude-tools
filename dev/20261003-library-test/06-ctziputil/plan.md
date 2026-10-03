# Plan — 06-ctziputil

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Byte-level unit tests for `src/lib/utils/CtZipUtil.mjs` (small, 111 lines): `u16le` · `u32le` ·
`storeZip`. Small module, but the VALUE is rigorous byte-level assertions. Full scope spec:
`dev/20261003-library-test/p06-ctziputil/PRD.md`.
Actual API (verified): `u16le(view, offset, value)` / `u32le(view, offset, value)` WRITE little-endian
into a `DataView` at `offset` (they do not return bytes); `storeZip(files)` takes `[{name, bytes}]` and
returns a `Uint8Array` STORE-method zip, computing per-entry CRC via `CtByteUtil.crc32`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| u16le/u32le LE emission tested | `src/lib/tests/unit/CtZipUtil.test.mjs` | write into a DataView: 0, 1, 0xFF, 0xFFFF, 0xFFFFFFFF, mid values; assert exact bytes + LE order + they occupy 2/4 bytes at the offset |
| storeZip byte structure tested | same file | local-header sig `PK\x03\x04` (0x04034b50), central-dir `PK\x01\x02`, EOCD `PK\x05\x06`; entry count; filenames + contents present; per-entry CRC == `crc32(content)`; sizes/offsets correct |
| edge cases | same file | single file, multiple files, empty file, empty archive, binary content, unicode filename |
| validity proven | same file | ideally a round-trip: feed output to a STORE unzip (node `zlib` or parse the central directory) to prove it's a valid archive |
| Suite stays green | existing wiring | `node --test src/lib/tests/` green; `node scripts/build-all.mjs --check` 10/10 |
| No lib source touched | — | only the new test file added; build-all 10/10 confirms |

## Task / method
Follow the P01–P05 pattern. Read `CtZipUtil.mjs` to confirm the header layout it emits (offsets/sizes),
then:
- `u16le`/`u32le`: allocate a DataView, write a value at an offset, assert the exact little-endian bytes
  (e.g. `u32le(v,0,0x04034b50)` → bytes `50 4b 03 04`), and that neighbors are untouched; boundary values.
- `storeZip`: assert the three PK signatures at the right places, the entry count in EOCD, each filename +
  content bytes present, each local/central CRC == `crc32(content)` (import `crc32` from CtByteUtil and
  cross-check), and sizes/offsets. Cover single/multi/empty-file/empty-archive/binary/unicode-filename.
- Round-trip: if feasible, unzip the output with node `zlib`/`node:zlib` inflateRaw-not-needed (STORE =
  no compression, so slice by the central directory) OR parse the central directory to extract each entry
  and assert it equals the input. State which approach was used.
PORT/adapt the dev zip tests (`../claude-tools-dev/src/tools/{favicon-kit,tile-cutter,sprite-packer,
srcset-builder}/tests/unit/zip.test.mjs`) — keep their byte-level assertions.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/` and `node scripts/build-all.mjs --check`.
Zero new deps (node:zlib is built-in if used). No MCP.

## Context — folders to read
- `dev/20261003-library-test/p06-ctziputil/PRD.md` — scope/DoD (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar" — the bar.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to copy.
- `src/lib/utils/CtZipUtil.mjs` — the module under test (confirm header layout).
- `src/lib/utils/CtByteUtil.mjs` — `crc32` (cross-check header CRCs against it).
- `../claude-tools-dev/src/tools/{favicon-kit,tile-cutter,sprite-packer,srcset-builder}/tests/unit/zip.test.mjs` — origin vectors to port.

## Deliverables
- `src/lib/tests/unit/CtZipUtil.test.mjs`.
- `findings/HANDOFF.md` — coverage inventory, test count, the command outputs, whether a real unzip
  round-trip was used, and any suspected bug.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. A genuine bug is STOP-and-surface.
- Write only `src/lib/tests/unit/CtZipUtil.test.mjs` (+ the handoff). No other edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
1.5h (small module).

## When done
Report the test count, confirm `node --test src/lib/tests/` + build-all green, give the coverage
inventory, state the round-trip approach, and flag any surprise. Write it to `findings/HANDOFF.md`.
