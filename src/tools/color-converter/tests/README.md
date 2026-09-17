# color-converter tests

Automated end-to-end tests for `tools/color-converter/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test` is a `devDependency` of `tools/color-converter/package.json`;
it is never referenced by `index.html`, which remains a single,
dependency-free file. The spec drives the finished page from the outside,
through its `data-testid` hooks and the `window.__colorConverter` test API
(see `../DESIGN.md` § Testability and `../PLAN.md` § 10).

## Running the tests

From `tools/color-converter/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/color-converter/` (or from the repo root) hoists `node_modules` to the
repo root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would.

## What's covered

`color-converter.e2e.mjs`:

1. **`parseColor` purity across all accepted forms:** hex with/without a
   leading `#` in 3/4/6/8-digit forms (including shorthand nibble-doubling,
   e.g. `#abc` → `{r:170,g:187,b:204,a:1}`); functional `rgb()`/`rgba()`
   comma syntax with optional alpha; the modern slash syntax
   `rgb(r g b / a)` (alpha required); case-insensitivity and
   surrounding-whitespace tolerance; channel clamping to 0–255 and alpha
   clamping to 0–1 (including negative/over-100% inputs and decimal channel
   rounding). Invalids → `null`: garbage strings, empty/whitespace-only
   strings, percentage channels (out of scope by design), malformed function
   syntax (missing paren, too few/many args, mixed comma+slash), named CSS
   colors, `hsl()`, and out-of-form hex lengths (`#12345`, `#1234567`).
2. **`rgbaString`/`hexString` canonical output:** `rgba(...)` always
   includes alpha (even `a=1`) and trims fractional alpha to at most 3
   decimals; hex is always lowercase `#rrggbb`, and `#rrggbbaa` only when
   `a < 1`.
3. **Single-row live conversion:** `addRow('#ff8800')` produces the correct
   swatch `--swatch-color` and HEX/RGBA output field values; translucent
   colors get the alpha checker-background swatch class; typing into a
   row's real `<input>` live-converts after the ~150ms debounce; an invalid
   row shows the invalid state (row + swatch get an `invalid` class) with
   empty outputs and does not throw/crash; an empty (never-typed-into) row
   is neutral, not invalid.
4. **Rows as source of truth → derived output textareas:**
   `rgbaOutput()`/`hexOutput()` and the actual output `<textarea>` values
   match the rows in order, line-aligned; an invalid row emits the literal
   `INVALID: <raw text>` token in *both* textareas at the same line index;
   an empty row emits a blank line (not the `INVALID:` token); outputs
   update live as a row is hand-edited.
5. **Bulk Convert:** `bulkConvert(text)` (and the real Convert button via
   paste + click) regenerates one row per non-blank line for a mix of valid
   hex, valid rgba, blank/whitespace-only lines (skipped, not counted), and
   invalid lines (become invalid rows); the parse summary reports the
   correct generated/failed counts with correct singular/plural wording;
   Convert **replaces** — a second Convert regenerates from the current
   paste box contents rather than accumulating on top of a prior Convert;
   Clear opens the shared `ctConfirm` dialog and, on confirm, empties only
   the paste textarea, never the rows.
6. **Copy buttons:** per-row `row-hex-copy`/`row-rgba-copy` and both
   Copy-all buttons trigger the copy path and show icon/`Copied!` feedback,
   reverting after ~1s; an empty/invalid row's copy button is a no-op
   (nothing to copy, icon unchanged). Clipboard read-back is not asserted
   (headless/`file://` clipboard permissions are unreliable); the
   underlying field/textarea value (what would be copied) and the UI
   feedback are asserted instead, per the app's own
   Clipboard-API-with-`execCommand`-fallback design.
7. **Removal:** the shared, pasted `ctConfirm` component
   (`tools/include/confirm.js`, `role="dialog"`, `aria-modal="true"`, focus
   trap between Cancel/Yes via Tab and Shift+Tab, default focus on Yes)
   guards per-row trash ("Remove this color?"), Clear ("Clear the paste
   box?"), and Remove all ("Remove all rows?"). Per-row trash click opens
   the dialog and removes just that row on Enter/Yes, and keeps it on
   Esc/Cancel/backdrop-click; the derived textareas update to match. Remove
   all is disabled when the row list is empty and enabled once rows exist;
   Enter confirms and empties all rows, Esc cancels and keeps them, and a
   backdrop click also cancels. `window.__colorConverter.removeRow(id)`
   remains a direct, non-dialog action for deterministic test
   setup/teardown. `ctConfirm` carries no `data-testid`s of its own (it's a
   tool-agnostic pasted component) — tests drive it via
   `page.getByRole('dialog')` and `page.getByRole('button', { name: 'Yes' |
   'Cancel' })`.
8. **`data-testid` hooks + API shape:** every current testid (top-level and
   per-row; the dialog has none of its own — see item 7) is present exactly
   where expected; the Add row button appends an empty row and focuses its
   input; `window.__colorConverter` exposes `parseColor`, `rgbaString`,
   `hexString`, `addRow`, `bulkConvert`, `removeAllRows`, `state`,
   `rgbaOutput`, and `hexOutput`, and `state.rows` is a live reference that
   reflects added rows.
9. **Tooltips:** every icon-only button (per-row hex-copy/rgba-copy/trash,
   both Copy-all buttons) carries a `title` attribute in addition to its
   `aria-label`.
10. **Mobile (~375×667, dpr2, touch):** real taps (not the
    `window.__colorConverter` hooks) drive paste + Convert, a per-row copy
    button, Add row, and a trash button through to a real `ctConfirm` "Yes"
    tap; no horizontal page overflow at 375px or 360px; ~44px tap targets on
    trash/copy buttons; and an `elementFromPoint` hit-test guard proving
    nothing overlays the Convert button or a copy button.

See `TESTS.md` for the run record and any findings.
