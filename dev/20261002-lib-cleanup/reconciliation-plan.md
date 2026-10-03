# Reconciliation plan — merge `src/tools/misc/` tooling into `scripts/`

**Date:** 2026-10-02
**Companion:** [`tooling-diff.md`](./tooling-diff.md) (the per-file diff + rationale).
**Executor:** an informal Sonnet subagent (not a formal TPM round).

## Goal

Make `scripts/` the single, best-of-both toolchain by folding in the richer
`src/tools/misc/` (jason-code) versions, then delete the `src/tools/misc/`
duplicates. **This is a tooling-only change.** The 9 tools are NOT ported in this
task and must keep building **byte-for-byte identically**.

## Hard guardrails (do not violate)

1. **Keep the 9 tools green and byte-identical.** `node scripts/build-all.mjs --check`
   passes now (10/10 up to date). It MUST still pass after every change. The
   definition of done includes `--check` green + full e2e 9/9.
2. **Preserve the `ct:` token prefix.** The project's tool `source/` templates use
   `<<ct:include>>` / `<<ct:inline>>` and `ct-base` / `ctConfirm` / … markers. The
   promoted tooling MUST keep the `ct:` regex/markers (NOT jason-code's `jbc:`).
   The jbc→ct rename of the *library files* is #1009 — out of scope here.
3. **Preserve the generated banner EXACTLY:**
   `<!-- GENERATED FILE — do not edit directly. Author in source/, then run: npm run build (see docs/conventions.md § Build-assembled tools) -->`
   (any change to this text changes every committed `index.html` → `--check` breaks).
4. **Include dir stays `src/lib/jbc-include-old`** for now (the tools still consume
   it; #1008 repoints to `utils/`+`components/`). Adopt misc's `resolveIncludeDir`
   but set its default to `src/lib/jbc-include-old`, with `$JC_INCLUDE_DIR` override.
5. **`src/gallery` must still build** (the #1007 wiring).
6. Do **not** touch anything under `src/tools/<tool>/` or `src/lib/` (other than
   reading). Only edit `scripts/` and delete `src/tools/misc/`.

## Per-file steps

### 1. `test-all.mjs` — identical
- No edit. Just delete the misc copy in the cleanup step.

### 2. `install-all.mjs` — keep scripts/
- No edit (only a doc-comment wording diff). Delete the misc copy.

### 3. `serve.mjs` — keep scripts/
- `scripts/serve.mjs` is more capable (dir-arg root). No edit. Delete the misc copy.

### 4. `build-all.mjs` — merge
- Start from `scripts/build-all.mjs` (it has the `src/gallery` wiring).
- Add misc's **configurable ROOTS**: replace `const ROOTS = ['src/tools'];` with
  ```js
  const ROOTS = (process.env.JC_BUILD_ROOTS || 'src/tools')
    .split(/[,:]/).map((s) => s.trim()).filter(Boolean);
  ```
- Keep the explicit `src/gallery` section push exactly as `scripts/` has it.
- Update the top doc comment to mention the `$JC_BUILD_ROOTS` knob.
- Delete the misc copy.

### 5. `build-tool.mjs` — adopt misc's capabilities, keep ct: + banner + include dir
- Start from `src/tools/misc/build-tool.mjs` (the richer base), then apply:
  - **Tokens:** change `TOKEN_RE` and all `<<jbc:…>>` strings/markers back to `<<ct:…>>`.
  - **Banner:** use the exact `scripts/` banner text (guardrail #3). (misc's banner
    says "project-structure/build-pipeline.md" — replace with
    "docs/conventions.md § Build-assembled tools".)
  - **Include dir:** keep misc's `resolveIncludeDir()` export, but set its candidate
    order to: `$JC_INCLUDE_DIR` → `<repo>/src/lib/jbc-include-old`. (Drop the
    jason-code `.claude/jason-code/assets` / `assets` defaults — they don't exist here.)
  - **Keep** misc's `loadProject()` + `applyProjectTokens()` + `{{project.*}}` support
    and the injectable `buildTool(toolDir, { includeDir, project })` signature. These
    stay dormant for claude-tools (no `project.json`, no `{{project.*}}` tokens in the
    tools) and degrade gracefully — do NOT delete them (they're why we're adopting misc).
  - Update doc-comment path pointers to claude-tools' `docs/conventions.md` where misc
    pointed at jason-code docs.
- After the edit, `build-all.mjs --check` MUST be byte-identical green. If any tool
  reports stale, the include dir / banner / token prefix is wrong — fix before moving on.
- Delete the misc copy.

### 6. `slice-tool.mjs` — adopt misc's version, keep ct:
- Start from `src/tools/misc/slice-tool.mjs`, then:
  - Change all `<<jbc:…>>` / `jbc-base` / `jbcConfirm` / `jbcCopy` back to `ct:` /
    `ct-base` / `ctConfirm` / `ctCopy` (match the current project markers exactly —
    cross-check against the current `scripts/slice-tool.mjs` INCLUDES table).
  - Keep `import { resolveIncludeDir } from './build-tool.mjs'` and the
    templated-include tolerance block.
  - Update doc-comment path pointer to `docs/conventions.md`.
- Delete the misc copy.

### 7. Cleanup
- **`rm` and `git` are blocked in this environment** — never `rm`. Retire the dir by
  MOVING it: `mv src/tools/misc tmp/safe-to-delete/misc`.
- Confirm nothing references `src/tools/misc` anywhere:
  `grep -rn "tools/misc" --exclude-dir=node_modules .` → only docs/tasks/history, no code.

## Verification (definition of done)

1. `node scripts/build-all.mjs --check` → **10/10 up to date, 0 failed** (byte-identical).
2. `node scripts/test-all.mjs` → **9/9 suites pass** (serial; base config already
   `workers: 1`).
3. `src/tools/misc/` no longer exists.
4. Quick sanity: `node scripts/ct.mjs build --check` still works through the `ct`
   front door.
5. Report: which files were edited vs promoted-as-is, the `--check` result, the e2e
   tally, and anything that didn't go to plan.

## Explicitly OUT of scope (later tasks)

- Porting the 9 tools off `jbc-include-old` onto `src/lib/utils` + `components` — **#1008**
  (gated by the #1010 diff).
- Renaming `jbc`→`ct` across the library files (`JbcUtil.mjs` → …) and markers — **#1009**.
- Adopting `project.json` / `{{project.*}}` identity templating — future opt-in.
- Updating `scripts/README.md` for the new layout — **#1011**.
