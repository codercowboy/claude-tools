// playwright.config.mjs — points the e2e runner at tests/e2e/ ONLY, so the
// node --test unit files under tests/unit/ (which also match Playwright's
// default *.test.* glob) are never picked up by `playwright test`.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { ...devices['Desktop Chrome'] },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile coverage is required (see web-craft.md § Responsive & mobile).
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
