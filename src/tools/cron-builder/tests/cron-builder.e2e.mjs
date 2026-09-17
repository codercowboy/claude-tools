// @playwright/test spec for tools/cron-builder/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the
// window.__cronBuilder test API described in DESIGN.md § "Conventions honored".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/cron-builder/).

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';
import { assertLicenseModal } from '../../test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// First-load Help popup auto-shows once, keyed off localStorage
// "cron-builder:help-seen:v1". Every test EXCEPT the dedicated "first-load
// help" suite pre-seeds that key via the shared seedHelpSeen (an addInitScript,
// set before the page's own module runs) so the auto-shown modal never
// interferes.
const HELP_SEEN_KEY = helpSeenKey('cron-builder');
const STORAGE_KEY = 'cron-builder:v1';

// -----------------------------------------------------------------------------
// Help modal — genuine first-load in a fresh context (NOT pre-seeded).
// -----------------------------------------------------------------------------
test.describe('first-load Help popup', () => {
  test('auto-shows once on a genuinely fresh visit, then stays closed on reload', async ({ browser }) => {
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

// -----------------------------------------------------------------------------
// Help modal close paths / focus behavior (pre-seeded; open via ? button).
// -----------------------------------------------------------------------------
test.describe('Help modal: close paths, focus trap & focus return', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('✕ button closes and focus returns to the ? trigger', async ({ page }) => {
    const helpBtn = page.getByTestId('help-button');
    await helpBtn.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    await page.getByTestId('modal-close-x').click();
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpBtn).toBeFocused();
  });

  test('Esc closes the modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('backdrop click closes the modal; a click inside the dialog does not', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    await page.getByTestId('help-modal').click({ position: { x: 10, y: 10 } });
    await expect(overlay).toBeVisible();

    await overlay.click({ position: { x: 2, y: 2 } });
    await expect(overlay).toBeHidden();
  });

  test('Tab keeps focus within the dialog (focus trap)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    await page.keyboard.press('Tab');
    const trapped = await page.evaluate(() => {
      const dlg = document.querySelector('[data-testid="help-modal"]');
      return dlg.contains(document.activeElement);
    });
    expect(trapped).toBe(true);

    await page.keyboard.press('Shift+Tab');
    const stillTrapped = await page.evaluate(() => {
      const dlg = document.querySelector('[data-testid="help-modal"]');
      return dlg.contains(document.activeElement);
    });
    expect(stillTrapped).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Shared setup for the feature tests: pre-seed help-seen and start from a
// known default expression.
// -----------------------------------------------------------------------------
test.describe('feature tests', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // Default render
  // ---------------------------------------------------------------------------
  test.describe('default render', () => {
    test('loads the default weekdays-9am expression and its five field cards', async ({ page }) => {
      await expect(page.getByTestId('cron-input')).toHaveValue('0 9 * * 1-5');
      for (const key of ['minute', 'hour', 'dom', 'month', 'dow']) {
        await expect(page.getByTestId(`fieldcard-${key}`)).toBeVisible();
      }
      // No seconds card in 5-field mode.
      await expect(page.getByTestId('fieldcard-second')).toHaveCount(0);
      await expect(page.getByTestId('cron-description')).toHaveText('At 09:00, on Monday through Friday');
    });
  });

  // ---------------------------------------------------------------------------
  // Two-way sync: raw -> pickers
  // ---------------------------------------------------------------------------
  test.describe('two-way sync: raw expression -> field pickers', () => {
    test('editing the raw box updates every field picker mode and its inputs', async ({ page }) => {
      await page.getByTestId('cron-input').fill('*/15 3-5 1,15 * MON-FRI');

      // minute: */15 -> step mode with step 15
      await expect(page.getByTestId('mode-minute')).toHaveValue('step');
      await expect(page.getByTestId('step-minute')).toHaveValue('15');

      // hour: 3-5 -> range mode with endpoints 3 and 5
      await expect(page.getByTestId('mode-hour')).toHaveValue('range');
      await expect(page.getByTestId('range-from-hour')).toHaveValue('3');
      await expect(page.getByTestId('range-to-hour')).toHaveValue('5');

      // dom: 1,15 -> specific mode with the list text
      await expect(page.getByTestId('mode-dom')).toHaveValue('specific');
      await expect(page.getByTestId('specific-dom')).toHaveValue('1,15');

      // month: * -> every
      await expect(page.getByTestId('mode-month')).toHaveValue('every');

      // dow: MON-FRI -> range with numeric endpoints 1..5
      await expect(page.getByTestId('mode-dow')).toHaveValue('range');
      await expect(page.getByTestId('range-from-dow')).toHaveValue('1');
      await expect(page.getByTestId('range-to-dow')).toHaveValue('5');
    });

    test('a day-of-week range ending in 7 (Sunday alias) falls back to Custom, no corruption', async ({ page }) => {
      // dow `5-7` (Fri–Sun) is valid, but the enum range picker has no option
      // for 7, so the field must fall back to the Custom editor rather than
      // blanking a <select> and assembling a malformed `5-`.
      await page.getByTestId('cron-input').fill('0 0 * * 5-7');
      await expect(page.getByTestId('mode-dow')).toHaveValue('custom');
      await expect(page.getByTestId('custom-dow')).toHaveValue('5-7');
      await expect(page.getByTestId('cron-error')).toBeHidden();

      // An unrelated picker edit must not corrupt the day-of-week field.
      await page.getByTestId('mode-minute').selectOption('step');
      await expect(page.getByTestId('cron-input')).toHaveValue('*/1 0 * * 5-7');
      await expect(page.getByTestId('cron-error')).toBeHidden();
    });

    test('specific dow uses named checkboxes that reflect the raw value', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 0 * * SUN,WED');
      await expect(page.getByTestId('mode-dow')).toHaveValue('specific');
      await expect(page.getByTestId('spec-dow-0')).toBeChecked(); // SUN
      await expect(page.getByTestId('spec-dow-3')).toBeChecked(); // WED
      await expect(page.getByTestId('spec-dow-1')).not.toBeChecked(); // MON
    });
  });

  // ---------------------------------------------------------------------------
  // Two-way sync: pickers -> raw
  // ---------------------------------------------------------------------------
  test.describe('two-way sync: field pickers -> raw expression', () => {
    test('changing a picker mode + value rewrites the raw expression', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 0 * * *');

      // Switch minute to a step of 15.
      await page.getByTestId('mode-minute').selectOption('step');
      await page.getByTestId('step-minute').fill('15');
      await expect(page.getByTestId('cron-input')).toHaveValue('*/15 0 * * *');
      // Hour stays a single 0, so the explainer keeps its "past hour 0" clause.
      await expect(page.getByTestId('cron-description')).toHaveText('Every 15th minute, past hour 0');
    });

    test('picking specific day-of-week checkboxes writes a numeric list', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 0 * * *');
      await page.getByTestId('mode-dow').selectOption('specific');
      await page.getByTestId('spec-dow-1').check(); // MON
      await page.getByTestId('spec-dow-5').check(); // FRI
      await expect(page.getByTestId('cron-input')).toHaveValue('0 0 * * 1,5');
    });
  });

  // ---------------------------------------------------------------------------
  // Explainer + OR note
  // ---------------------------------------------------------------------------
  test.describe('explainer', () => {
    test('updates live and shows the dom/dow OR note only when both are restricted', async ({ page }) => {
      // Only dow restricted -> no OR note.
      await page.getByTestId('cron-input').fill('0 9 * * 1-5');
      await expect(page.getByTestId('cron-description')).toHaveText('At 09:00, on Monday through Friday');
      await expect(page.getByTestId('dom-dow-note')).toBeHidden();

      // Both dom and dow restricted -> OR note + "or" wording.
      await page.getByTestId('cron-input').fill('0 0 13 * 5');
      await expect(page.getByTestId('cron-description')).toHaveText('At 00:00, on day 13 of the month or on Friday');
      await expect(page.getByTestId('dom-dow-note')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Next runs
  // ---------------------------------------------------------------------------
  test.describe('next runs', () => {
    test('renders a list of upcoming times with a timezone note', async ({ page }) => {
      await page.getByTestId('cron-input').fill('*/15 * * * *');
      await expect(page.getByTestId('next-run-0')).toBeVisible();
      await expect(page.locator('[data-testid^="next-run-"]')).toHaveCount(5);
      await expect(page.getByTestId('next-run-0')).not.toHaveText('');
      await expect(page.getByTestId('tz-note')).toContainText('local time zone');
      await expect(page.getByTestId('runs-empty')).toBeHidden();
    });

    test('an impossible expression shows the empty note instead of runs', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 0 30 2 *');
      await expect(page.getByTestId('runs-empty')).toBeVisible();
      await expect(page.locator('[data-testid^="next-run-"]')).toHaveCount(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------
  test.describe('presets', () => {
    test('choosing a preset fills the expression and re-derives everything', async ({ page }) => {
      await page.getByTestId('preset-select').selectOption('*/15 * * * *');
      await expect(page.getByTestId('cron-input')).toHaveValue('*/15 * * * *');
      await expect(page.getByTestId('cron-description')).toHaveText('Every 15th minute');
      // The select resets to its placeholder after applying.
      await expect(page.getByTestId('preset-select')).toHaveValue('');
    });
  });

  // ---------------------------------------------------------------------------
  // Flavor selector — the new field layout / numbering / special-char driver.
  // ---------------------------------------------------------------------------
  test.describe('flavor selector', () => {
    test('defaults to Standard / Unix (5 fields, no seconds card)', async ({ page }) => {
      await expect(page.getByTestId('flavor-select')).toHaveValue('standard');
      await expect(page.locator('[data-testid^="fieldcard-"]')).toHaveCount(5);
      await expect(page.getByTestId('fieldcard-second')).toHaveCount(0);
    });

    test('Unix with seconds adds a leading seconds field and rewrites the raw expr', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 9 * * 1-5');
      await page.getByTestId('flavor-select').selectOption('unixSeconds');

      await expect(page.getByTestId('fieldcard-second')).toBeVisible();
      await expect(page.locator('[data-testid^="fieldcard-"]')).toHaveCount(6);
      await expect(page.getByTestId('cron-input')).toHaveValue('0 0 9 * * 1-5');

      // Back to standard removes the seconds field.
      await page.getByTestId('flavor-select').selectOption('standard');
      await expect(page.getByTestId('fieldcard-second')).toHaveCount(0);
      await expect(page.getByTestId('cron-input')).toHaveValue('0 9 * * 1-5');
      await expect(page.locator('[data-testid^="fieldcard-"]')).toHaveCount(5);
    });

    test('switching to Quartz converts field count, dow numbering, and the explainer', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 9 * * 1-5');
      await expect(page.getByTestId('cron-description')).toHaveText('At 09:00, on Monday through Friday');

      await page.getByTestId('flavor-select').selectOption('quartz');
      // 6 fields now (seconds-leading), a `?` inserted, and dow renumbered to 2-6.
      await expect(page.getByTestId('fieldcard-second')).toBeVisible();
      await expect(page.getByTestId('cron-input')).toHaveValue('0 0 9 ? * 2,3,4,5,6');
      // The explainer still reads as Monday–Friday in the new flavor.
      await expect(page.getByTestId('cron-description')).toContainText('Monday');
      await expect(page.getByTestId('cron-description')).toContainText('Friday');
      await expect(page.getByTestId('cron-error')).toBeHidden();
      // No crash and the field legend reflects the new order.
      await expect(page.getByTestId('field-legend')).toContainText('second');
    });

    test('switching to AWS EventBridge appends a year field', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 9 * * 1-5');
      await page.getByTestId('flavor-select').selectOption('aws');
      await expect(page.getByTestId('fieldcard-year')).toBeVisible();
      await expect(page.getByTestId('fieldcard-second')).toHaveCount(0);
      const val = await page.getByTestId('cron-input').inputValue();
      expect(val.split(/\s+/).length).toBe(6);
      await expect(page.getByTestId('cron-error')).toBeHidden();
    });

    test('typing a Quartz `0 0 12 ? * 6#3` expression explains the 3rd Friday', async ({ page }) => {
      await page.getByTestId('flavor-select').selectOption('quartz');
      await page.getByTestId('cron-input').fill('0 0 12 ? * 6#3');
      await expect(page.getByTestId('cron-error')).toBeHidden();
      await expect(page.getByTestId('cron-description')).toHaveText('At 12:00:00, on the 3rd Friday of the month');
      // The day-of-week field falls to the Custom editor (special token).
      await expect(page.getByTestId('mode-dow')).toHaveValue('custom');
      await expect(page.getByTestId('custom-dow')).toHaveValue('6#3');
      // And the next-runs preview lands on a Friday.
      await expect(page.getByTestId('next-run-0')).toContainText('Fri');
    });

    test('Quartz rejects an expression with neither dom nor dow set to `?`', async ({ page }) => {
      await page.getByTestId('flavor-select').selectOption('quartz');
      await page.getByTestId('cron-input').fill('0 0 12 * * *');
      await expect(page.getByTestId('cron-error')).toBeVisible();
      await expect(page.getByTestId('cron-error')).toContainText('exactly one');
    });

    test('L / W / # tokens are rejected in Standard / Unix with a per-flavor message', async ({ page }) => {
      await expect(page.getByTestId('flavor-select')).toHaveValue('standard');
      await page.getByTestId('cron-input').fill('0 0 L * *');
      await expect(page.getByTestId('cron-error')).toBeVisible();
      await expect(page.getByTestId('cron-error')).toContainText('does not support');
    });
  });

  // ---------------------------------------------------------------------------
  // Standard control heights (controls.css — 44px --control-h).
  // ---------------------------------------------------------------------------
  test.describe('controls.css standard heights', () => {
    test('the flavor select, preset select, raw input, and copy button share 44px', async ({ page }) => {
      const targets = [
        page.getByTestId('flavor-select'),
        page.getByTestId('preset-select'),
        page.getByTestId('cron-input'),
        page.getByTestId('cron-copy'),
      ];
      for (const t of targets) {
        const box = await t.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // The chevron isn't overlapped: the flavor select is wide enough for its
      // longest option and reserves its right padding (padding-right >= 2rem).
      const padRight = await page.getByTestId('flavor-select').evaluate(
        (el) => parseFloat(getComputedStyle(el).paddingRight)
      );
      expect(padRight).toBeGreaterThanOrEqual(28); // ~2rem at 16px root
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid input
  // ---------------------------------------------------------------------------
  test.describe('invalid input', () => {
    test('shows a friendly error without crashing, and recovers', async ({ page }) => {
      await page.getByTestId('cron-input').fill('60 * * * *');
      await expect(page.getByTestId('cron-error')).toBeVisible();
      await expect(page.getByTestId('cron-error')).toContainText('out of range');

      // The page is still responsive: fix it and the error clears.
      await page.getByTestId('cron-input').fill('0 9 * * 1-5');
      await expect(page.getByTestId('cron-error')).toBeHidden();
      await expect(page.getByTestId('cron-description')).toHaveText('At 09:00, on Monday through Friday');
    });

    test('unsupported L/W/# tokens report a per-flavor "does not support" message', async ({ page }) => {
      await page.getByTestId('cron-input').fill('0 0 L * *');
      await expect(page.getByTestId('cron-error')).toBeVisible();
      await expect(page.getByTestId('cron-error')).toContainText('does not support');
    });
  });

  // ---------------------------------------------------------------------------
  // Copy flashes
  // ---------------------------------------------------------------------------
  test.describe('copy buttons', () => {
    test('the expression copy button flashes a checkmark and reverts', async ({ page }) => {
      const btn = page.getByTestId('cron-copy');
      await expect(btn).toHaveText('📋');
      await btn.click();
      await expect(btn).toHaveText('✅');
      await expect(btn).toHaveText('📋', { timeout: 3000 });
    });

    test('"Copy all" for the run list flashes its label and reverts', async ({ page }) => {
      const btn = page.getByTestId('runs-copy-all');
      await expect(btn).toHaveText('Copy all');
      await btn.click();
      await expect(btn).toHaveText('Copied!');
      await expect(btn).toHaveText('Copy all', { timeout: 3000 });
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  test.describe('localStorage persistence', () => {
    test('expression + flavor are written to localStorage', async ({ page }) => {
      await page.getByTestId('cron-input').fill('*/15 * * * *');
      await page.getByTestId('flavor-select').selectOption('unixSeconds');

      const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
      expect(saved.flavor).toBe('unixSeconds');
      // Switching flavor prepends a seconds field to the current expression.
      expect(saved.expr).toBe('0 */15 * * * *');
    });

    test('flavor + expression are restored on reload', async ({ page }) => {
      await page.getByTestId('flavor-select').selectOption('quartz');
      await page.getByTestId('cron-input').fill('0 0 12 ? * 6#3');
      // Small settle to avoid the file:// write-then-reload race (conventions).
      await page.waitForTimeout(400);
      await page.reload();
      await expect(page.getByTestId('help-overlay')).toBeHidden();
      await expect(page.getByTestId('flavor-select')).toHaveValue('quartz');
      await expect(page.getByTestId('cron-input')).toHaveValue('0 0 12 ? * 6#3');
      await expect(page.getByTestId('cron-description')).toHaveText('At 12:00:00, on the 3rd Friday of the month');
    });

    test('a legacy { seconds:true } stored state loads as Unix-with-seconds', async ({ page, context }) => {
      // Pre-flavor persistence shape must degrade gracefully to the new flavor.
      await context.addInitScript(([sk, hk]) => {
        try {
          localStorage.setItem(sk, JSON.stringify({ expr: '30 0 12 * * *', seconds: true }));
          localStorage.setItem(hk, '1');
        } catch { /* ignore */ }
      }, [STORAGE_KEY, HELP_SEEN_KEY]);
      await page.goto(TOOL_URL);
      await expect(page.getByTestId('flavor-select')).toHaveValue('unixSeconds');
      await expect(page.getByTestId('cron-input')).toHaveValue('30 0 12 * * *');
    });
  });

  // ---------------------------------------------------------------------------
  // Test hook sanity
  // ---------------------------------------------------------------------------
  test('window.__cronBuilder exposes pure functions and live state', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const c = window.__cronBuilder;
      return {
        hasParse: typeof c.parseCron === 'function',
        hasBuild: typeof c.buildCron === 'function',
        hasDescribe: typeof c.describeCron === 'function',
        hasNextRuns: typeof c.nextRuns === 'function',
        hasState: typeof c.state === 'object',
        built: c.buildCron(c.parseCron('@daily')),
        desc: c.describeCron(c.parseCron('0 9 * * 1-5')),
      };
    });
    expect(shape.hasParse).toBe(true);
    expect(shape.hasBuild).toBe(true);
    expect(shape.hasDescribe).toBe(true);
    expect(shape.hasNextRuns).toBe(true);
    expect(shape.hasState).toBe(true);
    expect(shape.built).toBe('0 0 * * *');
    expect(shape.desc).toBe('At 09:00, on Monday through Friday');
  });
});

// -----------------------------------------------------------------------------
// Shared footer License modal.
// -----------------------------------------------------------------------------
test.describe('footer License modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('footer carries the MIT License trigger; the modal is hidden until opened', async ({ page }) => {
    const trigger = page.getByTestId('footer-license-link');
    await expect(trigger).toHaveText('MIT License');
    await expect(page.getByTestId('license-overlay')).toBeHidden();
  });

  test('clicking the footer link opens the modal with the MIT text, ✕ and vanilla note', async ({ page }) => {
    await page.getByTestId('footer-license-link').click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText('Permission is hereby granted');
    await expect(page.getByTestId('license-close-x')).toBeVisible();
    await expect(modal).toContainText('100% vanilla');
    await expect(modal).toContainText('no runtime dependencies');
    expect(await page.evaluate(() => typeof window.ctLicense)).toBe('function');
  });

  // Focus into the dialog (the ✕) + Esc / ✕ / backdrop close with focus return
  // are the shared License-modal contract; assert them via the shared helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });

  // Tool-unique negative: a click inside the dialog does NOT close it (the
  // shared helper only asserts the backdrop-click path).
  test('a click inside the dialog does not close the modal', async ({ page }) => {
    await page.getByTestId('footer-license-link').click();
    const overlay = page.getByTestId('license-overlay');
    await expect(overlay).toBeVisible();
    await page.getByTestId('license-modal').click({ position: { x: 10, y: 10 } });
    await expect(overlay).toBeVisible();
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

  test('the page does not scroll horizontally and every card fits', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollW: doc.scrollWidth, clientW: doc.clientWidth };
    });
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);

    for (const id of ['card-expression', 'card-fields', 'card-explain', 'card-runs']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.width).toBeLessThanOrEqual(375 + 1);
    }
  });

  test('still edits and re-derives on mobile', async ({ page }) => {
    await page.getByTestId('cron-input').fill('*/15 * * * *');
    await expect(page.getByTestId('cron-description')).toHaveText('Every 15th minute');
    await expect(page.getByTestId('next-run-0')).toBeVisible();
  });
});
