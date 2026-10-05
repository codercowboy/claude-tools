// Tool-specific unit-test helpers for tools/ascii-art/tests/unit/*.test.mjs.
// Dev/test-only — never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific ImageData fixtures below.
import { loadLogic as loadSharedLogic } from '../../../../lib/test-support/unit.mjs';

// loadLogic() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadLogic() {
  return loadSharedLogic(import.meta.url);
}

// Build an ImageData-shaped grid from a flat list of pixels. `pixels` is an
// array of [r, g, b] or [r, g, b, a] (a defaults to 255), in row-major order,
// length must be width*height. Returns { width, height, data } — the exact
// shape logic.mjs consumes (and the shape a real canvas getImageData produces).
export function grid(width, height, pixels) {
  if (pixels.length !== width * height) {
    throw new Error(`grid(${width}x${height}) expects ${width * height} pixels, got ${pixels.length}`);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a = 255] = pixels[i];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

// A grid filled by a per-pixel callback fn(x, y) -> [r,g,b(,a)].
export function gridFrom(width, height, fn) {
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels.push(fn(x, y));
  }
  return grid(width, height, pixels);
}

export const BLACK = [0, 0, 0];
export const WHITE = [255, 255, 255];
export const RED = [255, 0, 0];
export const GREEN = [0, 255, 0];
export const BLUE = [0, 0, 255];

// The ESC byte (0x1b) that opens every ANSI escape sequence.
export const ESC = String.fromCharCode(27);
export const ANSI_RESET = ESC + "[0m";
