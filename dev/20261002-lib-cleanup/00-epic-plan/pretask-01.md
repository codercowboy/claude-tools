# Pre-task receipt 01 — Phase 3a: ESM-inlining in build-tool.mjs

**Date:** 2026-10-02
**Round:** Phase 3a of #1008 — teach `scripts/build-tool.mjs` to inline ES modules.

## Roster presented (Gate A)

Serial, 1 each — model folded to **sonnet** (config default opus) per the user's original ask:

```
planning      · charter: planning      · sonnet · retry 1
builder       · charter: shipping      · sonnet · retry 5
test-writer   · charter: test-writer   · sonnet · retry 1
verifier      · charter: verifier      · sonnet · retry 1
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 5
```

(= the `full` team minus documentarian: internal build change, documented via code comments + plan.)

## Definition of done (triples)

| Claim | Artifact | Check |
|---|---|---|
| Builder inlines an ESM module (strip named/default export, resolve internal relative imports e.g. JbcZipUtil→JbcByteUtil) | scripts/build-tool.mjs | unit test: feed a .mjs w/ named exports + internal import; output has no export/import, dep inlined |
| Includes resolve across the new split | scripts/build-tool.mjs | unit tests cover utils/, components/, components/styles/ |
| Existing 9 tools still byte-identical (ADDITIVE) | all src/tools/* + src/gallery index.html | `node scripts/build-all.mjs --check` → 10/10 up to date, 0 failed |
| Inliner has its own test suite | scripts/tests/*.test.mjs (new) | `node --test` green |
| No tool ported yet | working tree | only scripts/ touched; no src/tools/* or src/lib/* edits |

## Paths

- read-only: src/lib/utils/*.mjs, src/lib/components/*.mjs (+ styles/), dev/20261002-lib-cleanup/includes-diff.md
- write: scripts/build-tool.mjs (extend), scripts/tests/ (new) — additive only

## Advanced (defaulted)

time 2h · scope task-folder (scripts/ + epic dir) · retries builder 5 / verify-loop 5 / others 1

## User response (quoted)

> "Add a planner" — (AskUserQuestion Gate A selection) prepend a planning agent (sonnet) before the
> builder for an extra design pass on the risky inliner, then the rest as drafted.

**Accepted:** add a planner (all else as drafted — sonnet models, DoD + paths as above)
