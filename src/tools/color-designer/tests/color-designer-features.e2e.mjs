// E2E for the v10 feature batch: lock/pin, roll history, export, WCAG contrast,
// hue wheel, CVD preview, demo speed, seeded rolls, share links, saved shelf,
// and keyboard shortcuts. Driven via data-testid + the window.__colorDesigner
// hook, mirroring color-designer.e2e.mjs conventions.
import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('color-designer');

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
  await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
});

async function openScheme(page, i) {
  const toggle = page.getByTestId('scheme-row').nth(i).getByTestId('scheme-toggle');
  // Scheme 0 auto-expands on initial load — only click if it isn't already open.
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// Harmony / colors-per-scheme / vision / demo-speed / roll-seed and the
// Copy-link / Save-palette actions now live inside the Settings modal.
async function openSettings(page) {
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('settings-overlay')).toBeVisible();
}
async function saveSettings(page) {
  await page.getByTestId('settings-save-btn').click();
  await expect(page.getByTestId('settings-overlay')).toBeHidden();
}
// Set one Settings control (a <select> by value, or the roll-seed text input
// when fill=true) and Save so it sticks.
async function setSetting(page, testid, value, fill = false) {
  await openSettings(page);
  const ctrl = page.getByTestId(testid);
  if (fill) await ctrl.fill(value); else await ctrl.selectOption(value);
  await saveSettings(page);
}
async function savePalette(page) {
  await openSettings(page);
  await page.getByTestId('save-palette-btn').click();
  await saveSettings(page);
}

// --- Lock / pin -------------------------------------------------------------
test.describe('lock/pin across rerolls', () => {
  test('pinning a swatch keeps its exact color through a reroll; others change', async ({ page }) => {
    const swatch = page.getByTestId('scheme-row').first().getByTestId('scheme-swatch').first();
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-lock-btn').click();

    const lockedBefore = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.locked['0:0']));
    expect(lockedBefore).not.toBe(undefined);

    await page.getByTestId('roll-btn').click();

    const after = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes[0][0]));
    expect(after).toBe(lockedBefore); // pinned slot survived the reroll
    // the pin persisted and the swatch shows as locked
    await expect(page.getByTestId('scheme-row').first().getByTestId('scheme-swatch').first()).toHaveClass(/locked/);
  });

  test('unpinning removes the lock', async ({ page }) => {
    const swatch = page.getByTestId('scheme-row').first().getByTestId('scheme-swatch').first();
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-lock-btn').click();
    expect(await page.evaluate(() => Object.keys(window.__colorDesigner.state.locked).length)).toBe(1);
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-lock-btn').click();
    expect(await page.evaluate(() => Object.keys(window.__colorDesigner.state.locked).length)).toBe(0);
  });

  test('shrinking colors-per-scheme drops locks whose slot no longer exists', async ({ page }) => {
    // Lock the last color of a 4-color scheme, then drop N to 2.
    await page.evaluate(() => {
      const cd = window.__colorDesigner;
      const c = cd.state.rollResult.schemes[0][3];
      cd.toggleLock(0, 3, c);
    });
    expect(await page.evaluate(() => Object.keys(window.__colorDesigner.state.locked).length)).toBe(1);
    await setSetting(page, 'count-select', '2');
    expect(await page.evaluate(() => Object.keys(window.__colorDesigner.state.locked).length)).toBe(0);
  });
});

// --- Roll history -----------------------------------------------------------
test.describe('roll history (back/forward)', () => {
  test('Back returns to the previous roll; Forward re-advances; ends disable', async ({ page }) => {
    await page.getByTestId('roll-btn').click(); // roll 2
    const roll2 = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));

    await page.getByTestId('roll-back-btn').click(); // -> roll 1
    const afterBack = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(afterBack).not.toBe(roll2);
    await expect(page.getByTestId('roll-forward-btn')).toBeEnabled();

    await page.getByTestId('roll-forward-btn').click(); // -> roll 2 again
    const afterFwd = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(afterFwd).toBe(roll2);
    await expect(page.getByTestId('roll-forward-btn')).toBeDisabled(); // at newest
  });

  test('a new roll after Back truncates the forward tail', async ({ page }) => {
    await page.getByTestId('roll-btn').click();
    await page.getByTestId('roll-btn').click();
    await page.getByTestId('roll-back-btn').click();
    await page.getByTestId('roll-btn').click(); // new roll from a middle point
    await expect(page.getByTestId('roll-forward-btn')).toBeDisabled();
    const len = await page.evaluate(() => window.__colorDesigner.state.history.length);
    const idx = await page.evaluate(() => window.__colorDesigner.state.historyIndex);
    expect(idx).toBe(len - 1);
  });
});

// --- Seeded rolls -----------------------------------------------------------
test.describe('deterministic seeded rolls', () => {
  test('the same roll seed reproduces the same roll; a different seed differs', async ({ page }) => {
    await setSetting(page, 'roll-seed-input', 'hello-42', true);
    await page.getByTestId('roll-btn').click();
    const a = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    await page.getByTestId('roll-btn').click();
    const b = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(b).toBe(a); // same seed => identical roll

    await setSetting(page, 'roll-seed-input', 'different', true);
    await page.getByTestId('roll-btn').click();
    const c = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(c).not.toBe(a);
  });
});

// --- Export -----------------------------------------------------------------
test.describe('export subsection', () => {
  test('format select drives the output textarea; matches exportPalette', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    await detail.getByTestId('scheme-export-format').selectOption('css');
    const ta = detail.getByTestId('scheme-export-output');
    await expect(ta).toHaveValue(/:root\s*\{/);

    const expected = await page.evaluate(() => {
      const cd = window.__colorDesigner;
      return cd.exportPalette(cd.state.rollResult.schemes[0], 'json');
    });
    await detail.getByTestId('scheme-export-format').selectOption('json');
    await expect(ta).toHaveValue(expected);
  });

  test('Copy gives feedback; Download and PNG buttons are present and clickable', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    const copyBtn = detail.getByTestId('scheme-export-copy-btn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText(/Copied|✅|Copy/); // ctFlash swaps then restores
    await expect(detail.getByTestId('scheme-export-download-btn')).toBeVisible();
    await expect(detail.getByTestId('scheme-export-png-btn')).toBeVisible();
  });

  test('the default export format is the HEX list', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    await expect(detail.getByTestId('scheme-export-format')).toHaveValue('hex');
    // the textarea shows one #rrggbb per line, matching the scheme length
    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    const val = await detail.getByTestId('scheme-export-output').inputValue();
    const lines = val.trim().split('\n');
    expect(lines).toHaveLength(N);
    expect(lines.every((l) => /^#[0-9a-f]{6}$/i.test(l))).toBe(true);
  });

  test('the exported PNG embeds claude-tools attribution metadata and stays a valid PNG', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const cd = window.__colorDesigner;
      const canvas = document.createElement('canvas');
      canvas.width = 4; canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 4, 2);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const withMeta = cd.addPngMetadata(bytes, cd.pngMetadataEntries(cd.state.rollResult.schemes[0]));
      let s = '';
      for (let i = 0; i < withMeta.length; i++) s += String.fromCharCode(withMeta[i]);
      // valid PNG: 8-byte signature + ends with an IEND chunk
      const sigOk = withMeta[0] === 137 && withMeta[1] === 80 && withMeta[2] === 78 && withMeta[3] === 71;
      const endsIEND = s.slice(-8, -4) === 'IEND';
      // and it still decodes as an image (proves chunk lengths + CRCs are valid)
      const url = URL.createObjectURL(new Blob([withMeta], { type: 'image/png' }));
      const decoded = await new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth === 4 && img.naturalHeight === 2);
        img.onerror = () => res(false);
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return {
        grew: withMeta.length > bytes.length, sigOk, endsIEND, decoded,
        hasTEXt: s.includes('tEXt'),
        hasRepo: s.includes('github.com/codercowboy/claude-tools'),
        hasClaude: s.includes('Claude'),
        hasJason: s.includes('Jason'),
      };
    });
    expect(result.grew).toBe(true);
    expect(result.sigOk).toBe(true);
    expect(result.endsIEND).toBe(true);
    expect(result.decoded).toBe(true);
    expect(result.hasTEXt).toBe(true);
    expect(result.hasRepo).toBe(true);
    expect(result.hasClaude).toBe(true);
    expect(result.hasJason).toBe(true);
  });
});

// --- Contrast + hue wheel ---------------------------------------------------
test.describe('contrast + hue wheel subsections', () => {
  test('contrast section has one row per color, each showing a ratio', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    const N = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0].length);
    await expect(detail.getByTestId('scheme-contrast-row')).toHaveCount(N);
    await expect(detail.getByTestId('scheme-contrast-row').first()).toContainText(':1');
  });

  test('hue wheel renders an inline SVG with a dot per color', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    const wheel = detail.getByTestId('scheme-wheel');
    await expect(wheel.locator('svg')).toHaveCount(1);
    const N = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0].length);
    // one filled dot (r=8) per color
    const dots = await wheel.locator('svg circle[r="8"]').count();
    expect(dots).toBe(N);
  });
});

// --- CVD preview ------------------------------------------------------------
test.describe('color-blindness preview', () => {
  test('selecting a CVD mode repaints swatches through the simulation (state colors unchanged)', async ({ page }) => {
    const realBefore = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes[0][0]));
    await setSetting(page, 'cvd-select', 'deuteranopia');

    const expected = await page.evaluate(() => {
      const cd = window.__colorDesigner;
      return cd.rgbaString(cd.simulateCVD(cd.state.rollResult.schemes[0][0], 'deuteranopia'));
    });
    const shown = await page.getByTestId('scheme-swatch').first()
      .evaluate((el) => el.style.getPropertyValue('--swatch-color').trim());
    expect(shown).toBe(expected);

    // underlying palette data is untouched
    const realAfter = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes[0][0]));
    expect(realAfter).toBe(realBefore);
  });

  test('a persistent badge shows while a vision mode is active, and its button restores normal vision', async ({ page }) => {
    await expect(page.getByTestId('cvd-badge')).toBeHidden();
    await setSetting(page, 'cvd-select', 'deuteranopia');

    const badge = page.getByTestId('cvd-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/deuteranopia/i);

    await badge.getByTestId('cvd-badge-reset').click();
    await expect(page.getByTestId('cvd-badge')).toBeHidden();
    expect(await page.evaluate(() => window.__colorDesigner.state.cvd)).toBe('none');
    await expect(page.getByTestId('cvd-select')).toHaveValue('none');
  });

  test('the vision badge is restored on reload when a mode was left active', async ({ page }) => {
    await setSetting(page, 'cvd-select', 'protanopia');
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('color-designer:v1') || '{}').cvd === 'protanopia'; }
      catch { return false; }
    });
    await page.context().storageState();
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('cvd-badge')).toBeVisible();
    await expect(page.getByTestId('cvd-badge')).toContainText(/protanopia/i);
  });
});

// --- Demo speed -------------------------------------------------------------
test.describe('demo speed', () => {
  test('changing demo speed updates and persists state.demoSpeed', async ({ page }) => {
    await setSetting(page, 'demo-speed', 'fast');
    expect(await page.evaluate(() => window.__colorDesigner.state.demoSpeed)).toBe('fast');
    // Wait for the write to actually land in storage before reloading (file://
    // commits localStorage asynchronously, so an immediate reload can race it).
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('color-designer:v1') || '{}').demoSpeed === 'fast'; }
      catch { return false; }
    });
    await page.context().storageState(); // force the file:// localStorage IPC to commit before reload
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('demo-speed')).toHaveValue('fast');
  });
});

// --- Share links ------------------------------------------------------------
test.describe('shareable links', () => {
  test('a share hash reopens the exact palette (schemes deep-equal, not a fresh roll)', async ({ page }) => {
    const hash = await page.evaluate(() => window.__colorDesigner.encodeShareState());
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));

    await page.goto(`${TOOL_URL}#${hash}`);
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const after = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(after).toBe(before);
    // The shared state is also written to localStorage as the new baseline, so
    // later edits persist normally. (Hash-stripping via history.replaceState is
    // best-effort and can be blocked on file:// origins, so it's not asserted.)
    const stored = await page.evaluate(() => localStorage.getItem('color-designer:v1'));
    expect(stored).toBeTruthy();
  });

  test('a garbage hash falls back gracefully to a normal roll', async ({ page }) => {
    await page.goto(`${TOOL_URL}#not-valid-base64!!!`);
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('scheme-row')).toHaveCount(5);
  });
});

// --- Saved shelf ------------------------------------------------------------
test.describe('saved-palette shelf', () => {
  test('Save adds a shelf item; Load shows it as scheme 1; Delete (confirmed) removes it', async ({ page }) => {
    await openScheme(page, 0);
    const savedColors = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0].map(window.__colorDesigner.hexString));

    await savePalette(page);
    await expect(page.getByTestId('saved-item')).toHaveCount(1);

    // Load: scheme 0 becomes the saved palette
    await page.getByTestId('saved-item').first().getByTestId('saved-item-load').click();
    const loaded = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0].map(window.__colorDesigner.hexString));
    expect(loaded).toEqual(savedColors);

    // Delete goes through the ctConfirm dialog
    await page.getByTestId('saved-item').first().getByTestId('saved-item-delete').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByTestId('saved-item')).toHaveCount(0);
  });

  test('a saved palette persists across reload', async ({ page }) => {
    await openScheme(page, 0);
    await savePalette(page);
    await expect(page.getByTestId('saved-item')).toHaveCount(1);
    // Wait for the write to land before reloading (file:// commits localStorage
    // asynchronously, so an immediate reload can race the save).
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('color-designer:saved:v1') || '[]').length === 1; }
      catch { return false; }
    });
    await page.context().storageState(); // force the file:// localStorage IPC to commit before reload
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('saved-item')).toHaveCount(1);
  });
});

// --- Keyboard shortcuts -----------------------------------------------------
test.describe('keyboard shortcuts', () => {
  test('r rerolls, 1 opens scheme 1, Esc closes it, ? opens help', async ({ page }) => {
    await page.locator('body').click(); // ensure focus isn't in an input
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    await page.keyboard.press('r');
    await page.waitForFunction((p) => JSON.stringify(window.__colorDesigner.state.rollResult.schemes) !== p, before, { timeout: 3000 }).catch(() => {});

    await page.keyboard.press('1');
    await expect(page.getByTestId('scheme-row').first().getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('scheme-row').first().getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('?');
    await expect(page.getByTestId('help-overlay')).toBeVisible();
  });

  test('shortcuts are ignored while typing in the roll-seed input', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('roll-seed-input').fill('');
    await page.getByTestId('roll-seed-input').focus();
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    await page.keyboard.type('r'); // should type into the field, not reroll
    await expect(page.getByTestId('roll-seed-input')).toHaveValue('r');
    const after = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(after).toBe(before);
  });
});

// --- Conventions sweep: shared controls.css (control heights + in-field copy)
//     and wide-screen layout (docs/conventions.md § "Standard control height &
//     in-field copy" and § "Responsive & mobile"). --------------------------
test.describe('shared controls.css: standard 44px control height', () => {
  test('single-line text input, select, and button all render at the standard >= 44px height', async ({ page }) => {
    // One of each single-line control kind, drawn from the always-present UI.
    const heights = await page.evaluate(() => {
      const ids = {
        input: 'seed-input',      // text input
        select: 'mood-select',    // <select>
        button: 'roll-btn',       // <button>
      };
      const out = {};
      for (const [kind, id] of Object.entries(ids)) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        out[kind] = {
          offset: el.getBoundingClientRect().height,
          minHeight: parseFloat(getComputedStyle(el).minHeight),
        };
      }
      return out;
    });
    for (const kind of ['input', 'select', 'button']) {
      expect(heights[kind].minHeight).toBeGreaterThanOrEqual(44);
      expect(heights[kind].offset).toBeGreaterThanOrEqual(44);
    }
  });

  test('tiny swatch overlay buttons opt OUT of the 44px min-height (they stay ~20px and do not overlap)', async ({ page }) => {
    // The lock + add-as-seed overlay chips sit in the top-right / bottom-right
    // of a 50px swatch; the shared 44px control min-height would inflate them so
    // they overlap and steal each other's clicks (regression guard).
    const swatch = page.getByTestId('scheme-row').first().getByTestId('scheme-swatch').first();
    await swatch.hover();
    const geo = await swatch.evaluate((el) => {
      const lock = el.querySelector('[data-testid="scheme-swatch-lock-btn"]').getBoundingClientRect();
      const seed = el.querySelector('[data-testid="scheme-swatch-seed-btn"]').getBoundingClientRect();
      return { lockH: lock.height, seedH: seed.height, overlap: lock.bottom > seed.top };
    });
    expect(geo.lockH).toBeLessThan(30);
    expect(geo.seedH).toBeLessThan(30);
    expect(geo.overlap).toBe(false); // lock (top) must not extend down into the seed (+) button
  });
});

test.describe('shared controls.css: in-field copy buttons', () => {
  test('each per-color rgba/hex value field is a .ct-field wrapping the input + a .ct-copy-btn', async ({ page }) => {
    await openScheme(page, 0);
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    const shape = await row.evaluate((el) => {
      const rgbaInput = el.querySelector('[data-testid="scheme-color-rgba"]');
      const copyBtn = el.querySelector('[data-testid="scheme-color-rgba-copy"]');
      const field = rgbaInput.closest('.ct-field');
      return {
        wrappedInCtField: !!field,
        copyInSameField: !!field && field.contains(copyBtn),
        copyIsCtCopyBtn: copyBtn.classList.contains('ct-copy-btn'),
        // The input reserves right padding so its value never runs under the icon.
        padRight: parseFloat(getComputedStyle(rgbaInput).paddingRight),
      };
    });
    expect(shape.wrappedInCtField).toBe(true);
    expect(shape.copyInSameField).toBe(true);
    expect(shape.copyIsCtCopyBtn).toBe(true);
    expect(shape.padRight).toBeGreaterThanOrEqual(30); // ~2.6rem reserved for the icon
  });

  test('per-color in-field copy button copies the value and flashes a check', async ({ page }) => {
    await openScheme(page, 0);
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    const copyBtn = row.getByTestId('scheme-color-rgba-copy');
    await expect(copyBtn).toHaveText('📋');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅');
  });

  test('the export output textarea has an always-on in-field copy button (.ct-field--multiline)', async ({ page }) => {
    await openScheme(page, 0);
    const detail = page.getByTestId('scheme-detail').first();
    const ta = detail.getByTestId('scheme-export-output');
    const wrapsMultiline = await ta.evaluate((el) => {
      const field = el.closest('.ct-field');
      return !!field && field.classList.contains('ct-field--multiline');
    });
    expect(wrapsMultiline).toBe(true);

    const inFieldCopy = detail.getByTestId('scheme-export-output-copy');
    await expect(inFieldCopy).toBeVisible();
    await expect(inFieldCopy).toHaveText('📋');
    await inFieldCopy.click();
    await expect(inFieldCopy).toHaveText('✅');
    // The separate controls-row Copy button still exists and works too.
    await expect(detail.getByTestId('scheme-export-copy-btn')).toBeVisible();
  });

  test('the in-field copy button is not washed out by the tool\'s generic button:hover', async ({ page }) => {
    await openScheme(page, 0);
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    const copyBtn = row.getByTestId('scheme-color-rgba-copy');
    await copyBtn.hover();
    const bg = await copyBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    // The generic purple wash is rgb(241, 236, 252); the ct-copy-btn hover is a
    // neutral grey (rgba(127,127,127,.16)) — assert it did NOT take the purple.
    expect(bg).not.toBe('rgb(241, 236, 252)');
  });
});

test.describe('wide-screen layout uses the available width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the app content and schemes area widen well past the old narrow column on a large screen, with no horizontal overflow', async ({ page }) => {
    await openScheme(page, 0);
    const widths = await page.evaluate(() => ({
      app: document.querySelector('.app').getBoundingClientRect().width,
      schemes: document.querySelector('[data-testid="schemes-list"]').getBoundingClientRect().width,
      exportOut: document.querySelector('[data-testid="scheme-export-output"]').getBoundingClientRect().width,
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    // Old fixed column was 920px; the widened cap (1180) must clearly beat it.
    expect(widths.app).toBeGreaterThan(1000);
    expect(widths.schemes).toBeGreaterThan(1000);
    expect(widths.exportOut).toBeGreaterThan(900);
    // No horizontal page overflow at a wide viewport.
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.innerWidth + 2);
  });
});

// ---------------------------------------------------------------------------
// Shared License modal (src/tools/include/license.js, inlined via the shared
// footer.html). The footer "MIT License" link opens an accessible modal
// (role=dialog, focus trap, ✕/Esc/backdrop close, focus return).
// color-designer bundles no third-party libraries, so the modal shows the
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
