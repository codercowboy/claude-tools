// Playwright config for tools/color-designer/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', fullyParallel, reporter 'list', clipboard permissions. Spread
// `base` and override only where this tool differs.
import { defineConfig } from '@playwright/test';
import base from '../../test-support/playwright.base.config.mjs';

export default defineConfig({
  ...base,
  // One retry absorbs the occasional reload+restore timing flake under heavy
  // parallel load (localStorage is verified isolated per context — this is CPU
  // contention, not shared state). Assertions are unchanged; a real failure
  // still fails twice.
  retries: 1,
});
