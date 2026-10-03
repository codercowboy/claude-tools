// files.mjs — e2e helpers for downloads, uploads and canvas pixel checks.
// Dependency-free (node:fs only; never imports @playwright/test). Helpers take
// `page` / `download` and THROW on failure, so they work under any runner.
import fs from 'node:fs';

// --- Magic bytes ------------------------------------------------------------
export const MAGIC = {
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  JPEG: [0xff, 0xd8, 0xff],
  GIF: [0x47, 0x49, 0x46, 0x38], // "GIF8" (87a / 89a)
  PDF: [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  ZIP: [0x50, 0x4b, 0x03, 0x04],
  RIFF: [0x52, 0x49, 0x46, 0x46],
};
export const PNG_SIGNATURE = MAGIC.PNG;

/** Detect a container type from leading bytes: 'png'|'jpeg'|'gif'|'pdf'|'zip'|'webp'|null. */
export function sniffType(bytes) {
  const starts = (sig, off = 0) => sig.every((b, i) => bytes[off + i] === b);
  if (starts(MAGIC.PNG)) return 'png';
  if (starts(MAGIC.JPEG)) return 'jpeg';
  if (starts(MAGIC.GIF)) return 'gif';
  if (starts(MAGIC.PDF)) return 'pdf';
  if (starts(MAGIC.ZIP)) return 'zip';
  if (starts(MAGIC.RIFF) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

/** Throw unless `bytes` looks like `type` ('png'|'jpeg'|'webp'|'pdf'|'gif'|'zip'). */
export function expectMagic(bytes, type) {
  const got = sniffType(bytes);
  if (got !== type) {
    const head = Array.from(bytes.subarray(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error(`expected ${type} magic bytes, got ${got || 'unknown'} (head: ${head})`);
  }
}

// --- Downloads --------------------------------------------------------------
/** Run `triggerFn()` (usually a click) and resolve with the resulting Playwright Download. */
export async function captureDownload(page, triggerFn, { timeout } = {}) {
  const [download] = await Promise.all([
    page.waitForEvent('download', timeout === undefined ? undefined : { timeout }),
    triggerFn(),
  ]);
  return download;
}

/** Read a Download's bytes into a Buffer (via its temp path; no permanent file left). */
export async function readDownloadBytes(download) {
  const p = await download.path();
  if (!p) throw new Error('download has no path (failed: ' + (await download.failure()) + ')');
  return fs.promises.readFile(p);
}

/** captureDownload + readDownloadBytes -> { download, filename, bytes }. */
export async function downloadBytes(page, triggerFn, opts) {
  const download = await captureDownload(page, triggerFn, opts);
  return { download, filename: download.suggestedFilename(), bytes: await readDownloadBytes(download) };
}

// --- Uploads ----------------------------------------------------------------
/**
 * Feed a real <input type=file>. `input` = testid string or locator. `files` is
 * a synthetic in-memory file `{ name, mimeType, buffer }`, an ARRAY of those
 * (multi-file inputs), or a filesystem path string / array of paths.
 */
export async function uploadFile(page, input, files) {
  const loc = typeof input === 'string' ? page.getByTestId(input) : input;
  await loc.setInputFiles(files);
}

// --- Canvas pixels ----------------------------------------------------------
/** In-page signature of a canvas: { w, h, sum, distinct } (hashed channel sum + sampled distinct-color count). */
export async function canvasSignature(page, selector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      sum = (sum + d[i] * 7 + d[i + 1] * 13 + d[i + 2] * 17 + 1) >>> 0;
      if (i % 400 === 0) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return { w: c.width, h: c.height, sum, distinct: seen.size };
  }, selector);
}

/** Pure: number of pixels whose RGBA differs between two equal-length flat arrays/typed arrays. */
export function countChangedPixels(a, b) {
  if (a.length !== b.length) throw new Error(`length mismatch ${a.length} vs ${b.length}`);
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  }
  return n;
}

/** In-page: flat RGBA array of a canvas (JSON-transferable) — feed two of these to countChangedPixels. */
export async function canvasPixels(page, selector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
  }, selector);
}
