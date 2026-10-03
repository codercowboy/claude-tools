# Pre-task receipt 02 — Phase 3b: rename jbc→ct in the new lib (#1009)

**Date:** 2026-10-02
**Round:** Phase 3b of #1008 / #1009 — surgical jbc→ct rename of `src/lib/utils` + `src/lib/components`.

## Roster presented (Gate A) — `ship` team, serial, model folded to sonnet:

```
builder   · charter: shipping  · sonnet · retry 5
verifier  · charter: verifier  · sonnet · retry 1
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 5
```

## Rename spec (surgical — recon-derived)

- `Jbc` → `Ct` (case-sensitive; safe everywhere incl. comments/PROVENANCE)
- `jbcc` → `ctc`; `data-jbc-` → `data-ct-`
- `jbc-` → `ct-` **EXCEPT `jbc-include`** (the legacy `jbc-include-old` dir, retired in 3f — PRESERVE)
- 20 `JbcX.mjs` → `CtX.mjs`, update all internal import specifiers.

## DoD (triples)

| Claim | Artifact | Check |
|---|---|---|
| Lib identity fully renamed per spec | src/lib/utils/** + components/** | grep zero Jbc/jbcc/data-jbc/jbc-(non-include) |
| 20 files renamed + imports updated | the lib | no JbcX.mjs; each util import()s clean |
| 3a tests still green (required ripple) | scripts/tests/esm-inline*.test.mjs | node --test scripts/tests/ → 38/38 |
| Tools unaffected | all index.html | build-all --check → 10/10 |
| Legacy jbc-include-old refs preserved | PROVENANCE.md, JSDoc | jbc-include strings untouched |

## Paths

- write: src/lib/utils/**, src/lib/components/**, scripts/tests/esm-inline*.test.mjs (+ scripts/build-tool.mjs doc-comment examples, cosmetic)
- read-only: src/tools/** (jbc-include-old stays), src/lib/test-support

## Advanced (defaulted)

time 2h · scope lib + test ripple · retries builder 5 / verify-loop 5

## User response (quoted)

> "All defaults — scaffold it" (AskUserQuestion Gate A selection)

**Accepted:** all defaults (ship round, sonnet, surgical rename spec + 3a-test ripple as drafted)
