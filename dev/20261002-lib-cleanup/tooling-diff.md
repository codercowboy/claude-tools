# Tooling reconciliation — `scripts/` vs `src/tools/misc/`

**Date:** 2026-10-02
**Context:** The lib migration from jason-code dropped a second copy of the build
tooling into `src/tools/misc/`. This doc compares it, file by file, against the
project's own copy in `scripts/`, so we can decide which version wins each file
before porting the tools (#1008) and renaming (#1009).

## The two lineages

- **`scripts/`** — the project's copy. It is **`ct`-named** (already through a
  jbc→ct rename), carries **claude-tools-specific adaptations**, and includes the
  **#1007 fixes** (include dir → `src/lib/jbc-include-old`, the `src/gallery`
  build wiring, the arg-driven `serve`). Simpler, hardcoded to this repo.
- **`src/tools/misc/`** — the jason-code copy. It is **`jbc`-named** and more
  **generic / configurable** (env knobs, project-identity templating, a shared
  include-dir resolver). It assumes jason-code's conventional paths
  (`.claude/jason-code/assets`, `project.json`), not claude-tools' `src/lib`.

**Working lean (per user):** re-apply the small claude-tools-specific changes
from `scripts/` onto the richer `misc/` versions, then promote `misc/` → `scripts/`.
The jbc→ct rename is #1009 and applies to whichever version wins.

## Summary table

| File | Verdict | Who's richer | Reconciliation |
|---|---|---|---|
| `test-all.mjs` | **Identical** | — | Nothing to do. |
| `install-all.mjs` | **Trivial** | — | One doc-comment wording diff only. Either copy is fine. |
| `serve.mjs` | **scripts wins** | `scripts/` | `scripts/` takes a dir arg (serves any dir / the gallery); `misc/` serves cwd only. Keep `scripts/`. |
| `build-all.mjs` | **Merge** | mixed | Adopt `misc/`'s configurable `ROOTS` ($JC_BUILD_ROOTS); re-apply `scripts/`'s `src/gallery` build. |
| `slice-tool.mjs` | **misc wins + reapply** | `misc/` | Adopt `misc/` (shared `resolveIncludeDir`, templated-include tolerance); re-apply ct naming. |
| `build-tool.mjs` | **misc wins + reapply** | `misc/` | Adopt `misc/` (configurable include dir + `{{project.*}}` identity templating); wire include dir to `src/lib`, re-apply ct naming. |

---

## Per-file detail

### `test-all.mjs` — identical
Byte-for-byte identical. No decision needed.

### `install-all.mjs` — trivial
Only difference is a doc-comment wording tweak ("each package under src/tools" vs
"each tool package"). Functionally identical (both walk the repo for `package.json`
and run `npm install` in each). Pick either.

### `serve.mjs` — `scripts/` is more capable
- **`scripts/`**: `const root = resolve(process.argv[2] || process.cwd())` — serves
  a directory given as an argument, defaulting to cwd. This is what lets
  `ct serve` serve `src/` with the gallery at `/gallery/`.
- **`misc/`**: `const root = process.cwd()` — always serves the cwd (a single tool
  folder); no argument support.
- **Verdict:** keep `scripts/`. `misc/` has nothing to add here; adopting it would
  be a regression (lose the arg-driven root the gallery serve relies on).

### `build-all.mjs` — merge both sides
- **`misc/` improvement — configurable roots:**
  ```js
  const ROOTS = (process.env.JC_BUILD_ROOTS || 'src/tools').split(/[,:]/)…
  ```
  Lets a repo scan more than one section (e.g. `src/tools,src/games`). `scripts/`
  hardcodes `['src/tools']`.
- **`scripts/` change (#1007) — explicit gallery section:** builds `src/gallery`
  (its own dir with `source/index.template.html`) as a section. `misc/` instead
  keeps the *old* per-root gallery check (`if exists base/source/index.template.html
  → push base`), which assumes the gallery lives at a root's own root
  (`src/tools/source`) — the pre-#1007 layout.
- **Reconciliation:** take `misc/`'s configurable `ROOTS`; then either (a) default
  `ROOTS` to include `src/gallery`, or (b) rely on the per-root check by listing
  `src/gallery` as a root. Both get the gallery built without hardcoding.

### `slice-tool.mjs` — `misc/` is richer (migration aid)
Shared core algorithm (tokenize includes → extract CSS/JS → byte-for-byte
self-check). `misc/` adds:
1. **Shared include-dir resolver:** `import { resolveIncludeDir } from './build-tool.mjs'`
   instead of a hardcoded `INCLUDE_DIR`. (Creates a dependency on `build-tool.mjs`
   — they move together.)
2. **Templated-include tolerance:** skips the strict byte-equality check for a
   canonical include carrying `{{project.*}}` tokens or a nested `<<jbc:include…>>`
   (e.g. `footer.html`), since its shipped block is substituted/expanded. The
   byte-for-byte self-check still guarantees losslessness. `scripts/` would throw
   `block differs from canonical include` on a templated footer.
- **`scripts/`-only:** `ct:` token/marker naming (`ct-base`, `ctConfirm`, …) vs
  `misc/`'s `jbc:` — this is the #1009 rename, already done on `scripts/`.
- **Reconciliation:** adopt `misc/`; re-apply ct naming (#1009); point its include
  resolution at `src/lib` (see build-tool).

### `build-tool.mjs` — `misc/` is substantially richer (the core builder)
`misc/` adds three real capabilities `scripts/` lacks:
1. **`resolveIncludeDir()`** (exported): configurable include dir — `$JC_INCLUDE_DIR`
   → `<repo>/.claude/jason-code/assets` → `<repo>/assets`. `scripts/` hardcodes
   `src/lib/jbc-include-old` (my #1007 edit).
2. **`loadProject()`** (exported): reads a `project.json` identity (`name`, `repo`,
   `repoLabel` [derived], `tagline`) with search order, required-field validation,
   and caching.
3. **`{{project.*}}` mustache substitution** (`applyProjectTokens`): after include
   expansion, fills project-identity tokens — so a shared `footer.html` can carry
   `{{project.name}}` / `{{project.repo}}` and get the consuming repo's values.
   Degrades gracefully (leaves tokens + one stderr warning) if no `project.json`.
   Plus injectable `includeDir`/`project` params on `buildTool()` for testing.
- **`scripts/`-only:** `ct:` tokens; hardcoded include dir; no identity templating.
- **Reconciliation (biggest item):** adopt `misc/`, then:
  - **Include dir:** claude-tools keeps includes under `src/lib` (post-port:
    `utils/` + `components/`), not `.claude/jason-code/assets`. Either set
    `$JC_INCLUDE_DIR`, or adjust `resolveIncludeDir`'s candidate list to the
    `src/lib` layout.
  - **Identity templating:** optional for claude-tools. Current tool sources use no
    `{{project.*}}` tokens, so the feature stays dormant (graceful) until adopted —
    but it's the clean way to kill hardcoded repo names in `footer.html`.
  - **ct rename (#1009):** re-apply jbc→ct on tokens, markers, and the `Jbc*`
    include filenames this references (`components/JbcConfirm.mjs`, …).

## Open dependencies / notes

- `misc/slice-tool.mjs` imports `resolveIncludeDir` from `misc/build-tool.mjs` — the
  two must be adopted as a pair.
- Adopting `misc/build-tool.mjs` means tool `source/` templates must switch their
  include/inline token prefix to match whichever naming wins (ct, per #1009).
- The include-dir resolver's default candidates (`.claude/jason-code/assets`,
  `assets`) don't match claude-tools' `src/lib` — this MUST be wired or every build
  fails to find includes.
- This doc is the pre-work for #1008 (port tools onto the new libs) and #1009
  (rename). The #1010 diff gate (old vs new lib *contents*) is separate and still
  precedes the port.
