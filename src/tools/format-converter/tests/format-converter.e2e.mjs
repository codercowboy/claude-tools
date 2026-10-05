// @playwright/test spec for tools/format-converter/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec drives
// the finished page from the outside via data-testid hooks and the
// window.__formatConverter test API described in DESIGN.md § Testability.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/format-converter/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertConfirmDialog } from '../../../lib/test-support/interaction.mjs';
import { settleStorage } from '../../../lib/test-support/storage.mjs';
import { stubClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const STORAGE_KEY = 'format-converter:v1';

// First-load Help popup (docs/conventions.md § "First-load help popup")
// auto-shows once, keyed off localStorage "format-converter:help-seen:v1".
// Every test EXCEPT the dedicated "first-load Help popup" suite pre-seeds that
// key (via addInitScript, before the page script runs, on every navigation
// including reloads) so the auto-shown modal never interferes. Each Playwright
// test runs in its own isolated context, so the tool's own state key starts
// empty naturally — no clearing needed (and clearing it in an addInitScript
// would wipe persisted state on the reload the persistence test depends on).
// The first-load suite deliberately opts out by using its own fresh
// browser.newContext().
const HELP_SEEN_KEY = helpSeenKey('format-converter');

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// Convenience: set From/To selects and wait for the live render.
async function setFromTo(page, from, to) {
  if (from !== undefined) await page.getByTestId('from-format').selectOption(from);
  if (to !== undefined) await page.getByTestId('to-format').selectOption(to);
}

// ---------------------------------------------------------------------------
// 1. Test hooks / pure functions are reachable via window.__formatConverter.
// ---------------------------------------------------------------------------
test.describe('window.__formatConverter test hook', () => {
  test('exposes the documented pure functions and live state', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const ns = window.__formatConverter;
      return {
        hasState: !!ns.state && typeof ns.state === 'object',
        convertOk: ns.convert('a: 1', 'yaml', 'json', { json: { indent: 0 } }).output,
      };
    });
    await assertHookShape(page, '__formatConverter', [
      'parseJSON', 'emitJSON', 'parseYAML', 'emitYAML', 'parseCSV', 'emitCSV',
      'parseTSV', 'emitTSV', 'parseProperties', 'emitProperties', 'parseXML',
      'emitXML', 'detectFormat', 'convert', 'FORMATS',
    ]);
    expect(shape.hasState).toBe(true);
    expect(shape.convertOk).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// 2. Core conversions produce correct output via the live UI.
// ---------------------------------------------------------------------------
test.describe('live conversions', () => {
  test('JSON -> XML', async ({ page }) => {
    await setFromTo(page, 'json', 'xml');
    await page.getByTestId('input').fill('{"note":{"to":"A","body":"hi"}}');
    const out = page.getByTestId('output');
    await expect(out).toHaveValue(/<note>/);
    await expect(out).toHaveValue(/<to>A<\/to>/);
    await expect(out).toHaveValue(/<body>hi<\/body>/);
    await expect(page.getByTestId('error')).toBeHidden();
  });

  test('YAML -> JSON', async ({ page }) => {
    await setFromTo(page, 'yaml', 'json');
    await page.getByTestId('opt-indent').selectOption('0');
    await page.getByTestId('input').fill('name: Ada\nborn: 1815');
    await expect(page.getByTestId('output')).toHaveValue('{"name":"Ada","born":1815}');
  });

  test('JSON -> CSV', async ({ page }) => {
    await setFromTo(page, 'json', 'csv');
    await page.getByTestId('input').fill('[{"a":1,"b":2},{"a":3,"b":4}]');
    await expect(page.getByTestId('output')).toHaveValue('a,b\n1,2\n3,4');
  });

  test('JSON -> .properties', async ({ page }) => {
    await setFromTo(page, 'json', 'properties');
    await page.getByTestId('input').fill('{"a":{"b":"c"},"list":["x","y"]}');
    await expect(page.getByTestId('output')).toHaveValue('a.b=c\nlist.0=x\nlist.1=y');
  });
});

// ---------------------------------------------------------------------------
// 3. Auto-detect + status line.
// ---------------------------------------------------------------------------
test.describe('auto-detect', () => {
  test('detects the source and shows it in the status line', async ({ page }) => {
    await setFromTo(page, 'auto', 'json');
    await page.getByTestId('opt-indent').selectOption('0');
    await page.getByTestId('input').fill('name: Ada\nborn: 1815');
    await expect(page.getByTestId('detect-status')).toContainText('YAML');
    await expect(page.getByTestId('output')).toHaveValue('{"name":"Ada","born":1815}');
  });

  test('unrecognizable input shows a friendly detect message, not a crash', async ({ page }) => {
    await setFromTo(page, 'auto', 'json');
    await page.getByTestId('input').fill('a bare unstructured sentence');
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('error')).toContainText(/auto-detect/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Swap (⇄).
// ---------------------------------------------------------------------------
test.describe('swap', () => {
  test('⇄ swaps From/To and feeds the output back as input (round-trip)', async ({ page }) => {
    await setFromTo(page, 'json', 'yaml');
    await page.getByTestId('input').fill('{"name":"Ada","born":1815}');
    await expect(page.getByTestId('output')).toHaveValue(/name: Ada/);

    await page.getByTestId('swap-btn').click();

    // Now YAML -> JSON, with the previous YAML output as the new input.
    await expect(page.getByTestId('from-format')).toHaveValue('yaml');
    await expect(page.getByTestId('to-format')).toHaveValue('json');
    await expect(page.getByTestId('input')).toHaveValue(/name: Ada/);
    await expect(page.getByTestId('output')).toHaveValue(/"name": "Ada"/);
  });
});

// ---------------------------------------------------------------------------
// 5. Contextual option groups show/hide per format.
// ---------------------------------------------------------------------------
test.describe('contextual option groups', () => {
  test('CSV group shows for a CSV/TSV conversion only', async ({ page }) => {
    await setFromTo(page, 'json', 'csv');
    await expect(page.getByTestId('opt-group-csv')).toBeVisible();
    await expect(page.getByTestId('opt-group-indent')).toBeHidden();

    await setFromTo(page, undefined, 'json');
    await expect(page.getByTestId('opt-group-csv')).toBeHidden();
    await expect(page.getByTestId('opt-group-indent')).toBeVisible();
  });

  test('XML group shows only when the target is XML', async ({ page }) => {
    await setFromTo(page, 'json', 'xml');
    await expect(page.getByTestId('opt-group-xml')).toBeVisible();
    await setFromTo(page, undefined, 'properties');
    await expect(page.getByTestId('opt-group-xml')).toBeHidden();
    await expect(page.getByTestId('opt-group-properties')).toBeVisible();
  });

  test('exactly one relevant group is shown; the empty-options note stays hidden', async ({ page }) => {
    // Every target maps to an option group (indent for json/yaml, csv for
    // csv/tsv, xml for xml, properties for .properties), so the empty-options
    // note is never needed — assert it stays hidden while a real group shows.
    for (const to of ['json', 'yaml', 'csv', 'tsv', 'properties', 'xml']) {
      await setFromTo(page, 'json', to);
      await expect(page.getByTestId('opt-empty')).toBeHidden();
    }
  });

  test('delimiter input disables for TSV (tab is fixed)', async ({ page }) => {
    await setFromTo(page, 'tsv', 'json');
    await expect(page.getByTestId('opt-delimiter')).toBeDisabled();
    await setFromTo(page, 'csv', 'json');
    await expect(page.getByTestId('opt-delimiter')).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 5b. Merged setup card — formats + contextual options share one card, and the
//     selects are wide enough that a long option clears the chevron.
// ---------------------------------------------------------------------------
test.describe('merged setup card', () => {
  test('the From/To selects, swap, and the option groups live in one card', async ({ page }) => {
    const card = page.getByTestId('setup-card');
    await expect(card).toBeVisible();
    for (const id of ['from-format', 'to-format', 'swap-btn', 'options']) {
      await expect(card.getByTestId(id)).toHaveCount(1);
    }
    // The active contextual option group is inside the same card.
    await setFromTo(page, 'json', 'xml');
    await expect(card.getByTestId('opt-group-xml')).toBeVisible();
    await setFromTo(page, undefined, 'csv');
    await expect(card.getByTestId('opt-group-csv')).toBeVisible();
  });

  test('the indent <select> is wide enough for "Minified" and keeps chevron padding', async ({ page }) => {
    await setFromTo(page, 'json', 'json'); // indent group is shown for a JSON target
    const sel = page.getByTestId('opt-indent');
    await expect(sel).toBeVisible();
    await sel.selectOption('0'); // "Minified" — the longest option
    const metrics = await sel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        paddingRight: parseFloat(cs.paddingRight),
      };
    });
    // Widened well beyond the old fixed 5.5rem (88px) so the text isn't clipped…
    expect(metrics.clientWidth).toBeGreaterThanOrEqual(120);
    // …the content box fits with no horizontal clipping…
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    // …and meaningful right padding stays reserved for the chevron (~2rem).
    expect(metrics.paddingRight).toBeGreaterThanOrEqual(24);
  });
});

// ---------------------------------------------------------------------------
// 6. Options affect output.
// ---------------------------------------------------------------------------
test.describe('options affect output', () => {
  test('JSON indent option changes the JSON output', async ({ page }) => {
    await setFromTo(page, 'yaml', 'json');
    await page.getByTestId('input').fill('a: 1');
    await page.getByTestId('opt-indent').selectOption('0');
    await expect(page.getByTestId('output')).toHaveValue('{"a":1}');
    await page.getByTestId('opt-indent').selectOption('2');
    await expect(page.getByTestId('output')).toHaveValue('{\n  "a": 1\n}');
  });

  test('XML declaration toggle adds/removes the prolog', async ({ page }) => {
    await setFromTo(page, 'json', 'xml');
    await page.getByTestId('input').fill('{"a":"1"}');
    await expect(page.getByTestId('output')).toHaveValue(/^<\?xml/);
    await page.getByTestId('opt-xml-decl').uncheck();
    await expect(page.getByTestId('output')).not.toHaveValue(/<\?xml/);
  });

  test('CSV header-row toggle omits the header line', async ({ page }) => {
    await setFromTo(page, 'json', 'csv');
    await page.getByTestId('input').fill('[{"a":1,"b":2}]');
    await expect(page.getByTestId('output')).toHaveValue('a,b\n1,2');
    await page.getByTestId('opt-header').uncheck();
    await expect(page.getByTestId('output')).toHaveValue('1,2');
  });
});

// ---------------------------------------------------------------------------
// 7. Invalid input shows a friendly error without crashing.
// ---------------------------------------------------------------------------
test.describe('error handling', () => {
  test('invalid JSON shows a friendly error and clears output', async ({ page }) => {
    await setFromTo(page, 'json', 'yaml');
    await page.getByTestId('input').fill('{ not valid json');
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('error')).toContainText(/Invalid JSON/);
    await expect(page.getByTestId('output')).toHaveValue('');
    // The page is still alive and responsive afterwards.
    await page.getByTestId('input').fill('{"ok":true}');
    await expect(page.getByTestId('error')).toBeHidden();
    await expect(page.getByTestId('output')).toHaveValue(/ok: true/);
  });

  test('impossible mapping (nested object -> CSV) shows a friendly error', async ({ page }) => {
    await setFromTo(page, 'json', 'csv');
    await page.getByTestId('input').fill('"just a string"');
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('error')).toContainText(/tabular/i);
  });

  test('unsupported YAML (anchor) shows the documented rejection', async ({ page }) => {
    await setFromTo(page, 'yaml', 'json');
    await page.getByTestId('input').fill('a: &x 1\nb: 2');
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('error')).toContainText(/anchors/i);
  });
});

// ---------------------------------------------------------------------------
// 8. In-field copy (controls.css .ct-copy-btn on both textareas).
// ---------------------------------------------------------------------------
test.describe('in-field copy', () => {
  test('output copy button lives inside the textarea field and flashes ✅', async ({ page }) => {
    await setFromTo(page, 'json', 'yaml');
    await page.getByTestId('input').fill('{"a":1}');
    await expect(page.getByTestId('output')).toHaveValue(/a: 1/);
    const copyBtn = page.getByTestId('copy-btn');
    // In-field: the button is a child of the same .ct-field as the output textarea.
    const insideField = await copyBtn.evaluate((btn) => {
      const field = btn.closest('.ct-field');
      return !!field && !!field.querySelector('textarea[data-testid="output"]');
    });
    expect(insideField).toBe(true);
    await expect(copyBtn).toBeVisible();
    await stubClipboard(page);
    await expectCopyFlash(copyBtn, { flash: '✅', revert: '📋' });
  });

  test('input copy button reveals only when the input is non-empty', async ({ page }) => {
    const inputCopy = page.getByTestId('input-copy-btn');
    // Hidden on a fresh (empty) input.
    await expect(inputCopy).toBeHidden();
    await page.getByTestId('input').fill('{"a":1}');
    await expect(inputCopy).toBeVisible();
    // It copies and flashes like the output one.
    await stubClipboard(page);
    await expectCopyFlash(inputCopy, { flash: '✅', revert: '📋' });
    // Clearing the field hides it again (no icon floating over the placeholder).
    await page.getByTestId('input').fill('');
    await expect(inputCopy).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 9. Sample + Clear confirmDialog guard.
// ---------------------------------------------------------------------------
test.describe('Sample and Clear (confirmDialog guard)', () => {
  test('Sample loads an example for the current source format', async ({ page }) => {
    await setFromTo(page, 'json', 'yaml');
    await page.getByTestId('sample-btn').click();
    await expect(page.getByTestId('input')).toHaveValue(/Ada Lovelace/);
    await expect(page.getByTestId('output')).toHaveValue(/name: Ada Lovelace/);
  });

  test('Clear on a non-empty input confirms; Cancel keeps the content', async ({ page }) => {
    await page.getByTestId('input').fill('{"keep":true}');
    await page.getByTestId('clear-btn').click();
    // confirmDialog modal appears; Cancel leaves the input intact.
    await assertConfirmDialog(page, { text: 'Clear the input', action: 'cancel' });
    await expect(page.getByTestId('input')).toHaveValue('{"keep":true}');
  });

  test('Clear on a non-empty input confirms; Yes empties it', async ({ page }) => {
    await page.getByTestId('input').fill('{"discard":true}');
    await page.getByTestId('clear-btn').click();
    await assertConfirmDialog(page, { text: 'Clear the input', action: 'confirm' });
    await expect(page.getByTestId('input')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 10. Persistence across reload (via the tool's own state + hooks).
// ---------------------------------------------------------------------------
test.describe('persistence', () => {
  test('input, From/To, and options survive a reload', async ({ page }) => {
    await setFromTo(page, 'json', 'csv');
    await page.getByTestId('input').fill('[{"a":1,"b":2}]');
    await page.getByTestId('opt-header').uncheck();
    await expect(page.getByTestId('output')).toHaveValue('1,2');

    // Wait for the file:// storage write to land before reloading.
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.from === 'json' && v.to === 'csv' && v.input === '[{"a":1,"b":2}]' });
    await page.reload();

    await expect(page.getByTestId('from-format')).toHaveValue('json');
    await expect(page.getByTestId('to-format')).toHaveValue('csv');
    await expect(page.getByTestId('input')).toHaveValue('[{"a":1,"b":2}]');
    await expect(page.getByTestId('opt-header')).not.toBeChecked();
    await expect(page.getByTestId('output')).toHaveValue('1,2');
  });
});

// ---------------------------------------------------------------------------
// 11. Mobile viewport — no horizontal overflow, real taps.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true });

  test('no horizontal page overflow at 375px with a populated conversion', async ({ page }) => {
    await setFromTo(page, 'json', 'xml');
    await page.getByTestId('input').fill('{"note":{"to":"someone","body":"a longer message body here"}}');
    await expect(page.getByTestId('output')).toHaveValue(/<note>/);
    await expectNoOverflow(page);
  });

  test('real tap on the format selects works on mobile', async ({ page }) => {
    await page.getByTestId('from-format').selectOption('yaml');
    await page.getByTestId('to-format').selectOption('json');
    await page.getByTestId('input').tap();
    await page.getByTestId('input').fill('a: 1');
    await expect(page.getByTestId('output')).toHaveValue(/"a": 1/);
  });
});

// ---------------------------------------------------------------------------
// 12. First-load Help popup — auto-shows once, modal a11y, close paths.
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
});

// ---------------------------------------------------------------------------
// Footer License modal — the shared license surface (docs/conventions.md
// § "License surface"). Built into every artifact for free via the shared
// footer include (footer.html + lib/components/CtLicense.mjs): a footer "MIT License"
// link opens an accessible modal showing the full MIT text and, for a
// dependency-free tool, the "100% vanilla" note. Same accessible pattern as
// Help: role=dialog, focus-in-on-open / return-on-close, Esc/✕/backdrop close.
// Driven via the footer [data-ct-license] trigger. (The top-level
// beforeEach pre-seeds help-seen and navigates, so the footer is reachable.)
// ---------------------------------------------------------------------------
test.describe('footer License modal', () => {
  test('footer carries a License trigger that opens the modal with MIT text + ✕', async ({ page }) => {
    const trigger = page.getByTestId('footer-license-link');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText('MIT License');

    await expect(page.getByTestId('license-modal')).toBeHidden();
    await trigger.click();

    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText('Permission is hereby granted');
    await expect(modal).toContainText('THE SOFTWARE IS PROVIDED "AS IS"');
    await expect(page.getByTestId('license-close-x')).toBeVisible();
  });

  test('a dependency-free tool shows the "100% vanilla, no dependencies" note', async ({ page }) => {
    await page.locator('[data-ct-license]').click();
    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('100% vanilla');
    await expect(modal).toContainText('no runtime dependencies');
  });

  // Initial focus on the ✕ + Esc / ✕ / backdrop close with focus-return are the
  // shared License-modal contract; assert them via the shared helper.
  test('opens, focuses the ✕, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('focus is trapped inside the dialog while open', async ({ page }) => {
    await page.locator('[data-ct-license]').click();
    await expect(page.getByTestId('license-close-x')).toBeFocused();
    await page.keyboard.press('Tab');
    let inside = await page.evaluate(() =>
      document.querySelector('[data-testid="license-modal"]').contains(document.activeElement));
    expect(inside).toBe(true);
    await page.keyboard.press('Shift+Tab');
    inside = await page.evaluate(() =>
      document.querySelector('[data-testid="license-modal"]').contains(document.activeElement));
    expect(inside).toBe(true);
  });
});
