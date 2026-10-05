# hat-picker tests

Automated end-to-end tests for `tools/hat-picker/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test` is a `devDependency` of `tools/hat-picker/package.json`; it
is never referenced by `index.html`, which remains a single, dependency-free
file. The spec drives the finished page from the outside, through its
`data-testid` hooks and the `window.__hatPicker` test API (see
`../DESIGN.md` § Testability and `../PLAN.md` § 10).

## Running the tests

From `tools/hat-picker/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/hat-picker/` (or from the repo root) hoists `node_modules` to the repo
root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would.

This was verified to actually run in the sandboxed environment used to build
these tests: `npx playwright install chromium` downloaded successfully and
`npm run test:e2e` reported **19 passed**. If your environment blocks browser
binary downloads (e.g. a fully offline sandbox), `npm install` will still
succeed but `npx playwright install chromium` will fail or hang — in that
case this spec is available to run once a browser can be installed, but
cannot be executed in that environment.

## What's covered

`hat-picker.e2e.mjs` encodes the same assertions verified live via the
Playwright MCP browser tools during manual testing (see `TESTS.md` for the
full live-run record):

1. Add entries: Enter-to-add, char counter, blank/whitespace rejection, the
   80-char cap (including the JS-level defense-in-depth guard against
   paste bypassing `maxlength`).
2. Duplicate rejection, per-row remove, empty-state show/hide.
3. Pull button disabled under 2 entries, enabled at 2+.
4. Deterministic draw via `draw({instant:true, forceIndex})`, asserting the
   revealed winner text and the `aria-live` announce region.
5. `pickIndex(count, rng)` purity (fixed rng sequences give fixed outputs,
   `count <= 0` throws) and unbiased range with the real `defaultRng` over
   thousands of draws.
6. "Remove winner after draw" toggle: winner removed from `entries` after a
   draw, reveal card text preserved either way.
7. Clear-all confirm modal: Esc cancels, Enter confirms and empties the list,
   clicking Clear-all with zero entries is a no-op.
8. `instant:true` and `prefers-reduced-motion: reduce` (emulated via
   `page.emulateMedia`) both resolve in well under the ~2s cycle duration.

## Screenshots

`screenshots/winner-revealed.png` — a full-page capture taken during the live
MCP run, showing entries in the hat and a revealed winner card.
