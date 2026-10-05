// @playwright/test spec for tools/markdown-previewer/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the
// window.__markdownPreviewer test API described in DESIGN.md § "Testability".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/markdown-previewer/).

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertConfirmDialog } from '../../../lib/test-support/interaction.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { settleStorage, readStored } from '../../../lib/test-support/storage.mjs';
import { stubClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');
const TOOL_URL = toolUrl(import.meta.url);

// First-load Help popup auto-shows once, keyed off localStorage
// "markdown-previewer:help-seen:v1". Every test EXCEPT the dedicated
// "first-load help" suite pre-seeds that key via addInitScript (so it is set
// before the page's own module runs) so the auto-shown modal never interferes
// with unrelated assertions.
const HELP_SEEN_KEY = helpSeenKey('markdown-previewer');
const STORAGE_KEY = 'markdown-previewer:v1';

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
// Feature tests (pre-seeded help).
// -----------------------------------------------------------------------------
test.describe('feature tests', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // Live render
  // ---------------------------------------------------------------------------
  test.describe('live split-pane render', () => {
    test('preview updates live as you type', async ({ page }) => {
      const editor = page.getByTestId('editor');
      const preview = page.getByTestId('preview');

      await editor.fill('# Hello');
      await expect(preview.locator('h1')).toHaveText('Hello');

      await editor.fill('# Hello\n\nSome **bold** text.');
      await expect(preview.locator('h1')).toHaveText('Hello');
      await expect(preview.locator('strong')).toHaveText('bold');
    });

    test('renders lists, code, blockquotes and tables', async ({ page }) => {
      const editor = page.getByTestId('editor');
      const preview = page.getByTestId('preview');

      await editor.fill([
        '- one',
        '- two',
        '',
        '```js',
        'const x = 1;',
        '```',
        '',
        '> quoted',
        '',
        '| A | B |',
        '| :- | -: |',
        '| 1 | 2 |',
      ].join('\n'));

      await expect(preview.locator('ul > li')).toHaveCount(2);
      await expect(preview.locator('pre code.language-js')).toContainText('const x = 1;');
      await expect(preview.locator('blockquote')).toContainText('quoted');
      await expect(preview.locator('table thead th')).toHaveCount(2);
      await expect(preview.locator('table tbody td')).toHaveCount(2);
    });

    test('empty editor clears the preview', async ({ page }) => {
      const editor = page.getByTestId('editor');
      const preview = page.getByTestId('preview');
      await editor.fill('# Something');
      await expect(preview.locator('h1')).toBeVisible();
      await editor.fill('');
      await expect(preview.locator('h1')).toHaveCount(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Load sample
  // ---------------------------------------------------------------------------
  test('Load sample populates the editor and renders it', async ({ page }) => {
    const editor = page.getByTestId('editor');
    const preview = page.getByTestId('preview');

    await expect(editor).toHaveValue('');
    await page.getByTestId('load-sample-btn').click();

    const val = await editor.inputValue();
    expect(val.length).toBeGreaterThan(100);
    expect(val).toContain('# Markdown Previewer');

    // Rendered preview shows several constructs from the sample.
    await expect(preview.locator('h1').first()).toBeVisible();
    await expect(preview.locator('table')).toBeVisible();
    await expect(preview.locator('input[type="checkbox"]').first()).toBeVisible();
    await expect(preview.locator('pre code.language-js')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // XSS safety in the live DOM
  // ---------------------------------------------------------------------------
  test.describe('XSS safety (live DOM)', () => {
    test('a javascript: link href is neutralized and no dialog/script fires', async ({ page }) => {
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });

      await page.getByTestId('editor').fill('[click me](javascript:alert(1))');
      const preview = page.getByTestId('preview');
      const link = preview.locator('a');
      await expect(link).toHaveText('click me');
      // The href was neutralized to empty.
      await expect(link).toHaveAttribute('href', '');

      // Clicking it must not execute anything.
      await link.click();
      await page.waitForTimeout(200);
      expect(dialogs).toBe(0);
    });

    test('a pasted <img onerror> is inert — no live img, no handler, no execution', async ({ page }) => {
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      await page.getByTestId('editor').fill('<img src=x onerror="alert(document.domain)">');
      const preview = page.getByTestId('preview');

      // The raw markup rendered as escaped, visible text — not a live element.
      await expect(preview).toContainText('<img src=x onerror=');
      // No live <img> element was created from the raw HTML.
      const imgCount = await preview.locator('img').count();
      expect(imgCount).toBe(0);
      // No element in the preview carries an onerror handler.
      const anyOnerror = await preview.evaluate((el) =>
        !!el.querySelector('[onerror]')
      );
      expect(anyOnerror).toBe(false);

      await page.waitForTimeout(200);
      expect(dialogs).toBe(0);
    });

    test('a pasted <script> tag never runs', async ({ page }) => {
      const marker = await page.evaluate(() => {
        window.__xssRan = false;
        return true;
      });
      expect(marker).toBe(true);

      await page.getByTestId('editor').fill('<script>window.__xssRan = true;</script>');
      await page.waitForTimeout(200);

      const preview = page.getByTestId('preview');
      await expect(preview).toContainText('<script>');
      const scriptEls = await preview.locator('script').count();
      expect(scriptEls).toBe(0);
      const ran = await page.evaluate(() => window.__xssRan);
      expect(ran).toBe(false);
    });

    test('a data:image is allowed for images but a data:text/html link is blocked', async ({ page }) => {
      await page.getByTestId('editor').fill([
        '![ok](data:image/png;base64,iVBORw0KGgo=)',
        '',
        '[bad](data:text/html,<script>alert(1)</script>)',
      ].join('\n'));
      const preview = page.getByTestId('preview');
      await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/png/);
      await expect(preview.locator('a')).toHaveAttribute('href', '');
    });
  });

  // ---------------------------------------------------------------------------
  // Copy rendered HTML
  // ---------------------------------------------------------------------------
  test('Copy HTML flashes a "Copied!" confirmation', async ({ page }) => {
    await page.getByTestId('editor').fill('# Copy me');
    // The render is debounced — wait for the preview before copying (Copy is a
    // no-op while the preview is still empty).
    await expect(page.getByTestId('preview').locator('h1')).toBeVisible();
    const btn = page.getByTestId('copy-html-btn');
    await expect(btn).toHaveText('Copy HTML');
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: 'Copied!', revert: 'Copy HTML' });
  });

  // ---------------------------------------------------------------------------
  // Clear (confirm)
  // ---------------------------------------------------------------------------
  test('Clear asks for confirmation and empties the editor on Yes', async ({ page }) => {
    const editor = page.getByTestId('editor');
    await editor.fill('# some hand-written markdown');
    await page.getByTestId('clear-btn').click();

    // A confirmDialog modal appears; confirm it.
    await assertConfirmDialog(page, { action: 'confirm' });

    await expect(editor).toHaveValue('');
    await expect(page.getByTestId('preview').locator('h1')).toHaveCount(0);
  });

  test('Clear leaves the editor untouched on Cancel', async ({ page }) => {
    const editor = page.getByTestId('editor');
    await editor.fill('# keep me');
    await page.getByTestId('clear-btn').click();
    await assertConfirmDialog(page, { action: 'cancel' });
    await expect(editor).toHaveValue('# keep me');
  });

  // ---------------------------------------------------------------------------
  // Sync scroll toggle
  // ---------------------------------------------------------------------------
  test('Sync scroll toggles aria-pressed and persists', async ({ page }) => {
    const toggle = page.getByTestId('sync-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const saved = await readStored(page, STORAGE_KEY);
    expect(saved.syncScroll).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // View-mode toggle (side-by-side <-> top/bottom)
  // ---------------------------------------------------------------------------
  test.describe('view-mode toggle', () => {
    test('defaults to side-by-side (pressed) with the accented "selected" look', async ({ page }) => {
      const view = page.getByTestId('view-toggle');
      await expect(view).toHaveText('Side by side');
      await expect(view).toHaveAttribute('aria-pressed', 'true');

      // Panes sit side-by-side: preview to the RIGHT of the editor, roughly the
      // same top edge (same grid row).
      const editorBox = await page.getByTestId('editor').boundingBox();
      const previewBox = await page.getByTestId('preview').boundingBox();
      expect(previewBox.x).toBeGreaterThan(editorBox.x + editorBox.width / 2);
      expect(Math.abs(previewBox.y - editorBox.y)).toBeLessThan(40);

      // The pressed view toggle wears the SAME accented purple background as a
      // pressed Sync-scroll toggle (the shared `.toggle[aria-pressed="true"]`
      // selected styling).
      const sync = page.getByTestId('sync-toggle');
      await sync.click();
      await expect(sync).toHaveAttribute('aria-pressed', 'true');
      const [viewBg, syncBg] = await Promise.all([
        view.evaluate((el) => getComputedStyle(el).backgroundColor),
        sync.evaluate((el) => getComputedStyle(el).backgroundColor),
      ]);
      expect(viewBg).toBe(syncBg);
      // And it's a real accent fill, not the default panel background.
      const clearBg = await page.getByTestId('clear-btn').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(viewBg).not.toBe(clearBg);
    });

    test('toggling off switches to a stacked top/bottom layout with a smaller input pane', async ({ page }) => {
      const view = page.getByTestId('view-toggle');
      await view.click();
      await expect(view).toHaveAttribute('aria-pressed', 'false');
      // Label is unchanged (it's a state toggle, not a relabelling button).
      await expect(view).toHaveText('Side by side');

      const editorBox = await page.getByTestId('editor').boundingBox();
      const previewBox = await page.getByTestId('preview').boundingBox();
      // Stacked: preview sits BELOW the editor.
      expect(previewBox.y).toBeGreaterThan(editorBox.y + editorBox.height / 2);
      // Input pane is the SMALLER pane; preview is the taller one.
      expect(editorBox.height).toBeLessThan(previewBox.height);

      // Toggling back returns to columns.
      await view.click();
      await expect(view).toHaveAttribute('aria-pressed', 'true');
      const editorBox2 = await page.getByTestId('editor').boundingBox();
      const previewBox2 = await page.getByTestId('preview').boundingBox();
      expect(previewBox2.x).toBeGreaterThan(editorBox2.x + editorBox2.width / 2);
    });

    test('the view-mode is persisted to localStorage', async ({ page }) => {
      await page.getByTestId('view-toggle').click();
      const saved = await readStored(page, STORAGE_KEY);
      expect(saved.sideBySide).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Toolbar button order: Side by side · Sync scroll · Copy HTML · Clear · Load sample
  // ---------------------------------------------------------------------------
  test('toolbar buttons appear left-to-right in the specified order', async ({ page }) => {
    const order = await page.evaluate(() => {
      const toolbar = document.querySelector('.toolbar');
      return Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('data-testid'));
    });
    expect(order).toEqual([
      'view-toggle',
      'sync-toggle',
      'copy-html-btn',
      'clear-btn',
      'load-sample-btn',
    ]);
  });

  // ---------------------------------------------------------------------------
  // In-field copy button inside the editor textarea
  // ---------------------------------------------------------------------------
  test.describe('in-field copy (editor)', () => {
    test('hidden when empty, revealed when non-empty, and copies the Markdown source', async ({ page }) => {
      const editor = page.getByTestId('editor');
      const copyMd = page.getByTestId('editor-copy-btn');

      // Empty editor: the in-field copy button is hidden.
      await expect(editor).toHaveValue('');
      await expect(copyMd).toBeHidden();

      // Typing reveals it.
      await editor.fill('# hi there');
      await expect(copyMd).toBeVisible();

      // It copies and flashes a check, then reverts.
      await stubClipboard(page);
      await expectCopyFlash(copyMd, { flash: '✅', revert: '📋' });

      // Clearing the field hides it again.
      await editor.fill('');
      await expect(copyMd).toBeHidden();
    });

    test('is a descendant of the editor field (multiline, top-right)', async ({ page }) => {
      const inField = await page.getByTestId('editor-copy-btn').evaluate((btn) => {
        const field = btn.closest('.ct-field');
        return !!field && field.classList.contains('ct-field--multiline') && field.contains(document.querySelector('#editor'));
      });
      expect(inField).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test hook sanity
  // ---------------------------------------------------------------------------
  test('window.__markdownPreviewer exposes pure functions and live state', async ({ page }) => {
    await assertHookShape(page, '__markdownPreviewer', {
      mdToHtml: 'function', parseInline: 'function', escapeHtmlForMarkdown: 'function', sanitizeUrl: 'function',
      render: 'function', state: 'object',
    });
    const shape = await page.evaluate(() => {
      const m = window.__markdownPreviewer;
      return {
        rendered: m.mdToHtml('# Hi'),
        blocked: m.sanitizeUrl('javascript:alert(1)'),
      };
    });
    expect(shape.rendered).toBe('<h1>Hi</h1>\n');
    expect(shape.blocked).toBe('');
  });
});

// -----------------------------------------------------------------------------
// Persistence across reload (via window.__markdownPreviewer + localStorage).
// -----------------------------------------------------------------------------
test.describe('persistence across reload', () => {
  test('editor text and sync-scroll toggle survive a reload', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    const editor = page.getByTestId('editor');
    await editor.fill('# Persisted heading\n\nWith a paragraph.');
    await page.getByTestId('sync-toggle').click();
    // Switch to the stacked view so its persistence is exercised too.
    await page.getByTestId('view-toggle').click();

    // Confirm the blob was written before reloading.
    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.text === '# Persisted heading\n\nWith a paragraph.' && v.syncScroll === true && v.sideBySide === false });
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    await expect(editor).toHaveValue('# Persisted heading\n\nWith a paragraph.');
    await expect(page.getByTestId('sync-toggle')).toHaveAttribute('aria-pressed', 'true');
    // The stacked view-mode was restored.
    await expect(page.getByTestId('view-toggle')).toHaveAttribute('aria-pressed', 'false');
    // Preview was re-derived from the restored text.
    await expect(page.getByTestId('preview').locator('h1')).toHaveText('Persisted heading');
  });
});

// -----------------------------------------------------------------------------
// Wide viewport — both split panes use the available width (past the old cap).
// -----------------------------------------------------------------------------
test.describe('wide viewport (1600px)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the editor/preview panes fill the width and the page does not overflow', async ({ page }) => {
    // The app wrapper is materially wider than the old 1200px cap.
    const app = await page.locator('.app').boundingBox();
    expect(app.width).toBeGreaterThan(1400);
    // No horizontal page overflow at a wide viewport.
    await expectNoOverflow(page, { tolerance: 1 });
    // Both split panes get real width (each well over the old narrow half).
    const editorBox = await page.getByTestId('editor').boundingBox();
    const previewBox = await page.getByTestId('preview').boundingBox();
    expect(editorBox.width).toBeGreaterThan(600);
    expect(previewBox.width).toBeGreaterThan(600);
  });
});

// -----------------------------------------------------------------------------
// Mobile viewport — panes stack, no horizontal overflow, code scrolls in-pane.
// -----------------------------------------------------------------------------
test.describe('mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the page does not scroll horizontally and the panes stack', async ({ page }) => {
    await page.getByTestId('load-sample-btn').click();

    await expectNoOverflow(page, { tolerance: 1 });

    // Panes are stacked: the preview sits below the editor (top edge lower).
    const editorBox = await page.getByTestId('editor').boundingBox();
    const previewBox = await page.getByTestId('preview').boundingBox();
    expect(previewBox.y).toBeGreaterThan(editorBox.y);
  });

  test('a long code block scrolls inside the preview, not the page', async ({ page }) => {
    const longLine = 'x'.repeat(400);
    await page.getByTestId('editor').fill('```\n' + longLine + '\n```');
    // Wait for the debounced render to produce the code block.
    await expect(page.getByTestId('preview').locator('pre')).toBeVisible();

    await expectNoOverflow(page, { tolerance: 1 });

    // The <pre> (or an ancestor within the preview) is horizontally scrollable.
    const preScrolls = await page.getByTestId('preview').evaluate((preview) => {
      const pre = preview.querySelector('pre');
      if (!pre) return false;
      // Walk up from the pre to the preview looking for a scroll container.
      let el = pre;
      while (el && el !== preview.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1) return true;
        el = el.parentElement;
      }
      return false;
    });
    expect(preScrolls).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Footer License modal — the shared license surface (docs/conventions.md
// § "License surface"). Built into every artifact for free via the shared
// footer include (footer.html + src/lib/components/CtLicense.mjs): a footer "MIT License"
// link opens an accessible modal showing the full MIT text and, for a
// dependency-free tool, the "100% vanilla" note. Same accessible pattern as
// Help: role=dialog, focus-in-on-open / return-on-close, Esc/✕/backdrop close.
// Driven via the footer [data-ct-license] trigger.
// ---------------------------------------------------------------------------
test.describe('footer License modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

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

  // Focus-on-open, the focus trap, and Esc / ✕ / backdrop close with focus
  // return are the shared License-modal contract; assert them via the helper.
  test('is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});
