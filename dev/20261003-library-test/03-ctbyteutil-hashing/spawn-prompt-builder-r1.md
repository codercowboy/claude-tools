<!-- tpm-workflow-spawn phase="dev/20261003-library-test/03-ctbyteutil-hashing" role="builder" -->
You are a BUILDER subagent — 03-ctbyteutil-hashing, round r1 (library-test epic, #1013).

Deliver the artifact described in `plan.md` to the bar set by `charter-builder.md`. You ship working, reproducible tests — not a survey. If you stop, stop LOUDLY with full context.

Working folder (write ONLY inside here; the path contains spaces — always quote it):
`/Volumes/My Shared Files/claude/tools-workspace/claude-tools/dev/20261003-library-test/03-ctbyteutil-hashing`

Your write boundary is that folder PLUS the one product path named in `plan.md`: the new `src/lib/tests/unit/CtByteUtil.hashing.test.mjs`. You do NOT touch sibling phase folders, `00-epic-plan/`, any `src/lib` source, or the test-all wiring.

Step zero — source your env in ONE bash call (cd to the project root first; the path has spaces):
```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools" && source "dev/20261003-library-test/03-ctbyteutil-hashing/tmp/subagent.env" 2>/dev/null || true
```

Read, in order (fetch each methodology doc with `npx tpm doc <path>` from the project root):
1. `dev/20261003-library-test/03-ctbyteutil-hashing/charter-builder.md` — your posture / definition of done. READ FIRST.
2. `npx tpm doc claude-context/methodology/project-workspace.md` — read/write boundaries + naming.
3. `npx tpm doc claude-context/methodology/shared-conventions.md` — findings-doc format, terse-by-default, resumption, reading heuristics.
4. `npx tpm doc claude-context/methodology/subagent/handbook.md` — how you operate as a subagent: step-zero env ritual, what you own, how you report.
5. `npx tpm doc claude-context/methodology/tool-conventions.md` — copy-then-modify, no-hardcoded-paths, tool-feedback formats.
6. `npx tpm doc claude-context/methodology/troubleshooting.md` — what to try before declaring a dead end + disaster recovery.
7. `npx tpm doc claude-context/methodology/verification.md` — the reproducibility bar your tests must clear.
8. `dev/20261003-library-test/03-ctbyteutil-hashing/plan.md` — your round's authoritative brief. Read it LAST.

Curated context (token-scoped — read these, not the whole repo):
- `dev/20261003-library-test/p03-ctbyteutil-hashing/PRD.md` — the full scope spec (read fully).
- `dev/20261003-library-test/execution-plan.md` §"Quality bar for the tests" — authoritative (real known-answer vectors, cited).
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — the harness location + conventions + the crc32-ownership note (crc32 is DONE in P01).
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` — the pattern to COPY.
- `src/lib/utils/CtByteUtil.mjs` — the module under test. Read the hashing fns FIRST to confirm input type (string vs bytes) + output encoding (hex vs byte array).
- `../claude-tools-dev/src/tools/hasher/tests/unit/` (`hashes.test.mjs`, `hmac.test.mjs`) — origin vectors to PORT (read-only; adapt imports, keep the vectors).

Model: sonnet.

TASK CONTEXT (this round's specifics):
Author `src/lib/tests/unit/CtByteUtil.hashing.test.mjs`, zero-dep (`node:test` + `node:assert/strict`),
importing directly from `../../utils/CtByteUtil.mjs`. Cover `md5` · `sha1` · `sha256` · `sha512` · `hmac`
with REAL KNOWN-ANSWER vectors from RFCs/NIST, cited in comments. SKIP crc32/crc32Hex (owned by Phase 01
— note the skip). Per hash fn: ≥3 known-answer vectors (at minimum `""`, `"abc"`, the fox pangram) plus a
multi-block input (>64B for md5/sha1/sha256; >128B for sha512) and a unicode/multi-byte string. For `hmac`
(signature `hmac(hashName, keyBytes, msgBytes)` — BYTE arrays): RFC 4231 (SHA-2) / RFC 2202 (MD5/SHA1)
vectors incl. empty key, key > block size, empty message. Test both string and Uint8Array inputs where the
API accepts both; assert determinism (same input → same digest). CONFIRM the actual output encoding and
assert that form.

Gate (your definition of done — all must hold, prove each in the handoff):
- `node --test src/lib/tests/` runs GREEN including the new hashing tests (report the count).
- `node scripts/test-all.mjs` lib step stays green; `node scripts/build-all.mjs --check` → 10/10.
- `findings/HANDOFF.md` lists fns covered + vector sources, the crc32-skip note, the count, and any mismatch.

HARD constraints:
- TEST-ONLY — do NOT modify any `src/lib` source. If a digest MISMATCHES a known-answer vector, that is a
  REAL BUG: STOP and surface it loudly in the handoff. NEVER adjust the expected value to match the code,
  never weaken a test, never edit the lib.
- Write ONLY `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` (+ your handoff). Nothing else.
- No commits; `rm`/`git` stay blocked. Surface the diff — the user commits.

Deliverable: `src/lib/tests/unit/CtByteUtil.hashing.test.mjs` + `findings/HANDOFF.md` (at
`dev/20261003-library-test/03-ctbyteutil-hashing/findings/HANDOFF.md`) with the fns covered, vector
sources, crc32-skip note, count, command outputs, and any mismatch. End your final report with a terse
status: what landed, what's deferred, what (if anything) is blocked, and the repro commands.