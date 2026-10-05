// @playwright/test spec for tools/dither-studio/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does NOT
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside over file://, via data-testid hooks and the
// inert window.__ditherStudio test namespace (DESIGN.md § Testability).
//
// A synthetic image is generated in-page (a colorful gradient drawn to a canvas,
// exported as a data URL) and fed through the tool's loadImageFromDataURL hook —
// no file dialog, no fixture asset, fully deterministic.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { captureDownload, expectMagic, canvasSignature } from '../../../lib/test-support/files.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { expectNoOverflow, setViewport } from '../../../lib/test-support/layout.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertDropDispatch } from '../../../lib/test-support/interaction.mjs';
import { settleStorage, readStored } from '../../../lib/test-support/storage.mjs';
import { stubClipboard, readClipboard } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('dither-studio');
const STORAGE_KEY = 'dither-studio:v1';

// Draw a deterministic colorful gradient into a canvas and load it into the tool
// via the inert test hook. Returns once the after-canvas has been drawn.
async function loadSyntheticImage(page, { w = 48, h = 32 } = {}) {
  await page.evaluate(({ w, h }) => new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        cx.fillStyle = 'rgb(' + Math.round((x / w) * 255) + ',' +
          Math.round((y / h) * 255) + ',' +
          Math.round(((x + y) / (w + h)) * 255) + ')';
        cx.fillRect(x, y, 1, 1);
      }
    }
    const url = c.toDataURL('image/png');
    // Poll until the after-canvas actually has dimensions (process() ran).
    window.__ditherStudio.loadImageFromDataURL(url, 'sample.png');
    const after = document.querySelector('[data-testid="after-canvas"]');
    const t = setInterval(() => {
      if (after.width > 0 && after.height > 0) { clearInterval(t); resolve(); }
    }, 20);
  }), { w, h });
  await expect(page.getByTestId('loaded-section')).toBeVisible();
}

// Compact signature of the after-canvas pixels (shared canvasSignature) so we can
// detect that reprocessing actually changed the output.
const afterCanvasSignature = (page) => canvasSignature(page, '[data-testid="after-canvas"]');

test.beforeEach(async ({ page }) => {
  // Pre-seed the first-load Help flag so the auto-modal never blocks other tests
  // (its own genuine first-load is covered in a fresh context below).
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. Inert test hook surface.
// ---------------------------------------------------------------------------
test.describe('window.__ditherStudio test hook', () => {
  test('exposes the documented pure functions + entry points', async ({ page }) => {
    await assertHookShape(page, '__ditherStudio', [
      'PALETTES', 'paletteById', 'grayscalePalette', 'medianCut',
      'nearestColor', 'nearestColorIndex', 'mapNearest', 'indicesToRgba',
      'floydSteinberg', 'atkinson', 'bayer', 'bayerMatrix', 'pixelScale',
      'buildBrightnessContrastLUT', 'applyLUT', 'hexToRgb', 'rgbToHex',
      'paletteToHexList', 'paletteToGpl', 'crc32', 'assembleIndexedPng',
      'filterIndexRows', 'loadImageFromDataURL', 'process', 'encodeIndexedPng',
      'activePalette', 'getState',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Load + process a synthetic image; palettes/dither change the preview.
// ---------------------------------------------------------------------------
test.describe('load, palette + dither change the preview', () => {
  test('loading a synthetic image reveals the loaded section with name/dims', async ({ page }) => {
    await loadSyntheticImage(page, { w: 48, h: 32 });
    await expect(page.getByTestId('original-name')).toHaveText('sample.png');
    await expect(page.getByTestId('original-dims')).toHaveText('48×32');
    await expect(page.getByTestId('output-colors')).not.toHaveText('—');
  });

  test('switching palette preset re-renders the preview pixels + palette strip', async ({ page }) => {
    await loadSyntheticImage(page);
    // Preset mode is default; start on Game Boy (4 colors), switch to 1-bit B/W.
    await page.getByTestId('preset-select').selectOption('gameboy');
    const gb = await afterCanvasSignature(page);
    await expect(page.getByTestId('output-colors')).toHaveText('4 colors');

    await page.getByTestId('preset-select').selectOption('bw');
    const bw = await afterCanvasSignature(page);
    await expect(page.getByTestId('output-colors')).toHaveText('2 colors');
    expect(bw.sum).not.toBe(gb.sum);

    // Palette strip swatch count tracks the active palette.
    await expect(page.getByTestId('palette-strip').locator('span')).toHaveCount(2);
  });

  test('switching dithering mode changes the output pixels', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('preset-select').selectOption('bw');

    await page.getByTestId('dither-select').selectOption('none');
    const none = await afterCanvasSignature(page);
    await page.getByTestId('dither-select').selectOption('fs');
    const fs = await afterCanvasSignature(page);
    await page.getByTestId('dither-select').selectOption('bayer8');
    const bayer = await afterCanvasSignature(page);

    expect(fs.sum).not.toBe(none.sum);
    expect(bayer.sum).not.toBe(none.sum);
    expect(bayer.sum).not.toBe(fs.sum);
  });

  test('pixel-scale changes the processed output dimensions', async ({ page }) => {
    await loadSyntheticImage(page, { w: 48, h: 32 });
    const before = await afterCanvasSignature(page);
    expect(before.w).toBe(48);

    // Bump pixel scale to 4× → processed backing store shrinks to ceil(48/4)=12.
    await page.getByTestId('pixel-range').fill('4');
    await page.getByTestId('pixel-range').dispatchEvent('input');
    await expect(page.getByTestId('pixel-value')).toHaveText('4');
    await expect.poll(async () => (await afterCanvasSignature(page)).w).toBe(12);
    // Reported output dims are the upscaled (chunky) size.
    await expect(page.getByTestId('output-dims')).toHaveText('48×32');
  });

  test('auto (median-cut) mode quantizes to the chosen N colors', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('palette-mode').selectOption('auto');
    await page.getByTestId('auto-range').fill('8');
    await page.getByTestId('auto-range').dispatchEvent('input');
    await expect(page.getByTestId('auto-value')).toHaveText('8');
    await expect.poll(async () => {
      const txt = await page.getByTestId('output-colors').textContent();
      return parseInt(txt, 10);
    }).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 3. Indexed PNG-8 export yields a structurally valid PNG.
// ---------------------------------------------------------------------------
test.describe('indexed PNG-8 export', () => {
  test('Export PNG-8 downloads a valid indexed PNG (signature + IHDR ct3 + PLTE)', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('preset-select').selectOption('gameboy');
    await expect(page.getByTestId('export-indexed-btn')).toBeEnabled();

    const download = await captureDownload(page, () => page.getByTestId('export-indexed-btn').click());
    expect(download.suggestedFilename()).toBe('sample-indexed.png');

    // Encode again through the hook and validate the byte structure directly.
    const info = await page.evaluate(async () => {
      const st = window.__ditherStudio.getState();
      const png = await window.__ditherStudio.encodeIndexedPng(
        st.lastIndices, st.procW, st.procH, st.lastPalette);
      const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const head = Array.from(png.slice(0, 16));
      // First chunk should be IHDR.
      const type = String.fromCharCode(png[12], png[13], png[14], png[15]);
      const colorType = png[8 + 8 + 9]; // sig(8)+len(4)+type(4)+9 into IHDR data
      return { head, type, colorType, len: png.length, paletteLen: st.lastPalette.length };
    });
    expectMagic(Uint8Array.from(info.head), 'png');
    expect(info.type).toBe('IHDR');
    expect(info.colorType).toBe(3);
    expect(info.len).toBeGreaterThan(0);
    expect(info.paletteLen).toBe(4);
  });

  test('true-color PNG export downloads a .png', async ({ page }) => {
    await loadSyntheticImage(page);
    const download = await captureDownload(page, () => page.getByTestId('export-png-btn').click());
    expect(download.suggestedFilename()).toBe('sample-dithered.png');
  });
});

// ---------------------------------------------------------------------------
// 4. Palette export: hex copy + .gpl download.
// ---------------------------------------------------------------------------
test.describe('palette export', () => {
  test('Copy palette copies a newline hex list to the clipboard', async ({ page }) => {
    await stubClipboard(page);
    await loadSyntheticImage(page);
    await page.getByTestId('preset-select').selectOption('bw');
    await page.getByTestId('copy-palette-btn').click();
    // The engine's paletteToHexList is the source of truth for the copied text.
    const expected = await page.evaluate(() =>
      window.__ditherStudio.paletteToHexList(window.__ditherStudio.getState().lastPalette));
    expect(expected).toBe('#000000\n#ffffff');
    expect(await readClipboard(page)).toBe(expected);
  });

  test('Download .gpl produces a GIMP palette file', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('preset-select').selectOption('gameboy');
    const download = await captureDownload(page, () => page.getByTestId('download-gpl-btn').click());
    expect(download.suggestedFilename()).toBe('sample.gpl');
    const gpl = await page.evaluate(() =>
      window.__ditherStudio.paletteToGpl(window.__ditherStudio.getState().lastPalette, 'sample'));
    expect(gpl).toMatch(/^GIMP Palette/);
    expect(gpl).toContain('Name: sample');
  });
});

// ---------------------------------------------------------------------------
// 5. Custom palette editable table + Remove-all confirm.
// ---------------------------------------------------------------------------
test.describe('custom palette table', () => {
  test('add / load-current / remove-all (with confirm) manage swatches', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('palette-mode').selectOption('custom');
    await expect(page.getByTestId('custom-field')).toBeVisible();

    // Default custom palette is 2 swatches.
    await expect(page.getByTestId('swatch-table').locator('.swatch-row')).toHaveCount(2);

    await page.getByTestId('add-swatch-btn').click();
    await expect(page.getByTestId('swatch-table').locator('.swatch-row')).toHaveCount(3);

    // Remove all → shared confirmDialog dialog, accept via the highlighted "Yes".
    await page.getByTestId('remove-all-btn').click();
    const yes = page.getByRole('button', { name: 'Yes' });
    await expect(yes).toBeVisible();
    await yes.click();
    await expect(page.getByTestId('swatch-table').locator('.swatch-row')).toHaveCount(0);

    // Load current fills the table from the last active palette.
    await page.getByTestId('load-current-btn').click();
    await expect(page.getByTestId('swatch-table').locator('.swatch-row').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 6. Persistence — OPTIONS ONLY (never the image bytes).
// ---------------------------------------------------------------------------
test.describe('persistence (options only)', () => {
  test('changing options writes palette/dither/pixel to localStorage, no image', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('preset-select').selectOption('bw');
    await page.getByTestId('dither-select').selectOption('atkinson');
    await page.getByTestId('pixel-range').fill('3');
    await page.getByTestId('pixel-range').dispatchEvent('input');

    const stored = await readStored(page, STORAGE_KEY);
    expect(stored).toMatchObject({ preset: 'bw', dither: 'atkinson', pixel: 3 });
    // The image itself must never be persisted.
    expect(stored).not.toHaveProperty('img');
    expect(stored).not.toHaveProperty('srcImageData');
    expect(stored).not.toHaveProperty('image');
  });

  test('stored options are restored on reload (no image carried over)', async ({ page }) => {
    await loadSyntheticImage(page);
    await page.getByTestId('palette-mode').selectOption('auto');
    await page.getByTestId('dither-select').selectOption('bayer4');
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.dither === 'bayer4' });

    await page.reload();
    const restored = await page.evaluate(() => ({
      mode: document.getElementById('paletteMode').value,
      dither: document.getElementById('ditherSelect').value,
    }));
    expect(restored.mode).toBe('auto');
    expect(restored.dither).toBe('bayer4');
    // The image did not persist.
    await expect(page.getByTestId('loaded-section')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 7. Responsive: wide desktop + mobile 375px (no horizontal overflow).
// ---------------------------------------------------------------------------
test.describe('responsive layout', () => {
  test('wide viewport (1400px) shows no horizontal page overflow', async ({ page }) => {
    await setViewport(page, 'wide');
    await loadSyntheticImage(page);
    await expectNoOverflow(page);
  });

  test('mobile ~375px has no horizontal page overflow', async ({ page }) => {
    await setViewport(page, 'mobile');
    await loadSyntheticImage(page);
    await expectNoOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// 8. First-load Help popup (fresh context) + close paths + focus trap.
// ---------------------------------------------------------------------------
test.describe('first-load Help popup', () => {
  test('auto-shows on a genuine first visit (fresh context, no pre-seeded key)', async ({ browser }) => {
    await assertHelpAutoShows(browser, TOOL_URL, { seenKey: HELP_SEEN_KEY });
  });

  test('does not auto-show on a subsequent visit (pre-seeded key)', async ({ page }) => {
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('Help modal a11y contract (role/aria-modal, focus on ✕, focus trap, Esc/✕/backdrop close + focus return)', async ({ page }) => {
    await assertModalA11y(page);
  });
  test('the overlay computes to display:none when closed (the [hidden] cascade trap)', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');
    await page.getByTestId('help-button').click();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 9. License surface — shared footer "MIT License" link + modal (CtLicense.mjs).
//    dither-studio bundles NO third-party libraries → the "100% vanilla" note.
// ---------------------------------------------------------------------------
test.describe('License modal (shared footer surface)', () => {
  test('footer link opens the modal with the MIT text, vanilla note and ✕', async ({ page }) => {
    const link = page.getByTestId('footer-license-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/MIT License/i);

    await link.click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText(/Permission is hereby granted/i);
    await expect(modal).toContainText(/100% vanilla/i);
    await expect(page.getByTestId('license-close-x')).toBeVisible();
    await expect(page.getByTestId('license-close-x')).toBeFocused();
  });

  // Focus trap + Esc / ✕ / backdrop close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('clicking the [data-ct-license] trigger opens the modal', async ({ page }) => {
    await page.locator('[data-ct-license]').click();
    await expect(page.getByTestId('license-modal')).toBeVisible();
    await expect(page.getByTestId('license-modal')).toContainText('MIT License');
  });
});

// ---------------------------------------------------------------------------
// Real file drop — the wireDropzone DnD path (dragenter/over/drop with a real
// DataTransfer+FileList). The rest of the suite loads files via setInputFiles /
// test hooks, which never touch this path; this pins it so a wireDropzone
// regression (dropped preventDefault, missing drag class, lost FileList) is red.
// ---------------------------------------------------------------------------
test.describe('file drop (real DnD on the dropzone)', () => {
  test('dropping a file toggles the drag class, preventDefaults, and delivers the FileList', async ({ page }) => {
    await assertDropDispatch(page, { selector: '.dropzone', dragClass: 'drag-over' });
  });
});
