# diff-viewer — Visual Diff (DESIGN)

Source-of-truth spec for the Visual Diff tool. Roadmap entry: **Visual Diff**
(`docs/tools-roadmap.md`).

## What it is

A single-file, zero-dependency, `file://`-safe web tool that diffs two blocks
of text — **A (original)** vs **B (changed)** — with a **hand-rolled Myers
diff** at the line level, optional intra-line **word** highlighting on changed
lines, two views (**side-by-side** and **inline/unified**), whitespace/case
options, a stats line, and a **Copy unified diff** action. Everything runs
locally; nothing leaves the browser.

## Non-goals

- No syntax highlighting, no language awareness, no 3-way/merge, no patch
  application. This is a *viewer* that also emits a standard unified diff.
- No file upload (paste/type only) — keeps scope tight; the roadmap entry is
  "paste two texts". (Could be added later.)

## The engine — `source/logic.mjs` (pure, DOM-free, unit-tested)

The whole diff is pure functions with **no** `document`/`window`/`localStorage`,
exported as an ES module and inlined into the shipped app via
`<<ct:inline logic.mjs>>`. Unit tests import this file directly.

### Algorithm: Myers O(ND)

Line diffing uses the greedy **O(ND) Myers** algorithm ("An O(ND) Difference
Algorithm and Its Variations", Eugene W. Myers, 1986): find the shortest edit
script by walking the edit graph's furthest-reaching D-paths, recording a trace
per edit-distance `d`, then **backtracking** the trace to recover the ordered
edit sequence (equal / delete / insert). The same routine (`myersDiff`) is
reused for word-level diffing by running it over token arrays instead of line
arrays.

- Comparison is done on a **normalized key** per element (see options) while the
  emitted ops always carry the **original** text — so "ignore case/whitespace"
  changes what counts as equal without altering what's displayed or copied.
- Complexity O(N·D) where D is the edit distance — fast for typical inputs
  (small D). Worst case (completely different inputs) is O(N·M); the UI adds a
  soft large-input warning rather than a hard cap.

### Line splitting

`splitLines(text)`:
- `''`/`null` → `[]` (empty input contributes zero lines; stats stay zero).
- Otherwise normalize CRLF/CR → LF, then split on `\n`. A trailing newline
  therefore yields a final empty line (a file that ends in `\n` genuinely has a
  final empty line) — documented, not hidden.

### Options → normalization

`normalizeLine(line, opts)` builds the comparison key:
- `ignoreCase` → lowercase.
- `ignoreAllWhitespace` → remove every whitespace char (wins over the next).
- `ignoreLeadingTrailingWhitespace` → trim only leading/trailing whitespace.

Order: apply all-whitespace removal if set, else leading/trailing trim if set;
then lowercase if set. `ignoreAllWhitespace` subsumes leading/trailing.

### Public functions (the required set)

- **`diffLines(a, b, opts = {})` → `{ ops, stats }`**
  - `ops`: an ordered list of block ops. Every op has `type`, `aStart`,
    `bStart` (0-based positions in the respective original line arrays),
    `aLines`, `bLines`:
    - `equal`   — `aLines`/`bLines` are the matched lines (same after
      normalization; original text may differ, e.g. under ignore-case).
    - `delete`  — `aLines` non-empty, `bLines` empty (removed from A).
    - `insert`  — `bLines` non-empty, `aLines` empty (added in B).
    - `replace` — both non-empty (a changed block: consecutive deletes+inserts
      coalesced). Adjacent non-equal edits from Myers are grouped into one op;
      a group with both deletes and inserts is a `replace`, otherwise a pure
      `delete`/`insert`.
  - `stats`: `{ added, removed, changed }`.
    - `insert` op → `added += bLines.length`.
    - `delete` op → `removed += aLines.length`.
    - `replace` op → `changed += min(aCount, bCount)`; any surplus deleted lines
      add to `removed`, surplus inserted lines add to `added`. (So a 2→2 replace
      is 2 changed; a 3→1 replace is 1 changed + 2 removed.)
- **`diffWords(a, b)` → `[{ type, text }]`**
  - Intra-line diff of two strings. Tokenizes each into runs of word chars,
    runs of whitespace, and single other chars (`/\s+|\w+|[^\s\w]/`-style), runs
    Myers over the token arrays, and coalesces adjacent same-type ops. `type` is
    `equal | delete | insert`. Used to highlight what changed inside a
    `replace` line pair. Word-run tokenization gives word granularity, and
    naturally degrades to near-char granularity for punctuation/no-space runs.
- **`toUnifiedDiff(a, b, opts = {}, cfg = {})` → `string`**
  - Standard unified diff: `--- <aName>` / `+++ <bName>` headers and
    `@@ -aStart,aCount +bStart,bCount @@` hunks with `cfg.context` (default 3)
    context lines; change runs within `2*context` of each other are merged into
    one hunk. `cfg`: `{ context, aName='a', bName='b' }`. Returns `''` when there
    are no differences.
- Helpers also exported for tests/reuse: `splitLines`, `normalizeLine`,
  `myersDiff`, `tokenizeWords`.

## The app — `source/app.mjs` (DOM / render / state)

### Single source of truth

State = **the two input texts + the option flags + the view mode**. Everything
shown (side-by-side rows, inline rows, stats, unified-diff text) is **derived**
from `diffLines`/`diffWords`/`toUnifiedDiff` on every change — never stored and
never written back into the inputs (see conventions § "Derived views have a
single source of truth"). Rendering is debounced (~150 ms).

### Controls

- **A (original)** and **B (changed)** textareas, side by side on wide screens,
  stacked on narrow. Each has a **Clear** button and the pair has a **Swap
  A ↔ B** button.
- **Options** (checkboxes): *Ignore leading/trailing whitespace*, *Ignore all
  whitespace*, *Ignore case*. (When "all whitespace" is checked, the
  leading/trailing box is disabled — it's subsumed.)
- **View toggle** (two-button group, `aria-pressed`): **Side-by-side** /
  **Inline**.
- **Stats line** (polite `aria-live`): `N added · M removed · K changed`, or
  "No differences" when identical under the current options, or a hint when
  both inputs are empty.
- **Copy unified diff** button (uses `ctCopy`/`ctFlash`), copies
  `toUnifiedDiff(...)`. Disabled when there is no diff to copy.

### Views (rendered with `textContent`, never `innerHTML`, so user text is safe)

- **Side-by-side**: a two-pane aligned grid. Left = A with its line numbers,
  right = B with its line numbers. `equal` → paired rows; `delete` → left line +
  empty right filler; `insert` → empty left filler + right line; `replace` →
  align `aLines[i]` with `bLines[i]`, padding the shorter side with fillers, and
  for each aligned pair run `diffWords` to highlight changed segments (del/ins
  spans). Add/remove/change get distinct gutter + background colors. On narrow
  screens the pane scrolls horizontally **inside its own container** (no page
  overflow).
- **Inline/unified**: single column. `equal` → context rows (both line
  numbers); `delete` → `−` rows; `insert` → `+` rows; `replace` → the `−` rows
  then the `+` rows, with word highlighting across the aligned pairs. Long lines
  wrap or scroll within the container.

### Conventions honored

- **First-load Help** popup (auto-shows once; key `diff-viewer:help-seen:v1`;
  `?` button; `role="dialog"`/`aria-modal`; initial focus to the ✕; focus trap;
  Esc + backdrop close; focus return; `modal-close-x` in the corner; `[hidden]`
  guarded with `display:none !important`). Reduced-motion aware.
- **Persistence** `diff-viewer:v1`: `{ textA, textB, view, opts }` — durable
  input + UI state only; the derived diff/stats/unified output are **not**
  stored (recomputed on load). All reads/writes try/catch-degrade; the tool
  works fully with no stored state.
- **Copy** via shared `ctCopy`/`ctFlash`; copy buttons carry `title` +
  `aria-label`.
- **Clear buttons use `confirmDialog`** when the textarea holds meaningful content
  (a pasted block is hard to recreate) — the shared confirm component, with the
  tool's `--jbcc-*` accent set. Swap needs no confirm (reversible). The tool sets
  `--jbcc-accent`/text so "Yes" reads as a filled primary, and the generic
  `button:hover` rule excludes `.jbcc-btn` (conventions' hover-specificity trap).
- **Accessibility**: real controls with labels; `aria-pressed` on toggles;
  icon/label copy buttons titled; visible `:focus-visible`; polite `aria-live`
  stats; reduced-motion respected. Responsive, finger-friendly targets, no
  horizontal page overflow (wide diff scrolls in its own container).
- **Testability**: `data-testid`s on interactive elements + an inert
  `window.__diffViewer` namespace exposing the pure functions
  (`diffLines`, `diffWords`, `toUnifiedDiff`, plus helpers), the deterministic
  entry points (`setInputs`, `setView`, `setOption`, `render`), and a live
  `state` reference.
- **Meta**: og/twitter tags; build-inlined HTML footer; light + dark theme.

## Edge cases

- Both empty → "Enter text in A and B to compare" hint, no diff, copy disabled.
- Identical (under options) → "No differences", empty views cleared, copy
  disabled (unified diff is empty).
- One side empty → all inserts (or all deletes).
- CRLF vs LF normalized before diffing (so line-ending-only differences don't
  show unless "ignore all whitespace" is off and endings differ *within* a line
  — they don't, endings are stripped by `splitLines`).
- Very large inputs: a soft warning (via the stats/`aria-live` region) above a
  line threshold; the diff still runs.

## File layout

```
diff-viewer/
├── index.html                 # GENERATED — do not hand-edit
├── source/
│   ├── index.template.html    # shell + include tokens
│   ├── styles.css             # tool CSS
│   ├── logic.mjs              # pure engine (Myers, options, unified diff)
│   └── app.mjs                # DOM wiring, render, persistence
├── package.json
├── README.md
├── DESIGN.md
└── PLAN.md
```
(`tests/` and `preview.png` are added by later pipeline stages.)
