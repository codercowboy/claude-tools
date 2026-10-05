// @playwright/test spec for tools/invisible-chars/index.html. Dev/test-only; the
// shipped page is dependency-free and drives nothing from here. Drives the built
// page from outside via data-testid hooks and the inert window.__invisibleChars hook.
import { test, expect } from '@playwright/test';
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows, assertHookShape, trackPageErrors } from '../../../lib/test-support/interaction.mjs';
import { expectNoOverflow } from '../../../lib/test-support/layout.mjs';
import { settleStorage, assertNotPersisted } from '../../../lib/test-support/storage.mjs';
import { stubClipboard, readClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('invisible-chars');
const STORAGE_KEY = 'invisible-chars:v1';

// Every test fails on an uncaught page error or a console.error.
test.beforeEach(async ({ page }) => {
  const errs = trackPageErrors(page);
  page.on('console', (m) => { if (m.type() === 'error') errs.errors.push('console.error: ' + m.text()); });
  page.__errs = errs;
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
  await page.waitForFunction(() => !!window.__invisibleChars);
});
test.afterEach(async ({ page }) => { page.__errs.assertNone(); });

const SAMPLE = 'Hello\u200Bworld\uFEFF visit p\u0430ypal.com\u00A0today\nTotal:\u202E 100\u202C USD\nHidden: \u{E0068}\u{E0069}\u{E0021}\nFamily: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a \u2764\uFE0F\n';
const T = (page, id) => page.getByTestId(id);
const chips = (page) => T(page, 'reveal').getByTestId('chip');

async function paste(page, text) {
  await T(page, 'input').fill(text);
}

test.describe('shell', () => {
  test('hook shape, License modal, Help a11y', async ({ page }) => {
    await assertHookShape(page, '__invisibleChars', { scan: 'function', clean: 'function', normalizeText: 'function', cpLabel: 'function', decodeTag: 'function', setInput: 'function', state: 'object' });
    await assertLicenseModal(page);
    await assertModalA11y(page, { labelledBy: 'help-title' });
  });

  test('first-load Help auto-shows once', async ({ browser }) => {
    await assertHelpAutoShows(browser, TOOL_URL, { seenKey: HELP_SEEN_KEY, text: 'Reveal' });
  });

  test('empty state invites a paste; nothing flagged', async ({ page }) => {
    await expect(T(page, 'summary')).toContainText('Paste some text');
    await expect(chips(page)).toHaveCount(0);
    await expect(T(page, 'clean-output')).toHaveValue('');
  });
});

test.describe('paste -> chips -> inspector', () => {
  test('sample text yields exactly the expected chips, in order, with labels', async ({ page }) => {
    await paste(page, SAMPLE);
    await expect(chips(page)).toHaveCount(12);
    expect(await chips(page).allTextContents()).toEqual([
      'ZWSP U+200B', 'BOM U+FEFF', '\u0430 U+0430 ~ a', 'NBSP U+00A0', 'RLO U+202E', 'PDF U+202C',
      'TAG U+E0068', 'TAG U+E0069', 'TAG U+E0021', 'ZWJ U+200D', 'ZWJ U+200D', 'VS16 U+FE0F',
    ]);
    // categories drive colour classes / data-category
    expect(await chips(page).evaluateAll((els) => els.map((e) => e.dataset.category))).toEqual([
      'zerowidth', 'zerowidth', 'confusable', 'space', 'bidi', 'bidi', 'tag', 'tag', 'tag', 'zerowidth', 'zerowidth', 'variation',
    ]);
    // normal text stays plain and \n stays a real line break
    const text = await T(page, 'reveal').evaluate((n) => n.textContent);
    expect(text).toContain('Hello');
    expect(text).toContain('Total:');
    expect(await T(page, 'reveal').evaluate((n) => getComputedStyle(n).whiteSpace)).toBe('pre-wrap');
    // legit emoji chips are marked dashed/legit
    await expect(chips(page).nth(9)).toHaveClass(/legit/);
    await expect(chips(page).nth(0)).not.toHaveClass(/legit/);
  });

  test('summary badge, per-category stats, mixed-script + hidden-ASCII banners', async ({ page }) => {
    await paste(page, SAMPLE);
    await expect(T(page, 'badge')).toHaveText('12 suspicious');
    await expect(T(page, 'stat-flagged')).toHaveText('12');
    await expect(T(page, 'stat-total')).toHaveText(String([...SAMPLE].length));
    await expect(T(page, 'stat-zerowidth')).toHaveText('4');
    await expect(T(page, 'stat-bidi')).toHaveText('2');
    await expect(T(page, 'stat-tag')).toHaveText('3');
    await expect(T(page, 'stat-confusable')).toHaveText('1');
    await expect(T(page, 'mixed-banner')).toBeVisible();
    await expect(T(page, 'mixed-banner')).toContainText('p\u0430ypal');
    await expect(T(page, 'mixed-word')).toHaveCount(1);
    await expect(T(page, 'mixed-word')).toContainText('p\u0430 U+0430 ~ aypal'); // the chip sits inside the underlined word
    await expect(T(page, 'hidden-banner')).toContainText('"hi!"');
  });

  test('clean text shows the Clean badge and no chips', async ({ page }) => {
    await paste(page, 'Just ordinary text, tabs\tand\nnewlines.');
    await expect(T(page, 'badge')).toHaveText('Clean');
    await expect(chips(page)).toHaveCount(0);
    await expect(T(page, 'mixed-banner')).toBeHidden();
  });

  test('clicking a chip fills the inspector (UTF-8 bytes, UTF-16, gc, position)', async ({ page }) => {
    await paste(page, SAMPLE);
    await chips(page).nth(0).click();
    await expect(T(page, 'insp-name')).toHaveText('ZERO WIDTH SPACE');
    await expect(T(page, 'insp-hex')).toHaveText('U+200B');
    await expect(T(page, 'insp-utf8')).toHaveText('E2 80 8B');
    await expect(T(page, 'insp-utf16')).toHaveText('200B');
    await expect(T(page, 'insp-gc')).toHaveText('Cf');
    await expect(T(page, 'insp-pos')).toContainText('index 5 (UTF-16), line 1, column 6');
    await expect(chips(page).nth(0)).toHaveAttribute('aria-pressed', 'true');

    await chips(page).nth(2).click(); // Cyrillic a
    await expect(T(page, 'insp-hex')).toHaveText('U+0430');
    await expect(T(page, 'insp-utf8')).toHaveText('D0 B0');
    await expect(T(page, 'insp-confusable')).toContainText('"a" (Cyrillic)');
    await expect(chips(page).nth(0)).toHaveAttribute('aria-pressed', 'false');

    await chips(page).nth(7).click(); // tag i
    await expect(T(page, 'insp-utf8')).toHaveText('F3 A0 81 A9');
    await expect(T(page, 'insp-utf16')).toHaveText('DB40 DC69');
    await expect(T(page, 'insp-decoded')).toHaveText('i');
  });

  test('the all-flagged table lists rows and selects on click and on Enter', async ({ page }) => {
    await paste(page, SAMPLE);
    await T(page, 'flag-list').locator('summary').click();
    await expect(T(page, 'flag-row')).toHaveCount(12);
    await T(page, 'flag-row').nth(4).click();
    await expect(T(page, 'insp-hex')).toHaveText('U+202E');
    await T(page, 'flag-row').nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(T(page, 'insp-hex')).toHaveText('U+FEFF');
  });

  test('chips are keyboard operable', async ({ page }) => {
    await paste(page, 'a\u200Bb');
    await chips(page).first().focus();
    await page.keyboard.press('Enter');
    await expect(T(page, 'insp-hex')).toHaveText('U+200B');
  });

  test('lone surrogate and astral input: inspector says invalid / UTF-16 pair', async ({ page }) => {
    await page.evaluate(() => window.__invisibleChars.setInput('a\uD800b\u{1F600}\u200B'));
    await expect(chips(page)).toHaveCount(2);
    await chips(page).first().click();
    await expect(T(page, 'insp-name')).toContainText('UNPAIRED SURROGATE');
    await expect(T(page, 'insp-utf8')).toContainText('invalid');
    await expect(T(page, 'stat-total')).toHaveText('5');
  });

  test('user text is rendered as text, never as HTML', async ({ page }) => {
    const evil = '<img src=x onerror="window.__pwn=1"><b id="inj">x</b>\u200B<script>window.__pwn=2</script>';
    await paste(page, evil);
    await expect(chips(page)).toHaveCount(1);
    expect(await T(page, 'reveal').evaluate((n) => n.textContent)).toContain('<img src=x onerror="window.__pwn=1">');
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    expect(await page.locator('#inj').count()).toBe(0);
    expect(await T(page, 'reveal').locator('img, script, b').count()).toBe(0);
  });

  test('confusables toggle hides/shows confusable chips; mixed-script underline stays', async ({ page }) => {
    await paste(page, 'p\u0430ypal \u2019');
    await expect(chips(page)).toHaveCount(2);
    await page.locator('#show-confusables').uncheck();
    await expect(chips(page)).toHaveCount(0);
    await expect(T(page, 'mixed-word')).toHaveCount(1);
    await page.locator('#show-confusables').check();
    await expect(chips(page)).toHaveCount(2);
  });

  test('huge input: chips are capped with a note, cleaning still covers everything', async ({ page }) => {
    await page.evaluate(() => window.__invisibleChars.setInput('a\u200B'.repeat(6000)));
    await expect(chips(page)).toHaveCount(5000);
    await expect(T(page, 'reveal-note')).toContainText('first 5000 of 6000');
    await expect(T(page, 'clean-output')).toHaveValue('a'.repeat(6000));
    await expect(T(page, 'stat-flagged')).toHaveText('6000');
  });
});

test.describe('clean panel', () => {
  test('default clean output is exact and stats line matches', async ({ page }) => {
    await paste(page, SAMPLE);
    const expected = 'Helloworld visit p\u0430ypal.com today\nTotal: 100 USD\nHidden: \nFamily: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a \u2764\uFE0F\n';
    await expect(T(page, 'clean-output')).toHaveValue(expected);
    await expect(T(page, 'clean-stats')).toContainText('Removed 7 · converted 1 · replaced 0');
    // live per-option counts
    await expect(T(page, 'strip-count-zerowidth')).toHaveText('(4)');
    await expect(T(page, 'strip-count-tag')).toHaveText('(3)');
    await expect(T(page, 'count-space')).toHaveText('(1)');
  });

  test('unchecking a category keeps exactly that category', async ({ page }) => {
    await paste(page, 'a\u200Bb\u202Ec\u00ADd');
    await expect(T(page, 'clean-output')).toHaveValue('abcd');
    await T(page, 'strip-bidi').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('ab\u202Ecd');
    await T(page, 'strip-bidi').check();
    await T(page, 'strip-zerowidth').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('a\u200Bbcd');
  });

  test('VS1-16 and emoji preservation controls', async ({ page }) => {
    await paste(page, 'x\uFE0Fy \u2764\uFE0F \u{1F468}\u200D\u{1F469}');
    await expect(T(page, 'clean-output')).toHaveValue('x\uFE0Fy \u2764\uFE0F \u{1F468}\u200D\u{1F469}');
    await T(page, 'strip-vs1to16').check();
    await expect(T(page, 'clean-output')).toHaveValue('xy \u2764\uFE0F \u{1F468}\u200D\u{1F469}'); // emoji VS16 kept
    await T(page, 'opt-preserve-emoji').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('xy \u2764 \u{1F468}\u{1F469}');
  });

  test('space/separator conversion toggles', async ({ page }) => {
    await paste(page, 'a\u00A0b\u3000c\u2028d');
    await expect(T(page, 'clean-output')).toHaveValue('a b c\nd');
    await T(page, 'opt-spaces').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('a\u00A0b\u3000c\nd');
    await T(page, 'opt-separators').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('a\u00A0b\u3000c\u2028d');
  });

  test('replace confusables is opt-in; warns when real Cyrillic words are present', async ({ page }) => {
    await paste(page, 'p\u0430ypal');
    await expect(T(page, 'clean-output')).toHaveValue('p\u0430ypal');
    await T(page, 'opt-confusables').check();
    await expect(T(page, 'clean-output')).toHaveValue('paypal');
    await expect(T(page, 'confusable-warning')).toBeHidden();
    await paste(page, '\u043F\u0440\u0438\u0432\u0435\u0442 \u043C\u0438\u0440');
    await expect(T(page, 'confusable-warning')).toBeVisible();
    await expect(T(page, 'confusable-warning')).toContainText('Cyrillic or Greek');
    await T(page, 'opt-confusables').uncheck();
    await expect(T(page, 'confusable-warning')).toBeHidden();
  });

  test('collapse and trim', async ({ page }) => {
    await paste(page, '  a   b  ');
    await expect(T(page, 'clean-output')).toHaveValue('  a   b  ');
    await T(page, 'opt-collapse').check();
    await T(page, 'opt-trim').check();
    await expect(T(page, 'clean-output')).toHaveValue('a b');
  });

  test('segmented normalize None / NFC / NFKC with banner and keyboard', async ({ page }) => {
    await paste(page, 'e\u0301 \uFF21 \uFB01 a\u200Bb');
    const seg = T(page, 'normalize-seg');
    await expect(T(page, 'normalize-none')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'clean-output')).toHaveValue('e\u0301 \uFF21 \uFB01 ab');
    await expect(T(page, 'normalize-banner')).toBeHidden();

    await T(page, 'normalize-nfc').click();
    await expect(T(page, 'normalize-nfc')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'normalize-none')).toHaveAttribute('aria-pressed', 'false');
    await expect(T(page, 'clean-output')).toHaveValue('\u00E9 \uFF21 \uFB01 ab');
    await expect(T(page, 'normalize-banner')).toContainText('NFC normalization changed 2 code points');

    await T(page, 'normalize-nfc').focus();
    await page.keyboard.press('ArrowRight');
    await expect(T(page, 'normalize-nfkc')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'clean-output')).toHaveValue('\u00E9 A fi ab');
    await expect(T(page, 'normalize-banner')).toContainText('NFKC');
    await expect(seg.locator('[aria-pressed="true"]')).toHaveCount(1);

    // normalize is no substitute for stripping: with zero-width unchecked, ZWSP survives NFKC
    await T(page, 'strip-zerowidth').uncheck();
    await expect(T(page, 'clean-output')).toHaveValue('\u00E9 A fi a\u200Bb');
  });

  test('Clean & copy copies the exact output and announces it', async ({ page }) => {
    await stubClipboard(page);
    await paste(page, 'a\u200Bb\u00A0c');
    await T(page, 'clean-and-copy').click();
    await expect.poll(() => readClipboard(page)).toBe('ab c');
    await expect(page.locator('[role="status"][aria-live="polite"]').last()).toContainText('Cleaned: removed 1, converted 1, replaced 0', { timeout: 5000 });
  });

  test('in-field copy button flashes and copies the output', async ({ page }) => {
    await stubClipboard(page);
    await paste(page, 'x\u200By');
    await expect(T(page, 'clean-output')).toHaveValue('xy');
    await expectCopyFlash(T(page, 'clean-copy'), { flash: '\u2705', revert: '\u{1F4CB}' });
    expect(await readClipboard(page)).toBe('xy');
  });
});

test.describe('sample, clear, persistence', () => {
  test('Load sample fills the input; Clear empties it', async ({ page }) => {
    await T(page, 'load-sample').click();
    await expect(T(page, 'input')).not.toHaveValue('');
    await expect(chips(page)).toHaveCount(12);
    await expect(T(page, 'badge')).toHaveText('12 suspicious');
    await T(page, 'input-clear').click();
    await expect(T(page, 'input')).toHaveValue('');
    await expect(chips(page)).toHaveCount(0);
    await expect(T(page, 'summary')).toContainText('Paste some text');
  });

  test('options persist across reload; the input text never does', async ({ page }) => {
    await paste(page, 'secret\u200Btext-xyzzy');
    await T(page, 'normalize-nfkc').click();
    await T(page, 'opt-confusables').check();
    await T(page, 'strip-bidi').uncheck();
    await T(page, 'strip-vs1to16').check();
    await T(page, 'opt-trim').check();
    await page.locator('#show-confusables').uncheck();
    const stored = await settleStorage(page, STORAGE_KEY, { predicate: (v) => v && v.normalize === 'NFKC' && v.strip_bidi === false && v.showConfusables === false && v.trim === true });
    expect(stored.replaceConfusables).toBe(true);
    expect(stored.strip_vs1to16).toBe(true);
    await assertNotPersisted(page, ['xyzzy', 'secret']);

    await page.reload();
    await page.waitForFunction(() => !!window.__invisibleChars);
    await expect(T(page, 'input')).toHaveValue('');
    await expect(T(page, 'normalize-nfkc')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'opt-confusables')).toBeChecked();
    await expect(T(page, 'strip-bidi')).not.toBeChecked();
    await expect(T(page, 'strip-vs1to16')).toBeChecked();
    await expect(T(page, 'opt-trim')).toBeChecked();
    await expect(page.locator('#show-confusables')).not.toBeChecked();
    await expect(T(page, 'strip-zerowidth')).toBeChecked();
  });

  test('corrupt stored options fall back to defaults', async ({ page }) => {
    await page.evaluate((k) => localStorage.setItem(k, '{"normalize":"BOGUS","spaces":"x"'), STORAGE_KEY);
    await page.reload();
    await page.waitForFunction(() => !!window.__invisibleChars);
    await expect(T(page, 'normalize-none')).toHaveAttribute('aria-pressed', 'true');
    await expect(T(page, 'opt-spaces')).toBeChecked();
    await expect(T(page, 'opt-confusables')).not.toBeChecked();
  });
});

test.describe('responsive + a11y', () => {
  test('no horizontal overflow at phone width with the sample loaded', async ({ page }) => {
    await T(page, 'load-sample').click();
    await expect(chips(page)).toHaveCount(12);
    await T(page, 'flag-list').locator('summary').click();
    await expectNoOverflow(page, { viewport: { width: 375, height: 800 } });
    await chips(page).nth(0).click();
    await expectNoOverflow(page);
  });

  test('wide viewport has no overflow either', async ({ page }) => {
    await T(page, 'load-sample').click();
    await expectNoOverflow(page, { viewport: { width: 1600, height: 900 } });
  });

  test('landmarks: labelled regions, live summary, labelled controls', async ({ page }) => {
    await expect(T(page, 'reveal')).toHaveAttribute('role', 'region');
    await expect(T(page, 'summary')).toHaveAttribute('aria-live', 'polite');
    await paste(page, 'a\u200Bb');
    await expect(chips(page).first()).toHaveAttribute('aria-label', 'ZERO WIDTH SPACE, U+200B');
    await expect(page.locator('label[for="input"]')).toHaveCount(1);
    await expect(page.locator('label[for="clean-output"]')).toHaveCount(1);
  });

  test('dark colour scheme renders (no errors)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await T(page, 'load-sample').click();
    await expect(chips(page)).toHaveCount(12);
  });
});

test('built page is self-contained: no external requests, no stray module syntax', async ({ page }) => {
  const reqs = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) reqs.push(u); });
  await page.reload();
  await page.waitForFunction(() => !!window.__invisibleChars);
  expect(reqs).toEqual([]);
});
