# HANDOFF — 06-ctziputil r1 (builder)

Landed: `src/lib/tests/unit/CtZipUtil.test.mjs` (only product file). No src/lib touched.

## Gate
- `node --test src/lib/tests/` -> 239 tests, 239 pass, 0 fail, 0 skipped (includes new file).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- New file alone: 29 tests, all pass.

## Coverage inventory
- u16le/u32le (9): LE bytes at offset, neighbors untouched, boundaries (0,1,0xFF,0x100,0xFFFF,0xFFFFFFFF,0x80000000,mid), masking/wrap (>16/>32 bits, negative), PK sigs (50 4b 03 04 etc.), return undefined.
- storeZip structure: local sig, EOCD (22 bytes, count x2, cd size/offset, zero comment), signature-scan counts, every local header field (version/flags/method/time/date/crc/sizes/name len/extra/name), every central field + offsets, total length formula, crc32 cross-check (local + central, and 0xCBF43926 vector), determinism.
- Edge cases: single, multiple (order), empty file (crc 0), empty archive (exactly 22 bytes), binary 1024B with embedded PK bytes, plain-array bytes, unicode filename (UTF-8 byte length), directory names, 70 KB payload offsets.

## Round-trip approach
Both: (a) independent test-side parser (EOCD -> central dir -> local offset -> slice) asserting entries equal input; (b) real `unzip -t` / `unzip -p` on a temp file (auto-skips if `unzip` absent; it ran here).

## Surprises / bugs
None. Note: storeZip accepts non-Uint8Array `bytes` via `new Uint8Array(...)` (tested with plain array). No 64-bit/zip64 handling (sizes >4GiB unsupported) — untested, out of scope.

## Repro
`node --test src/lib/tests/` ; `node scripts/build-all.mjs --check`
