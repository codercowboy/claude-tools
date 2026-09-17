# color-converter

A single-file, dependency-free HTML tool for converting a batch of mixed
`rgba()`/hex colors into one consistent format. Type or bulk-paste colors,
see a swatch of each, and copy them out as `rgba()` or hex — per color or
the whole list.

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works
fine served from a static file server if you'd rather.

**Rows are the source of truth.** Everything else (the two output
textareas) is derived live from the current rows.

1. **Bulk paste** — paste a batch of colors into the top textarea, one per
   line, hex and rgba mixed freely. Click **Convert** to (re)generate rows
   from it: existing rows are erased first, then one row is created per
   non-blank line (lines that don't parse still become rows, in an invalid
   state, so you can see and fix them inline). A summary reports how many
   rows were generated and how many couldn't be parsed. Convert **replaces**
   the row list each time — edit the paste box and click Convert again to
   regenerate from the latest text, rather than accumulating on top of the
   previous batch. **Clear** empties only the paste box (behind a
   confirmation) — it never touches existing rows.
2. **Rows** — each row has an editable input that accepts either format
   (parsed live as you type), a swatch, a read-only hex field with its own
   copy button, a read-only rgba field with its own copy button, and a
   trash button that removes just that row, behind a confirmation dialog
   (Enter confirms, Esc cancels, click the backdrop to cancel). Use **Add
   row** to append a blank row and start typing directly.
   - The swatch is neutral/blank while a row is empty, shows a hatched
     red pattern when the row's text doesn't parse, and shows the actual
     color (with a checkerboard behind it when alpha < 1) once valid.
3. **Outputs** — the two textareas at the bottom (`RGBA` and `HEX`, one
   value per line) always mirror the current rows, in order, and update
   automatically whenever rows are added, edited, or removed. Each has a
   **Copy all** button. They are read-only — edit colors via the rows,
   not the output boxes.
4. **Remove all** — clears every row, behind a confirmation dialog
   (Enter confirms, Esc cancels, click the backdrop to cancel). Disabled
   when there are no rows.

Per-row remove, **Clear**, and **Remove all** all share the same
confirmation dialog, with a message specific to the action.

### Accepted color formats

- Hex, with or without a leading `#`: `#rgb`, `#rgba`, `#rrggbb`,
  `#rrggbbaa` (shorthand nibbles are doubled, e.g. `#abc` → `#aabbcc`).
- Functional `rgb()`/`rgba()` (the two names are interchangeable), comma
  syntax with optional alpha: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`.
- Functional modern slash syntax, alpha required: `rgb(255 0 0 / 0.5)`.
- Channels clamp to 0–255, alpha clamps to 0–1. Whitespace and case are
  tolerated everywhere.
- **Not supported:** named CSS colors (`rebeccapurple`), `hsl()`/`hwb()`/
  `lab()`/`lch()`, and percentage channels (`rgb(50%, 0%, 0%)`) — any of
  these are treated as invalid input.

### Invalid rows in the output textareas

To keep both output textareas line-aligned with the rows (and with each
other), an invalid row emits the literal placeholder:

```
INVALID: <original text you typed>
```

An empty row (nothing typed yet) emits a blank line instead — distinct
from an invalid row, so a fresh row doesn't read as an error.

## Notes

- Vanilla HTML/CSS/JS only — no build step, no CDN, no npm dependencies.
  Works offline and via `file://`.
- Canonical formatting matches the sibling `color-picker` tool: `rgba(r,
  g, b, a)` with 0–255 integer channels and a trimmed alpha (always
  included, even when `a` is `1`); lowercase `#rrggbb` hex, or
  `#rrggbbaa` only when alpha is less than 1.
- For automated testing, the page exposes `window.__colorConverter` with
  the pure `parseColor(str)`, `rgbaString(color)`, `hexString(color)`
  functions; action helpers `addRow(rawText)`, `bulkConvert(text)` (replaces
  the row list — erases existing rows, then regenerates from `text`),
  `removeRow(id)`, `removeAllRows()` (both direct, non-modal actions — the
  UI's trash button and Remove-all button go through a confirmation dialog
  first); a live (non-cloned) `state` reference (`state.rows`); and
  derived-output getters `rgbaOutput()` / `hexOutput()`. This namespace has
  no effect on normal use.

<!-- readme-footer: keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
