<!-- tpm-workflow-spawn phase="dev/20261003-library-test/06-ctziputil" role="builder" -->
You are a BUILDER subagent — 06-ctziputil, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/06-ctziputil`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtZipUtil.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/06-ctziputil/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/06-ctziputil/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/06-ctziputil/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p06-ctziputil/PRD.md` — the full scope spec (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `src/lib/tests/README.md` + an existing `src/lib/tests/unit/*.test.mjs` — the pattern to COPY.
- `src/lib/utils/CtZipUtil.mjs` — the module under test. Confirm the header layout + offsets it emits FIRST.
- `src/lib/utils/CtByteUtil.mjs` — `crc32` (cross-check header CRCs against it).
- `../claude-tools-dev/src/tools/{favicon-kit,tile-cutter,sprite-packer,srcset-builder}/tests/unit/zip.test.mjs` — origin zip tests to PORT (read-only; keep the byte-level asserts).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtZipUtil.test.mjs`, zero-dep (`node:test` + `node:assert/strict`; `node:zlib`
is fine if you use it for a round-trip), importing directly from `../../utils/CtZipUtil.mjs`. ACTUAL API:
`u16le(view, offset, value)` / `u32le(view, offset, value)` WRITE little-endian into a `DataView` at
`offset` (they do NOT return bytes); `storeZip(files)` takes `[{name, bytes}]` → `Uint8Array` STORE zip.
- `u16le`/`u32le`: write into a DataView, assert exact LE bytes (e.g. `u32le(v,0,0x04034b50)` → `50 4b 03 04`),
  neighbors untouched, boundary values (0, 1, 0xFF, 0xFFFF, 0xFFFFFFFF, mid).
- `storeZip`: assert the PK signatures (local `PK\x03\x04`=0x04034b50, central `PK\x01\x02`, EOCD `PK\x05\x06`),
  entry count in EOCD, filenames + contents present, per-entry CRC == `crc32(content)` (import crc32 and
  cross-check), sizes/offsets. Cover single/multiple/empty-file/empty-archive/binary/unicode-filename.
- Prove validity: round-trip the output (parse the central directory to extract entries, or unzip) and
  assert each entry equals the input. State which approach.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new CtZipUtil tests (report the count).
- `node scripts/build-all.mjs --check` → 10/10. (Leave the full `test-all` sweep to the verifier.)
- `findings/HANDOFF.md` has the coverage inventory, the count, the round-trip approach used, and any surprise.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. A genuine bug is STOP-and-surface (loud in the handoff),
  never a weakened test and never a lib edit.
- Write ONLY `src/lib/tests/unit/CtZipUtil.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtZipUtil.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/06-ctziputil/findings/HANDOFF.md`). End your final report with a terse status:
what landed, what (if anything) is blocked, and the repro commands.