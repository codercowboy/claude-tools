# color-picker

A single-file, dependency-free HTML tool for sampling exact pixel colors out
of an image. Load an image, pan and zoom to find the pixel you want, then use
the eyedropper to sample it as `rgba()` and hex.

## Usage

Open `index.html` directly in a browser (double-click it, or `open
index.html`) — no server, build step, or install required. It also works
fine served from a static file server if you'd rather.

1. **Load an image** — click "Load image" and choose a file, or drag and
   drop an image onto the canvas.
2. **Pan** — click and drag on the canvas to move around.
3. **Zoom** — scroll/wheel to zoom in toward the cursor; pinch with two
   fingers on a trackpad/touchscreen. Use "Reset view" to re-fit the image.
4. **Choose Color** — click the "🔍 Choose Color" button to enter sampling
   mode.
   - **Mouse:** move the cursor over the canvas — a circular loupe shows a
     pixelated close-up with a crosshair marking the exact pixel that will
     be sampled. Click to sample it — a new row is added to the list below,
     newest on top.
   - **Touch:** since a finger covers the pixel it's touching, a crosshair
     appears at the center of the canvas instead. Drag anywhere to move the
     crosshair — it moves by your finger's motion, not to where your finger
     is — then tap (without dragging) to sample the pixel under it. The
     loupe follows the crosshair, offset so your finger never blocks it.
     Two-finger pinch still zooms.

   Click "🔍 Choose Color" again to leave sampling mode (panning resumes;
   wheel/pinch-zoom always work, in or out of this mode).
5. **Copy a color** — each row shows a swatch, an `rgba(...)` value, and a
   hex value, each with its own copy button. Copy buttons briefly show a
   checkmark on success.
6. **Remove colors** — the trash icon on a row, or "Remove all" above the
   list, opens a confirmation dialog (Enter confirms, Esc cancels, click
   the backdrop to cancel). Nothing is removed until you confirm.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. This tool grew
large enough to earn a build (see `docs/conventions.md` § "Build-assembled
tools"), so the code is authored under `source/` and inlined into the one file:

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (pixel-color formatting).
  Imported directly by unit tests.
- `source/app.mjs` — the DOM wiring (canvas, pan/zoom, sampling, color list).

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

## Notes

- Color sampling always reads from the image's original, untouched pixel
  data (not the zoomed/panned canvas you see), so the value returned for a
  given pixel is exact at any zoom level or pan position, and correct
  under high-DPI displays.
- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It's assembled by a dependency-free Node build (see
  "Developing" above).
- Responsive down to narrow phone widths (~360px) — no horizontal page
  overflow, buttons stay finger-friendly (~44px), and the color list/derived
  output textareas stack and read well on a small screen.
- For automated testing, the page exposes `window.__colorPicker` with the
  pure `rgbaString`/`hexString` formatters, `loadImageFromDataURL(dataUrl)`
  for deterministic image loading, `sampleAt(px, py)` for image-space pixel
  sampling, `addColor(...)`, a live `state` reference (including
  `state.touch` for the touch crosshair's position/mode), and two read-only
  touch-crosshair helpers, `sampleAtCrosshair()` and
  `isTouchCrosshairActive()`. This namespace has no effect on normal use.

<!-- readme-footer: keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
