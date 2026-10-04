# CtCanvasCapture

Records a `<canvas>` to a video [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) using [`MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).

`src/lib/utils/image/CtCanvasCapture.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

The module drives a frame loop over a [canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) and captures the result as a video Blob. The two sizing helpers (`pickRecorderMime`, `defaultBitrate`) are pure and injectable, so they run and unit-test without a browser. `recordCanvas` is where all DOM and `MediaRecorder` access lives. It needs a real browser: a canvas with `captureStream`, and a global `MediaRecorder`. The caller supplies a `drive(tMs)` callback that advances and redraws the scene one frame at a time, so the module stays agnostic about what is being animated. The module uses string concatenation instead of template literals because a consumer may inline the body into a Web Worker source string where a stray backtick would terminate it.

## API

### `FALLBACK_MIME`

Constant string `'video/webm'`. Returned by `pickRecorderMime` when no candidate type is supported.

### `DEFAULT_MIME_PREFS`

Constant array of candidate MIME types, in preference order: `'video/webm;codecs=vp9'`, `'video/webm;codecs=vp8'`, `'video/webm'`, `'video/mp4'`. Used as the default preference list for `pickRecorderMime` and for the `mime` option of `recordCanvas`.

### `pickRecorderMime(isTypeSupported, prefs) → string`

Returns the first MIME in `prefs` for which `isTypeSupported(mime)` is truthy. The support predicate is injected so the function is testable without a browser. The call site passes `MediaRecorder.isTypeSupported.bind(MediaRecorder)`.

- `isTypeSupported` — function — predicate returning truthy for a supported type. If it is not a function, the function returns `FALLBACK_MIME` immediately.
- `prefs` — array of strings — candidate types in preference order. A non-array falls back to `DEFAULT_MIME_PREFS`.
- Returns the first supported type, or `FALLBACK_MIME` (`'video/webm'`) if none match.
- Does not throw. If the predicate throws for a candidate, that candidate is treated as unsupported and the loop continues.

```js
import { pickRecorderMime, DEFAULT_MIME_PREFS } from './CtCanvasCapture.mjs';

const mime = pickRecorderMime(
  MediaRecorder.isTypeSupported.bind(MediaRecorder),
  DEFAULT_MIME_PREFS
);
```

### `defaultBitrate(w, h, fps) → number`

Computes a video bitrate in bits per second from frame dimensions and rate. The formula is `w * h * fps * 0.1` (0.1 bits per pixel), clamped to `[500000, 20000000]` and rounded to an integer.

- `w` — number — frame width in pixels.
- `h` — number — frame height in pixels.
- `fps` — number — frames per second.
- Returns an integer bitrate, between 500 kbps and 20 Mbps.
- Invalid input (non-finite or a product `<= 0`) returns the 500 kbps floor (`500000`).
- Does not throw.

```js
import { defaultBitrate } from './CtCanvasCapture.mjs';

defaultBitrate(1280, 720, 30); // -> 20000000 (clamped to the 20 Mbps ceiling)
defaultBitrate(320, 240, 15);  // -> 500000 (clamped to the 500 kbps floor)
```

### `recordCanvas(canvas, options) → Promise<Blob>`

Captures `canvas` to a video Blob. It calls `canvas.captureStream(fps)`, builds a `MediaRecorder`, then runs a frame loop: for each frame `i` (0-based), it awaits `drive(i * 1000/fps)` to advance the scene, fires `onProgress`, and paces the loop to roughly real time. Once `durationMs` worth of frames have been driven the recorder stops and the promise resolves with the captured Blob.

- `canvas` — an `HTMLCanvasElement` (or any object with a `captureStream` method). Required.
- `options.fps` — number — frames per second. Default `30`. Any value that is not `> 0` falls back to `30`.
- `options.mime` — string — recorder MIME type. Default: `pickRecorderMime(MediaRecorder.isTypeSupported, DEFAULT_MIME_PREFS)`.
- `options.bitrate` — number — `videoBitsPerSecond`. Default: `defaultBitrate(canvas.width, canvas.height, fps)`. Any value not `> 0` falls back to that default.
- `options.durationMs` — number — total duration to record. Values not `> 0` become `0`, which still drives at least one frame (the frame count is `max(1, ceil(durationMs / frameMs))`).
- `options.drive` — function — `drive(tMs)` called once per frame with the frame's scene time (`min(i * frameMs, durationMs)`). May be sync or async; it is awaited. If omitted, the canvas is sampled as-is each frame.
- `options.onProgress` — function — `onProgress(fraction)` called after each frame with a value from `0` to `1` (`(i + 1) / total`).
- `options.signal` — an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). If it is already aborted, or aborts mid-recording, the recorder stops, the stream's tracks are released, and the promise rejects.
- Returns a `Promise<Blob>` whose type is the recorder's `mimeType` (or the requested `mime`).
- Rejects with:
  - An `Error` named `'AbortError'` if the signal aborts (or is already aborted).
  - An `Error` if `canvas.captureStream` is not available, or if `MediaRecorder` is undefined.
  - The construction error if `new MediaRecorder(...)` throws (tracks are released first).
  - A `MediaRecorder` error, or an error thrown inside the frame loop.

```js
import { recordCanvas } from './CtCanvasCapture.mjs';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const blob = await recordCanvas(canvas, {
  fps: 30,
  durationMs: 2000,
  drive(tMs) {
    // redraw the scene for time tMs
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect((tMs / 2000) * canvas.width, 0, 20, 20);
  },
  onProgress(f) { console.log(Math.round(f * 100) + '%'); },
});

// blob is a video/webm (or the negotiated type) Blob
```

### `class CtCanvasCapture`

An aggregator class. Each named export is also a static: `CtCanvasCapture.FALLBACK_MIME`, `.DEFAULT_MIME_PREFS`, `.pickRecorderMime`, `.defaultBitrate`, `.recordCanvas`. The statics reference the same bindings as the named exports, so there is one implementation either way. The class is not meant to be instantiated.

```js
import { CtCanvasCapture } from './CtCanvasCapture.mjs';

const blob = await CtCanvasCapture.recordCanvas(canvas, { durationMs: 1000 });
```

## Notes

- `recordCanvas` needs a browser. `canvas.captureStream` and `MediaRecorder` do not exist under plain Node, so the function rejects there. The pure helpers (`pickRecorderMime`, `defaultBitrate`) run anywhere.
- Output is [WebM](https://en.wikipedia.org/wiki/WebM) in practice. `'video/mp4'` is listed last in `DEFAULT_MIME_PREFS` and most browsers do not support MP4 recording via `MediaRecorder`, so the result is usually VP9/VP8 WebM.
- Pacing is real-time. Each frame waits out the remainder of its `frameMs` budget, so a 2000 ms recording takes about 2000 ms of wall-clock time. A `drive` callback slower than the frame budget stretches the recording accordingly.
- The abort error is a plain `Error` with `name` set to `'AbortError'`, not a `DOMException`. Check `err.name === 'AbortError'` to distinguish a cancel from a real failure.
- Captured frames depend on the browser sampling the canvas as it changes. The loop drives and paces frames, but the exact frame count in the resulting video is up to `MediaRecorder` and the compositor.
