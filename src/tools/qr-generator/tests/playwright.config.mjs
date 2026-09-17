// Playwright config for tools/qr-generator/tests. Dev/test-only — never
// referenced by index.html. Extends the shared base
// (../../test-support/playwright.base.config.mjs): testDir '.', testMatch
// '**/*.e2e.mjs', reporter 'list', clipboard permissions.
//
// Outliers preserved: single worker / serial run with a longer timeout. The
// round-trip decode tests each render a QR to a real canvas and re-extract its
// PNG bytes — cheap, but keeping this serial avoids any risk of shared-canvas
// flakiness under parallel workers on this file.
import { defineConfig } from '@playwright/test';
import base from '../../test-support/playwright.base.config.mjs';

export default defineConfig({ ...base, fullyParallel: false, workers: 1, timeout: 30000 });
