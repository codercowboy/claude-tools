// tests/e2e/smoke.spec.mjs — minimal @playwright/test smoke suite for the
// shipped index.html, loaded from file:// (dev-only; never ships). Expand this
// with real interaction, mobile-viewport, and accessibility coverage — see
// project-structure/testing.md and html-single-file/web-craft.md.
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const INDEX = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html')
).href;

// Pre-seed the help-seen flag so the first-load modal doesn't block other tests.
// Test genuine first-load separately in its own fresh context.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('__TOOL_NAME__:help-seen:v1', '1'); } catch {}
  });
  await page.goto(INDEX);
});

test('transforms input into output', async ({ page }) => {
  // Drive state through the window.__<tool> hook rather than a write-then-reload
  // (see web-craft.md § the file:// write-then-reload flake).
  await page.evaluate(() => window.__TOOL_HOOK__.setInput('abc'));
  await expect(page.getByTestId('output')).toHaveValue('cba');
  await expect(page.getByTestId('stats')).toContainText('3 characters');
});

test('help modal opens and closes', async ({ page }) => {
  await page.getByTestId('help-btn').click();
  await expect(page.getByTestId('help-modal')).toBeVisible();
  await page.getByTestId('modal-close-x').click();
  await expect(page.getByTestId('help-modal')).toBeHidden();
});

test('footer carries the license link', async ({ page }) => {
  await expect(page.getByTestId('footer-license-link')).toBeVisible();
});
