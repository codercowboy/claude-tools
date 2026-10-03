# Plan — 14-retire-jbc-include-old (Phase 3f, Round B — the capstone)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
The final round of the lib-cleanup epic. All 10 build targets (9 tools + gallery) are ported to the ct
lib and ZERO `<<ct:include>>` remain anywhere — so the legacy `src/lib/jbc-include-old/` is now dead and
can be retired, and the toolchain's stale references to it cleaned. Also closes #1011 (scripts/README).
Wider scope than a per-tool round (it touches shared `scripts/`), per the user's "split into two rounds".

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Legacy lib retired (moved, not deleted) | `src/lib/jbc-include-old/` → `tmp/safe-to-delete/` | `src/lib/jbc-include-old` does NOT exist; `tmp/safe-to-delete/jbc-include-old/` DOES (moved via `mv`; rm/git blocked) |
| Toolchain honest re: the retired dir | `scripts/build-tool.mjs`, `scripts/slice-tool.mjs` | the `jbc-include-old` default/comments (build-tool ~L51/L88, slice-tool ~L11) cleaned — the unused flat `<<ct:include>>` mechanism either removed or clearly marked legacy with no dangling `jbc-include-old` path. `grep -nE "jbc-include-old" scripts/` → no live references |
| scripts/README current (#1011) | `scripts/README.md` | describes the actual claude-tools layout (not the old jason-code layout). Factual + accurate; every claim matches the repo |
| No stragglers | `src/tools`, `src/gallery`, `scripts` | `grep -rnE "jbc-include\|jbcUtil\|jbcCrc32\|ctCopy\b\|ctFlash\b\|ctConfirm\b" src/tools src/gallery scripts` → no LIVE-code matches (historical comments/PROVENANCE excepted + reported) |
| Everything still green | all targets | `node scripts/build-all.mjs --check` → 10/10; `node scripts/test-all.mjs` (full suite) green |

## Task / method
Per the builder's charter. Order: (1) confirm preconditions (no `<<ct:include>>` anywhere); (2) `mkdir -p
tmp/safe-to-delete && mv "src/lib/jbc-include-old" tmp/safe-to-delete/`; (3) clean the `scripts/` references
(builder's judgment: remove the dead `jbc-include-old` candidate/path in `resolveIncludeDir`, or mark the
flat-include mechanism legacy — must keep `build-all --check` 10/10; do NOT touch unrelated build-tool
behavior); (4) rewrite the stale parts of `scripts/README.md` for the current layout (#1011 — factual
only; broader doc work is the separate #1001 epic); (5) run the full sweep. If the `mv` or a cleanup looks
like it might break a build, STOP and surface rather than guessing.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-all.mjs --check` (10/10 gate). `node scripts/test-all.mjs` (full
suite). `mv` for the retire (NO rm/git). Grep for stragglers.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/14-retire-jbc-include-old/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — the full epic decision log (recipe, lib fixes, lessons).
- `dev/20261002-lib-cleanup/execution-plan.md` — the epic roadmap (this is phase 3f).
- `scripts/build-tool.mjs` (resolveIncludeDir ~L85-91 + comment ~L51), `scripts/slice-tool.mjs` (~L11), `scripts/README.md` (the #1011 target), `scripts/test-all.mjs` + `build-all.mjs` (the gates).
- `src/lib/jbc-include-old/` — the dir to move (base.css/confirm.js/controls.css/copy.js/crc32.js/footer.html/gallery.css/license.js/readme-footer.md/util.js).

## Deliverables
- jbc-include-old moved to `tmp/safe-to-delete/`; scripts cleaned; scripts/README updated; all gates green. No commits (the user commits).
- `findings/HANDOFF.md` — the move confirmation, exactly what was cleaned in build-tool/slice-tool (remove vs mark-legacy + why), the scripts/README changes, the straggler-grep result (with any historical exceptions listed), and the full-sweep tallies (build-all --check + test-all). Note docs/technical.md's stale jbc-include mentions as a #1001 follow-up (do not fix here).

## Constraints
- **No `rm`, no `git`** — retire ONLY by moving to `tmp/safe-to-delete/`.
- Keep `build-all --check` at 10/10 and the full `test-all` suite green; Playwright stays serial.
- Scope: the retire + `scripts/build-tool.mjs` + `scripts/slice-tool.mjs` + `scripts/README.md` + the `tmp/safe-to-delete/` move. Do NOT edit tool source, `src/lib/{utils,components}`, `project.json`, or `00-epic-plan/`. If a straggler needs a tool-source edit, STOP and surface it (it would mean a port missed something).
- A red test is STOP-and-surface (no pre-approved deltas this round).

## Time budget
2h.

## When done
`findings/HANDOFF.md` written; jbc-include-old retired; scripts clean + README current; `build-all --check`
10/10; `test-all` green; straggler grep clean. Report 4–6 lines: moved ✓, scripts cleaned (what), README
updated, sweep tallies. State PASS/what-remains. This is the epic's final round.
