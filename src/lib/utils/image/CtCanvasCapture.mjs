// ===== Begin CtCanvasCapture (ES module) =====
/*
 * CtCanvasCapture — record a <canvas> to a video Blob via MediaRecorder.
 * ---------------------------------------------------------------------------
 *   pickRecorderMime(isTypeSupported, prefs?) -> string   (PURE)
 *       First mime in `prefs` for which isTypeSupported(mime) is truthy. The
 *       predicate is injected (pass MediaRecorder.isTypeSupported.bind(MediaRecorder))
 *       so this is testable without a browser. If none match (or the predicate
 *       throws / is missing) returns FALLBACK_MIME ('video/webm').
 *   defaultBitrate(w, h, fps) -> bits/sec   (PURE)
 *       w * h * fps * 0.1 bits-per-pixel, clamped to [500 kbps, 20 Mbps] and
 *       rounded to an integer. Invalid input -> the 500 kbps floor.
 *   recordCanvas(canvas, { fps, mime, bitrate, drive, durationMs, onProgress, signal })
 *       -> Promise<Blob>
 *       canvas.captureStream(fps) -> MediaRecorder(mime, { videoBitsPerSecond }).
 *       `drive(tMs)` (sync or async) is called once per frame (tMs = i * 1000/fps,
 *       i = 0..) to advance/draw the scene; the stream is sampled as the canvas
 *       changes. Resolves with the Blob once durationMs of frames were driven.
 *       `onProgress(fraction 0..1)` fires after each frame. If `signal` aborts
 *       (or is already aborted) recording stops, tracks are released, and the
 *       promise REJECTS with an Error named 'AbortError'. Defaults: fps 30,
 *       mime = pickRecorderMime(MediaRecorder.isTypeSupported, DEFAULT_MIME_PREFS),
 *       bitrate = defaultBitrate(canvas.width, canvas.height, fps).
 *       All DOM / MediaRecorder access lives inside this function.
 *
 * Node-importable ES module; a consuming build inlines this body into index.html,
 * stripping the `export`. Private helpers are underscore-prefixed so flattening
 * can't collide with a consumer's local names. No template literals (a consumer
 * may inline this into a Worker source string).
 */

const FALLBACK_MIME = 'video/webm';
const DEFAULT_MIME_PREFS = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4'
];

function pickRecorderMime(isTypeSupported, prefs) {
  const list = Array.isArray(prefs) ? prefs : DEFAULT_MIME_PREFS;
  if (typeof isTypeSupported !== 'function') return FALLBACK_MIME;
  for (const m of list) {
    try {
      if (isTypeSupported(m)) return m;
    } catch (e) { /* treat as unsupported */ }
  }
  return FALLBACK_MIME;
}

function defaultBitrate(w, h, fps) {
  const px = Number(w) * Number(h) * Number(fps);
  if (!isFinite(px) || px <= 0) return 500000;
  return Math.round(Math.min(20000000, Math.max(500000, px * 0.1)));
}

function _abortError() {
  const e = new Error('Recording aborted');
  e.name = 'AbortError';
  return e;
}

function recordCanvas(canvas, options) {
  const o = options || {};
  const fps = o.fps > 0 ? o.fps : 30;
  const durationMs = o.durationMs > 0 ? o.durationMs : 0;
  const drive = typeof o.drive === 'function' ? o.drive : null;
  const onProgress = typeof o.onProgress === 'function' ? o.onProgress : null;
  const signal = o.signal || null;

  return new Promise(function (resolve, reject) {
    if (signal && signal.aborted) { reject(_abortError()); return; }
    if (!canvas || typeof canvas.captureStream !== 'function') {
      reject(new Error('recordCanvas: canvas.captureStream is not available'));
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('recordCanvas: MediaRecorder is not available'));
      return;
    }
    const mime = o.mime || pickRecorderMime(MediaRecorder.isTypeSupported.bind(MediaRecorder), DEFAULT_MIME_PREFS);
    const bitrate = o.bitrate > 0 ? o.bitrate : defaultBitrate(canvas.width, canvas.height, fps);
    const stream = canvas.captureStream(fps);
    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    } catch (err) {
      _releaseTracks(stream);
      reject(err);
      return;
    }
    let settled = false;
    let aborted = false;

    function onAbort() { aborted = true; if (rec.state !== 'inactive') rec.stop(); }
    if (signal) signal.addEventListener('abort', onAbort);
    function cleanup() {
      if (signal) signal.removeEventListener('abort', onAbort);
      _releaseTracks(stream);
    }

    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
    rec.onerror = function (ev) {
      if (settled) return;
      settled = true; cleanup();
      reject(ev && ev.error ? ev.error : new Error('MediaRecorder error'));
    };
    rec.onstop = function () {
      if (settled) return;
      settled = true; cleanup();
      if (aborted) reject(_abortError());
      else resolve(new Blob(chunks, { type: rec.mimeType || mime }));
    };

    const frameMs = 1000 / fps;
    const total = Math.max(1, Math.ceil(durationMs / frameMs));
    rec.start();

    (async function loop() {
      try {
        for (let i = 0; i < total && !aborted; i++) {
          const frameStart = Date.now();
          if (drive) await drive(Math.min(i * frameMs, durationMs));
          if (onProgress) onProgress((i + 1) / total);
          const wait = frameMs - (Date.now() - frameStart);
          if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
        }
        if (!aborted && rec.state !== 'inactive') rec.stop();
      } catch (err) {
        if (!settled) {
          settled = true; cleanup();
          if (rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* ignore */ } }
          reject(err);
        }
      }
    })();
  });
}

function _releaseTracks(stream) {
  try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
}

export { FALLBACK_MIME, DEFAULT_MIME_PREFS, pickRecorderMime, defaultBitrate, recordCanvas };

export class CtCanvasCapture {
  static FALLBACK_MIME = FALLBACK_MIME;
  static DEFAULT_MIME_PREFS = DEFAULT_MIME_PREFS;
  static pickRecorderMime = pickRecorderMime;
  static defaultBitrate = defaultBitrate;
  static recordCanvas = recordCanvas;
}
// ===== end CtCanvasCapture (ES module) =====
