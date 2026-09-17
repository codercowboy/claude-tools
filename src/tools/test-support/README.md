# `test-support/` — shared test helpers for single-file tools

Dev/test-only ESM helpers a tool's tests **import** (these are never inlined
into a shipped `index.html`, and never ship). They distill the byte-identical
test idioms every tool used to re-roll: the `file://` bootstrap, the first-load
Help seed, the shared License-modal suite, the unit-test logic loader, and the
base Playwright config. See [`PROVENANCE.md`](./PROVENANCE.md) for what each was
consolidated from.

## Layout assumption

`test-support/` sits one level **above** the tool directories, so a tool at
`<tools>/<name>/` reaches it with a relative path from its `tests/` folder:

```
<tools>/
  test-support/            <- this directory
    setup.mjs
    unit.mjs
    shared-ui.mjs
    playwright.base.config.mjs
  <name>/
    tests/
      <name>.e2e.mjs       -> ../../test-support/...
      unit/
        *.test.mjs         -> ../../../test-support/...
```

## Modules & exports

### `setup.mjs` — e2e navigation & first-load setup

- `toolUrl(import.meta.url)` → the `file://` URL of the tool's built
  `index.html` (resolved one level up from the calling `*.e2e.mjs`).
- `helpSeenKey(toolName)` → `` `${toolName}:help-seen:v1` ``.
- `seedHelpSeen(page, key)` → `addInitScript` that sets the help-seen key (in
  `try/catch`) before the page's own script runs, so the Help popup never
  auto-opens over other assertions.

### `unit.mjs` — shared unit loader

- `loadLogic(import.meta.url)` → memoized dynamic import of the tool's
  `source/logic.mjs` (resolved from the calling `tests/unit/*.test.mjs`).
  Replaces every per-tool `_helpers.mjs` core; tool-specific unit helpers stay
  in the local `_helpers.mjs`.

### `shared-ui.mjs` — shared inlined-UI assertions

- `assertLicenseModal(page)` → the full footer License-modal contract (opens
  from the footer link, MIT text, accessible dialog, ✕ focused, Esc / ✕ /
  backdrop close, focus return). Requires `@playwright/test`.

### `playwright.base.config.mjs` — base Playwright config

- default export: a `defineConfig({...})` with `testDir '.'`,
  `testMatch '**/*.e2e.mjs'`, `fullyParallel: true`, `reporter: 'list'`, and
  clipboard `use.permissions`. A tool imports and spreads it, overriding only
  the outliers.

## Importing from a tool's tests

```js
// tests/<name>.e2e.mjs
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';
import { assertLicenseModal } from '../../test-support/shared-ui.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const HELP_SEEN_KEY = helpSeenKey('<name>');

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

test('shared License modal', async ({ page }) => {
  await assertLicenseModal(page);
});
```

```js
// tests/playwright.config.mjs
import { defineConfig } from '@playwright/test';
import base from '../../test-support/playwright.base.config.mjs';
export default defineConfig({ ...base });
```

```js
// tests/unit/<something>.test.mjs
import { loadLogic } from '../../../test-support/unit.mjs';
const { someExport } = await loadLogic(import.meta.url);
```
