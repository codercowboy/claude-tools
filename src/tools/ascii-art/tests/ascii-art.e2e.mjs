// @playwright/test spec for tools/ascii-art/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec drives
// the finished page from the outside via data-testid hooks and the
// window.__asciiArt test API (DESIGN.md § Testability hooks). The offline
// `node --test` suite (tests/unit/) owns the exhaustive pure-logic coverage;
// this suite covers DOM, interaction, rendering, export, persistence, the
// modals, and responsive layout.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/ascii-art/)

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { captureDownload, uploadFile } from '../../../lib/test-support/files.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { expectNoOverflow, setViewport } from '../../../lib/test-support/layout.mjs';
import { makePng } from '../../../lib/test-support/binary.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertConfirmDialog, assertDropDispatch } from '../../../lib/test-support/interaction.mjs';
import { settleStorage, readStored } from '../../../lib/test-support/storage.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// Renders follow a debounced (~120ms) sample+encode. Give sliders headroom.
const RENDER_WAIT = 300;

// First-load Help popup (docs/conventions.md § "First-load help popup") auto-
// shows once, keyed off localStorage "ascii-art:help-seen:v1". Every test EXCEPT
// the dedicated first-load suite pre-seeds that key (via addInitScript, so it's
// set before the page's own script runs) so the auto-shown modal never
// interferes with unrelated assertions.
const HELP_SEEN_KEY = helpSeenKey('ascii-art');
const STORAGE_KEY = 'ascii-art:v1';


// A 32x32 colorful gradient (varied hue + brightness) so mono ramps, colored
// spans, half-block, and braille all produce interesting, non-uniform output.
const PNG_GRADIENT = makePng(32, 32, (x, y) => [
  Math.round((x / 31) * 255),
  Math.round((y / 31) * 255),
  Math.round(((31 - x) / 31) * 255),
  255,
]);

// Load a known image through the real <input type=file>, then wait for the
// async decode to surface the loaded section + first render.
async function loadFixture(page, buffer = PNG_GRADIENT, name = 'sample.png') {
  await uploadFile(page, 'file-input', { name, mimeType: 'image/png', buffer });
  await expect(page.getByTestId('loaded-section')).toBeVisible();
  await expect(page.getByTestId('preview-box')).not.toHaveClass(/is-empty/);
}

// Read the current plain-text art from the tool's own state (mode-independent).
async function currentText(page) {
  return page.evaluate(() => {
    const api = window.__asciiArt;
    const res = api.getState().lastResult;
    return res ? api.cellsToText(res.rows) : '';
  });
}

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. window.__asciiArt test hook (smoke — node --test owns exhaustive logic).
// ---------------------------------------------------------------------------
test.describe('window.__asciiArt test hook', () => {
  test('exposes the documented pure functions and entry points', async ({ page }) => {
    await assertHookShape(page, '__asciiArt', [
      'RAMPS', 'DEFAULTS', 'luminance', 'adjustLevel', 'normLevel', 'charForLevel',
      'clampRamp', 'packBraille', 'renderCells', 'toAscii', 'toBraille',
      'toAsciiCells', 'toHalfBlockCells', 'toBrailleCells', 'cellsToText',
      'cellsToHtml', 'htmlDocument', 'cellsToAnsi', 'rgbToAnsi256',
      'computeSampleSize', 'loadImageFromDataURL', 'render', 'getState',
    ]);
  });

  test('toAscii of a 2x1 black/white grid is "@ " (matches the unit contract)', async ({ page }) => {
    const out = await page.evaluate(() => {
      const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
      return window.__asciiArt.toAscii({ width: 2, height: 1, data });
    });
    expect(out).toBe('@ ');
  });
});

// ---------------------------------------------------------------------------
// 2. Loading an image via the file input -> preview + original readout.
// ---------------------------------------------------------------------------
test.describe('loading an image (file input)', () => {
  test('setInputFiles surfaces the preview, original name, dims and type', async ({ page }) => {
    await expect(page.getByTestId('loaded-section')).toBeHidden();
    await loadFixture(page);

    await expect(page.getByTestId('original-name')).toHaveText('sample.png');
    await expect(page.getByTestId('original-dims')).toHaveText('32×32');
    await expect(page.getByTestId('original-type')).toHaveText('image/png');
    // Output stats read "cols × lines chars (N total)".
    await expect(page.getByTestId('output-stats')).toHaveText(/\d+ × \d+ chars/);
    // The preview box actually holds rendered <pre> art.
    await expect(page.getByTestId('preview-box').locator('pre')).toBeVisible();
  });

  test('a non-image file is rejected with an inline error', async ({ page }) => {
    await uploadFile(page, 'file-input', {
      name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    });
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('loaded-section')).toBeHidden();
  });

  test('the file ✕ removes the image without a confirm (options untouched)', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('remove-file-btn').click();
    await expect(page.getByTestId('loaded-section')).toBeHidden();
    await assertConfirmDialog(page, { action: 'none' });
    // Exports disable again once the image is gone.
    await expect(page.getByTestId('download-txt-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. Switching render modes (ASCII / half-block / braille) + ANSI depth.
// ---------------------------------------------------------------------------
test.describe('render modes', () => {
  test('mode buttons toggle aria-pressed and update the mode note', async ({ page }) => {
    await loadFixture(page);
    const ascii = page.getByTestId('mode-ascii');
    const half = page.getByTestId('mode-halfblock');
    const braille = page.getByTestId('mode-braille');

    await expect(ascii).toHaveAttribute('aria-pressed', 'true');

    await half.click();
    await expect(half).toHaveAttribute('aria-pressed', 'true');
    await expect(ascii).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('mode-note')).toContainText(/two vertical pixels/i);

    await braille.click();
    await expect(braille).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mode-note')).toContainText(/2×4 dot/i);
  });

  test('the ramp field shows only for ASCII; the braille field only for braille', async ({ page }) => {
    await loadFixture(page);
    await expect(page.getByTestId('ramp-field')).toBeVisible();
    await expect(page.getByTestId('braille-field')).toBeHidden();

    await page.getByTestId('mode-braille').click();
    await expect(page.getByTestId('ramp-field')).toBeHidden();
    await expect(page.getByTestId('braille-field')).toBeVisible();

    await page.getByTestId('mode-halfblock').click();
    await expect(page.getByTestId('ramp-field')).toBeHidden();
    await expect(page.getByTestId('braille-field')).toBeHidden();
  });

  test('half-block forces + locks the Color toggle (always colored)', async ({ page }) => {
    await loadFixture(page);
    const color = page.getByTestId('color-toggle');
    await expect(color).toBeEnabled();

    await page.getByTestId('mode-halfblock').click();
    await expect(color).toBeChecked();
    await expect(color).toBeDisabled();

    // Leaving half-block unlocks it again.
    await page.getByTestId('mode-ascii').click();
    await expect(color).toBeEnabled();
  });

  test('braille mode renders braille glyphs (U+28xx) in the output', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('mode-braille').click();
    await page.waitForTimeout(RENDER_WAIT);
    const text = await currentText(page);
    expect(text.length).toBeGreaterThan(0);
    // Every non-newline char sits in the braille block.
    const glyphs = [...text].filter((c) => c !== '\n');
    expect(glyphs.every((c) => c.charCodeAt(0) >= 0x2800 && c.charCodeAt(0) <= 0x28ff)).toBe(true);
  });

  test('ANSI depth select switches 256 <-> truecolor and drives the ANSI export', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('color-toggle').check();
    const depth = page.getByTestId('ansi-depth');
    await expect(depth).toHaveValue('256');

    let ansi = await page.evaluate(() => {
      const api = window.__asciiArt;
      return api.cellsToAnsi(api.getState().lastResult.rows, { ansiDepth: '256' });
    });
    expect(ansi).toMatch(/\[38;5;\d+m/); // 256-color sequence

    await depth.selectOption('truecolor');
    await expect(depth).toHaveValue('truecolor');
    ansi = await page.evaluate(() => {
      const api = window.__asciiArt;
      return api.cellsToAnsi(api.getState().lastResult.rows, { ansiDepth: 'truecolor' });
    });
    expect(ansi).toMatch(/\[38;2;\d+;\d+;\d+m/); // truecolor sequence
  });
});

// ---------------------------------------------------------------------------
// 4. Controls change the rendered output (width / ramp / invert / brightness).
// ---------------------------------------------------------------------------
test.describe('controls change the output', () => {
  test('output width changes the column count', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('width-range').fill('40');
    await page.waitForTimeout(RENDER_WAIT);
    await expect(page.getByTestId('width-value')).toHaveText('40');
    await expect(page.getByTestId('output-stats')).toHaveText(/^40 × /);

    await page.getByTestId('width-range').fill('120');
    await page.waitForTimeout(RENDER_WAIT);
    await expect(page.getByTestId('output-stats')).toHaveText(/^120 × /);
  });

  test('invert changes the rendered characters', async ({ page }) => {
    await loadFixture(page);
    const before = await currentText(page);
    await page.getByTestId('invert-toggle').check();
    await page.waitForTimeout(RENDER_WAIT);
    const after = await currentText(page);
    expect(after).not.toBe(before);
  });

  test('editing the ramp switches the preset to Custom and changes the output', async ({ page }) => {
    await loadFixture(page);
    const before = await currentText(page);
    await page.getByTestId('ramp-text').fill('01');
    await page.waitForTimeout(RENDER_WAIT);
    await expect(page.getByTestId('ramp-preset')).toHaveValue('custom');
    const after = await currentText(page);
    expect(after).not.toBe(before);
    // The custom ramp uses only its own characters (plus newlines).
    expect([...after].every((c) => c === '0' || c === '1' || c === '\n')).toBe(true);
  });

  test('choosing a ramp preset repopulates the ramp text', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('ramp-preset').selectOption('binary');
    await expect(page.getByTestId('ramp-text')).toHaveValue('# ');
  });

  test('brightness changes the rendered characters', async ({ page }) => {
    await loadFixture(page);
    const before = await currentText(page);
    await page.getByTestId('brightness-range').fill('80');
    await page.waitForTimeout(RENDER_WAIT);
    await expect(page.getByTestId('brightness-value')).toHaveText('80');
    const after = await currentText(page);
    expect(after).not.toBe(before);
  });

  test('Color on (ASCII) renders colored spans in the preview', async ({ page }) => {
    await loadFixture(page);
    // Monochrome preview: a bare <pre>, no color spans.
    await expect(page.getByTestId('preview-box').locator('span')).toHaveCount(0);
    await page.getByTestId('color-toggle').check();
    await page.waitForTimeout(RENDER_WAIT);
    // Colored preview: coalesced <span> runs appear.
    expect(await page.getByTestId('preview-box').locator('span').count()).toBeGreaterThan(0);
  });

  test('the light-background toggle repaints the preview surface', async ({ page }) => {
    await loadFixture(page);
    const box = page.getByTestId('preview-box');
    const darkBg = await box.evaluate((el) => el.style.background);
    await page.getByTestId('light-preview-toggle').check();
    const lightBg = await box.evaluate((el) => el.style.background);
    expect(lightBg).not.toBe(darkBg);
  });
});

// ---------------------------------------------------------------------------
// 5. Exports: copy flash + downloads for .txt / .html / .ans.
// ---------------------------------------------------------------------------
test.describe('exports', () => {
  test('exports are disabled before an image loads, enabled after', async ({ page }) => {
    for (const id of ['copy-txt-btn', 'download-txt-btn', 'copy-html-btn', 'download-html-btn', 'copy-ansi-btn', 'download-ansi-btn']) {
      await expect(page.getByTestId(id)).toBeDisabled();
    }
    await loadFixture(page);
    for (const id of ['copy-txt-btn', 'download-txt-btn', 'copy-html-btn', 'download-html-btn', 'copy-ansi-btn', 'download-ansi-btn']) {
      await expect(page.getByTestId(id)).toBeEnabled();
    }
  });

  test('Download .txt writes a non-empty text file named <base>-<mode>.txt', async ({ page }) => {
    await loadFixture(page);
    const download = await captureDownload(page, () => page.getByTestId('download-txt-btn').click());
    expect(download.suggestedFilename()).toBe('sample-ascii.txt');
    const savePath = path.join(os.tmpdir(), `ascii-art-${Date.now()}.txt`);
    await download.saveAs(savePath);
    try {
      expect(fs.readFileSync(savePath, 'utf8').length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(savePath, { force: true });
    }
  });

  test('Download .html writes a self-contained HTML document', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('color-toggle').check();
    const download = await captureDownload(page, () => page.getByTestId('download-html-btn').click());
    expect(download.suggestedFilename()).toBe('sample-ascii.html');
    const savePath = path.join(os.tmpdir(), `ascii-art-${Date.now()}.html`);
    await download.saveAs(savePath);
    try {
      const html = fs.readFileSync(savePath, 'utf8');
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain('<pre');
    } finally {
      fs.rmSync(savePath, { force: true });
    }
  });

  test('Download .ans writes ANSI escape codes', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('mode-halfblock').click(); // always colored -> escapes present
    await page.waitForTimeout(RENDER_WAIT);
    const download = await captureDownload(page, () => page.getByTestId('download-ansi-btn').click());
    expect(download.suggestedFilename()).toBe('sample-halfblock.ans');
    const savePath = path.join(os.tmpdir(), `ascii-art-${Date.now()}.ans`);
    await download.saveAs(savePath);
    try {
      const ans = fs.readFileSync(savePath, 'utf8');
      expect(ans).toContain('\x1b['); // contains ESC sequences
    } finally {
      fs.rmSync(savePath, { force: true });
    }
  });

  test('Copy .txt flashes success feedback on the button', async ({ page }) => {
    await loadFixture(page);
    const btn = page.getByTestId('copy-txt-btn');
    await btn.click();
    await expect(btn).toContainText(/Copied/i);
    // Feedback reverts back to the original label afterwards.
    await expect(btn).toContainText(/Copy \.txt/i, { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Reset (confirmDialog) clears the image and restores default options.
// ---------------------------------------------------------------------------
test.describe('Reset with confirmation', () => {
  test('Reset shows confirmDialog; confirming clears the image and resets options', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('mode-braille').click();
    await page.getByTestId('reset-btn').click();
    await assertConfirmDialog(page, { action: 'confirm' });

    await expect(page.getByTestId('loaded-section')).toBeHidden();
    // Mode restored to the ASCII default.
    await expect(page.getByTestId('mode-ascii')).toHaveAttribute('aria-pressed', 'true');
  });

  test('cancelling the Reset confirm leaves the image loaded', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('reset-btn').click();
    await assertConfirmDialog(page, { action: 'cancel' });
    await expect(page.getByTestId('loaded-section')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7. Options persistence across reload (localStorage) — options only.
// ---------------------------------------------------------------------------
test.describe('options persistence', () => {
  test('mode, width and ramp survive a reload (options persisted)', async ({ page }) => {
    await loadFixture(page);
    await page.getByTestId('mode-braille').click();
    await page.getByTestId('width-range').fill('64');

    // Wait for the write to land before reloading (file:// commit race).
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => JSON.stringify(v).includes('braille') && JSON.stringify(v).includes('64') });
    await page.reload();

    await expect(page.getByTestId('mode-braille')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('width-value')).toHaveText('64');
  });

  test('image bytes are never persisted (only the small options object)', async ({ page }) => {
    await loadFixture(page);
    // Options persist on change (not on image load), so nudge one control first.
    await page.getByTestId('invert-toggle').check();
    const stored = await readStored(page, STORAGE_KEY, { json: false });
    expect(stored).toBeTruthy();
    // The options blob is small — nothing resembling image data.
    expect(stored.length).toBeLessThan(400);
    const parsed = JSON.parse(stored);
    expect(parsed).not.toHaveProperty('img');
    expect(parsed).not.toHaveProperty('data');
    expect(parsed).toHaveProperty('mode');
  });
});

// ---------------------------------------------------------------------------
// 8. Responsive: wide desktop uses width + preview scrolls in its own box;
//    mobile 375px has no horizontal page overflow.
// ---------------------------------------------------------------------------
test.describe('responsive layout', () => {
  test('wide viewport lays controls and preview side by side', async ({ page }) => {
    await setViewport(page, 'wide');
    await loadFixture(page);
    const controls = await page.getByTestId('controls').boundingBox();
    const preview = await page.locator('.preview').boundingBox();
    expect(Math.abs(controls.y - preview.y)).toBeLessThan(60);
    expect(preview.x).toBeGreaterThan(controls.x + controls.width - 5);
  });

  test('the preview scrolls inside its own box, not the page body (wide art)', async ({ page }) => {
    await setViewport(page, { width: 1200, height: 800 });
    await loadFixture(page);
    // Force a very wide render so the art overflows the preview box.
    await page.getByTestId('width-range').fill('300');
    await page.waitForTimeout(RENDER_WAIT);
    const box = page.getByTestId('preview-box');
    // The box is its own scroll container (overflow auto/scroll).
    const overflow = await box.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflow);
    // The page body itself does not scroll horizontally.
    await expectNoOverflow(page);
  });

  test('mobile ~375px has no horizontal page overflow', async ({ page }) => {
    await setViewport(page, 'mobile');
    await loadFixture(page);
    await page.getByTestId('width-range').fill('120');
    await page.waitForTimeout(RENDER_WAIT);
    await expectNoOverflow(page);
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
//     ascii-art bundles NO third-party libraries, so the modal shows the
//     "100% vanilla" note.
// ---------------------------------------------------------------------------
test.describe('License modal (shared footer surface)', () => {
  test('footer "MIT License" link opens the modal with the MIT text + vanilla note', async ({ page }) => {
    const link = page.getByTestId('footer-license-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/MIT License/i);

    await link.click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText(/Permission is hereby granted/i);
    await expect(page.getByTestId('license-close-x')).toBeVisible();
    await expect(modal).toContainText(/100% vanilla/i);
    await expect(modal).toContainText(/no runtime dependencies/i);
    await expect(modal).not.toContainText(/Bundled third-party libraries/i);
  });

  // Open + accessible dialog + ✕ focused + Esc / ✕ / backdrop close with focus
  // return are the shared License-modal contract; assert them via the helper.
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
