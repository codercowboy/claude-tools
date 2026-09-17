# color-picker — Implementation Plan

Author: Claude (planner). This plan turns `DESIGN.md` into a concrete build
spec for the worker. Implement strictly against both documents; where they
conflict, `DESIGN.md` wins and this file should be treated as under-specified
at that point (flag it rather than silently deciding).

Deliverable: `tools/color-picker/index.html` (single file), plus
`tools/color-picker/README.md` (short usage doc, per repo convention).
Do not add a build step, dependencies, or CDN references. `package.json`
already exists and declares `main: index.html`.

---

## 1. Overall file structure

Single `index.html`, roughly in this order:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Color Picker</title>
  <style> /* all CSS, inline, one block */ </style>
</head>
<body>
  <div class="app">
    <!-- toolbar -->
    <!-- canvas stage -->
    <!-- color list -->
    <!-- derived outputs -->
    <!-- visually-hidden <input type="file"> for Load image -->
  </div>
  <!-- Footer: tools/include/footer.html, pasted verbatim (sentinels included) -->
  <footer class="ct-footer"> ... </footer>
  <!-- ctConfirm: tools/include/confirm.js, pasted verbatim (sentinels included),
       a classic (non-module) <script> so it defines window.ctConfirm before
       the module script below uses it (`if (await ctConfirm(message)) { ... }`) -->
  <script> ... ctConfirm ... </script>
  <script type="module">
    // all JS, inline, one block, organized into clearly commented sections
    // (see section 12 "script organization" below)
  </script>
</body>
</html>
```

**(Post-v1, fixer pass)** There is no static `<!-- confirm modal -->` markup
in `<body>` anymore — the bespoke modal was replaced by the shared,
runtime-created `ctConfirm` dialog (see §9). `.app` remains the sole
`display: flex; flex-direction: column` container (`body` itself is never
`display: flex`), which matters because the footer is now a **second**
top-level child of `<body>`: see the `body`/flex gotcha write-down in §9 —
color-picker was already structured the safe way (flex on `.app`, not
`body`), so adopting the footer required no layout change, but this was
explicitly re-verified (desktop + 375px/360px mobile, no horizontal
overflow, nothing pushed off-screen) rather than assumed.

No `<template>` cloning is required but is fine if it simplifies row
creation; plain `document.createElement` + a small `buildRow(color)`
function is equally acceptable and probably simpler for a single file.

### DOM skeleton (with `data-testid`s — full list also in section 10)

```html
<header class="toolbar">
  <button id="loadBtn" data-testid="load-btn">Load image</button>
  <input id="fileInput" type="file" accept="image/*" hidden>
  <button id="chooseColorBtn" data-testid="choose-color-btn"
          aria-pressed="false">🔍 Choose Color</button>
  <button id="resetViewBtn" data-testid="reset-view-btn">Reset view</button>
  <span id="zoomIndicator" data-testid="zoom-indicator">100%</span>
</header>

<div id="stage" class="stage" data-testid="stage">
  <canvas id="canvas" data-testid="canvas"></canvas>
  <div id="emptyState" class="empty-state">Drop an image here or use Load image</div>
  <div id="loupe" class="loupe" hidden>
    <canvas id="loupeCanvas"></canvas>
  </div>
</div>

<section class="color-list-section">
  <div class="color-list-header">
    <h2>Sampled colors</h2>
    <button id="removeAllBtn" data-testid="remove-all-btn" disabled>Remove all</button>
  </div>
  <ul id="colorList" data-testid="color-list"></ul>
</section>

<section class="outputs-section" data-testid="outputs-section">
  <div class="output-col" data-testid="rgba-output-col">
    <label for="rgbaOutput">RGBA (one per line)</label>
    <textarea id="rgbaOutput" data-testid="rgba-output" readonly aria-label="RGBA output, one per line"></textarea>
    <button id="rgbaCopyAllBtn" data-testid="rgba-copy-all" aria-label="Copy all RGBA values" disabled>Copy all</button>
  </div>
  <div class="output-col" data-testid="hex-output-col">
    <label for="hexOutput">HEX (one per line)</label>
    <textarea id="hexOutput" data-testid="hex-output" readonly aria-label="HEX output, one per line"></textarea>
    <button id="hexCopyAllBtn" data-testid="hex-copy-all" aria-label="Copy all HEX values" disabled>Copy all</button>
  </div>
</section>
```

**(Post-v1, fixer pass)** No static confirm-modal markup here anymore — see
§9 "Shared `ctConfirm` confirm dialog". The footer (`tools/include/footer.html`)
and the ctConfirm classic `<script>` are pasted after `.app`'s closing `</div>`
and before the module `<script>` (see §1's file-structure sketch).

One color row (built in JS, per sampled color):

```html
<li class="color-row" data-testid="color-row" data-id="{id}">
  <span class="swatch" data-testid="color-swatch" style="background: rgba(...)"></span>
  <div class="field">
    <input data-testid="color-rgba-input" type="text" readonly value="rgba(r, g, b, a)">
    <button data-testid="color-rgba-copy" aria-label="Copy rgba value" title="Copy rgba value">📋</button>
  </div>
  <div class="field">
    <input data-testid="color-hex-input" type="text" readonly value="#rrggbb">
    <button data-testid="color-hex-copy" aria-label="Copy hex value" title="Copy hex value">📋</button>
  </div>
  <button data-testid="color-trash" aria-label="Remove color" title="Remove color">🗑</button>
</li>
```

**(Post-v1, fixer pass)** Every icon-only button (both copy buttons above,
the trash button, the two Copy-all buttons, and the touch-toast dismiss ×)
now carries a `title` attribute matching its `aria-label`, so hovering shows
a native tooltip — per `docs/conventions.md` "Icon-only buttons get a hover
tooltip". This was a real bug Jason reported directly: the copy buttons had
no tooltip at all.

Use `readonly` (not `disabled`) on the value inputs so they remain
selectable/focusable and their text can be triple-clicked/selected by the
user, per DESIGN's "read-only-ish" + "select the value" language.

---

## 2. Coordinate/transform model (the crux)

Three coordinate spaces:

1. **CSS pixels** — what pointer events (`clientX/clientY` minus the
   canvas's `getBoundingClientRect()`) are measured in. This is also the
   space the canvas element occupies visually (its CSS width/height).
2. **Canvas backing-store pixels** — the actual raster the `<canvas>`
   element holds, sized `canvas.width = cssWidth * dpr`,
   `canvas.height = cssHeight * dpr` where `dpr = window.devicePixelRatio
   || 1`. This is what `ctx` draws into.
3. **Image-space pixels** — pixel coordinates in the *natural* (unscaled)
   source image, i.e. what you'd pass to `getImageData` on the offscreen
   source canvas. Range `[0, naturalWidth) x [0, naturalHeight)`.

### Transform state

```js
transform = {
  scale: Number,   // image-space -> CSS-pixel-space scale factor
  offsetX: Number, // CSS-pixel X of image-space (0,0), i.e. where the
  offsetY: Number, // image's top-left corner sits in CSS pixel space
}
```

`scale` maps **image pixels to CSS pixels** directly (not to backing-store
pixels). Backing-store scaling is handled once, up front, by scaling the
context by `dpr` — after that, every drawing/hit-testing computation in the
rest of the code is done purely in CSS-pixel space and this `transform`,
never touching `dpr` again. This keeps the mental model to two spaces
(image-space, CSS-space) for all the interesting math; `dpr` is an
implementation detail of canvas setup and resize only.

### Canvas setup / resize (`resizeCanvasForDPR()`)

```js
function resizeCanvasForDPR() {
  const dpr = window.devicePixelRatio || 1;
  const rect = stage.getBoundingClientRect(); // CSS size of the stage/canvas
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 1 unit in ctx-space == 1 CSS px
}
```

Call on load, on window `resize` (debounced via rAF), and whenever the
stage element's size changes (a `ResizeObserver` on `#stage` is the robust
choice — wheel/pinch zoom don't resize the element, but window resizing or
layout reflow could).

After this, `ctx` operations use CSS-pixel coordinates natively; do not
multiply by `dpr` anywhere else.

### Forward mapping: image-space → CSS-space

```
cssX = imgX * transform.scale + transform.offsetX
cssY = imgY * transform.scale + transform.offsetY
```

### Inverse mapping: CSS-space (pointer) → image-space

```
imgX = (cssX - transform.offsetX) / transform.scale
imgY = (cssY - transform.offsetY) / transform.scale
```

Where `cssX/cssY` come from a pointer event as:

```js
const rect = canvas.getBoundingClientRect();
const cssX = evt.clientX - rect.left;
const cssY = evt.clientY - rect.top;
```

### Drawing each frame

```js
ctx.clearRect(0, 0, cssWidth, cssHeight); // cssWidth/Height = rect from resize
ctx.imageSmoothingEnabled = transform.scale < someThreshold; // optional; see note
ctx.drawImage(
  sourceCanvas,               // offscreen natural-res bitmap, see section 4
  0, 0, sourceCanvas.width, sourceCanvas.height,
  transform.offsetX, transform.offsetY,
  sourceCanvas.width * transform.scale,
  sourceCanvas.height * transform.scale
);
```

Note on smoothing: DESIGN only mandates `imageSmoothingEnabled = false` for
the **loupe** canvas (crisp pixelated zoom for aiming). The main canvas can
smooth normally; leave `ctx.imageSmoothingEnabled = true` (default) for the
main canvas at all zoom levels for a simpler, more predictable
implementation — do not add a variable-threshold smoothing toggle, that's
unnecessary complexity DESIGN doesn't ask for. (Correction to the paragraph
above: keep main-canvas smoothing simply on, always.)

### Sampling (`sampleAt(cssX, cssY)`)

```js
function sampleAt(cssX, cssY) {
  const imgX = (cssX - transform.offsetX) / transform.scale;
  const imgY = (cssY - transform.offsetY) / transform.scale;
  const px = Math.floor(imgX);
  const py = Math.floor(imgY);
  if (px < 0 || py < 0 || px >= sourceCanvas.width || py >= sourceCanvas.height) {
    return null; // cursor outside image bounds
  }
  const { data } = sourceCtx.getImageData(px, py, 1, 1);
  return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
}
```

`sourceCtx` is the 2D context of the **offscreen natural-resolution
canvas** (section 4), never the visible on-screen canvas — this guarantees
sampling is exact regardless of zoom/pan/DPR, since it reads directly from
the untouched source bitmap using image-space integer pixel coordinates.
This is also the function exposed at `window.__colorPicker.sampleAt(px,
py)` for tests, taking **image-space** integer coordinates directly (see
section 10) — that test hook bypasses the CSS→image inverse mapping
entirely and calls straight through to the `getImageData` step, so tests
can assert against known pixels without simulating pointer geometry.

### Fit-to-stage ("contain") on image load / Reset view

```js
function computeFitTransform() {
  const rect = stage-or-canvas CSS rect;
  const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const offsetX = (rect.width - img.naturalWidth * scale) / 2;
  const offsetY = (rect.height - img.naturalHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}
```

Store the fit scale as `state.fitScale` — it's the basis for zoom clamping
(`[fitScale * 0.5, fitScale * 40]`, per DESIGN's example range) and for
what `zoomIndicator` shows as "100%" (100% = `scale === fitScale`? or
100% = 1 image-pixel = 1 CSS-pixel, i.e. `scale === 1`? — **decision:**
100% means `scale === 1` (one image pixel = one CSS pixel), the
conventional meaning of a zoom percentage; the indicator reads
`Math.round(transform.scale * 100) + '%'`. Fit-to-stage on load will
usually show something other than 100%, which is correct and expected.)

---

## 3. State object shape

```js
const state = {
  image: null,           // HTMLImageElement | null — natural-size source, kept for redraws not strictly required if sourceCanvas suffices; may omit and rely on sourceCanvas alone
  sourceCanvas: null,    // OffscreenCanvas | HTMLCanvasElement, natural resolution
  sourceCtx: null,       // its 2D context, willReadFrequently: true

  transform: { scale: 1, offsetX: 0, offsetY: 0 },
  fitScale: 1,           // scale value that exactly fits image to stage

  mode: 'idle',          // 'idle' | 'pan' | 'chooseColor'
  chooseColorActive: false, // whether the toggle button is engaged

  pointer: {
    // pan (single pointer) tracking
    dragging: false,
    lastX: 0, lastY: 0,       // last CSS pointer position during drag
    pointerId: null,
    // pinch (two pointer) tracking
    active: new Map(),        // pointerId -> {x, y} in CSS space, updated on every pointermove
    pinch: null,               // null | { startDist, startMid: {x,y}, startScale, startOffsetX, startOffsetY }
  },

  colors: [],             // [{ id, r, g, b, a }], newest first (unshift on add)

  // (Post-v1, fixer pass) No `modal` field anymore — the confirm dialog is
  // owned entirely by the shared, stateless `ctConfirm(message)` component
  // (its own promise/closure carries open/focus-return state); see §9.

  rafScheduled: false,    // redraw coalescing flag
};
```

Notes:
- `colors` array order is the single source of truth for list order;
  render function just maps it to `<li>`s. Simpler than manipulating DOM
  order directly, and trivially testable via `window.__colorPicker.state`.
- Each color gets a monotonically increasing `id` (simple counter) used
  for `data-id` on rows and for modal `targetId` / trash-button wiring —
  don't rely on array index, since removal changes indices under a stale
  closure otherwise.

---

## 4. Rendering approach

- On successful image load, draw the `Image` once into an **offscreen
  canvas sized to the image's natural width/height** (`sourceCanvas.width
  = img.naturalWidth`, `.height = img.naturalHeight`). This is the
  source-of-truth bitmap:
  - Use `document.createElement('canvas')` (works everywhere) rather than
    `OffscreenCanvas` — no need for worker support, and `getImageData`
    works identically on a normal canvas; keeps the code simpler and more
    portable. `new OffscreenCanvas(...)` is an acceptable substitute if
    preferred but adds no benefit here since everything runs on the main
    thread.
  - Create its context with `{ willReadFrequently: true }` since
    `getImageData` is called repeatedly during sampling — this hints the
    browser to keep pixel data readable without GPU readback stalls.
  - `sourceCtx.drawImage(img, 0, 0)` once, at natural size, no scaling.
- The **visible** `<canvas>` is redrawn every frame from `sourceCanvas`
  via `ctx.drawImage(sourceCanvas, ...)` using the current `transform`
  (see section 2). Never draw the original `<img>` directly to the visible
  canvas — always go through `sourceCanvas` so there is exactly one
  source of pixel truth.
- Redraw scheduling: a single `scheduleRedraw()` helper sets
  `state.rafScheduled = true` and calls `requestAnimationFrame(redraw)`
  unless already scheduled; `redraw()` clears the flag then does the
  `clearRect` + `drawImage` + (if `chooseColorActive`) loupe-adjacent
  overlay work. Call `scheduleRedraw()` after any transform change (pan
  delta, zoom, resize) and after image load. Do **not** run an unconditional
  `requestAnimationFrame` loop — coalesce via the flag so idle CPU usage is
  zero, and so tests relying on deterministic state don't race an
  animation loop (DESIGN's testability note: "keep sampling math
  independent of animation timing").
- Empty state: `#emptyState` is visible (not `hidden`) whenever
  `state.sourceCanvas === null`; hidden once an image is loaded. Simplest
  as a CSS rule keyed off a class on `#stage` (e.g. `.stage.has-image
  .empty-state { display: none; }`) toggled in the load-success handler.

---

## 5. Pan implementation

Only active when `!state.chooseColorActive` and exactly one pointer is
down (a second pointer during a pan transitions to pinch — see section 6).

```js
canvas.addEventListener('pointerdown', (e) => {
  state.pointer.active.set(e.pointerId, { x: cssX(e), y: cssY(e) });
  if (state.chooseColorActive) return; // sampling handled by click/pointerup below, no pan
  if (state.pointer.active.size === 1) {
    state.pointer.dragging = true;
    state.pointer.pointerId = e.pointerId;
    state.pointer.lastX = cssX(e);
    state.pointer.lastY = cssY(e);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
  } else if (state.pointer.active.size === 2) {
    state.pointer.dragging = false; // hand off to pinch
    beginPinch();
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (state.pointer.active.has(e.pointerId)) {
    state.pointer.active.set(e.pointerId, { x: cssX(e), y: cssY(e) });
  }
  if (state.pointer.active.size === 2) { updatePinch(); return; }
  if (!state.pointer.dragging || e.pointerId !== state.pointer.pointerId) return;
  const x = cssX(e), y = cssY(e);
  state.transform.offsetX += x - state.pointer.lastX;
  state.transform.offsetY += y - state.pointer.lastY;
  state.pointer.lastX = x; state.pointer.lastY = y;
  scheduleRedraw();
});

function endPointer(e) {
  state.pointer.active.delete(e.pointerId);
  if (e.pointerId === state.pointer.pointerId) {
    state.pointer.dragging = false;
    state.pointer.pointerId = null;
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }
  if (state.pointer.active.size < 2) endPinch();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (state.pointer.active.size <= 1) endPointer(e); });
```

Cursor CSS: `.stage canvas { cursor: grab; }` /
`.stage canvas.grabbing { cursor: grabbing; }` /
`.stage.choose-color canvas { cursor: crosshair; }` (mode class toggled on
`#stage` when Choose Color is engaged — see section 7).

`cssX(e)`/`cssY(e)` are the small helpers from section 2
(`clientX/Y - rect.left/top`).

---

## 6. Zoom implementation

### Wheel-zoom anchored at cursor

```js
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const cssX0 = cssX(e), cssY0 = cssY(e);
  const imgX = (cssX0 - state.transform.offsetX) / state.transform.scale;
  const imgY = (cssY0 - state.transform.offsetY) / state.transform.scale;

  const zoomFactor = Math.exp(-e.deltaY * 0.001); // smooth, deltaY-sign-correct
  const newScale = clampScale(state.transform.scale * zoomFactor);

  // Re-anchor: keep (imgX, imgY) under (cssX0, cssY0) after rescaling.
  state.transform.scale = newScale;
  state.transform.offsetX = cssX0 - imgX * newScale;
  state.transform.offsetY = cssY0 - imgY * newScale;
  scheduleRedraw();
  updateZoomIndicator();
}, { passive: false });

function clampScale(s) {
  return Math.min(Math.max(s, state.fitScale * 0.5), state.fitScale === Infinity ? s : 40);
}
```

(Use DESIGN's example range: `[fitScale * 0.5, 40]` as literal numeric
bounds — min relative to fit so a small/huge source image still has a
sensible lower bound, max as an absolute 40x since infinite zoom on a
small image is not useful past pixel-block level. Worker may tune exact
constants but must implement *some* `[min, max]` clamp — do not ship
unclamped zoom.)

Wheel listener must be registered `{ passive: false }` so
`preventDefault()` is honored (prevents page scroll).

### Pinch (two-pointer)

State already tracked in `state.pointer.active` (Map of pointerId → {x,y}
in CSS space) from section 5.

```js
function pinchPoints() {
  const pts = [...state.pointer.active.values()];
  return pts; // exactly 2 entries when pinch is active
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function beginPinch() {
  const [a, b] = pinchPoints();
  const m = mid(a, b);
  state.pointer.pinch = {
    startDist: dist(a, b),
    startScale: state.transform.scale,
    startImgX: (m.x - state.transform.offsetX) / state.transform.scale,
    startImgY: (m.y - state.transform.offsetY) / state.transform.scale,
  };
}

function updatePinch() {
  if (!state.pointer.pinch || state.pointer.active.size !== 2) return;
  const [a, b] = pinchPoints();
  const m = mid(a, b);
  const d = dist(a, b);
  const ratio = d / state.pointer.pinch.startDist;
  const newScale = clampScale(state.pointer.pinch.startScale * ratio);
  state.transform.scale = newScale;
  // anchor at current midpoint (also gives two-finger pan for free, since
  // the midpoint itself may have translated since pinch start)
  state.transform.offsetX = m.x - state.pointer.pinch.startImgX * newScale;
  state.transform.offsetY = m.y - state.pointer.pinch.startImgY * newScale;
  scheduleRedraw();
  updateZoomIndicator();
}

function endPinch() {
  state.pointer.pinch = null;
  // if exactly one pointer remains and chooseColor is off, resume pan
  // from its current position rather than jumping
  if (state.pointer.active.size === 1 && !state.chooseColorActive) {
    const [only] = pinchPoints();
    state.pointer.dragging = true;
    state.pointer.lastX = only.x; state.pointer.lastY = only.y;
  }
}
```

This single anchoring formula (re-deriving `startImgX/Y` from the
midpoint at gesture start, then solving offset from current midpoint +
current scale) naturally covers both "zoom anchored at midpoint" and
"two-finger pan by midpoint translation" in one code path — no separate
pan-delta accumulation needed for the two-finger case.

Pinch should work even while `chooseColorActive` is true, per DESIGN
("still allow wheel-zoom while sampling... click samples, it does not
pan") — extend that allowance to pinch-zoom too for consistency (pinch is
the touch equivalent of wheel-zoom, not of click-pan). Single-pointer
drag remains disabled in Choose Color mode; two-pointer pinch-zoom is not
disabled.

---

## 7. Choose Color (eyedropper) mode

### Toggle

```js
chooseColorBtn.addEventListener('click', () => {
  state.chooseColorActive = !state.chooseColorActive;
  chooseColorBtn.setAttribute('aria-pressed', String(state.chooseColorActive));
  chooseColorBtn.classList.toggle('active', state.chooseColorActive);
  stage.classList.toggle('choose-color', state.chooseColorActive);
  loupeEl.hidden = !state.chooseColorActive;
  if (!state.chooseColorActive) {
    // cancel any in-progress drag state left over defensively
    state.pointer.dragging = false;
  }
});
```

CSS: `.stage.choose-color canvas { cursor: crosshair; }` (already noted in
section 5); `.choose-color-btn.active` gets a pressed visual (e.g. inset
box-shadow / background change) — purely cosmetic, worker's discretion.

### Loupe rendering

- `#loupe` is a small fixed-size circular `<div>` (e.g. 120px diameter,
  `border-radius: 50%`, `overflow: hidden`, `pointer-events: none`,
  `position: fixed` or `position: absolute` positioned via
  `transform: translate(...)` each `pointermove`) containing
  `#loupeCanvas`, a `<canvas>` sized to match (e.g. 120×120 CSS px, backing
  store also scaled by `dpr` for crispness of the loupe's *frame*, though
  the pixelation of the sampled image is intentional and separate).
- On every `pointermove` over the canvas while `chooseColorActive`:
  1. Position `#loupe` so it's centered near the cursor but offset enough
     not to be covered by the cursor itself (e.g. up-and-right by a fixed
     pixel offset, or directly centered on the cursor if design prefers —
     worker's call, but must not obscure the sampled point with the OS
     cursor glyph itself blocking the view; a small offset is simplest).
  2. Compute the target image pixel: `(px, py) = floor(inverse-map(cssX,
     cssY))` exactly as in `sampleAt` (section 2), but without calling
     `getImageData` yet — just for centering the loupe view.
  3. Draw into `loupeCanvas`'s context:
     - `loupeCtx.imageSmoothingEnabled = false;` (mandatory, per DESIGN —
       crisp pixelated zoom).
     - Choose a loupe zoom factor, e.g. `LOUPE_PIXELS = 9` (a 9×9 block of
       source pixels fills the loupe diameter) → per-source-pixel size in
       loupe-canvas space = `loupeCanvasSize / LOUPE_PIXELS`.
     - `loupeCtx.clearRect(...)`.
     - `loupeCtx.drawImage(sourceCanvas, px - 4, py - 4, LOUPE_PIXELS,
       LOUPE_PIXELS, 0, 0, loupeCanvasSize, loupeCanvasSize)` — draws the
       9×9 source block scaled up to fill the loupe, nearest-neighbor
       (because smoothing is off).
     - Draw crosshair lines (full-width/height thin lines through the
       center) with `loupeCtx.strokeStyle` in a contrasting color (e.g.
       semi-transparent white with a dark 1px outline, or simply a
       neutral gray — worker's call).
     - Draw a **center cell outline**: a 1-source-pixel-sized square
       stroke exactly at the loupe's center cell (the cell containing
       `(px, py)`) so the user can see precisely which pixel will be
       sampled — this is the pixel the crosshair marks.
     - If `(px, py)` is outside image bounds, either hide the loupe or
       show a "no pixel here" empty/gray state — do not throw.
  4. `scheduleRedraw()` is *not* required for the loupe itself since it's
     drawn imperatively in the `pointermove` handler on its own canvas,
     independent of the main canvas's rAF cycle — keep it responsive to
     every pointermove rather than coalesced, since it's cheap (a 9×9
     source blit).

### Click-to-sample

```js
canvas.addEventListener('pointerup', (e) => {
  if (!state.chooseColorActive) return;
  if (state.pointer.active.size > 1) return; // mid-pinch, not a sample click
  const x = cssX(e), y = cssY(e);
  const rgba = sampleAt(x, y); // section 2's sampleAt, CSS-space entry point
  if (rgba) addColor(rgba);
});
```

Use `pointerup` (not `click`) so it's consistent with the pointer-event
model already used for pan/pinch, and fires reliably across mouse/touch/
pen. Guard against firing during a pinch release. Sampling reuses the
exact same inverse-transform math as section 2 — no separate/duplicated
formula.

Pan handlers in section 5 already early-return when
`state.chooseColorActive` is true, so no drag/offset changes occur in this
mode — clicks only sample, never pan, per DESIGN.

---

## 8. Color row DOM, copy-to-clipboard, formatting functions

### Pure formatting functions (also exposed on the test hook, section 10)

```js
function rgbaString({ r, g, b, a }) {
  // r,g,b: 0-255 integers; a: 0-1 float
  const alpha = Number.isInteger(a) ? a : Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexString({ r, g, b, a }) {
  const h = (n) => n.toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`;
  if (a < 1) {
    return `${base}${h(Math.round(a * 255))}`;
  }
  return base;
}
```

- `rgbaString`: always includes alpha per DESIGN ("Fully opaque still
  renders alpha... `rgba(r, g, b, 1)`"), trimmed representation (`1`,
  `0.5`, not `1.000`).
- `hexString`: lowercase, `#rrggbb` when `a === 1`(fully opaque, i.e.
  `a >= 1` guard against float artifacts — use `a >= 1` as the cutoff, or
  normalize `a` to exactly `1` when `data[3] === 255` at sample time so
  this comparison is exact), `#rrggbbaa` when `a < 1`.
- Both are pure (no DOM access), unit-testable directly, and are the
  **only** place formatting logic lives — row-building code just calls
  these two functions, never re-implements formatting inline.

### `addColor`

```js
let nextId = 1;
function addColor({ r, g, b, a }) {
  const color = { id: nextId++, r, g, b, a };
  state.colors.unshift(color); // newest first
  renderColorList();
  return color;
}
```

### Row rendering

`renderColorList()` rebuilds `#colorList`'s children from `state.colors`
(simplest correct approach for a list that's rarely more than dozens of
rows; no need for a diffing scheme). Each row:

- `.swatch`: `style.background = rgbaString(color)`; if `a < 1`, apply a
  CSS checker-pattern background *behind* it (e.g. a repeating-conic-
  gradient class) so partial transparency is visible, per DESIGN. Always
  give the swatch a 1px outline/border (e.g. `border: 1px solid
  rgba(0,0,0,0.2)`) so white swatches remain visible against a white page
  background.
- rgba `<input>`: `value = rgbaString(color)`, `readonly`.
- hex `<input>`: `value = hexString(color)`, `readonly`.
- Copy buttons: click handler calls `copyText(inputEl.value)` (helper
  below) then flips the button's icon/label to a checkmark for ~1s via
  `setTimeout`, then reverts. Track per-button timeout id to avoid
  overlapping flips if clicked repeatedly (clear previous timeout before
  starting a new one).
- Trash button: click handler is `async () => { if (await
  ctConfirm('Remove this color?')) removeColorById(color.id); }` (section 9;
  post-v1 — this replaced the earlier `openModal('single', color.id)` call).

### Copy-to-clipboard helper

```js
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to fallback (e.g. clipboard-write permission denied)
    }
  }
  // Fallback: temporary offscreen textarea + execCommand('copy')
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return ok;
}
```

---

## 8A. Derived output textareas (RGBA-per-line, HEX-per-line)

Mirrors `tools/color-converter`'s outputs section. `state.colors` (newest
first, per `addColor`'s `unshift`) is the single source of truth; these two
textareas are pure derivations of it, matching order 1:1 with the visible
rows so a given row index and its corresponding textarea line index always
agree:

```js
function rgbaOutput() {
  return state.colors.map(rgbaString).join('\n');
}

function hexOutput() {
  return state.colors.map(hexString).join('\n');
}

function updateCopyAllDisabled() {
  const empty = state.colors.length === 0;
  rgbaCopyAllBtn.disabled = empty;
  hexCopyAllBtn.disabled = empty;
}

function renderOutputs() {
  rgbaOutputEl.value = rgbaOutput();
  hexOutputEl.value = hexOutput();
  updateCopyAllDisabled();
}
```

`renderOutputs()` is called at the end of `renderColorList()` (so it re-runs
on every add/remove/remove-all, since all three funnel through
`renderColorList()`) and once at init.

Copy-all buttons reuse the row copy buttons' `copyText()`/`handleCopyClick()`
helper unchanged — no separate clipboard implementation. Since a Copy-all
button's visible label is text ("Copy all") rather than an icon,
`handleCopyClick` tracks each button's original label
(`btn.dataset.originalLabel`) and flips to "Copied!" for text buttons /
`✅` for icon buttons, reverting after ~1s, exactly as `tools/color-converter`
does it:

```js
async function handleCopyClick(btn, text) {
  if (!text) return; // defensive; Copy-all is disabled when empty anyway
  const ok = await copyText(text);
  if (!ok) return;
  clearTimeout(copyTimeouts.get(btn));
  const original = btn.dataset.originalLabel ?? btn.textContent;
  btn.dataset.originalLabel = original;
  btn.textContent = original === 'Copy all' ? 'Copied!' : '✅';
  copyTimeouts.set(btn, setTimeout(() => { btn.textContent = original; }, 1000));
}

rgbaCopyAllBtn.addEventListener('click', () => handleCopyClick(rgbaCopyAllBtn, rgbaOutputEl.value));
hexCopyAllBtn.addEventListener('click', () => handleCopyClick(hexCopyAllBtn, hexOutputEl.value));
```

CSS: a `.outputs-section` flex row of two `.output-col` columns (label +
`<textarea readonly>` + Copy-all button), matching `color-converter`'s
layout; `@media (max-width: 700px) { .outputs-section { flex-direction:
column; } }` stacks them on narrow screens.

---

## 9. Shared `ctConfirm` confirm dialog

**Change (post-v1, superseding the original bespoke modal below):** per
`docs/conventions.md`'s "Destructive actions require confirmation" /
"Use the shared component" rules, the bespoke `#modalBackdrop`/`openModal`/
`closeModal`/`confirmModal`/`onModalKeydown` modal has been **removed** and
replaced with the shared, pasted `ctConfirm(message)` component
(`tools/include/confirm.js`, pasted verbatim — sentinels included — as a
classic `<script>` block right after the footer and before the module
`<script>`, see §1):

```js
// Trash button (per row):
trashBtn.addEventListener('click', async () => {
  if (await ctConfirm('Remove this color?')) removeColorById(color.id);
});

// Remove all:
removeAllBtn.addEventListener('click', async () => {
  if (state.colors.length === 0) return;
  if (await ctConfirm('Remove all colors?')) removeAllColors();
});
```

`ctConfirm` handles Enter=Yes (default focus), Esc=Cancel, backdrop-click=
Cancel, focus trap, and returning focus to the triggering control, all
internally — none of that needs reimplementing in `index.html` anymore. It
has **no `data-testid`s of its own** (it's a tool-agnostic pasted component);
tests drive it via `getByRole('dialog')` and the "Yes"/"Cancel" button names,
and `.ctc-overlay`/`.ctc-message` locators for backdrop/inside-dialog clicks.

**Theming:** set `--ctc-accent`, `--ctc-accent-fg`, `--ctc-bg`, `--ctc-fg`,
`--ctc-radius`, `--ctc-btn-radius`, `--ctc-focus`, `--ctc-cancel-border` on
`:root` to color-picker's own tokens (`--ctc-accent: var(--accent)` — the
tool's blue primary — with `--ctc-accent-fg: var(--accent-contrast)`), so the
highlighted **"Yes"** button reads as a clear, filled blue primary rather
than the bare system-color fallback, and never looks the same near-white as
"Cancel" — this exact bug (Yes rendering white, indistinguishable from
Cancel) is what Jason reported.

`removeColorById(id)`/`removeAllColors()` themselves are unchanged — still
direct, non-modal functions (`state.colors = state.colors.filter(...)` /
`state.colors = []`, each followed by `renderColorList()`, which itself calls
`updateRemoveAllDisabled()`/`renderOutputs()`), invoked here only after
`ctConfirm` resolves `true`, and still exposed on `window.__colorPicker` for
tests (§10).

`removeAllBtn` must still be `disabled` whenever `state.colors.length === 0`
(`updateRemoveAllDisabled()` called after every add/remove) — unchanged.

<details>
<summary>Original (removed) bespoke modal implementation, kept here for
history — do not reintroduce; superseded by ctConfirm above</summary>

The original modal was `<div id="modalBackdrop" hidden><div id="modal"
role="dialog" ...>`, generalized to carry a message and pending action/target
(`state.modal = { open, kind: 'single' | 'all', targetId, returnFocusEl }`),
with `openModal(kind, targetId)`/`closeModal()`/`confirmModal()`/
`onModalKeydown(e)` functions reimplementing the same Enter/Esc/backdrop/
focus-trap behavior `ctConfirm` now provides for free (registering
`onModalKeydown` with `capture: true` on `document`, trapping Tab between
`modalCancelBtn`/`modalConfirmBtn`, etc.). All of that markup, CSS, and JS
was deleted when adopting `ctConfirm`.

</details>

---

## 10. Testability hooks

### `data-testid` — complete list

| Element | testid |
|---|---|
| Stage/drop-target container | `stage` |
| Visible canvas | `canvas` |
| Load image button | `load-btn` |
| (file input itself needs no testid; tests drive it via the button + `browser_file_upload`, or directly set it — worker's call, but keep `#fileInput`'s `id` stable since it may be targeted by id) |
| Choose Color toggle | `choose-color-btn` |
| Reset view button | `reset-view-btn` |
| Zoom indicator | `zoom-indicator` |
| Color list container (`<ul>`) | `color-list` |
| Remove all button | `remove-all-btn` |
| Each color row (`<li>`) | `color-row` (repeated; disambiguate via `data-id` attribute, not testid) |
| Row swatch | `color-swatch` |
| Row rgba input | `color-rgba-input` |
| Row rgba copy button | `color-rgba-copy` |
| Row hex input | `color-hex-input` |
| Row hex copy button | `color-hex-copy` |
| Row trash button | `color-trash` |
| Outputs section container | `outputs-section` |
| RGBA output column | `rgba-output-col` |
| RGBA output textarea | `rgba-output` |
| RGBA Copy-all button | `rgba-copy-all` |
| HEX output column | `hex-output-col` |
| HEX output textarea | `hex-output` |
| HEX Copy-all button | `hex-copy-all` |

**(Post-v1, fixer pass)** The `confirm-modal`/`confirm-modal-message`/
`confirm-modal-cancel`/`confirm-modal-confirm` testids above no longer
exist — the confirm dialog is now the shared `ctConfirm` component, which has
no `data-testid`s of its own (it's a tool-agnostic pasted component). Tests
drive/assert it via Playwright's `getByRole('dialog')` and the "Yes"/"Cancel"
button names instead; see §9.

Multiple `color-row` elements share the same testid, which is fine for
Playwright locators scoped with `.nth()` / filtered by `data-id` or by
inner text (e.g. filter by the rgba input's value) — do not invent
per-row-unique testids (e.g. `color-row-3`) since row identity/order
shifts as rows are added/removed and DESIGN doesn't ask for it.

### `window.__colorPicker` test namespace

Define near the end of the module script, after all the functions above
exist:

```js
window.__colorPicker = {
  // pure formatting functions — directly unit-testable
  rgbaString,
  hexString,

  // deterministic image loading for tests: bypasses file-picker/drag-drop,
  // loads a data URL the same way the real load path does (through
  // loadImageFromSource -> sourceCanvas), returns a Promise that resolves
  // once the image is decoded and drawn into sourceCanvas and the fit
  // transform is applied — i.e. resolves at the point a real load's
  // `onload` handler would finish.
  loadImageFromDataURL(dataUrl) {
    return loadImageFromSource(dataUrl); // shared internal helper, see below
  },

  // sample by IMAGE-SPACE integer pixel coordinates directly (not CSS
  // coordinates) — skips the inverse-transform math so tests can assert
  // on known source pixels without simulating pointer/canvas geometry
  sampleAt(px, py) {
    return sampleImagePixel(px, py); // getImageData(px, py, 1, 1) -> {r,g,b,a}, or null if out of bounds
  },

  // drive the "add a row" step directly, e.g. after computing an expected
  // color, without needing a real pointer click
  addColor,

  // read-only-ish live state for assertions (tests should not mutate this
  // directly; expose it for reading list contents / transform / mode)
  state,

  // derived-output getters (section 8A) — same newest-on-top strings the
  // rgba-output/hex-output textareas hold, for tests that want to assert
  // without scraping the DOM
  rgbaOutput,
  hexOutput,

  // (Post-v1, fixer pass) Direct, non-modal removal — used by tests that
  // don't need to drive the shared ctConfirm dialog (section 9). Invoked in
  // the real UI only after ctConfirm resolves true.
  removeColorById,
  removeAllColors,
};
```

Implementation notes to make this work cleanly:

- Factor the image-loading logic so both the real path (file input change
  / drop) and `loadImageFromDataURL` funnel through one shared async
  function, e.g. `loadImageFromSource(srcUrlOrObjectUrl)`:
  ```js
  async function loadImageFromSource(url) {
    const img = new Image();
    img.src = url;
    await img.decode(); // returns a promise; simpler & more deterministic than onload for this
    sourceCanvas.width = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCtx.drawImage(img, 0, 0);
    state.image = img;
    state.fitScale = /* computeFitTransform */ ...scale;
    state.transform = computeFitTransform();
    stage.classList.add('has-image');
    scheduleRedraw();
    updateZoomIndicator();
    return img;
  }
  ```
  The real file-input/drop handlers do: validate it's an `image/*` file →
  `URL.createObjectURL(file)` → `await loadImageFromSource(objectUrl)` →
  `URL.revokeObjectURL(objectUrl)` in a `finally`. `loadImageFromDataURL`
  just calls `loadImageFromSource(dataUrl)` directly (no object URL to
  revoke for a data URL). This satisfies DESIGN's "Reject non-image files
  gracefully" too — wrap the file-path validation (check `file.type`
  starts with `image/`) before ever calling `loadImageFromSource`, so a
  bad file shows the brief inline message and never reaches this shared
  path.
- `sampleImagePixel(px, py)` is exactly the tail of `sampleAt` from
  section 2 (the `getImageData` call + bounds check), factored out so both
  the CSS-space `sampleAt(cssX, cssY)` (used by real clicks) and the
  test's `window.__colorPicker.sampleAt(px, py)` (image-space, used by
  tests) share one implementation and one bounds check. Naming
  clarification vs. section 2: internally name the CSS-space entry point
  `sampleAtClient(cssX, cssY)` and the image-space one `sampleImagePixel(px,
  py)` to avoid confusing the two in code; the public test hook's
  `sampleAt` intentionally maps to the image-space one per DESIGN's literal
  `sampleAt(px,py)` signature.
- Guard rationale: DESIGN says "Guard it so it's inert in normal use (it's
  just a namespace)" — this just means: don't let assigning
  `window.__colorPicker` have side effects beyond exposing references
  (it doesn't start timers, doesn't change behavior, doesn't require
  external input). No feature-flag/env check is needed; a plain object
  literal assignment at the end of the module satisfies this.
- `state` is exposed by reference (not cloned) so `state.colors`,
  `state.transform`, `state.mode`/`state.chooseColorActive` are all
  live-readable by tests after actions (e.g. after a simulated click,
  `window.__colorPicker.state.colors[0]` should reflect the newest
  sample). Do not deep-clone on each access — tests read a live
  reference, same object the app itself mutates.

---

## 11. CSS notes (brief — worker has latitude on visual polish)

- Single `<style>` block, no external stylesheet.
- `.stage` uses a fixed aspect ratio (DESIGN suggests 16:10) via CSS
  `aspect-ratio: 16 / 10` with `width: 100%`, so canvas backing-store
  sizing (section 2) has a stable CSS rect to read on load/resize.
- `.stage` is the drag-drop target: `dragover`/`dragenter` preventDefault
  + a visual affordance class (e.g. `.stage.drag-over`), `drop` handles
  the file per section 10's shared load path, `dragleave` clears the
  class.
- Loupe: `border-radius: 50%; overflow: hidden; border: 2px solid
  <contrasting color>; box-shadow: ...; pointer-events: none;` so it never
  intercepts pointer events meant for the canvas underneath.
- Focus states: rely on default browser focus rings or add a visible
  `:focus-visible` outline on all buttons/inputs — do not remove outlines
  without replacing them (accessibility requirement from DESIGN).

---

## 12. Script organization (inside the single `<script type="module">`)

Order the code in clearly commented sections, top to bottom, so the file
reads linearly even though it's all inline:

1. **DOM references** — `const canvas = document.getElementById(...)` etc.,
   all grouped at the top.
2. **State** — the `state` object (section 3) and `nextId` counter.
3. **Coordinate/transform helpers** — `cssX/cssY`, `computeFitTransform`,
   `resizeCanvasForDPR`, `sampleImagePixel`, `sampleAtClient`.
4. **Image loading** — `loadImageFromSource`, file-input `change` handler,
   drag-drop handlers.
5. **Rendering** — `scheduleRedraw`, `redraw`.
6. **Pan** — pointerdown/move/up/cancel/leave handlers (section 5).
7. **Zoom** — wheel handler, pinch helpers (section 6). Reset-view button
   handler (`state.transform = computeFitTransform(); scheduleRedraw();
   updateZoomIndicator();`) fits here too.
8. **Choose Color mode** — toggle handler, loupe rendering, click-to-sample
   (section 7).
9. **Color formatting** — `rgbaString`, `hexString` (pure, no deps on
   anything above — could even be placed first; ordering here is for
   narrative flow only).
10. **Color list / rows** — `addColor`, `renderColorList`, `copyText`,
    `updateRemoveAllDisabled` (section 8), plus `rgbaOutput`, `hexOutput`,
    `renderOutputs`, `updateCopyAllDisabled` (section 8A) — `renderColorList`
    calls `renderOutputs()` at its end so the derived textareas rebuild on
    every add/remove/remove-all.
11. **Destructive-action confirms** — trash-button and Remove-all click
    handlers wired as `async () => { if (await ctConfirm(message))
    { ... } }` (section 9). `ctConfirm` itself lives in the separate classic
    `<script>` pasted before this module script (section 1), not in this
    module — nothing to author here beyond the two handlers.
12. **Test hook** — `window.__colorPicker = {...}` (section 10), last, so
    every function it references is already defined.
13. **Init** — `resizeCanvasForDPR()` once at startup, `ResizeObserver`
    setup, initial `updateRemoveAllDisabled()` / `updateZoomIndicator()`
    calls to establish correct initial UI state.

Keep every function small and named (no giant anonymous inline handlers
beyond trivial one-liners) so `window.__colorPicker` can reference the
underlying named functions directly rather than re-wrapping logic.

---

## 13. Ordered build checklist

1. Write the static HTML skeleton (toolbar, stage + canvas + empty state +
   loupe, color list section, hidden file input) with all `data-testid`s
   from section 10 in place. No JS yet; confirm it renders and is visually
   laid out (fixed aspect stage, etc.). (Post-v1: no confirm-modal markup —
   the shared `ctConfirm` component owns that; see section 9.)
2. Write the base CSS (layout, empty state, cursor states, swatch/checker
   background, loupe circle) — enough to see all states without JS driving
   them yet (can temporarily un-hide the loupe to check styling, then
   re-hide).
3. Implement DOM references + `state` object + `resizeCanvasForDPR` +
   `ResizeObserver` wiring. Confirm the canvas backing store sizes
   correctly at different window sizes / DPRs (log or eyeball via
   devtools).
4. Implement `loadImageFromSource`, file-input change handler, drag-drop
   handlers, `computeFitTransform`, and the render path
   (`scheduleRedraw`/`redraw`). Confirm: loading an image fits/centers it
   and draws correctly; empty state hides on load.
5. Implement pan (section 5). Confirm dragging moves the image correctly
   at various zoom levels (do this after step 6's zoom lands, or stub
   scale at 1 for now).
6. Implement wheel-zoom anchored at cursor and scale clamping (section 6).
   Confirm the point under the cursor stays fixed while zooming, at
   multiple zoom levels and multiple cursor positions (edges, off-image
   even).
7. Implement pinch (section 6). Manual verification is hard without a
   touch device/emulator — at minimum verify the math is exercised via
   simulated pointer events (two synthetic pointerdown/move pairs) if a
   quick manual check via devtools touch emulation isn't convenient; unit
   correctness matters more than manual polish here.
8. Implement `sampleImagePixel` / `sampleAtClient` and confirm (via
   console) that clicking known points on a loaded test image returns the
   expected color at multiple zoom/pan states — this is the single most
   important correctness check in the whole tool per DESIGN.
9. Implement the Choose Color toggle, crosshair cursor, and loupe
   rendering (section 7). Confirm the loupe tracks the cursor, is
   pixelated (no smoothing), and the center-cell outline lines up with
   what `sampleAtClient` would return for that cursor position.
10. Implement `rgbaString`/`hexString` as pure functions; sanity-check a
    handful of known inputs by hand (e.g. `{r:255,g:0,b:0,a:1}` →
    `rgba(255, 0, 0, 1)` / `#ff0000`; `{r:0,g:0,b:0,a:0.5}` →
    `rgba(0, 0, 0, 0.5)` / `#00000080`).
11. Implement `addColor` + `renderColorList` + row DOM (swatch, inputs,
    copy buttons, trash button) + `copyText` with fallback. Wire
    click-to-sample (Choose Color click handler) to call `addColor`.
    Confirm newest-first ordering, swatch rendering (including alpha
    checker background), and copy buttons giving the ~1s check-icon
    feedback.
12. Paste the shared `ctConfirm` component (`tools/include/confirm.js`,
    sentinels included) as a classic `<script>`, theme it via `--ctc-*`
    variables on `:root`, and wire it to both per-row trash and Remove all
    (`if (await ctConfirm(message)) { ... }`), including the
    `remove-all-btn` disabled-when-empty state. (Enter=Yes/default focus,
    Esc=Cancel, backdrop-click=Cancel, and focus trap all come free from the
    component — nothing to implement by hand here.)
13. Implement Reset view button and the zoom indicator's live updates on
    every scale change (wheel, pinch, reset).
14. Wire the `window.__colorPicker` test namespace (section 10) — do this
    near the end since it references functions built in every prior step.
    Manually exercise it from the devtools console:
    `await window.__colorPicker.loadImageFromDataURL(<known small PNG data
    URL>)` then `window.__colorPicker.sampleAt(x, y)` and confirm exact
    expected RGBA for a couple of known pixels; also spot check
    `rgbaString`/`hexString` are reachable and pure.
15. Accessibility pass: `aria-label`s **and** a matching `title` attribute
    (hover tooltip) on all icon-only buttons (row copy buttons, trash
    button, Copy-all buttons, touch-toast dismiss), `aria-pressed` on the
    toggle, the `ctConfirm` dialog's `role="dialog"`/`aria-modal`/labelling
    (owned by the component itself), visible focus states everywhere,
    keyboard-only walkthrough (Tab to Load image → Choose Color → Reset view
    → into the color list → trigger a trash button with keyboard → the
    dialog traps focus and Enter/Esc work).
16. Final pass over DESIGN.md's checklist top to bottom to confirm nothing
    was missed (fixed 16:10-ish stage aspect, empty-state prompt text,
    "Remove all" wording, exact button label "🔍 Choose Color", etc.).
17. Write `tools/color-picker/README.md`: what the tool does, how to open
    it (`open index.html` or serve via a static server — note `file://`
    works since there's no module-loading CORS issue... *actually check*:
    `<script type="module">` inline (not `src=`) has no CORS restriction
    even over `file://`, so `file://` opening is safe to document as
    supported), controls summary (pan/zoom/choose color/keyboard shortcuts
    in the modal), and a note that it's dependency-free vanilla HTML per
    repo convention.

Testing itself (Playwright-MCP-driven) is out of scope for the worker per
DESIGN's "Tests (delivered by the tester agent)" — the worker's job ends
at building the tool and its README, ensuring every hook in section 10
exists and behaves as specified so the tester agent can drive it without
needing implementation changes.

---

## 14. Touch / mobile relative-drag crosshair (fixer pass)

Implements DESIGN.md's "Touch / mobile (relative-drag crosshair)" subsection
of "Choose Color (eyedropper) mode". Added to `state` (section 3):

```js
touch: {
  active: false,     // touch-aim mode engaged for the current Choose Color
                      // session (device is touch-capable) — mouse/other
                      // pointer devices never set this, so their absolute
                      // cursor-follow behavior (section 7) is untouched
  cx: 0, cy: 0,       // crosshair position, CSS px, canvas-local (same space
                      // as sampleAtClient's cssX/cssY inputs)
  dragging: false,
  pointerId: null,
  lastX: 0, lastY: 0, // last CSS pos of the in-progress touch-drag pointer
  moved: 0,           // cumulative movement (px) since the current gesture
                       // started — the tap/drag threshold input
},
```

### Device detection: once per activation, not per event

`deviceIsTouchCapable() { return (navigator.maxTouchPoints || 0) > 0; }`,
called when the Choose Color toggle turns **on** (not on every pointer
event) — because DESIGN requires the dead-center crosshair to render
**immediately on activation**, before any pointer event has occurred on the
canvas to reveal a `pointerType`. `state.touch.active` is set from this once
per activation; the per-event `pointerType === 'touch'` check (below) then
gates the actual drag/tap handling so a mouse used on a touch-capable device
still gets the mouse path for that specific gesture.

```js
function isTouchAimEvent(e) {
  return state.chooseColorActive && state.touch.active && e.pointerType === 'touch';
}
```

### Toggle-on: enter touch-aim mode

```js
if (state.chooseColorActive) {
  state.touch.active = deviceIsTouchCapable();
  if (state.touch.active) {
    enterTouchAimMode(); // crosshair -> canvas center, show hint/crosshair, first-time toast
  } else {
    loupeEl.hidden = false; // existing mouse behavior, unchanged
  }
}
```

`enterTouchAimMode()` sets `cx/cy` to `canvas.getBoundingClientRect().width/2`
and `.height/2` (dead-center of the *visible* canvas, CSS-space), resets drag
state, un-hides the crosshair/hint/loupe, and calls `renderTouchAimUI()`
(below) once to draw the initial loupe. Toggle-off (or Choose Color being
re-toggled) hides all three and cancels any in-progress touch drag
(`cancelTouchDrag()`), mirroring the existing mid-drag-cancel defensive logic
already in the toggle handler for mouse pan.

### Pointer wiring: reusing the existing pointerdown/move/up handlers

The relative-drag crosshair hooks into the **same** `pointerdown` /
`pointermove` / `onPointerUp` listeners already registered on `canvas` for
pan/pinch (section 5/6) — it does not add new listeners, so the single
existing pointer-event state machine (pinch handoff, `hadPinch` stickiness,
`cancelledDragPointerId`) keeps working unmodified for the pinch-while-
sampling case DESIGN already requires.

- **pointerdown**, inside the existing `if (state.chooseColorActive) { ... }`
  branch (which used to just `return`): `if (isTouchAimEvent(e))
  startTouchDrag(e)`, then still `return` (no pan). `startTouchDrag`
  captures the pointer (`setPointerCapture`) so the drag keeps tracking even
  if the finger strays outside the canvas element's bounds — the crosshair
  itself stays clamped regardless (see `updateTouchDrag`).
- **pointermove**, inside the existing `if (state.chooseColorActive) { ...
  return; }` branch: if this is the tracked touch-drag pointer,
  `updateTouchDrag(e)` — computes `dx/dy` from the *previous* pointer
  position (not the drag's start), adds that delta to `cx/cy`, clamps to
  `[0, canvas CSS width/height]`, accumulates `moved += hypot(dx,dy)`, then
  `renderTouchAimUI()`. This is the "relative, not absolute" mapping DESIGN
  requires: the crosshair moves by the finger's *delta*, never jumps to the
  finger's position.
- **onPointerUp** (the combined sample/pan-release handler): if this is the
  tracked touch-drag pointer, `endTouchDrag()` decides tap vs. drag from
  `state.touch.moved` against `TAP_THRESHOLD_PX = 6`: below threshold →
  `sampleAtClient(state.touch.cx, state.touch.cy)` (the **crosshair's**
  position, never the pointer's) → `addColor` if in-bounds; at/above
  threshold → no sample, just `triggerCrosshairPulse()` (the drag-end
  discoverability cue). Otherwise, if this pointerup is *not* a touch-aim
  event at all (mouse, or touch-aim inactive), the existing absolute
  `sampleAtClient(cssX(e), cssY(e))` mouse path runs unchanged.
- **Two-finger pinch mid-drag**: `pointerdown`'s existing `active.size === 2`
  branch (pinch handoff) now also calls `cancelTouchDrag()` first if a
  touch-drag was in progress, so the second finger cleanly hands off to
  pinch — consistent with the existing pinch-cancels-pan behavior for mouse.
- **pointercancel/pointerleave** (via `endPointer`): defensively cancels an
  in-progress touch drag (no sample) if reached without having gone through
  `onPointerUp`'s `endTouchDrag()` first — `endPointer`'s check
  (`state.touch.dragging && state.touch.pointerId === e.pointerId`) is a
  no-op when `endTouchDrag()` already ran, since that clears `dragging`
  first.

### Loupe: offset from the crosshair, not the finger

`renderTouchAimUI()` positions `#loupe` (and `#touchCrosshair`) from
`state.touch.cx/cy` — **never** from the pointer event's `clientX/Y`. Since
the loupe's existing CSS (`transform: translate(-50%, calc(-100% - 22px))`)
already floats it up-and-centered above its anchor point, anchoring it to the
crosshair means it tracks the crosshair's (slow, relative) motion rather than
the finger's (fast, absolute) motion — it naturally stays put and visible
while the finger drags anywhere on the canvas, satisfying DESIGN's "offset
from the finger/crosshair so it stays visible while dragging" without any
extra positioning logic. Called after every crosshair move, and also from
`updatePinch()`/the wheel handler when touch-aim is active, so the loupe's
pixel content stays correct after a pinch/wheel zoom changes the transform
even though the crosshair's CSS position didn't move.

### Discoverability

- **Persistent hint** (`#touchHint`, `data-testid="touch-hint"`): shown/hidden
  together with the crosshair in `enterTouchAimMode()`/`hideTouchAimUI()`.
  Static text, no timers.
- **Pulse on drag-end** (`triggerCrosshairPulse()`): toggles a `.pulse` class
  on `#touchCrosshair` (removed then re-added after a forced reflow, so
  repeated pulses restart the animation) only when a gesture's `moved` was
  **at or above** the tap threshold (i.e. it repositioned rather than
  sampled) — the CSS `@keyframes touch-crosshair-pulse` does the glow;
  `@media (prefers-reduced-motion: reduce) { .touch-crosshair.pulse {
  animation: none; } }` removes the animation itself, so the JS doesn't need
  its own reduced-motion branch — toggling the (now-inert) class is harmless
  either way, and the hint text (unaffected by the media query) still
  communicates the model.
- **One-time toast** (`#touchToast` + `#touchToastDismiss`,
  `data-testid="touch-toast"`/`touch-toast-dismiss`): shown once per
  activation from `enterTouchAimMode()` via `maybeShowFirstTimeToast()`,
  gated on `localStorage.getItem('colorPickerTouchHintSeen') !== '1'`
  (wrapped in `try/catch`, best-effort per DESIGN); the dismiss button sets
  the flag. Never blocks interaction (no backdrop, `pointer-events: none` is
  *not* set on it since its own dismiss button needs to be tappable, but it
  doesn't intercept canvas pointer events since it's positioned at the
  bottom of the stage, out of the crosshair's usual working area).

### Test hooks (extends section 10, doesn't change existing members)

```js
window.__colorPicker.sampleAtCrosshair = () =>
  sampleAtClient(state.touch.cx, state.touch.cy); // read-only, no addColor side effect
window.__colorPicker.isTouchCrosshairActive = () =>
  state.chooseColorActive && state.touch.active;
```

`state.touch` is already live-readable via the existing `state` reference
(section 10), so no separate namespace was needed for the crosshair's
position/drag flags — only these two small read-only convenience getters
were added. Per the task brief for this pass, these are assertion helpers
only; the mobile test suite drives the crosshair through **real** dispatched
`PointerEvent`s with `pointerType: 'touch'` (the same technique the existing
pinch-regression tests already use) and Playwright's `.tap()`, never through
these hooks, so a real geometry/overlay bug can't hide behind a passing
hook-only assertion.

## 15. General mobile responsiveness (fixer pass)

Per `docs/conventions.md` "Responsive & mobile" (usable down to ~360px, no
horizontal page overflow, ~44px tap targets, wide content scrolls in its own
container). Minimal, mobile-only CSS additions (all inside `@media
(max-width: 700px)`/`(max-width: 420px)` so desktop layout/sizing is
untouched):

- `button { min-height: 44px; padding: 0.6rem 0.9rem; }` — every button
  (toolbar, Copy-all) gets a finger-friendly tap target. (The `ctConfirm`
  dialog's own buttons carry their own `min-height: 44px` internally, per
  `tools/include/confirm.js` — nothing to add here for it.)
- `.icon-btn { min-width: 44px; min-height: 44px; display: inline-flex;
  align-items: center; justify-content: center; }` — the smaller per-row
  copy/trash icon buttons get the same minimum, re-centered since they grow
  taller than their emoji content.
- `.color-row { flex-wrap: wrap; }` + `.field { flex: 1 1 100%; }` — instead
  of squeezing the rgba/hex fields to unreadably narrow widths under
  `flex-shrink` (the desktop row is a strict `nowrap` flex row), each field
  wraps to its own full-width line on narrow screens; the swatch and trash
  button stay on the first line.
- `.outputs-section` already stacked to `column` below 700px (pre-existing);
  unchanged.
- `@media (max-width: 420px)`: `.zoom-indicator` drops its `margin-left:
  auto` (which would otherwise force it onto its own mostly-empty wrapped
  line) and instead takes `flex-basis: 100%` so it wraps cleanly under the
  other toolbar controls.

No changes were needed to `.app`'s max-width/padding or `.stage`'s
`aspect-ratio` — neither produces horizontal overflow at 360px (verified via
`document.scrollingElement.scrollWidth` in the mobile test suite, section
11 of `tests/color-picker.e2e.mjs`). (The confirm dialog's own sizing —
`--ctc-max-width`, default `22rem` — is owned by `tools/include/confirm.js`,
not by this tool's CSS; it was re-verified not to overflow at mobile widths
as part of adopting `ctConfirm`, see the "Post-v1 changes" list below.)

---

### Post-v1 changes (fixer pass)

Applied together in one pass, per Jason's direct feedback ("the copy buttons
show no tooltip" and "the confirm dialog's Yes button is white like
Cancel") plus the repo's shared-component/footer conventions:

18. **Adopt `ctConfirm`** (§9): paste `tools/include/confirm.js` verbatim
    (sentinels included) as a classic `<script>`, placed after the footer
    and before the module `<script>` (§1); delete the bespoke
    `#modalBackdrop`/`openModal`/`closeModal`/`confirmModal`/
    `onModalKeydown` modal markup/CSS/JS entirely; replace the per-row
    trash and Remove-all click handlers with `if (await ctConfirm(message))
    { ... }`; theme it via `--ctc-accent`/`--ctc-accent-fg`/`--ctc-bg`/
    `--ctc-fg`/`--ctc-radius`/`--ctc-btn-radius`/`--ctc-focus`/
    `--ctc-cancel-border` on `:root` so "Yes" renders as a filled blue
    primary rather than the previous white-on-white bug. Expose
    `removeColorById`/`removeAllColors` directly on `window.__colorPicker`
    for tests. Update tests to drive `getByRole('dialog')` /
    "Yes"/"Cancel" instead of the old `confirm-modal-*` testids.
19. **Icon-only button tooltips** (§8 row DOM, §1 DOM skeleton): add a
    `title` attribute (matching the existing `aria-label`) to the per-row
    rgba-copy and hex-copy buttons, the per-row trash button, the two
    "Copy all" buttons, and the touch-toast dismiss (×) button.
20. **Paste the HTML footer** (`tools/include/footer.html`, verbatim,
    sentinels included) at the bottom of `<body>`, after `.app`'s closing
    `</div>` and before the `ctConfirm` classic `<script>` (§1). Re-verified
    the `body`-flex-direction gotcha (write-down: `tools/hat-picker/PLAN.md`
    §1 — a sibling tool's `body { display: flex }` squeezed the footer
    side-by-side with `.app` instead of stacking, because the footer became
    a second flex-row child) does **not** apply here: color-picker's `body`
    has never been `display: flex` — only the inner `.app` div is
    (`display: flex; flex-direction: column`) — so the footer as a second
    child of a plain block-flow `body` was already the safe shape. Confirmed
    with screenshots and the overflow/hit-test tests at desktop and at
    375px/360px mobile widths (no horizontal overflow, nothing pushed
    off-screen).

### Post-v1 changes (adversarial-review fixer pass)

Three findings from an adversarial visual review, fixed together in one
pass. Neither the pasted footer nor the pasted `ctConfirm` block was
touched — both md5 hashes (`a97df085179a11175786e1d57d6c2a99` /
`3fe0e7648c094461cf01e8b3e524dbc7`) were re-verified unchanged after.

21. **Fix hover-state CSS specificity (§11 CSS notes / §1 DOM skeleton)** —
    BLOCKER. The generic `button:hover:not(:disabled)` rule (specificity
    0,2,1) outranked both the pasted ctConfirm's `.ctc-btn--yes:hover`
    (filter-only, 0,2,0) and `.choose-color-btn.active` (0,2,0), so hovering
    either painted the solid accent background to near-white (`#eef1f8`)
    while the text stayed white — invisible, and a direct violation of
    `docs/conventions.md`'s "Yes" must render as "a clear, filled primary."
    Fixed by excluding both from the generic rule
    (`:not(.ctc-btn):not(.choose-color-btn.active)`) and adding an explicit
    `.choose-color-btn.active:hover` rule (0,3,0) that re-asserts the filled
    accent state. Ordinary buttons and the inactive toggle keep the
    original light `#eef1f8` hover; the ctConfirm buttons now get their own
    (unmolested) hover styling from the pasted component.
22. **Loupe default position on mouse-mode activation (§7 Choose Color
    mode)** — MAJOR. `loupeEl.hidden = false` was set immediately on
    activation, but `loupeEl.style.left/top` were only ever assigned inside
    `updateLoupe()` (driven by a real `pointermove`/`pointerenter` over the
    canvas), so before the mouse first entered the canvas `#loupe`
    (`position: fixed`, left/top unset) fell back to its static DOM
    position — a stray opaque circle over the header/toolbar. Fixed with a
    new `positionLoupeDefault()` helper, called once on activation (before
    un-hiding the loupe): centers `#loupe` over the canvas in viewport
    space and, if an image is already loaded and the center point lands on
    it, draws that pixel too. `updateLoupe()` immediately takes over on the
    first real pointer event, so normal follow-the-cursor behavior is
    unchanged.
23. **Touch-mode hint pill vs. loupe overlap (§14 Touch / mobile)** — MINOR.
    `.touch-hint` was anchored at `top: 8px`, but on a short mobile canvas
    the touch-aim loupe — offset up ~120+22px from the dead-center
    crosshair via the shared `.loupe` transform — sweeps most of the top of
    the stage on first activation, hiding the hint entirely. Fixed by
    re-anchoring `.touch-hint` to `bottom: 52px`, clear of the also-bottom-
    anchored one-time `touch-toast` pill (`bottom: 8px`) so neither pill
    overlaps the other when both show on a fresh first activation. Pure CSS
    change; `.touch-hint` is exclusively used in touch mode, so nothing
    else is affected.

Test suite grew from 57 to 63 tests (`tests/TESTS.md` "Adversarial-review
fixer pass" has full detail, including before/after hover-background
measurements and hint/loupe rect measurements).
