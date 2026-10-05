# diff-viewer — tests

Two layers, both required (see `docs/conventions.md` § "Pure-logic unit tests"):

1. **`node --test` unit tests** — `tests/unit/*.test.mjs`, importing the pure,
   DOM-free engine from `../../source/logic.mjs` directly (no browser, no
   extraction hack). Exhaustive coverage of the diff algorithm and formatting.
2. **`@playwright/test` browser e2e** — `tests/diff-viewer.e2e.mjs`, loading the
   shipped `index.html` via `file://` and driving it through `data-testid` hooks
   and the `window.__diffViewer` test API.

`build:check` runs first (via `pretest:unit` / `pretest:e2e`), so a stale build
(source/ drifted from index.html) fails the run before any test executes.

## Running

```
cd src/tools/diff-viewer
npm install
npx playwright install chromium   # if the browser is missing
npm run test:unit                 # node --test
npm run test:e2e                  # playwright
npm test                          # unit then e2e
```

## Unit tests (`tests/unit/`)

- **`myers.test.mjs`** — the Myers O(ND) core (`myersDiff`): empty/identical/
  entirely-different sequences, single insert/delete, the canonical ABCABBA →
  CBABAC edit-distance example, a custom `eq` comparator, and two fuzz loops
  (ops always reconstruct both inputs; edit-script length never exceeds N+M).
  Also the lossless helpers `splitLines` (empty/null, CRLF/CR normalization,
  trailing-newline final empty line), `normalizeLine` (trim / all-whitespace /
  case options and their composition), and `tokenizeWords` (lossless join,
  word/whitespace/other-char granularity).
- **`diff-lines.test.mjs`** — `diffLines` op sequences (equal / insert / delete /
  replace) and their `aStart`/`bStart`/`aLines`/`bLines` fields; `computeStats`
  accounting (added / removed / changed, including surplus lines on either side
  of a replace counting as added/removed); edge cases (both empty, empty A,
  empty B, identical, entirely different, single-line, trailing newline, very
  different lengths, CRLF-vs-LF equality); and every ignore-* option changing
  what counts as equal while the original text is preserved verbatim.
- **`diff-words.test.mjs`** — `diffWords` intra-line segments: identical/empty,
  word replace, pure insert/delete, adjacent same-type coalescing (and the
  no-two-consecutive-same-type invariant), and reconstruction of both sides.
- **`unified.test.mjs`** — `toUnifiedDiff`: empty on identical/empty input;
  `--- / +++` header with default (`a`/`b`) and custom names; the canonical
  `@@ -x,y +x,y @@` hunk with 1-based ranges; 3-line context capping;
  `context: 0`; hunk merging (nearby changes → one hunk, far-apart → two);
  hunk-count consistency; top-insert / end-delete shapes; and option
  pass-through (ignoreCase / ignoreAllWhitespace collapse to empty; shown text
  is the original, not the normalized key).

## e2e tests (`tests/diff-viewer.e2e.mjs`)

Grouped by `test.describe`:

1. **engine wired into the page** — `window.__diffViewer` exposes the pure
   functions + entry points, and produces correct results in-page (smoke; the
   exhaustive coverage lives in the unit layer).
2. **entering A and B renders a diff** — live typing produces added/removed/
   changed rows + stats; identical → "No differences" + copy disabled; empty →
   prompt; word-level highlight spans (`.wd-del` / `.wd-ins`); swap (⇄).
3. **view toggle** — side-by-side ↔ inline/unified, `aria-pressed` and
   visibility flip both ways; inline view renders `+`/`−` rows.
4. **diff options affect the result** — each of ignore leading/trailing
   whitespace, ignore all whitespace (which disables trim), and ignore case
   turns a corresponding change into "No differences".
5. **copy unified diff** — clicking flashes "Copied"; disabled when identical.
6. **persistence across reload** — inputs, view, and options are written to
   `localStorage` and restored after reload (driven via hooks + a settle wait to
   avoid the `file://` write-then-reload flake, per `docs/conventions.md`).
7. **clear with confirm** — clearing a non-empty box shows the `confirmDialog`
   modal; confirming empties it and leaves the other side untouched.
8. **mobile viewport (375×667, dpr2, touch)** — no horizontal page overflow in
   either view.
9. **first-load Help popup** — auto-shows once on a genuinely fresh
   `browser.newContext()` (initial focus on the ✕) and not again after; does not
   auto-show when the seen key is pre-seeded; opens via the `?` button with
   `role="dialog"` / `aria-modal="true"`; closes via ✕ / Esc / backdrop with
   focus returning to the Help button; focus is trapped inside the dialog.

## Test hooks used

- **`data-testid`** on all interactive elements (`input-a`, `input-b`,
  `clear-a-btn`, `swap-btn`, `opt-trim`, `opt-all-ws`, `opt-case`,
  `view-split-btn`, `view-inline-btn`, `copy-unified-btn`, `stats`,
  `diff-split`, `diff-inline`, `help-button`, `help-overlay`, `help-modal`,
  `modal-close-x`).
- **`window.__diffViewer`** — pure functions (`diffLines`, `diffWords`,
  `toUnifiedDiff`, `splitLines`, `normalizeLine`, `myersDiff`, `tokenizeWords`)
  and deterministic entry points (`setInputs`, `setView`, `setOption`,
  `render`) plus a live `state` reference. Inert for normal users.
