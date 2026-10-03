// Playwright config for tools/uuid-generator/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../../lib/test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', serial (1 worker), reporter 'list', clipboard permissions. Spread
// `base` and override only where this tool differs (nothing today).
import { defineConfig } from '@playwright/test';
import base from '../../../lib/test-support/playwright.base.config.mjs';

export default defineConfig({ ...base });
