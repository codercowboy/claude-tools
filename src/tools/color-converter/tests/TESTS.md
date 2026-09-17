# color-converter — test record

Verified against `tools/color-converter/index.html`. The primary,
authoritative verification is the automated `@playwright/test` suite
(`color-converter.e2e.mjs`), run via the CLI against a `file://` URL.

## Automated CLI run (authoritative)

From `tools/color-converter/`:

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

**Result: 73 passed, 0 failed** (~14s). Was 70 passed prior to this fixer
pass — see below.

Updated for this fixer pass (localStorage UI-state persistence):

- Per `docs/conventions.md` § "Persist UI state (localStorage)" (hat-picker
  is the exemplar), the tool now persists to a versioned key
  **`color-converter:v1`**. **The rows are the single source of truth**
  (DESIGN.md), so only each row's **raw text** and the **paste-box text** are
  persisted — the parsed color and the two derived output textareas are
  DERIVED and are always recomputed from `rawText` on restore, never stored.
  `saveState()` is called after every row mutation (add, live-typed edit via
  the existing ~150ms debounce, per-row remove, Remove all, bulk Convert) and
  on every paste-box edit; `restoreState()` runs once at load, rebuilding
  `state.rows` from the stored raw-text list (each re-parsed fresh via
  `parseColor`) and refilling the paste box, then rendering normally.
  Missing/unreadable/malformed storage falls back to today's behavior: start
  empty. Every `localStorage` read/write is wrapped in `try/catch` and
  degrades silently. New `describe` block "localStorage persistence" (3
  tests) covers: building rows via bulk Convert + real typing plus paste-box
  text, asserting the versioned key is written with the raw-text-only shape
  (no `parsed` property), then reloading and asserting rows, the paste box,
  and both derived output textareas are restored/re-derived to exactly match
  pre-reload; per-row remove (via the real `ctConfirm` flow) and Remove all
  each update the stored blob, including persisting an empty rows list, which
  survives a reload without crashing; and a localStorage-throws simulation
  (`Storage.prototype.setItem`/`getItem` overridden via `addInitScript` to
  throw, per the established pattern from color-designer's suite) — no
  `pageerror`, the tool starts empty, and a full interaction pass (Convert,
  live edit, Add row, per-row trash via `ctConfirm`, Remove all) still works
  end-to-end with `saveState()`/`restoreState()` swallowing every
  localStorage error.

Updated for the earlier fixer pass (rows-header "Swatch"/"Hex" label overlap fix):

- Adversarial-review finding (MAJOR, visual): on desktop (≥700px),
  `.rows-header` reused the data row's `grid-template-columns:
  1fr 28px 190px 220px 32px`, whose 28px track is sized for the 22px swatch
  *box*, not for the word "Swatch". With no `white-space`/overflow
  containment, the "Swatch" label painted ~10px past its column into "Hex",
  rendering as an unreadable "SwatcHex" in every desktop screenshot. (Header
  is `display: none` under 700px, so mobile was unaffected.) Fixed by giving
  the swatch header cell no visible label (`font-size: 0` — the swatches are
  self-evident; the cell stays in the DOM so the grid still lines up with the
  data rows) and adding `white-space: nowrap` + `text-overflow: ellipsis` to
  all header labels as a standing safety net. New `describe` block
  "rows-header column labels do not overlap (desktop)" (3 tests) covers:
  visible header labels ("Input"/"Hex"/"RGBA") are non-overlapping (measured
  bounding-rect `right <= left` of the next label, 1px tolerance) at both
  1000px and 720px (just above the 700px breakpoint); the header stays
  `display: none` below 700px.

Updated for the earlier fixer pass (ctConfirm "Yes" hover-specificity fix):

- Adversarial-review finding (BLOCKER): the page-wide
  `button:hover:not(:disabled)` rule (specificity 0,2,1) outranked the
  pasted ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0), so hovering
  the "Yes" button in either confirm dialog washed its solid accent-blue
  background (`rgb(47, 111, 237)`) out to near-white `#eef1f8`
  (`rgb(238, 241, 248)`) while the text stayed white — effectively
  invisible. Violates `docs/conventions.md`'s ctConfirm hover-specificity
  note ("Yes" must read as a clear, filled primary). Fixed by excluding
  `.ctc-btn` from the generic hover rule
  (`button:hover:not(:disabled):not(.ctc-btn)`); the pasted ctConfirm block
  itself was not touched. New `describe` block "hover states stay legible
  (CSS specificity regression)" (3 tests) covers: "Yes" hover in the
  remove-all dialog stays `rgb(47, 111, 237)` with white text and differs
  from Cancel's hover background; "Yes" hover in the per-row trash dialog
  likewise; an ordinary button (Convert) still gets the unchanged light
  `#eef1f8` hover.

Updated for the earlier fixer pass (mobile keyboard dismiss on Convert):

- **Convert is this tool's commit/submit action.** Per
  `docs/conventions.md` § Responsive & mobile ("a submit/commit button
  dismisses the on-screen keyboard"), the Convert button's click handler now
  calls `document.activeElement?.blur()` after `bulkConvert(...)` runs,
  dismissing the mobile soft keyboard on a successful convert. Convert has no
  "rejected" outcome the way seed-add does (even invalid lines still become
  rows, flagged invalid), so the blur is unconditional. **Add row** was left
  untouched — it deliberately focuses the newly-created row's input rather
  than blurring, since it hands the user an empty field to type into rather
  than submitting one. New `describe` block "Convert: mobile keyboard
  dismiss convention" (1 test) asserts a real click on Convert blurs the
  paste textarea.

Updated for the earlier fixer pass that adopted repo conventions:

- The tool's bespoke custom confirm modal (`#modalBackdrop`/`#modal`,
  `state.modal`, `openConfirmModal`/`closeModal`/`confirmModalAction`/
  `onModalKeydown`) was replaced by the shared, pasted `ctConfirm` component
  (`tools/include/confirm.js`). Per-row trash, Clear (paste box), and Remove
  all now each call `if (await ctConfirm(message)) {...}` directly. Same UX
  contract as before (`role="dialog"`, `aria-modal`, focus trap, Enter
  confirms via the highlighted "Yes" button, Esc/backdrop-click cancel), same
  three messages ("Remove this color?" / "Clear the paste box?" / "Remove all
  rows?"). The dialog carries no `data-testid`s of its own (tool-agnostic
  pasted component) — tests drive it via `page.getByRole('dialog')` /
  `page.getByRole('button', { name: 'Yes' | 'Cancel' })` and, for
  backdrop-click, `page.locator('.ctc-overlay').click({ position: {x, y} })`
  aimed away from the centered dialog card. The five stale
  `confirm-modal*` testids were removed from the "all testids exist" check.
  `window.__colorConverter.removeRow(id)`/`removeAllRows()` remain direct,
  non-modal actions.
- The pasted HTML footer (`tools/include/footer.html`) was added at the
  bottom of `<body>`. Both pasted components (footer + `ctConfirm`) were
  verified byte-identical to their canonical `tools/include/` sources —
  embedded sentinel hashes match: footer `a97df085179a11175786e1d57d6c2a99`,
  `ctConfirm` `3fe0e7648c094461cf01e8b3e524dbc7`.
- Every icon-only button (per-row hex-copy/rgba-copy, the row trash button,
  both Copy-all buttons) now carries a `title` attribute in addition to its
  `aria-label`. New `describe` block asserts this.
- New mobile `describe` block (~375×667 viewport, `deviceScaleFactor: 2`,
  `hasTouch: true`): real taps (not the `window.__colorConverter` hooks) on
  Convert (after pasting), a per-row copy button, Add row, and a trash button
  through to a real `ctConfirm` "Yes" tap; no-horizontal-overflow assertions
  at 375px and 360px; a ~44px tap-target size check on trash/copy buttons;
  and an `elementFromPoint` overlay hit-test guard on the Convert button and
  a per-row copy button (the lesson from a sibling tool's regression: a
  passing functional test still missed a real overlay covering a control).
- Mobile CSS: within the existing `@media (max-width: 700px)` breakpoint
  (unchanged desktop styling), `button` gets `min-height: 44px` and
  `.icon-btn` gets `min-height`/`min-width: 44px`; the mobile row grid's
  trash column was widened from `32px` to `44px` to match, so the enlarged
  trash button doesn't overflow its grid cell.

Everything else (parseColor/formatters/rows-as-source-of-truth/derived
textareas/bulk convert/copy behavior) is unchanged from the prior test
record and re-verified passing.

## Results by item

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | `parseColor` purity across all accepted forms + invalids | PASS | Hex 3/4/6/8-digit, with/without `#`, shorthand nibble-doubling (`#abc`→`{170,187,204,1}`, `#abcd` alpha nibble doubled) all exact. Functional comma form with/without alpha; modern slash form (alpha required, `rgb(255 0 0)` with no slash/comma → invalid); `rgb`/`rgba` name aliasing in both forms. Case-insensitive (`RGB(...)`, `#ABCDEF`) and whitespace-tolerant (leading/trailing spaces) confirmed. Channel clamp to 0–255 (`rgb(300,-10,128)`→`{255,0,128}`), alpha clamp to 0–1 (`rgba(...,2)`→`a:1`, `rgba(...,-1)`→`a:0`), decimal channel rounding (`120.4`→`120`) all exact. Invalids confirmed null: garbage text, empty/whitespace-only string, `%` channels, missing paren, too few/too many comma args, mixed comma+slash, named colors, `hsl()`, an embedded partial match (`xrgb(1,2,3)y`), and out-of-form hex lengths `#12345` (5) / `#1234567` (7). |
| 2 | `rgbaString`/`hexString` canonical output | PASS | `rgbaString` always includes alpha (`rgba(255, 0, 0, 1)` for opaque), trims fractional alpha to ≤3 decimals (`0.333333`→`0.333`), `a=0` renders `rgba(1, 2, 3, 0)`. `hexString` always lowercase `#rrggbb` when opaque, `#rrggbbaa` only when `a<1` (verified with byte-exact alphas 0.6→`0x99`, 0.2→`0x33` to avoid rounding ambiguity). |
| 3 | Single-row live conversion + swatch | PASS | `addRow('#ff8800')` → swatch `--swatch-color` and both HEX/RGBA fields exactly match the formatters; alpha<1 gets the checker `.alpha` swatch class; typing into a row's real `<input>` (Playwright `.fill()`, real `input` event) live-converts after the ~150ms debounce; an invalid row gets the `invalid` class on both the row `<li>` and the swatch, with both output fields empty, and does not throw (`pageerror` listener asserted empty after further invalid edits); an empty (never-typed) row is neutral — `empty` swatch class, not `invalid`. |
| 4 | Rows as source of truth → derived output textareas | PASS | `rgbaOutput()`/`hexOutput()` and the real `<textarea>` `.value`s match rows in order and each other exactly, including a mixed valid/invalid/empty batch. An invalid row emits `INVALID: <raw text>` at the same line index in *both* textareas. An empty row emits a blank line, not the `INVALID:` token. Outputs re-derive live after a hand-edit to an existing row. |
| 5 | Bulk Convert | PASS | `bulkConvert(text)` with a mix of valid hex/rgba, blank and whitespace-only lines, and one invalid line generated exactly the non-blank lines (blanks skipped, not counted) with the correct `{added, invalid}` count and correct invalid-row placement. The real Convert button (paste + click) produced the same behavior and the correct parse-summary text, including exact singular/plural wording. Convert confirmed to *replace* across repeated calls. Clear (button label "Clear", testid unchanged) confirmed to open the shared `ctConfirm` dialog ("Clear the paste box?") and, on Enter, empty only the paste textarea, leaving rows untouched; Esc leaves the paste box untouched. |
| 6 | Copy buttons | PASS | Per-row `row-hex-copy`/`row-rgba-copy` flip 📋→✅ on click and revert after ~1s; field values were asserted correct before copying. Both Copy-all buttons flip `"Copy all"`→`"Copied!"` and copy the exact `rgbaOutput()`/`hexOutput()` string. An empty/invalid row's copy button is confirmed a no-op. |
| 7 | Removal — shared `ctConfirm` dialog (per-row trash, Clear, Remove all) | PASS | Trash click opens `ctConfirm` (`role="dialog"`, `aria-modal="true"`, default focus on "Yes", message "Remove this color?") and leaves the row in place until confirmed; Enter removes exactly the clicked row and the derived textareas update to match; Esc and a real overlay backdrop click both cancel and keep the row; Tab/Shift+Tab trap and wrap focus between Cancel and Yes. `window.__colorConverter.removeRow(id)` confirmed to remove directly with no dialog ever appearing. Remove all: disabled at 0 rows, enabled once ≥1 exists; a direct click at 0 rows is a no-op (defensive guard, dialog never opens); opens with "Remove all rows?"; Enter confirms, empties all rows, re-disables the button, and clears both output textareas; Esc and backdrop click both cancel. |
| 8 | `data-testid` hooks + `window.__colorConverter` API shape | PASS | Every current testid present exactly once/exactly where expected (the five stale `confirm-modal*` testids are gone from the DOM and from this check, by design). Add row button appends an empty row and focuses its input. `window.__colorConverter` exposes the documented shape exactly. `state.rows` confirmed a live reference reflecting `addRow`'s effect. |
| 9 | Tooltips (`title` on icon-only buttons) | PASS | Per-row hex-copy, rgba-copy, and trash buttons each have a non-empty `title`; both Copy-all buttons have `title` matching their `aria-label` text exactly. |
| 10 | Mobile (375×667 / 360px, dpr2, touch) | PASS | Real taps drove: paste + Convert (2 rows, correct summary), a per-row copy button (📋→✅), Add row (focuses new input), and a trash button through a real `ctConfirm` "Yes" tap (row removed). No horizontal page overflow at 375px (with rows + outputs populated) or at 360px (after an additional Add row tap) — `scrollWidth <= innerWidth + 2` in both cases. Trash, hex-copy, and rgba-copy buttons each measured ≥44×44px. `elementFromPoint` hit-test confirmed no overlay sits on top of the Convert button or a per-row copy button. |
| 11 | Convert blurs the paste textarea on a successful run (mobile keyboard dismiss) | PASS | Focus + fill the paste textarea, click Convert — 2 rows are generated and the paste textarea is no longer `document.activeElement` (checked both via Playwright's `toBeFocused()` and an independent `document.activeElement === ...` evaluate). Add row's existing "focuses the new input" behavior (item 8) is unchanged — confirmed it still passes, i.e. Add row does not blur. |
| 12 | localStorage persistence (`color-converter:v1`) | PASS | Rows built via bulk Convert + a real-typed row + a paste-box edit write the versioned key with the raw-text-only shape (`{rows: [...rawText], paste}` — no `parsed`/derived-output data). Reloading restores `state.rows`' raw text, the paste box, and both derived output textareas exactly (RGBA/HEX outputs recomputed from restored `rawText`, matching pre-reload byte-for-byte, including the invalid row's placeholder staying line-aligned). Per-row remove (real `ctConfirm` Enter flow) and Remove all each update the stored blob live, including persisting `rows: []`, which reloads back to an empty, disabled-Remove-all state without crashing. With `Storage.prototype.setItem`/`getItem` overridden to throw (simulating private mode/quota/policy): no `pageerror` on load, the tool starts empty (no stored state readable), and a full interaction pass — Convert, live row edit, Add row, per-row trash via `ctConfirm`, Remove all — completes with zero uncaught exceptions, `saveState()`/`restoreState()` swallowing every localStorage error. |

## Bugs found

None. Every assertion above matched the behavior specified in `DESIGN.md`
and matched `index.html`'s actual implementation — no deviations, no
`pageerror` events observed during any test run.

## Pasted-component integrity

Both pasted components were verified byte-identical (between their sentinel
comments) to the canonical sources under `tools/include/`, and each
embedded sentinel `HASH` matches an independently recomputed md5 of that
content — re-verified again after this fixer pass (which only added
`STORAGE_KEY`/`saveState`/`restoreState` plumbing to `index.html`'s own
module script, well outside either pasted block):

- Footer: `a97df085179a11175786e1d57d6c2a99` (matches `tools/include/footer.html`)
- `ctConfirm`: `3fe0e7648c094461cf01e8b3e524dbc7` (matches `tools/include/confirm.js`)

## Automated coverage

All 12 items above are encoded as assertions in `color-converter.e2e.mjs`
(73 individual test cases across 14 top-level `describe` blocks, plus nested
sub-groups for hex/functional/invalid `parseColor` forms). 70 tests carried
over unchanged from the prior round, plus 1 new `describe` block / 3 new
tests for localStorage persistence (see above).
**73 passed, 0 failed.**
