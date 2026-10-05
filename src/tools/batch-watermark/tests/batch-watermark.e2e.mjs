// @playwright/test spec for tools/batch-watermark/index.html. Dev/test-only. Drops generated
// solid-color PNG fixtures, drives the real UI, unzips the DOWNLOADED zip in-test and decodes the
// output pixels to assert the watermark lands at the anchor and nowhere else.
import { test, expect } from '@playwright/test';
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHookShape, trackPageErrors } from '../../../lib/test-support/interaction.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { downloadBytes, expectMagic } from '../../../lib/test-support/files.mjs';
import { makePng, readStoreZip } from '../../../lib/test-support/binary.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('batch-watermark');
const T = (page, id) => page.getByTestId(id);
const BASE = [100, 120, 140, 255];
const png = (w, h, name, paint = BASE) => ({ name, mimeType: 'image/png', buffer: makePng(w, h, paint) });
const SIZES = [[300, 200, 'a.png'], [640, 480, 'b.png'], [200, 300, 'c.png']];

test.beforeEach(async ({ page }) => {
  const errs = trackPageErrors(page);
  page.on('console', (m) => { if (m.type() === 'error') errs.errors.push('console.error: ' + m.text()); });
  page.__errs = errs;
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
  await page.waitForFunction(() => !!window.__batchWatermark);
});
test.afterEach(async ({ page }) => { page.__errs.assertNone(); });

const addAll = async (page, files) => {
  await T(page, 'file-input').setInputFiles(files);
  await expect(T(page, 'apply-btn')).toBeEnabled();
};
const rows = (page) => T(page, 'item-row');
const set = (page, id, v) => T(page, id).fill(String(v));

// Decode image bytes in the page; count pixels that differ from `base` inside each region
// ([x0,y0,x1,y1) boxes) and return exact pixels at `points`.
async function analyze(page, bytes, type, regions = [], points = [], base = BASE) {
  return page.evaluate(async ({ arr, type, regions, points, base }) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const changed = regions.map(([x0, y0, x1, y1]) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - base[0]) + Math.abs(d[i + 1] - base[1]) + Math.abs(d[i + 2] - base[2]) > 6) n++;
      }
      return n;
    });
    return { w: bmp.width, h: bmp.height, changed, px: points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)) };
  }, { arr: Array.from(bytes), type, regions, points, base });
}
const zipOf = async (page, trigger = () => T(page, 'apply-btn').click()) => readStoreZip((await downloadBytes(page, trigger)).bytes);

test.describe('shell', () => {
  test('hook shape, License modal, Help a11y, no overflow at phone width', async ({ page }) => {
    await assertHookShape(page, '__batchWatermark', { state: 'object', layoutWatermark: 'function', uniqueName: 'function', items: 'function' });
    await assertLicenseModal(page);
    await assertModalA11y(page, { labelledBy: 'help-title' });
    await expectNoOverflow(page, { viewport: { width: 375, height: 800 } });
  });

  test('empty state: apply disabled, prompt shown, preview hidden, image list hidden', async ({ page }) => {
    await expect(T(page, 'apply-btn')).toBeDisabled();
    await expect(T(page, 'stats')).toHaveText('Add images to begin.');
    await expect(T(page, 'preview-canvas')).toBeHidden();
    await expect(T(page, 'item-list')).toBeHidden();
  });

  test('no overflow at phone width with images loaded', async ({ page }) => {
    await addAll(page, SIZES.map(([w, h, n]) => png(w, h, n)));
    await expectNoOverflow(page, { viewport: { width: 375, height: 800 } });
  });
});

test.describe('text watermark across a batch', () => {
  test('3 differently-sized images -> zip; watermark pixels at the bottom-right anchor, untouched elsewhere', async ({ page }) => {
    await addAll(page, SIZES.map(([w, h, n]) => png(w, h, n)));
    await expect(rows(page)).toHaveCount(3);
    await expect(T(page, 'apply-btn')).toContainText('.zip');
    await set(page, 'text-input', 'WM TEST');
    await set(page, 'opacity-input', 100);
    await set(page, 'scale-input', 40);
    const { filename, bytes } = await downloadBytes(page, () => T(page, 'apply-btn').click());
    expect(filename).toBe('watermarked.zip');
    expectMagic(bytes, 'zip');
    const entries = readStoreZip(bytes);
    expect(entries.map((e) => e.name)).toEqual(['a-watermarked.png', 'b-watermarked.png', 'c-watermarked.png']);
    for (let i = 0; i < 3; i++) {
      const [w, h] = SIZES[i];
      expectMagic(entries[i].data, 'png');
      const r = await analyze(page, entries[i].data, 'image/png', [[w >> 1, h >> 1, w, h], [0, 0, w >> 1, h], [0, 0, w, h >> 1]]);
      expect([r.w, r.h]).toEqual([w, h]);
      expect(r.changed[0]).toBeGreaterThan(20); // watermark pixels in the bottom-right quadrant
      expect(r.changed[1]).toBe(0); // left half untouched
      expect(r.changed[2]).toBe(0); // top half untouched
    }
  });

  test('relative params: the watermark covers the same FRACTION of each image regardless of size', async ({ page }) => {
    await addAll(page, [png(300, 300, 's.png'), png(900, 900, 'l.png')]);
    await set(page, 'text-input', 'WWWW');
    await set(page, 'opacity-input', 100);
    const entries = await zipOf(page);
    const frac = [];
    for (const [i, s] of [300, 900].entries()) {
      const r = await analyze(page, entries[i].data, 'image/png', [[0, 0, s, s]]);
      frac.push(r.changed[0] / (s * s));
    }
    expect(frac[0]).toBeGreaterThan(0.005);
    expect(frac[1] / frac[0]).toBeGreaterThan(0.6);
    expect(frac[1] / frac[0]).toBeLessThan(1.6);
  });

  test('anchor choice moves the watermark: top-left leaves the bottom-right clean', async ({ page }) => {
    await addAll(page, [png(300, 200, 'a.png'), png(300, 200, 'b.png')]);
    await T(page, 'anchor-tl').click();
    await set(page, 'opacity-input', 100);
    const entries = await zipOf(page);
    const r = await analyze(page, entries[0].data, 'image/png', [[0, 0, 150, 100], [150, 100, 300, 200]]);
    expect(r.changed[0]).toBeGreaterThan(20);
    expect(r.changed[1]).toBe(0);
  });

  test('tiling repeats the mark across the image (changes pixels in every quadrant)', async ({ page }) => {
    await addAll(page, [png(400, 300, 'a.png'), png(400, 300, 'b.png')]);
    await T(page, 'tile-toggle').check();
    await expect(T(page, 'gap-input')).toBeVisible();
    await set(page, 'opacity-input', 100);
    await set(page, 'rotation-input', 30);
    const entries = await zipOf(page);
    const r = await analyze(page, entries[0].data, 'image/png', [[0, 0, 200, 150], [200, 0, 400, 150], [0, 150, 200, 300], [200, 150, 400, 300]]);
    for (const n of r.changed) expect(n).toBeGreaterThan(20);
  });

  test('preview canvas equals the exported pixels (same composition path)', async ({ page }) => {
    await addAll(page, [png(300, 200, 'only.png', (x, y) => [x % 256, y % 256, 60, 255])]);
    await set(page, 'text-input', 'Preview == output');
    await set(page, 'rotation-input', 15);
    await expect(T(page, 'stats')).toContainText('Previewing only.png');
    await page.waitForTimeout(150);
    const prev = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="preview-canvas"]');
      return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
    });
    const { filename, bytes } = await downloadBytes(page, () => T(page, 'apply-btn').click());
    expect(filename).toBe('only-watermarked.png'); // a single image downloads directly
    const out = await page.evaluate(async (arr) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type: 'image/png' }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
      return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
    }, Array.from(bytes));
    expect(out.length).toBe(prev.length);
    let diff = 0;
    for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - prev[i]) > 2) diff++;
    expect(diff).toBe(0);
  });
});

test.describe('logo watermark', () => {
  test('image mode: logo drawn at the anchor with opacity; rest unchanged; needs a logo first', async ({ page }) => {
    await addAll(page, [png(400, 300, 'a.png'), png(400, 300, 'b.png')]);
    await T(page, 'mode-image').click();
    await expect(T(page, 'logo-input')).toBeVisible();
    await T(page, 'apply-btn').click();
    await expect(T(page, 'error-message')).toContainText('logo');
    await T(page, 'logo-input').setInputFiles(png(40, 40, 'logo.png', [255, 0, 0, 255]));
    await expect(T(page, 'logo-status')).toContainText('logo.png');
    await T(page, 'anchor-tl').click();
    await set(page, 'margin-input', 0);
    await set(page, 'scale-input', 20); // 20% of the 300px short side = 60px
    await set(page, 'opacity-input', 100);
    const full = await zipOf(page);
    const a = await analyze(page, full[0].data, 'image/png', [[0, 0, 60, 60], [60, 0, 400, 300], [0, 60, 60, 300]], [[30, 30], [200, 150], [59, 59], [61, 61]]);
    expect(a.px[0]).toEqual([255, 0, 0, 255]);
    expect(a.px[2]).toEqual([255, 0, 0, 255]);
    expect(a.px[3]).toEqual(BASE);
    expect(a.px[1]).toEqual(BASE);
    expect(a.changed[0]).toBe(3600);
    expect(a.changed[1]).toBe(0);
    expect(a.changed[2]).toBe(0);
    await set(page, 'opacity-input', 50);
    const half = await zipOf(page);
    const h = await analyze(page, half[0].data, 'image/png', [], [[30, 30]]);
    expect(h.px[0][0]).toBeGreaterThan(160); expect(h.px[0][0]).toBeLessThan(195); // ~ (255+100)/2
    expect(h.px[0][1]).toBeGreaterThan(50); expect(h.px[0][1]).toBeLessThan(70);   // ~ 120/2
  });
});

test.describe('format + export modes', () => {
  test('format switch: source keeps each format, JPEG/WebP forced, extensions and magic bytes', async ({ page }) => {
    await addAll(page, [png(120, 80, 'one.png'), png(120, 80, 'two.png')]);
    await set(page, 'opacity-input', 100);
    await expect(T(page, 'quality-input')).toBeHidden();
    await T(page, 'format-jpeg').click();
    await expect(T(page, 'quality-input')).toBeVisible();
    await expect(T(page, 'format-hint')).toContainText('JPEG has no transparency');
    const j = await zipOf(page);
    expect(j.map((e) => e.name)).toEqual(['one-watermarked.jpg', 'two-watermarked.jpg']);
    expectMagic(j[0].data, 'jpeg');
    const jr = await analyze(page, j[0].data, 'image/jpeg', [[60, 40, 120, 80]]);
    expect(jr.changed[0]).toBeGreaterThan(10);
    await T(page, 'format-webp').click();
    const w = await zipOf(page);
    expect(w.map((e) => e.name)).toEqual(['one-watermarked.webp', 'two-watermarked.webp']);
    expect(String.fromCharCode(...w[0].data.subarray(0, 4)) + String.fromCharCode(...w[0].data.subarray(8, 12))).toBe('RIFFWEBP');
    await T(page, 'format-source').click();
    const s = await zipOf(page);
    expect(s.map((e) => e.name)).toEqual(['one-watermarked.png', 'two-watermarked.png']);
  });

  test('JPEG forced on a transparent PNG flattens onto white (not black)', async ({ page }) => {
    await addAll(page, [png(100, 100, 't.png', [0, 0, 0, 0])]);
    await T(page, 'format-jpeg').click();
    const { bytes } = await downloadBytes(page, () => T(page, 'apply-btn').click());
    const r = await analyze(page, bytes, 'image/jpeg', [], [[2, 2]]);
    expect(r.px[0][0]).toBeGreaterThan(240);
  });

  test('duplicate source names get unique entry names inside the zip', async ({ page }) => {
    await addAll(page, [png(100, 80, 'same.png'), png(110, 90, 'same.png'), png(90, 90, 'Same.png')]);
    const e = await zipOf(page);
    expect(e.map((x) => x.name)).toEqual(['same-watermarked.png', 'same-watermarked-1.png', 'same-watermarked-2.png']);
  });

  test('"Download each" fires one download per image', async ({ page }) => {
    await addAll(page, [png(100, 80, 'a.png'), png(110, 90, 'b.png')]);
    await expect(T(page, 'each-btn')).toBeVisible();
    const names = [];
    page.on('download', (d) => names.push(d.suggestedFilename()));
    await T(page, 'each-btn').click();
    await expect.poll(() => names.length, { timeout: 15000 }).toBe(2);
    expect(names.sort()).toEqual(['a-watermarked.png', 'b-watermarked.png']);
  });
});

test.describe('guards', () => {
  test('a corrupt file gets an error row at drop; the rest of the batch still exports', async ({ page }) => {
    await T(page, 'file-input').setInputFiles([
      png(100, 80, 'good1.png'),
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('definitely not a png') },
      png(120, 90, 'good2.png'),
    ]);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('[data-testid="item-row"][data-status="error"]')).toHaveCount(1);
    await expect(T(page, 'error-message')).toContainText('skipped');
    const e = await zipOf(page);
    expect(e.map((x) => x.name)).toEqual(['good1-watermarked.png', 'good2-watermarked.png']);
  });

  test('image over 20000 px per side is skipped with a limit message; others export', async ({ page }) => {
    await T(page, 'file-input').setInputFiles([png(20001, 1, 'wide.png'), png(100, 80, 'ok.png'), png(100, 80, 'ok2.png')]);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first().getByTestId('item-detail')).toContainText('20000');
    const e = await zipOf(page);
    expect(e.map((x) => x.name)).toEqual(['ok-watermarked.png', 'ok2-watermarked.png']);
  });

  test('a file that fails at export time gets an error row and the batch CONTINUES', async ({ page }) => {
    await addAll(page, [png(100, 80, 'a.png'), png(100, 80, 'b.png'), png(100, 80, 'c.png')]);
    // Corrupt the middle item's file after it was accepted: its re-decode at export must fail.
    await page.evaluate(() => {
      const it = window.__batchWatermark.state.items[1];
      it.file = new File([new Uint8Array([1, 2, 3])], 'b.png', { type: 'image/png' });
    });
    const e = await zipOf(page);
    expect(e.map((x) => x.name)).toEqual(['a-watermarked.png', 'c-watermarked.png']);
    await expect(T(page, 'error-message')).toContainText('failed');
    await expect(page.locator('[data-testid="item-row"][data-status="error"]')).toHaveCount(1);
  });

  test('empty text blocks the export with a message', async ({ page }) => {
    await addAll(page, [png(100, 80, 'a.png')]);
    await set(page, 'text-input', '   ');
    await T(page, 'apply-btn').click();
    await expect(T(page, 'error-message')).toContainText('text');
  });

  test('removing and clearing images updates the list and disables export', async ({ page }) => {
    await addAll(page, [png(100, 80, 'a.png'), png(100, 80, 'b.png')]);
    await rows(page).first().getByTestId('item-remove').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(T(page, 'each-btn')).toBeHidden();
    await T(page, 'clear-btn').click();
    await expect(T(page, 'apply-btn')).toBeDisabled();
    await expect(T(page, 'preview-canvas')).toBeHidden();
  });

  test('settings persist across reload; images do not', async ({ page }) => {
    await addAll(page, [png(100, 80, 'a.png')]);
    await set(page, 'text-input', 'Persist me');
    await T(page, 'anchor-tl').click();
    await set(page, 'opacity-input', 33);
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => !!window.__batchWatermark);
    await expect(T(page, 'text-input')).toHaveValue('Persist me');
    await expect(T(page, 'opacity-input')).toHaveValue('33');
    await expect(T(page, 'anchor-tl')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'apply-btn')).toBeDisabled();
    await expect(rows(page)).toHaveCount(0);
  });
});
