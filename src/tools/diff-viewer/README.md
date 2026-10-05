# diff-viewer

A single-file, dependency-free HTML **visual diff** tool. Paste an original
text into **A** and a changed version into **B**; a hand-rolled **Myers diff**
aligns them line by line, highlights what was added, removed, and changed
(including **word-level** highlighting inside changed lines), and shows the
result **side-by-side** or **inline** (unified). It also emits a standard,
copyable **unified diff**. Everything runs locally in the browser — no network
requests, nothing leaves your machine.

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works fine
served from a static file server if you'd rather.

1. **Paste two texts.** Put the original in **A — original** and the changed
   version in **B — changed**. The diff updates live (debounced) as you type.
   **⇄** swaps A and B; each side has its own **Clear** (with a confirm when the
   box holds content).
2. **Options** change what counts as equal — the displayed text always stays
   exactly as entered:
   - **Ignore leading/trailing whitespace** — trims each line before comparing.
   - **Ignore all whitespace** — ignores every space/tab (subsumes the above,
     which is then disabled).
   - **Ignore case** — case-insensitive comparison.
3. **Views** (toggle any time):
   - **Side-by-side** — A and B in two aligned columns with line numbers; added,
     removed, and changed lines are color-coded, and changed lines show a
     word-level highlight of exactly what differs.
   - **Inline** — a single column of `+` / `−` lines (a unified view).
4. **Stats** above the diff summarize `N added · M removed · K changed`
   (a replaced line counts as *changed*; surplus lines on either side count as
   added/removed).
5. **Copy unified diff (📋)** copies a standard `--- / +++ / @@` unified diff
   with 3 lines of context — ready to paste into a patch, review, or commit
   message. It's disabled when there is no difference to copy.

Empty inputs are handled gracefully (a prompt to enter text); identical inputs
(under the current options) show "No differences".

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. The tool is
authored under `source/` and assembled into the one self-contained file (see
`docs/conventions.md` § "Build-assembled tools"):

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (Myers diff, option
  normalization, word diff, unified-diff generation). Imported directly by unit
  tests.
- `source/app.mjs` — the DOM wiring (inputs, options, views, rendering,
  persistence).

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then
  commit both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It's assembled by a dependency-free Node build (see
  "Developing" above).
- The diff is a hand-rolled **Myers O(ND)** algorithm (Eugene W. Myers, 1986):
  fast for typical inputs (cost scales with the edit distance). The same core
  routine powers both line-level and word-level diffing. Line endings (CRLF/CR)
  are normalized to LF before diffing.
- For automated testing, the page exposes `window.__diffViewer` with the pure
  functions `diffLines(a, b, opts)`, `diffWords(a, b)`,
  `toUnifiedDiff(a, b, opts, cfg)`, plus `splitLines`, `normalizeLine`,
  `myersDiff`, and `tokenizeWords`; the deterministic entry points
  `setInputs(a, b)`, `setView(view)`, `setOption(name, value)`, and `render()`;
  and a live (non-cloned) `state` reference. This namespace has no effect on
  normal use.

<!-- readme-footer: keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
