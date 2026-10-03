// test-support/playwright.base.config.mjs — the shared Playwright config base.
//
// Dev/test-only ESM. Exported as a PLAIN OBJECT (no @playwright/test import) so it
// resolves from this shared dir, which has no node_modules of its own. A tool's
// tests/playwright.config.mjs wraps it with ITS OWN defineConfig — resolved from
// the tool's node_modules — overriding only where it differs:
//
//   import { defineConfig } from '@playwright/test';
//   import base from '../../../lib/test-support/playwright.base.config.mjs';
//   export default defineConfig({ ...base });
//   // or override: export default defineConfig({ ...base, timeout: 30000 });
//
// Distilled from the byte-identical per-tool config every tool re-rolled; see
// PROVENANCE.md.

// A tool's e2e specs are named *.e2e.mjs (not @playwright/test's default
// *.spec.* / *.test.*), live beside the consuming config in tests/, and drive the
// built index.html over a file:// URL. The clipboard permissions are best-effort
// so copy-button tests can reach navigator.clipboard.writeText without a prompt;
// the app's execCommand fallback covers file:// either way.
// Serial by default: exactly ONE Playwright worker (one browser) at a time.
// These tools' specs include timing- and focus-sensitive checks (copy-icon
// revert after ~1s, hover states, modal focus return) that flake when parallel
// workers contend for the machine — the failing set shifts run to run. One
// worker trades a little wall-clock for determinism. A tool may still override
// `timeout` (or anything else) in its own config; don't re-raise `workers`.
export default {
  testDir: '.',
  testMatch: '**/*.e2e.mjs',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    permissions: ['clipboard-read', 'clipboard-write'],
  },
};
