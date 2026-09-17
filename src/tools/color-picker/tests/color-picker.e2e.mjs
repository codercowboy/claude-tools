// @playwright/test spec for tools/color-picker/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec
// drives the finished page from the outside via data-testid hooks and the
// window.__colorPicker test API described in DESIGN.md § Testability and
// PLAN.md § 10.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/color-picker/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';
import { assertLicenseModal } from '../../test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);

const HELP_SEEN_KEY = helpSeenKey('color-picker');

test.beforeEach(async ({ page }) => {
  // Pre-seed the Help-modal "seen" flag so the auto-show-on-first-load
  // behavior (docs/conventions.md "First-load help popup") doesn't steal
  // focus/interfere with every other test in this suite. The dedicated
  // "Help modal" describe block below tests the fresh-visit auto-show path
  // itself, using its own from-scratch browser.newContext() (so this
  // pre-seed init script is never registered on it).
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. Pure formatters: rgbaString / hexString canonical output.
// ---------------------------------------------------------------------------
test.describe('color formatters (pure functions)', () => {
  test('rgbaString: opaque color still renders alpha as rgba(r, g, b, 1)', async ({ page }) => {
    const out = await page.evaluate(() =>
      window.__colorPicker.rgbaString({ r: 255, g: 0, b: 0, a: 1 }),
    );
    expect(out).toBe('rgba(255, 0, 0, 1)');
  });

  test('rgbaString: fractional alpha is included, trimmed to at most 3 decimals', async ({ page }) => {
    const out = await page.evaluate(() => ({
      half: window.__colorPicker.rgbaString({ r: 10, g: 20, b: 30, a: 0.5 }),
      third: window.__colorPicker.rgbaString({ r: 1, g: 2, b: 3, a: 0.333333 }),
      zero: window.__colorPicker.rgbaString({ r: 1, g: 2, b: 3, a: 0 }),
    }));
    expect(out.half).toBe('rgba(10, 20, 30, 0.5)');
    expect(out.third).toBe('rgba(1, 2, 3, 0.333)'); // rounded to 3 decimals
    expect(out.zero).toBe('rgba(1, 2, 3, 0)');
  });

  test('hexString: opaque color -> #rrggbb (no alpha suffix)', async ({ page }) => {
    const out = await page.evaluate(() => ({
      red: window.__colorPicker.hexString({ r: 255, g: 0, b: 0, a: 1 }),
      mixed: window.__colorPicker.hexString({ r: 16, g: 32, b: 48, a: 1 }),
    }));
    expect(out.red).toBe('#ff0000');
    expect(out.mixed).toBe('#102030');
  });

  test('hexString: alpha < 1 -> #rrggbbaa', async ({ page }) => {
    const out = await page.evaluate(() => ({
      // 0.6 * 255 = 153 = 0x99 exactly, no rounding ambiguity.
      a60: window.__colorPicker.hexString({ r: 0, g: 255, b: 0, a: 0.6 }),
      // 0.2 * 255 = 51 = 0x33 exactly.
      a20: window.__colorPicker.hexString({ r: 255, g: 255, b: 0, a: 0.2 }),
    }));
    expect(out.a60).toBe('#00ff0099');
    expect(out.a20).toBe('#ffff0033');
  });

  test('hexString/rgbaString: black and white edge cases', async ({ page }) => {
    const out = await page.evaluate(() => ({
      blackHex: window.__colorPicker.hexString({ r: 0, g: 0, b: 0, a: 1 }),
      whiteHex: window.__colorPicker.hexString({ r: 255, g: 255, b: 255, a: 1 }),
      blackRgba: window.__colorPicker.rgbaString({ r: 0, g: 0, b: 0, a: 1 }),
    }));
    expect(out.blackHex).toBe('#000000');
    expect(out.whiteHex).toBe('#ffffff');
    expect(out.blackRgba).toBe('rgba(0, 0, 0, 1)');
  });
});

// ---------------------------------------------------------------------------
// 2. Deterministic load + sample: known solid-color and 2x2 multi-color PNGs
//    built in-page via canvas.toDataURL, loaded via loadImageFromDataURL,
//    sampled via sampleAt(px,py). This is the core correctness check.
// ---------------------------------------------------------------------------
test.describe('deterministic load + sample', () => {
  test('solid-color image: sampleAt returns the exact pixel at multiple coordinates', async ({ page }) => {
    // a=0.6 -> alpha byte 0.6*255=153 exactly, no rounding ambiguity, so the
    // expected {r,g,b,a} below round-trips exactly through PNG encoding.
    const expected = { r: 200, g: 100, b: 50, a: 0.6 };
    const result = await page.evaluate(async (expected) => {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const cx = c.getContext('2d');
      cx.fillStyle = `rgba(${expected.r}, ${expected.g}, ${expected.b}, ${expected.a})`;
      cx.fillRect(0, 0, 4, 4);
      const dataUrl = c.toDataURL('image/png');
      await window.__colorPicker.loadImageFromDataURL(dataUrl);
      return {
        topLeft: window.__colorPicker.sampleAt(0, 0),
        bottomRight: window.__colorPicker.sampleAt(3, 3),
        center: window.__colorPicker.sampleAt(2, 2),
        outOfBounds: window.__colorPicker.sampleAt(10, 10),
        negative: window.__colorPicker.sampleAt(-1, 0),
      };
    }, expected);
    expect(result.topLeft).toEqual(expected);
    expect(result.bottomRight).toEqual(expected);
    expect(result.center).toEqual(expected);
    expect(result.outOfBounds).toBeNull();
    expect(result.negative).toBeNull();
  });

  test('2x2 multi-color image: each pixel samples exactly, independent of its neighbors', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Byte-exact alpha values (255, 255, 153=0.6*255, 51=0.2*255) so the
      // expected normalized alpha is computed with the SAME division the
      // app itself uses (byte === 255 ? 1 : byte/255), avoiding any
      // half-rounding ambiguity in the encode step.
      const pixels = [
        { x: 0, y: 0, r: 255, g: 0, b: 0, aByte: 255 }, // red, opaque
        { x: 1, y: 0, r: 0, g: 255, b: 0, aByte: 255 }, // green, opaque
        { x: 0, y: 1, r: 0, g: 0, b: 255, aByte: 153 }, // blue, a=0.6
        { x: 1, y: 1, r: 255, g: 255, b: 0, aByte: 51 }, // yellow, a=0.2
      ];
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const cx = c.getContext('2d');
      const imgData = cx.createImageData(2, 2);
      for (const p of pixels) {
        const i = (p.y * 2 + p.x) * 4;
        imgData.data[i] = p.r;
        imgData.data[i + 1] = p.g;
        imgData.data[i + 2] = p.b;
        imgData.data[i + 3] = p.aByte;
      }
      cx.putImageData(imgData, 0, 0);
      const dataUrl = c.toDataURL('image/png');
      await window.__colorPicker.loadImageFromDataURL(dataUrl);

      const expectedFor = (p) => ({
        r: p.r,
        g: p.g,
        b: p.b,
        a: p.aByte === 255 ? 1 : p.aByte / 255,
      });

      return pixels.map((p) => ({
        expected: expectedFor(p),
        actual: window.__colorPicker.sampleAt(p.x, p.y),
      }));
    });

    for (const { expected, actual } of result) {
      expect(actual).toEqual(expected);
    }
  });

  test('real Choose-Color click samples the pixel under the cursor and adds a row', async ({ page }) => {
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(10, 20, 30, 1)';
      cx.fillRect(0, 0, 10, 10);
      return c.toDataURL('image/png');
    });
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);

    await page.getByTestId('choose-color-btn').click();
    const box = await page.getByTestId('canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('color-rgba-input').first()).toHaveValue('rgba(10, 20, 30, 1)');
    await expect(page.getByTestId('color-hex-input').first()).toHaveValue('#0a141e');
  });

  // The coordinate mapping (CSS-space pointer -> image-space pixel) is the
  // single most important correctness property of the tool per DESIGN/PLAN.
  // The test above only exercises it at the initial fit transform (scale
  // computed by computeFitTransform, no pan). These two tests exercise the
  // SAME real-click path after the transform has actually been changed by a
  // real wheel-zoom and/or a real manual pan, so a bug in the inverse-map
  // formula (or in how transform.scale/offsetX/offsetY get mutated by zoom
  // /pan) would show up as a wrong sampled color here even though it might
  // not at scale===1.
  test('wheel-zoom before a real click still samples the exact pixel under the crosshair', async ({ page }) => {
    const target = { x: 5, y: 3, r: 200, g: 150, b: 50 };
    const dataUrl = await page.evaluate((t) => {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(0, 0, 0, 1)';
      cx.fillRect(0, 0, 8, 8);
      cx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, 1)`;
      cx.fillRect(t.x, t.y, 1, 1);
      return c.toDataURL('image/png');
    }, target);
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);

    const box = await page.getByTestId('canvas').boundingBox();
    // Anchor the wheel-zoom at the target pixel's current on-screen center so
    // it stays under the mouse (and thus inside the canvas) after zooming.
    const before = await page.evaluate((t) => {
      const tr = window.__colorPicker.state.transform;
      return { x: (t.x + 0.5) * tr.scale + tr.offsetX, y: (t.y + 0.5) * tr.scale + tr.offsetY };
    }, target);
    await page.mouse.move(box.x + before.x, box.y + before.y);
    await page.mouse.wheel(0, -600); // negative deltaY zooms in, per the app's wheel handler

    await page.getByTestId('choose-color-btn').click();

    const after = await page.evaluate((t) => {
      const tr = window.__colorPicker.state.transform;
      return { x: (t.x + 0.5) * tr.scale + tr.offsetX, y: (t.y + 0.5) * tr.scale + tr.offsetY };
    }, target);
    await page.mouse.click(box.x + after.x, box.y + after.y);

    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('color-rgba-input').first()).toHaveValue(
      `rgba(${target.r}, ${target.g}, ${target.b}, 1)`,
    );
  });

  test('manual pan before a real click still samples the exact pixel under the crosshair', async ({ page }) => {
    const target = { x: 5, y: 5, r: 30, g: 200, b: 90 };
    const dataUrl = await page.evaluate((t) => {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(5, 5, 5, 1)';
      cx.fillRect(0, 0, 10, 10);
      cx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, 1)`;
      cx.fillRect(t.x, t.y, 1, 1);
      return c.toDataURL('image/png');
    }, target);
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);

    const box = await page.getByTestId('canvas').boundingBox();

    // Manual pan while Choose Color is off (a drag pans the view).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();

    await page.getByTestId('choose-color-btn').click();

    const clickPoint = await page.evaluate((t) => {
      const tr = window.__colorPicker.state.transform;
      return { x: (t.x + 0.5) * tr.scale + tr.offsetX, y: (t.y + 0.5) * tr.scale + tr.offsetY };
    }, target);
    const canvasSize = await page.getByTestId('canvas').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    // Sanity check: the target pixel must still be on-screen after panning,
    // otherwise the click below would assert nothing meaningful.
    expect(clickPoint.x).toBeGreaterThan(0);
    expect(clickPoint.x).toBeLessThan(canvasSize.width);
    expect(clickPoint.y).toBeGreaterThan(0);
    expect(clickPoint.y).toBeLessThan(canvasSize.height);

    await page.mouse.click(box.x + clickPoint.x, box.y + clickPoint.y);

    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('color-rgba-input').first()).toHaveValue(
      `rgba(${target.r}, ${target.g}, ${target.b}, 1)`,
    );
  });

  test('real click samples the exact pixel under a non-1 devicePixelRatio (deviceScaleFactor 2)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    try {
      // This test uses its own fresh browser.newContext() (bypassing the
      // shared beforeEach's `context` fixture), so it must pre-seed the
      // Help-modal "seen" flag itself — otherwise the modal auto-shows
      // (docs/conventions.md "First-load help popup") and its overlay
      // intercepts the choose-color-btn/canvas clicks below.
      await context.addInitScript((key) => {
        try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
      }, HELP_SEEN_KEY);
      const page = await context.newPage();
      await page.goto(TOOL_URL);

      const target = { r: 120, g: 40, b: 220 };
      const dataUrl = await page.evaluate((t) => {
        const c = document.createElement('canvas');
        c.width = 6;
        c.height = 6;
        const cx = c.getContext('2d');
        cx.fillStyle = 'rgba(0, 0, 0, 1)';
        cx.fillRect(0, 0, 6, 6);
        cx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, 1)`;
        cx.fillRect(3, 3, 1, 1);
        return c.toDataURL('image/png');
      }, target);
      await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);

      await page.getByTestId('choose-color-btn').click();
      const clickPoint = await page.evaluate(() => {
        const tr = window.__colorPicker.state.transform;
        return { x: (3 + 0.5) * tr.scale + tr.offsetX, y: (3 + 0.5) * tr.scale + tr.offsetY };
      });
      const box = await page.getByTestId('canvas').boundingBox();
      await page.mouse.click(box.x + clickPoint.x, box.y + clickPoint.y);

      await expect(page.getByTestId('color-row')).toHaveCount(1);
      await expect(page.getByTestId('color-rgba-input').first()).toHaveValue(
        `rgba(${target.r}, ${target.g}, ${target.b}, 1)`,
      );
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. addColor adds a row (newest on top) with matching swatch/rgba/hex.
// ---------------------------------------------------------------------------
test.describe('addColor / color rows', () => {
  test('adds a row whose swatch, rgba input, and hex input match the formatters', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 12, g: 34, b: 56, a: 1 }));

    await expect(page.getByTestId('color-row')).toHaveCount(1);
    const row = page.getByTestId('color-row').first();
    const expected = await page.evaluate(() => ({
      rgba: window.__colorPicker.rgbaString({ r: 12, g: 34, b: 56, a: 1 }),
      hex: window.__colorPicker.hexString({ r: 12, g: 34, b: 56, a: 1 }),
    }));

    await expect(row.getByTestId('color-rgba-input')).toHaveValue(expected.rgba);
    await expect(row.getByTestId('color-hex-input')).toHaveValue(expected.hex);
    const swatchVar = await row.getByTestId('color-swatch').evaluate((el) =>
      el.style.getPropertyValue('--swatch-color'),
    );
    expect(swatchVar).toBe(expected.rgba);
    // Opaque color: swatch should NOT have the checker-background alpha class.
    await expect(row.getByTestId('color-swatch')).not.toHaveClass(/alpha/);
  });

  test('translucent color gets the alpha checker-background swatch class', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 0.4 }));
    const row = page.getByTestId('color-row').first();
    await expect(row.getByTestId('color-swatch')).toHaveClass(/alpha/);
  });

  test('newest color appears at the top of the list', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 1, b: 1, a: 1 });
      window.__colorPicker.addColor({ r: 2, g: 2, b: 2, a: 1 });
      window.__colorPicker.addColor({ r: 3, g: 3, b: 3, a: 1 });
    });
    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByTestId('color-rgba-input')).toHaveValue('rgba(3, 3, 3, 1)');
    await expect(rows.nth(1).getByTestId('color-rgba-input')).toHaveValue('rgba(2, 2, 2, 1)');
    await expect(rows.nth(2).getByTestId('color-rgba-input')).toHaveValue('rgba(1, 1, 1, 1)');
  });
});

// ---------------------------------------------------------------------------
// 3b. Derived output textareas (RGBA / HEX, one per line). `state.colors`
//    (newest-first) is the single source of truth; these two textareas are
//    pure derivations rebuilt on every change to the list, per
//    docs/conventions.md "Derived views have a single source of truth" and
//    mirroring tools/color-converter's rgba-output/hex-output pattern.
// ---------------------------------------------------------------------------
test.describe('derived output textareas (RGBA / HEX, one per line)', () => {
  test('empty state: textareas are empty and Copy-all buttons are disabled', async ({ page }) => {
    await expect(page.getByTestId('rgba-output')).toHaveValue('');
    await expect(page.getByTestId('hex-output')).toHaveValue('');
    await expect(page.getByTestId('rgba-copy-all')).toBeDisabled();
    await expect(page.getByTestId('hex-copy-all')).toBeDisabled();
  });

  test('adding colors populates both textareas, newest-on-top, line-aligned, matching per-row fields and formatters', async ({
    page,
  }) => {
    const expected = await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 1, b: 1, a: 1 });
      window.__colorPicker.addColor({ r: 2, g: 2, b: 2, a: 0.5 });
      window.__colorPicker.addColor({ r: 3, g: 3, b: 3, a: 1 });
      return {
        rgba: [
          window.__colorPicker.rgbaString({ r: 3, g: 3, b: 3, a: 1 }),
          window.__colorPicker.rgbaString({ r: 2, g: 2, b: 2, a: 0.5 }),
          window.__colorPicker.rgbaString({ r: 1, g: 1, b: 1, a: 1 }),
        ].join('\n'),
        hex: [
          window.__colorPicker.hexString({ r: 3, g: 3, b: 3, a: 1 }),
          window.__colorPicker.hexString({ r: 2, g: 2, b: 2, a: 0.5 }),
          window.__colorPicker.hexString({ r: 1, g: 1, b: 1, a: 1 }),
        ].join('\n'),
      };
    });

    await expect(page.getByTestId('rgba-output')).toHaveValue(expected.rgba);
    await expect(page.getByTestId('hex-output')).toHaveValue(expected.hex);

    // Line-aligned with, and identical to, the visible per-row fields (also
    // newest-on-top) at every row index.
    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(3);
    const rgbaLines = expected.rgba.split('\n');
    const hexLines = expected.hex.split('\n');
    for (let i = 0; i < 3; i++) {
      await expect(rows.nth(i).getByTestId('color-rgba-input')).toHaveValue(rgbaLines[i]);
      await expect(rows.nth(i).getByTestId('color-hex-input')).toHaveValue(hexLines[i]);
    }

    await expect(page.getByTestId('rgba-copy-all')).toBeEnabled();
    await expect(page.getByTestId('hex-copy-all')).toBeEnabled();
  });

  test('removing one color updates both textareas, keeping remaining order', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 10, g: 10, b: 10, a: 1 });
      window.__colorPicker.addColor({ r: 20, g: 20, b: 20, a: 1 });
      window.__colorPicker.addColor({ r: 30, g: 30, b: 30, a: 1 });
    });
    // Remove the middle row (rgba 20,20,20) via its trash + confirm.
    await page.getByTestId('color-row').nth(1).getByTestId('color-trash').click();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('color-row')).toHaveCount(2);
    await expect(page.getByTestId('rgba-output')).toHaveValue('rgba(30, 30, 30, 1)\nrgba(10, 10, 10, 1)');
    await expect(page.getByTestId('hex-output')).toHaveValue('#1e1e1e\n#0a0a0a');
  });

  test('remove-all empties both textareas and disables Copy-all', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 });
    });
    await page.getByTestId('remove-all-btn').click();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('rgba-output')).toHaveValue('');
    await expect(page.getByTestId('hex-output')).toHaveValue('');
    await expect(page.getByTestId('rgba-copy-all')).toBeDisabled();
    await expect(page.getByTestId('hex-copy-all')).toBeDisabled();
  });

  test('Copy-all buttons trigger the copy path and show "Copied!" feedback that reverts', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
    });

    const rgbaCopyAll = page.getByTestId('rgba-copy-all');
    await expect(rgbaCopyAll).toHaveText('Copy all');
    await rgbaCopyAll.click();
    await expect(rgbaCopyAll).toHaveText('Copied!');
    await expect(rgbaCopyAll).toHaveText('Copy all', { timeout: 2000 });

    const hexCopyAll = page.getByTestId('hex-copy-all');
    await expect(hexCopyAll).toHaveText('Copy all');
    await hexCopyAll.click();
    await expect(hexCopyAll).toHaveText('Copied!');
    await expect(hexCopyAll).toHaveText('Copy all', { timeout: 2000 });
  });

  test('rgbaOutput()/hexOutput() getters match the textareas', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 7, g: 8, b: 9, a: 1 });
      window.__colorPicker.addColor({ r: 70, g: 80, b: 90, a: 0.25 });
    });
    const getters = await page.evaluate(() => ({
      rgba: window.__colorPicker.rgbaOutput(),
      hex: window.__colorPicker.hexOutput(),
    }));
    await expect(page.getByTestId('rgba-output')).toHaveValue(getters.rgba);
    await expect(page.getByTestId('hex-output')).toHaveValue(getters.hex);
  });
});

// ---------------------------------------------------------------------------
// 4. Choose Color toggle: aria-pressed, active class, cursor, loupe.
// ---------------------------------------------------------------------------
test.describe('Choose Color toggle', () => {
  test('clicking toggles aria-pressed / active state, cursor, and loupe visibility; clicking again reverts', async ({
    page,
  }) => {
    const toggle = page.getByTestId('choose-color-btn');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveClass(/active/);
    await expect(page.getByTestId('stage')).toHaveClass(/choose-color/);
    const cursorActive = await page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).cursor);
    expect(cursorActive).toBe('crosshair');
    const loupeHiddenActive = await page.evaluate(() => document.getElementById('loupe').hidden);
    expect(loupeHiddenActive).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).not.toHaveClass(/active/);
    await expect(page.getByTestId('stage')).not.toHaveClass(/choose-color/);
    const cursorInactive = await page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).cursor);
    expect(cursorInactive).toBe('grab');
    const loupeHiddenInactive = await page.evaluate(() => document.getElementById('loupe').hidden);
    expect(loupeHiddenInactive).toBe(true);
  });

  // Adversarial-review finding: loupeEl.hidden was set false immediately on
  // mouse-mode activation, but loupeEl.style.left/top were only ever
  // assigned inside updateLoupe(), which only runs on a real
  // pointermove/pointerenter over the canvas. Until the mouse first entered
  // the canvas, #loupe (position: fixed, left/top unset) fell back to its
  // static DOM position and rendered as a stray opaque circle over the
  // header/toolbar. Fixed via positionLoupeDefault() (centers it over the
  // canvas immediately on activation). This test clicks the toggle (a real
  // Playwright click, which moves the mouse to the toolbar button — NOT over
  // the canvas) and checks the loupe's rendered rect before any pointer ever
  // enters the canvas.
  test('activating Choose Color (mouse) does not render the loupe over the header/toolbar before any pointer enters the canvas', async ({
    page,
  }) => {
    const toggle = page.getByTestId('choose-color-btn');
    await toggle.click();

    const loupeHidden = await page.evaluate(() => document.getElementById('loupe').hidden);
    expect(loupeHidden).toBe(false);

    const loupeBox = await page.locator('#loupe').boundingBox();
    const toolbarBox = await page.locator('.toolbar').boundingBox();
    expect(loupeBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();

    const noOverlap = loupeBox.y >= toolbarBox.y + toolbarBox.height
      || loupeBox.y + loupeBox.height <= toolbarBox.y;
    expect(noOverlap).toBe(true);

    // Also within (or at least anchored inside) the stage, not off in the
    // page's top-left corner (the pre-fix static-position fallback).
    const stageBox = await page.getByTestId('stage').boundingBox();
    const loupeCenterX = loupeBox.x + loupeBox.width / 2;
    const loupeCenterY = loupeBox.y + loupeBox.height / 2;
    expect(loupeCenterX).toBeGreaterThanOrEqual(stageBox.x);
    expect(loupeCenterX).toBeLessThanOrEqual(stageBox.x + stageBox.width);
    expect(loupeCenterY).toBeGreaterThanOrEqual(stageBox.y);
    expect(loupeCenterY).toBeLessThanOrEqual(stageBox.y + stageBox.height);
  });
});

// ---------------------------------------------------------------------------
// 4b. Adversarial-review finding (BLOCKER): the page-wide
//     `button:hover:not(:disabled)` rule had higher CSS specificity (0,2,1)
//     than the pasted ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0)
//     and than `.choose-color-btn.active` (0,2,0), so hovering either
//     washed a solid accent-blue background out to near-white (#eef1f8)
//     while the white text stayed white — effectively invisible. Fixed by
//     excluding `.ctc-btn` and `.choose-color-btn.active` from the generic
//     hover rule (`:not(.ctc-btn):not(.choose-color-btn.active)`) and adding
//     an explicit `.choose-color-btn.active:hover` rule that re-asserts the
//     filled accent state. docs/conventions.md "Destructive actions require
//     confirmation": "Yes" must read as "a clear, filled primary" — never
//     near-white.
// ---------------------------------------------------------------------------
test.describe('hover states stay legible (CSS specificity regression)', () => {
  test('hovering "Yes" in the remove-all ctConfirm dialog keeps a filled accent background with readable text', async ({
    page,
  }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
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

  test('hovering "Yes" in the per-row remove confirm dialog also keeps a filled accent background', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 }));
    await page.getByTestId('color-trash').click();

    const yesBtn = page.getByRole('button', { name: 'Yes' });
    await expect(yesBtn).toBeVisible();
    await yesBtn.hover();
    const bg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(47, 111, 237)');
  });

  test('the active Choose Color toggle stays legible (filled accent, readable text) on hover', async ({ page }) => {
    const toggle = page.getByTestId('choose-color-btn');
    await toggle.click(); // activate
    await expect(toggle).toHaveClass(/active/);

    const beforeHoverBg = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor);
    await toggle.hover();
    const afterHoverBg = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor);
    const afterHoverColor = await toggle.evaluate((el) => getComputedStyle(el).color);

    expect(afterHoverBg).toBe(beforeHoverBg); // stays the solid accent color, not washed to near-white
    expect(afterHoverBg).toBe('rgb(47, 111, 237)');
    expect(afterHoverColor).toBe('rgb(255, 255, 255)');
  });

  test('an inactive normal button (Reset view) still gets the light #eef1f8 hover, unaffected by the fix', async ({
    page,
  }) => {
    const resetBtn = page.getByTestId('reset-view-btn');
    await resetBtn.hover();
    const bg = await resetBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(238, 241, 248)'); // #eef1f8, unchanged existing light hover
  });
});

// ---------------------------------------------------------------------------
// 5. Copy buttons: rgba-copy / hex-copy trigger the copy path and show
//    check feedback. Clipboard read may be restricted in headless/file://
//    contexts, so we assert the UI feedback (icon flips to check) and that
//    the input value is exactly what would be copied, per the tester brief.
// ---------------------------------------------------------------------------
test.describe('copy buttons', () => {
  test('rgba-copy shows check feedback after click', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 9, g: 8, b: 7, a: 1 }));
    const row = page.getByTestId('color-row').first();
    const rgbaInput = row.getByTestId('color-rgba-input');
    await expect(rgbaInput).toHaveValue('rgba(9, 8, 7, 1)');

    const copyBtn = row.getByTestId('color-rgba-copy');
    await expect(copyBtn).toHaveText('📋');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅');
  });

  test('hex-copy shows check feedback after click', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 9, g: 8, b: 7, a: 1 }));
    const row = page.getByTestId('color-row').first();
    const hexInput = row.getByTestId('color-hex-input');
    await expect(hexInput).toHaveValue('#090807');

    const copyBtn = row.getByTestId('color-hex-copy');
    await expect(copyBtn).toHaveText('📋');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅');
  });

  test('check feedback reverts to the clipboard icon after ~1s', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 1, b: 1, a: 1 }));
    const copyBtn = page.getByTestId('color-row').first().getByTestId('color-rgba-copy');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅');
    await expect(copyBtn).toHaveText('📋', { timeout: 2000 });
  });
});

// ---------------------------------------------------------------------------
// 5a. controls.css conventions (docs/conventions.md "Standard control height &
//     in-field copy — controls.css"): the per-row copy button lives INSIDE the
//     value field via the shared `.ct-field` / `.ct-copy-btn` pattern; since
//     these are read-only OUTPUT fields, the copy button is ALWAYS shown; and
//     the single-line controls all share the standard 44px --control-h height.
// ---------------------------------------------------------------------------
test.describe('controls.css conventions (in-field copy + standard height)', () => {
  test('per-row copy buttons sit inside the .ct-field wrapper next to the value input', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 12, g: 34, b: 56, a: 1 }));
    const row = page.getByTestId('color-row').first();
    const info = await row.evaluate((el) => {
      const rgbaField = el.querySelector('[data-testid="color-rgba-input"]').closest('.ct-field');
      const hexField = el.querySelector('[data-testid="color-hex-input"]').closest('.ct-field');
      return {
        rgbaCopyInside: !!rgbaField && rgbaField.contains(el.querySelector('[data-testid="color-rgba-copy"]')),
        hexCopyInside: !!hexField && hexField.contains(el.querySelector('[data-testid="color-hex-copy"]')),
        rgbaCopyIsCtBtn: el.querySelector('[data-testid="color-rgba-copy"]').classList.contains('ct-copy-btn'),
        hexCopyIsCtBtn: el.querySelector('[data-testid="color-hex-copy"]').classList.contains('ct-copy-btn'),
      };
    });
    expect(info.rgbaCopyInside).toBe(true);
    expect(info.hexCopyInside).toBe(true);
    expect(info.rgbaCopyIsCtBtn).toBe(true);
    expect(info.hexCopyIsCtBtn).toBe(true);
  });

  test('read-only value fields always show their in-field copy button (never hidden)', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 0.5 }));
    const row = page.getByTestId('color-row').first();
    await expect(row.getByTestId('color-rgba-copy')).toBeVisible();
    await expect(row.getByTestId('color-hex-copy')).toBeVisible();
  });

  test('the in-field copy button is absolutely positioned inside the relative field', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 }));
    const pos = await page.getByTestId('color-row').first().evaluate((el) => {
      const field = el.querySelector('[data-testid="color-rgba-input"]').closest('.ct-field');
      const btn = el.querySelector('[data-testid="color-rgba-copy"]');
      return { fieldPosition: getComputedStyle(field).position, btnPosition: getComputedStyle(btn).position };
    });
    expect(pos.fieldPosition).toBe('relative');
    expect(pos.btnPosition).toBe('absolute');
  });

  test('value input reserves right padding so its text never runs under the copy icon', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 7, g: 8, b: 9, a: 1 }));
    const input = page.getByTestId('color-row').first().getByTestId('color-rgba-input');
    const paddingRight = await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(paddingRight).toBeGreaterThanOrEqual(30); // ~2.6rem reserve for the 2.6rem-wide icon
  });

  test('single-line controls share the standard 44px control height (--control-h)', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 3, g: 3, b: 3, a: 1 }));
    const measured = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="color-row"]');
      const rh = (root, sel) => Math.round(root.querySelector(sel).getBoundingClientRect().height);
      return {
        controlH: getComputedStyle(document.documentElement).getPropertyValue('--control-h').trim(),
        loadBtn: rh(document, '[data-testid="load-btn"]'),
        resetBtn: rh(document, '[data-testid="reset-view-btn"]'),
        rgbaInput: rh(row, '[data-testid="color-rgba-input"]'),
        copyBtn: rh(row, '[data-testid="color-rgba-copy"]'),
        trash: rh(row, '[data-testid="color-trash"]'),
      };
    });
    expect(measured.controlH).toBe('44px');
    expect(measured.loadBtn).toBe(44);
    expect(measured.resetBtn).toBe(44);
    expect(measured.rgbaInput).toBe(44);
    expect(measured.copyBtn).toBe(44);
    expect(measured.trash).toBe(44);
  });
});

// ---------------------------------------------------------------------------
// 6. Remove single row via the shared ctConfirm dialog (tools/include/
//    confirm.js): role=dialog/aria-modal, default focus on "Yes", Enter
//    confirms, Esc cancels, backdrop click cancels, Cancel button cancels.
//    The dialog has no data-testids of its own — it's a pasted, tool-
//    agnostic component — so tests drive it via getByRole('dialog') and the
//    "Yes"/"Cancel" button names, mirroring tools/hat-picker's suite.
// ---------------------------------------------------------------------------
test.describe('remove single row via ctConfirm', () => {
  test('dialog has role=dialog, aria-modal, the row-specific message, and defaults focus to Yes', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    await page.getByTestId('color-trash').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Remove this color?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();
  });

  test('Esc cancels and keeps the row', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    await page.getByTestId('color-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
  });

  test('Enter confirms and removes the row', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    await page.getByTestId('color-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });

  test('Cancel button cancels; backdrop click cancels; clicking inside the dialog does not', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    await page.getByTestId('color-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click inside the dialog (on the message text) — must NOT close it.
    await page.locator('.ctc-message').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancel button cancels.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(1);

    // Reopen; click the backdrop itself, outside the dialog box.
    await page.getByTestId('color-trash').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.ctc-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(1);
  });

  test('window.__colorPicker.removeColorById(id) remains a direct, non-modal call', async ({ page }) => {
    const id = await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }).id);
    await page.evaluate((id) => window.__colorPicker.removeColorById(id), id);

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Remove all via the shared ctConfirm dialog: disabled when empty;
//    enabled with rows; opens the dialog; Enter empties the list; Esc
//    cancels; a direct non-modal removeAllColors() hook remains available.
// ---------------------------------------------------------------------------
test.describe('remove all via ctConfirm', () => {
  test('disabled with zero colors, enabled once a color is added', async ({ page }) => {
    const removeAllBtn = page.getByTestId('remove-all-btn');
    await expect(removeAllBtn).toBeDisabled();

    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    await expect(removeAllBtn).toBeEnabled();
  });

  test('clicking with zero colors is a no-op (dialog does not open)', async ({ page }) => {
    // disabled button click is a no-op via real UI, but also guard the
    // handler itself directly.
    await page.evaluate(() => document.getElementById('removeAllBtn').click());
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('opens the ctConfirm dialog with the all-colors message and default focus on Yes, Esc cancels', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 });
    });
    await page.getByTestId('remove-all-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Remove all colors?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(2);
  });

  test('Enter confirms and empties the list, then Remove all is disabled again', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 });
    });
    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();
  });

  test('window.__colorPicker.removeAllColors() remains a direct, non-modal call', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 });
    });
    await page.evaluate(() => window.__colorPicker.removeAllColors());

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Pointer-gesture regression tests for two bugs found in review:
//
//    (a) A two-finger pinch's SECOND finger release, while Choose Color is
//        active, was wrongly treated as a plain single-pointer click and
//        sampled/added a stray color — because the "was this a mid-pinch
//        release?" check re-derived itself from state.pointer.active.size
//        AFTER the first finger had already been removed from the map, so
//        by the second finger's pointerup the map was back down to size 1.
//
//    (b) pointermove's pan branch never re-checked state.chooseColorActive
//        (only pointerdown did), so toggling Choose Color ON in the middle
//        of an already-started single-pointer drag let the pan continue,
//        and the drag's trailing pointerup also sampled — one gesture both
//        panning AND adding a stray color.
// ---------------------------------------------------------------------------
test.describe('pointer gesture regressions', () => {
  test('a two-finger pinch releasing sequentially while Choose Color is active adds no color', async ({ page }) => {
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(80, 90, 100, 1)';
      cx.fillRect(0, 0, 10, 10);
      return c.toDataURL('image/png');
    });
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);
    await page.getByTestId('choose-color-btn').click();

    const box = await page.getByTestId('canvas').boundingBox();
    const result = await page.evaluate(({ x, y, w, h }) => {
      const canvasEl = document.getElementById('canvas');
      const fire = (type, id, cx, cy) => {
        canvasEl.dispatchEvent(new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true,
          isPrimary: id === 1,
        }));
      };
      const ax = x + w / 2 - 20;
      const ay = y + h / 2;
      const bx = x + w / 2 + 20;
      const by = y + h / 2;

      fire('pointerdown', 1, ax, ay);
      fire('pointerdown', 2, bx, by);
      // Pinch inward a little.
      fire('pointermove', 1, ax + 5, ay);
      fire('pointermove', 2, bx - 5, by);
      // Release sequentially: first finger, then second finger. The second
      // finger's release is the exact case that reproduced the bug (the
      // active-pointer map is back to size 1 by then).
      fire('pointerup', 1, ax + 5, ay);
      const afterFirstRelease = window.__colorPicker.state.colors.length;
      fire('pointerup', 2, bx - 5, by);

      return {
        colorsAfterFirstRelease: afterFirstRelease,
        colorsAfterSecondRelease: window.__colorPicker.state.colors.length,
        activeSize: window.__colorPicker.state.pointer.active.size,
        hadPinch: window.__colorPicker.state.pointer.hadPinch,
      };
    }, { x: box.x, y: box.y, w: box.width, h: box.height });

    expect(result.colorsAfterFirstRelease).toBe(0);
    expect(result.colorsAfterSecondRelease).toBe(0);
    expect(result.activeSize).toBe(0);
    expect(result.hadPinch).toBe(false); // reset once the whole gesture fully lifts
  });

  test('toggling Choose Color mid-drag stops panning immediately and the trailing release adds no color', async ({
    page,
  }) => {
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(50, 60, 70, 1)';
      cx.fillRect(0, 0, 10, 10);
      return c.toDataURL('image/png');
    });
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);

    const box = await page.getByTestId('canvas').boundingBox();
    const cx0 = box.x + box.width / 2;
    const cy0 = box.y + box.height / 2;

    await page.mouse.move(cx0, cy0);
    await page.mouse.down();
    await page.mouse.move(cx0 + 20, cy0 + 10, { steps: 4 }); // real pan in progress, Choose Color still off

    const offsetAfterFirstMove = await page.evaluate(() => ({ ...window.__colorPicker.state.transform }));

    // Toggle Choose Color ON mid-drag without releasing the mouse button —
    // a programmatic click on the toolbar button, matching a real user
    // tapping it while a drag is still in progress elsewhere on the canvas.
    await page.evaluate(() => document.getElementById('chooseColorBtn').click());

    // This move would have panned further before the fix; it must not now.
    await page.mouse.move(cx0 + 60, cy0 + 40, { steps: 4 });
    const offsetAfterToggleMove = await page.evaluate(() => ({ ...window.__colorPicker.state.transform }));
    expect(offsetAfterToggleMove.offsetX).toBeCloseTo(offsetAfterFirstMove.offsetX, 5);
    expect(offsetAfterToggleMove.offsetY).toBeCloseTo(offsetAfterFirstMove.offsetY, 5);

    await page.mouse.up();

    const colorCount = await page.evaluate(() => window.__colorPicker.state.colors.length);
    expect(colorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. All data-testid hooks from PLAN.md § 10 are present.
// ---------------------------------------------------------------------------
test.describe('data-testid hooks present', () => {
  test('all top-level testids exist exactly once', async ({ page }) => {
    // The confirm dialog (tools/include/confirm.js, ctConfirm) is a pasted,
    // tool-agnostic component with no data-testids of its own — it's covered
    // separately via getByRole('dialog') in the "remove single row"/"remove
    // all" describe blocks above.
    const singleTestids = [
      'load-btn',
      'choose-color-btn',
      'reset-view-btn',
      'zoom-indicator',
      'stage',
      'canvas',
      'color-list',
      'remove-all-btn',
      'load-error',
      'outputs-section',
      'rgba-output-col',
      'rgba-output',
      'rgba-copy-all',
      'hex-output-col',
      'hex-output',
      'hex-copy-all',
    ];
    for (const id of singleTestids) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }
  });

  test('all per-row testids exist on an added row', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }));
    const row = page.getByTestId('color-row');
    await expect(row).toHaveCount(1);
    const rowTestids = [
      'color-swatch',
      'color-rgba-input',
      'color-rgba-copy',
      'color-hex-input',
      'color-hex-copy',
      'color-trash',
    ];
    for (const id of rowTestids) {
      await expect(row.getByTestId(id)).toHaveCount(1);
    }
  });

  test('window.__colorPicker exposes rgbaString, hexString, loadImageFromDataURL, sampleAt, addColor, state, rgbaOutput, hexOutput, removeColorById, removeAllColors', async ({
    page,
  }) => {
    const shape = await page.evaluate(() => ({
      rgbaString: typeof window.__colorPicker.rgbaString,
      hexString: typeof window.__colorPicker.hexString,
      loadImageFromDataURL: typeof window.__colorPicker.loadImageFromDataURL,
      sampleAt: typeof window.__colorPicker.sampleAt,
      addColor: typeof window.__colorPicker.addColor,
      state: typeof window.__colorPicker.state,
      rgbaOutput: typeof window.__colorPicker.rgbaOutput,
      hexOutput: typeof window.__colorPicker.hexOutput,
      removeColorById: typeof window.__colorPicker.removeColorById,
      removeAllColors: typeof window.__colorPicker.removeAllColors,
    }));
    expect(shape).toEqual({
      rgbaString: 'function',
      hexString: 'function',
      loadImageFromDataURL: 'function',
      sampleAt: 'function',
      addColor: 'function',
      state: 'object',
      rgbaOutput: 'function',
      hexOutput: 'function',
      removeColorById: 'function',
      removeAllColors: 'function',
    });
  });

  test('window.__colorPicker also exposes sampleAtCrosshair and isTouchCrosshairActive (touch feature hooks)', async ({
    page,
  }) => {
    const shape = await page.evaluate(() => ({
      sampleAtCrosshair: typeof window.__colorPicker.sampleAtCrosshair,
      isTouchCrosshairActive: typeof window.__colorPicker.isTouchCrosshairActive,
      touchState: typeof window.__colorPicker.state.touch,
    }));
    expect(shape).toEqual({
      sampleAtCrosshair: 'function',
      isTouchCrosshairActive: 'function',
      touchState: 'object',
    });
  });
});

// ---------------------------------------------------------------------------
// 10. Mobile (~375x667, dpr2, touch): the touch relative-drag crosshair
//     (DESIGN.md "Touch / mobile"), discoverability, and general responsive
//     layout. Real touch/pointer interactions only — dispatched PointerEvents
//     with pointerType 'touch' (matching the style already used above for
//     the pinch-regression tests) and Playwright's tap()/touchscreen, never
//     just the window.__colorPicker hooks, per the lesson baked into
//     tools/color-designer's sibling mobile suite: a passing hook-driven
//     assertion can still miss a real overlay/geometry problem.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch): touch relative-drag crosshair', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  // Dispatches a real PointerEvent with pointerType 'touch' at the given
  // viewport coordinates on the canvas, exactly like the existing pinch
  // regression tests above (section 8) do.
  async function firePointer(page, type, id, clientX, clientY) {
    await page.evaluate(
      ({ type, id, clientX, clientY }) => {
        document.getElementById('canvas').dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
            isPrimary: true,
          }),
        );
      },
      { type, id, clientX, clientY },
    );
  }

  async function loadSolidImage(page, r, g, b, a = 1) {
    const dataUrl = await page.evaluate(
      ({ r, g, b, a }) => {
        const c = document.createElement('canvas');
        c.width = 10;
        c.height = 10;
        const cx = c.getContext('2d');
        cx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        cx.fillRect(0, 0, 10, 10);
        return c.toDataURL('image/png');
      },
      { r, g, b, a },
    );
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);
  }

  test('enabling Choose Color on touch shows the crosshair dead-center of the canvas', async ({ page }) => {
    await loadSolidImage(page, 10, 20, 30);
    await page.getByTestId('choose-color-btn').tap();

    await expect(page.getByTestId('touch-crosshair')).toBeVisible();
    await expect(page.getByTestId('touch-hint')).toBeVisible();

    const box = await page.getByTestId('canvas').boundingBox();
    const crosshair = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    expect(crosshair.active).toBe(true);
    expect(crosshair.cx).toBeCloseTo(box.width / 2, 0);
    expect(crosshair.cy).toBeCloseTo(box.height / 2, 0);

    const isActive = await page.evaluate(() => window.__colorPicker.isTouchCrosshairActive());
    expect(isActive).toBe(true);
  });

  test('a relative drag moves the crosshair by the drag delta, not to the finger position, clamped at bounds', async ({
    page,
  }) => {
    await loadSolidImage(page, 40, 50, 60);
    await page.getByTestId('choose-color-btn').tap();

    const box = await page.getByTestId('canvas').boundingBox();
    const before = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));

    // Start far from the crosshair (bottom-right-ish) and drag UP/LEFT by a
    // known delta — the crosshair must move by that SAME delta from wherever
    // it already was (dead-center), not jump to the finger's position.
    const startX = box.x + box.width * 0.85;
    const startY = box.y + box.height * 0.85;
    const dx = -40;
    const dy = -50;

    await firePointer(page, 'pointerdown', 1, startX, startY);
    await firePointer(page, 'pointermove', 1, startX + dx, startY + dy);
    const afterMove = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    await firePointer(page, 'pointerup', 1, startX + dx, startY + dy);

    expect(afterMove.cx).toBeCloseTo(before.cx + dx, 0);
    expect(afterMove.cy).toBeCloseTo(before.cy + dy, 0);
    // Definitely not "jumped" to the (unrelated) finger position.
    expect(Math.abs(afterMove.cx - (startX + dx - box.x))).toBeGreaterThan(1);

    // Clamping: drag far enough in one direction that the crosshair would
    // go negative/out-of-bounds without clamping.
    await firePointer(page, 'pointerdown', 2, box.x + 20, box.y + 20);
    await firePointer(page, 'pointermove', 2, box.x + 20 - 5000, box.y + 20 - 5000);
    const clamped = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    await firePointer(page, 'pointerup', 2, box.x + 20 - 5000, box.y + 20 - 5000);

    expect(clamped.cx).toBe(0);
    expect(clamped.cy).toBe(0);
  });

  test('a tap samples the pixel under the crosshair (positioned via a prior drag); a drag does not sample', async ({
    page,
  }) => {
    // 8x8 image: background color A everywhere, one marker pixel of color B
    // at (6, 2) so a real position+tap has to land on the exact pixel.
    const bg = { r: 15, g: 15, b: 15 };
    const marker = { x: 6, y: 2, r: 210, g: 90, b: 5 };
    const dataUrl = await page.evaluate(
      ({ bg, marker }) => {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        const cx = c.getContext('2d');
        cx.fillStyle = `rgba(${bg.r}, ${bg.g}, ${bg.b}, 1)`;
        cx.fillRect(0, 0, 8, 8);
        cx.fillStyle = `rgba(${marker.r}, ${marker.g}, ${marker.b}, 1)`;
        cx.fillRect(marker.x, marker.y, 1, 1);
        return c.toDataURL('image/png');
      },
      { bg, marker },
    );
    await page.evaluate((url) => window.__colorPicker.loadImageFromDataURL(url), dataUrl);
    await page.getByTestId('choose-color-btn').tap();

    const box = await page.getByTestId('canvas').boundingBox();
    // Where the marker pixel's center currently sits on-screen (CSS-space,
    // canvas-local), via the live transform.
    const target = await page.evaluate((m) => {
      const tr = window.__colorPicker.state.transform;
      return { x: (m.x + 0.5) * tr.scale + tr.offsetX, y: (m.y + 0.5) * tr.scale + tr.offsetY };
    }, marker);

    const before = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    const dx = target.x - before.cx;
    const dy = target.y - before.cy;

    // Step 1: a real DRAG (well above the tap threshold) positions the
    // crosshair over the marker pixel. Above-threshold drags must NOT sample.
    await firePointer(page, 'pointerdown', 10, box.x + before.cx, box.y + before.cy);
    await firePointer(page, 'pointermove', 10, box.x + before.cx + dx, box.y + before.cy + dy);
    await firePointer(page, 'pointerup', 10, box.x + before.cx + dx, box.y + before.cy + dy);

    await expect(page.getByTestId('color-row')).toHaveCount(0);
    const positioned = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    expect(positioned.cx).toBeCloseTo(target.x, 0);
    expect(positioned.cy).toBeCloseTo(target.y, 0);

    // Step 2: a fresh, near-zero-movement TAP at the crosshair's current
    // position samples the pixel currently under it (the marker).
    const tapX = box.x + positioned.cx;
    const tapY = box.y + positioned.cy;
    await firePointer(page, 'pointerdown', 11, tapX, tapY);
    await firePointer(page, 'pointermove', 11, tapX + 1, tapY); // sub-threshold jitter
    await firePointer(page, 'pointerup', 11, tapX + 1, tapY);

    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('color-rgba-input').first()).toHaveValue(
      `rgba(${marker.r}, ${marker.g}, ${marker.b}, 1)`,
    );

    // Step 3: another real drag (above threshold) from here must NOT add a
    // second row, even though the crosshair ends up back near the marker.
    await firePointer(page, 'pointerdown', 12, tapX, tapY);
    await firePointer(page, 'pointermove', 12, tapX - 30, tapY - 30);
    await firePointer(page, 'pointermove', 12, tapX, tapY);
    await firePointer(page, 'pointerup', 12, tapX, tapY);
    await expect(page.getByTestId('color-row')).toHaveCount(1);
  });

  test('the crosshair persists at its position between samples (does not reset to center)', async ({ page }) => {
    await loadSolidImage(page, 5, 6, 7);
    await page.getByTestId('choose-color-btn').tap();

    const box = await page.getByTestId('canvas').boundingBox();
    const before = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));

    // Drag, then tap (samples once), then check the crosshair is still where
    // the drag left it, not back at dead-center.
    await firePointer(page, 'pointerdown', 20, box.x + before.cx, box.y + before.cy);
    await firePointer(page, 'pointermove', 20, box.x + before.cx - 25, box.y + before.cy + 15);
    await firePointer(page, 'pointerup', 20, box.x + before.cx - 25, box.y + before.cy + 15);
    const afterDrag = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));

    await firePointer(page, 'pointerdown', 21, box.x + afterDrag.cx, box.y + afterDrag.cy);
    await firePointer(page, 'pointerup', 21, box.x + afterDrag.cx, box.y + afterDrag.cy);
    await expect(page.getByTestId('color-row')).toHaveCount(1);

    const afterTap = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    expect(afterTap.cx).toBeCloseTo(afterDrag.cx, 0);
    expect(afterTap.cy).toBeCloseTo(afterDrag.cy, 0);
  });

  test('two-finger pinch still zooms while Choose Color is active on touch', async ({ page }) => {
    await loadSolidImage(page, 1, 2, 3);
    await page.getByTestId('choose-color-btn').tap();

    const box = await page.getByTestId('canvas').boundingBox();
    const scaleBefore = await page.evaluate(() => window.__colorPicker.state.transform.scale);

    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    await firePointer(page, 'pointerdown', 30, midX - 20, midY);
    await firePointer(page, 'pointerdown', 31, midX + 20, midY);
    await firePointer(page, 'pointermove', 30, midX - 60, midY);
    await firePointer(page, 'pointermove', 31, midX + 60, midY);
    const scaleDuring = await page.evaluate(() => window.__colorPicker.state.transform.scale);
    await firePointer(page, 'pointerup', 30, midX - 60, midY);
    await firePointer(page, 'pointerup', 31, midX + 60, midY);

    expect(scaleDuring).toBeGreaterThan(scaleBefore);
    // The pinch must not have sampled a stray color.
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });

  test('prefers-reduced-motion: crosshair still present and functional without depending on the pulse animation', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadSolidImage(page, 77, 88, 99);
    await page.getByTestId('choose-color-btn').tap();

    await expect(page.getByTestId('touch-crosshair')).toBeVisible();
    await expect(page.getByTestId('touch-hint')).toBeVisible();

    const box = await page.getByTestId('canvas').boundingBox();
    const before = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));

    // A drag above threshold still repositions (no dependency on the pulse
    // animation actually playing — just that the crosshair keeps working).
    await firePointer(page, 'pointerdown', 40, box.x + before.cx, box.y + before.cy);
    await firePointer(page, 'pointermove', 40, box.x + before.cx + 30, box.y + before.cy - 10);
    await firePointer(page, 'pointerup', 40, box.x + before.cx + 30, box.y + before.cy - 10);
    const afterDrag = await page.evaluate(() => ({ ...window.__colorPicker.state.touch }));
    expect(afterDrag.cx).toBeCloseTo(before.cx + 30, 0);
    expect(afterDrag.cy).toBeCloseTo(before.cy - 10, 0);

    // A subsequent tap still samples.
    await firePointer(page, 'pointerdown', 41, box.x + afterDrag.cx, box.y + afterDrag.cy);
    await firePointer(page, 'pointerup', 41, box.x + afterDrag.cx, box.y + afterDrag.cy);
    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('color-rgba-input').first()).toHaveValue('rgba(77, 88, 99, 1)');

    // The animation is disabled at the CSS level under reduced motion.
    const animName = await page.getByTestId('touch-crosshair').evaluate((el) => {
      el.classList.add('pulse');
      const name = getComputedStyle(el).animationName;
      el.classList.remove('pulse');
      return name;
    });
    expect(animName).toBe('none');
  });

  // Adversarial-review finding (MINOR): on a ~375px mobile viewport, the
  // touch-mode loupe — offset up ~120+22px from the dead-center crosshair —
  // used to overlap and hide the "Drag to aim, tap to pick" hint pill
  // (previously anchored at top: 8px, right inside the loupe's swept area).
  // Fixed by anchoring `.touch-hint` at the bottom of the stage instead
  // (bottom: 52px, clear of the one-time touch-toast pill also anchored at
  // bottom: 8px). Verified here by measuring both pills' rendered rects on
  // first touch activation and asserting they don't overlap each other.
  test('the loupe does not cover the "Drag to aim" hint pill on first touch activation', async ({ page }) => {
    await loadSolidImage(page, 5, 6, 7);
    await page.getByTestId('choose-color-btn').tap();

    await expect(page.getByTestId('touch-hint')).toBeVisible();
    const loupeHidden = await page.evaluate(() => document.getElementById('loupe').hidden);
    expect(loupeHidden).toBe(false); // loupe visible over the loaded image

    const hintBox = await page.getByTestId('touch-hint').boundingBox();
    const loupeBox = await page.locator('#loupe').boundingBox();
    expect(hintBox).not.toBeNull();
    expect(loupeBox).not.toBeNull();

    const noOverlap = hintBox.y >= loupeBox.y + loupeBox.height
      || hintBox.y + hintBox.height <= loupeBox.y
      || hintBox.x >= loupeBox.x + loupeBox.width
      || hintBox.x + hintBox.width <= loupeBox.x;
    expect(noOverlap).toBe(true);

    // Also doesn't collide with the one-time touch-toast pill, which is
    // visible simultaneously on a fresh (no localStorage) first activation.
    const toastVisible = await page.getByTestId('touch-toast').isVisible();
    if (toastVisible) {
      const toastBox = await page.getByTestId('touch-toast').boundingBox();
      const hintVsToastNoOverlap = hintBox.y >= toastBox.y + toastBox.height
        || hintBox.y + hintBox.height <= toastBox.y;
      expect(hintVsToastNoOverlap).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Mobile responsiveness audit (~360-375px): no horizontal page overflow,
//     ~44px tap targets, overlay hit-test guard on the primary toolbar
//     buttons (the lesson from tools/color-designer's sibling suite: prove
//     tappability, don't rely on hooks).
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch): general responsiveness', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  test('no horizontal page overflow at 375px with sampled colors and outputs populated', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 250, g: 10, b: 200, a: 0.4 });
      window.__colorPicker.addColor({ r: 90, g: 90, b: 90, a: 1 });
    });
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('no horizontal overflow down to ~360px width, Choose Color active', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 0.7 });
    });
    await page.getByTestId('choose-color-btn').tap();

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('primary toolbar buttons and a color-row trash button have >=44px tap targets', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 9, g: 9, b: 9, a: 1 }));

    for (const testid of ['load-btn', 'choose-color-btn', 'reset-view-btn']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const trashBox = await page.getByTestId('color-trash').boundingBox();
    expect(trashBox.width).toBeGreaterThanOrEqual(44);
    expect(trashBox.height).toBeGreaterThanOrEqual(44);
  });

  // Lower-level hit-test guard: prove nothing overlays the primary controls
  // at mobile size, rather than trusting a hook/handler assertion alone.
  test('no overlay intercepts hit-testing on Load image, Choose Color, or Reset view', async ({ page }) => {
    async function isHitByOwnControl(locator) {
      const box = await locator.boundingBox();
      return locator.evaluate(
        (el, { x, y, w, h }) => {
          const hit = document.elementFromPoint(x + w / 2, y + h / 2);
          return !!hit && (hit === el || el.contains(hit));
        },
        { x: box.x, y: box.y, w: box.width, h: box.height },
      );
    }

    expect(await isHitByOwnControl(page.getByTestId('load-btn'))).toBe(true);
    expect(await isHitByOwnControl(page.getByTestId('choose-color-btn'))).toBe(true);
    expect(await isHitByOwnControl(page.getByTestId('reset-view-btn'))).toBe(true);
  });

  test('color-list rows and derived output textareas stack/read well at 360px (no clipping, readable widths)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 12, g: 200, b: 40, a: 1 });
    });

    const row = page.getByTestId('color-row').first();
    const rowBox = await row.boundingBox();
    const appWidth = await page.evaluate(() => document.querySelector('.app').getBoundingClientRect().width);
    expect(rowBox.width).toBeLessThanOrEqual(appWidth + 1);

    // Outputs section stacks vertically (column) under the 700px breakpoint.
    const flexDirection = await page.getByTestId('outputs-section').evaluate((el) => getComputedStyle(el).flexDirection);
    expect(flexDirection).toBe('column');

    const rgbaOutputBox = await page.getByTestId('rgba-output').boundingBox();
    expect(rgbaOutputBox.width).toBeLessThanOrEqual(appWidth + 1);
  });

  test('per-row remove via the shared ctConfirm dialog works at mobile size: dialog opens, Enter confirms', async ({
    page,
  }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 3, g: 6, b: 9, a: 1 }));
    await page.getByTestId('color-trash').tap();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
  });

  test('the footer renders at the bottom of the page and does not cause horizontal overflow at 375px', async ({
    page,
  }) => {
    const footer = page.locator('.ct-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('github.com/codercowboy/claude-tools');

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });
});

// ---------------------------------------------------------------------------
// 12. Icon-only buttons carry a non-empty `title` (hover tooltip) alongside
//     their `aria-label`, per docs/conventions.md "Accessibility baseline" —
//     the specific bug Jason reported (copy buttons showed no tooltip).
// ---------------------------------------------------------------------------
test.describe('icon-only buttons have hover tooltips (title attribute)', () => {
  test('per-row rgba-copy, hex-copy, and trash buttons all have a non-empty title', async ({ page }) => {
    await page.evaluate(() => window.__colorPicker.addColor({ r: 5, g: 10, b: 15, a: 1 }));
    const row = page.getByTestId('color-row').first();

    for (const testid of ['color-rgba-copy', 'color-hex-copy', 'color-trash']) {
      const title = await row.getByTestId(testid).getAttribute('title');
      expect(title).toBeTruthy();
    }
  });

  test('the two Copy-all buttons have a non-empty title', async ({ page }) => {
    for (const testid of ['rgba-copy-all', 'hex-copy-all']) {
      const title = await page.getByTestId(testid).getAttribute('title');
      expect(title).toBeTruthy();
    }
  });

  test('the touch-toast dismiss (x) button has a non-empty title', async ({ page }) => {
    const title = await page.getByTestId('touch-toast-dismiss').getAttribute('title');
    expect(title).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 13. Shared footer (tools/include/footer.html, pasted verbatim) renders at
//     the bottom of the page on desktop too, and doesn't disturb the app
//     layout now that it's a second child of <body> (a sibling tool's layout
//     broke this way when <body> itself was a flex container with only one
//     child expected — color-picker's flex container is the inner `.app`
//     div, not <body>, so this guards against a future regression).
// ---------------------------------------------------------------------------
test.describe('shared footer', () => {
  test('renders once at the bottom of the page, links to the repo, and does not break desktop layout', async ({ page }) => {
    const footer = page.locator('.ct-footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).toBeVisible();
    const link = footer.locator('.ct-footer__repo');
    await expect(link).toHaveAttribute('href', 'https://github.com/codercowboy/claude-tools');

    // body is not a flex container in this tool (only the inner .app div
    // is), so the footer being a second child of <body> must not squeeze or
    // reposition anything.
    const bodyDisplay = await page.evaluate(() => getComputedStyle(document.body).display);
    expect(bodyDisplay).not.toBe('flex');

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);

    // The toolbar's primary buttons are still on-screen and hit-testable
    // (nothing pushed off-screen by the footer's presence).
    const loadBtnBox = await page.getByTestId('load-btn').boundingBox();
    expect(loadBtnBox).not.toBeNull();
    expect(loadBtnBox.x).toBeGreaterThanOrEqual(0);
    expect(loadBtnBox.y).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 14. localStorage UI-state persistence (color-picker:v1) — docs/
//     conventions.md "Persist UI state (localStorage)". Only the collected
//     color list is persisted, keyed newest-first, independent of the
//     loaded image (which is never persisted); the two derived rgba/hex
//     textareas are recomputed on restore, never stored themselves. The
//     tool must degrade silently and stay fully usable when localStorage
//     throws on every call.
// ---------------------------------------------------------------------------
test.describe('localStorage persistence (color-picker:v1)', () => {
  const STORAGE_KEY = 'color-picker:v1';

  test('sampling colors writes the versioned key with the collected color list, newest first', async ({ page }) => {
    // Sample via a real deterministic image load + click, then also add via
    // the test hook, covering both paths that mutate state.colors.
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgb(200, 100, 50)';
      cx.fillRect(0, 0, 2, 2);
      await window.__colorPicker.loadImageFromDataURL(c.toDataURL('image/png'));
    });
    await page.getByTestId('choose-color-btn').click();
    const canvas = page.getByTestId('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('color-row')).toHaveCount(1);

    await page.evaluate(() => window.__colorPicker.addColor({ r: 10, g: 20, b: 30, a: 0.5 }));
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(raw, 'versioned key was written').toBeTruthy();
    const parsed = JSON.parse(raw);
    // Only the color list is stored -- no image bytes, no derived output.
    expect(Object.keys(parsed).sort()).toEqual(['colors']);
    expect(parsed.colors).toHaveLength(2);
    // newest-first: the addColor() call (second) is at index 0.
    expect(parsed.colors[0]).toMatchObject({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parsed.colors[1]).toMatchObject({ r: 200, g: 100, b: 50, a: 1 });
  });

  test('reload with no image loaded restores the color list and re-derives the rgba/hex textareas', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 255, g: 0, b: 0, a: 1 });
      window.__colorPicker.addColor({ r: 0, g: 255, b: 0, a: 0.5 });
    });
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    await page.reload();

    // No image is restored/loaded -- the empty-state prompt still shows,
    // proving the color list restores standalone, independent of the image.
    await expect(page.locator('#stage')).not.toHaveClass(/has-image/);
    await expect(page.getByTestId('load-error')).toBeHidden();

    const rows = page.getByTestId('color-row');
    await expect(rows).toHaveCount(2);
    // newest-first order preserved across reload.
    await expect(rows.nth(0).getByTestId('color-rgba-input')).toHaveValue('rgba(0, 255, 0, 0.5)');
    await expect(rows.nth(0).getByTestId('color-hex-input')).toHaveValue('#00ff0080');
    await expect(rows.nth(1).getByTestId('color-rgba-input')).toHaveValue('rgba(255, 0, 0, 1)');
    await expect(rows.nth(1).getByTestId('color-hex-input')).toHaveValue('#ff0000');

    // Derived textareas are RE-DERIVED from the restored list (never stored
    // themselves), same order, line-aligned with the rows above.
    await expect(page.getByTestId('rgba-output')).toHaveValue('rgba(0, 255, 0, 0.5)\nrgba(255, 0, 0, 1)');
    await expect(page.getByTestId('hex-output')).toHaveValue('#00ff0080\n#ff0000');
    await expect(page.getByTestId('remove-all-btn')).toBeEnabled();
    await expect(page.getByTestId('rgba-copy-all')).toBeEnabled();
    await expect(page.getByTestId('hex-copy-all')).toBeEnabled();
  });

  test('remove-all clears the on-screen list and updates the stored state to empty, surviving reload', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
      window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 });
    });
    await expect(page.getByTestId('color-row')).toHaveCount(2);

    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Enter'); // "Yes" is the default

    await expect(page.getByTestId('color-row')).toHaveCount(0);

    const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(raw)).toEqual({ colors: [] });

    // Confirms the empty state was actually persisted, not just in-memory.
    await page.reload();
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();
    await expect(page.getByTestId('rgba-output')).toHaveValue('');
    await expect(page.getByTestId('hex-output')).toHaveValue('');
  });

  test('per-row remove also updates the stored state', async ({ page }) => {
    const { firstId, secondId } = await page.evaluate(() => ({
      firstId: window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 }).id,
      secondId: window.__colorPicker.addColor({ r: 4, g: 5, b: 6, a: 1 }).id,
    }));
    await page.evaluate((id) => window.__colorPicker.removeColorById(id), firstId);

    const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    const parsed = JSON.parse(raw);
    expect(parsed.colors).toHaveLength(1);
    expect(parsed.colors[0]).toMatchObject({ id: secondId, r: 4, g: 5, b: 6, a: 1 });
  });

  test('tool works fully when localStorage throws on every read/write (no crash, starts empty)', async ({ page }) => {
    await page.addInitScript(() => {
      const throwing = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          return {
            getItem: throwing,
            setItem: throwing,
            removeItem: throwing,
            clear: throwing,
            key: throwing,
            get length() { return 0; },
          };
        },
      });
    });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.reload();

    // Starts empty, same as a normal fresh load.
    await expect(page.getByTestId('color-row')).toHaveCount(0);
    await expect(page.getByTestId('remove-all-btn')).toBeDisabled();
    await expect(page.getByTestId('rgba-output')).toHaveValue('');
    await expect(page.getByTestId('hex-output')).toHaveValue('');

    // The tool still works end-to-end: adding, and the confirm-and-remove
    // flow (each mutation calls saveState(), which must degrade silently).
    await page.evaluate(() => window.__colorPicker.addColor({ r: 9, g: 9, b: 9, a: 1 }));
    await expect(page.getByTestId('color-row')).toHaveCount(1);
    await expect(page.getByTestId('remove-all-btn')).toBeEnabled();

    await page.getByTestId('remove-all-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('color-row')).toHaveCount(0);

    expect(pageErrors, `no uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// First-load Help popup (docs/conventions.md § "First-load help popup (all
// tools)"). Reference pattern: tools/hat-picker / tools/color-designer.
// Auto-shows once on a genuinely fresh visit (own browser.newContext() — the
// shared beforeEach above pre-seeds the "seen" flag for every other test in
// this file so the modal doesn't interfere with unrelated assertions);
// otherwise reachable only via the ? button. Accessible modal: role=dialog,
// aria-modal, initial focus on the ✕, Esc/backdrop/✕ all dismiss + return
// focus, a focus trap keeps Tab inside, and the overlay is display:none when
// closed.
// ---------------------------------------------------------------------------
test.describe('Help modal: first-load auto-show', () => {
  test('auto-shows on a genuine first visit (fresh context, no pre-seeded flag)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await page.waitForFunction(() => window.__colorPicker);

    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();
    const modal = page.getByTestId('help-modal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'help-title');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    // Marked seen immediately (not just on close) — see index.html's init.
    const seen = await page.evaluate((key) => localStorage.getItem(key), HELP_SEEN_KEY);
    expect(seen).toBe('1');

    await context.close();
  });

  test('does not auto-show again on a later visit in the same (now-seen) context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await page.waitForFunction(() => window.__colorPicker);
    await expect(page.getByTestId('help-overlay')).toBeVisible(); // first visit: auto-shows

    await page.reload();
    await page.waitForFunction(() => window.__colorPicker);
    await expect(page.getByTestId('help-overlay')).toBeHidden(); // second visit: does not

    await context.close();
  });

  test('does not auto-show when the seen flag is pre-seeded (the shared beforeEach context)', async ({ page }) => {
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });
});

test.describe('Help modal: open/close behavior + focus handling', () => {
  test('opens via the ? button, and the overlay is display:none while closed', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');

    await page.getByTestId('help-button').click();

    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
    await expect(page.getByTestId('help-modal')).toContainText('How Color Picker works');
  });

  test('opens scrolled to the top even though initial focus lands on the ✕', async ({ page }) => {
    // Force the dialog to be scrollable by shrinking the viewport, then confirm
    // the fix keeps scrollTop at 0 despite focus moving to the ✕ at the top.
    await page.setViewportSize({ width: 400, height: 300 });
    await page.getByTestId('help-button').click();

    const dialog = page.getByTestId('help-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('Esc closes the modal and returns focus to the ? button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('backdrop click closes the modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    // Click the overlay itself, well outside the centered dialog box.
    await overlay.click({ position: { x: 5, y: 5 } });

    await expect(overlay).toBeHidden();
  });

  // docs/conventions.md "Every content modal has a close ✕ in its top-right
  // corner" — the pinned ✕ is the dialog's sole dedicated close trigger,
  // alongside Esc and backdrop click.
  test('a pinned ✕ close button sits in the dialog\'s top-right corner and closes the modal, returning focus to the ? button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await expect(overlay).toBeVisible();

    const closeXBtn = dialog.getByTestId('modal-close-x');
    await expect(closeXBtn).toBeVisible();
    await expect(closeXBtn).toHaveAttribute('aria-label', 'Close');

    await closeXBtn.click();

    await expect(overlay).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('focus is trapped inside the dialog while open (Tab wraps around)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const dialog = page.getByTestId('help-modal');
    const closeXBtn = dialog.getByTestId('modal-close-x');
    await expect(closeXBtn).toBeFocused();

    // The pinned ✕ is the dialog's only focusable element now that the
    // bottom Close button is gone, so Tab/Shift+Tab both just keep focus on
    // it — proof the trap doesn't let focus escape to the page behind the
    // overlay (e.g. the ? button or the Load image button).
    await page.keyboard.press('Tab');
    await expect(closeXBtn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeXBtn).toBeFocused();

    const activeIsOutsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="help-modal"]');
      return !dialog.contains(document.activeElement);
    });
    expect(activeIsOutsideDialog).toBe(false);
  });
});

test.describe('Help modal + Help button: touch-action manipulation (mobile double-tap-to-zoom guard)', () => {
  test('the ? button and the dialog ✕ both have touch-action: manipulation', async ({ page }) => {
    const helpButtonTouchAction = await page.getByTestId('help-button').evaluate((el) => getComputedStyle(el).touchAction);
    expect(helpButtonTouchAction).toBe('manipulation');

    await page.getByTestId('help-button').click();
    const closeXTouchAction = await page.getByTestId('modal-close-x').evaluate((el) => getComputedStyle(el).touchAction);
    expect(closeXTouchAction).toBe('manipulation');
  });

  test('the generic button touch-action rule also covers an ordinary control (Load image)', async ({ page }) => {
    const touchAction = await page.getByTestId('load-btn').evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  // This tool's canvas relies on touch gestures (pan / pinch-zoom / drag to
  // aim the loupe) captured via its own touch-action: none — the
  // double-tap-zoom convention applies only to the OTHER tappable UI
  // (buttons), not this drag surface. Confirms the Help feature did not
  // touch the canvas's existing gesture handling.
  test('the image canvas keeps its own touch-action: none, untouched by the button rule', async ({ page }) => {
    const touchAction = await page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 12. Shared tools/include/base.css, pasted into this tool's <style>.
// ---------------------------------------------------------------------------
test.describe('shared base.css include', () => {
  test('the document root has touch-action: manipulation', async ({ page }) => {
    const touchAction = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  test('[hidden] elements are actually hidden (e.g. the load-error status paragraph)', async ({ page }) => {
    const loadError = page.getByTestId('load-error');
    await expect(loadError).toBeHidden();
    const display = await loadError.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('.visually-hidden is present on the hidden file input (clipped, not display:none)', async ({ page }) => {
    const fileInput = page.locator('#fileInput');
    const style = await fileInput.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, width: cs.width, display: cs.display };
    });
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.display).not.toBe('none');
  });

  // This tool has no <select> elements, so no select-appearance assertion here
  // (see tools/color-designer's suite for that coverage).
});

// ---------------------------------------------------------------------------
// 13. Color-row one-line layout at phone width (Fix B): swatch + rgba field +
//     hex field + trash all sit on one row instead of wrapping.
// ---------------------------------------------------------------------------
test.describe('color-row one-line layout at phone width', () => {
  test.use({ viewport: { width: 380, height: 740 } });

  // The row's children have different heights (the 20px swatch, the 44px
  // .ct-field boxes, the 44px trash button) and are align-items: center, so
  // their *tops* legitimately differ on one shared line — the useful signal
  // that the row hasn't wrapped is that all four children share the same
  // vertical center, and each child's left edge is at/after the previous
  // child's right edge (left-to-right on one line, not stacked).
  async function rowChildGeometry(row) {
    return row.evaluate((el) => {
      const kids = [
        el.querySelector('[data-testid="color-swatch"]'),
        el.querySelector('[data-testid="color-rgba-input"]').closest('.ct-field'),
        el.querySelector('[data-testid="color-hex-input"]').closest('.ct-field'),
        el.querySelector('[data-testid="color-trash"]'),
      ];
      return kids.map((k) => {
        const r = k.getBoundingClientRect();
        return { left: r.left, right: r.right, centerY: r.top + r.height / 2 };
      });
    });
  }

  test('swatch, rgba field, hex field, and trash share one line at 380px, no page overflow', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 250, g: 10, b: 200, a: 0.4 });
    });

    const row = page.getByTestId('color-row').first();
    const [swatch, rgbaField, hexField, trash] = await rowChildGeometry(row);

    for (const kid of [rgbaField, hexField, trash]) {
      expect(Math.abs(kid.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    }
    // Left-to-right order on the same line, not stacked underneath each other.
    expect(rgbaField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(hexField.left).toBeGreaterThanOrEqual(rgbaField.right);
    expect(trash.left).toBeGreaterThanOrEqual(hexField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('at 360px width, a color row still does not wrap onto multiple lines', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      window.__colorPicker.addColor({ r: 1, g: 2, b: 3, a: 1 });
    });

    const row = page.getByTestId('color-row').first();
    const [swatch, rgbaField, hexField, trash] = await rowChildGeometry(row);

    for (const kid of [rgbaField, hexField, trash]) {
      expect(Math.abs(kid.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    }
    expect(rgbaField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(hexField.left).toBeGreaterThanOrEqual(rgbaField.right);
    expect(trash.left).toBeGreaterThanOrEqual(hexField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });
});

// ---------------------------------------------------------------------------
// Shared License modal (src/tools/include/license.js, inlined via the shared
// footer.html). The footer "MIT License" link opens an accessible modal
// (role=dialog, focus trap, ✕/Esc/backdrop close, focus return). color-picker
// bundles no third-party libraries, so the modal shows the "100% vanilla"
// note rather than a dependency list.
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
