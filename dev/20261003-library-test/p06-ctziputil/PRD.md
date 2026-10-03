# PRD — Phase 06 · CtZipUtil

**Round type:** ship, sonnet, serial. **Size:** small. **Depends on:** Phase 01.
**Target:** `src/lib/utils/CtZipUtil.mjs` (111 lines) → `src/lib/tests/unit/CtZipUtil.test.mjs`.

## In scope
- `u16le(n)` / `u32le(n)` — little-endian byte emission: 0, 1, 0xFF/0xFFFF/0xFFFFFFFF, mid values; exact
  byte order + length (2 / 4 bytes).
- `storeZip(entries)` — builds a STORE-method (no compression) zip. Assert the byte structure:
  local-file-header signature `PK\x03\x04` (0x504b0304), central-directory signature `PK\x01\x02`, EOCD
  `PK\x05\x06`; entry count; filenames + contents present; CRC-32 per entry matches `crc32` of the content;
  sizes/offsets. Test: single file, multiple files, empty file, empty archive, binary content, unicode
  filename. A round-trip check is ideal: feed the output to node's `zlib`/a STORE unzip (or verify by
  parsing the central directory) to prove it's a valid archive.

## Approach
- Port/adapt the dev zip tests: `../claude-tools-dev/src/tools/{favicon-kit,tile-cutter,sprite-packer,
  srcset-builder}/tests/unit/zip.test.mjs` — keep their byte-level assertions and vectors.
- Cross-check CRC-32 in headers against `crc32` from CtByteUtil (consistency between the two modules).

## Definition of Done
- `CtZipUtil.test.mjs` green; byte-structure + CRC + multi/empty/binary/unicode cases covered.
- `test-all` + `build-all --check` 10/10 green.
- Handoff: coverage inventory + whether a real unzip round-trip was used.

## Notes
No lib edits. Small module — good quick round, but keep the byte-level assertions rigorous (that's the value).
