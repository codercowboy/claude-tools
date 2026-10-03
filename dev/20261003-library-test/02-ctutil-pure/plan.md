# Plan — 02-ctutil-pure

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Add meaningful unit-test coverage for the PURE functions of `src/lib/utils/CtUtil.mjs`, using the
harness stood up in Phase 01 (`src/lib/tests/unit/`, zero-dep `node:test`). The DOM/BOM/timer functions
are explicitly deferred (they are e2e-covered via the tools). Full scope spec:
`dev/20261003-library-test/p02-ctutil-pure/PRD.md`.

In scope (unit-test these): `clamp` · `num` · `clampInt` · `escapeHtml` · `escapeAttr` · `slugify` ·
`wrapText`. Optional: `debounce` via `node:test` mock timers IF cheap, else defer with a note.
Deferred (DOM/BOM — list in handoff with reason): `downloadBlob` · `el` · `persistState` · `onceFlag` ·
`posAt` · `prefersReducedMotion` · `setupHiDPICanvas` · `restartAnimation`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Pure CtUtil fns are meaningfully tested | `src/lib/tests/unit/CtUtil.test.mjs` | `node --test src/lib/tests/` green; per-fn edge cases present (see Task/method) — no can't-fail asserts |
| Suite stays green | existing wiring | `node scripts/test-all.mjs` lib step green; `node scripts/build-all.mjs --check` 10/10 |
| Coverage inventory complete | `findings/HANDOFF.md` | every CtUtil export → tested \| deferred(reason) |
| No lib source touched | — | only `src/lib/tests/unit/CtUtil.test.mjs` added; build-all 10/10 confirms |

## Task / method
Follow the Phase 01 pattern (`src/lib/tests/README.md` + `CtByteUtil.crc32.test.mjs` as the template).
Per in-scope fn, cover the edge cases the PRD names:
- `clamp(n, lo, hi)` — in-range, below-lo, above-hi, lo===hi, negatives, floats, NaN.
- `num(v, fallback)` — valid number, numeric string, "", null/undefined, "1e2", NaN → fallback.
- `clampInt(v, lo, hi, fallback)` — parseInt semantics; "", "1e2", floats, out-of-range, non-numeric.
- `escapeHtml(s)` / `escapeAttr(s)` — `& < > " '` + attr-specific; empty, unicode, already-escaped, mixed.
- `slugify(str, opts)` — spaces→-, case, punctuation stripping, unicode/diacritics, leading/trailing/
  multiple separators, empty.
- `wrapText(text, maxWidth, measure)` — wrap at width, long unbreakable word, existing newlines, empty,
  width edge (0/1).
CHARACTERIZE actual behavior: if `clampInt`/`num` behaves surprisingly, assert the ACTUAL behavior and
NOTE it in the handoff — do NOT edit the lib. A test that reveals a genuine bug is STOP-and-surface.

## Tools & MCP
Read/Grep/Write + Bash for `node --test src/lib/tests/`, `node scripts/test-all.mjs`,
`node scripts/build-all.mjs --check`. Zero new deps. No MCP.

## Context — folders to read
- `dev/20261003-library-test/p02-ctutil-pure/PRD.md` — scope/DoD (read fully).
- `dev/20261003-library-test/00-epic-plan/epic-plan.md` + `execution-plan.md` §"Quality bar" — the bar.
- `dev/20261003-library-test/01-harness/findings/HANDOFF.md` — the harness location + conventions.
- `src/lib/tests/README.md` + `src/lib/tests/unit/CtByteUtil.crc32.test.mjs` — the pattern to copy.
- `src/lib/utils/CtUtil.mjs` — the module under test (read the in-scope fns' actual implementations).

## Deliverables
- `src/lib/tests/unit/CtUtil.test.mjs` (the tests).
- `findings/HANDOFF.md` — the coverage inventory (every export → tested|deferred+reason), test count,
  the three command outputs, any surprising/characterized behavior, and any suspected lib bug surfaced.

## Constraints
- TEST-ONLY — do NOT modify any `src/lib` source. Characterize actual behavior; surface suspected bugs.
- Write only `src/lib/tests/unit/CtUtil.test.mjs` (+ the handoff). No sibling-folder or `00-epic-plan/` edits.
- No commits; `rm`/`git` blocked. Surface the diff — the user commits.

## Time budget
2h.

## When done
Report the test count, confirm the lib step + build-all are green, give the export-coverage inventory,
and flag any characterized surprise or suspected bug. Write it all to `findings/HANDOFF.md`.
