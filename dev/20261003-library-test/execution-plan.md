# Library unit-test epic — execution plan

**Date:** 2026-10-03 · **Ledger:** #1013 (add unit-test coverage for `src/lib`) · **Slug:** library-test
**Altitude:** high-level multi-phase punchlist of the ship rounds to run. Each `pNN-<slug>/PRD.md`
is the scope spec (mini-PRD) for one round. This file is the shared contract + run instructions.

> **Why this epic:** the shared `ct` lib (`src/lib/utils`, `src/lib/formats`, `src/lib/image`) has
> ZERO direct unit tests (confirmed in #1008: no test imports `src/lib/*`). It's exercised only
> indirectly via the 9 tools' e2e. This epic adds a real, run-with-the-suite unit-test layer for the
> lib's pure logic — plus the test **harness** that hosts it.

---

## Operating principles (read first — they shape every round)

- **Serial, quality over parallelism.** One phase at a time, in order. NEVER run phases in parallel.
  Expediency is explicitly NOT a goal — coverage quality is. Finish + verify a phase before the next.
- **Scope sizing is a judgment call per round.** Each round is ONE `ship` team (1 builder + 1
  verifier). Keep each team's surface small enough to deliver *thorough* coverage, not rushed breadth.
  The phase split below already does this: the big format engines (Markdown, Pretty, Format, Curl) each
  get their OWN round; small modules get a small round. If a builder finds its module is bigger than it
  looks, it should STOP and surface a split rather than deliver thin coverage.
- **Models:** sonnet builders + sonnet verifiers (same as the lib-cleanup epic). verify↔bug-fixer loop
  cap 2, then surface a blocker.
- **Test-only epic — do NOT modify lib source.** If a test reveals a real bug in the lib, STOP and
  surface it (open a ticket / raise to user). NEVER weaken a test to make it pass, and NEVER edit the
  lib to make a test pass — a green you caused that way is worthless.
- **No commits** (workers never commit; the user commits). `rm`/`git` stay blocked.

## Quality bar for the tests themselves (the point of the epic)

Coverage must be MEANINGFUL, not asserts-that-can't-fail. Per module:
- **Known-answer vectors** where a standard exists: RFC/NIST test vectors for md5/sha*/hmac; known CRC-32
  values; canonical base64/hex pairs. Cite the source in a comment.
- **Round-trip / property tests** where applicable: `decode(encode(x)) === x`; `unescape(escape(x)) === x`
  for every escaper context; parse→serialize→parse stability for formats.
- **Edge cases, deliberately:** empty input, unicode / multi-byte, large input, boundary values
  (0, 1, max), malformed input (how does it fail — throw vs coerce?), whitespace, CRLF vs LF.
- **Determinism:** same input → same output (important for formatBytes, makeId shape, PDF/GIF byte output).
- Every EXPORTED function of the target module gets at least one meaningful test, OR is explicitly
  listed as "deferred to e2e / not unit-testable" with the reason. The verifier checks this inventory.

## Harness conventions (established in Phase 01, then reused)

- **Location:** `src/lib/tests/unit/` (new), one `*.test.mjs` per lib module (e.g.
  `CtByteUtil.test.mjs`), importing the module DIRECTLY (`import { crc32 } from '../../utils/CtByteUtil.mjs'`).
  Mirrors the existing `src/lib/test-support/tests/` precedent.
- **Runner:** `node --test` over `src/lib/tests/` — zero deps (node:test + node:assert/strict), matching
  the repo convention. No new npm dependencies.
- **Suite wiring:** `scripts/test-all.mjs` currently SKIPS `src/lib` (so the new-tool template isn't
  mis-discovered). Phase 01 adds an explicit **lib-unit-test step** to `test-all.mjs` (and/or a
  `test:lib` npm script) so `node scripts/test-all.mjs` runs the lib tests alongside the tools. This is
  the ONE sanctioned `scripts/` edit of the epic (Phase 01 only).
- **DOM / timers:** pure-logic modules need no DOM. For the few functions that touch DOM, timers, or
  canvas, use node fake-timers / minimal stubs where cheap, else mark them e2e-deferred. The DOM-only
  **components** (`CtConfirm`, `CtModal`, `CtClipboardUtil`, `CtLicense`, `CtComponents`) are OUT OF
  SCOPE for this epic — they stay covered by the tools' Playwright e2e.
- **Origin tests to mine:** the dev repo `../claude-tools-dev` has tool-level unit tests that exercise
  logic now living in the ct lib — PORT / ADAPT these rather than writing from scratch where they exist.
  Known ones: `src/tools/hasher/tests/unit/crc32.test.mjs`, `favicon-kit|apng-maker/.../crc32.test.mjs`,
  `favicon-kit|tile-cutter|sprite-packer|srcset-builder/.../zip.test.mjs`, `dither-studio/.../png.test.mjs`,
  `apng-maker/.../assemble.test.mjs`, `image-metadata/.../walkers.test.mjs`, `audio-converter/.../dsp.test.mjs`.
  Each PRD names the relevant ones. (Adapt imports to the ct module paths; keep the vectors.)

## Gate (every round's definition of done)

- The module's new `*.test.mjs` runs green under `node --test` (report the count).
- The new lib-test step in `test-all.mjs` picks them up; `node scripts/test-all.mjs` stays green.
- `node scripts/build-all.mjs --check` stays **10/10** (tests don't touch builds — this just proves no
  accidental source edit).
- Coverage inventory in the handoff: every exported fn of the target → tested | e2e-deferred (reason).
- Verifier independently re-runs the tests AND reviews coverage QUALITY (vectors real? round-trips
  present? edge cases? no can't-fail asserts?), not just green/red.

---

## Phase map (run top-to-bottom, serial)

| # | Folder | Target(s) | Rough size | Notes |
|---|--------|-----------|-----------|-------|
| 01 | `p01-harness` | Harness + wiring + **exemplar** (`CtByteUtil.crc32`) | **first — blocks all** | establishes location, runner, test-all wiring, and the reference test pattern |
| 02 | `p02-ctutil-pure` | `CtUtil` pure fns (clamp/num/clampInt/escapeHtml/escapeAttr/slugify/wrapText) | small-med | DOM/timer fns of CtUtil deferred (see PRD) |
| 03 | `p03-ctbyteutil-hashing` | `CtByteUtil` md5/sha1/sha256/sha512/hmac (+ crc32 if not finished in 01) | med-high | RFC/NIST vectors; port dev crc32 tests |
| 04 | `p04-ctbyteutil-encoding` | `CtByteUtil` base64/base64url/hex/utf8 + formatBytes + getRandomBytes/makeId | medium | round-trip + known pairs |
| 05 | `p05-ctdatetimeutil` | `CtDateTimeUtil` (formatDuration/humanizeDuration + class methods) | med-high | intricate; many edge cases |
| 06 | `p06-ctziputil` | `CtZipUtil` (u16le/u32le/storeZip) | small | byte-level; port dev zip tests |
| 07 | `p07-ctescaper` | `CtEscaper` (~20 escape/unescape context pairs + CONTEXTS/nest) | med-high | round-trip identity per context |
| 08 | `p08-ctdiff` | `CtDiff` (Myers diff: line/word/unified) | medium | own round |
| 09 | `p09-ctmarkdown` | `CtMarkdown` (MD→HTML) | high | own round |
| 10 | `p10-ctpretty` | `CtPretty` (pretty-print/minify, 6 languages) | very high | heaviest; may split per-language — builder's call |
| 11 | `p11-ctformat` | `CtFormat` (structured-data conversion) | high | own round |
| 12 | `p12-ctcurl` | `CtCurl` (curl/wget parse + request model) | high | own round |
| 13 | `p13-image-pure` | `CtDither` (all) + `CtImagesToPdf` (bytes) + `CtImageUtil` pure helpers | med-high | canvas/video runtime deferred to e2e (see PRD) |

**Explicitly OUT of scope (stay e2e-covered):** `src/lib/components/*` (DOM), `CtCanvasCapture`,
`CtVideoGif`, and the canvas/DOM parts of `CtImageUtil`. `src/lib/test-support/*` already has its own
tests. `src/lib/new-tool-template/*` is a template, not shipped logic.

---

## How the next session runs this (step-by-step)

You can clear this session's context; everything needed is in this folder. In a fresh session:

1. Boot: `/claude-tpm:tpm-session open` (reads the prior handoff).
2. Init the epic once: `npx tpm workflow epic-init dev/20261003-library-test`.
3. For EACH phase folder `pNN-<slug>/` IN ORDER (01→13):
   a. `/tpm-workflow plan` for a **`ship`** round, sonnet, serial — use that phase's `PRD.md` as the
      scope/DoD source when filling `plan.md`. (tpm-workflow's `add-phase` will create its own
      `NN-<slug>/` round folder under this epic; copy the PRD's scope into that round's `plan.md`.)
   b. Walk **Gate A** (pre-task roster) → scaffold; then compose + lint the builder & verifier prompts
      (reuse the lib-cleanup spawn-prompt shape — the methodology chain, env ritual, working-folder, the
      per-round scope from the PRD, the quality bar above).
   c. Walk **Gate B** (explicit "go") → spawn the builder; on PASS, spawn the verifier; run the
      verify↔bug-fixer loop (cap 2) only on FAIL.
   d. Reconcile: log the PASS, note coverage counts, move to the next phase.
4. After Phase 13: full sweep — `node scripts/test-all.mjs` green incl. the lib tests; `build-all
   --check` 10/10; update #1013 subtasks; close the epic.

**Autonomy note for the next session:** the user prefers serial ship rounds and quality over speed; it's
fine to drive the rounds autonomously round-to-round (pausing only on a blocker 2 fix-rounds can't fix,
or a real lib bug a test surfaces) — but that is the NEXT session's call to confirm with the user at its
Gate B, not pre-authorized here.

## Cross-references
- #1013 (this epic's ledger task) · #1008 lib-cleanup epic (`dev/20261002-lib-cleanup/`) which produced
  the ct lib + its decisions.md (recipe, module inventory).
- `../claude-tools-dev` — origin tests to port (paths per-PRD).
