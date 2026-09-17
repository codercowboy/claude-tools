// @playwright/test spec for tools/inflation-calculator/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test — this spec drives the finished
// page from the outside via data-testid hooks and the inert
// window.__inflationCalculator test API (DESIGN.md § "Testability hooks").
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/inflation-calculator/).

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';
import { assertLicenseModal } from '../../test-support/shared-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');
const TOOL_URL = toolUrl(import.meta.url);

// First-load Help popup auto-shows once, keyed off localStorage
// "inflation-calculator:help-seen:v1". Every test EXCEPT the dedicated
// first-load suite pre-seeds that key via addInitScript (before the page's own
// module runs) so the auto-shown modal never interferes with other assertions.
const HELP_SEEN_KEY = helpSeenKey('inflation-calculator');
const STORAGE_KEY = 'inflation-calculator:v1';

// Drive inputs through the inert test hook (avoids the file:// write-then-reload
// race for state changes; render() + saveState() run synchronously here).
async function setInputs(page, inputs) {
  await page.evaluate((i) => window.__inflationCalculator.setInputs(i), inputs);
}

// =============================================================================
// First-load Help popup — genuine first visit in a fresh context (NOT seeded).
// =============================================================================
test.describe('first-load Help popup', () => {
  test('auto-shows once on a fresh visit, then stays closed on reload', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);

    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    await page.getByTestId('modal-close-x').click();
    await expect(overlay).toBeHidden();

    await page.reload();
    await expect(overlay).toBeHidden();

    const seen = await page.evaluate((k) => localStorage.getItem(k), HELP_SEEN_KEY);
    expect(seen).toBe('1');
    await context.close();
  });

  test('re-opening via the ? button works after first-load dismissal', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await page.getByTestId('modal-close-x').click();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await context.close();
  });
});

// =============================================================================
// Help modal — close paths, focus trap & focus return (pre-seeded).
// =============================================================================
test.describe('Help modal: close paths, focus trap & return', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('opens with focus on the ✕; ✕ closes and returns focus to ?', async ({ page }) => {
    const helpBtn = page.getByTestId('help-button');
    await helpBtn.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    await page.getByTestId('modal-close-x').click();
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpBtn).toBeFocused();
  });

  test('Esc closes the Help modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('backdrop click closes the Help modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    // Click the overlay near a corner, outside the centered dialog.
    await page.getByTestId('help-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('focus is trapped inside the dialog (Tab stays on the close ✕)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const closeX = page.getByTestId('modal-close-x');
    await expect(closeX).toBeFocused();
    // Only the ✕ is focusable in this dialog, so Tab / Shift+Tab wrap to it.
    await page.keyboard.press('Tab');
    await expect(closeX).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeX).toBeFocused();
  });

  test('the dialog is a labelled ARIA modal', async ({ page }) => {
    const dialog = page.getByTestId('help-modal');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'help-title');
  });
});

// =============================================================================
// Year selects are bounded by the data range.
// =============================================================================
test.describe('year selects', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('both selects span exactly the CPI data range (descending)', async ({ page }) => {
    const range = await page.evaluate(() => window.__inflationCalculator.RANGE);
    const expectedCount = range.maxYear - range.minYear + 1;

    for (const id of ['from-year', 'to-year']) {
      const opts = await page.locator(`#${id} option`).allInnerTexts();
      expect(opts.length).toBe(expectedCount);
      // Descending: most recent first, oldest last.
      expect(Number(opts[0])).toBe(range.maxYear);
      expect(Number(opts[opts.length - 1])).toBe(range.minYear);
    }
  });
});

// =============================================================================
// Core calculation.
// =============================================================================
test.describe('calculation', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('$100 from 1990 to 2025 shows amount, cumulative %, annual rate & sentence', async ({ page }) => {
    await page.getByTestId('amount-input').fill('100');
    await page.getByTestId('from-year').selectOption('1990');
    await page.getByTestId('to-year').selectOption('2025');

    await expect(page.getByTestId('result-value')).toHaveText('$246.32');
    await expect(page.getByTestId('cumulative')).toHaveText('+146.32%');
    await expect(page.getByTestId('annual-rate')).toHaveText('+2.61%/yr');
    await expect(page.getByTestId('result-sentence')).toHaveText(
      '$100.00 in 1990 has the same buying power as $246.32 in 2025.',
    );
  });

  test('a comma/$-formatted amount is parsed', async ({ page }) => {
    await page.getByTestId('amount-input').fill('$1,000');
    await page.getByTestId('from-year').selectOption('2000');
    await page.getByTestId('to-year').selectOption('2020');
    // 1000 * CPI[2020]/CPI[2000]
    const expected = await page.evaluate(() => {
      const { adjust, CPI } = window.__inflationCalculator;
      return adjust(1000, 2000, 2020, CPI);
    });
    const shown = await page.getByTestId('result-value').textContent();
    const num = Number(shown.replace(/[$,]/g, ''));
    expect(Math.abs(num - expected)).toBeLessThan(0.01);
  });

  test('the swap button flips the two years and recomputes', async ({ page }) => {
    await setInputs(page, { amount: '100', fromYear: 1990, toYear: 2025 });
    await page.getByTestId('swap-years').click();
    await expect(page.getByTestId('from-year')).toHaveValue('2025');
    await expect(page.getByTestId('to-year')).toHaveValue('1990');
    // 100 from 2025 in 1990 dollars is well under $100.
    const shown = await page.getByTestId('result-value').textContent();
    expect(Number(shown.replace(/[$,]/g, ''))).toBeLessThan(100);
  });

  test('a trend sparkline renders for a multi-year span', async ({ page }) => {
    await setInputs(page, { amount: '100', fromYear: 1990, toYear: 2025 });
    const trend = page.getByTestId('trend');
    await expect(trend).toBeVisible();
    await expect(trend.locator('svg polyline')).toHaveCount(1);
  });
});

// =============================================================================
// Edge / error handling.
// =============================================================================
test.describe('edge & error handling', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('a same-year span shows 0% cumulative, 0%/yr, and hides the trend', async ({ page }) => {
    await setInputs(page, { amount: '100', fromYear: 2000, toYear: 2000 });
    await expect(page.getByTestId('result-value')).toHaveText('$100.00');
    await expect(page.getByTestId('cumulative')).toHaveText('0%');
    await expect(page.getByTestId('annual-rate')).toHaveText('0%/yr');
    await expect(page.getByTestId('trend')).toBeHidden();
  });

  test('an invalid amount shows the error and clears results', async ({ page }) => {
    await page.getByTestId('amount-input').fill('abc');
    const err = page.getByTestId('error');
    await expect(err).toBeVisible();
    await expect(err).toHaveText(/valid dollar amount/i);
    await expect(page.getByTestId('result-value')).toHaveText('');
  });

  test('an empty amount clears results without an error', async ({ page }) => {
    await page.getByTestId('amount-input').fill('');
    await expect(page.getByTestId('error')).toBeHidden();
    await expect(page.getByTestId('result-value')).toHaveText('');
    await expect(page.getByTestId('result-sentence')).toHaveText('');
  });

  test('years outside the data range are not selectable (bounded dropdowns)', async ({ page }) => {
    const range = await page.evaluate(() => window.__inflationCalculator.RANGE);
    await expect(page.locator(`#from-year option[value="${range.minYear - 1}"]`)).toHaveCount(0);
    await expect(page.locator(`#to-year option[value="${range.maxYear + 1}"]`)).toHaveCount(0);
  });
});

// =============================================================================
// CPI-U source citation is visible.
// =============================================================================
test.describe('data provenance', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('the CPI-U / BLS citation and covered range are shown', async ({ page }) => {
    const note = page.locator('.data-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Bureau of Labor Statistics');
    await expect(note).toContainText('CPI-U');
    await expect(note).toContainText('CUUR0000SA0');
    await expect(note.getByRole('link', { name: /bls\.gov/i })).toHaveAttribute(
      'href',
      'https://www.bls.gov/cpi/',
    );
    // The covered-range placeholder is filled in from the dataset.
    const range = await page.evaluate(() => window.__inflationCalculator.RANGE);
    await expect(page.locator('.data-note [data-testid="data-range"]')).toHaveText(
      `${range.minYear}–${range.maxYear}`,
    );
  });
});

// =============================================================================
// Copy buttons flash on success.
// =============================================================================
test.describe('copy affordances', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('the amount copy button flashes ✅ then reverts', async ({ page }) => {
    await page.getByTestId('amount-input').fill('100');
    const btn = page.getByTestId('amount-copy');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(btn).toHaveText('✅');
    await expect(btn).toHaveText('📋'); // reverts
  });

  test('the result copy button flashes ✅', async ({ page }) => {
    await setInputs(page, { amount: '100', fromYear: 1990, toYear: 2025 });
    const btn = page.getByTestId('result-copy');
    await btn.click();
    await expect(btn).toHaveText('✅');
    await expect(btn).toHaveText('📋');
  });

  test('the amount copy button hides when the field is empty', async ({ page }) => {
    await page.getByTestId('amount-input').fill('');
    await expect(page.getByTestId('amount-copy')).toBeHidden();
    await page.getByTestId('amount-input').fill('50');
    await expect(page.getByTestId('amount-copy')).toBeVisible();
  });
});

// =============================================================================
// Persistence across reload (via the tool's own save path).
// =============================================================================
test.describe('persistence', () => {
  test('amount + both years survive a reload', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);

    await setInputs(page, { amount: '250', fromYear: 1975, toYear: 2010 });
    // Small settle so the file:// localStorage write commits before reload.
    await page.waitForTimeout(400);
    await page.reload();

    await expect(page.getByTestId('amount-input')).toHaveValue('250');
    await expect(page.getByTestId('from-year')).toHaveValue('1975');
    await expect(page.getByTestId('to-year')).toHaveValue('2010');
    // And the restored state still computes.
    await expect(page.getByTestId('result-value')).not.toHaveText('');

    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
    expect(stored).toMatchObject({ amount: '250', fromYear: 1975, toYear: 2010 });
  });
});

// =============================================================================
// Responsive: wide screen uses width; mobile has no horizontal overflow.
// =============================================================================
test.describe('responsive — wide viewport', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('the card grows with a wide viewport (uses available width)', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    const card = page.locator('.card');
    const box = await card.boundingBox();
    // Wider than a cramped ~700px column, but still capped (not full 1600px).
    expect(box.width).toBeGreaterThan(700);
    // No horizontal page overflow.
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW + 1);
  });
});

test.describe('responsive — mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test('no horizontal overflow at ~375px', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await setInputs(page, { amount: '1000000', fromYear: 1913, toYear: 2025 });

    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW + 1);

    // The app itself fits within the viewport.
    const box = await page.locator('.app').boundingBox();
    expect(box.width).toBeLessThanOrEqual(375 + 1);
  });

  test('the calculator is usable at mobile width', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await page.getByTestId('amount-input').fill('100');
    await page.getByTestId('from-year').selectOption('1990');
    await page.getByTestId('to-year').selectOption('2025');
    await expect(page.getByTestId('result-value')).toHaveText('$246.32');
  });
});

// -----------------------------------------------------------------------------
// License surface — shared footer "MIT License" link + modal (license.js).
// The footer is inlined by the build on every page. inflation-calculator
// bundles NO third-party libraries, so the modal shows the "100% vanilla" note.
// -----------------------------------------------------------------------------
test.describe('License modal (shared footer surface)', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('footer "MIT License" link opens the modal with the MIT text and ✕', async ({ page }) => {
    const link = page.getByTestId('footer-license-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/MIT License/i);

    await link.click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText(/Permission is hereby granted/i);
    await expect(page.getByTestId('license-close-x')).toBeVisible();
    // No-dependency tool: shows the vanilla note, not a bundled-lib list.
    await expect(modal).toContainText(/100% vanilla/i);
    await expect(modal).toContainText(/no runtime dependencies/i);
    await expect(modal).not.toContainText(/Bundled third-party libraries/i);
  });

  // Focus-on-open, the focus trap, and Esc / ✕ / backdrop close with focus
  // return are the shared License-modal contract; assert them via the helper.
  test('is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('window.ctLicense() opens the modal programmatically', async ({ page }) => {
    await page.evaluate(() => window.ctLicense());
    await expect(page.getByTestId('license-modal')).toBeVisible();
    await expect(page.getByTestId('license-modal')).toContainText('MIT License');
  });
});
