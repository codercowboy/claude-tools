# Plan — 01-esm-inliner

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation

Phase 3a of the #1008 lib-cleanup epic — **the enabler for the whole jbc-include port.**

The 9 shipped tools are still assembled from the FLAT, verbatim-inlined includes in
`src/lib/jbc-include-old/` (plain `.js`/`.css`/`.html`, pasted as-is by `build-tool.mjs`).
The NEW shared library — `src/lib/utils/` + `src/lib/components/` — is **ES modules**
(`export function/const/class`, `export { … }` blocks, and relative `import` statements
between modules). `build-tool.mjs` CANNOT inline an ES module today: it pastes file
content verbatim, so an `export`/`import` would land in a classic `<script>` and break.

This round teaches `build-tool.mjs` to **inline an ES module into the single-file page**
— a tiny single-file bundler: strip exports, resolve+inline internal relative imports
(once, in dependency order), collapse to plain globals. **Nothing is ported yet** (that is
3d+). This is purely the build capability, delivered additively with its own tests.

**This is the riskiest single piece of the epic** — every later phase lands on top of it.
It runs ALONE, before any tool moves.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Builder can inline an ESM module: strips `export ` from `function`/`const`/`class`, strips `export { … };` blocks entirely, and resolves+inlines internal relative imports | `scripts/build-tool.mjs` | unit tests feed representative `.mjs`; assert output has NO line-start `export`/`import`, and each imported symbol's definition is present exactly once |
| Relative imports resolve from the importing module's dir — both `./X.mjs` and `../X.mjs` (cross-subdir: `utils/formats/`, `utils/image/` → parent `utils/`) | `scripts/build-tool.mjs` | unit test with a 2-level fixture (a module in a subdir importing `../Dep.mjs`); dep inlined once, correct order |
| A dep imported by multiple modules is inlined EXACTLY ONCE (dedup by resolved path), dependencies before dependents | `scripts/build-tool.mjs` | unit test: two modules both import the same dep → dep appears once, above both |
| Includes resolve across the new split dirs (`utils/`, `components/`, `components/styles/`) | `scripts/build-tool.mjs` | unit tests inline a real `utils/*.mjs`, a `components/*.mjs`, and a `components/styles/*.css` |
| `export default` / unknown import form fails LOUD with a clear error (not silently mis-inlined) | `scripts/build-tool.mjs` | unit test asserts a thrown error naming the file + unsupported construct |
| **ADDITIVE — the existing 9 tools build byte-identical** | all `src/tools/*` + `src/gallery` `index.html` | `node scripts/build-all.mjs --check` → **10/10 up to date, 0 failed** |
| Inliner has its own node:test suite | `scripts/tests/*.test.mjs` (new) | `node --test scripts/tests/` green |
| No tool ported, no lib edited | working tree | `git`-visible diff touches ONLY `scripts/` (build-tool.mjs + new tests); zero edits under `src/tools/**` or `src/lib/**` |

## Task / method

The builder designs the exact mechanism (the planner produces the design first). Strong guidance:

1. **Keep the existing paths untouched.** `<<ct:include NAME>>` (verbatim from the include dir)
   and `<<ct:inline NAME>>` (verbatim from `source/`) MUST behave exactly as today — that is
   what keeps the 9 tools byte-identical. `TOKEN_RE`, `BANNER`, `resolveIncludeDir` default
   (`src/lib/jbc-include-old`), and `{{project.*}}` handling stay as-is. Confirm with `--check`.
2. **Add ESM inlining as a NEW, additive capability** — a KEY DESIGN DECISION for the planner:
   either a new token (e.g. `<<ct:module utils/JbcByteUtil.mjs>>`) OR auto-detecting a `.mjs`
   include and applying the ESM transform. (Auto-detect is safe today: there are NO `.mjs`
   includes in any current tool — the old includes are `.js`/`.css`/`.html`.) Pick ONE, justify
   it, and make sure it cannot change any current tool's output.
3. **The ESM transform** (a mini single-file bundler — concatenate, don't tree-shake):
   - Parse line-start `import { … } from '<rel>.mjs';` statements. Resolve `<rel>` relative to
     the importing module's own directory (handles `./` and `../`). Recurse.
   - Inline each resolved module ONCE (dedup by absolute resolved path), **dependencies before
     dependents** (topological order; detect cycles → clear error).
   - Strip exports: `export function` / `export const` / `export class` / `export let|var`
     → drop the leading `export `; `export { … };` (possibly multi-line) → remove entirely
     (the names are already declared above, so they remain as module-scope globals in the IIFE).
   - `export default` and any unrecognized import/export form → **throw** with file + line.
   - **Only transform real statements** (line-anchored `^\s*import`/`^\s*export`) — the modules
     contain the word "importable" in JSDoc prose that must NOT be touched. Test this explicitly.
4. **Scope the inlined module** so top-level `const`/`class` names don't leak/collide — the
   planner decides (e.g. wrap each inlined module set in an IIFE, or rely on the tool's existing
   single `<script type=module>`/IIFE wrapper). Whatever is chosen must still expose what the
   tool's own code references. (No tool consumes this yet, so there is freedom here — but write
   the tests around the chosen contract so 3d has a stable target.)
5. Keep `buildTool` pure + the `{ includeDir, project }` injection seam for testability.

## Tools & MCP

Baseline: Read/Edit/Write, Bash (node), Grep/Glob. No MCP needed. Verify with:
`node scripts/build-all.mjs --check` (byte-identical gate) and `node --test scripts/tests/`.
Do NOT run the Playwright e2e for this round — no tool output changes, so e2e is not the gate
(and it is slow/flaky under load); the `--check` byte-identical result is the regression proof.

## Context — folders to read

- **`scripts/build-tool.mjs`** — THE file to extend. Read in full. Note: verbatim `TOKEN_RE`
  expansion (lines 135-149), `resolveIncludeDir` (68-75, default `src/lib/jbc-include-old`),
  `BANNER` (59-61, must stay EXACT), injectable `buildTool(dir,{includeDir,project})` (131).
- **`src/lib/utils/`** — ESM to inline. Representative shapes:
  - `JbcByteUtil.mjs` — many `export function` + `export class JbcByteUtil` (no imports) — the common leaf dep.
  - `JbcZipUtil.mjs` — `import { crc32 } from './JbcByteUtil.mjs';` then exports — the simplest import case.
  - `utils/formats/*.mjs`, `utils/image/*.mjs` — subdir modules; several import `../JbcByteUtil.mjs`
    (cross-dir) and end in `export { a, b, … };` blocks (e.g. `image/JbcImageUtil.mjs` has TWO).
- **`src/lib/components/`** — `JbcComponents.mjs`, `JbcConfirm.mjs`, `JbcLicense.mjs`, `JbcModal.mjs`,
  `JbcClipboardUtil.mjs` (`export function` + trailing `export class`), plus `styles/*.css`
  (`base.css`, `controls.css`, `gallery.css`, `widgets.css`) and `footer.html`.
- **`dev/20261002-lib-cleanup/includes-diff.md`** (#1010-B) — old→new include mapping / gaps; context for how the new split corresponds to the old flat files.
- **`00-epic-plan/`** (this epic) + **`dev/20261002-lib-cleanup/execution-plan.md`** — where 3a sits in the roadmap (3b rename jbc→ct, 3c behavior decisions, 3d pilot, 3e fan-out, 3f retire).
- Your own phase folder: `dev/20261002-lib-cleanup/01-esm-inliner/` (plan, charter, `findings/`, `tests/`, `tmp/`).

## Deliverables

- The extended `scripts/build-tool.mjs` (ESM-inlining added, existing behavior intact).
- A `node:test` suite under `scripts/tests/` covering every DoD row (fixtures may live in the
  phase `tests/` or a `scripts/tests/fixtures/` dir — builder's call; keep them tiny + explicit).
- `findings/HANDOFF.md` — what was built, the design decision taken (token vs auto-detect, scoping
  approach) and WHY, the test inventory, the `--check` result, and anything 3d must know to port
  the first tool against this inliner.
- Standing config-gated deliverables (TLDR / tool-feedback) per the shipping charter.

## Constraints

- **Writable: `scripts/` only** (build-tool.mjs + new `scripts/tests/…`) and your own phase folder.
- **Read-only: `src/lib/**` and `src/tools/**`.** Do NOT edit any library module or any tool. If a
  lib module looks like it needs changing to be inlinable, STOP and surface it — do not edit it.
- **Byte-identical is non-negotiable:** if `build-all.mjs --check` is not 10/10 after your change,
  the change is wrong — fix it before claiming done. Never "fix" a tool's `index.html` to make
  check pass.
- Preserve `BANNER` text and the `ct:` token prefix EXACTLY (jbc→ct rename is 3b, out of scope).
- No `rm`, no `git` (blocked in this env). Retire scratch by moving to `tmp/safe-to-delete/`.

## Time budget

2 hours.

## When done

Post `findings/HANDOFF.md` and a short final summary: the mechanism chosen (one paragraph), the
`node scripts/build-all.mjs --check` tally (must be 10/10), the `node --test scripts/tests/`
tally, the exact files touched (should be `scripts/` only), and the one-line handoff for 3d
(how a tool will invoke ESM inlining). If any DoD row cannot be met, STOP and surface it rather
than widening scope or editing a tool/lib.
