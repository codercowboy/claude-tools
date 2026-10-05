// @playwright/test spec for tools/hat-picker/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec
// drives the finished page from the outside via data-testid hooks and the
// window.__hatPicker test API described in DESIGN.md / PLAN.md.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/hat-picker/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertModalA11y, assertHelpAutoShows } from '../../../lib/test-support/interaction.mjs';
import { expectNoOverflow, setViewport } from '../../../lib/test-support/layout.mjs';
import { stubClipboard, readClipboard, expectCopyFlash } from '../../../lib/test-support/clipboard.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('hat-picker');

// Pre-seed the Help modal's "seen" flag before every test's navigation, via
// addInitScript (runs before index.html's own scripts on every navigation in
// this page/context). This repo's convention (docs/conventions.md "First-load
// help popup") has the Help modal auto-show once on a genuinely fresh visit —
// without this, every single test below would hit that auto-shown modal on
// load and have to deal with it. The dedicated "Help dialog" describe block
// further down opens its own fresh browser contexts (bypassing this seeded
// `page` fixture) specifically to exercise the real first-visit behavior.
test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. Add entries: type + Enter, char counter, blank/whitespace rejection,
//    80-char cap.
// ---------------------------------------------------------------------------
test.describe('add entries', () => {
  test('typing text + Enter adds a row and updates the counter', async ({ page }) => {
    const input = page.getByTestId('entry-input');
    await input.fill('Charades');
    await expect(page.getByTestId('char-counter')).toHaveText('8 / 80');
    await input.press('Enter');

    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-count')).toHaveText('1 in the hat');
    // Input clears and counter resets after a successful add.
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('char-counter')).toHaveText('0 / 80');
  });

  // Repo convention (docs/conventions.md "Responsive & mobile"): a successful
  // Add blurs the input instead of refocusing it, so tapping Add on a mobile
  // device dismisses the on-screen keyboard (the keyboard follows DOM focus;
  // there's no dedicated dismiss API). A REJECTED add must NOT blur.
  test('a successful add blurs the input (dismisses the mobile keyboard); a rejected add keeps focus', async ({
    page,
  }) => {
    const input = page.getByTestId('entry-input');
    await input.fill('Charades');
    await expect(input).toBeFocused();
    await input.press('Enter');

    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(input).not.toBeFocused();

    // Rejected add (blank) keeps focus so the user can immediately fix it.
    await input.focus();
    await input.fill('   ');
    await input.press('Enter');
    await expect(input).toBeFocused();

    // Rejected add (duplicate) also keeps focus.
    await input.fill('Charades');
    await input.press('Enter');
    await expect(input).toBeFocused();
  });

  test('blank/whitespace-only input is rejected', async ({ page }) => {
    const input = page.getByTestId('entry-input');
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.getByTestId('entry-row')).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('80-char cap holds even when the JS guard is hit directly (paste-bypass defense)', async ({ page }) => {
    const longText = 'A'.repeat(120);
    const added = await page.evaluate((t) => window.__hatPicker.addEntry(t), longText);
    expect(added).toBe(true);
    const entries = await page.evaluate(() => window.__hatPicker.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toHaveLength(80);
    expect(entries[0].text).toBe('A'.repeat(80));
  });

  test('input maxlength attribute is 80', async ({ page }) => {
    await expect(page.getByTestId('entry-input')).toHaveAttribute('maxlength', '80');
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate handling, per-row remove, empty state.
// ---------------------------------------------------------------------------
test.describe('duplicates, remove, empty state', () => {
  test('exact duplicate is rejected (no add, no throw)', async ({ page }) => {
    await page.evaluate(() => window.__hatPicker.addEntry('Charades'));
    const secondAddResult = await page.evaluate(() => window.__hatPicker.addEntry('Charades'));
    expect(secondAddResult).toBe(false);
    const entries = await page.evaluate(() => window.__hatPicker.entries);
    expect(entries).toHaveLength(1);
  });

  test('per-row remove (x) opens the shared confirmDialog dialog; Enter confirms and updates the count', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    await page.getByRole('button', { name: 'Remove Charades' }).click();
    // Clicking x does NOT remove immediately — it opens the shared confirmDialog
    // dialog (CtConfirm.mjs), which serves both per-row remove
    // and Clear all.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-count')).toHaveText('1 in the hat');
    const entries = await page.evaluate(() => window.__hatPicker.entries);
    expect(entries.map((e) => e.text)).toEqual(['Pictionary']);
  });

  test('empty state shows with zero entries and hides once an entry is added, and stays hidden until a confirmed remove empties the list', async ({
    page,
  }) => {
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.evaluate(() => window.__hatPicker.addEntry('Charades'));
    await expect(page.getByTestId('empty-state')).toBeHidden();

    await page.getByRole('button', { name: 'Remove Charades' }).click();
    await page.keyboard.press('Enter'); // confirm the removal
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2b. Per-entry remove (x) via the shared confirmDialog dialog (tools/include/
//     CtConfirm.mjs): full Enter/Esc/backdrop coverage, mirroring its shared
//     behavior with Clear all. The dialog has no data-testids of its own —
//     it's a pasted, tool-agnostic component — so tests drive it via
//     getByRole('dialog') and the "Yes"/"Cancel" button names.
// ---------------------------------------------------------------------------
test.describe('per-entry remove via confirmDialog', () => {
  test('opens with the row-specific message and default focus on Yes', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.getByRole('button', { name: 'Remove Charades' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Remove this entry?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();
  });

  test('Esc cancels and leaves the entry in place', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.getByRole('button', { name: 'Remove Charades' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).toEqual(['Charades', 'Pictionary']);
  });

  test('Enter confirms and removes exactly the targeted entry, not others', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });
    await page.getByRole('button', { name: 'Remove Pictionary' }).click();
    await page.keyboard.press('Enter');

    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).toEqual(['Charades', 'Codenames']);
  });

  test('Cancel button cancels; backdrop click cancels; clicking inside the dialog does not', async ({ page }) => {
    await page.evaluate(() => window.__hatPicker.addEntry('Charades'));
    await page.evaluate(() => window.__hatPicker.addEntry('Pictionary'));
    await page.getByRole('button', { name: 'Remove Charades' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click inside the dialog (on the message text) — must NOT close it.
    await page.locator('.ctc-message').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancel button cancels.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    // Reopen; click the backdrop itself, outside the dialog box.
    await page.getByRole('button', { name: 'Remove Charades' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.ctc-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  test('window.__hatPicker.removeEntry(id) remains a direct, non-modal call', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    const idToRemove = (await page.evaluate(() => window.__hatPicker.entries))[0].id;
    await page.evaluate((id) => window.__hatPicker.removeEntry(id), idToRemove);

    await expect(page.getByRole('dialog')).toBeHidden();
    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).toEqual(['Pictionary']);
  });
});

// ---------------------------------------------------------------------------
// 3. Pull button disabled/enabled based on entry count.
// ---------------------------------------------------------------------------
test.describe('pull button enabled state', () => {
  test('disabled with < 2 entries, enabled with >= 2', async ({ page }) => {
    const pullButton = page.getByTestId('pull-button');
    await expect(pullButton).toBeDisabled();

    await page.evaluate(() => window.__hatPicker.addEntry('Solo Entry'));
    await expect(pullButton).toBeDisabled();

    await page.evaluate(() => window.__hatPicker.addEntry('Second Entry'));
    await expect(pullButton).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 4. Deterministic draw via forceIndex; aria-live announce matches reveal.
// ---------------------------------------------------------------------------
test.describe('deterministic draw', () => {
  test('draw({instant:true, forceIndex}) reveals entries[forceIndex] and announces it', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
      window.__hatPicker.addEntry('Trivia Night');
    });

    const result = await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 2 });
      return {
        expected: window.__hatPicker.entries[2].text,
        reveal: document.querySelector('[data-testid="winner-reveal"]').textContent,
        announce: document.querySelector('[data-testid="winner-announce"]').textContent,
        drawState: window.__hatPicker.drawState,
      };
    });

    expect(result.expected).toBe('Codenames');
    expect(result.reveal).toBe('Codenames');
    expect(result.announce).toBe('Codenames');
    expect(result.drawState.phase).toBe('revealed');
    expect(result.drawState.winnerText).toBe('Codenames');
  });

  test('out-of-range forceIndex is a forgiving no-op', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('A');
      window.__hatPicker.addEntry('B');
    });
    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 99 });
    });
    const drawState = await page.evaluate(() => window.__hatPicker.drawState);
    expect(drawState.phase).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// 5. pickIndex(count, rng) purity and unbiased range.
// ---------------------------------------------------------------------------
test.describe('pickIndex purity', () => {
  test('is a pure function of (count, rng)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const pickIndex = window.__hatPicker.pickIndex;
      return {
        half: pickIndex(10, () => 0.5), // floor(0.5*10) = 5
        justUnderOne: pickIndex(4, () => 0.9999999), // floor(3.999...) = 3
        zero: pickIndex(4, () => 0), // 0
        repeat1: pickIndex(7, () => 0.42857),
        repeat2: pickIndex(7, () => 0.42857),
      };
    });
    expect(r.half).toBe(5);
    expect(r.justUnderOne).toBe(3);
    expect(r.zero).toBe(0);
    expect(r.repeat1).toBe(r.repeat2); // same rng sequence -> same output

    const threw = await page.evaluate(() => {
      try {
        window.__hatPicker.pickIndex(0, () => 0.5);
        return false;
      } catch (e) {
        return e instanceof RangeError;
      }
    });
    expect(threw).toBe(true);
  });

  test('with the real (default) rng, indices stay within [0, count) over many calls', async ({ page }) => {
    const { outOfRange, sawAllBuckets } = await page.evaluate(() => {
      const pickIndex = window.__hatPicker.pickIndex;
      const defaultRng = window.__hatPicker.defaultRng;
      const COUNT = 6;
      const seen = new Set();
      let outOfRange = 0;
      for (let i = 0; i < 3000; i++) {
        const idx = pickIndex(COUNT, defaultRng);
        if (!Number.isInteger(idx) || idx < 0 || idx >= COUNT) outOfRange++;
        seen.add(idx);
      }
      return { outOfRange, sawAllBuckets: seen.size === COUNT };
    });
    expect(outOfRange).toBe(0);
    expect(sawAllBuckets).toBe(true); // 3000 draws over 6 buckets should hit every bucket
  });
});

// ---------------------------------------------------------------------------
// 6. "Remove winner after draw" toggle.
// ---------------------------------------------------------------------------
test.describe('remove winner after draw', () => {
  test('removes the winner from entries after a draw, but keeps the reveal text', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });

    const toggle = page.getByTestId('remove-winner-toggle');
    await toggle.check();
    expect(await page.evaluate(() => window.__hatPicker.settings.removeWinnerAfterDraw)).toBe(true);

    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });

    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).not.toContain('Charades');
    expect(entries).toHaveLength(2);
    await expect(page.getByTestId('winner-reveal')).toHaveText('Charades');
  });

  test('winner stays in the hat when the toggle is off (default)', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await expect(page.getByTestId('remove-winner-toggle')).not.toBeChecked();
    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });
    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).toContain('Charades');
    expect(entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Clear-all via the shared confirmDialog dialog: Enter confirms, Esc cancels.
// ---------------------------------------------------------------------------
test.describe('clear all via confirmDialog', () => {
  test('opens with the "Remove all entries?" message', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.getByTestId('clear-all').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Remove all entries?');
    await expect(page.getByRole('button', { name: 'Yes' })).toBeFocused();

    await page.keyboard.press('Escape'); // clean up
  });

  test('Esc cancels and leaves entries untouched', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.getByTestId('clear-all').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  test('Enter confirms and empties the list', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.getByTestId('clear-all').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('pull-button')).toBeDisabled();
  });

  test('clicking Clear all with zero entries does not open the dialog', async ({ page }) => {
    await page.getByTestId('clear-all').click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 8. Reduced-motion / instant path reveals immediately.
// ---------------------------------------------------------------------------
test.describe('reduced motion / instant reveal', () => {
  test('instant:true resolves synchronously without the ~2s cycle animation', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('A');
      window.__hatPicker.addEntry('B');
    });
    const elapsedMs = await page.evaluate(async () => {
      const start = performance.now();
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
      return performance.now() - start;
    });
    expect(elapsedMs).toBeLessThan(200); // well under the ~2000ms cycle duration
  });

  test('prefers-reduced-motion: reduce forces the immediate-reveal path even without instant:true', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      window.__hatPicker.addEntry('A');
      window.__hatPicker.addEntry('B');
      window.__hatPicker.addEntry('C');
    });
    const result = await page.evaluate(async () => {
      const start = performance.now();
      await window.__hatPicker.draw({ forceIndex: 1 }); // instant NOT passed
      return {
        elapsedMs: performance.now() - start,
        reveal: document.querySelector('[data-testid="winner-reveal"]').textContent,
      };
    });
    expect(result.elapsedMs).toBeLessThan(200);
    expect(result.reveal).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// 9. A real (non-instant) draw via the actual pull-button click: UI must
//    lock during the ~2s cycle animation and re-enable + reveal a winner
//    once it settles.
// ---------------------------------------------------------------------------
test.describe('real animated draw locks the UI', () => {
  test('clicking pull-button locks controls during the cycle, then unlocks and reveals a winner', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });

    await page.getByTestId('pull-button').click();

    // Right after the click, lockUI(true) has run synchronously (draw() locks
    // before awaiting the cycle animation), so controls should already be
    // disabled — poll immediately, don't wait for the animation to finish.
    await expect(page.getByTestId('entry-input')).toBeDisabled();
    await expect(page.getByTestId('add-button')).toBeDisabled();
    await expect(page.getByTestId('clear-all')).toBeDisabled();
    await expect(page.getByTestId('remove-winner-toggle')).toBeDisabled();
    for (const removeBtn of await page.getByTestId('entry-remove').all()) {
      await expect(removeBtn).toBeDisabled();
    }

    // Wait for the ~2s cycle animation to land (generous timeout above the
    // ~2000ms cycle duration) — draw-again-button becomes visible once
    // revealWinner() runs and lockUI(false) has re-enabled controls.
    await expect(page.getByTestId('draw-again-button')).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('entry-input')).toBeEnabled();
    await expect(page.getByTestId('add-button')).toBeEnabled();
    await expect(page.getByTestId('clear-all')).toBeEnabled();
    await expect(page.getByTestId('remove-winner-toggle')).toBeEnabled();
    for (const removeBtn of await page.getByTestId('entry-remove').all()) {
      await expect(removeBtn).toBeEnabled();
    }

    const winnerText = await page.getByTestId('winner-reveal').textContent();
    expect(['Charades', 'Pictionary', 'Codenames']).toContain(winnerText);
    const announceText = await page.getByTestId('winner-announce').textContent();
    expect(announceText).toBe(winnerText);
  });
});

// ---------------------------------------------------------------------------
// 10. Leading/trailing whitespace is trimmed on add.
// ---------------------------------------------------------------------------
test.describe('trims whitespace on add', () => {
  test('"  Charades  " is stored trimmed as "Charades"', async ({ page }) => {
    const input = page.getByTestId('entry-input');
    await input.fill('  Charades  ');
    await input.press('Enter');

    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    const entries = await page.evaluate(() => window.__hatPicker.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Charades');
  });
});

// ---------------------------------------------------------------------------
// 11. Reject visual: blank and duplicate add attempts shake the input.
// ---------------------------------------------------------------------------
test.describe('shake feedback on rejected add', () => {
  test('blank add attempt adds the .shake class to entry-input', async ({ page }) => {
    const input = page.getByTestId('entry-input');
    await input.fill('   ');
    await input.press('Enter');
    await expect(input).toHaveClass(/shake/);
  });

  test('duplicate add attempt adds the .shake class to entry-input', async ({ page }) => {
    await page.evaluate(() => window.__hatPicker.addEntry('Charades'));
    const input = page.getByTestId('entry-input');
    await input.fill('Charades');
    await input.press('Enter');
    await expect(input).toHaveClass(/shake/);
  });
});

// ---------------------------------------------------------------------------
// 12. Mobile viewport coverage (~375x667, deviceScaleFactor 2, touch
//     enabled) — per docs/conventions.md "Responsive & mobile": no
//     horizontal page overflow, controls stay reachable/usable, add and
//     deterministic draw both still work at mobile size. `test.use` scopes
//     the mobile context to just this describe block; every other test in
//     this file still runs at Playwright's default (desktop) viewport, so
//     `npm run test:e2e` exercises both in a single run.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  test('no horizontal page overflow with a full app state (entries + winner reveal)', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      // A long, unbroken word stresses word-break/wrapping without adding
      // real horizontal scroll.
      window.__hatPicker.addEntry(
        'Supercalifragilisticexpialidociousaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      );
    });
    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });

    await expectNoOverflow(page);
  });

  test('key controls are visible and reach ~44px tap targets', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });

    for (const testid of ['entry-input', 'add-button', 'pull-button', 'clear-all', 'remove-winner-toggle']) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }

    const removeBox = await page.getByTestId('entry-remove').first().boundingBox();
    expect(removeBox.width).toBeGreaterThanOrEqual(44);
    expect(removeBox.height).toBeGreaterThanOrEqual(44);

    const clearAllBox = await page.getByTestId('clear-all').boundingBox();
    expect(clearAllBox.height).toBeGreaterThanOrEqual(44);
  });

  // Regression coverage for a real bug: on mobile, tapping the Add button did
  // not add an entry (Enter-to-add worked, masking it on desktop). Root cause
  // was a full-window overlay (the confetti <canvas>, `position: fixed;
  // inset: 0; z-index: 50;`) capable of intercepting pointer events across the
  // entire page unless explicitly excluded from hit-testing. This test
  // exercises the REAL tap path end-to-end (a genuine `.tap()` dispatched at
  // the button's actual on-screen location via Playwright's actionability
  // checks — not `window.__hatPicker.addEntry()` and not `.press('Enter')`),
  // so it fails the moment anything (this overlay or a future one) sits on
  // top of the button and swallows the tap. Verified: reverting the overlay's
  // `pointer-events: none` reproduces the bug and this test fails immediately
  // (Playwright's own actionability trace reports "<canvas> ... intercepts
  // pointer events") — see the elementFromPoint hit-test below for a
  // lower-level assertion of the same invariant.
  test('add-an-entry works at mobile size via a REAL tap on the Add button (not the test hook, not Enter)', async ({
    page,
  }) => {
    const input = page.getByTestId('entry-input');
    await input.tap();
    await input.fill('Charades');

    await page.getByTestId('add-button').tap();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-count')).toHaveText('1 in the hat');
    await expect(page.getByTestId('entry-row').first()).toContainText('Charades');

    // Enter-to-add must still work too (this is what desktop exercised, and
    // is why the tap regression above was missed before).
    await input.fill('Pictionary');
    await input.press('Enter');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await expect(page.getByTestId('entry-count')).toHaveText('2 in the hat');
  });

  // Lower-level companion to the test above: directly verifies, via
  // `document.elementFromPoint`, that nothing is layered on top of the
  // controls a real finger needs to hit. This is the general-purpose guard —
  // it would catch a *new* overlay bug (wrong z-index, a modal left
  // interactive, forgetting `pointer-events: none` on a future decorative
  // layer, etc.) even in a spot no functional test happens to exercise yet.
  test('no overlay intercepts hit-testing on the Add button, Pull button, or a per-entry remove (x) at mobile size', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });

    async function topElementAtCenterOf(testId) {
      const box = await page.getByTestId(testId).first().boundingBox();
      return page.evaluate(
        ({ x, y, w, h }) => {
          const el = document.elementFromPoint(x + w / 2, y + h / 2);
          return el ? { tag: el.tagName, testid: el.dataset?.testid ?? null } : null;
        },
        { x: box.x, y: box.y, w: box.width, h: box.height }
      );
    }

    // Each control's own bounding-box center must hit-test to that control
    // itself (a leaf <button>, so no legitimate descendant could be "on
    // top" of it either) — not a canvas, not a modal backdrop, not anything
    // else layered above it.
    await expect
      .poll(() => topElementAtCenterOf('add-button'))
      .toEqual({ tag: 'BUTTON', testid: 'add-button' });

    await expect
      .poll(() => topElementAtCenterOf('pull-button'))
      .toEqual({ tag: 'BUTTON', testid: 'pull-button' });

    await expect
      .poll(() => topElementAtCenterOf('entry-remove'))
      .toEqual({ tag: 'BUTTON', testid: 'entry-remove' });
  });

  test('deterministic draw({instant:true, forceIndex}) still reveals correctly at mobile size', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });

    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 2 });
    });

    await expect(page.getByTestId('winner-reveal')).toHaveText('Codenames');
    await expect(page.getByTestId('winner-announce')).toHaveText('Codenames');
  });

  // Real (non-instant) draw exercised via an actual tap on the physical
  // pull-button — the deterministic test above intentionally uses the
  // `window.__hatPicker.draw()` hook (its point is proving the forced-index
  // mechanism at mobile viewport dimensions), but nothing else in this file
  // confirmed a genuine tap on pull-button at mobile size drives a real draw
  // end-to-end.
  test('tapping the real pull-button at mobile size runs a full draw and reveals a winner', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });

    await page.getByTestId('pull-button').tap();
    await expect(page.getByTestId('draw-again-button')).toBeVisible({ timeout: 5000 });

    const winnerText = await page.getByTestId('winner-reveal').textContent();
    expect(['Charades', 'Pictionary', 'Codenames']).toContain(winnerText);
    await expect(page.getByTestId('winner-announce')).toHaveText(winnerText);
  });

  test('per-entry remove (x) via the shared confirmDialog dialog works at mobile size: dialog opens, Enter confirms, Esc cancels', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });

    // Esc cancels, leaving both entries.
    await page.getByRole('button', { name: 'Remove Charades' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    // Enter confirms and removes exactly the targeted entry.
    await page.getByRole('button', { name: 'Remove Charades' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).toEqual(['Pictionary']);
  });
});

// ---------------------------------------------------------------------------
// 13. Regression: crypto.randomUUID() is SECURE-CONTEXT ONLY (undefined and
//     throwing over plain HTTP / on a LAN), per docs/conventions.md's
//     "No secure-context-only APIs" rule. This exact bug hit hat-picker: Add
//     silently failed when served over LAN HTTP because addEntry() called
//     crypto.randomUUID() directly. The fix is the newId() helper (backed by
//     crypto.getRandomValues, with a Math.random fallback) used above
//     addEntry in index.html.
//
//     `file://` (what this whole suite otherwise loads via) IS a secure
//     context, so it never exercises this path — this test simulates a
//     non-secure context instead, by shadowing crypto.randomUUID with an
//     own `undefined` property before the page's own scripts run
//     (page.addInitScript), then driving Add through the REAL UI (typing +
//     clicking the Add button, not the window.__hatPicker.addEntry() test
//     hook) so the assertion reflects what an actual user does.
//
//     NOTE on simulation technique: `delete crypto.randomUUID` (the
//     shorthand suggested in docs/conventions.md) turned out to be a no-op
//     in Chromium — `randomUUID` isn't an own property of the `crypto`
//     instance (confirmed via Object.getOwnPropertyDescriptor), so `delete`
//     silently does nothing and the method stays callable. Overriding it
//     with Object.defineProperty(crypto, 'randomUUID', { value: undefined,
//     configurable: true }) reliably shadows it instead (verified: typeof
//     becomes 'undefined' and calling it throws "crypto.randomUUID is not
//     a function", matching the real non-secure-context failure mode) — no
//     try/catch fallback needed since defineProperty alone is sufficient.
//
//     This test FAILS against the old `crypto.randomUUID()`-based code (Add
//     throws, the entry never gets added, the input never clears) and PASSES
//     with newId(). Verified both ways while writing this regression test.
// ---------------------------------------------------------------------------
test.describe('regression: works when crypto.randomUUID is unavailable (non-secure-context simulation)', () => {
  test('typing an entry and clicking Add still adds it and clears the input', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });
    // The top-level beforeEach already navigated before this init script was
    // registered; reload so the init script actually applies to this load.
    await page.reload();

    // Sanity-check the simulation actually took effect before trusting the
    // rest of the assertions.
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');

    const input = page.getByTestId('entry-input');
    await input.fill('Charades');
    await page.getByTestId('add-button').click();

    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-count')).toHaveText('1 in the hat');
    await expect(input).toHaveValue('');
    const entries = await page.evaluate(() => window.__hatPicker.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Charades');
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 14. Help modal — docs/conventions.md "First-load help popup (all tools)".
//     Reference implementation: tools/mancala's How-to-Play modal. An
//     accessible dialog (role="dialog", aria-modal, aria-labelledby, initial
//     focus inside, Esc + backdrop close, focus trap, focus return to the
//     trigger, reduced-motion aware, [hidden] cascade guard) that auto-shows
//     once on a visitor's genuine first load (persisted under
//     "hat-picker:help-seen:v1"), then is reachable only via the Help (?)
//     button. The top-level beforeEach above pre-seeds that key so the rest
//     of this file's tests (all written before this convention existed)
//     aren't interrupted by the auto-shown modal — the "auto-show" tests in
//     this block deliberately open their own fresh browser context instead of
//     using the pre-seeded `page` fixture, so they see a genuine first visit.
// ---------------------------------------------------------------------------
test.describe('help modal', () => {
  test('auto-shows on a genuine first visit (fresh browser context)', async ({ browser }) => {
    await assertHelpAutoShows(browser, TOOL_URL, { text: 'How Hat Picker works', seenKey: HELP_SEEN_KEY });
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
    await expect(dialog).toContainText('How Hat Picker works');
    await expect(dialog.getByTestId('modal-close-x')).toBeFocused();
  });

  test('opens scrolled to the top even though initial focus lands on the top-right ✕', async ({ page }) => {
    await setViewport(page, { width: 400, height: 300 });
    await page.getByTestId('help-button').click();

    const dialog = page.getByTestId('help-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(dialog.getByTestId('modal-close-x')).toBeFocused();
  });

  test('the ? button has title and aria-label "How it works"', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await expect(helpButton).toHaveAttribute('title', 'How it works');
    await expect(helpButton).toHaveAttribute('aria-label', 'How it works');
  });

  test('a11y contract: role/aria-modal/labelledby, ✕ focused, focus trapped, Esc / ✕ / backdrop close with focus return', async ({ page }) => {
    // hat-picker's backdrop-close hides the modal but does not restore focus to the ? button.
    await assertModalA11y(page, { labelledBy: 'help-title', backdropFocusReturn: false });
  });

  // docs/conventions.md "Every content modal has a close ✕" — a persistent ✕
  // pinned to the dialog's top-right corner is the sole dedicated close
  // control (no redundant bottom "Close" text button); Esc and backdrop-click
  // remain as the other close paths.
  test('the top-right ✕ is present, wired to the same close path as Esc/backdrop', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const dialog = page.getByTestId('help-modal');
    const closeX = dialog.getByTestId('modal-close-x');

    await expect(closeX).toBeVisible();
    await expect(closeX).toHaveAttribute('aria-label', 'Close');

    await closeX.click();

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(page.getByTestId('help-button')).toBeFocused();
  });

  test('focus is trapped inside the dialog: the top-right ✕ is the only focusable element, so Tab and Shift+Tab keep it focused', async ({
    page,
  }) => {
    await page.getByTestId('help-button').click();
    const closeX = page.getByTestId('help-modal').getByTestId('modal-close-x');
    await expect(closeX).toBeFocused();

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

    await page.getByTestId('help-modal').getByTestId('modal-close-x').click();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });

  test('the ? button and the dialog ✕ both have touch-action: manipulation', async ({ page }) => {
    await page.getByTestId('help-button').click();
    expect(
      await page.getByTestId('help-button').evaluate((el) => getComputedStyle(el).touchAction)
    ).toBe('manipulation');
    expect(
      await page.getByTestId('help-modal').getByTestId('modal-close-x').evaluate((el) => getComputedStyle(el).touchAction)
    ).toBe('manipulation');
  });
});

// ---------------------------------------------------------------------------
// 15. In-field copy on the winner value — docs/conventions.md "Standard
//     control height & in-field copy — controls.css". The winner card is a
//     copy-worthy value display, so a `.ct-copy-btn` (wired to the shared
//     ctCopy/ctFlash from copy.js) lives inside the `.ct-field` wrapper. Since
//     the card shows a placeholder ("Ready when you are!") before any draw, the
//     button is treated reveal-when-non-empty: hidden until a winner is
//     actually revealed, hidden again on Clear all.
// ---------------------------------------------------------------------------
test.describe('in-field copy on the winner value', () => {
  test('the copy button is hidden until a winner is revealed, then shown with title/aria-label', async ({ page }) => {
    const copyBtn = page.getByTestId('winner-copy');
    await expect(copyBtn).toBeHidden();

    // Adding entries alone (no draw yet) does not reveal it.
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await expect(copyBtn).toBeHidden();

    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveAttribute('title', 'Copy winner');
    await expect(copyBtn).toHaveAttribute('aria-label', 'Copy winner');
  });

  test('clicking copies the exact winner text to the clipboard and flashes ✅ then reverts to 📋', async ({ page }) => {
    await stubClipboard(page);
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
    });
    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 1 });
    });

    const copyBtn = page.getByTestId('winner-copy');
    await expect(copyBtn).toBeVisible();
    // Transient success feedback (ctFlash) swaps to the check glyph, then reverts...
    await expectCopyFlash(copyBtn, { flash: '✅', revert: '📋' });
    // ...and the actual winner value made it onto the clipboard.
    expect(await readClipboard(page)).toBe('Pictionary');
  });

  test('the winner stays copyable after "remove winner after draw" removes the entry', async ({ page }) => {
    await stubClipboard(page);
    await page.evaluate(() => {
      window.__hatPicker.addEntry('Charades');
      window.__hatPicker.addEntry('Pictionary');
      window.__hatPicker.addEntry('Codenames');
    });
    await page.getByTestId('remove-winner-toggle').check();

    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });

    // Charades has been pulled from the hat, but the reveal + copy still hold it.
    const entries = await page.evaluate(() => window.__hatPicker.entries.map((e) => e.text));
    expect(entries).not.toContain('Charades');

    const copyBtn = page.getByTestId('winner-copy');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    expect(await readClipboard(page)).toBe('Charades');
  });

  test('the copy button hides again after Clear all resets the reveal', async ({ page }) => {
    await page.evaluate(() => {
      window.__hatPicker.addEntry('A');
      window.__hatPicker.addEntry('B');
    });
    await page.evaluate(async () => {
      await window.__hatPicker.draw({ instant: true, forceIndex: 0 });
    });
    await expect(page.getByTestId('winner-copy')).toBeVisible();

    await page.evaluate(() => window.__hatPicker.clear());
    await expect(page.getByTestId('winner-copy')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 16. Shared tools/include/controls.css — the standard control height
//     (--control-h: 44px). docs/conventions.md "Standard control height".
//     The tool's own per-control min-heights were removed in favor of this
//     single source of truth; the single-line controls all resolve to 44px.
// ---------------------------------------------------------------------------
test.describe('shared controls.css include (standard control height)', () => {
  test('--control-h is 44px and single-line controls resolve to that min-height', async ({ page }) => {
    const controlH = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--control-h').trim()
    );
    expect(controlH).toBe('44px');

    for (const testid of ['entry-input', 'add-button', 'clear-all']) {
      const minHeight = await page.getByTestId(testid).evaluate((el) => getComputedStyle(el).minHeight);
      expect(minHeight).toBe('44px');
    }
  });

  test('the entry input and Add button render the same (44px) height', async ({ page }) => {
    const inputBox = await page.getByTestId('entry-input').boundingBox();
    const addBox = await page.getByTestId('add-button').boundingBox();
    expect(Math.round(inputBox.height)).toBe(44);
    expect(Math.round(addBox.height)).toBe(44);
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

  test('.visually-hidden is present (the "Add a suggestion" label and the winner-announce live region)', async ({
    page,
  }) => {
    for (const locator of [page.locator('label[for="entry-input"]'), page.getByTestId('winner-announce')]) {
      const style = await locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { position: cs.position, width: cs.width, display: cs.display };
      });
      expect(style.position).toBe('absolute');
      expect(style.width).toBe('1px');
      expect(style.display).not.toBe('none');
    }
  });

  // This tool has no <select> elements, so no select-appearance assertion
  // here (see tools/color-designer's suite for that coverage).
});

// ---------------------------------------------------------------------------
// Shared License modal (src/lib/components/CtLicense.mjs, inlined via the shared
// footer.html). The footer "MIT License" link opens an accessible modal
// (role=dialog, focus trap, ✕/Esc/backdrop close, focus return). hat-picker
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

  // Focus trap + Esc / ✕ / backdrop close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});
