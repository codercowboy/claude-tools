// @playwright/test spec for tools/barcode-generator/index.html. Dev/test-only. Input is debounced,
// so every assertion auto-retries (expect) on the DOM before reading it.
import { test, expect } from '@playwright/test';
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHookShape, trackPageErrors } from '../../../lib/test-support/interaction.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { stubClipboard, readClipboard } from '../../../lib/test-support/clipboard.mjs';
import { downloadBytes, expectMagic } from '../../../lib/test-support/files.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('barcode-generator');
const EAN_MODULES = '10100010111011000100110000100110111101110001001010110011011011001000010101110010011101000100101';

test.beforeEach(async ({ page }) => {
  const errs = trackPageErrors(page);
  page.on('console', (m) => { if (m.type() === 'error') errs.errors.push('console.error: ' + m.text()); });
  page.__errs = errs;
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
  await page.waitForFunction(() => !!window.__barcodeGenerator);
  await stubClipboard(page);
});
test.afterEach(async ({ page }) => { page.__errs.assertNone(); });

const T = (page, id) => page.getByTestId(id);
const type = async (page, text) => { await T(page, 'barcode-input').fill(text); };
const svg = (page) => T(page, 'preview').locator('svg');

// Dark/light per module column from one pixel row of PNG bytes (decoded in the page).
async function rowFromPng(page, bytes, y) {
  return page.evaluate(async ({ arr, y }) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, y, bmp.width, 1).data;
    const row = [];
    for (let x = 0; x < bmp.width; x++) row.push(d[x * 4] < 128 ? '1' : '0');
    return { width: bmp.width, height: bmp.height, row: row.join('') };
  }, { arr: Array.from(bytes), y });
}

test.describe('shell', () => {
  test('hook shape, License modal, Help a11y', async ({ page }) => {
    await assertHookShape(page, '__barcodeGenerator', { encode: 'function', layout: 'function', toSvg: 'function', renderCanvas: 'function', state: 'object', setInput: 'function' });
    await assertLicenseModal(page);
    await assertModalA11y(page, { labelledBy: 'help-title' });
  });

  test('default render: sample barcode, check digit, enabled actions, no overflow', async ({ page }) => {
    await expect(svg(page)).toHaveCount(1);
    await expect(T(page, 'barcode-input')).toHaveValue('PJJ123C');
    await expect(T(page, 'check-digit')).toHaveText('55');
    await expect(T(page, 'download-png-btn')).toBeEnabled();
    await expect(T(page, 'error-message')).toBeHidden();
    await expectNoOverflow(page, { viewport: { width: 375, height: 800 } });
    await expectNoOverflow(page, { viewport: { width: 1400, height: 900 } });
  });
});

test.describe('preview', () => {
  test('SVG is one path with crispEdges, same string as the export', async ({ page }) => {
    await expect(svg(page).locator('path')).toHaveCount(1);
    await expect(svg(page)).toHaveAttribute('shape-rendering', 'crispEdges');
    await expect(svg(page).locator('text')).toHaveCount(1);
    await expect(svg(page).locator('text')).toHaveText('PJJ123C');
    const same = await page.evaluate(() => {
      const src = new DOMParser().parseFromString(window.__barcodeGenerator.state.svg, 'image/svg+xml').documentElement;
      const live = document.querySelector('[data-testid="preview"] svg');
      const at = (n, a) => n.getAttribute(a);
      return at(live, 'viewBox') === at(src, 'viewBox') && at(live, 'width') === at(src, 'width')
        && at(live.querySelector('path'), 'd') === at(src.querySelector('path'), 'd')
        && live.querySelector('text').textContent === src.querySelector('text').textContent;
    });
    expect(same).toBe(true);
  });

  test('symbology toggle: aria-pressed, sample swap, check digit, quiet-zone default', async ({ page }) => {
    await T(page, 'sym-ean13').click();
    await expect(T(page, 'sym-ean13')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'sym-code128')).toHaveAttribute('aria-pressed', 'false');
    await expect(T(page, 'barcode-input')).toHaveValue('590123412345');
    await expect(T(page, 'check-digit')).toHaveText('7');
    await expect(svg(page).locator('text')).toHaveCount(3);
    await expect(svg(page)).toHaveAttribute('viewBox', '0 0 113 74');
    await T(page, 'sym-upca').click();
    await expect(T(page, 'check-digit')).toHaveText('2');
    await expect(svg(page).locator('text')).toHaveCount(4);
    await T(page, 'sym-code39').click();
    await expect(T(page, 'barcode-input')).toHaveValue('CODE39');
    await expect(svg(page)).toHaveAttribute('viewBox', '0 0 ' + (10 + 15 * 8 + 7 + 10) + ' 74');
    await T(page, 'c39-check-toggle').check();
    await expect(T(page, 'check-digit')).toHaveText('W');
    await expect(svg(page).locator('text')).toHaveText('CODE39W');
    await T(page, 'symbology-seg').getByRole('button', { name: 'Code 39' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(T(page, 'sym-code128')).toHaveAttribute('aria-pressed', 'true');
  });

  test('typing updates live; hide text; quiet zone override', async ({ page }) => {
    await type(page, 'Hello');
    await expect(T(page, 'check-digit')).toHaveText('76');
    await T(page, 'show-text-toggle').uncheck();
    await expect(svg(page).locator('text')).toHaveCount(0);
    await T(page, 'quiet-zone-input').fill('0');
    const w = await page.evaluate(() => window.__barcodeGenerator.state.enc.modules.length);
    await expect(svg(page)).toHaveAttribute('viewBox', '0 0 ' + w + ' 60');
  });
});

test.describe('validation', () => {
  test('invalid input shows a message, disables export, never throws', async ({ page }) => {
    await T(page, 'sym-ean13').click();
    await type(page, '5901234123458');
    await expect(T(page, 'error-message')).toContainText('expected 7');
    await expect(svg(page)).toHaveCount(0);
    await expect(T(page, 'download-png-btn')).toBeDisabled();
    await expect(T(page, 'copy-svg-btn')).toBeDisabled();
    await type(page, 'abc');
    await expect(T(page, 'error-message')).toContainText('digits only');
    await T(page, 'sym-code39').click();
    await type(page, 'A*B');
    await expect(T(page, 'error-message')).toContainText('reserved');
    await type(page, 'ok-1');
    await expect(T(page, 'error-message')).toBeHidden();
    await T(page, 'sym-code128').click();
    await type(page, 'café');
    await expect(T(page, 'error-message')).toContainText('ASCII');
  });

  test('markup in the text cannot inject elements', async ({ page }) => {
    await type(page, '<img src=x onerror=alert(1)><script>');
    await expect(svg(page)).toHaveCount(1);
    await expect(T(page, 'preview').locator('img, script')).toHaveCount(0);
    await expect(svg(page).locator('text')).toHaveText('<img src=x onerror=alert(1)><script>');
  });
});

test.describe('export', () => {
  test('PNG download: pixel columns == modules x scale (EAN-13, scale 3)', async ({ page }) => {
    await T(page, 'sym-ean13').click();
    await expect(T(page, 'check-digit')).toHaveText('7');
    await T(page, 'scale-input').fill('3');
    await expect(svg(page)).toHaveAttribute('width', String(113 * 3));
    const { filename, bytes } = await downloadBytes(page, () => T(page, 'download-png-btn').click());
    expect(filename).toBe('barcode-ean13-5901234123457.png');
    expectMagic(bytes, 'png');
    const { width, height, row } = await rowFromPng(page, bytes, 5);
    expect(width).toBe(113 * 3);
    expect(height).toBe(74 * 3);
    const expected = ('0'.repeat(11) + EAN_MODULES + '0'.repeat(7)).split('').map((c) => c.repeat(3)).join('');
    expect(row).toBe(expected);
  });

  test('canvas hook: Code 128 at scale 2 matches the module string, no smoothing artifacts', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = window.__barcodeGenerator;
      const modules = g.state.enc.modules;
      const c = g.renderCanvas();
      const d = c.getContext('2d').getImageData(0, 3, c.width, 1).data;
      const colors = new Set();
      let row = '';
      for (let x = 0; x < c.width; x++) { colors.add(d[x * 4] + ',' + d[x * 4 + 3]); row += d[x * 4] < 128 ? '1' : '0'; }
      return { modules, row, width: c.width, colors: [...colors] };
    });
    expect(r.width).toBe((10 + r.modules.length + 10) * 2);
    expect(r.row).toBe(('0'.repeat(10) + r.modules + '0'.repeat(10)).split('').map((c) => c.repeat(2)).join(''));
    expect(r.colors.sort()).toEqual(['0,255', '255,255']);
  });

  test('SVG download and copy deliver the same standalone SVG', async ({ page }) => {
    const { filename, bytes } = await downloadBytes(page, () => T(page, 'download-svg-btn').click());
    expect(filename).toBe('barcode-code128-PJJ123C.svg');
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(text).toContain('shape-rendering="crispEdges"');
    expect((text.match(/<path /g) || []).length).toBe(1);
    await T(page, 'copy-svg-btn').click();
    await expect(T(page, 'copy-svg-btn')).toHaveText('Copied!');
    expect(await readClipboard(page)).toBe(text);
  });

  test('fg/bg colors reach the export; PNG uses them', async ({ page }) => {
    await T(page, 'fg-color-input').fill('#112233');
    await T(page, 'bg-color-input').fill('#ffeecc');
    await expect.poll(() => page.evaluate(() => window.__barcodeGenerator.state.svg)).toContain('fill="#112233"');
    const px = await page.evaluate(() => {
      const c = window.__barcodeGenerator.renderCanvas();
      return Array.from(c.getContext('2d').getImageData(0, 0, 1, 1).data);
    });
    expect(px).toEqual([255, 238, 204, 255]);
  });
});

test.describe('contrast', () => {
  test('warns on inverted and low-contrast colors, clears on good ones', async ({ page }) => {
    await expect(T(page, 'contrast-warning')).toBeHidden();
    await T(page, 'fg-color-input').fill('#ffffff');
    await T(page, 'bg-color-input').fill('#000000');
    await expect(T(page, 'contrast-warning')).toBeVisible();
    await expect(T(page, 'contrast-warning')).toContainText('inverted');
    await T(page, 'fg-color-input').fill('#888888');
    await T(page, 'bg-color-input').fill('#999999');
    await expect(T(page, 'contrast-warning')).toContainText('Low contrast');
    await T(page, 'fg-color-input').fill('#000000');
    await T(page, 'bg-color-input').fill('#ffffff');
    await expect(T(page, 'contrast-warning')).toBeHidden();
  });
});

test.describe('persistence', () => {
  test('symbology and size survive a reload; typed data does not', async ({ page }) => {
    await T(page, 'sym-upca').click();
    await T(page, 'scale-input').fill('4');
    await type(page, '12345678901');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('barcode-generator:v1'))).toContain('"scale":4');
    await page.reload();
    await page.waitForFunction(() => !!window.__barcodeGenerator);
    await expect(T(page, 'sym-upca')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'scale-input')).toHaveValue('4');
    await expect(T(page, 'barcode-input')).toHaveValue('03600029145');
  });
});
