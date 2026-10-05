// Minimal Playwright config scoped to tools/pretty-printer/tests. Dev/test-only —
// never referenced by index.html. Lets `npm run test:e2e` find
// pretty-printer.e2e.mjs, whose name doesn't match @playwright/test's default
// *.spec.* / *.test.* file pattern.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.mjs',
  fullyParallel: true,
  reporter: 'list',
  use: {
    // Best-effort: lets navigator.clipboard.writeText succeed without a
    // permission prompt for the copy-button tests. If the browser/origin
    // combination doesn't honor this (file:// origins can be finicky about
    // the Permissions API), the app's own execCommand fallback still makes
    // the copy path succeed, so tests assert on UI feedback (the flash)
    // rather than reading the clipboard.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
});
