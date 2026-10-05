# diff-viewer — Implementation Plan (PLAN)

Derived from `DESIGN.md`. Build order for the Worker stage. Vanilla JS/Node,
zero deps, ES modules, `file://`-safe, build-assembled under `source/`.

## 1. `source/logic.mjs` (pure engine — write first, it's the core)

1. `splitLines(text)` — `''`/null → `[]`; else CRLF/CR→LF then split on `\n`.
2. `normalizeLine(line, opts)` — apply ignore-all-whitespace (regex strip),
   else ignore-leading/trailing (trim); then lowercase if ignore-case.
3. `myersDiff(a, b, eq)` — greedy O(ND): furthest-reaching D-paths with a saved
   `trace` per `d`, then backtrack to an ordered list of
   `{ type:'equal'|'delete'|'insert' }` element ops. `eq(x,y)` compares keys.
   Handle empty inputs (either/both length 0).
4. `diffLines(a, b, opts)` — split both, build normalized key arrays, run
   `myersDiff` with `===` on keys, then walk the raw ops with `ai`/`bi` cursors,
   coalescing consecutive non-equal into `replace`/`delete`/`insert` block ops
   and consecutive equal into `equal` blocks. Return `{ ops, stats }`;
   `computeStats(ops)` per DESIGN's rules.
5. `tokenizeWords(str)` — split into word-runs / whitespace-runs / single other
   chars (keep tokens, no loss: `join('') === str`).
6. `diffWords(a, b)` — tokenize both, `myersDiff` over tokens, coalesce adjacent
   same-type ops into `{ type, text }` segments.
7. `toUnifiedDiff(a, b, opts, cfg)` — flatten `diffLines` ops to tagged rows
   (`' '|'-'|'+'` with running a/b line numbers), return `''` if no change,
   else group into hunks with `context` (default 3), merging change runs within
   `2*context`, and emit `--- `/`+++ ` headers + `@@ -aS,aC +bS,bC @@` bodies.
8. `export { diffLines, diffWords, toUnifiedDiff, splitLines, normalizeLine,
   myersDiff, tokenizeWords }`.

Sanity-check the engine with a throwaway `node --input-type=module` run before
wiring the UI (round-trip a couple of known diffs + a unified-diff shape).

## 2. `source/index.template.html`

Page shell mirroring base64-tool: `<head>` (charset, viewport, title, og/twitter
meta), `<style>` with `:root` light + `@media (prefers-color-scheme: dark)`
palette (incl. add/remove/change tokens and `--jbcc-*` accent), then
`<<ct:include base.css>><<ct:inline styles.css>>`. Body:
- header (h1 + subtitle + `?` help button);
- inputs row: A textarea (+ Clear), B textarea (+ Clear), Swap button;
- controls bar: option checkboxes; view toggle group; stats `aria-live`; Copy
  unified diff button;
- diff output container (side-by-side pane + inline pane, one shown at a time);
- Help overlay/dialog with `modal-close-x`;
- `<<ct:include footer.html>>`; `<script><<ct:include copy.js>></script>`;
  `<script><<ct:include JbcConfirm.mjs>></script>`;
  `<script type="module"><<ct:inline app.mjs>></script>`.
All interactive elements get `data-testid`s.

## 3. `source/styles.css`

- Layout (app container, header, help button — reuse base64 patterns).
- Inputs grid (two columns wide, stack < 720px).
- Controls bar (wrap on narrow).
- View toggle group styled like base64's mode-toggle (`aria-pressed` = accent).
- Diff table: monospace rows, line-number gutters, add/remove/change bg + gutter
  colors (light + dark); intra-line `.wd-del`/`.wd-ins` span highlights.
- Side-by-side: 2-pane grid; on narrow screens the pane is an
  `overflow-x:auto` container (no page overflow).
- Help modal + `modal-close-x` (copy base64's block).
- `[hidden]{display:none!important}` already from base.css; keep view panes and
  overlay guarded.
- `button:hover:not(:disabled):not(.jbcc-btn)` (hover-specificity trap).
- Responsive tweaks (44px targets), reduced-motion.

## 4. `source/app.mjs`

- Inline the engine: `<<ct:inline logic.mjs>>`.
- DOM refs; `state = { view, opts:{ignoreLeadingTrailing, ignoreAllWs,
  ignoreCase} }` (texts read from the textareas; view/opts here).
- Persistence `diff-viewer:v1` (load/save try/catch); help-seen
  `diff-viewer:help-seen:v1`.
- `render()` — read A/B, compute `diffLines`, update stats + the active view +
  the copy button enabled/disabled; debounced on input.
- `renderSideBySide(ops)` / `renderInline(ops)` — build rows with `textContent`;
  for `replace` pairs call `diffWords` and emit del/ins spans. Left/right line
  numbers.
- View toggle, option checkboxes (wire the all-whitespace → disable
  leading/trailing), Swap, Clear (via `confirmDialog` when non-empty), Copy unified
  (`ctCopy`+`ctFlash`).
- Help modal (focus trap, Esc/backdrop, ✕, focus return) — port base64's.
- Set `--jbcc-accent` etc. via the palette so confirm's Yes reads as primary.
- `init()`: restore state, first render, auto-show help once.
- `window.__diffViewer = { diffLines, diffWords, toUnifiedDiff, splitLines,
  normalizeLine, myersDiff, tokenizeWords, setInputs, setView, setOption,
  render, state }` (inert).

## 5. `package.json`

Clone base64-tool's: name `@codercowboy/diff-viewer`, `groupId
com.codercowboy`, same scripts (build/build:check/test/test:unit/pretest:*/
test:e2e/serve), `@playwright/test` devDep, engines node>=20, keywords.

## 6. `README.md`

Usage (A/B, options, views, stats, copy unified), Developing (build from
source) section, notes on the algorithm + `window.__diffViewer`, then the
verbatim `src/tools/include/readme-footer.md`.

## 7. Build & validate

`cd src/tools/diff-viewer && npm run build && npm run build:check` — both exit 0.
Leave the tree source-only (no root npm install; tests/preview handled later).
