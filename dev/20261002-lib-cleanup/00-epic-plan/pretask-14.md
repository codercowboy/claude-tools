# Pre-task receipt — Phase 3f Round B (retire jbc-include-old + toolchain/README cleanup + full sweep)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B) + user explicitly chose "Split into two rounds" for Phase 3f. This is Round B (the retire + cleanup). It touches shared `scripts/` — approved as part of that choice.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Finish the epic: retire the legacy lib and clean the toolchain. Preconditions already true: all 10 build targets ported; ZERO `<<ct:include>>` remain anywhere (confirmed).
1. **Retire** `src/lib/jbc-include-old/` → `tmp/safe-to-delete/` (via `mkdir -p tmp/safe-to-delete && mv …` — rm/git are blocked). After the move, `src/lib/jbc-include-old` must NOT exist.
2. **Clean the toolchain honesty** in `scripts/build-tool.mjs` (resolveIncludeDir default + comment, lines ~51/88) and `scripts/slice-tool.mjs` (comment line ~11): the flat `<<ct:include>>` mechanism is now UNUSED (nothing references it). Either remove the dead `jbc-include-old` candidate/path or clearly mark the mechanism legacy and drop the stale `jbc-include-old` reference — builder's judgment. MUST NOT break `build-all --check` (10/10 must still hold). Do NOT rip out unrelated build-tool behavior.
3. **#1011:** update `scripts/README.md` to describe the current claude-tools layout (it still describes the old jason-code layout). Factual accuracy only — the broader doc-writing is the separate #1001 epic. (Note, don't fix, any stale `jbc-include`/`jason-code` mentions in `docs/technical.md` — out of scope here.)
4. **Full green sweep:** `node scripts/build-all.mjs --check` → 10/10; `node scripts/test-all.mjs` (full suite) green; `grep -rnE "jbc-include|jbcUtil|jbcCrc32|ctCopy\b|ctFlash\b|ctConfirm\b" src/tools src/gallery scripts` → no live-code matches (historical comments/PROVENANCE excepted and reported); confirm `src/lib/jbc-include-old` gone and present under `tmp/safe-to-delete/`.

## Paths
- in (read): epic decisions.md, tooling-diff.md/includes-diff.md (context), the current scripts/
- out (write): MOVE `src/lib/jbc-include-old` → `tmp/safe-to-delete/`; edit `scripts/build-tool.mjs`, `scripts/slice-tool.mjs`, `scripts/README.md`. (Wider than a per-tool round, by design.)

## Advanced
time 2h · scope: the retire + scripts/ cleanup + README · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B) + user "Split into two rounds"
