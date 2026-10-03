# Plan — 13-port-gallery (Phase 3f, Round A)

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation
Phase 3f Round A. Port `src/gallery` — the landing page and the 10th `build-all` target — onto the ct
lib. It is the only remaining consumer of the flat `<<ct:include>>` tokens (resolved from
`jbc-include-old`); porting it means ZERO `<<ct:include>>` remain anywhere, which unblocks Round B's
retire of `jbc-include-old`. The gallery is a STATIC page: `source/index.template.html` + `styles.css`,
no `app.mjs`, no tests dir. Do NOT touch any tool or the shared `src/lib/`.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Gallery consumes the ct lib, not flat includes | `src/gallery/source/index.template.html` | `<<ct:include gallery.css>>` → `<<ct:lib components/styles/gallery.css>>`; `<<ct:include footer.html>>` → `<<ct:lib components/footer.html>>`; `<<ct:inline styles.css>>` kept. `grep -nE "<<ct:include" src/gallery/source` → nothing |
| Footer License kept & wired | template + built html | a `<script type="module"><<ct:module components/CtLicense.mjs>></script>` added (the old footer inlined license.js; the new one doesn't). Built html has `[data-ct-license]` + `CtLicense`/`openLicense`; no unsubstituted project-identity tokens |
| App/page initializes; License works | built `index.html` | SMOKE-CHECK (the behavior gate — no test harness): headless load → ZERO pageerror/console.error, `[data-ct-license]` present, and clicking it makes the License modal visible with "MIT License" |
| Build regenerates deterministically | built `src/gallery/index.html` | `node scripts/build-tool.mjs --dir="src/gallery"`; `node scripts/build-all.mjs --check` → 10/10 |

## Task / method
Per the builder's charter + the recipe (epic `decisions.md §3d` + the R6 smoke-check lesson). Swap the two
flat includes to `<<ct:lib …>>`, add the CtLicense module script so the footer License button works, rebuild,
and prove it with the smoke-check (which, absent a test harness, is the behavior gate here). The gallery has
no app.mjs, so there is no collision risk; still confirm the built page has no console errors.

## Tools & MCP
Local Node/ESM repo. `node scripts/build-tool.mjs --dir="src/gallery"` (use `--dir=`); `build-all --check`
(10/10). No unit/e2e for the gallery — the smoke-check is the gate.

## Context — folders to read
- **Your working folder:** `dev/20261002-lib-cleanup/13-port-gallery/`.
- `dev/20261002-lib-cleanup/00-epic-plan/decisions.md` — ⭐ recipe (§3d) + R6 smoke-check lesson.
- `dev/20261002-lib-cleanup/07-port-inflation-calculator/findings/HANDOFF.md` — a footer+CtLicense example.
- `src/lib/components/` — `footer.html`, `CtLicense.mjs` (`openLicense`), `styles/gallery.css`.
- `src/gallery/source/` — `index.template.html` (the 2 flat includes at lines ~14, ~80) + `styles.css`; built `index.html`.

## Deliverables
- The ported, green `src/gallery` (source + regenerated `index.html`). No commits.
- `findings/HANDOFF.md` — what changed, the CtLicense wiring added, the smoke-check output (incl. the License-modal-opens check), gate tallies.

## Constraints
- **Scope boundary:** ONLY `src/gallery/`. Do NOT modify any tool, `src/lib/`, `scripts/`, `project.json`,
  `jbc-include-old`, or `00-epic-plan/`. (Retiring jbc-include-old + toolchain cleanup is Round B.) If a
  shared change seems needed, STOP and surface it.
- No `rm`, no `git`. 
- No test harness → do NOT invent/add tests; the smoke-check is the gate.

## Time budget
1h.

## When done
`findings/HANDOFF.md` written; smoke clean (incl. License modal opens); `build-all --check` 10/10; no
`<<ct:include>>` left in `src/gallery/source`. Report 3–5 lines: ported ✓, CtLicense wiring, smoke result,
gate results. State PASS/what-remains.
