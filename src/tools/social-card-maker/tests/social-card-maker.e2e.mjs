// @playwright/test spec for tools/social-card-maker/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does NOT
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside over file://, via data-testid hooks and the
// inert window.__socialCardMaker test namespace (DESIGN.md § Testability).
//
// Backgrounds/logos are generated in-page as data URLs and fed through the tool's
// loadBackgroundFromDataURL / loadLogoFromDataURL hooks — no file dialog, no
// fixture asset, fully deterministic.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { captureDownload, readDownloadBytes, expectMagic, canvasSignature as sharedCanvasSignature } from '../../../lib/test-support/files.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape } from '../../../lib/test-support/interaction.mjs';
import { setViewport, expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { readStored, settleStorage } from '../../../lib/test-support/storage.mjs';
import { stubClipboard, readClipboard } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);

const HELP_SEEN_KEY = helpSeenKey('social-card-maker');
const STORAGE_KEY = 'social-card-maker:v1';

// A tiny solid-color PNG data URL, drawn in-page, so image-mode tests are real.
async function makeDataUrl(page, { w = 32, h = 32, color = '#ff0000' } = {}) {
  return page.evaluate(({ w, h, color }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    cx.fillRect(0, 0, w, h);
    return c.toDataURL('image/png');
  }, { w, h, color });
}

async function loadBackground(page, opts) {
  const url = await makeDataUrl(page, opts);
  await page.evaluate((u) => window.__socialCardMaker.loadBackgroundFromDataURL(u), url);
  await expect
    .poll(() => page.evaluate(() => !!window.__socialCardMaker.getState().bgImg))
    .toBe(true);
}

async function loadLogo(page, opts) {
  const url = await makeDataUrl(page, opts);
  await page.evaluate((u) => window.__socialCardMaker.loadLogoFromDataURL(u), url);
  await expect
    .poll(() => page.evaluate(() => !!window.__socialCardMaker.getState().logoImg))
    .toBe(true);
}

// Preview canvas signature (dims + hashed sum + distinct-color count): proves the
// canvas isn't blank and that it changed.
const canvasSignature = (page) => sharedCanvasSignature(page, '[data-testid="preview-canvas"]');

test.beforeEach(async ({ page }) => {
  // Pre-seed the first-load Help flag so the auto-modal never blocks other tests
  // (its own genuine first-load is covered in a fresh context below).
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. Inert test hook surface.
// ---------------------------------------------------------------------------
test.describe('window.__socialCardMaker test hook', () => {
  test('exposes the documented pure functions + deterministic entry points', async ({ page }) => {
    await assertHookShape(page, '__socialCardMaker', [
      'FORMATS', 'mimeForFormat', 'formatSupportsQuality', 'clampQuality',
      'percentToQuality', 'qualityToPercent', 'resolveFontFamily', 'canvasFontString',
      'wrapText', 'PRESETS', 'presetByKey', 'clampSize', 'gradientLineCoords',
      'coverRect', 'scaleLogoBox', 'composeLayout', 'buildMetaSnippet', 'slugify',
      'outputFilename', 'formatBytes', 'render', 'loadBackgroundFromDataURL',
      'loadLogoFromDataURL', 'getState',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Content fields drive the canvas + the live meta snippet.
// ---------------------------------------------------------------------------
test.describe('content + meta snippet', () => {
  test('typing eyebrow/title/subtitle updates the canvas and the og:*/twitter:* meta', async ({ page }) => {
    await page.getByTestId('eyebrow-input').fill('ANNOUNCEMENT');
    await page.getByTestId('title-input').fill('Hello World');
    await page.getByTestId('subtitle-input').fill('A supporting line');

    const meta = page.getByTestId('meta-output');
    await expect(meta).toHaveValue(/og:title" content="Hello World"/);
    await expect(meta).toHaveValue(/twitter:title" content="Hello World"/);
    await expect(meta).toHaveValue(/og:description" content="A supporting line"/);
    // Description falls back to the eyebrow when the subtitle is empty.
    await page.getByTestId('subtitle-input').fill('');
    await expect(meta).toHaveValue(/og:description" content="ANNOUNCEMENT"/);
  });

  test('the Image URL field flows straight into og:image / twitter:image', async ({ page }) => {
    await page.getByTestId('meta-url-input').fill('https://example.com/card.png');
    const meta = page.getByTestId('meta-output');
    await expect(meta).toHaveValue(/og:image" content="https:\/\/example\.com\/card\.png"/);
    await expect(meta).toHaveValue(/twitter:image" content="https:\/\/example\.com\/card\.png"/);
  });

  test('the meta snippet reflects the current preset dimensions', async ({ page }) => {
    await page.getByTestId('size-select').selectOption('square');
    const meta = page.getByTestId('meta-output');
    await expect(meta).toHaveValue(/og:image:width" content="1200"/);
    await expect(meta).toHaveValue(/og:image:height" content="1200"/);
  });

  test('Copy meta tags copies the textarea contents (clipboard reflects current fields)', async ({ page }) => {
    await stubClipboard(page);
    await page.getByTestId('title-input').fill('Copy Me');
    await page.getByTestId('meta-copy-btn').click();
    const shown = await page.getByTestId('meta-output').inputValue();
    expect(shown).toContain('<meta property="og:title" content="Copy Me">');
    expect(await readClipboard(page)).toBe(shown);
  });
});

// ---------------------------------------------------------------------------
// 3. Background modes: solid / gradient / image + scrim.
// ---------------------------------------------------------------------------
test.describe('background modes', () => {
  test('switching the mode toggles the matching control group', async ({ page }) => {
    await page.getByTestId('bg-mode-select').selectOption('solid');
    await expect(page.getByTestId('bg-solid')).toBeVisible();
    await expect(page.getByTestId('bg-gradient')).toBeHidden();
    await expect(page.getByTestId('bg-image')).toBeHidden();

    await page.getByTestId('bg-mode-select').selectOption('gradient');
    await expect(page.getByTestId('bg-gradient')).toBeVisible();
    await expect(page.getByTestId('bg-solid')).toBeHidden();

    await page.getByTestId('bg-mode-select').selectOption('image');
    await expect(page.getByTestId('bg-image')).toBeVisible();
    await expect(page.getByTestId('bg-gradient')).toBeHidden();
  });

  test('solid, gradient and image backgrounds each render distinct non-blank pixels', async ({ page }) => {
    await page.getByTestId('bg-mode-select').selectOption('solid');
    const solid = await canvasSignature(page);
    expect(solid.distinct).toBeGreaterThan(0);

    await page.getByTestId('bg-mode-select').selectOption('gradient');
    const gradient = await canvasSignature(page);
    // A gradient has more distinct colors than a flat fill.
    expect(gradient.distinct).toBeGreaterThan(1);
    expect(gradient.sum).not.toBe(solid.sum);

    await page.getByTestId('bg-mode-select').selectOption('image');
    await loadBackground(page, { color: '#1188ff' });
    const image = await canvasSignature(page);
    expect(image.sum).not.toBe(gradient.sum);
  });

  test('the scrim opacity changes the image-mode pixels', async ({ page }) => {
    await page.getByTestId('bg-mode-select').selectOption('image');
    await loadBackground(page, { color: '#33cc55' });
    await expect(page.getByTestId('bg-remove-btn')).toBeVisible();

    await page.getByTestId('scrim-range').fill('0');
    await page.getByTestId('scrim-range').dispatchEvent('input');
    const noScrim = await canvasSignature(page);

    await page.getByTestId('scrim-range').fill('90');
    await page.getByTestId('scrim-range').dispatchEvent('input');
    await expect(page.getByTestId('scrim-value')).toHaveText('90');
    const heavyScrim = await canvasSignature(page);

    expect(heavyScrim.sum).not.toBe(noScrim.sum);
  });

  test('Remove background image clears the loaded background', async ({ page }) => {
    await page.getByTestId('bg-mode-select').selectOption('image');
    await loadBackground(page);
    await page.getByTestId('bg-remove-btn').click();
    await expect(page.getByTestId('bg-remove-btn')).toBeHidden();
    expect(await page.evaluate(() => window.__socialCardMaker.getState().bgImg)).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 4. Logo add / remove changes the composition.
// ---------------------------------------------------------------------------
test.describe('logo', () => {
  test('adding a logo changes the canvas and reveals the remove button', async ({ page }) => {
    const before = await canvasSignature(page);
    await loadLogo(page, { color: '#ffffff', w: 64, h: 32 });
    await expect(page.getByTestId('logo-remove-btn')).toBeVisible();
    const after = await canvasSignature(page);
    expect(after.sum).not.toBe(before.sum);

    await page.getByTestId('logo-remove-btn').click();
    await expect(page.getByTestId('logo-remove-btn')).toBeHidden();
    expect(await page.evaluate(() => window.__socialCardMaker.getState().logoImg)).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 5. Presets resize the canvas backing store; custom size applies.
// ---------------------------------------------------------------------------
test.describe('output size presets', () => {
  test('each preset sets the canvas to its declared dimensions', async ({ page }) => {
    const canvas = page.getByTestId('preview-canvas');
    await page.getByTestId('size-select').selectOption('og');
    await expect.poll(() => canvas.evaluate((c) => [c.width, c.height])).toEqual([1200, 630]);
    await page.getByTestId('size-select').selectOption('square');
    await expect.poll(() => canvas.evaluate((c) => [c.width, c.height])).toEqual([1200, 1200]);
    await page.getByTestId('size-select').selectOption('story');
    await expect.poll(() => canvas.evaluate((c) => [c.width, c.height])).toEqual([1080, 1920]);
    await expect(page.getByTestId('output-dims')).toHaveText('1080×1920');
  });

  test('custom size reveals the W×H inputs and applies them (clamped)', async ({ page }) => {
    await page.getByTestId('size-select').selectOption('custom');
    await expect(page.getByTestId('custom-size')).toBeVisible();
    await page.getByTestId('custom-w').fill('800');
    await page.getByTestId('custom-h').fill('800');
    const canvas = page.getByTestId('preview-canvas');
    await expect.poll(() => canvas.evaluate((c) => [c.width, c.height])).toEqual([800, 800]);
  });
});

// ---------------------------------------------------------------------------
// 6. Export PNG / JPEG / WebP → valid downloads at the preset dimensions.
// ---------------------------------------------------------------------------
test.describe('export', () => {
  test('PNG export downloads a valid PNG whose IHDR matches the preset dimensions', async ({ page }) => {
    await page.getByTestId('title-input').fill('My Launch');
    await page.getByTestId('size-select').selectOption('og');
    await page.getByTestId('format-select').selectOption('png');
    const downloadBtn = page.getByTestId('download-btn');
    await expect(downloadBtn).toBeEnabled();

    const download = await captureDownload(page, () => downloadBtn.click());
    expect(download.suggestedFilename()).toBe('my-launch.png');

    const bytes = await readDownloadBytes(download);
    expectMagic(bytes, 'png');
    // IHDR width/height are big-endian uint32 at offsets 16 and 20.
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });

  test('JPEG export downloads a .jpg with the JPEG magic bytes', async ({ page }) => {
    await page.getByTestId('title-input').fill('Photo Card');
    await page.getByTestId('format-select').selectOption('jpeg');
    // Quality slider appears only for lossy formats.
    await expect(page.getByTestId('quality-field')).toBeVisible();
    // The encode is debounced; wait for the re-encoded blob so the download can't hand back the stale PNG.
    await expect(page.getByTestId('output-type')).toHaveText('image/jpeg');
    const downloadBtn = page.getByTestId('download-btn');
    await expect(downloadBtn).toBeEnabled();

    const download = await captureDownload(page, () => downloadBtn.click());
    expect(download.suggestedFilename()).toBe('photo-card.jpg');
    const bytes = await readDownloadBytes(download);
    expectMagic(bytes, 'jpeg');
  });

  test('WebP export downloads a .webp RIFF/WEBP container', async ({ page }) => {
    await page.getByTestId('title-input').fill('Web Card');
    await page.getByTestId('format-select').selectOption('webp');
    await expect(page.getByTestId('quality-field')).toBeVisible();
    // The encode is debounced; wait for the re-encoded blob so the download can't hand back the stale PNG.
    await expect(page.getByTestId('output-type')).toHaveText('image/webp');
    const downloadBtn = page.getByTestId('download-btn');
    await expect(downloadBtn).toBeEnabled();

    const download = await captureDownload(page, () => downloadBtn.click());
    expect(download.suggestedFilename()).toBe('web-card.webp');
    const bytes = await readDownloadBytes(download);
    expectMagic(bytes, 'webp');
  });

  test('the quality slider is hidden for lossless PNG', async ({ page }) => {
    await page.getByTestId('format-select').selectOption('png');
    await expect(page.getByTestId('quality-field')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 7. Persistence — OPTIONS ONLY (never the uploaded image bytes).
// ---------------------------------------------------------------------------
test.describe('persistence (options only)', () => {
  test('changing options writes them to localStorage without any image data', async ({ page }) => {
    await page.getByTestId('title-input').fill('Persisted Title');
    await page.getByTestId('bg-mode-select').selectOption('image');
    await loadBackground(page);
    await page.getByTestId('scrim-range').fill('60');
    await page.getByTestId('scrim-range').dispatchEvent('input');

    const stored = await readStored(page, STORAGE_KEY);
    expect(stored).toMatchObject({ title: 'Persisted Title', bgMode: 'image', scrimOpacity: 60 });
    // No image bytes ever persisted.
    for (const banned of ['bgImg', 'bgImgUrl', 'logoImg', 'logoImgUrl', 'lastBlob']) {
      expect(stored).not.toHaveProperty(banned);
    }
    const raw = await readStored(page, STORAGE_KEY, { json: false });
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain('blob:');
  });

  test('stored options are restored on reload; a loaded image is not carried over', async ({ page }) => {
    await page.getByTestId('title-input').fill('Remembered');
    await page.getByTestId('bg-mode-select').selectOption('image');
    await loadBackground(page);
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.title === 'Remembered' && v.bgMode === 'image' });

    await page.reload();
    await expect(page.getByTestId('title-input')).toHaveValue('Remembered');
    await expect(page.getByTestId('bg-mode-select')).toHaveValue('image');
    // The image itself did not persist — remove button hidden, no bgImg.
    await expect(page.getByTestId('bg-remove-btn')).toBeHidden();
    expect(await page.evaluate(() => window.__socialCardMaker.getState().bgImg)).toBeFalsy();
  });

  test('Reset restores defaults after a confirm', async ({ page }) => {
    await page.getByTestId('title-input').fill('Temporary Title');
    await page.getByTestId('reset-btn').click();
    const yes = page.getByRole('button', { name: 'Yes' });
    await expect(yes).toBeVisible();
    await yes.click();
    await expect(page.getByTestId('title-input')).toHaveValue('Your headline goes here');
  });
});

// ---------------------------------------------------------------------------
// 8. Responsive: wide desktop + mobile 375px (no horizontal overflow).
// ---------------------------------------------------------------------------
test.describe('responsive layout', () => {
  async function noHOverflow(page) {
    await expectNoOverflow(page);
  }

  test('wide viewport (1400px) has no horizontal page overflow', async ({ page }) => {
    await setViewport(page, 'wide');
    await page.getByTestId('size-select').selectOption('story'); // tall preset
    await noHOverflow(page);
    // The tall canvas is height-capped so it doesn't force overflow.
    const capped = await page.getByTestId('preview-canvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return r.height <= window.innerHeight;
    });
    expect(capped).toBe(true);
  });

  test('mobile ~375px has no horizontal page overflow', async ({ page }) => {
    await setViewport(page, 'mobile');
    await page.getByTestId('size-select').selectOption('story');
    await noHOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// 9. First-load Help popup (fresh context) + close paths + focus trap.
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
// 10. License surface — shared footer "MIT License" link + modal (CtLicense.mjs).
//     social-card-maker bundles NO third-party libraries → the "100% vanilla" note.
// ---------------------------------------------------------------------------
test.describe('License modal (shared footer surface)', () => {
  test('footer link opens the modal with the MIT text, Permission grant and vanilla note', async ({ page }) => {
    await page.getByTestId('footer-license-link').click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText(/Permission is hereby granted/i);
    // No bundled deps → the "100% vanilla" note.
    await expect(modal).toContainText(/100% vanilla/i);
  });

  // Focus-into-dialog + Esc / ✕ / backdrop close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens with the ✕ focused and closes via Esc / ✕ / backdrop, returning focus to the trigger', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('clicking the [data-ct-license] trigger opens the modal', async ({ page }) => {
    await page.locator('[data-ct-license]').click();
    await expect(page.getByTestId('license-modal')).toBeVisible();
    await expect(page.getByTestId('license-modal')).toContainText('MIT License');
  });
});

// ---------------------------------------------------------------------------
// Alignment segmented groups (halign / valign). Previously ZERO e2e coverage
// (phase 22 verifier concern #2): if a group regressed (wrong value, no render,
// or setAlign clobbering state), nothing failed. Pin the value-dependent path:
// a click sets aria-pressed, routes the data-value into state, and single-selects.
// ---------------------------------------------------------------------------
test.describe('alignment segmented groups (halign / valign)', () => {
  for (const [group, key, val] of [
    ['halign', 'hAlign', 'right'],
    ['halign', 'hAlign', 'left'],
    ['valign', 'vAlign', 'top'],
    ['valign', 'vAlign', 'bottom'],
  ]) {
    test(`clicking ${group}-${val} selects it (aria-pressed), updates state.${key}, and single-selects`, async ({ page }) => {
      await page.getByTestId(`${group}-${val}`).click();
      await expect(page.getByTestId(`${group}-${val}`)).toHaveAttribute('aria-pressed', 'true');
      // value-dependent: can't pass if the data-value -> onChange routing broke.
      const got = await page.evaluate((k) => window.__socialCardMaker.getState()[k], key);
      expect(got).toBe(val);
      // single-select: exactly one button in the group is pressed.
      const pressed = await page.getByTestId(`${group}-group`).evaluate((g) =>
        [...g.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true').length);
      expect(pressed).toBe(1);
    });
  }
});
