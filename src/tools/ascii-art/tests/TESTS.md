# ascii-art — tests

Two required layers (see `docs/conventions.md` § "Pure-logic unit tests" and
§ Testability hooks):

1. **Offline unit tests** — `node --test tests/unit/*.test.mjs`, importing the
   tool's pure engine directly from `source/logic.mjs` (no DOM, no browser, no
   canvas — the tests feed hand-built `{ width, height, data }` ImageData-shaped
   grids straight into the transforms).
2. **Browser e2e** — `@playwright/test` driving the shipped `index.html` over
   `file://` via `data-testid` hooks and the inert `window.__asciiArt` test
   namespace.

`build:check` runs first (via `pretest:unit` / `pretest:e2e`), so a stale
`index.html` fails the run.

## Running

```bash
cd src/tools/ascii-art
npm install
npx playwright install chromium   # once, for the e2e browser
npm test            # unit then e2e (build:check guards both)
npm run test:unit   # offline node --test only
npm run test:e2e    # Playwright only
```

## Unit tests (`tests/unit/`, `node --test`) — 58 tests

Import `source/logic.mjs` directly (the same file the build inlines into the
app, so there is one source of truth and no extraction step). `_helpers.mjs`
memoizes the import and builds grids: `grid(w, h, pixels)` /
`gridFrom(w, h, fn)` produce the RGBA `{ width, height, data }` contract without
a canvas; `ESC` / `ANSI_RESET` cover the ANSI escape bytes.

- **`ascii-ramp.test.mjs`** — `DEFAULT_RAMP` is the standard ramp ordered
  dark→light; **`toAscii` of a 2×1 black/white grid is `"@ "`**; `charForLevel`
  maps `t=0`→ramp[0] (darkest), `t=1`→ramp[last] (lightest) and clamps
  out-of-range `t`; dark→ramp[0] / light→ramp[last] both directions; **custom
  ramps** (`'AB'`, `'XO.'`) honored; empty/null ramp falls back to the default
  (`clampRamp`); a single-char ramp fills every cell; `toAsciiCells` carries
  per-cell `fg` only when color is on; dimensions preserved and `cellsToText`
  round-trips the rows.
- **`levels.test.mjs`** — `luminance` uses Rec.601 weights (green brightest,
  blue darkest, endpoints exact); `adjustLevel` identity with no options;
  **brightness** adds a scaled offset and clamps (incl. the 177.5 half-step);
  **contrast** scales about 128 (midpoint fixed, extremes clamp, −100 collapses
  to 128); **gamma** >1 brightens / <1 darkens mid-tones with gamma-invariant
  endpoints, and non-positive/non-finite gamma → neutral; `normLevel`
  normalizes to [0,1] and **invert** flips it.
- **`braille.test.mjs`** — `BRAILLE_BASE` = U+2800; **`packBraille`** none→U+2800,
  **dot1+dot8→U+2881**, all→U+28FF, and each individual dot sets its documented
  bit; **`inkMap`** thresholds dark→ink (invert flips), the threshold value
  moves the on/off boundary, output is **deterministic** across `none` / `bayer`
  / `floyd` (same input → identical `Uint8Array`, length + 0/1 domain checked),
  and Bayer breaks a flat mid-gray into a two-value pattern; `toBrailleCells`
  packs a solid glyph for an all-black cell / blank for all-white, and **averages
  the inked pixels** for the cell color; `toBraille` plain-text convenience.
- **`halfblock.test.mjs`** — `CHAR_HALF_BLOCK` = `▀` (U+2580); each glyph puts
  the **top pixel in `fg`, the bottom pixel in `bg`**; two pixel rows collapse
  to one glyph row; an odd bottom row reuses the top pixel (no `undefined`);
  `renderCells` dispatches `mode:'halfblock'` to the half-block renderer.
- **`serialize.test.mjs`** — **`rgbToAnsi256`** black→16, white→231, neutral
  grays into the 232..255 ramp, a saturated color into the 16..231 cube
  (red→196); `cellsToText` joins rows/newlines; **`cellsToHtml`** coalesces
  consecutive same-color cells into one `<span>`, emits fg+bg, HTML-escapes,
  and emits plain text when uncolored; **`cellsToAnsi`** wraps colored cells in
  ESC sequences with a **per-line reset**, truecolor emits 24-bit fg/bg,
  same-color runs coalesce to one escape, and uncolored cells stay bare;
  `htmlDocument` wraps a full standalone page.
- **`sample-size.test.mjs`** — `computeSampleSize` per mode: **ascii** 1px/cell
  with the char-aspect row correction (aspect 1 doubles rows vs aspect 2, wide
  images yield fewer rows); **halfblock** even `pixH`, 2 stacked px/row;
  **braille** `pixW = 2·cols` and `pixH` a multiple of 4; width clamped to
  `[WIDTH_MIN, WIDTH_MAX]`; non-positive aspect → default 2; degenerate image
  dims don't divide by zero; an unknown mode falls back to ascii.

## e2e tests (`tests/ascii-art.e2e.mjs`) — 42 tests

Loads a **real, in-memory PNG** through the actual `<input type=file>` via
`setInputFiles` — the spec ships a tiny dependency-free PNG encoder
(`makePng(w, h, pixelFn)` using `node:zlib` + a hand-rolled CRC32) and builds a
32×32 color gradient so ASCII ramps, colored spans, half-block, and braille all
produce non-uniform output. First-load Help is pre-seeded
(`ascii-art:help-seen:v1`) in `beforeEach` so the modal never interferes; the
genuine first-load case uses its own fresh `browser.newContext()`.

Suites:

1. **`window.__asciiArt` hook** — the documented pure functions and
   deterministic entry points are exposed; `toAscii` of a 2×1 black/white grid
   evaluated in-page is `"@ "` (matches the unit contract).
2. **Loading an image (file input)** — `setInputFiles` surfaces the preview
   (`<pre>` art), original name (`sample.png`), dims (`32×32`), type, and the
   `cols × lines chars` stat; a non-image file is rejected with an inline error;
   the file **✕** removes the image with **no** confirm and re-disables exports.
3. **Render modes** — mode buttons toggle `aria-pressed` and update the mode
   note; the **ramp field** shows only for ASCII and the **braille field** only
   for braille; half-block **forces + locks** the Color toggle; braille output
   is all U+28xx glyphs; the **ANSI depth** select switches 256↔truecolor and
   drives the ANSI export (`[38;5;…m` vs `[38;2;…m`).
4. **Controls change the output** — output width changes the column count
   (stats `40 × …`, `120 × …`); **invert**, **ramp edit** (→ preset `custom`,
   only its own chars), preset repopulation (`binary` → `# `), and
   **brightness** each change the rendered text; **Color on** renders coalesced
   `<span>` runs in the preview; the light-background toggle repaints the
   surface.
5. **Exports** — all six copy/download buttons disabled before load, enabled
   after; **Download .txt / .html / .ans** fire real `download` events with
   `<base>-<mode>` filenames and verified contents (non-empty text, a
   `<!doctype html>`+`<pre>` doc, ANSI ESC bytes); **Copy .txt** flashes
   "Copied!" then reverts.
6. **Reset (confirmDialog)** — Reset opens the shared confirm dialog; confirming
   clears the image and restores default options (ASCII mode); cancelling leaves
   the image loaded.
7. **Options persistence** — mode + width + ramp survive a reload (with the
   `file://` write-then-reload poll + settle guard); only the small options
   object is stored — **never** image bytes.
8. **Responsive** — a wide (1400px) viewport lays controls and preview
   side-by-side; the preview is its **own** horizontal scroll container (wide
   art doesn't scroll the page body); a ~375px mobile viewport has no horizontal
   page overflow.
9. **First-load Help popup** — auto-shows once on a genuine first visit (fresh
   context) with initial focus on the ✕ and the seen-flag then persisted; does
   not re-show when pre-seeded; opens via the `?` button with
   `role="dialog"`/`aria-modal`; Esc, backdrop click, and the ✕ all close and
   return focus to the trigger; focus is trapped on the ✕; the overlay computes
   to `display:none` when closed.
10. **License modal (shared footer surface)** — the footer **MIT License** link
    opens the modal with the MIT text and the **"100% vanilla, no runtime
    dependencies"** note (no bundled-lib list); focus moves onto the ✕; the ✕
    and Esc close and return focus to the link; the `[data-jbc-license]` trigger opens it
    programmatically.

## Notes / gotchas encoded here

- **Controls live inside the loaded section**, which is `hidden` until an image
  loads — every control test loads the fixture first.
- **Options save on change, not on image load** — the "image bytes never
  persisted" test nudges a control first so `localStorage` is populated before
  it asserts the stored blob is small and image-free.
- **Debounced render (~120ms)** — slider-driven tests add a ~300ms settle wait
  before asserting on the re-rendered output.
- **`file://` write-then-reload race** — the persistence test polls that the
  write landed, then adds a ~400ms settle wait before `reload()` (conventions
  § "Avoid the file:// write-then-reload flake").
- **No `preview` testid** — the wide-layout test targets the `.preview` column
  by class; `preview-box` is the inner scroll container.
- **Download over `file://`** — the app clicks a generated `<a download>`;
  Playwright's `waitForEvent('download')` captures it and the saved bytes are
  verified.
