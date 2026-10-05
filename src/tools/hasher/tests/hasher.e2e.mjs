// @playwright/test spec for tools/hasher/index.html.
//
// Dev/test-only. index.html is a dependency-free single file and does not
// reference this package or @playwright/test in any way — this spec drives the
// finished page from the outside via data-testid hooks and the window.__hasher
// test API described in DESIGN.md § "Test hooks".
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/hasher/).

import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen as seedHelpSeenShared } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertNotPersisted, assertOnlyKeys, assertLacksKeys, settleStorage } from '../../../lib/test-support/storage.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { stubClipboard, readClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, assertDropDispatch } from '../../../lib/test-support/interaction.mjs';
import { uploadFile } from '../../../lib/test-support/files.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// First-load Help auto-shows once, keyed off localStorage "hasher:help-seen:v1".
// Every test EXCEPT the dedicated "first-load Help" suite pre-seeds that key via
// addInitScript (set before the page's own module runs) so the auto-shown modal
// never interferes with unrelated assertions.
const HELP_SEEN_KEY = helpSeenKey('hasher');
const STORAGE_KEY = 'hasher:v1';

// Published vectors used in-DOM.
const MD5_ABC = '900150983cd24fb0d6963f7d28e17f72';
const SHA1_ABC = 'a9993e364706816aba3e25717850c26c9cd0d89d';
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const CRC32_ABC = '352441c2';
// HMAC over "abc" with the key "key".
const HMAC_MD5_KEY_ABC = 'd2fe98063f876b03193afb49b4979591';
const HMAC_SHA1_KEY_ABC = '4fd0b215276ef12f2b3e4c8ecac2811498b656fc';
const HMAC_SHA256_KEY_ABC = '9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab';

async function seedHelpSeen(page) {
  await seedHelpSeenShared(page, HELP_SEEN_KEY);
}

// -----------------------------------------------------------------------------
// First-load Help — genuine first-load in a fresh context (NOT pre-seeded).
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
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('Help modal a11y contract (role/aria-modal, focus on ✕, focus trap, Esc/✕/backdrop close + focus return)', async ({ page }) => {
    await assertModalA11y(page);
  });
});

// -----------------------------------------------------------------------------
// All algorithms shown at once — no algorithm-selection card anymore.
// -----------------------------------------------------------------------------
test.describe('all algorithms shown at once', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('there is NO algorithm-checkbox card', async ({ page }) => {
    // The old per-algorithm toggles and the "no algorithms" note are gone.
    await expect(page.getByTestId('algo-toggles')).toHaveCount(0);
    await expect(page.getByTestId('algo-md5')).toHaveCount(0);
    await expect(page.getByTestId('algo-sha256')).toHaveCount(0);
    await expect(page.getByTestId('no-algos-note')).toHaveCount(0);
    await expect(page.getByTestId('hmac-toggle')).toHaveCount(0);
  });

  test('every plain digest field is present (empty → em-dash placeholder)', async ({ page }) => {
    for (const a of ['md5', 'sha1', 'sha256', 'sha512', 'crc32']) {
      await expect(page.getByTestId('result-' + a)).toBeVisible();
      const val = page.getByTestId('value-' + a + '-hex');
      await expect(val).toHaveValue('');
      await expect(val).toHaveAttribute('placeholder', '—');
    }
  });

  test('every HMAC field is present with a key field; CRC32 has no HMAC', async ({ page }) => {
    await expect(page.getByTestId('hmac-section')).toBeVisible();
    await expect(page.getByTestId('hmac-key-field')).toBeVisible();
    await expect(page.getByTestId('hmac-key')).toBeVisible();
    for (const a of ['md5', 'sha1', 'sha256', 'sha512']) {
      await expect(page.getByTestId('result-hmac-' + a)).toBeVisible();
      await expect(page.getByTestId('value-hmac-' + a + '-hex')).toHaveValue('');
    }
    // No HMAC-CRC32.
    await expect(page.getByTestId('result-hmac-crc32')).toHaveCount(0);
  });

  test('typing text fills in every plain digest at once with correct values', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await expect(page.getByTestId('value-md5-hex')).toHaveValue(MD5_ABC);
    await expect(page.getByTestId('value-sha1-hex')).toHaveValue(SHA1_ABC);
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);
    await expect(page.getByTestId('value-crc32-hex')).toHaveValue(CRC32_ABC);
  });

  test('clearing text returns every field to the em-dash placeholder', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);
    await page.getByTestId('clear-text-btn').click();
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue('');
    await expect(page.getByTestId('value-md5-hex')).toHaveValue('');
  });
});

// -----------------------------------------------------------------------------
// Plain AND HMAC shown together; HMAC updates live as the key is typed.
// -----------------------------------------------------------------------------
test.describe('plain and HMAC together, live', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('plain digests stay put; HMAC fields fill in live as the key is typed', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    // Plain values present.
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);
    // HMAC fields blank while no key.
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue('');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveAttribute('placeholder', '—');

    // Type the key → HMAC fields fill in live, plain values UNCHANGED.
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-md5-hex')).toHaveValue(HMAC_MD5_KEY_ABC);
    await expect(page.getByTestId('value-hmac-sha1-hex')).toHaveValue(HMAC_SHA1_KEY_ABC);
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue(HMAC_SHA256_KEY_ABC);
    // Plain SHA-256 is still the plain digest (not replaced by HMAC).
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);
  });

  test('clearing the key returns HMAC fields to the neutral placeholder (no error)', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue(HMAC_SHA256_KEY_ABC);

    await page.getByTestId('hmac-key').fill('');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue('');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveAttribute('placeholder', '—');
    // No error surfaced anywhere.
    await expect(page.getByTestId('file-error')).toBeHidden();
  });

  test('with a key but no source, HMAC stays a placeholder', async ({ page }) => {
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue('');
  });
});

// -----------------------------------------------------------------------------
// Base64 toggle (pre-seeded).
// -----------------------------------------------------------------------------
test.describe('Base64 toggle', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('adds a Base64 field to the SHA-family plain and HMAC digests', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await page.getByTestId('hmac-key').fill('key');

    // No Base64 fields by default.
    await expect(page.getByTestId('value-sha256-base64')).toHaveCount(0);
    await expect(page.getByTestId('value-hmac-sha256-base64')).toHaveCount(0);
    // MD5/CRC32 never get a Base64 field.
    await expect(page.getByTestId('value-md5-base64')).toHaveCount(0);
    await expect(page.getByTestId('value-crc32-base64')).toHaveCount(0);

    await page.getByTestId('base64-toggle').check();
    const plainB64 = Buffer.from(SHA256_ABC, 'hex').toString('base64');
    const hmacB64 = Buffer.from(HMAC_SHA256_KEY_ABC, 'hex').toString('base64');
    await expect(page.getByTestId('value-sha256-base64')).toHaveValue(plainB64);
    await expect(page.getByTestId('value-hmac-sha256-base64')).toHaveValue(hmacB64);
    // Still no Base64 for MD5/CRC32.
    await expect(page.getByTestId('value-md5-base64')).toHaveCount(0);
    await expect(page.getByTestId('value-crc32-base64')).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------------
// HMAC key secrecy (pre-seeded).
// -----------------------------------------------------------------------------
test.describe('HMAC key secrecy', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the HMAC key is NOT written to localStorage, nor has it a copy button', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await page.getByTestId('hmac-key').fill('super-secret-key-value');
    await expect(page.getByTestId('value-hmac-sha256-hex')).not.toHaveValue('');

    // The secret key field must NOT carry an in-field copy affordance.
    const keyFieldCopies = await page
      .getByTestId('hmac-key-field')
      .locator('.ct-copy-btn')
      .count();
    expect(keyFieldCopies).toBe(0);

    // Scan the full localStorage: the secret key must appear nowhere, and the
    // persisted blob must carry only the non-sensitive keys.
    const { local: dump } = await assertNotPersisted(page, 'super-secret-key-value');

    const saved = JSON.parse(dump[STORAGE_KEY]);
    assertLacksKeys(saved, ['hmacKey', 'hmacEnabled']);
    assertOnlyKeys(saved, ['inputText', 'mode', 'showBase64']);
  });
});

// -----------------------------------------------------------------------------
// File mode (pre-seeded).
// -----------------------------------------------------------------------------
test.describe('file mode', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('a selected file is hashed as its raw bytes', async ({ page }) => {
    await page.getByTestId('mode-file-btn').click();
    await expect(page.getByTestId('file-section')).toBeVisible();
    await expect(page.getByTestId('text-section')).toBeHidden();

    // Contents "abc" → sha256("abc") vector.
    await uploadFile(page, 'file-input', {
      name: 'sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('abc', 'utf-8'),
    });

    await expect(page.getByTestId('file-info')).toBeVisible();
    await expect(page.getByTestId('file-info').locator('.file-name')).toHaveText('sample.txt');
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);

    // Remove clears back to no-source (em-dash placeholder).
    await page.getByTestId('remove-file-btn').click();
    await expect(page.getByTestId('file-info')).toBeHidden();
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue('');
  });
});

// -----------------------------------------------------------------------------
// Copy buttons (pre-seeded).
// -----------------------------------------------------------------------------
test.describe('copy feedback', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await page.getByTestId('text-input').fill('abc');
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(SHA256_ABC);
  });

  test('per-field copy button flashes ✅ then reverts to 📋', async ({ page }) => {
    const btn = page.getByTestId('copy-sha256-hex');
    await expect(btn).toHaveText('📋');
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: '✅', revert: '📋' });
  });

  test('an HMAC field copy button copies its keyed digest', async ({ page }) => {
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue(HMAC_SHA256_KEY_ABC);
    const btn = page.getByTestId('copy-hmac-sha256-hex');
    await expect(btn).toHaveText('📋');
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: '✅', revert: '📋' });
  });

  test('the text input reveals its in-field copy only when non-empty', async ({ page }) => {
    // "abc" already filled in beforeEach → copy visible.
    await expect(page.getByTestId('text-input-copy')).toBeVisible();
    await page.getByTestId('clear-text-btn').click();
    await expect(page.getByTestId('text-input-copy')).toBeHidden();
    await page.getByTestId('text-input').fill('x');
    await expect(page.getByTestId('text-input-copy')).toBeVisible();
  });

  test('"Copy all" flashes its label then reverts, and copies plain + HMAC', async ({ page }) => {
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue(HMAC_SHA256_KEY_ABC);

    const btn = page.getByTestId('copy-all-btn');
    await stubClipboard(page);
    await expectCopyFlash(btn, { flash: 'Copied!', revert: 'Copy all' });

    // The stub captures the exact write (no headless-clipboard flakiness).
    const clip = await readClipboard(page);
    expect(clip).toContain(`SHA-256: ${SHA256_ABC}`);
    expect(clip).toContain(`HMAC-SHA-256: ${HMAC_SHA256_KEY_ABC}`);
  });

  test('Copy all is disabled with no source', async ({ page }) => {
    await page.getByTestId('clear-text-btn').click();
    await expect(page.getByTestId('copy-all-btn')).toBeDisabled();
  });
});

// -----------------------------------------------------------------------------
// Persistence (pre-seeded). Drive via the tool's own state, verify on reload.
// -----------------------------------------------------------------------------
test.describe('localStorage persistence', () => {
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('mode, input and Base64 toggle persist across reload', async ({ page }) => {
    await page.getByTestId('text-input').fill('persist me');
    await page.getByTestId('base64-toggle').check();

    const saved = await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.inputText === 'persist me' && v.showBase64 === true });
    expect(saved.inputText).toBe('persist me');
    expect(saved.showBase64).toBe(true);
    expect(Object.keys(saved).sort()).toEqual(['inputText', 'mode', 'showBase64']);

    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    await expect(page.getByTestId('text-input')).toHaveValue('persist me');
    await expect(page.getByTestId('base64-toggle')).toBeChecked();
    await expect(page.getByTestId('value-sha256-base64')).toBeVisible();
  });

  test('the HMAC key does not survive a reload (never persisted)', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue(HMAC_SHA256_KEY_ABC);

    await settleStorage(page, STORAGE_KEY, { predicate: (v) => v.inputText === 'abc' });
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    // Key field back to empty, HMAC fields blank again.
    await expect(page.getByTestId('hmac-key')).toHaveValue('');
    await expect(page.getByTestId('value-hmac-sha256-hex')).toHaveValue('');
  });
});

// -----------------------------------------------------------------------------
// Footer License modal — the shared license surface carried by footer.html.
// The footer link opens a MIT-license modal (same accessible pattern as Help).
// -----------------------------------------------------------------------------
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
    // Close affordance.
    await expect(page.getByTestId('license-close-x')).toBeVisible();
    // No-dependencies note (this tool bundles nothing).
    await expect(modal).toContainText('100% vanilla');
    await expect(modal).toContainText('no runtime dependencies');
    // The modal is opened via the [data-jbc-license] trigger (no window API global).
  });

  // Focus trap + Esc / ✕ / backdrop close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});

// -----------------------------------------------------------------------------
// Test hook sanity.
// -----------------------------------------------------------------------------
test('window.__hasher exposes pure functions and live state', async ({ page }) => {
  await seedHelpSeen(page);
  await page.goto(TOOL_URL);
  await assertHookShape(page, '__hasher', { sha256: 'function', hmac: 'function', state: 'object' });
  const shape = await page.evaluate(() => {
    const h = window.__hasher;
    const enc = new TextEncoder();
    return {
      sha256abc: h.bytesToHex(h.sha256(enc.encode('abc'))),
      crc: h.crc32Hex(enc.encode('123456789')),
    };
  });
  expect(shape.sha256abc).toBe(SHA256_ABC);
  expect(shape.crc).toBe('cbf43926');
});

// -----------------------------------------------------------------------------
// Wide viewport — the value fields use the available width (past the old cap).
// -----------------------------------------------------------------------------
test.describe('wide viewport (1600px)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the value fields fill the width and the page does not overflow', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await expect(page.getByTestId('value-sha256-hex')).toHaveValue(/.+/);

    // The app wrapper is materially wider than the old 880px cap.
    const app = await page.locator('.app').boundingBox();
    expect(app.width).toBeGreaterThan(1050);
    // No horizontal page overflow at a wide viewport.
    await expectNoOverflow(page);
    // A digest value field widens well past the old narrow column.
    const box = await page.getByTestId('value-sha256-hex').boundingBox();
    expect(box.width).toBeGreaterThan(900);
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

  test('the page does not scroll horizontally with all digests + Base64 + HMAC shown', async ({ page }) => {
    await page.getByTestId('text-input').fill('abc');
    await page.getByTestId('base64-toggle').check();
    await page.getByTestId('hmac-key').fill('key');
    await expect(page.getByTestId('value-hmac-sha512-hex')).toHaveValue(/.+/);

    await expectNoOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// Real file drop — the wireDropzone DnD path (dragenter/over/drop with a real
// DataTransfer+FileList). The rest of the suite loads files via setInputFiles /
// test hooks, which never touch this path; this pins it so a wireDropzone
// regression (dropped preventDefault, missing drag class, lost FileList) is red.
// ---------------------------------------------------------------------------
test.describe('file drop (real DnD on the dropzone)', () => {
  // This suite scopes beforeEach per-describe, so navigate here too. The
  // dropzone lives in the (default-hidden) file-section — synthetic DnD events
  // fire on attached-but-hidden nodes, so no mode switch is needed.
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page);
    await page.goto(TOOL_URL);
  });
  test('dropping a file toggles the drag class, preventDefaults, and delivers the FileList', async ({ page }) => {
    await assertDropDispatch(page, { selector: '.dropzone', dragClass: 'drag-over' });
  });
});
