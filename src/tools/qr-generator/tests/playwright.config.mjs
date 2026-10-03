// Playwright config for tools/qr-generator/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../../lib/test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', reporter 'list', clipboard permissions.
//
// Serial (one worker) is inherited from the base now; this tool only raises the
// per-test timeout. The round-trip decode tests each render a QR to a real
// canvas and re-extract its PNG bytes — cheap, but a little slower than most.
import { defineConfig } from '@playwright/test';
import base from '../../../lib/test-support/playwright.base.config.mjs';

export default defineConfig({ ...base, timeout: 30000 });
