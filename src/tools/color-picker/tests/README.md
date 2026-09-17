# color-picker tests

Automated end-to-end tests for `tools/color-picker/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test` is a `devDependency` of `tools/color-picker/package.json`;
it is never referenced by `index.html`, which remains a single,
dependency-free file. The spec drives the finished page from the outside,
through its `data-testid` hooks and the `window.__colorPicker` test API (see
`../DESIGN.md` § Testability and `../PLAN.md` § 10).

## Running the tests

From `tools/color-picker/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/color-picker/` (or from the repo root) hoists `node_modules` to the
repo root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would.

## What's covered

`color-picker.e2e.mjs`:

1. **Color formatters (pure functions):** `rgbaString`/`hexString` canonical
   output — opaque colors still render `rgba(r, g, b, 1)`; fractional alpha
   is included and rounded to at most 3 decimals; hex is `#rrggbb` when
   opaque and `#rrggbbaa` when `a < 1`; black/white edge cases.
2. **Deterministic load + sample (the core correctness check):** a
   known solid-color PNG and a known 2x2 multi-color PNG are built in-page
   via `canvas.toDataURL`/`putImageData` (byte-exact alpha values chosen to
   avoid any half-rounding ambiguity), loaded through
   `window.__colorPicker.loadImageFromDataURL`, then sampled via
   `window.__colorPicker.sampleAt(px, py)` and asserted against the exact
   expected `{r,g,b,a}` — including out-of-bounds coordinates returning
   `null`. Also covers a real Choose-Color pointer click sampling a loaded
   image end-to-end (not just the test-hook path).
3. **addColor / rows:** a row is added with a swatch (`--swatch-color` CSS
   var), rgba input, and hex input matching the formatters; newest color
   appears at the top of the list; translucent colors get the alpha
   checker-background swatch class.
4. **Choose Color toggle:** `aria-pressed`, the `.active` class on the
   button, the `.choose-color` class on the stage, the canvas's computed
   `cursor` (crosshair active / grab inactive), and the loupe's `hidden`
   state all flip on click and flip back on a second click.
5. **Copy buttons:** clicking `color-rgba-copy` / `color-hex-copy` flips the
   icon to a check (✅) and reverts to 📋 after ~1s. Clipboard read-back is
   not asserted (headless/`file://` clipboard permissions are unreliable);
   the input's value (what would be copied) and the UI feedback are.
6. **Remove single row:** trash opens the confirm modal
   (`role="dialog"`, `aria-modal="true"`, default focus on Confirm); Enter
   confirms and removes; Esc cancels and keeps the row; backdrop click also
   cancels.
7. **Remove all:** disabled at zero colors, enabled once one exists; a
   disabled-button click and a direct handler call are both no-ops at zero;
   opens the modal with the "Remove all colors?" message; Esc cancels; Enter
   empties the list and re-disables the button.
8. **`data-testid` hooks:** every testid from PLAN.md § 10 (top-level,
   modal, and per-row) is present exactly where expected, plus a shape check
   on `window.__colorPicker` itself (`rgbaString`, `hexString`,
   `loadImageFromDataURL`, `sampleAt`, `addColor`, `state`).

See `TESTS.md` for the run record and any findings.
