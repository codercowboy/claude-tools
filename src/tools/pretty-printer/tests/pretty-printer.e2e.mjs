// @playwright/test spec for tools/pretty-printer/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the
// window.__prettyPrinter test API described in DESIGN.md § "Testability".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/pretty-printer/).

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertConfirmDialog } from '../../../lib/test-support/interaction.mjs';
import { settleStorage } from '../../../lib/test-support/storage.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { stubClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');
const TOOL_URL = toolUrl(import.meta.url);

// First-load Help auto-shows once, keyed off localStorage
// "pretty-printer:help-seen:v1". Every test EXCEPT the dedicated first-load
// suite pre-seeds that key via addInitScript (set before the page's module
// runs) so the auto-shown modal never interferes with unrelated assertions.
const HELP_SEEN_KEY = helpSeenKey('pretty-printer');
const STORAGE_KEY = 'pretty-printer:v1';

const LANGS = ['json', 'yaml', 'html', 'css', 'sql', 'js'];

// -----------------------------------------------------------------------------
// Help modal — genuine first-load in a fresh context (NOT pre-seeded).
// -----------------------------------------------------------------------------
test.describe('first-load Help popup', () => {
  test('auto-shows once on a genuinely fresh visit, then stays closed on reload', async ({ browser }) => {
    await assertHelpAutoShows(browser, TOOL_URL, { seenKey: HELP_SEEN_KEY });
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

// -----------------------------------------------------------------------------
// Help modal close paths / focus behavior (pre-seeded; open via ? button).
// -----------------------------------------------------------------------------
test.describe('Help modal: close paths, focus trap & focus return', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('Help modal a11y contract (role/aria-modal, focus on ✕, focus trap, Esc/✕/backdrop close + focus return)', async ({ page }) => {
    await assertModalA11y(page);
  });
});

// -----------------------------------------------------------------------------
// License modal — shared footer license link + CtLicense.mjs modal (pre-seeded so
// the first-load Help modal never interferes; open via the footer link).
// -----------------------------------------------------------------------------
test.describe('License modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  async function openLicense(page) {
    const link = page.getByTestId('footer-license-link');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page.getByTestId('license-overlay')).toBeVisible();
  }

  test('clicking the footer link opens the modal with the MIT text and a close control', async ({ page }) => {
    await openLicense(page);
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText('License'); // h2 heading
    await expect(page.getByTestId('license-close-x')).toBeVisible();
  });

  // Focus-on-open and Esc / ✕ / backdrop close with focus return are the
  // shared License-modal contract; assert them via the helper.
  test('is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('the "100% vanilla / no runtime dependencies" note is present', async ({ page }) => {
    await openLicense(page);
    await expect(page.getByTestId('license-modal')).toContainText(
      'No third-party libraries — this tool is 100% vanilla, with no runtime dependencies.'
    );
  });

  test('clicking the [data-ct-license] trigger opens the modal', async ({ page }) => {
    await page.locator('[data-ct-license]').click();
    await expect(page.getByTestId('license-overlay')).toBeVisible();
    await expect(page.getByTestId('license-modal')).toContainText('MIT License');
  });
});

// -----------------------------------------------------------------------------
// Feature tests — pre-seed help-seen.
// -----------------------------------------------------------------------------
test.describe('feature tests', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // Tabs — ARIA roles, click + keyboard nav, per-tab input retention.
  // ---------------------------------------------------------------------------
  test.describe('language tabs', () => {
    test('tablist and tabs carry the correct ARIA roles', async ({ page }) => {
      await expect(page.getByTestId('tablist')).toHaveAttribute('role', 'tablist');
      for (const lang of LANGS) {
        await expect(page.getByTestId(`tab-${lang}`)).toHaveAttribute('role', 'tab');
      }
      await expect(page.getByTestId('editor')).toHaveAttribute('role', 'tabpanel');
      // Exactly one tab selected at a time; JSON is the default.
      await expect(page.getByTestId('tab-json')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('tab-yaml')).toHaveAttribute('aria-selected', 'false');
    });

    test('clicking a tab selects it and updates roving tabindex', async ({ page }) => {
      await page.getByTestId('tab-css').click();
      await expect(page.getByTestId('tab-css')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('tab-css')).toHaveAttribute('tabindex', '0');
      await expect(page.getByTestId('tab-json')).toHaveAttribute('aria-selected', 'false');
      await expect(page.getByTestId('tab-json')).toHaveAttribute('tabindex', '-1');
    });

    test('Left/Right/Home/End arrow keys move between tabs', async ({ page }) => {
      await page.getByTestId('tab-json').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('tab-yaml')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('tab-yaml')).toBeFocused();

      await page.keyboard.press('ArrowLeft');
      await expect(page.getByTestId('tab-json')).toHaveAttribute('aria-selected', 'true');

      // Wrap-around: Left from the first tab lands on the last.
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByTestId('tab-js')).toHaveAttribute('aria-selected', 'true');

      await page.keyboard.press('Home');
      await expect(page.getByTestId('tab-json')).toHaveAttribute('aria-selected', 'true');

      await page.keyboard.press('End');
      await expect(page.getByTestId('tab-js')).toHaveAttribute('aria-selected', 'true');
    });

    test('each tab keeps its own input text when switching away and back', async ({ page }) => {
      await page.getByTestId('tab-json').click();
      await page.getByTestId('pp-input').fill('{"a":1}');
      await page.getByTestId('tab-css').click();
      await page.getByTestId('pp-input').fill('a{color:red}');

      // Back to JSON — its own text is restored, not the CSS text.
      await page.getByTestId('tab-json').click();
      await expect(page.getByTestId('pp-input')).toHaveValue('{"a":1}');
      await page.getByTestId('tab-css').click();
      await expect(page.getByTestId('pp-input')).toHaveValue('a{color:red}');
    });

    test('the SQL keyword-case control only appears on the SQL tab', async ({ page }) => {
      await expect(page.getByTestId('sql-case-field')).toBeHidden();
      await page.getByTestId('tab-sql').click();
      await expect(page.getByTestId('sql-case-field')).toBeVisible();
      await page.getByTestId('tab-json').click();
      await expect(page.getByTestId('sql-case-field')).toBeHidden();
    });
  });

  // ---------------------------------------------------------------------------
  // Format vs Minify for each language on its sample.
  // ---------------------------------------------------------------------------
  test.describe('format & minify per language', () => {
    for (const lang of LANGS) {
      test(`${lang}: Load sample → Format produces output; Minify shrinks it`, async ({ page }) => {
        await page.getByTestId(`tab-${lang}`).click();
        await page.getByTestId('load-sample').click(); // input empty → no confirm
        await expect(page.getByTestId('pp-input')).not.toHaveValue('');

        // Format (default) → non-empty output.
        await expect(page.getByTestId('mode-format')).toHaveAttribute('aria-pressed', 'true');
        const formatted = await page.getByTestId('pp-output').inputValue();
        expect(formatted.length).toBeGreaterThan(0);

        // Minify → non-empty output, no larger than the formatted output.
        await page.getByTestId('mode-minify').click();
        await expect(page.getByTestId('mode-minify')).toHaveAttribute('aria-pressed', 'true');
        const minified = await page.getByTestId('pp-output').inputValue();
        expect(minified.length).toBeGreaterThan(0);
        expect(minified.length).toBeLessThanOrEqual(formatted.length);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Indent select changes the formatted output.
  // ---------------------------------------------------------------------------
  test('indent select changes the formatted output', async ({ page }) => {
    const output = page.getByTestId('pp-output');
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"a":{"b":1}}');
    // Output updates on a ~150ms debounce, so poll rather than read immediately.
    await expect.poll(() => output.inputValue()).toContain('\n  "a"');
    const two = await output.inputValue();

    await page.getByTestId('indent-select').selectOption('4'); // immediate re-run
    await expect.poll(() => output.inputValue()).toContain('\n    "a"');
    const four = await output.inputValue();
    expect(four).not.toBe(two);

    await page.getByTestId('indent-select').selectOption('tab');
    await expect.poll(() => output.inputValue()).toContain('\n\t"a"');
  });

  test('indent select is disabled in Minify mode', async ({ page }) => {
    await expect(page.getByTestId('indent-select')).toBeEnabled();
    await page.getByTestId('mode-minify').click();
    await expect(page.getByTestId('indent-select')).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // SQL keyword-case select.
  // ---------------------------------------------------------------------------
  test('SQL keyword-case select changes keyword casing in the output', async ({ page }) => {
    await page.getByTestId('tab-sql').click();
    await page.getByTestId('pp-input').fill('select id from users where id = 1');

    await page.getByTestId('sql-keyword-case').selectOption('upper');
    expect(await page.getByTestId('pp-output').inputValue()).toContain('SELECT');

    await page.getByTestId('sql-keyword-case').selectOption('lower');
    const lower = await page.getByTestId('pp-output').inputValue();
    expect(lower).toContain('select');
    expect(lower).not.toContain('SELECT');
  });

  test('SQL keyword-case defaults to "Unchanged" (keywords keep their typed case)', async ({ page }) => {
    await page.getByTestId('tab-sql').click();
    // Default selected option is "unchanged".
    await expect(page.getByTestId('sql-keyword-case')).toHaveValue('unchanged');
    // Mixed-case keywords are preserved verbatim, not upper/lower-cased.
    await page.getByTestId('pp-input').fill('SeLeCt id FrOm users');
    const out = page.getByTestId('pp-output');
    await expect.poll(() => out.inputValue()).toContain('SeLeCt');
    expect(await out.inputValue()).toContain('FrOm');
  });

  // ---------------------------------------------------------------------------
  // Error display.
  // ---------------------------------------------------------------------------
  test('invalid JSON shows an error and clears the output', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{bad}');
    const err = page.getByTestId('pp-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Invalid JSON');
    await expect(page.getByTestId('pp-output')).toHaveValue('');

    // Fixing it clears the error and produces output.
    await page.getByTestId('pp-input').fill('{"ok":true}');
    await expect(err).toBeHidden();
    await expect(page.getByTestId('pp-output')).not.toHaveValue('');
  });

  test('unsupported YAML feature shows the documented error', async ({ page }) => {
    await page.getByTestId('tab-yaml').click();
    await page.getByTestId('pp-input').fill('a: &anchor 1');
    const err = page.getByTestId('pp-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Unsupported YAML feature: anchors');
  });

  // ---------------------------------------------------------------------------
  // Copy flash.
  // ---------------------------------------------------------------------------
  test('the copy button flashes on copy', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"a":1}');
    // Wait for the debounced output before copying (copy is a no-op if empty).
    await expect.poll(() => page.getByTestId('pp-output').inputValue()).not.toBe('');
    const btn = page.getByTestId('copy-output');
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: '✅', revert: '📋' });
  });

  // ---------------------------------------------------------------------------
  // Stats line.
  // ---------------------------------------------------------------------------
  test('stats line reports bytes saved on minify', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{\n  "a": 1,\n  "b": [1, 2, 3]\n}');
    const stats = page.getByTestId('pp-stats');
    // Format mode: "in → out" with no savings marker.
    await expect(stats).toContainText('→');

    await page.getByTestId('mode-minify').click();
    await expect(stats).toContainText('−'); // minus sign in the savings clause
    await expect(stats).toContainText('%');
  });

  // ---------------------------------------------------------------------------
  // Stacked layout — Input on top, Output below (on desktop, not side-by-side).
  // ---------------------------------------------------------------------------
  test('the textareas are stacked vertically (input on top, output below)', async ({ page }) => {
    const inBox = await page.getByTestId('pp-input').boundingBox();
    const outBox = await page.getByTestId('pp-output').boundingBox();
    // Output begins at (or below) the bottom of the input → vertical stack, not
    // a side-by-side split.
    expect(outBox.y).toBeGreaterThanOrEqual(inBox.y + inBox.height - 2);
    // The output is much taller than the input (many more rows).
    expect(outBox.height).toBeGreaterThan(inBox.height);
  });

  // ---------------------------------------------------------------------------
  // Stats sit in the OUTPUT label row.
  // ---------------------------------------------------------------------------
  test('the stats line sits next to the Output label (in the output header)', async ({ page }) => {
    const sameHeader = await page.evaluate(() => {
      const stats = document.querySelector('[data-testid="pp-stats"]');
      const header = stats.closest('.panel-header');
      return !!header && !!header.querySelector('label[for="pp-output"]');
    });
    expect(sameHeader).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // In-field copy buttons (controls.css) — output always shown; input revealed
  // only when non-empty.
  // ---------------------------------------------------------------------------
  test('the output copy button lives inside the output field and is always shown', async ({ page }) => {
    const copyOut = page.getByTestId('copy-output');
    await expect(copyOut).toBeVisible();
    const inside = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="copy-output"]');
      const field = btn.closest('.ct-field');
      return !!field && !!field.querySelector('[data-testid="pp-output"]') && btn.classList.contains('ct-copy-btn');
    });
    expect(inside).toBe(true);
  });

  test('the input copy button is hidden when empty and revealed when non-empty', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    const copyIn = page.getByTestId('copy-input');
    // Empty input → hidden.
    await page.getByTestId('clear-input').click();
    await expect(copyIn).toBeHidden();
    // Type something → revealed, inside the input field.
    await page.getByTestId('pp-input').fill('{"a":1}');
    await expect(copyIn).toBeVisible();
    const inside = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="copy-input"]');
      const field = btn.closest('.ct-field');
      return !!field && !!field.querySelector('[data-testid="pp-input"]');
    });
    expect(inside).toBe(true);
    // Clear again → hidden.
    await page.getByTestId('clear-input').click();
    await expect(copyIn).toBeHidden();
  });

  test('the input copy button flashes on copy', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"a":1}');
    const btn = page.getByTestId('copy-input');
    await expect(btn).toBeVisible();
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: '✅', revert: '📋' });
  });

  // ---------------------------------------------------------------------------
  // Load-sample confirm when input is non-empty.
  // ---------------------------------------------------------------------------
  test('Load sample asks for confirmation only when the input is non-empty', async ({ page }) => {
    await page.getByTestId('tab-json').click();

    // Empty input → loads immediately, no confirm dialog.
    await page.getByTestId('load-sample').click();
    await assertConfirmDialog(page, { action: 'none' });
    await expect(page.getByTestId('pp-input')).not.toHaveValue('');

    // Non-empty (now the sample) → clicking again pops the confirm.
    await page.getByTestId('pp-input').fill('{"typed":true}');
    // Cancel keeps the typed content.
    await assertConfirmDialog(page, {
      open: () => page.getByTestId('load-sample').click(),
      action: 'cancel',
    });
    await expect(page.getByTestId('pp-input')).toHaveValue('{"typed":true}');

    // Confirm replaces it with the sample.
    await assertConfirmDialog(page, {
      open: () => page.getByTestId('load-sample').click(),
      action: 'confirm',
    });
    await expect(page.getByTestId('pp-input')).not.toHaveValue('{"typed":true}');
  });

  // ---------------------------------------------------------------------------
  // Clear (no confirm — documented low-stakes carve-out).
  // ---------------------------------------------------------------------------
  test('Clear empties the current tab without a confirm dialog', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"a":1}');
    await page.getByTestId('clear-input').click();
    await assertConfirmDialog(page, { action: 'none' });
    await expect(page.getByTestId('pp-input')).toHaveValue('');
    await expect(page.getByTestId('pp-output')).toHaveValue('');
  });

  // ---------------------------------------------------------------------------
  // Persistence across reload — driven through the UI, then verified after a
  // settle wait (avoids the file:// write-then-reload race, per conventions).
  // ---------------------------------------------------------------------------
  test('tab, mode, indent, SQL case and per-language text persist across reload', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"json":1}');
    await page.getByTestId('tab-sql').click();
    await page.getByTestId('pp-input').fill('select 1');
    await page.getByTestId('sql-keyword-case').selectOption('lower');
    await page.getByTestId('mode-minify').click();

    // Wait until the persisted blob reflects our changes before reloading.
    await settleStorage(page, STORAGE_KEY, {
      timeout: 10000,
      predicate: (p) => p.tab === 'sql' && p.mode === 'minify' &&
        p.sqlKeywordCase === 'lower' && p.inputs && p.inputs.sql === 'select 1' &&
        p.inputs.json === '{"json":1}',
    });
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    // Restored: active tab, mode, SQL case, and each language's text.
    await expect(page.getByTestId('tab-sql')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('mode-minify')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pp-input')).toHaveValue('select 1');
    await expect(page.getByTestId('sql-keyword-case')).toHaveValue('lower');
    await page.getByTestId('tab-json').click();
    await expect(page.getByTestId('pp-input')).toHaveValue('{"json":1}');
  });

  // ---------------------------------------------------------------------------
  // Test hook sanity.
  // ---------------------------------------------------------------------------
  test('window.__prettyPrinter exposes the pure engines and live state', async ({ page }) => {
    await assertHookShape(page, '__prettyPrinter', { formatJSON: 'function', minifyJS: 'function', tokenizeJS: 'function', state: 'object' });
    const shape = await page.evaluate(() => {
      const p = window.__prettyPrinter;
      return {
        json: p.minifyJSON('{ "a": 1 }'),
      };
    });
    expect(shape.json).toBe('{"a":1}');
  });

  test('every language <select> carries the base.css chevron fix', async ({ page }) => {
    const bg = await page.getByTestId('indent-select').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).not.toBe('none');
  });
});

// -----------------------------------------------------------------------------
// Wide viewport — the app uses the available width (scales up past the old cap).
// -----------------------------------------------------------------------------
test.describe('wide viewport (1600px)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the working area fills the width and the page does not overflow', async ({ page }) => {
    // The app wrapper is materially wider than the old 1000px cap.
    const app = await page.locator('.app').boundingBox();
    expect(app.width).toBeGreaterThan(1200);
    // No horizontal page overflow at a wide viewport.
    await expectNoOverflow(page, { tolerance: 1 });
    // The output textarea widens well past the old narrow column.
    const box = await page.getByTestId('pp-output').boundingBox();
    expect(box.width).toBeGreaterThan(1100);
  });
});

// -----------------------------------------------------------------------------
// Mobile viewport — no horizontal overflow at ~375px.
// -----------------------------------------------------------------------------
test.describe('mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await expectNoOverflow(page, { tolerance: 1 });
  });

  test('the tool still formats on mobile', async ({ page }) => {
    await page.getByTestId('tab-json').click();
    await page.getByTestId('pp-input').fill('{"a":1}');
    // A textarea's value must be read via toHaveValue/inputValue (toContainText
    // reads textContent, which stays empty for a JS-populated <textarea>).
    await expect(page.getByTestId('pp-output')).toHaveValue('{\n  "a": 1\n}');
    // Output textarea stays within the viewport width.
    const box = await page.getByTestId('pp-output').boundingBox();
    expect(box.width).toBeLessThanOrEqual(375 + 1);
  });
});
