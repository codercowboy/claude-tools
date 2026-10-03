// test-support/shared-ui.mjs — assertions for the shared inlined UI includes.
//
// Dev/test-only ESM, IMPORTED by a tool's tests/*.e2e.mjs. Dependency-free ON
// PURPOSE: it uses only the Playwright `page`/locator objects passed in and never
// imports @playwright/test, so it resolves from this shared dir (which has no
// node_modules) and always drives the caller tool's own Playwright instance.
// Distilled from the near-identical "shared License modal" block every tool
// re-rolled; see PROVENANCE.md. Targets the testids footer.html + CtLicense.mjs emit:
//   footer-license-link · license-overlay · license-modal · license-close-x
//
//   import { assertLicenseModal } from '../../test-support/shared-ui.mjs';
//   test('shared License modal', async ({ page }) => { await assertLicenseModal(page); });

// Wait until the focused element carries the given data-testid (auto-retries via
// Playwright's polling, so it tolerates focus landing a tick after an action).
async function waitFocused(page, testId) {
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-testid') === id,
    testId,
  );
}

async function assertAttr(locator, name, expected) {
  const actual = await locator.getAttribute(name);
  if (actual !== expected) {
    throw new Error(`expected [${name}="${expected}"], got ${JSON.stringify(actual)}`);
  }
}

// assertLicenseModal(page) — full contract for the footer License modal: opens
// from the footer link, shows the MIT text, is an accessible dialog with the ✕
// focused, and closes via Esc, the ✕, and a backdrop click — each time returning
// focus to the trigger. Assumes the page is already loaded.
export async function assertLicenseModal(page) {
  const trigger = page.getByTestId('footer-license-link');
  const overlay = page.getByTestId('license-overlay');
  const modal = page.getByTestId('license-modal');
  const closeX = page.getByTestId('license-close-x');

  const triggerText = (await trigger.textContent())?.trim();
  if (triggerText !== 'MIT License') {
    throw new Error(`footer license link: expected text "MIT License", got ${JSON.stringify(triggerText)}`);
  }

  // Open: dialog visible, MIT text present, accessible, ✕ focused.
  await trigger.click();
  await overlay.waitFor({ state: 'visible' });
  await modal.waitFor({ state: 'visible' });
  await assertAttr(modal, 'role', 'dialog');
  await assertAttr(modal, 'aria-modal', 'true');
  const modalText = (await modal.textContent()) ?? '';
  if (!modalText.includes('MIT License')) {
    throw new Error('license modal does not contain "MIT License"');
  }
  await closeX.waitFor({ state: 'visible' });
  await assertAttr(closeX, 'aria-label', 'Close');
  await waitFocused(page, 'license-close-x');

  // Esc closes and returns focus to the trigger.
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'hidden' });
  await waitFocused(page, 'footer-license-link');

  // The ✕ closes and returns focus to the trigger.
  await trigger.click();
  await overlay.waitFor({ state: 'visible' });
  await closeX.click();
  await overlay.waitFor({ state: 'hidden' });
  await waitFocused(page, 'footer-license-link');

  // A backdrop click (a corner of the overlay, outside the centered dialog)
  // closes and returns focus to the trigger.
  await trigger.click();
  await overlay.waitFor({ state: 'visible' });
  await overlay.click({ position: { x: 5, y: 5 } });
  await overlay.waitFor({ state: 'hidden' });
  await waitFocused(page, 'footer-license-link');
}
