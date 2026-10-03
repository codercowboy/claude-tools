// @playwright/test spec for tools/color-converter/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec
// drives the finished page from the outside via data-testid hooks and the
// window.__colorConverter test API described in DESIGN.md § Testability and
// PLAN.md § 10.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/color-converter/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('color-converter');

// Row-input live conversion is debounced ~150ms (PLAN.md § 5). Give it
// comfortable headroom in real-typing tests.
const DEBOUNCE_WAIT = 300;

// Pre-seed the Help modal's "seen" flag before every test's navigation, via
// addInitScript (runs before index.html's own scripts on every navigation in
// this page/context). This repo's convention (docs/conventions.md "First-load
// help popup") has the Help modal auto-show once on a genuinely fresh visit —
// without this, every single test below would hit that auto-shown modal on
// load and have to deal with it. The dedicated "help modal" describe block
// further down opens its own fresh browser contexts (bypassing this seeded
// `page` fixture) specifically to exercise the real first-visit behavior.
test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. parseColor purity across ALL accepted forms, plus invalids -> null.
// ---------------------------------------------------------------------------
test.describe('parseColor: hex forms', () => {
  test('3-digit shorthand, with and without #, doubles each nibble, alpha=1', async ({ page }) => {
    const out = await page.evaluate(() => ({
      withHash: window.__colorConverter.parseColor('#abc'),
      withoutHash: window.__colorConverter.parseColor('abc'),
    }));
    const expected = { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 };
    expect(out.withHash).toEqual(expected);
    expect(out.withoutHash).toEqual(expected);
  });

  test('4-digit shorthand (#rgba) doubles the alpha nibble too', async ({ page }) => {
    const out = await page.evaluate(() => window.__colorConverter.parseColor('#abcd'));
    // alpha nibble 'd' doubled -> 0xdd = 221 -> 221/255
    expect(out).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 });
  });

  test('6-digit #rrggbb, with and without #, alpha=1', async ({ page }) => {
    const out = await page.evaluate(() => ({
      withHash: window.__colorConverter.parseColor('#112233'),
      withoutHash: window.__colorConverter.parseColor('112233'),
    }));
    const expected = { r: 0x11, g: 0x22, b: 0x33, a: 1 };
    expect(out.withHash).toEqual(expected);
    expect(out.withoutHash).toEqual(expected);
  });

  test('8-digit #rrggbbaa carries an exact alpha byte', async ({ page }) => {
    const out = await page.evaluate(() => window.__colorConverter.parseColor('#11223399'));
    expect(out).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 0x99 / 255 });
  });

  test('case-insensitive and tolerates surrounding whitespace', async ({ page }) => {
    const out = await page.evaluate(() => ({
      upper: window.__colorConverter.parseColor('#ABCDEF'),
      padded: window.__colorConverter.parseColor('   #abcdef  '),
      upperNoHash: window.__colorConverter.parseColor('  ABCDEF  '),
    }));
    const expected = { r: 0xab, g: 0xcd, b: 0xef, a: 1 };
    expect(out.upper).toEqual(expected);
    expect(out.padded).toEqual(expected);
    expect(out.upperNoHash).toEqual(expected);
  });

  test('out-of-form hex lengths (5 or 7 digits) are invalid', async ({ page }) => {
    const out = await page.evaluate(() => ({
      five: window.__colorConverter.parseColor('#12345'),
      seven: window.__colorConverter.parseColor('#1234567'),
    }));
    expect(out.five).toBeNull();
    expect(out.seven).toBeNull();
  });
});

test.describe('parseColor: functional rgb()/rgba()', () => {
  test('comma syntax, alpha optional -> defaults to 1', async ({ page }) => {
    const out = await page.evaluate(() => ({
      noAlpha: window.__colorConverter.parseColor('rgb(255, 0, 0)'),
      withAlpha: window.__colorConverter.parseColor('rgba(255, 0, 0, 0.5)'),
      rgbAliasWithAlpha: window.__colorConverter.parseColor('rgb(10, 20, 30, 0.25)'),
    }));
    expect(out.noAlpha).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(out.withAlpha).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(out.rgbAliasWithAlpha).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
  });

  test('modern slash syntax rgb(r g b / a) requires alpha', async ({ page }) => {
    const out = await page.evaluate(() => ({
      slash: window.__colorConverter.parseColor('rgb(0 0 255 / 0.8)'),
      slashRgbaName: window.__colorConverter.parseColor('rgba(10 20 30 / 1)'),
      noAlphaNoComma: window.__colorConverter.parseColor('rgb(255 0 0)'), // no slash, no comma -> invalid
    }));
    expect(out.slash).toEqual({ r: 0, g: 0, b: 255, a: 0.8 });
    expect(out.slashRgbaName).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(out.noAlphaNoComma).toBeNull();
  });

  test('case-insensitive function name and whitespace-tolerant', async ({ page }) => {
    const out = await page.evaluate(() => ({
      upper: window.__colorConverter.parseColor('RGB(1, 2, 3)'),
      mixedCase: window.__colorConverter.parseColor('RgBa(1, 2, 3, 0.5)'),
      padded: window.__colorConverter.parseColor('  rgb( 1 , 2 , 3 )  '),
    }));
    expect(out.upper).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(out.mixedCase).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(out.padded).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });

  test('channels clamp to 0-255, alpha clamps to 0-1, decimals round', async ({ page }) => {
    const out = await page.evaluate(() => ({
      overAndUnder: window.__colorConverter.parseColor('rgb(300, -10, 128)'),
      alphaOver: window.__colorConverter.parseColor('rgba(0, 0, 0, 2)'),
      alphaUnder: window.__colorConverter.parseColor('rgba(0, 0, 0, -1)'),
      decimalChannel: window.__colorConverter.parseColor('rgb(120.4, 0, 0)'),
    }));
    expect(out.overAndUnder).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(out.alphaOver).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(out.alphaUnder).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(out.decimalChannel).toEqual({ r: 120, g: 0, b: 0, a: 1 });
  });
});

test.describe('parseColor: invalids -> null', () => {
  test('garbage strings, empty string, percentages, malformed function syntax', async ({ page }) => {
    const out = await page.evaluate(() => ({
      garbage: window.__colorConverter.parseColor('not a color'),
      empty: window.__colorConverter.parseColor(''),
      whitespaceOnly: window.__colorConverter.parseColor('   '),
      percentages: window.__colorConverter.parseColor('rgb(50%, 0%, 0%)'),
      missingParen: window.__colorConverter.parseColor('rgb(1, 2, 3'),
      tooFewArgs: window.__colorConverter.parseColor('rgb(1, 2)'),
      tooManyArgsComma: window.__colorConverter.parseColor('rgba(1, 2, 3, 4, 5)'),
      mixedCommaSlash: window.__colorConverter.parseColor('rgb(1, 2, 3 / 4)'),
      namedColor: window.__colorConverter.parseColor('rebeccapurple'),
      hsl: window.__colorConverter.parseColor('hsl(0, 100%, 50%)'),
      partialMatchEmbedded: window.__colorConverter.parseColor('xrgb(1,2,3)y'),
    }));
    for (const [key, val] of Object.entries(out)) {
      expect(val, `${key} should be null`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. rgbaString/hexString canonical output (match color-picker).
// ---------------------------------------------------------------------------
test.describe('formatters: rgbaString / hexString', () => {
  test('rgbaString always includes alpha, even opaque (a=1)', async ({ page }) => {
    const out = await page.evaluate(() => window.__colorConverter.rgbaString({ r: 255, g: 0, b: 0, a: 1 }));
    expect(out).toBe('rgba(255, 0, 0, 1)');
  });

  test('rgbaString trims fractional alpha to at most 3 decimals', async ({ page }) => {
    const out = await page.evaluate(() => ({
      half: window.__colorConverter.rgbaString({ r: 10, g: 20, b: 30, a: 0.5 }),
      third: window.__colorConverter.rgbaString({ r: 1, g: 2, b: 3, a: 0.333333 }),
      zero: window.__colorConverter.rgbaString({ r: 1, g: 2, b: 3, a: 0 }),
    }));
    expect(out.half).toBe('rgba(10, 20, 30, 0.5)');
    expect(out.third).toBe('rgba(1, 2, 3, 0.333)');
    expect(out.zero).toBe('rgba(1, 2, 3, 0)');
  });

  test('hexString: opaque -> lowercase #rrggbb, no alpha suffix', async ({ page }) => {
    const out = await page.evaluate(() => ({
      red: window.__colorConverter.hexString({ r: 255, g: 0, b: 0, a: 1 }),
      mixed: window.__colorConverter.hexString({ r: 16, g: 32, b: 48, a: 1 }),
      upperInputStillLower: window.__colorConverter.hexString({ r: 255, g: 255, b: 255, a: 1 }),
    }));
    expect(out.red).toBe('#ff0000');
    expect(out.mixed).toBe('#102030');
    expect(out.upperInputStillLower).toBe('#ffffff');
  });

  test('hexString: alpha < 1 -> #rrggbbaa (only then)', async ({ page }) => {
    const out = await page.evaluate(() => ({
      a60: window.__colorConverter.hexString({ r: 0, g: 255, b: 0, a: 0.6 }), // 0.6*255=153=0x99 exact
      a20: window.__colorConverter.hexString({ r: 255, g: 255, b: 0, a: 0.2 }), // 0.2*255=51=0x33 exact
      opaqueNoSuffix: window.__colorConverter.hexString({ r: 1, g: 2, b: 3, a: 1 }),
    }));
    expect(out.a60).toBe('#00ff0099');
    expect(out.a20).toBe('#ffff0033');
    expect(out.opaqueNoSuffix).toBe('#010203');
  });
});

// ---------------------------------------------------------------------------
// 3. Single-row live conversion: swatch + HEX/RGBA output fields.
// ---------------------------------------------------------------------------
test.describe('single-row live conversion', () => {
  test('addRow with a valid hex produces correct swatch color and output fields', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#ff8800'));
    const row = page.getByTestId('color-row').first();

    await expect(row.getByTestId('row-hex-output')).toHaveValue('#ff8800');
    await expect(row.getByTestId('row-rgba-output')).toHaveValue('rgba(255, 136, 0, 1)');
    const swatchVar = await row.getByTestId('row-swatch').evaluate((el) => el.style.getPropertyValue('--swatch-color'));
    expect(swatchVar).toBe('rgba(255, 136, 0, 1)');
    await expect(row.getByTestId('row-swatch')).not.toHaveClass(/alpha/);
    await expect(row.getByTestId('row-swatch')).not.toHaveClass(/invalid/);
  });

  test('translucent color gets the alpha checker-background swatch class', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('rgba(10, 20, 30, 0.4)'));
    const row = page.getByTestId('color-row').first();
    await expect(row.getByTestId('row-swatch')).toHaveClass(/alpha/);
  });

  test('typing into a row input live-converts after the debounce (real UI path)', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow(''));
    const row = page.getByTestId('color-row').first();
    await row.getByTestId('row-input').fill('#00ff00');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    await expect(row.getByTestId('row-hex-output')).toHaveValue('#00ff00');
    await expect(row.getByTestId('row-rgba-output')).toHaveValue('rgba(0, 255, 0, 1)');
  });

  test('an invalid row shows the invalid state and empty outputs, no crash', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('not a color'));
    const row = page.getByTestId('color-row').first();

    await expect(row.getByTestId('row-swatch')).toHaveClass(/invalid/);
    await expect(row).toHaveClass(/invalid/);
    await expect(row.getByTestId('row-hex-output')).toHaveValue('');
    await expect(row.getByTestId('row-rgba-output')).toHaveValue('');

    // No console errors / page crash from the invalid parse.
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await row.getByTestId('row-input').fill('still garbage');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    expect(errors).toHaveLength(0);
  });

  test('an empty row is neutral: not invalid, empty outputs', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow(''));
    const row = page.getByTestId('color-row').first();
    await expect(row.getByTestId('row-swatch')).toHaveClass(/empty/);
    await expect(row.getByTestId('row-swatch')).not.toHaveClass(/invalid/);
    await expect(row.getByTestId('row-hex-output')).toHaveValue('');
    await expect(row.getByTestId('row-rgba-output')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 4. Rows as source of truth -> derived output textareas.
// ---------------------------------------------------------------------------
test.describe('derived output textareas track rows, line-aligned', () => {
  test('rgbaOutput()/hexOutput() and the textarea values match rows in order', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('rgba(0, 255, 0, 0.5)');
    });

    const result = await page.evaluate(() => ({
      rgba: window.__colorConverter.rgbaOutput(),
      hex: window.__colorConverter.hexOutput(),
    }));
    expect(result.rgba).toBe('rgba(255, 0, 0, 1)\nrgba(0, 255, 0, 0.5)');
    expect(result.hex).toBe('#ff0000\n#00ff0080');

    await expect(page.getByTestId('rgba-output')).toHaveValue(result.rgba);
    await expect(page.getByTestId('hex-output')).toHaveValue(result.hex);
  });

  test('an invalid row emits the INVALID: token in BOTH textareas, keeping alignment', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('nonsense');
      window.__colorConverter.addRow('#00ff00');
    });

    const rgbaVal = await page.getByTestId('rgba-output').inputValue();
    const hexVal = await page.getByTestId('hex-output').inputValue();
    const rgbaLines = rgbaVal.split('\n');
    const hexLines = hexVal.split('\n');

    expect(rgbaLines).toEqual(['rgba(255, 0, 0, 1)', 'INVALID: nonsense', 'rgba(0, 255, 0, 1)']);
    expect(hexLines).toEqual(['#ff0000', 'INVALID: nonsense', '#00ff00']);
    // Line-aligned: both textareas have exactly one line per row, same length.
    expect(rgbaLines.length).toBe(3);
    expect(hexLines.length).toBe(3);
  });

  test('an empty row emits a blank line (not the INVALID token) in both outputs', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow(''); // empty, not typed into
      window.__colorConverter.addRow('#00ff00');
    });

    const rgbaLines = (await page.getByTestId('rgba-output').inputValue()).split('\n');
    const hexLines = (await page.getByTestId('hex-output').inputValue()).split('\n');
    expect(rgbaLines).toEqual(['rgba(255, 0, 0, 1)', '', 'rgba(0, 255, 0, 1)']);
    expect(hexLines).toEqual(['#ff0000', '', '#00ff00']);
  });

  test('outputs update live as a row is hand-edited', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#ff0000'));
    await expect(page.getByTestId('rgba-output')).toHaveValue('rgba(255, 0, 0, 1)');

    const row = page.getByTestId('color-row').first();
    await row.getByTestId('row-input').fill('#0000ff');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    await expect(page.getByTestId('rgba-output')).toHaveValue('rgba(0, 0, 255, 1)');
    await expect(page.getByTestId('hex-output')).toHaveValue('#0000ff');
  });
});

// ---------------------------------------------------------------------------
// 5. Bulk Convert: replaces rows, blanks skipped, invalids flagged, summary.
// ---------------------------------------------------------------------------
test.describe('bulk convert', () => {
  test('bulkConvert(text) generates one row per non-blank line; blanks skipped; invalids counted', async ({ page }) => {
    // 6 raw lines; 2 are blank/whitespace-only and are skipped entirely
    // (don't become rows, don't count toward generated/invalid) -> 4
    // non-blank lines remain, 1 of which ("nope") is invalid.
    const text = '#ff0000\n\nrgba(0, 255, 0, 0.5)\n   \nnope\nrgb(1 2 3 / 0.5)';
    const result = await page.evaluate((t) => window.__colorConverter.bulkConvert(t), text);
    expect(result).toEqual({ added: 4, invalid: 1 });

    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#ff0000');
    await expect(rows.nth(1).getByTestId('row-input')).toHaveValue('rgba(0, 255, 0, 0.5)');
    await expect(rows.nth(2).getByTestId('row-input')).toHaveValue('nope');
    await expect(rows.nth(2)).toHaveClass(/invalid/);
    await expect(rows.nth(3).getByTestId('row-input')).toHaveValue('rgb(1 2 3 / 0.5)');
  });

  test('Convert button (real UI path): paste + click parses a mixed batch and shows the summary', async ({ page }) => {
    await page.getByTestId('paste-input').fill('#abc\nrgba(1, 2, 3, 1)\nbad-line');
    await page.getByTestId('convert-btn').click();

    await expect(page.getByTestId('color-row')).toHaveCount(3);
    await expect(page.getByTestId('parse-summary')).toHaveText("Generated 3 rows — 1 couldn't be parsed.");
  });

  test('summary uses singular "row" wording for a single generated row with no failures', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.bulkConvert('#fff'));
    await expect(page.getByTestId('parse-summary')).toHaveText('Generated 1 row.');
  });

  test('Convert REPLACES existing rows (does not accumulate across repeated Converts)', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#111111'));
    await expect(page.getByTestId('color-row')).toHaveCount(1);

    // bulkConvert erases current rows first, then regenerates from `text` —
    // the pre-existing #111111 row does NOT survive.
    await page.evaluate(() => window.__colorConverter.bulkConvert('#222222\n#333333'));
    await expect(page.getByTestId('color-row')).toHaveCount(2);
    let rows = page.getByTestId('color-row');
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#222222');
    await expect(rows.nth(1).getByTestId('row-input')).toHaveValue('#333333');

    // A second Convert reflects only its own text, not the union with the
    // previous Convert's output.
    await page.evaluate(() => window.__colorConverter.bulkConvert('#444444'));
    rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#444444');
  });

  test('Convert button (real UI path) REPLACES rows and does not clear the paste box', async ({ page }) => {
    await page.getByTestId('paste-input').fill('#111111\n#222222');
    await page.getByTestId('convert-btn').click();
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    // Edit the paste box and Convert again: rows regenerate from the new
    // text only.
    await page.getByTestId('paste-input').fill('#333333');
    await page.getByTestId('convert-btn').click();

    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#333333');
    // The paste box itself is the source of truth for regeneration, so
    // Convert never clears it.
    await expect(page.getByTestId('paste-input')).toHaveValue('#333333');
  });

  test('Clear button: opens the shared ctConfirm dialog; Enter confirms and empties only the paste box, not rows', async ({ page }) => {
    await page.getByTestId('paste-input').fill('#abc\n#def');
    await page.getByTestId('convert-btn').click();
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    await page.getByTestId('paste-input').fill('some text still here');
    await page.getByTestId('clear-paste-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Clear the paste box?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('paste-input')).toHaveValue('');
    await expect(page.getByTestId('color-row')).toHaveCount(2); // rows untouched
  });

  test('Clear button: Esc cancels and leaves the paste box untouched', async ({ page }) => {
    await page.getByTestId('paste-input').fill('some text still here');
    await page.getByTestId('clear-paste-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('paste-input')).toHaveValue('some text still here');
  });

  test('Clear button visible label is "Clear" (data-testid unchanged)', async ({ page }) => {
    await expect(page.getByTestId('clear-paste-btn')).toHaveText('Clear');
  });
});

// ---------------------------------------------------------------------------
// 5b. Mobile keyboard dismiss on Convert — docs/conventions.md § Responsive &
// mobile: Convert is this tool's commit/submit action, so a click blurs the
// active element (the paste textarea) to dismiss the on-screen keyboard.
// ---------------------------------------------------------------------------
test.describe('Convert: mobile keyboard dismiss convention', () => {
  test('clicking Convert blurs the paste textarea (dismisses the mobile keyboard)', async ({ page }) => {
    const pasteInput = page.getByTestId('paste-input');
    await pasteInput.fill('#ff0000\nrgba(0, 255, 0, 0.5)');
    await pasteInput.focus();
    await expect(pasteInput).toBeFocused();

    await page.getByTestId('convert-btn').click();

    await expect(page.getByTestId('color-row')).toHaveCount(2);
    await expect(pasteInput).not.toBeFocused();
    const activeIsPasteInput = await page.evaluate(
      () => document.activeElement === document.querySelector('[data-testid="paste-input"]')
    );
    expect(activeIsPasteInput).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Copy buttons: per-row + copy-all trigger the copy path and show feedback.
// ---------------------------------------------------------------------------
test.describe('copy buttons', () => {
  test('row hex-copy and rgba-copy show check feedback and copy the correct values', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row').first();

    await expect(row.getByTestId('row-hex-output')).toHaveValue('#123456');
    await expect(row.getByTestId('row-rgba-output')).toHaveValue('rgba(18, 52, 86, 1)');

    const hexCopyBtn = row.getByTestId('row-hex-copy');
    await expect(hexCopyBtn).toHaveText('📋');
    await hexCopyBtn.click();
    await expect(hexCopyBtn).toHaveText('✅');

    const rgbaCopyBtn = row.getByTestId('row-rgba-copy');
    await expect(rgbaCopyBtn).toHaveText('📋');
    await rgbaCopyBtn.click();
    await expect(rgbaCopyBtn).toHaveText('✅');
  });

  test('row copy feedback reverts to the clipboard icon after ~1s', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const copyBtn = page.getByTestId('color-row').first().getByTestId('row-hex-copy');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅');
    await expect(copyBtn).toHaveText('📋', { timeout: 2000 });
  });

  test('an empty/invalid row copy button is a no-op (nothing to copy)', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('garbage'));
    const row = page.getByTestId('color-row').first();
    await expect(row.getByTestId('row-hex-output')).toHaveValue('');
    const copyBtn = row.getByTestId('row-hex-copy');
    await copyBtn.click();
    // No value to copy -> handleCopyClick returns early -> icon unchanged.
    await expect(copyBtn).toHaveText('📋');
  });

  test('RGBA Copy all and HEX Copy all show "Copied!" feedback with correct underlying value', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('#00ff00');
    });
    const expectedRgba = await page.evaluate(() => window.__colorConverter.rgbaOutput());
    const expectedHex = await page.evaluate(() => window.__colorConverter.hexOutput());
    await expect(page.getByTestId('rgba-output')).toHaveValue(expectedRgba);
    await expect(page.getByTestId('hex-output')).toHaveValue(expectedHex);

    const rgbaCopyAllBtn = page.getByTestId('rgba-copy-all-btn');
    await expect(rgbaCopyAllBtn).toHaveText('Copy all');
    await rgbaCopyAllBtn.click();
    await expect(rgbaCopyAllBtn).toHaveText('Copied!');

    const hexCopyAllBtn = page.getByTestId('hex-copy-all-btn');
    await expect(hexCopyAllBtn).toHaveText('Copy all');
    await hexCopyAllBtn.click();
    await expect(hexCopyAllBtn).toHaveText('Copied!');
  });

  // In-field copy buttons pinned inside each "one per line" output textarea
  // (docs/conventions.md § controls.css — outputs show the button always;
  // .ct-field--multiline pins it top-right). They copy the whole textarea and
  // sit alongside the standalone "Copy all" buttons.
  test('output textareas carry an in-field .ct-copy-btn that copies the whole list and flashes', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('rgba(0, 255, 0, 0.5)');
    });

    for (const [outId, copyId] of [
      ['rgba-output', 'rgba-output-copy'],
      ['hex-output', 'hex-output-copy'],
    ]) {
      const copyBtn = page.getByTestId(copyId);
      // Lives inside the shared .ct-field wrapper (in-field, not a sibling).
      await expect(copyBtn).toHaveClass(/ct-copy-btn/);
      await expect(copyBtn).toHaveText('📋');
      await copyBtn.click();
      await expect(copyBtn).toHaveText('✅');
      await expect(copyBtn).toHaveText('📋', { timeout: 2000 }); // reverts
    }
  });

  test('per-row value fields use the shared .ct-field / .ct-copy-btn in-field pattern', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row').first();

    // The read-only value input sits inside a .ct-field wrapper with the copy
    // button as its in-field affordance (controls.css), not a bordered sibling.
    for (const [outId, copyId] of [
      ['row-hex-output', 'row-hex-copy'],
      ['row-rgba-output', 'row-rgba-copy'],
    ]) {
      const field = row.getByTestId(copyId).locator('xpath=..');
      await expect(field).toHaveClass(/ct-field/);
      await expect(row.getByTestId(copyId)).toHaveClass(/ct-copy-btn/);
      await expect(row.getByTestId(outId)).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Removal: per-row trash, Clear, Remove all — all three route through the
//    shared ctConfirm dialog (tools/include/confirm.js), which renders
//    role="dialog"/aria-modal with "Cancel"/"Yes" buttons (no data-testids
//    of its own — it's a pasted, tool-agnostic component). Enter confirms
//    (default focus on Yes), Esc/backdrop-click cancel, focus is trapped.
// ---------------------------------------------------------------------------
test.describe('per-row trash opens the shared ctConfirm dialog', () => {
  test('trash click opens ctConfirm with "Remove this color?"; Enter removes only that row', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#111111');
      window.__colorConverter.addRow('#222222');
      window.__colorConverter.addRow('#333333');
    });
    await expect(page.getByTestId('color-row')).toHaveCount(3);

    // Trigger the middle row's trash button.
    await page.getByTestId('color-row').nth(1).getByTestId('row-trash').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Remove this color?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    // Row is NOT removed while the dialog is open.
    await expect(page.getByTestId('color-row')).toHaveCount(3);

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#111111');
    await expect(rows.nth(1).getByTestId('row-input')).toHaveValue('#333333');

    await expect(page.getByTestId('rgba-output')).toHaveValue('rgba(17, 17, 17, 1)\nrgba(51, 51, 51, 1)');
    await expect(page.getByTestId('hex-output')).toHaveValue('#111111\n#333333');
  });

  test('trash click: Esc cancels and keeps the row', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#111111');
      window.__colorConverter.addRow('#222222');
    });
    await page.getByTestId('color-row').first().getByTestId('row-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(2);
    const rows = page.getByTestId('color-row');
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#111111');
    await expect(rows.nth(1).getByTestId('row-input')).toHaveValue('#222222');
  });

  test('trash click: backdrop click cancels and keeps the row', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#111111'));
    await page.getByTestId('color-row').first().getByTestId('row-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click the overlay well outside the centered dialog card (the overlay
    // fills the viewport; the dialog itself is centered and narrow).
    await page.locator('.ctc-overlay').click({ position: { x: 5, y: 5 } });

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
  });

  test('trash click: focus trap wraps Tab/Shift+Tab between Cancel and Yes', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#111111'));
    await page.getByTestId('color-row').first().getByTestId('row-trash').click();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Escape'); // clean up
  });

  test('window.__colorConverter.removeRow(id) is a DIRECT, non-modal removal', async ({ page }) => {
    const id = await page.evaluate(() => window.__colorConverter.addRow('#123456').id);
    await expect(page.getByTestId('color-row')).toHaveCount(1);

    await page.evaluate((rowId) => window.__colorConverter.removeRow(rowId), id);

    // No dialog ever appears for the direct programmatic call.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });
});

test.describe('Remove all: shared ctConfirm dialog', () => {
  test('disabled when empty, enabled once rows exist', async ({ page }) => {
    const removeAllBtn = page.getByTestId('remove-all-btn');
    await expect(removeAllBtn).toBeDisabled();

    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await expect(removeAllBtn).toBeEnabled();
  });

  test('opens ctConfirm: role=dialog, aria-modal, default focus Yes', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await page.getByTestId('remove-all-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Remove all rows?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();
  });

  test('focus trap: Tab and Shift+Tab wrap between Cancel and Yes', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();
  });

  test('Enter confirms and empties rows; Remove all becomes disabled again', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#111111');
      window.__colorConverter.addRow('#222222');
    });
    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();
    await expect(page.getByTestId('rgba-output')).toHaveValue('');
    await expect(page.getByTestId('hex-output')).toHaveValue('');
  });

  test('Esc cancels and keeps rows', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#111111');
      window.__colorConverter.addRow('#222222');
    });
    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(2);
  });

  test('backdrop click cancels (rows survive)', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#111111'));
    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('.ctc-overlay').click({ position: { x: 5, y: 5 } });

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
  });

  test('clicking Remove all with zero rows is a no-op (defensive guard)', async ({ page }) => {
    await page.evaluate(() => document.getElementById('removeAllBtn').click());
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 8. data-testid hooks + window.__colorConverter API shape.
// ---------------------------------------------------------------------------
test.describe('data-testid hooks present', () => {
  test('all top-level and modal testids exist exactly once', async ({ page }) => {
    const singleTestids = [
      'paste-section',
      'paste-input',
      'convert-btn',
      'clear-paste-btn',
      'parse-summary',
      'rows-section',
      'rows-list',
      'add-row-btn',
      'remove-all-btn',
      'outputs-section',
      'rgba-output-col',
      'rgba-output',
      'rgba-output-copy',
      'rgba-copy-all-btn',
      'hex-output-col',
      'hex-output',
      'hex-output-copy',
      'hex-copy-all-btn',
    ];
    for (const id of singleTestids) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }
  });

  test('all per-row testids exist on an added row', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row');
    await expect(row).toHaveCount(1);
    const rowTestids = [
      'row-input',
      'row-swatch',
      'row-hex-output',
      'row-hex-copy',
      'row-rgba-output',
      'row-rgba-copy',
      'row-trash',
    ];
    for (const id of rowTestids) {
      await expect(row.getByTestId(id)).toHaveCount(1);
    }
  });

  test('Add row button appends an empty row and focuses its input', async ({ page }) => {
    await page.getByTestId('add-row-btn').click();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('row-input')).toBeFocused();
  });

  test('window.__colorConverter exposes the full documented API shape', async ({ page }) => {
    const shape = await page.evaluate(() => ({
      parseColor: typeof window.__colorConverter.parseColor,
      rgbaString: typeof window.__colorConverter.rgbaString,
      hexString: typeof window.__colorConverter.hexString,
      addRow: typeof window.__colorConverter.addRow,
      bulkConvert: typeof window.__colorConverter.bulkConvert,
      removeRow: typeof window.__colorConverter.removeRow,
      removeAllRows: typeof window.__colorConverter.removeAllRows,
      state: typeof window.__colorConverter.state,
      rgbaOutput: typeof window.__colorConverter.rgbaOutput,
      hexOutput: typeof window.__colorConverter.hexOutput,
    }));
    expect(shape).toEqual({
      parseColor: 'function',
      rgbaString: 'function',
      hexString: 'function',
      addRow: 'function',
      bulkConvert: 'function',
      removeRow: 'function',
      removeAllRows: 'function',
      state: 'object',
      rgbaOutput: 'function',
      hexOutput: 'function',
    });
  });

  test('state.rows is a live reference reflecting added rows', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const rows = await page.evaluate(() => window.__colorConverter.state.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].rawText).toBe('#123456');
    expect(rows[0].parsed).toEqual({ r: 0x12, g: 0x34, b: 0x56, a: 1 });
  });
});

// ---------------------------------------------------------------------------
// 9. Tooltips: icon-only buttons carry a `title` in addition to aria-label
//    (docs/conventions.md § Accessibility baseline).
// ---------------------------------------------------------------------------
test.describe('icon-only buttons have a hover tooltip (title attribute)', () => {
  test('per-row hex-copy, rgba-copy, and trash all have a title', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row').first();

    await expect(row.getByTestId('row-hex-copy')).toHaveAttribute('title', /.+/);
    await expect(row.getByTestId('row-rgba-copy')).toHaveAttribute('title', /.+/);
    await expect(row.getByTestId('row-trash')).toHaveAttribute('title', /.+/);
  });

  test('the two Copy-all buttons have a title', async ({ page }) => {
    await expect(page.getByTestId('rgba-copy-all-btn')).toHaveAttribute('title', 'Copy all RGBA values');
    await expect(page.getByTestId('hex-copy-all-btn')).toHaveAttribute('title', 'Copy all HEX values');
  });
});

// ---------------------------------------------------------------------------
// 10. Mobile (~375x667, dpr2, touch): real taps (not the window.__* hooks),
//     no horizontal overflow down to ~360px, ~44px tap targets, and an
//     elementFromPoint overlay hit-test guard on Convert + a copy button.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  test('real tap: paste + Convert produces rows', async ({ page }) => {
    await page.getByTestId('paste-input').tap();
    await page.getByTestId('paste-input').fill('#ff0000\nrgba(0, 255, 0, 0.5)');
    await page.getByTestId('convert-btn').tap();

    await expect(page.getByTestId('color-row')).toHaveCount(2);
    await expect(page.getByTestId('parse-summary')).toHaveText('Generated 2 rows.');
  });

  test('real tap on a per-row copy button shows check feedback', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const copyBtn = page.getByTestId('color-row').first().getByTestId('row-hex-copy');
    await copyBtn.tap();
    await expect(copyBtn).toHaveText('✅');
  });

  test('real tap on Add row appends a row and focuses its input', async ({ page }) => {
    await page.getByTestId('add-row-btn').tap();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('row-input')).toBeFocused();
  });

  test('real tap on a trash button opens ctConfirm; tapping Yes removes the row', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await page.getByTestId('color-row').first().getByTestId('row-trash').tap();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Remove this color?');

    await page.getByRole('button', { name: 'Yes' }).tap();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });

  test('no horizontal page overflow at 375px with rows + both outputs populated', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('rgba(0, 255, 0, 0.5)');
    });
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('no horizontal overflow down to ~360px width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('rgba(0, 255, 0, 0.5)');
    });
    await page.getByTestId('add-row-btn').tap();

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('trash button and per-row copy buttons meet the ~44px tap-target minimum', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row').first();

    for (const testid of ['row-trash', 'row-hex-copy', 'row-rgba-copy']) {
      const box = await row.getByTestId(testid).boundingBox();
      expect(box.width, `${testid} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${testid} height`).toBeGreaterThanOrEqual(44);
    }
  });

  // Lower-level hit-test guard (the lesson from a sibling tool's regression:
  // a passing functional test still missed a real overlay covering a
  // control). Verifies via document.elementFromPoint that nothing sits on
  // top of the Convert button or a per-row copy button at mobile size —
  // proof of tappability that doesn't rely on the window.__* hooks.
  test('no overlay intercepts hit-testing on the Convert button or a per-row copy button', async ({ page }) => {
    async function isHitByOwnControl(locator) {
      const box = await locator.boundingBox();
      return locator.evaluate(
        (el, { x, y, w, h }) => {
          const hit = document.elementFromPoint(x + w / 2, y + h / 2);
          return !!hit && (hit === el || el.contains(hit));
        },
        { x: box.x, y: box.y, w: box.width, h: box.height }
      );
    }

    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    expect(await isHitByOwnControl(page.getByTestId('convert-btn'))).toBe(true);
    expect(await isHitByOwnControl(page.getByTestId('row-hex-copy').first())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Adversarial-review finding (BLOCKER, fixer pass): the page-wide
// `button:hover:not(:disabled)` rule had higher CSS specificity than the
// pasted ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0), so hovering
// "Yes" washed the solid accent-blue background out to near-white (#eef1f8)
// while the white text stayed white — effectively invisible. Fixed by
// excluding `.ctc-btn` from the generic hover rule
// (`:not(:disabled):not(.ctc-btn)`). docs/conventions.md "Destructive
// actions require confirmation": "Yes" must read as "a clear, filled
// primary" — never near-white.
// ---------------------------------------------------------------------------
test.describe('hover states stay legible (CSS specificity regression)', () => {
  test('hovering "Yes" in the remove-all ctConfirm dialog keeps a filled accent background with readable text', async ({
    page,
  }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await page.getByTestId('remove-all-btn').click();

    const yesBtn = page.getByRole('button', { name: 'Yes' });
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    await expect(yesBtn).toBeVisible();

    const beforeHoverBg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    await yesBtn.hover();
    const afterHoverBg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const afterHoverColor = await yesBtn.evaluate((el) => getComputedStyle(el).color);
    const cancelHoverBg = await cancelBtn.evaluate((el) => getComputedStyle(el).backgroundColor);

    // --accent (#2f6fed) = rgb(47, 111, 237); the near-white wash the bug
    // produced was #eef1f8 = rgb(238, 241, 248).
    expect(afterHoverBg).toBe('rgb(47, 111, 237)');
    expect(afterHoverBg).toBe(beforeHoverBg); // unchanged by hover (filter:brightness doesn't touch background-color)
    expect(afterHoverBg).not.toBe('rgb(238, 241, 248)');
    expect(afterHoverBg).not.toBe(cancelHoverBg); // distinct from Cancel's hover background
    expect(afterHoverColor).toBe('rgb(255, 255, 255)'); // text stays white/readable
  });

  test('hovering "Yes" in the per-row trash confirm dialog also keeps a filled accent background', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    await page.getByTestId('color-row').first().getByTestId('row-trash').click();

    const yesBtn = page.getByRole('button', { name: 'Yes' });
    await expect(yesBtn).toBeVisible();
    await yesBtn.hover();
    const bg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(47, 111, 237)');

    await page.keyboard.press('Escape'); // clean up
  });

  test('an ordinary button (Convert) still gets the light #eef1f8 hover, unaffected by the fix', async ({ page }) => {
    const convertBtn = page.getByTestId('convert-btn');
    await convertBtn.hover();
    const bg = await convertBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(238, 241, 248)'); // #eef1f8, unchanged existing light hover
  });
});

// ---------------------------------------------------------------------------
// Adversarial-review finding (MAJOR, fixer pass): on desktop (>=700px)
// .rows-header reused the data-row grid's `grid-template-columns:
// 1fr 28px 190px 220px 32px`, whose 28px track is sized for the 22px swatch
// BOX, not the word "Swatch". With no white-space/overflow containment, the
// "Swatch" label painted past its 28px column into "Hex" (~10px overlap),
// rendering as an unreadable "SwatcHex". Fixed by giving the swatch header
// cell no visible label (font-size: 0 — the swatches are self-evident) while
// keeping the cell in the DOM/grid so column alignment with the data rows is
// preserved, plus a `white-space: nowrap` / `text-overflow: ellipsis` safety
// net on all header labels. Header is `display: none` under 700px, so this
// only applies at/above the breakpoint.
// ---------------------------------------------------------------------------
test.describe('rows-header column labels do not overlap (desktop)', () => {
  async function visibleHeaderLabelRects(page) {
    return page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('.rows-header > span'));
      return spans
        .filter((el) => el.textContent.trim().length > 0 && getComputedStyle(el).fontSize !== '0px')
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), left: r.left, right: r.right };
        });
    });
  }

  for (const width of [1000, 720]) {
    test(`labels are distinct and non-overlapping at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.__colorConverter.addRow('#123456'));

      const rects = await visibleHeaderLabelRects(page);
      // Sanity: header is visible above the 700px breakpoint and still
      // exposes at least "Input", "Hex", "RGBA" as non-empty labels.
      expect(rects.length).toBeGreaterThanOrEqual(3);
      expect(rects.map((r) => r.text)).toEqual(expect.arrayContaining(['Input', 'Hex', 'RGBA']));

      const TOLERANCE = 1; // px, for sub-pixel layout rounding
      rects.sort((a, b) => a.left - b.left);
      for (let i = 0; i < rects.length - 1; i++) {
        expect(
          rects[i].right,
          `"${rects[i].text}" (right=${rects[i].right}) should not overlap "${rects[i + 1].text}" (left=${rects[i + 1].left})`
        ).toBeLessThanOrEqual(rects[i + 1].left + TOLERANCE);
      }
    });
  }

  test('the header stays hidden below the 700px breakpoint (mobile unaffected)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.rows-header')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence — docs/conventions.md § "Persist UI state
// (localStorage)" (hat-picker is the exemplar pattern). Versioned key
// "color-converter:v1". THE ROWS ARE THE SOURCE OF TRUTH (DESIGN.md), so only
// each row's raw text + the paste-box text are persisted — the parsed color
// and both derived output textareas are never stored; on restore they must be
// RECOMPUTED fresh from the restored rawText and still match exactly.
// ---------------------------------------------------------------------------
test.describe('localStorage persistence', () => {
  const STORAGE_KEY = 'color-converter:v1';

  test('writes the versioned key on change (bulk Convert + live typing + paste box), and reloading restores rows + paste box with correctly re-derived outputs', async ({
    page,
  }) => {
    // Build rows via bulk Convert (one valid hex, one valid rgba, one
    // invalid line), then add a row and type into it via a REAL input event
    // (exercises the debounced onRowInput save path, not just addRow/
    // bulkConvert's direct saves).
    await page.getByTestId('paste-input').fill('#ff0000\nrgba(0, 255, 0, 0.5)\nnotacolor');
    await page.getByTestId('convert-btn').click();
    await expect(page.getByTestId('color-row')).toHaveCount(3);

    await page.getByTestId('add-row-btn').click();
    await page.getByTestId('row-input').last().fill('#0000ff');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('color-row')).toHaveCount(4);

    const before = await page.evaluate(() => ({
      rows: window.__colorConverter.state.rows.map((r) => r.rawText),
      rgbaOutput: window.__colorConverter.rgbaOutput(),
      hexOutput: window.__colorConverter.hexOutput(),
    }));
    expect(before.rows).toEqual(['#ff0000', 'rgba(0, 255, 0, 0.5)', 'notacolor', '#0000ff']);

    // The paste box's own draft text is persisted independently of rows/
    // Convert (Convert intentionally leaves it in place).
    await page.getByTestId('paste-input').fill('leftover draft text');

    // The versioned key is written with the raw-text-only shape — no parsed
    // color / derived output data, per the spec.
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(stored.rows).toEqual(before.rows);
    expect(stored.paste).toBe('leftover draft text');
    expect(stored).not.toHaveProperty('parsed');

    // Reload: restore-on-load rebuilds the rows list + paste box from the
    // stored raw text, and both derived output textareas must exactly match
    // what they were pre-reload — proof they were RECOMPUTED from the
    // restored rawText, not (impossibly, since it's never stored) copied.
    await page.reload();
    await page.waitForFunction(() => window.__colorConverter && window.__colorConverter.state);

    const after = await page.evaluate(() => ({
      rows: window.__colorConverter.state.rows.map((r) => r.rawText),
      rgbaOutput: window.__colorConverter.rgbaOutput(),
      hexOutput: window.__colorConverter.hexOutput(),
    }));
    expect(after.rows).toEqual(before.rows);
    expect(after.rgbaOutput).toBe(before.rgbaOutput);
    expect(after.hexOutput).toBe(before.hexOutput);

    // The real DOM reflects the restore too: 4 rows in order, the paste box
    // refilled, and both output <textarea>s showing the re-derived values
    // (including the invalid row's placeholder, line-aligned).
    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0).getByTestId('row-input')).toHaveValue('#ff0000');
    await expect(rows.nth(1).getByTestId('row-input')).toHaveValue('rgba(0, 255, 0, 0.5)');
    await expect(rows.nth(2).getByTestId('row-input')).toHaveValue('notacolor');
    await expect(rows.nth(2)).toHaveClass(/invalid/);
    await expect(rows.nth(3).getByTestId('row-input')).toHaveValue('#0000ff');
    await expect(page.getByTestId('paste-input')).toHaveValue('leftover draft text');
    await expect(page.getByTestId('rgba-output')).toHaveValue(before.rgbaOutput);
    await expect(page.getByTestId('hex-output')).toHaveValue(before.hexOutput);
    await expect(page.getByTestId('remove-all-btn')).toBeEnabled();
  });

  test('removing a row (via the real ctConfirm flow) and Remove all each update the stored blob; an empty tool persists an empty rows list', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#111111');
      window.__colorConverter.addRow('#222222');
    });
    let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.rows).toEqual(['#111111', '#222222']);

    // Per-row trash through the real ctConfirm dialog (Enter confirms).
    await page.getByTestId('color-row').first().getByTestId('row-trash').click();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.rows).toEqual(['#222222']);

    // Remove all, also through the real dialog.
    await page.getByTestId('remove-all-btn').click();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.rows).toEqual([]);

    // Reload with nothing left: restores to the same empty state (not stuck
    // on stale data, not crashing on an empty stored rows array).
    await page.reload();
    await page.waitForFunction(() => window.__colorConverter && window.__colorConverter.state);
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();
  });

  test('degrades gracefully when localStorage throws on every read/write: no crash, tool starts empty and stays fully usable', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Simulate a browser/context where localStorage access throws (private
    // mode, restrictive policy, quota) — per docs/conventions.md, every
    // read/write must be try/catch-wrapped and the tool must work fully with
    // no stored state. Overriding Storage.prototype (rather than deleting or
    // reassigning `window.localStorage`, which some engines make
    // non-configurable) reliably intercepts every localStorage.setItem/
    // getItem call this page's script makes.
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new Error('blocked'); };
      Storage.prototype.getItem = function () { throw new Error('blocked'); };
    });
    // The top-level beforeEach already navigated before this init script was
    // registered; reload so it actually applies to this load.
    await page.reload();

    // Sanity-check the simulation actually took effect before trusting the
    // rest of the assertions.
    const threw = await page.evaluate(() => {
      try { localStorage.setItem('x', '1'); return false; } catch { return true; }
    });
    expect(threw).toBe(true);

    await page.waitForFunction(() => window.__colorConverter && window.__colorConverter.state);
    expect(pageErrors).toEqual([]); // load produced no uncaught exception

    // No stored state was readable -> starts empty, same as today with no
    // localStorage support at all.
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('paste-input')).toHaveValue('');
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();

    // Normal interaction (paste + Convert, live row edit, Add row, per-row
    // trash through ctConfirm, Remove all) still works end-to-end without
    // throwing up the call stack — saveState()/restoreState() swallow the
    // localStorage error every time.
    await page.getByTestId('paste-input').fill('#ff0000\nrgba(0, 255, 0, 0.5)');
    await page.getByTestId('convert-btn').click();
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    await page.getByTestId('add-row-btn').click();
    await page.getByTestId('row-input').last().fill('#00ff00');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('color-row')).toHaveCount(3);

    await page.getByTestId('color-row').first().getByTestId('row-trash').click();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    await page.getByTestId('remove-all-btn').click();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);

    expect(pageErrors).toEqual([]); // still no uncaught exceptions after a full interaction pass
  });
});

// ---------------------------------------------------------------------------
// 15. Help modal — docs/conventions.md "First-load help popup (all tools)".
//     Reference implementation: tools/hat-picker's Help modal. An accessible
//     dialog (role="dialog", aria-modal, aria-labelledby, initial focus
//     inside, Esc + backdrop close, focus trap, focus return to the trigger,
//     reduced-motion aware, [hidden] cascade guard) that auto-shows once on a
//     visitor's genuine first load (persisted under
//     "color-converter:help-seen:v1"), then is reachable only via the Help
//     (?) button. The top-level beforeEach above pre-seeds that key so the
//     rest of this file's tests aren't interrupted by the auto-shown modal —
//     the "auto-show" tests in this block deliberately open their own fresh
//     browser context instead of using the pre-seeded `page` fixture, so they
//     see a genuine first visit.
// ---------------------------------------------------------------------------
test.describe('help modal', () => {
  test('auto-shows on a genuine first visit (fresh browser context)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);

    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await expect(overlay).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'help-title');
    await expect(dialog).toContainText('How Color Converter works');
    // Initial focus lands inside the dialog, on the top-right ✕.
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    await context.close();
  });

  test('does NOT auto-show on a subsequent visit', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeVisible(); // first visit: shown

    // The seen-flag is persisted immediately on open (not only on close), so
    // even navigating away without an explicit close counts as "seen".
    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden();

    await context.close();
  });

  test('does not auto-show when pre-seeded (the default `page` fixture used by every other test in this file)', async ({
    page,
  }) => {
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('opens via the ? button', async ({ page }) => {
    await page.getByTestId('help-button').click();

    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await expect(overlay).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('How Color Converter works');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('opens scrolled to the top even though initial focus lands on the ✕', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await page.getByTestId('help-button').click();

    const dialog = page.getByTestId('help-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('the ? button has title and aria-label "How it works"', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await expect(helpButton).toHaveAttribute('title', 'How it works');
    await expect(helpButton).toHaveAttribute('aria-label', 'How it works');
  });

  test('Esc closes it and returns focus to the ? button trigger', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('backdrop click closes it; clicking inside the dialog does not', async ({ page }) => {
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    // Click inside the dialog (on the heading) — must NOT close it.
    await page.getByTestId('help-modal').locator('h2').click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    // Click the backdrop itself, outside the dialog box.
    await page.getByTestId('help-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('the top-right ✕ closes it and returns focus to the ? button trigger', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await expect(overlay).toBeVisible();

    const closeX = dialog.getByTestId('modal-close-x');
    await expect(closeX).toHaveAttribute('aria-label', 'Close');
    await closeX.click();

    await expect(overlay).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('focus is trapped inside the dialog: Tab and Shift+Tab stay on the ✕, the sole focusable control', async ({
    page,
  }) => {
    await page.getByTestId('help-button').click();
    const dialog = page.getByTestId('help-modal');
    const closeX = dialog.getByTestId('modal-close-x');
    // Initial focus is on the ✕ — the only focusable control left in the
    // dialog now that the bottom Close button is gone.
    await expect(closeX).toBeFocused();

    // Tab and Shift+Tab both wrap right back to the ✕.
    await page.keyboard.press('Tab');
    await expect(closeX).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeX).toBeFocused();
  });

  test('actually hides via display:none (the [hidden] cascade guard) when closed, both before first open and after closing', async ({
    page,
  }) => {
    const overlay = page.getByTestId('help-overlay');

    // Before ever opening.
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');

    await page.getByTestId('help-button').click();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');

    await page.getByTestId('modal-close-x').click();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });

  test('the ? button and the dialog ✕ both have touch-action: manipulation', async ({ page }) => {
    await page.getByTestId('help-button').click();
    expect(
      await page.getByTestId('help-button').evaluate((el) => getComputedStyle(el).touchAction)
    ).toBe('manipulation');
    expect(
      await page.getByTestId('modal-close-x').evaluate((el) => getComputedStyle(el).touchAction)
    ).toBe('manipulation');
  });
});

// ---------------------------------------------------------------------------
// Shared tools/include/base.css, pasted into this tool's <style>.
// ---------------------------------------------------------------------------
test.describe('shared base.css include', () => {
  test('the document root has touch-action: manipulation', async ({ page }) => {
    const touchAction = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  test('[hidden] elements are actually hidden (the help overlay before first open)', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeHidden();
    const display = await overlay.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  // This tool has no <select> elements, so no select-appearance assertion
  // here (see tools/color-designer's suite for that coverage).
});

// ---------------------------------------------------------------------------
// Color-row one-line layout at phone width (Fix B): the raw-input, swatch,
// hex field, rgba field, and trash all sit on one row instead of the raw
// input/hex/rgba each stacking onto their own full-width line.
// ---------------------------------------------------------------------------
test.describe('color-row one-line layout at phone width', () => {
  test.use({ viewport: { width: 380, height: 740 } });

  // Row children have different heights (the 22px swatch vs. the taller
  // .field boxes and buttons) and are align-items: center, so their *tops*
  // legitimately differ on one shared line — compare vertical centers
  // instead, and confirm left-to-right, non-overlapping horizontal order.
  async function rowChildGeometry(row) {
    return row.evaluate((el) => {
      const kids = [
        el.querySelector('[data-testid="row-input"]'),
        el.querySelector('[data-testid="row-swatch"]'),
        el.querySelector('[data-testid="row-hex-output"]').closest('.ct-field'),
        el.querySelector('[data-testid="row-rgba-output"]').closest('.ct-field'),
        el.querySelector('[data-testid="row-trash"]'),
      ];
      return kids.map((k) => {
        const r = k.getBoundingClientRect();
        return { left: r.left, right: r.right, centerY: r.top + r.height / 2 };
      });
    });
  }

  test('raw input, swatch, hex field, rgba field, and trash share one line at 380px, no page overflow', async ({
    page,
  }) => {
    await page.evaluate(() => window.__colorConverter.addRow('rgba(250, 10, 200, 0.4)'));

    const row = page.getByTestId('color-row').first();
    const [rawInput, swatch, hexField, rgbaField, trash] = await rowChildGeometry(row);

    for (const kid of [swatch, hexField, rgbaField, trash]) {
      expect(Math.abs(kid.centerY - rawInput.centerY)).toBeLessThanOrEqual(2);
    }
    // Left-to-right order on the same line, not stacked underneath each other.
    expect(swatch.left).toBeGreaterThanOrEqual(rawInput.right);
    expect(hexField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(rgbaField.left).toBeGreaterThanOrEqual(hexField.right);
    expect(trash.left).toBeGreaterThanOrEqual(rgbaField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('at 360px width, a color row still does not wrap onto multiple lines', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));

    const row = page.getByTestId('color-row').first();
    const [rawInput, swatch, hexField, rgbaField, trash] = await rowChildGeometry(row);

    for (const kid of [swatch, hexField, rgbaField, trash]) {
      expect(Math.abs(kid.centerY - rawInput.centerY)).toBeLessThanOrEqual(2);
    }
    expect(swatch.left).toBeGreaterThanOrEqual(rawInput.right);
    expect(hexField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(rgbaField.left).toBeGreaterThanOrEqual(hexField.right);
    expect(trash.left).toBeGreaterThanOrEqual(rgbaField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });
});

// ---------------------------------------------------------------------------
// Conventions sweep: standard control height (controls.css --control-h: 44px)
// and wide-screen responsiveness (working areas widen with the viewport).
// ---------------------------------------------------------------------------
test.describe('standard control height (controls.css)', () => {
  test('single-line inputs, selects, and buttons all meet the 44px standard height', async ({ page }) => {
    await page.evaluate(() => window.__colorConverter.addRow('#123456'));
    const row = page.getByTestId('color-row').first();

    const heights = {};
    const targets = {
      'convert-btn': page.getByTestId('convert-btn'),
      'clear-paste-btn': page.getByTestId('clear-paste-btn'),
      'add-row-btn': page.getByTestId('add-row-btn'),
      'row-input': row.getByTestId('row-input'),
      'row-hex-output': row.getByTestId('row-hex-output'),
      'row-rgba-output': row.getByTestId('row-rgba-output'),
    };
    for (const [name, loc] of Object.entries(targets)) {
      const box = await loc.boundingBox();
      heights[name] = box.height;
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }

    // They agree on one shared height (no per-tool drift between input/button).
    const values = Object.values(heights);
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max - min, `height spread across controls (${JSON.stringify(heights)})`).toBeLessThanOrEqual(1);
  });
});

test.describe('wide-screen layout uses more width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('at 1440px the app and output textareas fill well beyond the old ~1080px column', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorConverter.addRow('#ff0000');
      window.__colorConverter.addRow('rgba(0, 255, 0, 0.5)');
    });

    const appWidth = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().width);
    // Old cap was 1080px; the widened cap (1600px) lets the app fill the viewport.
    expect(appWidth).toBeGreaterThan(1200);

    // The two "one per line" output textareas grow with the viewport (side by
    // side, each taking real width) rather than staying in a narrow column.
    const rgbaW = await page.getByTestId('rgba-output').evaluate((el) => el.getBoundingClientRect().width);
    const hexW = await page.getByTestId('hex-output').evaluate((el) => el.getBoundingClientRect().width);
    expect(rgbaW).toBeGreaterThan(550);
    expect(hexW).toBeGreaterThan(550);
  });
});

// ---------------------------------------------------------------------------
// Shared License modal (src/tools/include/license.js, inlined via the shared
// footer.html). The footer "MIT License" link opens an accessible modal
// (role=dialog, focus trap, ✕/Esc/backdrop close, focus return).
// color-converter bundles no third-party libraries, so the modal shows the
// "100% vanilla" note rather than a dependency list.
// ---------------------------------------------------------------------------
test.describe('shared License modal', () => {
  test('the footer License link opens the modal with MIT text, the ✕, and the no-dependencies note', async ({ page }) => {
    const overlay = page.getByTestId('license-overlay');
    const trigger = page.getByTestId('footer-license-link');
    await expect(trigger).toHaveText('MIT License');

    await trigger.click();

    const modal = page.getByTestId('license-modal');
    await expect(overlay).toBeVisible();
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toContainText('MIT License');

    const closeX = modal.getByTestId('license-close-x');
    await expect(closeX).toBeVisible();
    await expect(closeX).toHaveAttribute('aria-label', 'Close');

    await expect(modal).toContainText('100% vanilla');
    await expect(modal).toContainText('no runtime dependencies');
  });

  // Open + accessible dialog + ✕ focused + Esc / ✕ / backdrop close with focus
  // return are the shared License-modal contract; assert them via the helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});
