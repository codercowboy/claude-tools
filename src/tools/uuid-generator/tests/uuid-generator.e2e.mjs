// @playwright/test spec for tools/uuid-generator/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the
// window.__uuidGenerator test API described in DESIGN.md § "Testability hooks".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/uuid-generator/).

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen as seedHelpSeenKey } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// First-load Help popup auto-shows once, keyed off localStorage
// "uuid-generator:help-seen:v1". Every test EXCEPT the dedicated "first-load
// help" suite pre-seeds that key via addInitScript (set before the page's own
// module runs) so the auto-shown modal never interferes with assertions.
const HELP_SEEN_KEY = helpSeenKey('uuid-generator');
const STORAGE_KEY = 'uuid-generator:v1';

const CANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CROCKFORD_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

// Thin wrapper over the shared helper so existing call sites (seedHelpSeen(page))
// keep working with this tool's help-seen key.
async function seedHelpSeen(page) {
  await seedHelpSeenKey(page, HELP_SEEN_KEY);
}

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
    // Initial focus lands on the close ✕ inside the dialog.
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    await page.getByTestId('modal-close-x').click();
    await expect(overlay).toBeHidden();

    await page.waitForTimeout(400); // settle the localStorage write on file://
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
    await seedHelpSeen(page);
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

  test('Esc closes the modal and returns focus', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('backdrop click closes; a click inside the dialog does not', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    await page.getByTestId('help-modal').click({ position: { x: 10, y: 10 } });
    await expect(overlay).toBeVisible();

    await overlay.click({ position: { x: 2, y: 2 } });
    await expect(overlay).toBeHidden();
  });

  test('Tab keeps focus trapped within the dialog', async ({ page }) => {
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
// Feature tests (pre-seeded help).
// -----------------------------------------------------------------------------
test.describe('feature tests', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // Generate — each id type
  // ---------------------------------------------------------------------------
  test.describe('generate each id type', () => {
    test('UUID v4 produces canonical v4 values', async ({ page }) => {
      await page.getByTestId('type-uuidv4-btn').click();
      const first = await page.getByTestId('result-value').first().textContent();
      expect(first).toMatch(CANON_RE);
      expect(first[14]).toBe('4'); // version nibble (idx 12 of hex → char 14 with hyphens)
    });

    test('UUID v7 produces canonical v7 values', async ({ page }) => {
      await page.getByTestId('type-uuidv7-btn').click();
      const first = await page.getByTestId('result-value').first().textContent();
      expect(first).toMatch(CANON_RE);
      expect(first[14]).toBe('7');
    });

    test('ULID produces 26-char Crockford values', async ({ page }) => {
      await page.getByTestId('type-ulid-btn').click();
      const first = await page.getByTestId('result-value').first().textContent();
      expect(first).toMatch(CROCKFORD_RE);
      expect(first.length).toBe(26);
    });

    test('nanoid produces 21-char default values', async ({ page }) => {
      await page.getByTestId('type-nanoid-btn').click();
      const first = await page.getByTestId('result-value').first().textContent();
      expect(first.length).toBe(21);
    });

    test('Token produces 32-char hex default values', async ({ page }) => {
      await page.getByTestId('type-token-btn').click();
      const first = await page.getByTestId('result-value').first().textContent();
      expect(first).toMatch(/^[0-9a-f]{32}$/);
    });

    test('selecting a type reveals only its option group', async ({ page }) => {
      await page.getByTestId('type-uuidv4-btn').click();
      await expect(page.getByTestId('opts-uuid')).toBeVisible();
      await expect(page.getByTestId('opts-nanoid')).toBeHidden();
      await expect(page.getByTestId('opts-token')).toBeHidden();

      await page.getByTestId('type-nanoid-btn').click();
      await expect(page.getByTestId('opts-uuid')).toBeHidden();
      await expect(page.getByTestId('opts-nanoid')).toBeVisible();

      await page.getByTestId('type-token-btn').click();
      await expect(page.getByTestId('opts-token')).toBeVisible();
      // Custom-alphabet field only appears when Alphabet = Custom.
      await expect(page.getByTestId('custom-alphabet-field')).toBeHidden();
      await page.getByTestId('token-alphabet-select').selectOption('custom');
      await expect(page.getByTestId('custom-alphabet-field')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Bulk count
  // ---------------------------------------------------------------------------
  test.describe('bulk count', () => {
    test('count = N produces exactly N rows', async ({ page }) => {
      await page.getByTestId('count-input').fill('3');
      await page.getByTestId('generate-btn').click();
      await expect(page.getByTestId('result-row')).toHaveCount(3);
      await expect(page.getByTestId('results-count')).toHaveText('3 values');

      await page.getByTestId('count-input').fill('7');
      await page.getByTestId('generate-btn').click();
      await expect(page.getByTestId('result-row')).toHaveCount(7);
    });

    test('count = 1 uses the singular "value" label', async ({ page }) => {
      await page.getByTestId('count-input').fill('1');
      await page.getByTestId('generate-btn').click();
      await expect(page.getByTestId('result-row')).toHaveCount(1);
      await expect(page.getByTestId('results-count')).toHaveText('1 value');
    });

    test('count clamps below 1 up to 1 and above 1000 down to 1000', async ({ page }) => {
      const input = page.getByTestId('count-input');
      await input.fill('0');
      await input.blur();
      await expect(input).toHaveValue('1');

      await input.fill('5000');
      await input.blur();
      await expect(input).toHaveValue('1000');
    });
  });

  // ---------------------------------------------------------------------------
  // Default bulk count = 10 (all id types)
  // ---------------------------------------------------------------------------
  test.describe('default bulk count', () => {
    test('defaults to 10 and renders 10 rows on first load', async ({ page }) => {
      await expect(page.getByTestId('count-input')).toHaveValue('10');
      await expect(page.getByTestId('result-row')).toHaveCount(10);
      await expect(page.getByTestId('results-count')).toHaveText('10 values');
    });

    test('the default count holds for every id type', async ({ page }) => {
      for (const t of ['uuidv4', 'uuidv7', 'ulid', 'nanoid', 'token']) {
        await page.getByTestId(`type-${t}-btn`).click();
        await expect(page.getByTestId('count-input')).toHaveValue('10');
        await expect(page.getByTestId('result-row')).toHaveCount(10);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Control layout — Generate first, single inline row (changes #1, #2)
  // ---------------------------------------------------------------------------
  test.describe('control layout', () => {
    test('Generate is the first control in the row, ahead of Count', async ({ page }) => {
      const order = await page.evaluate(() => {
        const controls = document.querySelector('[data-testid="controls"]');
        const gen = document.querySelector('[data-testid="generate-btn"]');
        const count = document.querySelector('[data-testid="count-input"]');
        const kids = Array.from(controls.children);
        return {
          genIdx: kids.indexOf(gen),
          countIdx: kids.findIndex((k) => k.contains(count)),
        };
      });
      expect(order.genIdx).toBe(0);
      expect(order.countIdx).toBeGreaterThan(order.genIdx);
    });

    test('Generate, Count and the option group lay out on one inline row (desktop)', async ({ page }) => {
      const geo = await page.evaluate(() => {
        const g = document.querySelector('[data-testid="generate-btn"]').getBoundingClientRect();
        const c = document.querySelector('[data-testid="count-input"]').getBoundingClientRect();
        const o = document.querySelector('[data-testid="opts-uuid"]').getBoundingClientRect();
        const mid = (r) => r.top + r.height / 2;
        return {
          genLeft: g.left, countLeft: c.left, optsLeft: o.left,
          genMid: mid(g), countMid: mid(c), optsMid: mid(o),
        };
      });
      // Generate leads (left of Count), the option group trails Count.
      expect(geo.genLeft).toBeLessThan(geo.countLeft);
      expect(geo.optsLeft).toBeGreaterThan(geo.countLeft);
      // All share one row: vertical centers within a small tolerance.
      expect(Math.abs(geo.genMid - geo.countMid)).toBeLessThan(24);
      expect(Math.abs(geo.genMid - geo.optsMid)).toBeLessThan(24);
    });

    test('single-line controls share the standard 44px height (controls.css)', async ({ page }) => {
      await page.getByTestId('type-token-btn').click();
      const heights = await page.evaluate(() => {
        const h = (sel) => document.querySelector(sel).getBoundingClientRect().height;
        return {
          gen: h('[data-testid="generate-btn"]'),
          count: h('[data-testid="count-input"]'),
          alpha: h('[data-testid="token-alphabet-select"]'),
          len: h('[data-testid="token-length-input"]'),
        };
      });
      for (const v of Object.values(heights)) expect(v).toBeGreaterThanOrEqual(44);
    });
  });

  // ---------------------------------------------------------------------------
  // Token alphabet <select> — width/padding (change #4, mirrors format-converter)
  // ---------------------------------------------------------------------------
  test.describe('token alphabet select', () => {
    test('is wide enough for its longest option and keeps chevron padding', async ({ page }) => {
      await page.getByTestId('type-token-btn').click();
      const sel = page.getByTestId('token-alphabet-select');
      await expect(sel).toBeVisible();
      await sel.selectOption('hex'); // "Hex (0-9a-f)" — the longest option text
      const metrics = await sel.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          paddingRight: parseFloat(cs.paddingRight),
        };
      });
      // Wide enough that the value isn't clipped…
      expect(metrics.clientWidth).toBeGreaterThanOrEqual(120);
      // …the content box fits with no horizontal clipping…
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      // …and the chevron room stays reserved (~2rem, set via longhands).
      expect(metrics.paddingRight).toBeGreaterThanOrEqual(24);
    });
  });

  // ---------------------------------------------------------------------------
  // In-field copy — Inspect canonical value (change #5, controls.css pattern)
  // ---------------------------------------------------------------------------
  test.describe('in-field copy', () => {
    test('the Inspect canonical value carries an in-field .ct-copy-btn pinned inside the field', async ({ page }) => {
      await page.getByTestId('mode-inspect-btn').click();
      await page.getByTestId('inspect-input').fill('550e8400-e29b-41d4-a716-446655440000');
      await expect(page.getByTestId('inspect-status')).toHaveText('✓ Valid UUID');

      const btn = page.getByTestId('inspect-copy-btn');
      await expect(btn).toHaveClass(/ct-copy-btn/);

      const geom = await page.evaluate(() => {
        const f = document.querySelector('.ct-field.canonical-row').getBoundingClientRect();
        const b = document.querySelector('[data-testid="inspect-copy-btn"]').getBoundingClientRect();
        return { contained: b.left >= f.left - 1 && b.right <= f.right + 1 };
      });
      expect(geom.contained).toBe(true); // button sits inside the value field
    });

    test('the in-field copy button flashes ✅ then reverts', async ({ page }) => {
      await page.getByTestId('mode-inspect-btn').click();
      await page.getByTestId('inspect-input').fill('550e8400-e29b-41d4-a716-446655440000');
      const btn = page.getByTestId('inspect-copy-btn');
      await btn.click();
      await expect(btn).toHaveText('✅');
      await expect(btn).toHaveText('📋', { timeout: 3000 });
    });
  });

  // ---------------------------------------------------------------------------
  // UUID format toggles
  // ---------------------------------------------------------------------------
  test.describe('uppercase / hyphen toggles', () => {
    test('uppercase toggle re-formats existing values without new randomness', async ({ page }) => {
      await page.getByTestId('type-uuidv4-btn').click();
      const before = await page.getByTestId('result-value').first().textContent();

      await page.getByTestId('uppercase-toggle').check();
      const after = await page.getByTestId('result-value').first().textContent();
      expect(after).toBe(before.toUpperCase());
      expect(after).toMatch(/[A-F]/);
    });

    test('hyphens toggle strips the hyphens (same underlying value)', async ({ page }) => {
      await page.getByTestId('type-uuidv4-btn').click();
      const before = await page.getByTestId('result-value').first().textContent();

      await page.getByTestId('hyphens-toggle').uncheck();
      const after = await page.getByTestId('result-value').first().textContent();
      expect(after).not.toContain('-');
      expect(after).toBe(before.replace(/-/g, ''));
      expect(after.length).toBe(32);
    });

    test('wrap = braces wraps each value in {…}', async ({ page }) => {
      await page.getByTestId('type-uuidv4-btn').click();
      await page.getByTestId('wrap-select').selectOption('braces');
      const v = await page.getByTestId('result-value').first().textContent();
      expect(v.startsWith('{')).toBe(true);
      expect(v.endsWith('}')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Copy flashes
  // ---------------------------------------------------------------------------
  test.describe('copy feedback', () => {
    test('per-row Copy button flashes ✅ then reverts', async ({ page }) => {
      await page.getByTestId('generate-btn').click();
      const btn = page.getByTestId('result-copy-btn').first();
      await btn.click();
      await expect(btn).toHaveText('✅');
      await expect(btn).toHaveText('📋', { timeout: 3000 });
    });

    test('Copy all flashes "Copied!" then reverts', async ({ page }) => {
      await page.getByTestId('generate-btn').click();
      const btn = page.getByTestId('copy-all-btn');
      await expect(btn).toBeEnabled();
      await btn.click();
      await expect(btn).toHaveText('Copied!');
      await expect(btn).toHaveText('Copy all', { timeout: 3000 });
    });
  });

  // ---------------------------------------------------------------------------
  // Inspect
  // ---------------------------------------------------------------------------
  test.describe('inspect', () => {
    test('a pasted v4 UUID shows valid, version and variant', async ({ page }) => {
      await page.getByTestId('mode-inspect-btn').click();
      await expect(page.getByTestId('inspect-section')).toBeVisible();

      await page.getByTestId('inspect-input').fill('550e8400-e29b-41d4-a716-446655440000');
      await expect(page.getByTestId('inspect-status')).toHaveText('✓ Valid UUID');

      const breakdown = page.getByTestId('inspect-breakdown');
      await expect(breakdown).toContainText('Version 4 (random)');
      await expect(breakdown).toContainText('RFC 4122 / DCE 1.1 (10xx)');
      await expect(page.getByTestId('inspect-canonical')).toHaveText('550e8400-e29b-41d4-a716-446655440000');
    });

    test('a v7 UUID decodes its embedded timestamp', async ({ page }) => {
      await page.getByTestId('mode-inspect-btn').click();
      // Build a v7 with a known time via the pure hook, then inspect it.
      const uuid = await page.evaluate(() =>
        window.__uuidGenerator.uuidV7(1700000000000, new Uint8Array(16))
      );
      await page.getByTestId('inspect-input').fill(uuid);
      await expect(page.getByTestId('inspect-status')).toHaveText('✓ Valid UUID');
      await expect(page.getByTestId('inspect-breakdown')).toContainText('2023-11-14T22:13:20.000Z');
    });

    test('an invalid string shows an error status', async ({ page }) => {
      await page.getByTestId('mode-inspect-btn').click();
      await page.getByTestId('inspect-input').fill('not-a-uuid');
      const status = page.getByTestId('inspect-status');
      await expect(status).toContainText('✕');
      await expect(page.getByTestId('inspect-breakdown')).toHaveCount(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Non-secure context — crypto.randomUUID shadowed to undefined.
  // ---------------------------------------------------------------------------
  test('generation still works when crypto.randomUUID is undefined (non-secure context sim)', async ({ page }) => {
    // Per docs/conventions.md: defineProperty (NOT delete) to reliably shadow
    // the secure-context-only API and reproduce the plain-HTTP failure mode.
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    // Confirm the simulation took effect and that getRandomValues is intact.
    const probe = await page.evaluate(() => ({
      randomUUID: typeof crypto.randomUUID,
      getRandomValues: typeof crypto.getRandomValues,
      hasSecureRandom: window.__uuidGenerator.hasSecureRandom,
    }));
    expect(probe.randomUUID).toBe('undefined');
    expect(probe.getRandomValues).toBe('function');
    expect(probe.hasSecureRandom).toBe(true);

    // Generate a batch of each type — none of these paths may touch randomUUID.
    await page.getByTestId('type-uuidv4-btn').click();
    await page.getByTestId('generate-btn').click();
    await expect(page.getByTestId('result-row')).toHaveCount(10); // default count = 10
    const v4 = await page.getByTestId('result-value').first().textContent();
    expect(v4).toMatch(CANON_RE);

    await page.getByTestId('type-ulid-btn').click();
    const ulid = await page.getByTestId('result-value').first().textContent();
    expect(ulid).toMatch(CROCKFORD_RE);

    // No results-header warning about a non-secure Math.random fallback.
    await expect(page.getByTestId('results-count')).not.toContainText('crypto unavailable');
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  test('settings persist across reload (type, count, options)', async ({ page }) => {
    await page.getByTestId('type-token-btn').click();
    await page.getByTestId('token-length-input').fill('40');
    await page.getByTestId('token-length-input').blur();
    await page.getByTestId('token-alphabet-select').selectOption('base62');
    await page.getByTestId('count-input').fill('8');
    await page.getByTestId('count-input').blur();

    // The persisted blob captures the settings (values are NOT persisted).
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
    expect(saved.type).toBe('token');
    expect(saved.tokenLength).toBe(40);
    expect(saved.tokenAlphabet).toBe('base62');
    expect(saved.count).toBe(8);
    expect(saved.values).toBeUndefined();

    await page.waitForTimeout(400); // settle the write on file://
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    await expect(page.getByTestId('type-token-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('token-length-input')).toHaveValue('40');
    await expect(page.getByTestId('token-alphabet-select')).toHaveValue('base62');
    await expect(page.getByTestId('count-input')).toHaveValue('8');
    // Restored token type generates 40-char values.
    const v = await page.getByTestId('result-value').first().textContent();
    expect(v.length).toBe(40);
  });

  test('inspect mode + text persists across reload', async ({ page }) => {
    await page.getByTestId('mode-inspect-btn').click();
    await page.getByTestId('inspect-input').fill('550e8400-e29b-41d4-a716-446655440000');
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('inspect-section')).toBeVisible();
    await expect(page.getByTestId('inspect-input')).toHaveValue('550e8400-e29b-41d4-a716-446655440000');
  });

  // ---------------------------------------------------------------------------
  // Test-hook sanity
  // ---------------------------------------------------------------------------
  test('window.__uuidGenerator exposes pure functions and live state', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const u = window.__uuidGenerator;
      return {
        hasUuidV4: typeof u.uuidV4 === 'function',
        hasInspect: typeof u.inspectUuid === 'function',
        hasState: typeof u.state === 'object',
        v4: u.uuidV4(new Uint8Array(16)),
      };
    });
    expect(shape.hasUuidV4).toBe(true);
    expect(shape.hasInspect).toBe(true);
    expect(shape.hasState).toBe(true);
    expect(shape.v4).toBe('00000000-0000-4000-8000-000000000000');
  });
});

// -----------------------------------------------------------------------------
// Mobile viewport — no horizontal overflow at ~375px.
// -----------------------------------------------------------------------------
test.describe('mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollW: doc.scrollWidth, clientW: doc.clientWidth };
    });
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
  });

  test('generation still works on mobile', async ({ page }) => {
    await page.getByTestId('count-input').fill('4');
    await page.getByTestId('generate-btn').click();
    await expect(page.getByTestId('result-row')).toHaveCount(4);
  });
});

test.describe('footer License modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
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
    // New wiring: CtLicense self-wires the footer [data-ct-license] trigger (no window.ctLicense global).
    await expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  // Focus-into-dialog + ✕ / Esc close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens with the ✕ focused and closes via Esc / ✕ / backdrop, returning focus to the trigger', async ({ page }) => {
    await assertLicenseModal(page);
  });

  test('backdrop click closes; a click inside the dialog does not', async ({ page }) => {
    await page.getByTestId('footer-license-link').click();
    const overlay = page.getByTestId('license-overlay');
    await expect(overlay).toBeVisible();
    await page.getByTestId('license-modal').click({ position: { x: 10, y: 10 } });
    await expect(overlay).toBeVisible();
    await overlay.click({ position: { x: 2, y: 2 } });
    await expect(overlay).toBeHidden();
  });
});
