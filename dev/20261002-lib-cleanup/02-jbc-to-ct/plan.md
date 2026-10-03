# Plan — 02-jbc-to-ct

> Structure only. The charter (posture / definition of done) lives in the
> separate `charter-<role>.md` the spawn-prompt names — never in this file.

## Scope / motivation

Phase 3b of the #1008 epic (= ticket #1009). Rename the NEW shared library
`src/lib/utils/**` + `src/lib/components/**` from the `Jbc`/`jbc-` identity to the
`ct` convention the tools already use — **pulled ahead of the tool port (3d)** so the
port lands on matching names and per-tool churn shrinks.

**Why it is safe / low-risk now:** recon confirmed NOTHING consumes the new lib yet —
no `src/tools/**` or `src/lib/test-support/**` file imports from `utils/` or
`components/` (grep clean). The 9 tools still build from `src/lib/jbc-include-old/`
(the legacy FLAT includes), which this round does NOT touch. So the blast radius is the
lib dir itself PLUS one required ripple: the Phase-3a tests reference lib modules by
name and must be updated in lockstep to stay green.

## Definition of Done

| Claim | Artifact | Check |
|-------|----------|-------|
| Lib identity fully renamed per the spec below | `src/lib/utils/**` + `src/lib/components/**` | `grep -rnE "Jbc\|jbcc\|data-jbc\|jbc-(?!include)" src/lib/utils src/lib/components` → **no matches** (only `jbc-include` may remain, in comments/PROVENANCE) |
| 20 `JbcX.mjs` → `CtX.mjs`, every internal import specifier updated | the renamed lib files | no file named `Jbc*.mjs` under the lib; `node --input-type=module -e "await import('<each util>')"` loads without MODULE_NOT_FOUND |
| **Phase-3a test suite still green** (the required ripple) | `scripts/tests/esm-inline.test.mjs` + `esm-inline-hardening.test.mjs` | `node --test scripts/tests/` → **38 pass, 0 fail** |
| The 9 tools are untouched / unaffected | all `src/tools/*` + `src/gallery` `index.html` | `node scripts/build-all.mjs --check` → **10/10 up to date, 0 failed** |
| Legacy `jbc-include-old` references PRESERVED | `src/lib/utils/PROVENANCE.md`, JSDoc in `JbcUtil.mjs`/`JbcByteUtil.mjs` | the string `jbc-include` (and `jbc-include-old`) is byte-unchanged everywhere |
| Inliner works on the renamed modules | — | an independent `<<ct:module utils/CtByteUtil.mjs>>` build parses, no surviving `export`/`import` |
| No scope leak | working tree | diff touches only `src/lib/utils/**`, `src/lib/components/**`, `scripts/tests/esm-inline*.test.mjs` (+ optional cosmetic `scripts/build-tool.mjs` comment); NO `src/tools/**` edits |

## Task / method

**The rename is a SURGICAL codemod — NOT a blanket `jbc→ct`** (a blanket replace would
corrupt `jbc-include` references to the legacy dir). Apply exactly these, in order:

1. **`jbcc` → `ctc`** (case-sensitive) — the component class prefix (`jbcc-btn`, `jbcc-overlay`, `jbcc-flash`, …). Do this BEFORE the `jbc-` rule so the shared `jbc` stem isn't half-rewritten.
2. **`data-jbc-` → `data-ct-`** (e.g. `data-jbc-license` → `data-ct-license`).
3. **`jbc-` → `ct-` EXCEPT `jbc-include`** — use a negative lookahead `jbc-(?!include)`. This renames the CSS/marker classes (`jbc-segmented`, `jbc-field`, `jbc-footer`, `jbc-base`, `jbc-widgets`, `jbc-banner`, `jbc-error`, `jbc-warning`, `jbc-copy-btn`, `jbc-dropzone`, `jbc-drag-over`, `jbc-checker*`, `jbc-checkerboard`, …) while PRESERVING `jbc-include`/`jbc-include-old`.
4. **`Jbc` → `Ct`** (case-sensitive) — PascalCase symbols (`JbcByteUtil`→`CtByteUtil`, `JbcComponents`→`CtComponents`, …) AND the leading segment of filenames. This is safe even inside PROVENANCE.md/JSDoc because it is case-sensitive and `jbc-include` is lowercase.
5. **Filenames:** `git`-is-blocked, so rename via `mv` (or copy+retire): every `src/lib/**/JbcX.mjs` → `CtX.mjs`. Then update EVERY internal import specifier that points at a renamed file (`'./JbcByteUtil.mjs'` → `'./CtByteUtil.mjs'`, `'../JbcByteUtil.mjs'` → `'../CtByteUtil.mjs'`, etc.). Do NOT leave a stale `JbcX.mjs`; if you must stage, move the old file to `tmp/safe-to-delete/`.

**Then the ripple:** update `scripts/tests/esm-inline.test.mjs` and
`esm-inline-hardening.test.mjs` — every reference to a renamed lib FILENAME
(`utils/JbcByteUtil.mjs` → `utils/CtByteUtil.mjs`, `utils/image/JbcDither.mjs` → …) and
every renamed SYMBOL the tests assert on (e.g. `class CtByteUtil`, `CtDither`, export-key
sets). Run `node --test scripts/tests/` until it is 38/38 again. **Do NOT change what the
tests assert conceptually — only the names they reference.** (This is the one case where
editing the delivered tests is in-scope: the names they target genuinely changed.)

**Order of operations:** rename file contents (rules 1–4) and filenames (rule 5) together,
module by module, keeping imports consistent; then fix the test references; then run both
gates. Grep after each sweep. If a replacement is ambiguous or would touch `jbc-include`,
STOP and surface it rather than guessing.

## Tools & MCP

Read/Edit/Write, Bash (node, grep, mv, find). No MCP. A `perl -0pi`/`node` codemod script
is fine — keep it in the phase `tmp/` or `tools/`, not shipped. Verify with
`node scripts/build-all.mjs --check`, `node --test scripts/tests/`, and targeted greps.
Do NOT run the Playwright e2e (no tool output changes; `--check` is the regression proof).

## Context — folders to read

- **`dev/20261002-lib-cleanup/01-esm-inliner/findings/HANDOFF.md`** — the Phase-3a inliner you build on; note its tests reference the lib by name (the ripple) and that the inliner is name-agnostic.
- **`src/lib/utils/**` + `src/lib/components/**`** — the 20 `Jbc*.mjs` + `components/styles/*.css` to rename. Note the internal imports (`JbcZipUtil`→`JbcByteUtil`, image modules→`../JbcByteUtil.mjs`).
- **`scripts/tests/esm-inline.test.mjs` + `esm-inline-hardening.test.mjs`** — the references to update (search them for `Jbc`).
- **`src/lib/utils/PROVENANCE.md`** — contains both `Jbc` symbols (rename) AND `jbc-include`/`jbc-include-old` path references (PRESERVE). Case-sensitive `Jbc→Ct` handles this correctly; do not touch its lowercase `jbc-include`.
- **`scripts/build-tool.mjs`** — its header doc-comment lists example include names (`components/JbcConfirm.mjs`, `JbcLicense.mjs`, `JbcZipUtil.mjs`); update those EXAMPLES to the `Ct` names for accuracy (comment-only; must not change any built output — re-run `--check`).
- **`00-epic-plan/epic-plan.md`** — the phase map (you are 02/3b; 3d/3e port the tools against these new names; 3f retires `jbc-include-old`).
- Your phase folder `dev/20261002-lib-cleanup/02-jbc-to-ct/` (plan, charter, findings, tmp).

## Deliverables

- The renamed lib (`src/lib/utils/**` + `src/lib/components/**`), self-consistent.
- Updated Phase-3a tests, green (38/38).
- `findings/HANDOFF.md` — the exact rename mapping applied (incl. the `jbc-include` exclusion), the file-rename list, the test references updated, both gate tallies, the exact diff scope, and any ambiguity surfaced. Plus standing config-gated deliverables (TLDR / tool-feedback).

## Constraints

- **Writable:** `src/lib/utils/**`, `src/lib/components/**`, `scripts/tests/esm-inline*.test.mjs`, optionally the `scripts/build-tool.mjs` header comment, and your phase folder.
- **Read-only / DO NOT EDIT:** `src/tools/**`, `src/gallery/**`, `src/lib/jbc-include-old/**`, `src/lib/test-support/**`. (test-support has a couple of stale `Jbc` *comments* — leave them; cosmetic, out of scope.)
- **PRESERVE** every `jbc-include` / `jbc-include-old` reference (names the legacy dir; retired later in 3f).
- Do NOT change what the 3a tests assert — only the names they reference.
- No `rm`, no `git` — both blocked. Rename by `mv`; retire anything by moving to `tmp/safe-to-delete/`.
- If `build-all --check` is not 10/10 or `node --test` is not 38/38 after your change, the change is wrong — fix it; never edit a tool's `index.html` to pass.

## Time budget

2 hours.

## When done

Post `findings/HANDOFF.md` + a short final summary: the mapping applied, the file-rename
count, the `grep` cleanliness result, the two gate tallies (`--check` 10/10, `node --test`
38/38), and the exact diff scope. If any step is ambiguous or would touch `jbc-include`,
STOP and surface it rather than widening scope or guessing.
