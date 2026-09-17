// Playwright config for tools/color-converter/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', fullyParallel, reporter 'list', clipboard permissions. Spread
// `base` and override only where this tool differs (nothing today).
import { defineConfig } from '@playwright/test';
import base from '../../test-support/playwright.base.config.mjs';

export default defineConfig({ ...base });
