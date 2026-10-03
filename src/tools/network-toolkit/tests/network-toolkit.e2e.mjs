// @playwright/test spec for tools/network-toolkit/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the
// window.__networkToolkit test API described in DESIGN.md § "Testability hooks".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/network-toolkit/).

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');
const TOOL_URL = toolUrl(import.meta.url);

const HELP_SEEN_KEY = helpSeenKey('network-toolkit');
const STORAGE_KEY = 'network-toolkit:v1';

// -----------------------------------------------------------------------------
// First-load Help popup — genuine first-load in a fresh context (NOT seeded).
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

    await page.waitForTimeout(400); // let the file:// storage write settle
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
// Help modal — close paths, focus trap & focus return (pre-seeded).
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

  test('Tab keeps focus within the dialog (focus trap)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
    await page.keyboard.press('Tab');
    // Focus never escapes to the page behind the modal.
    const insideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="help-modal"]');
      return dialog.contains(document.activeElement);
    });
    expect(insideDialog).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Card 1 — Transfer time & rate.
// -----------------------------------------------------------------------------
test.describe('Card 1 — Transfer time & rate', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('default 1 GB @ 100 Mbps shows 1m 20s / 80 s and the reference table', async ({ page }) => {
    await expect(page.getByTestId('transfer-time')).toHaveText('1m 20s');
    await expect(page.getByTestId('transfer-seconds')).toHaveText('80 s');

    const rows = page.getByTestId('transfer-ref-body').locator('tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('1 MB');
    await expect(rows.nth(1)).toContainText('1 GB');
    await expect(rows.nth(1)).toContainText('1m 20s'); // 1 GB @ 100 Mbps = 80s
  });

  test('editing the amount recomputes the time', async ({ page }) => {
    await page.getByTestId('transfer-size').fill('2');
    await expect(page.getByTestId('transfer-seconds')).toHaveText('160 s');
    await expect(page.getByTestId('transfer-time')).toHaveText('2m 40s');
  });

  test('the base toggle changes the result (decimal 80s → binary 81.92s)', async ({ page }) => {
    await expect(page.getByTestId('transfer-seconds')).toHaveText('80 s');
    await page.getByTestId('transfer-base-1024').click();
    await expect(page.getByTestId('transfer-base-1024')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('transfer-base-1000')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('transfer-seconds')).toHaveText('81.92 s');
  });

  test('changing units recomputes (100 MB/s = 800 Mbps → 10 s)', async ({ page }) => {
    await page.getByTestId('transfer-rate-unit').selectOption('MBps');
    await page.getByTestId('transfer-rate').fill('100');
    // 1 GB (8e9 bits) / (100 MB/s = 8e8 bit/s) = 10 s
    await expect(page.getByTestId('transfer-seconds')).toHaveText('10 s');
  });

  test('the unit <select>s carry the base.css chevron and do not clip it', async ({ page }) => {
    for (const id of ['transfer-size-unit', 'transfer-rate-unit']) {
      const sel = page.getByTestId(id);
      const styles = await sel.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundImage, pr: parseFloat(cs.paddingRight) };
      });
      expect(styles.bg).not.toBe('none');       // custom chevron present
      expect(styles.pr).toBeGreaterThanOrEqual(24); // room reserved for it
    }
  });

  test('invalid speed shows a friendly error and does not crash', async ({ page }) => {
    await page.getByTestId('transfer-rate').fill('0');
    await expect(page.getByTestId('transfer-error')).toBeVisible();
    await expect(page.getByTestId('transfer-error')).toContainText(/greater than zero/);
    await expect(page.getByTestId('transfer-time')).toHaveText('');
    // Recovers when fixed.
    await page.getByTestId('transfer-rate').fill('100');
    await expect(page.getByTestId('transfer-error')).toBeHidden();
    await expect(page.getByTestId('transfer-seconds')).toHaveText('80 s');
  });

  test('Copy all flashes feedback', async ({ page }) => {
    const btn = page.getByTestId('transfer-copy-all');
    await btn.click();
    await expect(btn).toHaveText('Copied!');
  });
});

// -----------------------------------------------------------------------------
// Card 2 — CIDR / subnet.
// -----------------------------------------------------------------------------
test.describe('Card 2 — CIDR / subnet', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('default 192.168.1.10/24 renders the canonical results', async ({ page }) => {
    await expect(page.getByTestId('cidr-network')).toHaveText('192.168.1.0');
    await expect(page.getByTestId('cidr-netmask')).toHaveText('255.255.255.0');
    await expect(page.getByTestId('cidr-wildcard')).toHaveText('0.0.0.255');
    await expect(page.getByTestId('cidr-broadcast')).toHaveText('192.168.1.255');
    await expect(page.getByTestId('cidr-first')).toHaveText('192.168.1.1');
    await expect(page.getByTestId('cidr-last')).toHaveText('192.168.1.254');
    await expect(page.getByTestId('cidr-usable')).toHaveText('254');
    await expect(page.getByTestId('cidr-total')).toHaveText('256');
    await expect(page.getByTestId('cidr-cidr')).toHaveText('192.168.1.0/24');
  });

  test('/31 shows 2 usable hosts and the RFC 3021 note', async ({ page }) => {
    await page.getByTestId('cidr-prefix').fill('31');
    await expect(page.getByTestId('cidr-usable')).toHaveText('2');
    await expect(page.getByTestId('cidr-total')).toHaveText('2');
    const note = page.getByTestId('cidr-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText(/RFC 3021|point-to-point/);
  });

  test('/32 shows 1 host and the single-host note', async ({ page }) => {
    await page.getByTestId('cidr-prefix').fill('32');
    await expect(page.getByTestId('cidr-usable')).toHaveText('1');
    await expect(page.getByTestId('cidr-note')).toBeVisible();
    await expect(page.getByTestId('cidr-note')).toContainText(/single host/);
  });

  test('invalid address shows a friendly error without crashing', async ({ page }) => {
    await page.getByTestId('cidr-ip').fill('999.1.1.1');
    await expect(page.getByTestId('cidr-error')).toBeVisible();
    await expect(page.getByTestId('cidr-network')).toHaveText('');
    // Recovers.
    await page.getByTestId('cidr-ip').fill('10.0.0.1');
    await expect(page.getByTestId('cidr-error')).toBeHidden();
    await expect(page.getByTestId('cidr-network')).toHaveText('10.0.0.0');
  });

  test('a per-value copy button flashes ✅', async ({ page }) => {
    const btn = page.getByTestId('cidr-network-copy');
    await btn.click();
    await expect(btn).toHaveText('✅');
  });
});

// -----------------------------------------------------------------------------
// Card 3 — IP converter (single source of truth per family).
// -----------------------------------------------------------------------------
test.describe('Card 3 — IPv4 converter cross-updates', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('loads with all four representations of 192.168.1.10', async ({ page }) => {
    await expect(page.getByTestId('ipv4-dotted')).toHaveValue('192.168.1.10');
    await expect(page.getByTestId('ipv4-int')).toHaveValue('3232235786');
    await expect(page.getByTestId('ipv4-hex')).toHaveValue('0xc0a8010a');
    await expect(page.getByTestId('ipv4-bin')).toHaveValue('11000000.10101000.00000001.00001010');
  });

  test('editing the integer updates dotted / hex / binary (single source of truth)', async ({ page }) => {
    await page.getByTestId('ipv4-int').fill('0');
    await expect(page.getByTestId('ipv4-dotted')).toHaveValue('0.0.0.0');
    await expect(page.getByTestId('ipv4-hex')).toHaveValue('0x00000000');
    await expect(page.getByTestId('ipv4-bin')).toHaveValue('00000000.00000000.00000000.00000000');
    // The field the user is editing is not clobbered.
    await expect(page.getByTestId('ipv4-int')).toHaveValue('0');
  });

  test('editing hex updates the others', async ({ page }) => {
    await page.getByTestId('ipv4-hex').fill('0xffffffff');
    await expect(page.getByTestId('ipv4-dotted')).toHaveValue('255.255.255.255');
    await expect(page.getByTestId('ipv4-int')).toHaveValue('4294967295');
  });

  test('editing dotted updates the others', async ({ page }) => {
    await page.getByTestId('ipv4-dotted').fill('8.8.8.8');
    await expect(page.getByTestId('ipv4-int')).toHaveValue('134744072');
    await expect(page.getByTestId('ipv4-hex')).toHaveValue('0x08080808');
  });

  test('invalid IPv4 shows a friendly error, others left intact', async ({ page }) => {
    await page.getByTestId('ipv4-dotted').fill('256.0.0.0');
    await expect(page.getByTestId('ipv4-error')).toBeVisible();
    // Other fields keep their last-good values (no crash, no wipe).
    await expect(page.getByTestId('ipv4-int')).toHaveValue('3232235786');
  });
});

test.describe('Card 3 — IPv6 converter cross-updates', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('loads with compressed / expanded / hex of 2001:db8::1', async ({ page }) => {
    await expect(page.getByTestId('ipv6-compressed')).toHaveValue('2001:db8::1');
    await expect(page.getByTestId('ipv6-expanded')).toHaveValue('2001:0db8:0000:0000:0000:0000:0000:0001');
    await expect(page.getByTestId('ipv6-hex')).toHaveValue('0x20010db8000000000000000000000001');
  });

  test('editing compressed updates expanded + hex (RFC 5952 canonical)', async ({ page }) => {
    await page.getByTestId('ipv6-compressed').fill('::1');
    await expect(page.getByTestId('ipv6-expanded')).toHaveValue('0000:0000:0000:0000:0000:0000:0000:0001');
    await expect(page.getByTestId('ipv6-hex')).toHaveValue('0x00000000000000000000000000000001');
  });

  test('editing hex updates compressed to canonical form', async ({ page }) => {
    await page.getByTestId('ipv6-hex').fill('0x00000000000000000000000000000001');
    await expect(page.getByTestId('ipv6-compressed')).toHaveValue('::1');
  });

  test('invalid IPv6 (double ::) shows a friendly error', async ({ page }) => {
    await page.getByTestId('ipv6-compressed').fill('2001::db8::1');
    await expect(page.getByTestId('ipv6-error')).toBeVisible();
    await expect(page.getByTestId('ipv6-error')).toContainText(/only once/);
  });
});

// -----------------------------------------------------------------------------
// Card 4 — Netmask ⇄ prefix.
// -----------------------------------------------------------------------------
test.describe('Card 4 — Netmask ⇄ prefix', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('default mask 255.255.255.0 derives /24 + wildcard', async ({ page }) => {
    await expect(page.getByTestId('netmask-out-prefix')).toHaveText('/24');
    await expect(page.getByTestId('netmask-out-mask')).toHaveText('255.255.255.0');
    await expect(page.getByTestId('netmask-out-wildcard')).toHaveText('0.0.0.255');
    await expect(page.getByTestId('netmask-prefix')).toHaveValue('24');
  });

  test('editing the prefix derives the mask (both directions live)', async ({ page }) => {
    await page.getByTestId('netmask-prefix').fill('30');
    await expect(page.getByTestId('netmask-mask')).toHaveValue('255.255.255.252');
    await expect(page.getByTestId('netmask-out-wildcard')).toHaveText('0.0.0.3');
  });

  test('editing the mask derives the prefix', async ({ page }) => {
    await page.getByTestId('netmask-mask').fill('255.255.0.0');
    await expect(page.getByTestId('netmask-prefix')).toHaveValue('16');
    await expect(page.getByTestId('netmask-out-prefix')).toHaveText('/16');
  });

  test('a non-contiguous mask shows a friendly error without crashing', async ({ page }) => {
    await page.getByTestId('netmask-mask').fill('255.0.255.0');
    await expect(page.getByTestId('netmask-error')).toBeVisible();
    await expect(page.getByTestId('netmask-error')).toContainText(/contiguous/);
    await expect(page.getByTestId('netmask-out-prefix')).toHaveText('');
    // Recovers.
    await page.getByTestId('netmask-mask').fill('255.255.255.0');
    await expect(page.getByTestId('netmask-error')).toBeHidden();
    await expect(page.getByTestId('netmask-out-prefix')).toHaveText('/24');
  });
});

// -----------------------------------------------------------------------------
// Persistence across reload (via window.__networkToolkit hooks + settle wait).
// -----------------------------------------------------------------------------
test.describe('persistence across reload', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  test('inputs and unit/base selections survive a reload', async ({ page }) => {
    await page.getByTestId('transfer-size').fill('5');
    await page.getByTestId('transfer-base-1024').click();
    await page.getByTestId('cidr-ip').fill('10.1.2.3');
    await page.getByTestId('cidr-prefix').fill('16');

    await page.waitForTimeout(450); // let the file:// storage write settle
    await page.reload();

    await expect(page.getByTestId('transfer-size')).toHaveValue('5');
    await expect(page.getByTestId('transfer-base-1024')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cidr-ip')).toHaveValue('10.1.2.3');
    await expect(page.getByTestId('cidr-prefix')).toHaveValue('16');
    // Base persisted into live state too.
    const base = await page.evaluate(() => window.__networkToolkit.state.transfer.base);
    expect(base).toBe(1024);
  });

  test('window.__networkToolkit hook is present and inert (pure fns exposed)', async ({ page }) => {
    const api = await page.evaluate(() => {
      const ns = window.__networkToolkit;
      return {
        hasCidr: typeof ns.cidrInfo === 'function',
        hasTransfer: typeof ns.transferTime === 'function',
        cidr24: ns.cidrInfo('192.168.1.10', 24).usableHosts,
      };
    });
    expect(api.hasCidr).toBe(true);
    expect(api.hasTransfer).toBe(true);
    expect(api.cidr24).toBe(254);
  });
});

// -----------------------------------------------------------------------------
// Responsive — wide desktop uses width; result tables scroll in a container.
// -----------------------------------------------------------------------------
test.describe('wide desktop viewport (1600px)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('the app uses more than a narrow column and tables scroll in-container', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    const appWidth = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().width);
    expect(appWidth).toBeGreaterThan(900);

    // No horizontal page overflow even at wide width.
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth <= d.clientWidth + 1;
    });
    expect(overflow).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Mobile viewport — no horizontal overflow at ~375px.
// -----------------------------------------------------------------------------
test.describe('mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 }, deviceScaleFactor: 2 });

  test('the page does not scroll horizontally and every card fits', async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);

    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollW: d.scrollWidth, clientW: d.clientWidth };
    });
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);

    for (const id of ['card-transfer', 'card-cidr', 'card-ipconv', 'card-netmask']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.width).toBeLessThanOrEqual(375 + 1);
    }
  });
});

// -----------------------------------------------------------------------------
// License surface — shared footer "MIT License" link + modal (license.js).
// The footer is inlined by the build on every page. network-toolkit bundles
// NO third-party libraries, so the modal shows the "100% vanilla" note.
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

  test('footer License link opens the modal', async ({ page }) => {
    await page.getByTestId('footer-license-link').click();
    await expect(page.getByTestId('license-modal')).toBeVisible();
    await expect(page.getByTestId('license-modal')).toContainText('MIT License');
  });
});
