// @playwright/test spec for tools/diff-viewer/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec drives
// the finished page from the outside via data-testid hooks and the
// window.__diffViewer test API described in DESIGN.md § Testability.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/diff-viewer/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { settleStorage, readStored } from '../../../lib/test-support/storage.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertConfirmDialog } from '../../../lib/test-support/interaction.mjs';
import { stubClipboard, readClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// The live diff render is debounced ~150ms (app.mjs § 5). Give real-typing
// tests comfortable headroom.
const DEBOUNCE_WAIT = 300;

// First-load Help popup (docs/conventions.md § "First-load help popup") auto-
// shows once, keyed off localStorage "diff-viewer:help-seen:v1". Every test in
// this file EXCEPT the dedicated "first-load Help popup" suite pre-seeds that
// key (via addInitScript, so it's set before the page's own script runs) so the
// auto-shown modal never interferes with unrelated assertions. That suite opens
// its own fresh browser.newContext() so the key is truly absent.
const HELP_SEEN_KEY = helpSeenKey('diff-viewer');
const STORAGE_KEY = 'diff-viewer:v1';

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// Prefer the tool's own hooks over typing+debounce where we only need the
// engine's result to appear on screen.
async function setInputs(page, a, b) {
  await page.evaluate(([aa, bb]) => window.__diffViewer.setInputs(aa, bb), [a, b]);
}

// ---------------------------------------------------------------------------
// 1. Pure functions reachable via window.__diffViewer (smoke; the exhaustive
//    coverage is in tests/unit/*.test.mjs). Confirms the shipped page inlines
//    the same engine.
// ---------------------------------------------------------------------------
test.describe('window.__diffViewer engine is wired into the page', () => {
  test('exposes the pure functions and entry points', async ({ page }) => {
    await assertHookShape(page, '__diffViewer', {
      state: 'object', diffLines: 'function', diffWords: 'function', toUnifiedDiff: 'function',
      splitLines: 'function', normalizeLine: 'function', myersDiff: 'function', tokenizeWords: 'function',
      setInputs: 'function', setView: 'function', setOption: 'function', render: 'function',
    });
  });

  test('diffLines / toUnifiedDiff produce correct results in-page', async ({ page }) => {
    const out = await page.evaluate(() => {
      const stats = window.__diffViewer.diffLines('a\nb\nc', 'a\nX\nc').stats;
      const unified = window.__diffViewer.toUnifiedDiff('a\nb\nc', 'a\nX\nc', {}, { aName: 'A', bName: 'B' });
      return { stats, unified };
    });
    expect(out.stats).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(out.unified).toContain('@@ ');
    expect(out.unified).toContain('-b');
    expect(out.unified).toContain('+X');
  });
});

// ---------------------------------------------------------------------------
// 2. Entering A/B renders a diff (side-by-side + stats).
// ---------------------------------------------------------------------------
test.describe('entering A and B renders a diff', () => {
  test('typing two texts shows added / removed / changed rows and stats', async ({ page }) => {
    await page.getByTestId('input-a').fill('alpha\nbeta\ngamma');
    await page.getByTestId('input-b').fill('alpha\nBETA\ngamma\ndelta');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const split = page.getByTestId('diff-split');
    await expect(split).toBeVisible();
    // A replaced line (beta -> BETA) and an inserted line (delta).
    await expect(split.locator('.r-chg')).toHaveCount(1);
    await expect(split.locator('.r-add')).toHaveCount(1);

    const stats = page.getByTestId('stats');
    await expect(stats).toContainText('1 added');
    await expect(stats).toContainText('0 removed');
    await expect(stats).toContainText('1 changed');
  });

  test('identical inputs report "No differences" and disable copy', async ({ page }) => {
    await setInputs(page, 'same\ntext', 'same\ntext');
    await expect(page.getByTestId('stats')).toHaveText('No differences.');
    await expect(page.getByTestId('copy-unified-btn')).toBeDisabled();
  });

  test('empty inputs show the prompt and an empty-state message', async ({ page }) => {
    await setInputs(page, '', '');
    await expect(page.getByTestId('stats')).toContainText('Enter text in A and B');
    await expect(page.getByTestId('copy-unified-btn')).toBeDisabled();
  });

  test('changed lines get word-level highlighting', async ({ page }) => {
    await setInputs(page, 'the quick brown fox', 'the slow brown fox');
    const split = page.getByTestId('diff-split');
    // The word that changed is wrapped in wd-del / wd-ins spans.
    await expect(split.locator('.wd-del')).toHaveCount(1);
    await expect(split.locator('.wd-ins')).toHaveCount(1);
    await expect(split.locator('.wd-del').first()).toContainText('quick');
    await expect(split.locator('.wd-ins').first()).toContainText('slow');
  });

  test('swap (⇄) exchanges A and B', async ({ page }) => {
    await setInputs(page, 'AAA', 'BBB');
    await page.getByTestId('swap-btn').click();
    await expect(page.getByTestId('input-a')).toHaveValue('BBB');
    await expect(page.getByTestId('input-b')).toHaveValue('AAA');
  });
});

// ---------------------------------------------------------------------------
// 3. View toggle: side-by-side <-> inline/unified.
// ---------------------------------------------------------------------------
test.describe('view toggle', () => {
  test('switching to Inline hides the split view and shows the inline view', async ({ page }) => {
    await setInputs(page, 'a\nb\nc', 'a\nX\nc');
    const splitBtn = page.getByTestId('view-split-btn');
    const inlineBtn = page.getByTestId('view-inline-btn');

    // Default is side-by-side.
    await expect(splitBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('diff-split')).toBeVisible();
    await expect(page.getByTestId('diff-inline')).toBeHidden();

    await inlineBtn.click();
    await expect(inlineBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(splitBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('diff-inline')).toBeVisible();
    await expect(page.getByTestId('diff-split')).toBeHidden();

    // Inline view renders +/− sign cells.
    const inline = page.getByTestId('diff-inline');
    await expect(inline.locator('.r-del')).toHaveCount(1);
    await expect(inline.locator('.r-add')).toHaveCount(1);

    // Toggle back.
    await splitBtn.click();
    await expect(splitBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('diff-split')).toBeVisible();
    await expect(page.getByTestId('diff-inline')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 4. Each option toggle changes the output.
// ---------------------------------------------------------------------------
test.describe('diff options affect the result', () => {
  test('ignore leading/trailing whitespace collapses a trim-only change', async ({ page }) => {
    await setInputs(page, '  hello  \nworld', 'hello\nworld');
    await expect(page.getByTestId('stats')).toContainText('1 changed');

    await page.getByTestId('opt-trim').check();
    await expect(page.getByTestId('stats')).toHaveText('No differences.');
  });

  test('ignore all whitespace collapses an interior spacing change and disables trim', async ({ page }) => {
    await setInputs(page, 'a  b', 'a b');
    await expect(page.getByTestId('stats')).toContainText('1 changed');

    await page.getByTestId('opt-all-ws').check();
    await expect(page.getByTestId('stats')).toHaveText('No differences.');
    // "ignore all whitespace" subsumes the trim option -> trim gets disabled.
    await expect(page.getByTestId('opt-trim')).toBeDisabled();
  });

  test('ignore case collapses a case-only change', async ({ page }) => {
    await setInputs(page, 'Hello\nWorld', 'hello\nworld');
    await expect(page.getByTestId('stats')).toContainText('2 changed');

    await page.getByTestId('opt-case').check();
    await expect(page.getByTestId('stats')).toHaveText('No differences.');
  });
});

// ---------------------------------------------------------------------------
// 5. Copy unified diff flashes success.
// ---------------------------------------------------------------------------
test.describe('copy unified diff', () => {
  test('clicking copy flashes a confirmation label', async ({ page }) => {
    await setInputs(page, 'a\nb\nc', 'a\nX\nc');
    const btn = page.getByTestId('copy-unified-btn');
    await expect(btn).toBeEnabled();
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: '✅ Copied!', revert: false });
  });

  test('copy is disabled when there is no difference', async ({ page }) => {
    await setInputs(page, 'same', 'same');
    await expect(page.getByTestId('copy-unified-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 6. localStorage persistence across reload (driven via hooks, then reload
//    with a settle wait to avoid the file:// write-then-reload flake — see
//    docs/conventions.md § Responsive & mobile).
// ---------------------------------------------------------------------------
test.describe('persistence across reload', () => {
  test('inputs, view, and options survive a reload', async ({ page }) => {
    await setInputs(page, 'persist A\nline2', 'persist B\nline2');
    await page.getByTestId('view-inline-btn').click();
    await page.getByTestId('opt-case').check();

    // Confirm what was persisted before reloading.
    const stored = await readStored(page, STORAGE_KEY);
    expect(stored.textA).toBe('persist A\nline2');
    expect(stored.textB).toBe('persist B\nline2');
    expect(stored.view).toBe('inline');
    expect(stored.opts.ignoreCase).toBe(true);

    // Poll the stored value instead of a fixed settle (file:// storage-commit race).
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.opts && v.opts.ignoreCase === true });
    await page.reload();

    await expect(page.getByTestId('input-a')).toHaveValue('persist A\nline2');
    await expect(page.getByTestId('input-b')).toHaveValue('persist B\nline2');
    await expect(page.getByTestId('view-inline-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('diff-inline')).toBeVisible();
    await expect(page.getByTestId('opt-case')).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// 7. Clear buttons (with confirm on non-empty content).
// ---------------------------------------------------------------------------
test.describe('clear with confirm', () => {
  test('clearing a non-empty A prompts and, on confirm, empties it', async ({ page }) => {
    await setInputs(page, 'to be cleared', 'other');
    page.once('dialog', () => {}); // no native dialog — confirmDialog is a DOM modal
    await page.getByTestId('clear-a-btn').click();
    // confirmDialog modal appears; confirm via its "Yes" button.
    await assertConfirmDialog(page, { action: 'confirm' });
    await expect(page.getByTestId('input-a')).toHaveValue('');
    await expect(page.getByTestId('input-b')).toHaveValue('other');
  });
});

// ---------------------------------------------------------------------------
// 7b. Load sample button — fills A & B and renders a diff; confirm-guards when
//     either input already holds content.
// ---------------------------------------------------------------------------
test.describe('Load sample', () => {
  test('fills both inputs with the sample and renders a diff', async ({ page }) => {
    await setInputs(page, '', '');
    await page.getByTestId('load-sample').click();

    // Both inputs are now non-empty and match the exposed sample constants.
    const sample = await page.evaluate(() => ({
      a: window.__diffViewer.SAMPLE_A,
      b: window.__diffViewer.SAMPLE_B,
    }));
    await expect(page.getByTestId('input-a')).toHaveValue(sample.a);
    await expect(page.getByTestId('input-b')).toHaveValue(sample.b);

    // A diff renders with all three change kinds visible in the stats.
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('diff-split')).toBeVisible();
    await expect(page.getByTestId('diff-split').locator('.diff-row')).not.toHaveCount(0);
    const stats = page.getByTestId('stats');
    await expect(stats).toContainText('added');
    await expect(stats).toContainText('removed');
    await expect(stats).toContainText('changed');
    // The sample exercises word-level highlighting too.
    await expect(page.getByTestId('diff-split').locator('.wd-ins, .wd-del').first()).toBeVisible();
  });

  test('empty inputs load the sample without a confirm prompt', async ({ page }) => {
    await setInputs(page, '', '');
    await page.getByTestId('load-sample').click();
    // No confirmDialog modal should appear when there is nothing to overwrite.
    await assertConfirmDialog(page, { action: 'none' });
    await expect(page.getByTestId('input-a')).not.toHaveValue('');
  });

  test('confirm-guards when either input is non-empty; cancel keeps the text', async ({ page }) => {
    await setInputs(page, 'my precious original', 'my precious changed');
    await page.getByTestId('load-sample').click();

    // Cancel leaves the existing content untouched.
    await assertConfirmDialog(page, { action: 'cancel' });
    await expect(page.getByTestId('input-a')).toHaveValue('my precious original');
    await expect(page.getByTestId('input-b')).toHaveValue('my precious changed');
  });

  test('confirm-guards when non-empty; confirm replaces with the sample', async ({ page }) => {
    await setInputs(page, 'old A', 'old B');
    await page.getByTestId('load-sample').click();
    await assertConfirmDialog(page, { action: 'confirm' });
    const sampleA = await page.evaluate(() => window.__diffViewer.SAMPLE_A);
    await expect(page.getByTestId('input-a')).toHaveValue(sampleA);
  });
});

// ---------------------------------------------------------------------------
// 7b-legend. Color legend near the diff output — always visible, explains the
//   three line-highlight colors, and is accessible (each item is a swatch PLUS
//   a text label, not color alone).
// ---------------------------------------------------------------------------
test.describe('color legend', () => {
  test('is visible and names all three colors with swatch + label', async ({ page }) => {
    const legend = page.getByTestId('diff-legend');
    await expect(legend).toBeVisible();

    // The three labels are present as text (color name + meaning — not color-only).
    await expect(legend).toContainText('green = added line');
    await expect(legend).toContainText('red = removed line');
    await expect(legend).toContainText('yellow = changed line');

    // Each item pairs a decorative color swatch with its text label.
    await expect(legend.locator('.lg-item')).toHaveCount(3);
    await expect(legend.locator('.lg-swatch')).toHaveCount(3);
    // Swatches are decorative; the meaning is carried by the text.
    for (const cls of ['.lg-swatch--add', '.lg-swatch--del', '.lg-swatch--chg']) {
      await expect(legend.locator(cls)).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

// ---------------------------------------------------------------------------
// 7b-toggle. Loading the sample then flipping an ignore-* option visibly changes
//   the rendered diff (the enriched sample was built so the toggles matter).
// ---------------------------------------------------------------------------
test.describe('sample + ignore-* toggles change the rendered diff', () => {
  test('loading the sample then ignore-case reduces the changed rows on screen', async ({ page }) => {
    await setInputs(page, '', '');
    await page.getByTestId('load-sample').click();
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const changedRows = page.getByTestId('diff-split').locator('.r-chg');
    const before = await changedRows.count();
    expect(before).toBeGreaterThan(0);

    // Ignore case: the case-only line collapses to equal -> one fewer changed row.
    await page.getByTestId('opt-case').check();
    await expect
      .poll(async () => page.getByTestId('diff-split').locator('.r-chg').count())
      .toBeLessThan(before);
  });

  test('loading the sample then ignore-all-whitespace collapses the whitespace lines', async ({ page }) => {
    await setInputs(page, '', '');
    await page.getByTestId('load-sample').click();
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const before = await page.getByTestId('diff-split').locator('.r-chg').count();

    // Ignore all whitespace: the three whitespace-only lines collapse to equal.
    await page.getByTestId('opt-all-ws').check();
    await expect
      .poll(async () => page.getByTestId('diff-split').locator('.r-chg').count())
      .toBe(before - 3);
    // Stats reflect the reduced changed count too.
    await expect(page.getByTestId('stats')).toContainText('changed');
  });
});

// ---------------------------------------------------------------------------
// 7c. In-field copy buttons — hidden while empty, revealed when non-empty,
//     copy the field's text and flash (controls.css § in-field copy).
// ---------------------------------------------------------------------------
test.describe('in-field copy buttons', () => {
  test('copy A is hidden when empty and revealed when non-empty', async ({ page }) => {
    await setInputs(page, '', '');
    await expect(page.getByTestId('copy-a-btn')).toBeHidden();
    await page.getByTestId('input-a').fill('some content');
    await expect(page.getByTestId('copy-a-btn')).toBeVisible();
    // Clearing it back to empty re-hides the button.
    await page.getByTestId('input-a').fill('');
    await expect(page.getByTestId('copy-a-btn')).toBeHidden();
  });

  test('clicking in-field copy copies the field text and flashes', async ({ page }) => {
    await setInputs(page, 'copy me A', 'copy me B');
    const copyA = page.getByTestId('copy-a-btn');
    await expect(copyA).toBeVisible();
    await stubClipboard(page);
    await expectCopyFlash(copyA, { flash: '✅', revert: false });
    expect(await readClipboard(page)).toBe('copy me A');
  });
});

// ---------------------------------------------------------------------------
// 7d. Wide desktop viewport: the inputs and the two side-by-side diff panes must
//     WIDEN with the viewport, not sit pegged to a fixed narrow column (see
//     docs/conventions.md § "Responsive & mobile" — scale UP on large screens).
//     With the old ~1100px cap a code pane / input pane was ~490px on a wide
//     window; freeing the cap lets each pane comfortably exceed 760px.
// ---------------------------------------------------------------------------
test.describe('wide desktop viewport (1700px): panes widen with the window', () => {
  test.use({ viewport: { width: 1700, height: 900 } });

  test('side-by-side panes and input textareas fill much more width', async ({ page }) => {
    await setInputs(page,
      'the quick brown fox jumps over the lazy dog\nsecond line here\nthird',
      'the quick BROWN fox leaps over the lazy dog\nsecond line changed\nthird\nfourth');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    // The whole diff/pane area is far wider than the old ~1100px column cap.
    const diffOutputWidth = await page.getByTestId('diff-output').evaluate((el) => el.getBoundingClientRect().width);
    expect(diffOutputWidth).toBeGreaterThan(1300);

    // Each side-by-side code column comfortably exceeds ~760px (was ~490px capped).
    const codePaneWidth = await page.getByTestId('diff-split').locator('.code').first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(codePaneWidth).toBeGreaterThan(760);

    // The editable input panes widen too (each was ~500px under the old cap).
    const inputWidth = await page.getByTestId('input-a').evaluate((el) => el.getBoundingClientRect().width);
    expect(inputWidth).toBeGreaterThan(760);

    // No horizontal page overflow at this width either.
    await expectNoOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// 8. Mobile viewport (~375px): no horizontal page overflow.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true });

  test('no horizontal page overflow with a diff populated', async ({ page }) => {
    await setInputs(page,
      'the quick brown fox jumps over the lazy dog\nsecond line here\nthird',
      'the quick BROWN fox leaps over the lazy dog\nsecond line changed\nthird\nfourth');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expectNoOverflow(page);
  });

  test('no horizontal overflow in inline view either', async ({ page }) => {
    await setInputs(page, 'a\nb\nc', 'a\nX\nc');
    await page.getByTestId('view-inline-btn').tap();
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expectNoOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// 9. First-load Help popup — docs/conventions.md § "First-load help popup".
//    Auto-shows exactly once on a genuinely fresh visit (localStorage key
//    absent), never again after, and is otherwise reachable only via Help (?).
//    Plus close paths (✕ / Esc / backdrop), focus trap, and focus return.
// ---------------------------------------------------------------------------
test.describe('first-load Help popup', () => {
  test('auto-shows on a genuine first visit (fresh context), then not again', async ({ browser }) => {
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
// 10. Footer License modal — the shared license surface (docs/conventions.md
//     § "License surface"). Built into every artifact for free via the shared
//     footer include (footer.html + lib/components/CtLicense.mjs): a footer "MIT License"
//     link opens an accessible modal showing the full MIT text and, for a
//     dependency-free tool, the "100% vanilla" note. Same accessible pattern as
//     Help: role=dialog, focus-in-on-open / return-on-close, Esc/✕/backdrop
//     close. Driven via the footer [data-ct-license] trigger.
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
    // Full MIT license text is shown.
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText('Permission is hereby granted');
    await expect(modal).toContainText('THE SOFTWARE IS PROVIDED "AS IS"');
    // A dedicated ✕ close control exists.
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
    // Tab / Shift+Tab keep focus within the license dialog's focusable set.
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
