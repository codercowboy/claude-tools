# 01-esm-inliner — DESIGN (planning round r1)

Status: DESIGN ONLY. Nothing built; no file outside this folder touched.
Legend: [OBS] = observed this round; [INF] = inferred; [OPEN] = builder/orchestrator decision.

Baseline [OBS]: `node scripts/build-all.mjs --check` -> 10 tools checked, 0 failed. `node --test <dir>/`
works on this Node (v26.8.2). `scripts/tests/` does not exist yet.

## 1. Headline decisions

1. **New explicit tokens, NOT auto-detect of `.mjs` includes.**
   - `<<ct:module PATH>>` — ESM transform (always), PATH relative to a new `libDir` (default `<repo>/src/lib`), e.g. `utils/JbcZipUtil.mjs`, `components/JbcConfirm.mjs`. `PATH` may contain `/`.
   - `<<ct:lib PATH>>` — VERBATIM paste from `libDir` (for `components/styles/*.css`, `components/footer.html`). No transform, no extension magic.
   - `TOKEN_RE`, `BANNER`, `resolveIncludeDir` (+ its default `src/lib/jbc-include-old`), `PROJECT_TOKEN_RE`, `<<ct:include>>`/`<<ct:inline>>` code paths: **untouched**. `resolveIncludeDir` stays exported (`slice-tool.mjs` imports it [OBS]).
2. **Per-module function scope (isolated IIFE + export object), not flat concatenation.** See section 4.
3. **No tree-shaking** in 3a (concatenate whole modules). JbcByteUtil is ~585 lines; size growth accepted, flagged for later.

### Why a new token (rationale)
- `TOKEN_RE = /<<ct:(include|inline) ([\w.-]+)>>/g` cannot match `<<ct:module …>>` or a name with `/`. So the new tokens match **zero** strings in the 9 current templates [OBS: `grep "ct:module\|ct:lib" src scripts` -> no hits] and the new code is a pure no-op on them -> byte-identical **by construction**, not just by testing.
- Auto-detect (`<<ct:include X.mjs>>` => transform) is also safe today (no `.mjs` includes) but it overloads one token with two semantics ("paste verbatim" vs "rewrite"). A future verbatim `.mjs` include (a worker source string, see O3) would be silently rewritten. It also still needs `/` in names, which means widening `TOKEN_RE` — forbidden by plan.md. The CSS/HTML-from-split-dirs DoD row needs a path-capable token anyway; `ct:lib` gives that without touching `TOKEN_RE`.
- Greppable: `grep "ct:module"` lists every ESM consumer — useful for 3e/3f sweeps.

## 2. Public surface of the change (all in `scripts/build-tool.mjs`)

- New consts: `MODULE_RE = /<<ct:module ([\w./-]+)>>/g`, `LIB_RE = /<<ct:lib ([\w./-]+)>>/g` (separate from `TOKEN_RE`; keep `TOKEN_RE` line byte-for-byte).
- New export `resolveLibDir(repoRoot = REPO_ROOT)` -> `join(repoRoot,'src','lib')`. No env override in 3a (YAGNI; avoids new config surface).
- `buildTool(toolDir, { includeDir, project, libDir = resolveLibDir() } = {})` — `libDir` is the new injection seam (tests point it at fixtures).
- New exported pure helper `inlineModules(rootRelPaths, libDir, state?)` / `transformModule(source, absPath, …)` so unit tests can hit the transform without a template. Builder's choice of names; keep pure (no globals except the per-call `state`).
- New export `bundleModule(relPath, {libDir, state})` returns the text for one root token.

## 3. Algorithm (step by step)

Build-level (inside `buildTool`):
1. Run the EXISTING include/inline loop unchanged (same `MAX_PASSES`, same error).
2. Create per-call `state = { emitted: Map<absPath, id>, order: [] , ids: Set }`. One state per `buildTool` call (dedup is page-wide — two `<<ct:module>>` tokens that share a dep emit it once; critical, because a duplicate `const` in one script is a SyntaxError).
3. Replace `LIB_RE` then `MODULE_RE` in ONE document-order pass each (function replacer so `$` stays literal). Order matters for dependency-before-dependent across separate tokens: `String.replace` callbacks run left-to-right, so first-seen emits the dep. Do module/lib expansion AFTER the include/inline fixpoint, so that tokens carried inside inlined `app.mjs` are all visible and processed in true document order (avoids pass-order inversion where a later-pass token sits earlier in the page than an earlier-pass one).
4. Re-test `TOKEN_RE`/`MODULE_RE`/`LIB_RE`; if any literal `<<ct:` token remains in module/lib output -> throw (module output is NOT re-scanned for tokens; a lib file containing a token is a bug). Then `applyProjectTokens` and BANNER exactly as today.

Per root token `<<ct:module P>>`:
5. `abs = resolve(libDir, P)`; reject if not under `libDir` (path-escape), not `.mjs`, or missing (ENOENT message names token + expected path).
6. `emit(abs)` (below). Output = concatenated bundle chunks for every module newly emitted, in dependency order. Then, at the token site, bind the ROOT module's exports into the tool scope: `const { a, b, c } = __ct_<id>;` (see contract). If root was already emitted by an earlier token, emit only the binding line (and the binding must not redeclare an already-bound name -> see section 4 collision rule).

`emit(abs)` — DFS post-order:
7. If `abs` in `state.emitted` -> return its id. If `abs` is on the current DFS stack -> **throw cycle error** ("import cycle: A -> B -> A", full chain, repo-relative).
8. Read file; normalize `\r\n` -> `\n` (none seen in lib [OBS], cheap safety).
9. `parse(source, abs)`: line-anchored (column 0 ONLY, `^` with `m` flag, no leading whitespace) scan, yields: `imports[]` (specifier, bindings, source span), `exports[]` (names, span/strip action). Anything unsupported -> throw `ESM inliner: <relpath>:<line>: unsupported <construct>`.
10. For each import in source order: resolve `spec` against `dirname(abs)` (handles `./`, `../`); require `.mjs` extension and under `libDir`; recurse `emit(resolved)` BEFORE this module. (Source order + DFS = deterministic output for `--check`.)
11. Transform body (section 3.1), assign id (section 4), push chunk to `state.order`, set `state.emitted`.

### 3.1 Transform rules (all on column-0 lines)

| Input form | Action |
|---|---|
| `export function f(` / `export async function f(` / `export function* f(` | drop leading `export `; record `f` |
| `export const|let|var X = …` (single or multi-line initializer, e.g. `JbcEscaper` `CONTEXTS = [ … ]`) | drop `export `; record `X` (only the FIRST declarator name; `export const a=1,b=2` -> throw, unused in lib) |
| `export class C` | drop `export `; record `C` |
| `export { a, b, c };` single OR multi-line (`JbcDiff`, `JbcVideoGif`), may appear MULTIPLE times (`JbcImageUtil` has 6) | remove whole statement incl. newlines up to `;`/`}`; record each name. `a as b` -> record export name `b` bound to local `a`. Trailing comma / comments-in-braces: reject comments inside the braces (throw) — none in lib. |
| `import { x, y as z } from './D.mjs';` (single or multi-line) | replace statement with `const { x, y: z } = <depId>;` (statement stays at the module top, so it executes in the importer's scope) |
| `export default …`, `export * from`, `export { … } from`, `export` anything else not in rows above | **throw** (file:line + construct) |
| `import X from`, `import * as`, `import './side-effect.mjs'`, `import(`, `import.meta` at column 0, non-relative specifier (bare / `http`), non-`.mjs` specifier | **throw** (file:line + construct). [OPEN O4: `import * as ns` is trivially supportable as `const ns = <depId>;`; recommend still throwing — no lib module uses it] |

Prose safety [OBS]: all real `import`/`export` statements in `src/lib/utils|components` are at column 0 (grep for indented `^\s+(export|import)` -> none). "importable" and `import.meta`/`import()` mentions are inside JSDoc/comments/strings (`JbcPretty.mjs:1664` is an indented `if (t.value === 'import')…` comment; JbcModal has ` *     import { createModal }` inside a block comment, which starts with ` *` not col 0). Therefore: **column-0-only anchoring, no comment/string state machine.** Known residual hazard [INF]: a column-0 `export`/`import` inside a template literal or an unindented block-comment line would be mis-transformed. Mitigation = the equivalence test in section 6 (every real lib module is run through the transform and its export key set compared with a native `import()`), which would catch it. Builder must NOT add a half-baked comment/string tokenizer.

## 4. Module-scoping contract (what 3d ports against)

Chosen: **each module body in its own function scope; imports become destructuring of the dep's export object; the root token binds the root module's exports into the page's `<script type="module">` scope.**

Emitted shape (illustrative):
```
/* ct:module utils/JbcByteUtil.mjs */
const __ct_utils_JbcByteUtil = (() => {
  …module body, `export ` stripped, `export {…}` removed…
  return { crc32, formatBytes, JbcByteUtil };
})();
/* ct:module utils/JbcZipUtil.mjs */
const __ct_utils_JbcZipUtil = (() => {
  const { crc32 } = __ct_utils_JbcByteUtil;
  …body…
  return { u16le, u32le, storeZip };
})();
const { storeZip, u16le, u32le } = __ct_utils_JbcZipUtil;   // root-token binding
```
Rules (the contract):
- **Placement:** `<<ct:module …>>` must sit inside the tool's `<script type="module">`, BEFORE the code that uses the names (i.e. just above `<<ct:inline app.mjs>>`). Never in a classic `<script>` (modules are strict; also the `const` bindings must be visible to app code). Hoisting of `function` declarations does not cross the IIFE boundary, so order = dependency order, which the build guarantees.
- **Isolation:** private helpers never leak; module-private names cannot collide with each other or the tool's code. [OBS] 8 real top-level name duplicates exist across lib modules (`utf8ToBase64` ByteUtil/Curl, `bytesToBase64` ByteUtil/Escaper, `u16le` Zip/VideoGif, `clampByte` ImageUtil/VideoGif, `nearestColorIndex` Dither/VideoGif, `FORMATS` Format/ImageUtil, `parseYAML` Format/Pretty, `convert` Curl/Format). Flat concatenation would SyntaxError the moment a tool imports e.g. ByteUtil + Escaper. This is the evidence for isolation.
- **Exposed names:** every export of the ROOT module(s) named by a token becomes a `const` in the page scope. Two root tokens exporting the same name, or a root export colliding with a name the tool declares, is a JS SyntaxError. Build SHOULD detect the root-vs-root collision at build time and throw (names known from `exports[]`); collisions with tool-authored code are the author's problem [OPEN O2: optional `as NS` form `<<ct:module PATH as ns>>` -> `const ns = {…}` for exactly this case; recommend implement only if cheap, else defer to 3d/3e on first real collision].
- **Imports between lib modules** are resolved by the build; a tool does NOT write `import` statements today (its `app.mjs`/`logic.mjs` are inlined verbatim and untouched; `logic.mjs` has its own `export {` handling for node tests [OBS: 9 tools' logic.mjs contain `export`], out of scope and unchanged).
- **Live bindings are not preserved** (exports are snapshotted by `return {…}`). [OBS] no `export let|var` in lib; if one is ever added, the build should throw on `export let|var` (recommend: throw now, "mutable export not supported").
- **Module-level side effects** run once at the IIFE's position (dependency order). [OBS] no col-0 `window.`/`document.` statements found in lib `.mjs`. (`includes-diff` says `JbcLicense` "self-wires on evaluation" — [INF] that is inside the class / functions, not col-0; builder should eyeball `JbcLicense.mjs` while writing the real-module test.)
- **`'use strict'`** (`JbcVideoGif.mjs:26`) lands as a directive/no-op inside the IIFE; harmless in a module script.
- **ids:** `__ct_` + relative path from `libDir` with `/`,`.`,`-` -> `_` and the `.mjs` extension dropped; on (improbable) id collision append `_2`. Deterministic -> `--check` stable. Id prefix `__ct_` is intentionally NOT `jbc`/`ct`-rename-sensitive (3b renames lib symbols, not these ids).
- **Comment banners** (`/* ct:module <relpath> */`) are emitted per module for debuggability; deterministic content only (no timestamps, no abs paths).
- Dedup key = resolved absolute path (so `./JbcByteUtil.mjs` from `utils/` and `../JbcByteUtil.mjs` from `utils/image/` are the same module).

Fallback if the builder judges per-module IIFE too complex: flat concatenation (strip + hoist, names as page globals) WITH a build-time duplicate-top-level-name check that throws naming both files. Not recommended (collisions above are realistic); only choose it with an explicit deviation note.

## 5. Dedup, ordering, errors — summary
- Dedup: `state.emitted` keyed by abs path, per `buildTool` call, across all tokens and all transitive imports.
- Ordering: DFS post-order over imports in source order; tokens in document order. Deps always above dependents.
- Cycle: stack-based detection -> throw with full chain.
- Errors are `Error` with message `ESM inliner: <repo-relative or libDir-relative path>:<line>: <what>`; `runBuild` already prints `✗ label: message` for thrown errors. Cases: `export default`, `export *`, re-export, mutable export, unsupported import form, non-relative/non-`.mjs` specifier, path outside `libDir`, missing file, cycle, root-vs-root export collision, leftover token.

## 6. Test matrix (`scripts/tests/*.test.mjs`, `node:test`; tiny fixtures in `scripts/tests/fixtures/`)

Use `buildTool(toolDir,{includeDir,libDir,project:null})` with a temp tool dir (`os.tmpdir()` / fixtures) + the exported helper for pure-transform cases. Suggested files: `esm-inline.test.mjs` (transform + fixtures), `esm-inline-real-lib.test.mjs` (real lib), `build-regression.test.mjs`.

| plan.md DoD row | Proposed test(s) |
|---|---|
| Strips `export` from function/const/class; strips `export {…};` blocks; resolves+inlines relative imports; output has NO line-start export/import; each imported symbol defined exactly once | T1 fixture exercising `export function`, `export async function`, `export const X =` (multi-line initializer), `export class`, single-line AND multi-line `export {…};`, two `export {}` blocks in one file, `export {a as b}`: assert `!/^(export|import)\b/m.test(out)`, and `(out.match(/function dep\(/g)||[]).length === 1`. T2 prose safety: a fixture with the word "importable", an indented `import` in a comment/string, and a ` * import {x} from 'y'` JSDoc line -> output retains them byte-for-byte. |
| Relative imports from importing module's dir, `./X` and `../X` (cross-subdir) | T3 fixture `lib/utils/Dep.mjs` + `lib/utils/formats/A.mjs` (`import … from '../Dep.mjs'`) + `lib/utils/B.mjs` (`import … from './Dep.mjs'`): dep emitted once, above dependents, correct `const {…} = __ct_…` binding. T3b 3-deep chain (Dither->ImageUtil->ByteUtil shape). |
| Dedup: dep imported by multiple modules exactly once; deps before dependents | T4 two modules importing the same dep -> `indexOf(dep) < indexOf(A)` and `< indexOf(B)`, count === 1. T4b two separate `<<ct:module>>` tokens sharing a dep -> still once; second token emits no duplicate. T4c same dep reached via `./` and `../` spellings -> once. T4d determinism: build twice -> identical strings. |
| Resolves across the new split dirs (`utils/`, `components/`, `components/styles/`) | T5 real-lib: `<<ct:module utils/JbcByteUtil.mjs>>`, `…utils/JbcZipUtil.mjs>>` (pulls ByteUtil), `…components/JbcConfirm.mjs>>`, `…utils/image/JbcDither.mjs>>` (3-deep chain), with default `libDir`; assert no col-0 import/export, `new vm.Script(out)` parses (syntax check), each root export name bound. T5b `<<ct:lib components/styles/base.css>>` and `<<ct:lib components/footer.html>>` == `readFileSync` of the real file (verbatim, `$` literal, project tokens then filled). |
| Equivalence guard over the WHOLE lib (catches the col-0-in-template-literal residual risk) | T6 for every `src/lib/utils/**/*.mjs`: transform + `vm.Script` syntax check; for pure utils additionally evaluate the bundle in `vm` and compare returned export key set to `Object.keys(await import(file))`. DOM-touching `components/*.mjs`: syntax-check + export-name equality against the parsed `exports[]` only (do not execute). |
| `export default` / unknown import form fails LOUD naming file + construct | T7 table-driven: `export default`, `export * from`, `export {x} from`, `import X from`, `import * as n`, `import './x.mjs'`, bare specifier `'lodash'`, non-`.mjs` specifier, `export let`, `import.meta` at col 0 -> `assert.throws` with `/<file>.*<line>.*<construct>/`. T8 cycle A<->B (and self-import) -> throws message containing `A.mjs -> B.mjs -> A.mjs`. T8b path-escape (`../../outside.mjs`) and missing file throw clear errors. T8c root-vs-root export collision throws. |
| ADDITIVE: existing 9 tools byte-identical | T9 in-process: for each `src/tools/*` + `src/gallery` with `source/index.template.html`, `buildTool(dir) === readFileSync(index.html)` (mirrors `--check`; skip if the node suite should stay fast, run once). T9b token isolation: `TOKEN_RE`-based templates containing NO new tokens yield output identical to a snapshot produced by the pre-change builder (can be the committed `index.html`). T9c a template mixing `ct:include`, `ct:inline`, and `ct:module` keeps include/inline output verbatim. Gate (not a unit test): `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed". |
| Own node:test suite | `node --test scripts/tests/` green (verified a dir arg works on this Node [OBS]). |
| No tool ported / no lib edited | Verifier check (not a test): the diff touches only `scripts/` + the phase folder. Tests must read real lib/tools only, never write into them (use `os.tmpdir()` for generated tool dirs). |

Also: T10 `buildTool` still honors injected `includeDir`/`project` (existing seam) and `libDir`.

## 7. Risks / collisions (what will bite)

R1 [OBS] **Name collisions across lib modules** (8 listed) — drives the isolation decision. Residual: root-export collisions between two root tokens (see O2).
R2 [INF] **Column-0 text heuristic** can mis-handle `export`/`import` at column 0 inside a template literal or unindented block comment. None found today [OBS via grep]; T6 is the standing guard. Do not widen to a tokenizer.
R3 [OBS] **Same module needed at two sites in one page** (precedent: video-gif's engine inlined at module scope AND inside a `WORKER_SOURCE` string — `src/lib/utils/PROVENANCE.md` ~L795). Page-wide dedup would starve the second site. Not needed by any of the 9 current tools [INF — video-gif is not among them], so defer. Hook for later: token flag (e.g. `<<ct:module PATH fresh>>`) that clears dedup for that site / emits a self-contained copy. See O3.
R4 [OBS] **Bundle size**: whole-module concatenation (ByteUtil ~585 lines, JbcPretty ~1800, JbcFormat ~1100). Acceptable per plan ("concatenate, don't tree-shake"); `index.html` growth will show up in 3d/3e `--check` diffs by design (ported tools are expected to change output; only the 9 un-ported must not).
R5 [INF] **Placement mistake** (token in a classic `<script>`): modules strict-mode fine, but `const` page bindings aren't visible across classic/module script boundary and `type=module` is deferred. Contract: always inside the tool's module script, above its code. 3d should document this in the new-tool template; add a build-time warning is optional.
R6 [OBS] `slice-tool.mjs` imports `resolveIncludeDir` and validates `<<ct:include>>` blocks — new tokens are invisible to its `TOKEN_RE`; [INF] it won't choke, but builder should run it once on a template carrying `ct:module` to confirm (not a DoD item).
R7 [INF] 3b (rename jbc->ct) will rewrite lib symbol names but not paths' structure; `ct:module` paths use file names (`JbcByteUtil.mjs`) which 3b may RENAME (`CtByteUtil.mjs`?). Templates written in 3d must be updated if file names change; sequencing 3b before 3d (per execution-plan) avoids it. Inliner itself is name-agnostic (no `Jbc` strings in the algorithm) — keep it that way.
R8 [INF] `_projectCache` / `_warnedNoProject` are module-level caches; the new state must be per-call (NOT module-level) so tests and `build-all` (many tools, one process) don't leak dedup across tools. Unit-test T4b/T4d guard this (build two tools in one process, each must contain its own copy of the dep).

## 8. Open questions for the builder / orchestrator

- O1 Token naming: `ct:module` + `ct:lib` (recommended: two single-purpose tokens) vs one `ct:lib` that dispatches `.mjs` -> ESM by extension (fewer tokens, but extension magic). Orchestrator may veto; either keeps byte-identity.
- O2 Namespace form `<<ct:module PATH as ns>>`: implement in 3a (small: `const ns = __ct_…;` instead of destructuring) or defer? Recommend implement only if <30 lines; otherwise defer until a real collision at 3e.
- O3 Multi-site/worker re-emission (R3): confirm out of scope for 3a.
- O4 `import * as ns` support: recommend throw (YAGNI).
- O5 Should `export let|var` throw (recommend yes) or be allowed with snapshot semantics?
- O6 Does the default `libDir` stay `src/lib` once 3f retires `jbc-include-old` and `resolveIncludeDir` is repointed? [INF] yes — they are independent knobs; flag so 3f doesn't merge them.
- O7 `.mjs` extension required on all lib specifiers (all current ones have it [OBS]); builder to confirm a specifier w/o extension throws rather than guesses.
- O8 Node >= version note: `node --test scripts/tests/` verified on v26.8.2 only.

## 9. One-line handoff for 3d (target contract)
In a ported tool's template, inside `<script type="module">` above `<<ct:inline app.mjs>>`, write `<<ct:module components/JbcClipboardUtil.mjs>>` (one per lib module the tool uses); its public exports become `const` names in that script; lib-internal imports are resolved and deduped by the build; old `<<ct:include …>>` lines for that functionality are removed; `<<ct:lib components/styles/base.css>>` replaces `<<ct:include base.css>>` for CSS.

## 10. Builder work order (suggested)
1. Add `libDir`/`resolveLibDir`, `MODULE_RE`/`LIB_RE`, per-call `state`; wire phase 2 after the existing loop (no edits to the existing loop body or regex).
2. Implement `parse`+`transform`+`emit`. 3. Write T1-T10. 4. Run `node --test scripts/tests/`, then `node scripts/build-all.mjs --check` (must be 10/10). 5. Hand off per plan.md Deliverables.
Only `scripts/build-tool.mjs` and `scripts/tests/**` change; update the header doc comment in build-tool.mjs to describe the two new tokens (comment-only, does not affect output).


---

## Builder round (r1)

**Built:** ESM inlining in `scripts/build-tool.mjs`, additive. Locked decisions O1-O8 followed: two tokens `<<ct:module PATH>>` (ESM transform) and `<<ct:lib PATH>>` (verbatim), both resolved against new injectable `libDir` (default `resolveLibDir()` = `src/lib`, independent of `resolveIncludeDir`). `TOKEN_RE`, `BANNER`, `resolveIncludeDir`, `PROJECT_TOKEN_RE` and the include/inline loop are unchanged. `buildTool(dir,{includeDir,project,libDir})`.

**Mechanism:** after the include/inline fixpoint, `LIB_RE` then `MODULE_RE` are expanded in document order with a per-call `state` (page-wide dedup by absolute path; no module-level state). Each module becomes `const __ct_<relpath_id> = (() => { body; return { exports }; })();` (own function scope, because the lib has 8 real top-level name collisions). Column-0 line-anchored parse (no tokenizer). `import {a, b as c} from './X.mjs'` becomes `const { a, b: c } = <depId>;`; deps are emitted DFS post-order (source order), once. Root token adds `const { exports } = __ct_<id>;` at the token site. `export function/async/const/class` get `export ` dropped; `export {…};` (multi-line, multiple, `a as b`, with comments inside the braces, which JbcDateTimeUtil uses) is removed and recorded. Throws (`ESM inliner: <libRel>:<line>: …`): `export default`, `export *`, re-exports, `export let|var`, `import X`/`* as`/side-effect/`import()`/`import.meta`, bare or non-`.mjs` specifiers, cycles (full chain), path escape, missing file, root-vs-root export-name collision (names both tokens), literal `<<ct:` in module/lib output. O2 (`as ns`) and O3 (multi-site) deferred.

**Tests:** `scripts/tests/esm-inline.test.mjs` (19 node:test cases): T1 strips/blocks, T2 prose safety, T3/T3b/T4/T4b/T4c/T4e relative/cross-subdir/deep/dedup/ordering/determinism, T5/T5b real lib (utils, components, 3-deep dither chain, `ct:lib` css/html verbatim + `$` literal + project tokens after), T6 whole-lib equivalence (every real `utils|components` .mjs transforms and vm-parses; util export keys equal native `import()`), T6b vm-evaluated ByteUtil bundle, T7 14 unsupported constructs, T8 cycle/self/escape/missing, T8c collision, T8d isolation, T9 all shipped tools byte-identical in-process, T9c/T10 include/inline verbatim + injection seam, `bundleModule` purity.

**Tallies:** `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed" (10/10 up to date). `node --test scripts/tests/` -> pass 19, fail 0.

**Files touched:** `scripts/build-tool.mjs` (edited), `scripts/tests/esm-inline.test.mjs` (new). Nothing under `src/**` edited by me.

**Notes for 3d:** bundle is whole-module (no tree-shake). Place the token inside `<script type="module">` above the code using the names. Not exercised: `slice-tool.mjs` on a template carrying `ct:module` (R6).

**Handoff line for 3d:** in a ported tool's template, inside `<script type="module">` above `<<ct:inline app.mjs>>`, write `<<ct:module components/JbcClipboardUtil.mjs>>` (one per lib module used; its exports become `const` names there; lib-internal imports are resolved and deduped), and use `<<ct:lib components/styles/base.css>>` / `<<ct:lib components/footer.html>>` for CSS/HTML.


---

## Test-writer round (r1)

**Delivered:** `scripts/tests/esm-inline-hardening.test.mjs` (new, 19 cases H1-H19). Builder's `esm-inline.test.mjs` untouched. `node --test scripts/tests/` -> 38 pass / 0 fail. `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed". `scripts/build-tool.mjs` NOT touched (all mutations ran on a scratch copy of `scripts/` with `src` symlinked; nothing to restore in the repo).

### Adversarial review of the builder's 19
Bind well: T1 (all export forms, but see weak), T3/T3b/T4/T4b/T4c/T4e (dedup, order, `./` vs `../`), T7 (14 constructs, asserts file:line + construct text), T8/T8c, T5b, T9 (byte-identical whole shipped tools), bundleModule purity.
Weak / gaps (all addressed by H-cases unless noted):
- T1, T3, T5, T6 only regex-match or `vm.Script` PARSE the output; nothing executed it, so a wrong binding (alias dropped, root binding missing) could hide. -> H1, H2, H4, H9, H17 execute bundles.
- T2 prose safety only had indented/comment text; never an indented line inside a template literal, so a loosened column-0 anchor SURVIVED the whole old suite (mutation M14). -> H19 kills it.
- T6 never evaluated bundles (only parse + key equality via transform); H17 evaluates every real util bundle in a vm and compares keys to native import(). Components remain parse-only (DOM; not natively importable) - accepted limit.
- T6b strips the root binding by regex (fragile but passes); H17 supersedes.
- T7 first case regex `/ExportDefault|export default/` is loose; H4/H14 pin the exact `unsupported construct: export default` + line number.
- T4's ordering check is by string index only; H7 asserts real execution order via side effects.
- No coverage before for: CRLF, `export function*`/`async function*`, comments/trailing comma in `export {}` and multi-line imports, text after an export block, `export {x as default}`, duplicate export name, identifiers starting `export`/`import` at col 0, module-id collision suffix, root-binding site, module already emitted as dep later bound as root, no-export module, tokens inside an inlined file, literal `<<ct:` guard, 3-chain cycle, failed-build state leak, and the `--check` CLI gate (exit codes, stale byte, missing file, default libDir). All now covered (H1-H19). The `--check` gate is H18 (spawns CLI) plus T9 (in-process) plus the build-all run.

### Mutation check (copy of build-tool.mjs mutated; suite run each time)
All 26 killed except M14 on the OLD suite alone (killed once H19 added). Mutation -> first catchers:
- M1 skip `export function` strip -> T1,T2,T5,T6,H1,H17
- M2 skip `export const/class` strip -> T1,T4,T5,T6,T8d,H1,H2,H4...
- M3 keep `export {}` text -> T1,T5,T6,H2,H5
- M4 export-block swallows next line -> T1,H2
- M5 dedup broken -> T3,T4,T4b,T4c,T4e,bundleModule,H7,H9
- M6 cycle guard dropped -> T8,H14,H15
- M7 dedup key = raw spelling (no path normalise) -> T3,T4c,T8,H9
- M8 pop stack before deps (cycle-guard variant) -> T8,H14,H15 (NOT an ordering mutation)
- M26 chunk order reversed (real ordering break) -> T3,T3b,T4,T5,H1,H4,H7
- M9 alias dropped -> T3,H1,H4
- M10 `export default` silently accepted -> T7,H4,H14
- M11 root binding skipped -> T1,T4,T5,T8d,H1...
- M12 per-call state made global -> T3,T4b,T4c,T4e,T8d,T9c,H4...
- M13 path-escape check off -> T8
- M14 col-0 anchor loosened to indented -> H19 ONLY (survived old suite)
- M15 identifier-prefix guard `(?![\w$])` removed -> H6 ONLY
- M16 per-module IIFE removed -> T1,T4,T5,T8d,H1...
- M17 CRLF normalise dropped -> H5 ONLY
- M18 literal `<<ct:` guard off -> H13 ONLY
- M19 id collision suffix off -> H11 ONLY
- M20 multi-declarator `export const a, b` accepted -> T7
- M21 `ct:lib` not verbatim -> T5b,H13
- M22 root-collision check off -> T8c
- M23 non-.mjs specifier accepted -> T7
- M24 duplicate export name accepted -> H3 ONLY
- M25 `export async function` strip dropped -> T1,H1
Harness (scratch, not shipped): `.../scratchpad/mut.mjs`.

### Defects
None found in `build-tool.mjs`. Observations (not patched): components (`components/*.mjs`) are only syntax-checked, never evaluated or export-key-compared (need DOM); `H17`'s id extraction regex is slightly clumsy but correct; the "no project.json" stderr warning appears during test runs (harmless, from `project: null`/default-project paths).


---

## Verifier round (r1)

**VERDICT: PASS.** Full evidence: `findings/verifier-r1-v1-verdict.md`.
- `node scripts/build-all.mjs --check` -> 10/10 up to date, 0 failed. `node --test scripts/tests/` -> 38 pass / 0 fail.
- Independent inline of Dither + Zip + JbcConfirm + base.css: 0 col-0 export/import, ByteUtil defined once and ordered before dependents; `export default` throws `ESM inliner: utils/X.mjs:1: unsupported construct: export default`.
- Scope: no `src/**` file modified after plan.md (filesystem mtimes; git blocked); no template uses `ct:module`/`ct:lib`. Only `scripts/build-tool.mjs` + `scripts/tests/` changed.
- Non-vacuity: 3 mutations on a scratch copy (dedup off, export-default off, function-export strip off) were all killed (8/2/8 failures). Only 3 of the claimed 26 were sampled.
- No repairs made by the verifier.
