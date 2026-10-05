// Playwright config for tools/invisible-chars/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../../lib/test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', fullyParallel, reporter 'list', clipboard permissions. Spread
// `base` and override only where this tool differs (nothing today).
import { defineConfig } from '@playwright/test';
import base from '../../../lib/test-support/playwright.base.config.mjs';

// The shared dev VM is routinely CPU-starved (other agents' jobs), which stalls headless
// Chromium for seconds at a time; generous timeouts keep timing-based tests (reconnect
// backoff, scripted server closes) from flaking. They never mask a logic failure: every
// assertion is still exact.
export default defineConfig({ ...base, timeout: 60000, expect: { timeout: 10000 } });
