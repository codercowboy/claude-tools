# color-picker — Design

Author: Claude. Design lead: Jason. This is the source-of-truth spec for the
tool. The planner turns this into an implementation plan; the worker implements
strictly against both.

## Summary

A single, self-contained `index.html` (vanilla HTML/CSS/JS, no build, no
dependencies) that lets a user load an image onto a canvas, pan/zoom it, and
sample pixel colors with a magnifier-style eyedropper. Sampled colors collect in
a list below the canvas, each copyable as `rgba()` and hex. Below that list,
two read-only "one per line" textareas (RGBA and HEX) give a bulk, copy-all
view of the same sampled colors.

## Hard constraints

- **Ships as one file.** The committed `index.html` is fully self-contained — all
  HTML/CSS/JS inline, no external assets, no CDN, no npm dependencies, opens via
  `file://` or any static server. It is **build-assembled** from `source/` by the
  shared dependency-free Node build (`scripts/build-tool.mjs`, `npm run build`;
  see `docs/conventions.md` § "Build-assembled tools"). Author under `source/`
  (`index.template.html`, `styles.css`, `logic.mjs` = the pure engine, `app.mjs`
  = the DOM layer), run `npm run build`, commit the result. `npm test` runs
  `build --check` first so drift can't slip through.
- **Vanilla.** Standard browser APIs only (Canvas 2D, Pointer Events, Clipboard
  API, File API). ES module `<script type="module">` inline is fine.
- Must work in current Chromium (the test target via Playwright MCP).

## Layout

Top-to-bottom, single column, responsive:

1. **Toolbar** (above canvas)
   - `Load image` button (opens file picker) — accepts `image/*`.
   - `🔍 Choose Color` toggle button (magnifier icon + the literal text
     "Choose Color"). Reflects active/inactive state visually (e.g. pressed).
   - `Reset view` button (re-fit image to canvas). *(supporting, nice-to-have)*
   - Zoom level indicator (e.g. `100%`). *(supporting)*
2. **Canvas stage**
   - A `<canvas>` that fills the stage width, fixed aspect area (e.g. 16:10),
     with an empty-state prompt ("Drop an image here or use Load image") shown
     until an image loads. The whole stage is a drag-drop target.
3. **Color list** (below canvas)
   - A header row with a `Remove all` button (disabled when empty).
   - One row per sampled color (newest at top). See "Color row" below.
4. **Derived outputs** (below the color list) — see "Derived output
   textareas" below.
5. **Shared footer** (`tools/include/footer.html`, pasted verbatim at the
   bottom of `<body>`) — see `docs/conventions.md` "Footers".

The shared `ctConfirm` confirm dialog (see "Removal & confirm" below) is not
part of this static layout — it's created/torn down at runtime by
`tools/include/confirm.js` and appended to `<body>` only while open.

## Image loading

- **File input** and **drag-and-drop** onto the stage both accepted. On drop,
  prevent default, read the first `image/*` file.
- Load via `URL.createObjectURL` → `Image` → draw. Revoke the object URL after
  load. Reject non-image files gracefully (brief inline message, no crash).
- On load, **fit** the image to the stage (contain) and center it; set that as
  the initial transform.

## Canvas rendering & transform model

- Maintain a source bitmap of the loaded image (an offscreen
  `ImageBitmap`/`<img>` or an offscreen canvas at natural resolution) used both
  for drawing and for pixel sampling.
- Transform state: `scale` (zoom factor) and `offsetX/offsetY` (image-space →
  canvas-space translation). Render each frame by clearing the canvas and
  drawing the image with the current transform (`ctx.setTransform` or
  `drawImage` with computed dest rect). Use `requestAnimationFrame` for redraws.
- **High-DPI:** size the canvas backing store to `cssWidth * devicePixelRatio`
  (and height), scale the context, so rendering and sampling are crisp. Keep a
  single, well-documented mapping between CSS pixels, canvas backing pixels, and
  image pixels — this mapping is the crux of correct color sampling.

### Pan

- Pointer down on the canvas (when **not** in Choose Color mode) starts a drag;
  pointer move updates `offsetX/offsetY`; pointer up ends it. Use Pointer Events
  (`setPointerCapture`). Cursor is `grab` / `grabbing`.

### Zoom

- **Wheel** over the canvas zooms toward the cursor position (anchor the point
  under the cursor so it stays put). `preventDefault` on wheel.
- **Pinch:** two-pointer gesture — track two active pointers, zoom by the change
  in distance, anchored at the midpoint; also allow two-finger pan by the
  midpoint translation.
- Clamp `scale` to a sensible `[min, max]` (e.g. fit-scale×0.5 … 40×). Optional
  clamping of offsets so the image can't be flung entirely off-screen.

## Choose Color (eyedropper) mode

- Toggled by the `🔍 Choose Color` button. Clicking it again **deactivates**.
  When active the button shows a pressed/active state.
- While **active**:
  - Canvas cursor becomes a **crosshair** (`cursor: crosshair`); the mouse
    position pinpoints exactly one source pixel.
  - A **circular loupe** (magnifier) follows the cursor: a round element showing
    a zoomed slice of the image centered on the target pixel, with crosshair
    lines and a center cell outline marking the exact sampled pixel. Rendered by
    drawing the source bitmap into a small canvas with `imageSmoothingEnabled =
    false` for a crisp pixelated zoom.
  - Pan is disabled while active (pointer is for sampling). *(Design note: still
    allow wheel-zoom while sampling so the user can zoom in to aim — but the
    click samples, it does not pan.)*
  - **Click** samples the pixel under the cursor: map cursor CSS coords →
    image-space pixel → `getImageData(px, py, 1, 1)` on the source (natural-res)
    canvas → RGBA. Add a color row (see below) for that color.
  - Sampling must respect the current transform so the pixel sampled is exactly
    the one under the crosshair at any zoom/pan.
- While **inactive**: cursor is `grab`, loupe hidden, clicks pan.

### Touch / mobile (relative-drag crosshair)

On touch devices the "sample where your finger is" model fails — the finger
covers the target pixel. So in Choose Color mode on **touch** input:

- When the user enables Choose Color, a **rendered crosshair appears dead-center**
  of the visible canvas, and the loupe shows the pixel under it.
- The user can touch **anywhere** on the canvas and **drag**; the crosshair moves
  **relative** to the finger's movement (by the drag delta), NOT to the finger's
  absolute position. E.g. touch the bottom-right and move the finger up 50px →
  the crosshair moves up 50px from wherever it was. Clamp the crosshair to the
  canvas bounds.
- The **loupe is offset from the finger/crosshair** so it stays visible while
  dragging.
- **Sampling:** a **tap** (touch that ends with movement below a small px
  threshold) samples the pixel currently under the crosshair; a **drag**
  (movement above the threshold) only repositions the crosshair. A short visible
  hint helps (see Discoverability). *(Decision: tap-to-sample; a dedicated
  "Pick" button is an alternative if preferred.)*
- **Discoverability** (so users learn "drag to aim, tap to pick"):
  - A small **persistent hint** near the canvas while Choose Color is active
    on touch, e.g. "Drag to aim · tap to pick". *(Post-v1, adversarial-review
    fixer pass: anchored near the **bottom** of the canvas, not the top — on
    a short mobile canvas the loupe's up-offset from the dead-center
    crosshair swept most of the top of the stage, hiding a top-anchored
    hint entirely. Bottom placement stays clear of that sweep and of the
    one-time toast below it.)*
  - When a drag **ends** (finger lifts / movement stops), the crosshair gives a
    brief **pulse/glow** cueing that it's ready to tap-to-sample. (Primary cue.)
  - Optional: a one-time dismissible toast on **first activation** (best-effort
    `localStorage`) — keep it minimal; hint + pulse should suffice. Avoid a
    blocking modal.
  - Honor `prefers-reduced-motion`: skip the pulse, rely on the hint text.
- The crosshair persists at its last position between samples. Two-finger pinch
  still zooms; single-finger drag aims (pan stays disabled in this mode).
- On **mouse / non-touch pointer** devices, keep the existing behavior: the
  crosshair + loupe follow the cursor absolutely and a click samples.

## Color row

Each sampled color renders a row containing, left→right:

- **Swatch:** ~20×20 px box filled with the exact sampled color (with an outline
  so white/transparent colors are visible; render over a checker background if
  alpha < 1).
- **rgba input:** a read-only-ish text input pre-filled with the CSS
  `rgba(r, g, b, a)` string, with a **copy** icon button on its far right.
- **hex input:** a text input pre-filled with the hex `#rrggbb` (or `#rrggbbaa`
  when alpha < 1), with a **copy** icon button on its far right.
- **Trash** icon button (far end of the row) to remove just this row.

Behavior:

- **Copy buttons** use `navigator.clipboard.writeText`; on success give brief
  visual feedback (icon flips to a check for ~1s). Provide a `document.execCommand`
  or select-fallback if the Clipboard API is unavailable.
- Newest sampled color appears at the **top** of the list.
- The inputs let the user select the value; copy button is the fast path.

### Color formatting

- `rgba(r, g, b, a)` — r,g,b are 0–255 integers; a is 0–1, trimmed (e.g. `1`,
  `0.5`). Fully opaque still renders alpha (`rgba(r, g, b, 1)`) for consistency.
- Hex — `#rrggbb` uppercase or lowercase (pick one and be consistent; lowercase
  recommended). Include alpha as `#rrggbbaa` only when a < 1.
- These conversions are **pure functions** and are the primary unit-test surface
  (see Testability).

## Derived output textareas

Below the color list, two read-only textareas give a bulk view of the same
sampled colors, one line per color, side by side (stack vertically on narrow
screens):

- **RGBA (one per line)** — each line is that color's `rgbaString(color)`.
- **HEX (one per line)** — each line is that color's `hexString(color)`.
- Each has a **Copy all** button beneath/alongside it that copies the whole
  textarea's contents, using the same clipboard helper (Clipboard API +
  `execCommand` fallback) and brief visual feedback (label flips to
  "Copied!" for ~1s) as the per-row copy buttons.

Behavior — per "Derived views have a single source of truth" (repo
`docs/conventions.md`):

- **`state.colors` (the sampled-color list) is the single source of truth.**
  Data flows colors → textareas only; there is no path from the textareas
  back into `state.colors`.
- The two textareas are **rebuilt on every change** to the color list: on
  add (sample), on removing a single row, and on Remove all.
- **Order** matches the visible list: newest-sampled color first (top line),
  same order top-to-bottom as the on-screen rows, so a given row and the
  corresponding line in each textarea are always at the same index — the
  two textareas and the row list stay line-aligned with each other.
- **Empty state:** with zero sampled colors both textareas are empty, and
  both Copy-all buttons are `disabled` (mirrors `Remove all` being disabled
  when the list is empty).
- Values are produced by the **same canonical `rgbaString`/`hexString`
  formatters** used for the per-row fields — never reformatted or
  re-derived independently — so a textarea line always matches its row's
  rgba/hex fields exactly.

## Removal & confirm (shared `ctConfirm` component)

- Clicking a row **trash** icon, or **Remove all**, asks for confirmation via
  the shared **`ctConfirm(message)`** component (`tools/include/confirm.js`,
  pasted verbatim into `index.html` as a classic `<script>`), per
  `docs/conventions.md` "Destructive actions require confirmation":
  - Trash: `if (await ctConfirm('Remove this color?')) removeColorById(color.id);`
  - Remove all: `if (await ctConfirm('Remove all colors?')) removeAllColors();`
- `ctConfirm` returns a `Promise<boolean>`; **"Yes" is the highlighted
  default** — **Enter** confirms. **Esc** / **Cancel** / backdrop click
  cancel. Focus is trapped while the dialog is open and returns to the
  triggering control on close. `role="dialog"`, `aria-modal="true"`, labelled
  by the message.
- `ctConfirm` is **themed** to color-picker's look via CSS variables on
  `:root` (`--ctc-accent: var(--accent)`, plus `--ctc-accent-fg`, `--ctc-bg`,
  `--ctc-fg`, `--ctc-radius`, `--ctc-btn-radius`, `--ctc-focus`,
  `--ctc-cancel-border`), so the highlighted **"Yes"** button renders as a
  clear, filled blue primary — not the bare system-color fallback, and never
  the same near-white as "Cancel" (a bug Jason reported directly). *(Post-v1,
  adversarial-review fixer pass: a second, distinct near-white-on-hover bug
  was found and fixed — the page-wide `button:hover:not(:disabled)` rule had
  higher CSS specificity than the pasted component's own `.ctc-btn--yes:hover`,
  so **hovering** "Yes" repainted it near-white even though the theming above
  was correct at rest. Fixed in the tool's own CSS by excluding `.ctc-btn`
  from that generic rule — the pasted `ctConfirm` block itself was not
  touched.)*
- Only after Yes is the row (or all rows) actually removed.
- `Remove all` is disabled when the list is empty.
- This replaces the tool's earlier bespoke `#modalBackdrop`/`openModal`/
  `closeModal`/`confirmModal`/`onModalKeydown` confirm modal — removed in
  favor of the shared, pasted component. `ctConfirm` has no `data-testid`s of
  its own (it's a tool-agnostic pasted component); tests drive it via
  `getByRole('dialog')` and the "Yes"/"Cancel" button names.
- `window.__colorPicker.removeColorById(id)` / `removeAllColors()` remain
  **direct, non-modal** calls (invoked here only after `ctConfirm` resolves
  `true`, and exposed for tests) — only the real trash/Remove-all buttons'
  clicks go through the confirm dialog.

## Persistence

Per `docs/conventions.md` "Persist UI state (localStorage)" (hat-picker is
the exemplar):

- **What's persisted:** only the collected color list, `state.colors`
  (`{id, r, g, b, a}[]`, newest-first) — the valuable, user-built state —
  under a namespaced, versioned key `"color-picker:v1"`.
- **What's NOT persisted:** the loaded **image** (bytes can be large, and the
  color list is independent of the image), and the two derived rgba/hex
  "Copy all" textareas (pure derivations of `state.colors` — recomputed on
  every render, including on restore, never stored).
- **Save on change:** `saveState()` runs whenever `state.colors` mutates —
  sampling a new color, removing one row, and Remove all.
- **Restore on load:** on init, `loadState()` reads and validates the stored
  shape and restores `state.colors`, then renders the color list and
  re-derives both output textareas — all of this works with **no image
  loaded**, since the color list stands on its own. Absent/unreadable/
  malformed stored state falls back to an empty list, same as a first-ever
  load.
- **Best-effort + safe:** every `localStorage` read/write is wrapped in
  `try/catch` and degrades silently (private mode, `file://`, quota, browser
  policy) — the tool works fully with no stored state.
- **Separate from the existing one-time touch toast.** The mobile
  "Drag to aim / tap to pick" first-activation toast already used its own
  `localStorage` flag (`colorPickerTouchHintSeen`) before this feature
  existed; it stays its own unversioned key, untouched by and independent of
  the `color-picker:v1` blob above.

## Accessibility & UX

- All icon buttons have `aria-label`s **and** a `title` attribute (hover
  tooltip) — per `docs/conventions.md` "Icon-only buttons get a hover
  tooltip": the per-row rgba-copy and hex-copy buttons, the per-row trash
  button, the two "Copy all" buttons, and the touch-toast dismiss (×) button
  all carry both. (Jason reported the copy buttons showed no tooltip; this is
  the fix.)
- Toggle button uses `aria-pressed`.
- The confirm dialog (`ctConfirm`) uses `role="dialog"` + `aria-modal="true"`
  and is labelled by its message; see "Removal & confirm" above.
- Keyboard: Enter/Esc in the confirm dialog (above); buttons are real
  `<button>`s.

## Testability (important — build these in)

To allow browser-driven tests via Playwright MCP without breaking the single-file
rule:

- Add stable **`data-testid`** attributes to key elements: the stage/canvas,
  Load button, Choose Color toggle, Remove all button, the color list container,
  and within each row the swatch, rgba input, hex input, rgba-copy, hex-copy,
  and trash buttons (e.g. `data-testid="color-row"` with child testids). Also
  the two derived output textareas and their Copy-all buttons: `rgba-output`,
  `rgba-copy-all`, `hex-output`, `hex-copy-all` (distinct from the per-row
  `color-rgba-copy`/`color-hex-copy` testids). The touch crosshair overlay and
  its persistent hint (see "Touch / mobile" above) get `touch-crosshair` and
  `touch-hint`; the optional one-time toast gets `touch-toast` /
  `touch-toast-dismiss`.
- Expose the **pure logic** on a test hook, e.g.
  `window.__colorPicker = { rgbaString, hexString, sampleAt(px,py), addColor(rgba), state, rgbaOutput(), hexOutput(), removeColorById(id), removeAllColors() }`,
  so tests can (a) unit-test the color-formatting functions directly,
  (b) drive sampling deterministically without pixel-hunting, (c) read the
  current derived-output strings (same newest-on-top order as the textareas)
  without scraping the DOM, and (d) remove a row/all rows directly without
  driving the `ctConfirm` dialog when a test doesn't need to. Guard it so it's
  inert in normal use (it's just a namespace).
- The shared `ctConfirm` confirm dialog (see "Removal & confirm" above) has no
  `data-testid`s of its own — it's a tool-agnostic pasted component — so
  tests drive/assert it via Playwright's `getByRole('dialog')` and the
  "Yes"/"Cancel" button names, not testids.
- Provide a way for a test to **inject a known image** deterministically (e.g.
  `window.__colorPicker.loadImageFromDataURL(dataUrl)` returning a promise), so a
  test can load a solid-color or known-pattern image and assert the sampled
  color exactly.
- Keep sampling math independent of animation timing where possible so asserts
  are stable.
- Touch crosshair hooks: `state.touch` (already live via `state` above) exposes
  the crosshair's current CSS-space position (`cx`/`cy`), `active` (touch-aim
  mode engaged), and drag-tracking fields — live-readable after a real
  dispatched pointer/touch gesture, same pattern as the rest of `state`. Two
  small read-only convenience getters round this out:
  `window.__colorPicker.sampleAtCrosshair()` (samples the pixel currently
  under the crosshair without adding a row — mirrors `sampleAt(px,py)`'s
  side-effect-free contract) and `isTouchCrosshairActive()` (`chooseColorActive
  && touch.active`). These are read-only assertion helpers, not an alternate
  input path — tests still drive the crosshair itself via real
  pointer/touch events (`pointerType: 'touch'`), never these hooks, per the
  "prove tappability, don't rely on hooks" lesson from a sibling tool's mobile
  suite.

## Deliverables

- `tools/color-picker/index.html` — the tool.
- `tools/color-picker/README.md` — usage.
- Tests (delivered by the tester agent) exercising: color-format purity,
  load-and-sample-a-known-color, add/copy/remove-row, remove-all, the shared
  `ctConfirm` dialog's Enter-confirms / Esc-cancels / backdrop-cancels /
  Cancel-button-cancels, icon-only buttons' `title` tooltips, Choose Color
  toggle on/off (cursor + loupe), the shared footer, and the touch
  relative-drag crosshair + general mobile responsiveness (see "Touch /
  mobile" above and `docs/conventions.md` "Responsive & mobile").

## Out of scope (v1)

- Multiple images / tabs, palettes export, undo, color-space conversions
  beyond rgba/hex. Keep it focused. (Mobile/touch support for Choose Color —
  the relative-drag crosshair above — is in scope, not out of it; general
  page responsiveness per `docs/conventions.md` is required of every tool.)
