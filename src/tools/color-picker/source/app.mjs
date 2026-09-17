
  // =====================================================================
  // 1. DOM references
  // =====================================================================
  const helpButtonEl = document.getElementById('helpButton');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtnEl = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  const loadBtn = document.getElementById('loadBtn');
  const fileInput = document.getElementById('fileInput');
  const chooseColorBtn = document.getElementById('chooseColorBtn');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const zoomIndicatorEl = document.getElementById('zoomIndicator');
  const loadErrorEl = document.getElementById('loadError');

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const emptyStateEl = document.getElementById('emptyState');

  const loupeEl = document.getElementById('loupe');
  const loupeCanvas = document.getElementById('loupeCanvas');
  const loupeCtx = loupeCanvas.getContext('2d');

  const touchHintEl = document.getElementById('touchHint');
  const touchCrosshairEl = document.getElementById('touchCrosshair');
  const touchToastEl = document.getElementById('touchToast');
  const touchToastDismissBtn = document.getElementById('touchToastDismiss');

  const colorListEl = document.getElementById('colorList');
  const removeAllBtn = document.getElementById('removeAllBtn');

  const rgbaOutputEl = document.getElementById('rgbaOutput');
  const hexOutputEl = document.getElementById('hexOutput');
  const rgbaCopyAllBtn = document.getElementById('rgbaCopyAllBtn');
  const hexCopyAllBtn = document.getElementById('hexCopyAllBtn');

  // Offscreen natural-resolution bitmap: the single source of pixel truth.
  // Reused across loads (resized/redrawn each time); `state.sourceCanvas`
  // stays null until the first successful image load, which also gates
  // the empty-state UI.
  const sourceCanvasEl = document.createElement('canvas');
  const sourceCtxEl = sourceCanvasEl.getContext('2d', { willReadFrequently: true });

  // =====================================================================
  // 2. State
  // =====================================================================
  const STORAGE_KEY = 'color-picker:v1';
  const HELP_SEEN_KEY = 'color-picker:help-seen:v1';

  let nextId = 1;

  const state = {
    image: null,
    sourceCanvas: null,
    sourceCtx: null,

    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    fitScale: 1,

    mode: 'idle', // 'idle' | 'pan' | 'chooseColor'
    chooseColorActive: false,

    pointer: {
      dragging: false,
      lastX: 0, lastY: 0,
      pointerId: null,
      active: new Map(), // pointerId -> {x, y} in CSS space
      pinch: null,
      // True for the whole lifetime of a pinch gesture, from beginPinch()
      // until every pointer involved has been lifted (active size back to
      // 0) — unlike pinch/active.size, this stays true across BOTH fingers'
      // pointerup events, so the second finger's release can still be
      // recognized as pinch-related even though by then the map is back
      // down to size 1. See onPointerUp.
      hadPinch: false,
      // pointerId of a single-pointer drag that was forcibly cancelled
      // (e.g. by Choose Color being toggled on mid-drag) so that pointer's
      // eventual pointerup is not mistaken for a fresh sampling click.
      cancelledDragPointerId: null,
    },

    colors: [], // [{ id, r, g, b, a }], newest first

    // Touch relative-drag crosshair (DESIGN.md "Touch / mobile"). `active`
    // means the current Choose Color session is in touch-aim mode (device is
    // touch-capable) — a rendered crosshair at (cx, cy) that a drag moves
    // RELATIVELY (by the finger's delta), and a tap (small total movement)
    // samples. Mouse/non-touch pointer devices never set `active`, so their
    // behavior (loupe/crosshair follow the cursor absolutely, click samples)
    // is untouched.
    touch: {
      active: false,
      cx: 0, cy: 0,       // crosshair position, CSS px, canvas-local
      dragging: false,
      pointerId: null,
      lastX: 0, lastY: 0,
      moved: 0,           // cumulative movement (px) since the current touch gesture started
    },

    rafScheduled: false,
  };

  // =====================================================================
  // 2a. Persistence (localStorage) — docs/conventions.md "Persist UI state"
  // =====================================================================
  // Only the collected color list (`state.colors`) is durable, user-built
  // state worth restoring. The loaded IMAGE is not persisted (image bytes
  // can be large, and the color list is independent of the image — the
  // swatch rows and the two derived rgba/hex textareas render fine with no
  // image loaded). The derived textareas themselves are DERIVED from
  // state.colors and are never stored — renderColorList()/renderOutputs()
  // recompute them on restore. Distinct from TOUCH_TOAST_SEEN_KEY below,
  // which is its own one-time-toast flag, not part of this versioned blob.
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ colors: state.colors }));
    } catch {
      // Best-effort: localStorage unavailable (file://, private mode, quota,
      // browser policy). Degrade silently to in-memory only.
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { colors: [] };
      const parsed = JSON.parse(raw);
      const colors = Array.isArray(parsed.colors)
        ? parsed.colors.filter((c) => c
            && Number.isInteger(c.id)
            && Number.isInteger(c.r) && c.r >= 0 && c.r <= 255
            && Number.isInteger(c.g) && c.g >= 0 && c.g <= 255
            && Number.isInteger(c.b) && c.b >= 0 && c.b <= 255
            && typeof c.a === 'number' && c.a >= 0 && c.a <= 1)
        : [];
      return { colors };
    } catch {
      return { colors: [] };
    }
  }

  // =====================================================================
  // 3. Coordinate / transform helpers
  // =====================================================================
  function cssX(e) { return e.clientX - canvas.getBoundingClientRect().left; }
  function cssY(e) { return e.clientY - canvas.getBoundingClientRect().top; }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function computeFitTransform() {
    const rect = stage.getBoundingClientRect();
    const iw = state.sourceCanvas.width;
    const ih = state.sourceCanvas.height;
    const scale = Math.min(rect.width / iw, rect.height / ih);
    const offsetX = (rect.width - iw * scale) / 2;
    const offsetY = (rect.height - ih * scale) / 2;
    return { scale, offsetX, offsetY };
  }

  function resizeCanvasForDPR() {
    const dpr = window.devicePixelRatio || 1;
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    // 1 unit in ctx-space == 1 CSS px from here on; the rest of the code
    // never touches dpr again.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.chooseColorActive && state.touch.active) {
      // Keep the persisted crosshair inside the (possibly resized) canvas.
      state.touch.cx = clamp(state.touch.cx, 0, rect.width);
      state.touch.cy = clamp(state.touch.cy, 0, rect.height);
      renderTouchAimUI();
    }
    scheduleRedraw();
  }

  // Image-space pixel sampling — the single source of truth for both the
  // real click path and the test hook. Always reads from the offscreen
  // natural-resolution source canvas, never the visible (transformed) one.
  function sampleImagePixel(px, py) {
    if (!state.sourceCtx || !state.sourceCanvas) return null;
    if (px < 0 || py < 0 || px >= state.sourceCanvas.width || py >= state.sourceCanvas.height) {
      return null;
    }
    const { data } = state.sourceCtx.getImageData(px, py, 1, 1);
    // Normalize fully-opaque alpha to exactly 1 so hex-formatting's `a < 1`
    // cutoff is exact rather than subject to float rounding.
    const a = data[3] === 255 ? 1 : data[3] / 255;
    return { r: data[0], g: data[1], b: data[2], a };
  }

  // CSS-space entry point (real pointer clicks): inverse-maps CSS coords
  // to image-space, then defers to sampleImagePixel.
  function sampleAtClient(cssPX, cssPY) {
    const imgX = (cssPX - state.transform.offsetX) / state.transform.scale;
    const imgY = (cssPY - state.transform.offsetY) / state.transform.scale;
    return sampleImagePixel(Math.floor(imgX), Math.floor(imgY));
  }

  // =====================================================================
  // 4. Image loading
  // =====================================================================
  async function loadImageFromSource(url) {
    const img = new Image();
    img.src = url;
    await img.decode();

    sourceCanvasEl.width = img.naturalWidth;
    sourceCanvasEl.height = img.naturalHeight;
    sourceCtxEl.drawImage(img, 0, 0);

    state.image = img;
    state.sourceCanvas = sourceCanvasEl;
    state.sourceCtx = sourceCtxEl;

    state.transform = computeFitTransform();
    state.fitScale = state.transform.scale;

    stage.classList.add('has-image');
    hideLoadError();
    scheduleRedraw();
    updateZoomIndicator();
    return img;
  }

  function showLoadError(message) {
    loadErrorEl.textContent = message;
    loadErrorEl.hidden = false;
  }

  function hideLoadError() {
    loadErrorEl.hidden = true;
    loadErrorEl.textContent = '';
  }

  async function handleFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      showLoadError('Please choose an image file.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      await loadImageFromSource(objectUrl);
    } catch (err) {
      showLoadError('Could not load that image.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  loadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // allow re-choosing the same file later
    if (file) await handleFile(file);
  });

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragenter', (e) => { e.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', () => { stage.classList.remove('drag-over'); });
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    stage.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) await handleFile(file);
  });

  // =====================================================================
  // 5. Rendering
  // =====================================================================
  function scheduleRedraw() {
    if (state.rafScheduled) return;
    state.rafScheduled = true;
    requestAnimationFrame(redraw);
  }

  function redraw() {
    state.rafScheduled = false;
    const rect = stage.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!state.sourceCanvas) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      state.sourceCanvas,
      0, 0, state.sourceCanvas.width, state.sourceCanvas.height,
      state.transform.offsetX, state.transform.offsetY,
      state.sourceCanvas.width * state.transform.scale,
      state.sourceCanvas.height * state.transform.scale,
    );
  }

  // =====================================================================
  // 6. Pan
  // =====================================================================
  canvas.addEventListener('pointerdown', (e) => {
    if (state.pointer.active.size === 0) {
      // Fresh gesture starting from no pointers down: clear any leftover
      // pinch-tracking flag from a previous gesture defensively (endPointer
      // already resets this when the last pointer of a gesture lifts, but
      // resetting here too keeps this robust regardless of event ordering).
      state.pointer.hadPinch = false;
    }
    state.pointer.active.set(e.pointerId, { x: cssX(e), y: cssY(e) });
    // Two-pointer pinch-zoom is allowed even while sampling (it's the touch
    // equivalent of wheel-zoom, not of click-pan) — check this before the
    // chooseColorActive early-return below, which only suppresses
    // single-pointer panning.
    if (state.pointer.active.size === 2) {
      state.pointer.dragging = false; // hand off to pinch
      if (state.touch.dragging) cancelTouchDrag(); // 2nd finger joined -> pinch takes over
      beginPinch();
      return;
    }
    if (state.chooseColorActive) {
      if (isTouchAimEvent(e)) startTouchDrag(e);
      return; // sampling happens on pointerup, no pan
    }
    if (state.pointer.active.size === 1) {
      state.pointer.dragging = true;
      state.pointer.pointerId = e.pointerId;
      state.pointer.lastX = cssX(e);
      state.pointer.lastY = cssY(e);
      state.mode = 'pan';
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state.pointer.active.has(e.pointerId)) {
      state.pointer.active.set(e.pointerId, { x: cssX(e), y: cssY(e) });
    }
    if (state.pointer.active.size === 2) { updatePinch(); return; }
    if (state.chooseColorActive) {
      if (state.touch.dragging && e.pointerId === state.touch.pointerId) {
        updateTouchDrag(e);
      }
      return; // sampling mode never pans, even mid-gesture
    }
    if (!state.pointer.dragging || e.pointerId !== state.pointer.pointerId) return;
    const x = cssX(e), y = cssY(e);
    state.transform.offsetX += x - state.pointer.lastX;
    state.transform.offsetY += y - state.pointer.lastY;
    state.pointer.lastX = x;
    state.pointer.lastY = y;
    scheduleRedraw();
  });

  function endPointer(e) {
    state.pointer.active.delete(e.pointerId);
    if (state.pointer.active.size === 0) state.pointer.hadPinch = false;
    if (state.pointer.cancelledDragPointerId === e.pointerId) {
      state.pointer.cancelledDragPointerId = null;
    }
    if (state.touch.dragging && state.touch.pointerId === e.pointerId) {
      // Reached via pointercancel/pointerleave (onPointerUp already resolves
      // a normal pointerup via endTouchDrag(), which clears `dragging` first,
      // so this is a no-op in that case) — cancel without sampling.
      cancelTouchDrag();
    }
    if (e.pointerId === state.pointer.pointerId) {
      state.pointer.dragging = false;
      state.pointer.pointerId = null;
      canvas.classList.remove('grabbing');
      state.mode = state.chooseColorActive ? 'chooseColor' : 'idle';
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
    if (state.pointer.active.size < 2) endPinch();
  }

  // Sampling and pan-release both react to pointerup. They're combined into
  // one handler (rather than two separate listeners) so the "was this a
  // mid-pinch release?" check can be made robustly BEFORE endPointer() does
  // any cleanup.
  //
  // NOTE: state.pointer.active.size alone is NOT a reliable "was this pointer
  // part of a pinch?" signal — on the SECOND finger's release of a
  // two-finger pinch, the first finger's pointerup has already shrunk the
  // map to size 1 (and cleared state.pointer.pinch via endPinch()), so
  // neither `active.size > 1` nor `pinch !== null` reads true anymore even
  // though this pointerup is ending the same pinch gesture. Instead we rely
  // on state.pointer.hadPinch, which is set true in beginPinch() and stays
  // true across BOTH fingers' pointerup events until the whole gesture is
  // fully released (active size back to 0) — see endPointer().
  function onPointerUp(e) {
    const wasPinchRelease = state.pointer.active.size > 1 || state.pointer.hadPinch;
    const wasCancelledDrag = state.pointer.cancelledDragPointerId === e.pointerId;
    if (wasCancelledDrag) state.pointer.cancelledDragPointerId = null;
    if (state.chooseColorActive && !wasPinchRelease && !wasCancelledDrag) {
      if (state.touch.dragging && e.pointerId === state.touch.pointerId) {
        endTouchDrag(); // tap samples at the crosshair; a drag just repositions it
      } else if (!isTouchAimEvent(e)) {
        // Existing mouse / non-touch-aim path: sample exactly under the pointer.
        const rgba = sampleAtClient(cssX(e), cssY(e));
        if (rgba) addColor(rgba);
      }
    }
    endPointer(e);
  }

  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (state.pointer.active.size <= 1) endPointer(e); });

  // =====================================================================
  // 7. Zoom (wheel + pinch)
  // =====================================================================
  function clampScale(s) {
    const min = state.fitScale > 0 && isFinite(state.fitScale) ? state.fitScale * 0.5 : 0.01;
    return Math.min(Math.max(s, min), 40);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cssX0 = cssX(e), cssY0 = cssY(e);
    const imgX = (cssX0 - state.transform.offsetX) / state.transform.scale;
    const imgY = (cssY0 - state.transform.offsetY) / state.transform.scale;

    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const newScale = clampScale(state.transform.scale * zoomFactor);

    state.transform.scale = newScale;
    state.transform.offsetX = cssX0 - imgX * newScale;
    state.transform.offsetY = cssY0 - imgY * newScale;
    scheduleRedraw();
    updateZoomIndicator();
    if (state.chooseColorActive && state.touch.active) renderTouchAimUI();
  }, { passive: false });

  function pinchPoints() { return [...state.pointer.active.values()]; }
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
    state.pointer.hadPinch = true; // sticky across both fingers' pointerup, see onPointerUp
  }

  function updatePinch() {
    if (!state.pointer.pinch || state.pointer.active.size !== 2) return;
    const [a, b] = pinchPoints();
    const m = mid(a, b);
    const d = dist(a, b);
    const ratio = state.pointer.pinch.startDist > 0 ? d / state.pointer.pinch.startDist : 1;
    const newScale = clampScale(state.pointer.pinch.startScale * ratio);
    state.transform.scale = newScale;
    // Re-anchoring at the *current* midpoint also gives two-finger pan for
    // free, since the midpoint itself may have translated since gesture start.
    state.transform.offsetX = m.x - state.pointer.pinch.startImgX * newScale;
    state.transform.offsetY = m.y - state.pointer.pinch.startImgY * newScale;
    scheduleRedraw();
    updateZoomIndicator();
    // The crosshair's CSS position doesn't move during a pinch, but the
    // transform did — refresh the loupe so it reflects the (now different)
    // source pixel under the crosshair at the new zoom level.
    if (state.chooseColorActive && state.touch.active) renderTouchAimUI();
  }

  function endPinch() {
    state.pointer.pinch = null;
    if (state.pointer.active.size === 1 && !state.chooseColorActive) {
      const [only] = pinchPoints();
      state.pointer.dragging = true;
      state.pointer.lastX = only.x;
      state.pointer.lastY = only.y;
    }
  }

  resetViewBtn.addEventListener('click', () => {
    if (!state.sourceCanvas) return;
    state.transform = computeFitTransform();
    scheduleRedraw();
    updateZoomIndicator();
  });

  function updateZoomIndicator() {
    zoomIndicatorEl.textContent = `${Math.round(state.transform.scale * 100)}%`;
  }

  // =====================================================================
  // 8. Choose Color (eyedropper) mode
  // =====================================================================
  const LOUPE_SIZE = 120;   // CSS px, matches #loupe / #loupeCanvas
  const LOUPE_PIXELS = 9;   // source pixels shown across the loupe diameter

  chooseColorBtn.addEventListener('click', () => {
    state.chooseColorActive = !state.chooseColorActive;
    state.mode = state.chooseColorActive ? 'chooseColor' : 'idle';
    chooseColorBtn.setAttribute('aria-pressed', String(state.chooseColorActive));
    chooseColorBtn.classList.toggle('active', state.chooseColorActive);
    stage.classList.toggle('choose-color', state.chooseColorActive);

    if (!state.chooseColorActive) {
      state.pointer.dragging = false; // defensive: no stray pan state
      cancelTouchDrag();
      state.touch.active = false;
      hideTouchAimUI();
      loupeEl.hidden = true;
    } else if (state.pointer.dragging) {
      // Turning ON mid-drag: a single-pointer pan may already be underway
      // (it started before Choose Color was active, which was legitimate at
      // the time). Cancel it immediately — pan must not continue once
      // sampling mode is active — and remember which pointer this was so
      // its eventual pointerup (the tail end of what was really a drag
      // gesture, not a deliberate tap) doesn't also fire a sample.
      const cancelledId = state.pointer.pointerId;
      try { canvas.releasePointerCapture(cancelledId); } catch { /* not captured */ }
      state.pointer.dragging = false;
      state.pointer.pointerId = null;
      state.pointer.cancelledDragPointerId = cancelledId;
      canvas.classList.remove('grabbing');
    }

    if (state.chooseColorActive) {
      // On TOUCH input, DESIGN.md's "relative-drag crosshair" model applies
      // instead of the mouse's "cursor follows pointer absolutely" model —
      // detected once per activation via the device's touch capability
      // (navigator.maxTouchPoints), not per-event, since the dead-center
      // crosshair must render immediately on activation, before any pointer
      // event on the canvas has occurred.
      state.touch.active = deviceIsTouchCapable();
      if (state.touch.active) {
        enterTouchAimMode();
      } else {
        // Give the loupe a sensible default position (centered over the
        // canvas) BEFORE unhiding it. Otherwise, with no pointermove/
        // pointerenter having happened yet, #loupe's position:fixed left/top
        // are still unset — the browser falls back to its static position in
        // the DOM flow, which renders as a stray opaque circle over the
        // header/toolbar until the mouse first enters the canvas.
        // updateLoupe() (below) takes over the instant a real pointer event
        // on the canvas fires, so this is purely a one-time default.
        positionLoupeDefault();
        loupeEl.hidden = false; // existing mouse behavior: loupe follows the cursor
      }
    }
  });

  function setupLoupeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    loupeCanvas.width = Math.round(LOUPE_SIZE * dpr);
    loupeCanvas.height = Math.round(LOUPE_SIZE * dpr);
    loupeCanvas.style.width = `${LOUPE_SIZE}px`;
    loupeCanvas.style.height = `${LOUPE_SIZE}px`;
    loupeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawLoupe(px, py) {
    loupeCtx.imageSmoothingEnabled = false; // crisp pixelated zoom, mandatory
    loupeCtx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    if (!state.sourceCanvas) return;

    const cell = LOUPE_SIZE / LOUPE_PIXELS;
    const half = Math.floor(LOUPE_PIXELS / 2);
    const sx = px - half, sy = py - half;

    loupeCtx.drawImage(
      state.sourceCanvas,
      sx, sy, LOUPE_PIXELS, LOUPE_PIXELS,
      0, 0, LOUPE_SIZE, LOUPE_SIZE,
    );

    // Crosshair lines through the center.
    loupeCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.moveTo(LOUPE_SIZE / 2, 0);
    loupeCtx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE);
    loupeCtx.moveTo(0, LOUPE_SIZE / 2);
    loupeCtx.lineTo(LOUPE_SIZE, LOUPE_SIZE / 2);
    loupeCtx.stroke();

    // Outline the exact center cell (the pixel that will be sampled).
    loupeCtx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeRect(half * cell + 1, half * cell + 1, cell - 2, cell - 2);
  }

  // One-time default position for the mouse-mode loupe on activation, before
  // any real pointermove/pointerenter over the canvas has happened — see the
  // call site in the chooseColorBtn click handler above. Centers it over the
  // canvas (in viewport space, matching how updateLoupe positions it from
  // e.clientX/clientY) and, if an image is already loaded and that center
  // point lands on it, draws the loupe for that pixel too.
  function positionLoupeDefault() {
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    loupeEl.style.left = `${clientX}px`;
    loupeEl.style.top = `${clientY}px`;

    if (!state.sourceCanvas) return;
    const x = rect.width / 2, y = rect.height / 2;
    const imgX = (x - state.transform.offsetX) / state.transform.scale;
    const imgY = (y - state.transform.offsetY) / state.transform.scale;
    const px = Math.floor(imgX), py = Math.floor(imgY);
    const inBounds = px >= 0 && py >= 0 && px < state.sourceCanvas.width && py < state.sourceCanvas.height;
    if (inBounds) drawLoupe(px, py);
  }

  function updateLoupe(e) {
    loupeEl.style.left = `${e.clientX}px`;
    loupeEl.style.top = `${e.clientY}px`;

    if (!state.sourceCanvas) { loupeEl.hidden = true; return; }

    const x = cssX(e), y = cssY(e);
    const imgX = (x - state.transform.offsetX) / state.transform.scale;
    const imgY = (y - state.transform.offsetY) / state.transform.scale;
    const px = Math.floor(imgX), py = Math.floor(imgY);

    const inBounds = px >= 0 && py >= 0 && px < state.sourceCanvas.width && py < state.sourceCanvas.height;
    loupeEl.hidden = !inBounds;
    if (inBounds) drawLoupe(px, py);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!state.chooseColorActive || state.touch.active) return; // touch-aim UI is driven by the drag handlers below
    updateLoupe(e);
  });
  canvas.addEventListener('pointerenter', (e) => {
    if (state.chooseColorActive && !state.touch.active) updateLoupe(e);
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.chooseColorActive && !state.touch.active) loupeEl.hidden = true;
  });

  // -------------------------------------------------------------------
  // Touch / mobile: relative-drag crosshair (DESIGN.md "Touch / mobile").
  //
  // On touch input, "sample where your finger is" fails — the finger covers
  // the target pixel. So instead: a rendered crosshair sits dead-center of
  // the canvas when Choose Color is enabled; a single-finger drag moves the
  // crosshair by the drag DELTA (not to the finger's absolute position),
  // clamped to the canvas; and a TAP (drag ending below TAP_THRESHOLD_PX of
  // total movement) samples the pixel currently under the crosshair — a
  // real drag only repositions it. The crosshair persists between samples.
  // Two-finger pinch still zooms (handled entirely by the existing pinch
  // code above); single-finger drag never pans in this mode.
  // -------------------------------------------------------------------
  const TAP_THRESHOLD_PX = 6;
  const TOUCH_TOAST_SEEN_KEY = 'colorPickerTouchHintSeen';

  function deviceIsTouchCapable() {
    return (navigator.maxTouchPoints || 0) > 0;
  }

  function isTouchAimEvent(e) {
    return state.chooseColorActive && state.touch.active && e.pointerType === 'touch';
  }

  function enterTouchAimMode() {
    const rect = canvas.getBoundingClientRect();
    state.touch.cx = rect.width / 2;
    state.touch.cy = rect.height / 2;
    state.touch.dragging = false;
    state.touch.pointerId = null;
    state.touch.moved = 0;
    touchCrosshairEl.classList.remove('pulse');
    touchCrosshairEl.hidden = false;
    touchHintEl.hidden = false;
    loupeEl.hidden = false;
    renderTouchAimUI();
    maybeShowFirstTimeToast();
  }

  function hideTouchAimUI() {
    touchCrosshairEl.hidden = true;
    touchCrosshairEl.classList.remove('pulse');
    touchHintEl.hidden = true;
    touchToastEl.hidden = true;
  }

  // Positions the rendered crosshair + loupe at the current crosshair
  // position and redraws the loupe for the pixel under it. Called after
  // every crosshair move (drag) and on activation/resize.
  function renderTouchAimUI() {
    touchCrosshairEl.style.left = `${state.touch.cx}px`;
    touchCrosshairEl.style.top = `${state.touch.cy}px`;

    // Loupe is positioned OFFSET from the crosshair (via the same
    // translate(-50%, calc(-100% - 22px)) CSS used for the mouse path), not
    // from the finger — so it stays visible above the crosshair regardless
    // of where the finger currently is on screen.
    const rect = canvas.getBoundingClientRect();
    loupeEl.style.left = `${rect.left + state.touch.cx}px`;
    loupeEl.style.top = `${rect.top + state.touch.cy}px`;

    if (!state.sourceCanvas) { loupeEl.hidden = true; return; }
    const imgX = (state.touch.cx - state.transform.offsetX) / state.transform.scale;
    const imgY = (state.touch.cy - state.transform.offsetY) / state.transform.scale;
    const px = Math.floor(imgX), py = Math.floor(imgY);
    const inBounds = px >= 0 && py >= 0 && px < state.sourceCanvas.width && py < state.sourceCanvas.height;
    loupeEl.hidden = !inBounds;
    if (inBounds) drawLoupe(px, py);
  }

  function startTouchDrag(e) {
    state.touch.dragging = true;
    state.touch.pointerId = e.pointerId;
    state.touch.lastX = cssX(e);
    state.touch.lastY = cssY(e);
    state.touch.moved = 0;
    touchCrosshairEl.classList.remove('pulse');
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  }

  function updateTouchDrag(e) {
    const x = cssX(e), y = cssY(e);
    const dx = x - state.touch.lastX;
    const dy = y - state.touch.lastY;
    state.touch.lastX = x;
    state.touch.lastY = y;
    state.touch.moved += Math.hypot(dx, dy);
    const rect = canvas.getBoundingClientRect();
    state.touch.cx = clamp(state.touch.cx + dx, 0, rect.width);
    state.touch.cy = clamp(state.touch.cy + dy, 0, rect.height);
    renderTouchAimUI();
  }

  function endTouchDrag() {
    const wasTap = state.touch.moved < TAP_THRESHOLD_PX;
    try { canvas.releasePointerCapture(state.touch.pointerId); } catch { /* not captured */ }
    state.touch.dragging = false;
    state.touch.pointerId = null;
    state.touch.moved = 0;
    if (wasTap) {
      const rgba = sampleAtClient(state.touch.cx, state.touch.cy);
      if (rgba) addColor(rgba);
    } else {
      triggerCrosshairPulse(); // drag ended -> cue that it's ready to tap-to-sample
    }
  }

  function cancelTouchDrag() {
    if (state.touch.pointerId != null) {
      try { canvas.releasePointerCapture(state.touch.pointerId); } catch { /* not captured */ }
    }
    state.touch.dragging = false;
    state.touch.pointerId = null;
    state.touch.moved = 0;
  }

  function triggerCrosshairPulse() {
    // CSS handles prefers-reduced-motion (the .pulse animation is disabled
    // there); toggling the class unconditionally is harmless either way and
    // keeps this one code path for both cases.
    touchCrosshairEl.classList.remove('pulse');
    void touchCrosshairEl.offsetWidth; // reflow, so re-adding the class restarts the animation
    touchCrosshairEl.classList.add('pulse');
  }

  function maybeShowFirstTimeToast() {
    let seen = false;
    try { seen = localStorage.getItem(TOUCH_TOAST_SEEN_KEY) === '1'; } catch { /* storage unavailable */ }
    if (!seen) touchToastEl.hidden = false;
  }

  touchToastDismissBtn.addEventListener('click', () => {
    touchToastEl.hidden = true;
    try { localStorage.setItem(TOUCH_TOAST_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
  });

<<ct:inline logic.mjs>>
  // =====================================================================
  // 10. Color list / rows
  // =====================================================================
  function addColor({ r, g, b, a }) {
    const color = { id: nextId++, r, g, b, a };
    state.colors.unshift(color); // newest first
    renderColorList();
    saveState();
    return color;
  }

  function removeColorById(id) {
    state.colors = state.colors.filter((c) => c.id !== id);
    renderColorList();
    saveState();
  }

  function removeAllColors() {
    state.colors = [];
    renderColorList();
    saveState();
  }

  function updateRemoveAllDisabled() {
    removeAllBtn.disabled = state.colors.length === 0;
  }

  // -------------------------------------------------------------------
  // Derived outputs (RGBA-per-line, HEX-per-line). `state.colors` (newest
  // first, per addColor's unshift) is the single source of truth; these two
  // textareas are pure derivations of it and are rebuilt on every change to
  // the list. There is no path from the textareas back into state.colors.
  // -------------------------------------------------------------------
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

  function renderColorList() {
    colorListEl.innerHTML = '';
    for (const color of state.colors) {
      colorListEl.appendChild(buildRow(color));
    }
    updateRemoveAllDisabled();
    renderOutputs();
  }

  // In-field copy affordance (docs/conventions.md "Standard control height &
  // in-field copy — controls.css"): the copy button lives INSIDE the value
  // field via the shared `.ct-field` / `.ct-copy-btn` pattern. These are
  // read-only OUTPUT fields (the sampled color's rgba()/hex value), so the
  // copy button is ALWAYS shown (only editable inputs reveal it on non-empty).
  function buildField(value, inputTestId, copyTestId, copyLabel, fieldLabel) {
    const wrap = document.createElement('div');
    wrap.className = 'ct-field';

    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = value;
    input.dataset.testid = inputTestId;
    input.setAttribute('aria-label', fieldLabel);
    wrap.appendChild(input);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ct-copy-btn';
    copyBtn.dataset.testid = copyTestId;
    copyBtn.setAttribute('aria-label', copyLabel);
    copyBtn.title = copyLabel; // icon-only button: hover tooltip alongside aria-label
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => handleCopyClick(copyBtn, input.value));
    wrap.appendChild(copyBtn);

    return wrap;
  }

  function buildRow(color) {
    const li = document.createElement('li');
    li.className = 'color-row';
    li.dataset.testid = 'color-row';
    li.dataset.id = String(color.id);

    const swatch = document.createElement('span');
    swatch.className = color.a < 1 ? 'swatch alpha' : 'swatch';
    swatch.dataset.testid = 'color-swatch';
    swatch.style.setProperty('--swatch-color', rgbaString(color));
    li.appendChild(swatch);

    li.appendChild(buildField(rgbaString(color), 'color-rgba-input', 'color-rgba-copy', 'Copy rgba value', 'RGBA color value'));
    li.appendChild(buildField(hexString(color), 'color-hex-input', 'color-hex-copy', 'Copy hex value', 'Hex color value'));

    const trashBtn = document.createElement('button');
    trashBtn.type = 'button';
    trashBtn.className = 'trash-btn';
    trashBtn.dataset.testid = 'color-trash';
    trashBtn.setAttribute('aria-label', 'Remove color');
    trashBtn.title = 'Remove color'; // icon-only button: hover tooltip alongside aria-label
    trashBtn.textContent = '🗑';
    trashBtn.addEventListener('click', async () => {
      if (await ctConfirm('Remove this color?')) removeColorById(color.id);
    });
    li.appendChild(trashBtn);

    return li;
  }

  // Shared ctCopy/ctFlash (tools/include/copy.js, pasted above as a classic
  // <script>).
  async function handleCopyClick(btn, text) {
    if (!text) return; // nothing to copy (defensive; Copy-all is disabled when empty)
    const ok = await ctCopy(text);
    if (!ok) return;
    const current = btn.dataset.ctcFlashOriginal ?? btn.textContent;
    ctFlash(btn, { label: current === 'Copy all' ? 'Copied!' : '✅' });
  }

  // =====================================================================
  // 11. Destructive-action confirms
  // =====================================================================
  // Per docs/conventions.md "Destructive actions require confirmation", both
  // the per-row trash button (above, in buildRow) and Remove all use the
  // shared ctConfirm(message) component (tools/include/confirm.js, pasted
  // above as a classic <script>) rather than a bespoke modal —
  // removeColorById(id)/removeAllColors() remain direct, non-modal calls
  // (used here only after ctConfirm resolves true, and by tests).
  removeAllBtn.addEventListener('click', async () => {
    if (state.colors.length === 0) return;
    if (await ctConfirm('Remove all colors?')) removeAllColors();
  });

  rgbaCopyAllBtn.addEventListener('click', () => handleCopyClick(rgbaCopyAllBtn, rgbaOutputEl.value));
  hexCopyAllBtn.addEventListener('click', () => handleCopyClick(hexCopyAllBtn, hexOutputEl.value));

  // =====================================================================
  // 11a. Help modal — docs/conventions.md "First-load help popup (all
  // tools)". Purely informational (what the tool does + how to use it), so
  // it's its own small dedicated dialog rather than ctConfirm (which is a
  // yes/no destructive-action confirm). Markup is static in the document
  // (shown/hidden via [hidden]) rather than built/torn down per open/close.
  // Structure/focus-handling mirrors tools/hat-picker's and
  // tools/color-designer's Help modal.
  // =====================================================================

  // Whether the visitor has already dismissed the Help modal at least once.
  // If localStorage throws/is unavailable, treat it as already-seen so we
  // don't nag on every load — the least-annoying safe fallback (the ?
  // button is always there if they want the modal later).
  function hasSeenHelp() {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch {
      return true;
    }
  }

  function markHelpSeen() {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      // Best-effort, same as saveState().
    }
  }

  let helpPreviouslyFocused = null;

  function getHelpFocusable() {
    return Array.from(
      helpDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }

  function onHelpKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getHelpFocusable();
    if (focusable.length === 0) return;
    e.preventDefault();
    const idx = focusable.indexOf(document.activeElement);
    let next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0) next = focusable.length - 1;
    if (next >= focusable.length) next = 0;
    focusable[next].focus();
  }

  function openHelp() {
    helpPreviouslyFocused = document.activeElement;
    helpOverlayEl.hidden = false;
    document.addEventListener('keydown', onHelpKeydown, true);
    helpDialogEl.scrollTop = 0;
    helpCloseXBtnEl.focus({ preventScroll: true });
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    document.removeEventListener('keydown', onHelpKeydown, true);
    if (helpPreviouslyFocused && typeof helpPreviouslyFocused.focus === 'function') {
      try { helpPreviouslyFocused.focus(); } catch { /* ignore */ }
    }
    helpPreviouslyFocused = null;
  }

  helpButtonEl.addEventListener('click', () => openHelp());
  helpCloseXBtnEl.addEventListener('click', () => closeHelp());
  // e.preventDefault() on the overlay mousedown keeps Chromium from moving
  // focus to the overlay itself before the click fires, which would
  // otherwise steal focus-return away from helpPreviouslyFocused on close.
  helpOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === helpOverlayEl) {
      e.preventDefault();
      closeHelp();
    }
  });

  // =====================================================================
  // 12. Test hook
  // =====================================================================
  // Inert namespace for Playwright-driven tests: exposes the pure
  // formatters, a deterministic image-load path, image-space sampling,
  // programmatic row-add, and a live (non-cloned) state reference.
  window.__colorPicker = {
    rgbaString,
    hexString,
    loadImageFromDataURL(dataUrl) {
      return loadImageFromSource(dataUrl);
    },
    sampleAt(px, py) {
      return sampleImagePixel(px, py);
    },
    addColor,
    state,
    rgbaOutput,
    hexOutput,

    // Direct, non-modal removal — used by tests that don't need to drive the
    // shared ctConfirm dialog (see section 11), same pattern as
    // tools/hat-picker's window.__hatPicker.removeEntry/clear.
    removeColorById,
    removeAllColors,

    // Touch relative-drag crosshair (DESIGN.md "Touch / mobile"): read-only
    // helpers for deterministic assertions. `state.touch` (already exposed
    // live via `state` above) carries the crosshair's current position
    // (`cx`/`cy`) and drag/active flags; these two are just convenience
    // reads, not alternate input paths — tests still drive the crosshair
    // itself via real pointer/touch events, never these hooks.
    sampleAtCrosshair() {
      return sampleAtClient(state.touch.cx, state.touch.cy);
    },
    isTouchCrosshairActive() {
      return state.chooseColorActive && state.touch.active;
    },
  };

  // =====================================================================
  // 13. Init
  // =====================================================================
  setupLoupeCanvas();
  resizeCanvasForDPR();

  // Restore the persisted color list (no image restore — see "2a.
  // Persistence" above). Works with zero stored state (fresh/unreadable):
  // state.colors simply stays empty, same as before persistence existed.
  const restored = loadState();
  state.colors = restored.colors;
  if (state.colors.length > 0) {
    nextId = state.colors.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  }
  renderColorList(); // renders rows + re-derives rgba/hex outputs + Remove-all disabled state

  updateZoomIndicator();

  // Auto-show the Help modal once, on a genuinely fresh visit only. Marking
  // it seen right away (rather than on close) keeps this a true "once" —
  // even if the visitor navigates away without explicitly closing it, it
  // won't auto-show again next time.
  if (!hasSeenHelp()) {
    markHelpSeen();
    openHelp();
  }

  let resizeScheduled = false;
  const stageResizeObserver = new ResizeObserver(() => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      resizeCanvasForDPR();
    });
  });
  stageResizeObserver.observe(stage);
