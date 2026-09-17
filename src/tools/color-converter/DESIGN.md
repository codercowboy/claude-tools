# color-converter — Design

Author: Claude. Design lead: Jason. Source-of-truth spec. The planner turns this
into an implementation plan; the worker implements strictly against both.

## Summary

A single, self-contained `index.html` (vanilla HTML/CSS/JS, no build, no
dependencies) for converting a batch of intermixed `rgba()`/hex colors into a
consistent format. You type or bulk-paste colors in either format, see a swatch
of each, and copy them out as `rgba()` or hex — per color or the whole list.

**Motivating problem:** "I had a bunch of colors, some hex and some rgba, mixed
together. I needed them all in one format (or both), and sometimes I wanted to
see a swatch of which color I was dealing with, but couldn't."

## Hard constraints

- **One file.** All HTML/CSS/JS inline in `index.html`. No external assets, no
  CDN, no npm dependencies, no build step. Opens via `file://` or any static
  server.
- **Vanilla.** Standard browser APIs only. Inline `<script type="module">` fine.
- Current Chromium is the test target (Playwright MCP).
- Consistent with the sibling `color-picker` tool where they overlap (canonical
  formatting, copy-button pattern). Code is NOT shared (single-file/standalone
  rule) — the formatting logic is re-implemented here. The one exception is
  the confirm dialog: `tools/include/confirm.js` (`ctConfirm`) and
  `tools/include/footer.html` are pasted verbatim (sentinels included) per
  `docs/conventions.md`.

## Interaction model (READ FIRST — the core decision)

**The rows are the single source of truth.** Everything else derives from them.

- **Rows** hold the canonical list of colors. Each row's input is editable and
  accepts either format; it parses live to a normalized color.
- **Bulk paste + Convert** is a fast way to *generate many rows at once*: it
  erases the current rows, then parses each line of the paste box and
  regenerates rows fresh from it. It is an input path only, and it replaces
  rather than accumulates — the paste box itself is never cleared, so
  re-editing it and clicking Convert again always reflects the latest text.
- **The two output textareas** (RGBA-per-line and HEX-per-line) are **read-only
  and derived live from the rows** — they update whenever the rows change (so
  they "fill in" right after a Convert, and stay correct after hand edits). Each
  has a "Copy all" button.

This avoids confusing two-way binding: data flows **paste → rows**, and **rows →
outputs**. There is no rows ← outputs path.

## Layout (top-to-bottom, responsive)

1. **Header** — title + one-line description.
2. **Bulk input** — a "paste" `<textarea>` labelled "Paste colors, one per line
   (rgba or hex, mixed is fine)", with a **Convert** button and a **Clear**
   button (clears only the paste box, behind a confirm — see "Removal &
   modal"). A small hint shows how many lines parsed / how many were invalid
   after a Convert.
3. **Rows** — a header (Input | Swatch | HEX | RGBA | remove) and the list of
   rows. Below the list: an **Add row** button and a **Remove all** button
   (disabled when empty). Newest rows appended at the bottom (natural reading
   order), OR a persistent empty trailing row that spawns a new one when typed
   in — worker's choice; if using Add row, focus the new row's input.
   - **Desktop header labels, alignment note (fixer pass fix):** the header
     reuses the data row's `grid-template-columns`, whose swatch column is
     28px wide — sized for the 22px swatch box, not for the word "Swatch".
     The header's swatch cell therefore carries no visible label (it's
     collapsed via `font-size: 0`, cell kept in the DOM so the grid columns
     stay aligned with the data rows) — the swatches are self-evident without
     one. All header labels also get `white-space: nowrap` +
     `text-overflow: ellipsis` so a label can never visually collide with its
     neighbor again. See tests/color-converter.e2e.mjs "rows-header column
     labels do not overlap (desktop)".
4. **Outputs** — two side-by-side read-only textareas (stack vertically on
   narrow screens): **RGBA (one per line)** and **HEX (one per line)**, each with
   a **Copy all** button. These mirror the rows in order.

## Row anatomy & behavior

Each row, left → right:

- **Input** — a text `<input>` where the user types/pastes ONE color in rgba or
  hex. Parsed live (on input, lightly debounced is fine).
- **Swatch** — ~20×20 box filled with the parsed color (outline so light colors
  show; checker background when alpha < 1). When the input is empty, neutral
  placeholder; when invalid, a distinct **invalid** state (e.g. hatched / "?")
  — never a crash.
- **HEX output** — read-only text input showing the canonical hex, with a **copy**
  button on its far right. Empty when the row is invalid/empty.
- **RGBA output** — read-only text input showing canonical `rgba(...)`, with a
  **copy** button on its far right. Empty when invalid/empty.
- **Trash** button — opens the confirm modal ("Remove this color?"); removes
  just this row on confirm. See "Removal & modal".

Notes:
- Live conversion: editing the input updates swatch + both outputs + the derived
  output textareas immediately.
- Invalid rows still occupy a line in the output textareas — see "Invalid lines".

## Bulk Convert behavior

- **Convert** first erases all current rows (which, via the rows→outputs
  derivation, also clears both output textareas), then reads the paste
  textarea, splits on newlines, trims, ignores fully blank lines, parses each
  remaining line, and **regenerates one row per line** (invalid lines still
  become rows, in their invalid state, so the user sees which ones failed and
  can fix them inline).
- Report a small summary: e.g. "Generated 12 rows — 2 couldn't be parsed."
- Convert **replaces** the row list, not appends to it — each click reflects
  only the current contents of the paste box, freshly regenerated. (Rationale:
  the paste box is the source of truth for a Convert; running it again with
  edited paste text shouldn't leave stale rows from a prior paste mixed in.)
  No confirmation is needed since the paste box itself isn't touched — the
  input a user would re-Convert from is never lost.
- **Clear** (the paste-box button) opens the confirm modal ("Clear the paste
  box?"); on confirm it empties only the paste textarea — it does not touch
  rows.
- **Convert is this tool's commit/submit action**: a click blurs the active
  element (the paste textarea) to dismiss the on-screen keyboard on mobile,
  per `docs/conventions.md` § Responsive & mobile. (**Add row** is not a
  commit of typed content — it creates an empty row the user is about to type
  into — so it keeps focusing the new row's input instead of blurring.)

## Output textareas (derived)

- Always reflect the current rows, in order, one value per line.
- RGBA textarea: canonical `rgba(...)` per row. HEX textarea: canonical hex per
  row.
- **Invalid lines:** keep line alignment with the rows. Emit a clear placeholder
  for an invalid row (e.g. the original text wrapped as `/* ? original */` or a
  literal `INVALID` token — worker picks one, documents it, and keeps both
  textareas line-aligned with each other and with the rows).
- **Copy all** copies the whole textarea via the Clipboard API (with a
  select/execCommand fallback) and gives brief check feedback.

## Parsing (`parseColor`)

A pure function `parseColor(str) -> {r,g,b,a} | null` (r,g,b ints 0–255; a float
0–1). Accept, case-insensitively, tolerating surrounding whitespace:

- **Hex**, with or without leading `#`: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
  (and the same without `#`). Expand shorthand (`#abc` → `#aabbcc`; alpha nibble
  likewise).
- **Functional rgb/rgba**: `rgb(r, g, b)`, `rgba(r, g, b, a)` — comma-separated;
  also accept the modern slash syntax `rgb(r g b / a)` / `rgba(...)`. Clamp
  channels to 0–255; alpha 0–1. Accept integer or decimal channels; accept alpha
  as `0..1`. (Percentage channels/alpha are optional-nice-to-have; if not
  supported, such a line is simply invalid — document it.)
- Anything else → `null` (invalid).

## Formatting (pure, canonical — match color-picker)

- `rgbaString({r,g,b,a})` → `rgba(r, g, b, a)` with 0–255 int channels and a
  trimmed alpha (e.g. `1`, `0.5`). Always include alpha.
- `hexString({r,g,b,a})` → lowercase `#rrggbb`, or `#rrggbbaa` **only when a < 1**.

These plus `parseColor` are the primary unit-test surface.

## Removal & confirm

- Destructive actions are guarded by the **shared `ctConfirm` component**
  (`tools/include/confirm.js`, pasted verbatim into `index.html` — see
  `docs/conventions.md` § Destructive actions require confirmation), called
  as `if (await ctConfirm(message)) { ...action... }`. It renders
  `role="dialog"`, `aria-modal="true"`, a focus trap, default focus on the
  highlighted **Yes** button, **Enter = confirm**, **Esc = cancel**, backdrop
  click cancels. It's themed to this tool's look via `--ctc-*` CSS variables
  set in `:root` (reusing `--accent`/`--panel`/`--text`/`--radius`/`--focus`/
  `--border-strong`).
  - Per-row **trash** calls it with "Remove this color?" — removes just that
    row on confirm.
  - **Clear** (paste box) calls it with "Clear the paste box?" — empties only
    the paste textarea on confirm.
  - **Remove all** calls it with "Remove all rows?" — empties all rows on
    confirm. Guarded (no-op) when the list is already empty; the button is
    also disabled in that state.
- `window.__colorConverter.removeRow(id)` remains a **direct, non-modal**
  programmatic removal (like `removeAllRows()`) so tests can reset state
  deterministically — it is also what the trash button's confirm handler
  calls. `ctConfirm` is only the UI affordance in front of it; calling
  `removeRow` directly bypasses the dialog entirely.
- **Fixer pass:** the page-wide `button:hover:not(:disabled)` rule had
  higher CSS specificity than the pasted ctConfirm's `.ctc-btn--yes:hover`
  (filter-only), so hovering "Yes" repainted it near-white even though its
  resting state was correctly a filled accent. Fixed in this tool's own CSS
  by excluding `.ctc-btn` from the generic hover rule
  (`button:hover:not(:disabled):not(.ctc-btn)`) — per
  `docs/conventions.md`'s ctConfirm hover-specificity note. The pasted
  ctConfirm block itself was not touched.

## Accessibility & UX

- Labels on every input/textarea; `aria-label`s on icon buttons; visible focus.
- **Tooltips.** Every icon-only button (per-row hex-copy, per-row rgba-copy,
  the row trash button, and both Copy-all buttons) carries a `title`
  attribute in addition to its `aria-label`, so hovering shows a native
  tooltip (per `docs/conventions.md` § Accessibility baseline).
- Convert summary and copy feedback announced politely (`aria-live`) — once, not
  spammy.
- Reasonable widths so three columns of textareas/rows are usable; stack on
  narrow screens.

## Responsive & mobile

- Usable down to ~360px wide: no horizontal page overflow, the paste box /
  rows / output textareas stack, and on narrow screens (`max-width: 700px`)
  every button and icon-button gets a `min-height`/`min-width` bump to the
  ~44px finger-friendly minimum (desktop sizing is untouched — this only
  applies inside the existing mobile media query, which already restacks the
  row layout).
- Covered by a dedicated Playwright `describe` block at a ~375×667 viewport
  (`deviceScaleFactor: 2`, `hasTouch: true`): real taps (not the
  `window.__colorConverter` hooks) on Convert, a per-row copy button, Add
  row, and a trash button + its `ctConfirm` dialog; no-horizontal-overflow
  assertions at 375px and 360px; a ~44px tap-target size check; and an
  `elementFromPoint` hit-test guard proving nothing overlays the Convert
  button or a copy button.
- Convert dismisses the on-screen keyboard on a successful run by blurring
  the active element (see "Bulk Convert behavior" above); Add row
  deliberately does not blur, since it hands focus to a fresh, empty input.

## Testability (build these in)

For Playwright-MCP tests without breaking the single-file rule:

- Stable **`data-testid`** on: paste textarea, Convert button, Clear button
  (`data-testid="clear-paste-btn"`, unchanged even though its visible label is
  now "Clear"), the parse summary, the rows container, each row + its
  input/swatch/hex-output/rgba-output/hex-copy/rgba-copy/trash, Add row,
  Remove all, the RGBA output textarea + its Copy all, and the HEX output
  textarea + its Copy all. The shared `ctConfirm` dialog carries no
  `data-testid`s of its own (it's a pasted, tool-agnostic component) — tests
  drive it via `page.getByRole('dialog')` / `page.getByRole('button', { name:
  'Yes' | 'Cancel' })`.
- Expose **`window.__colorConverter`**: pure `parseColor(str)`,
  `rgbaString(c)`, `hexString(c)`; plus `addRow(str)`, `bulkConvert(text)`
  (REPLACE semantics — erases rows first, then regenerates from `text`),
  `removeRow(id)` (direct, non-modal), `removeAllRows()` (direct, non-modal),
  live `state` (rows), and getters for the derived output strings (e.g.
  `rgbaOutput()`, `hexOutput()`), so tests can assert conversions
  deterministically. Inert for normal users.

## Persistence

Per `docs/conventions.md` § "Persist UI state (localStorage)" (hat-picker is
the exemplar). Versioned key **`color-converter:v1`**. **The rows are the
single source of truth** (see "Interaction model" above), so only each row's
**raw text** and the **paste-box text** are persisted — the parsed color and
the two derived output textareas are DERIVED and are always recomputed from
`rawText` on restore, never stored.

- **Save on change:** adding a row, editing a row's raw text (debounced with
  the existing live-parse), removing a row, Remove all, a bulk Convert, and
  any edit to the paste box each write the current state.
- **Restore on load:** rows are rebuilt from the stored raw-text list (each
  re-parsed fresh via `parseColor`, re-deriving both output textareas exactly
  as if the user had just typed them) and the paste box is refilled with its
  stored text. Missing/unreadable/malformed storage falls back to today's
  behavior: start empty.
- **Best-effort + safe:** every `localStorage` read/write is wrapped in
  `try/catch` and degrades silently; the tool works fully with no stored
  state. Nothing secret is persisted (n/a here).

## Deliverables

- `tools/color-converter/index.html` — the tool.
- `tools/color-converter/README.md` — usage.
- Tests (tester agent): parseColor across all accepted forms + invalids;
  rgba/hex formatting purity; single-row live conversion + swatch; copy buttons;
  bulk Convert replaces rows with a fresh generation from the paste box and
  flags invalids (a second Convert does not accumulate on top of the first);
  derived output textareas match rows and stay line-aligned; Copy all; the
  shared `ctConfirm` dialog (per-row remove, Clear, Remove all — Enter/Esc/
  backdrop-click, correct message per action); tooltip `title` attributes on
  icon-only buttons; a mobile viewport `describe` block with real taps.

## Out of scope (v1)

- Named CSS colors (`rebeccapurple`), hsl/hwb/lab/lch, percentage channels
  (unless trivially added), reordering rows, per-row format toggles, import/
  export files. Keep it focused on the mixed rgba↔hex batch job. (localStorage
  persistence of rows + paste box is now in scope — see "Persistence" above.)
