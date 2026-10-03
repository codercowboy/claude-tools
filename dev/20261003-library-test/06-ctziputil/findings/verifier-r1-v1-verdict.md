# Verifier r1 v1 — 06-ctziputil — VERDICT: PASS

## DoD evidence
1. Re-run green: `node --test src/lib/tests/` -> tests 239, pass 239, fail 0, skipped 0 (new file alone: 29/29, 0 skipped, so the `unzip` test ran). `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." `node scripts/test-all.mjs` (my run) -> 10/10 suites passed, exit 0. A pre-existing log in the tmp area showed 8/10 (color-designer + color-picker e2e failing) from an earlier run; they passed in my run, so those e2e failures are flaky/unrelated (browser e2e only, not the lib; same class as #1012). Nothing in this round touches them.
2. LE assertions are exact byte strings (`hex()` compare, e.g. `'55 55 ef be ad de 55 55'`), with neighbors-untouched, 2/4-byte occupancy, boundaries 0/1/0xFF/0x100/0xFFFF/0xFFFFFFFF/0x80000000/mid. PK signatures asserted by bytes. storeZip: all three sigs, EOCD count x2/cd size/offset/comment, every local + central header field, per-entry CRC vs `crc32` (+ 0xCBF43926 vector), sizes/offsets, total-length formula, central records tile to EOCD.
3. Round-trip is real: independent test-side parser (EOCD -> central dir -> local offset -> slice) compares to input; plus real `unzip -t` / `unzip -p`. unzip test is skip-guarded on `unzip -v`, but it ran (skipped=0); it would only be hollow on machines without unzip (parser round-trip still covers).
4. My own independent zip (3 entries: text, 300B binary with unicode name `d/ü.bin`, empty): `unzip -l` lists 3 files, `unzip -t` "No errors detected", `unzip -p` returns content; python `zipfile.testzip()` -> None, compress_type 0 for all. Genuinely valid. (unzip prints the unicode name mangled: no UTF-8 flag bit 11 is set by the module; cosmetic, noted below.)
5. No lib source modified by this round: `CtZipUtil.mjs` mtime Oct 2 21:51 (unchanged vs. before round; CtByteUtil.mjs has Oct 3 mtime from earlier phases, not this one, and crc32 tests pass). Only `CtZipUtil.test.mjs` is new for this round. `git` blocked; relied on build-all 10/10 + mtimes. Weaker than a diff; stated honestly.

## Mutation spot-check (scratch copy; real file untouched), 36 mutants against the new test file
KILLED (suite red): all three PK signatures; u16/u32 LE->BE; local CRC 0; central CRC+1; central local-header offset; EOCD count (both fields), cd offset, cd size; local & central compressed/uncompressed sizes (central usize mutant made the parser loop/crash after ~18s — detected, but loudly); local/central method; local/central version; local/central name length; local time; local/central flags; EOCD disk & comment len; name encoded latin1; CRC computed over name.
SURVIVED (suite stays green):
- `value >>> 0` removed in u32le and `& 0xffff` removed in u16le: equivalent mutants (DataView setters wrap modulo anyway). Not a test gap.
- Central `external attrs` (u32 at 38), `internal attrs` (u16 at 36), `disk number start` (u16 at 34) set non-zero: NOT asserted. Real (minor) gap.
- `new Uint8Array(f.bytes)` coercion removed: equivalent for plain arrays (crc32/set accept arrays), so the "plain array" test cannot distinguish. Minor.

## Coverage-quality concerns (not FAILs)
- Unasserted central fields: disk-start (34), internal attrs (36), external attrs (38); central flags (8) and time/date (12/14) only partly. Trivial to add.
- unzip test skips silently via `t.skip` on machines without unzip; acceptable (parser round-trip remains).
- No UTF-8 flag (bit 11) set for unicode names by the module: unzip shows mangled name (`d/++.bin`), python decodes as cp437. Module behaviour, not a test defect; a note that the unicode test asserts raw UTF-8 bytes only. Real-world consumers may mis-render non-ASCII names.
- Zip64 / >4GiB / >65535 entries unhandled and untested; module doesn't claim it. Acceptable stated gap.
- 'signature scan' test is exact only because payloads are signature-free (comment says so).

## Reproduction
```
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
node <scratchpad>/mut.mjs   # mutation harness (scratch copy in scratchpad/mut)
node <scratchpad>/mk.mjs <out.zip>; unzip -l/-t/-p <out.zip>; python3 zipfile.testzip
find src/lib -type f -newermt '2026-10-03 00:00'
```

**PASS** — suite is green (239/239, 10/10 build, 10/10 test-all), byte-level rigor is genuine (30 of 36 mutants killed, survivors are equivalent or trivial unasserted zero-fields), round-trip is independent plus real unzip, output verified valid by unzip and python, no CtZipUtil source change.
