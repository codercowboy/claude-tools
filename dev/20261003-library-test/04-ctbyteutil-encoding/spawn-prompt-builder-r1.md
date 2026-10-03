<!-- tpm-workflow-spawn phase="dev/20261003-library-test/04-ctbyteutil-encoding" role="builder" -->
You are a BUILDER subagent — 04-ctbyteutil-encoding, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/04-ctbyteutil-encoding`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtByteUtil.encoding.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/04-ctbyteutil-encoding/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/04-ctbyteutil-encoding/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/04-ctbyteutil-encoding/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p04-ctbyteutil-encoding/PRD.md` — the full scope spec (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — harness location + conventions.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` — the pattern to COPY.
- `src/lib/utils/CtByteUtil.mjs` — the module under test. Confirm each fn's signature + output form FIRST (esp. `formatBytes` opts: `units`/`byteUnit`/`sep`/`invalid`/decimals; whether `base64UrlToBytes` also accepts standard base64).
- The base64-tool's own unit tests (look under `src/tools/base64*/tests/` or `../claude-tools-dev/src/tools/base64*`) — the formatBytes NEW-format reference.

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtByteUtil.encoding.test.mjs`, zero-dep (`node:test` + `node:assert/strict`),
importing directly from `../../utils/CtByteUtil.mjs`. Cover `bytesToBase64` · `base64UrlToBytes` ·
`utf8ToBase64` · `textToBytes` · `bytesToHex` · `formatBytes` · `getRandomBytes` · `makeId`
(+ the `CtByteUtil` aggregator if cheap). Do NOT re-cover hashing (P03) or crc32 (P01).
- Encoders: canonical known pairs + round-trips (`base64UrlToBytes(bytesToBase64(x))===x` where the API
  round-trips) + base64url vs standard (`-_` vs `+/`, padding) + empty / 1-2-3-byte padding boundaries /
  binary (0x00/0xFF) / unicode via `utf8ToBase64`.
- `textToBytes`: ASCII, unicode/multi-byte (emoji, combining chars), empty; round-trip with a bytes→text path if one exists.
- `bytesToHex`: known pairs, empty, 0x00/0xFF, lowercase, 2 chars/byte length.
- `formatBytes`: the #1008 NEW format — `0`→"0 B", `1023`→"1023 B", `1024`→"1.0 KB", `1536`→"1.5 KB",
  MB/GB tiers, cap at GB; negative + Infinity/NaN handling; determinism; any opts. Do NOT use the old compact format.
- `getRandomBytes(n)`: Uint8Array of length n incl n=0, distinct across calls. `makeId()`: "s_"+16hex shape, unique across calls.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new encoding tests (report the count).
- `node scripts/test-all.mjs` lib step stays green; `node scripts/build-all.mjs --check` → 10/10.
- `findings/HANDOFF.md` lists the coverage inventory for these exports, the count, the #1008-formatBytes trace, and any surprise.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. CHARACTERIZE actual behavior; a genuine bug is
  STOP-and-surface (loud in the handoff), never a weakened test and never a lib edit.
- Write ONLY `src/lib/tests/unit/CtByteUtil.encoding.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtByteUtil.encoding.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/04-ctbyteutil-encoding/findings/HANDOFF.md`). End your final report with a
terse status: what landed, what's deferred, what (if anything) is blocked, and the repro commands.