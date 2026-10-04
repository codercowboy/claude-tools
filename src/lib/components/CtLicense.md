# CtLicense

The shared License modal: importing it wires the footer's "MIT License" link to open a dialog showing the project license and any bundled third-party libraries.

`src/lib/components/CtLicense.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

This module has a side effect at import time. Evaluating it wires one delegated click listener on `document` that opens the License modal whenever a `[data-ct-license]` element is clicked, which is the footer's license button in `components/footer.html`. A tool that carries the footer imports this module in its `app.mjs` and the link works with no extra code; the footer itself inlines no script. The modal can also be opened programmatically with `openLicense()` or `CtLicense.open()`.

The modal shows the project's [MIT License](https://opensource.org/license/mit) text (with `{{project.*}}` tokens filled at build time) and, when a tool declares them, a list of bundled third-party libraries. It is an accessible modal: `role="dialog"`, `aria-modal`, a focus trap, Esc and backdrop close, focus return, [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) awareness, and [fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)-safety (it re-parents into `document.fullscreenElement` so it paints over fullscreen content). Colors come from [CSS system colors](https://developer.mozilla.org/en-US/docs/Web/CSS/system-color) so it tracks the page's light/dark mode. Browser only.

Module-private names carry a `License` qualifier so the build's import-flattening cannot collide with a tool's `app.mjs` top-level names.

## API

### `openLicense() → void`

Opens the License modal, building it on first call.

- Takes no arguments, returns nothing.
- Lazily builds the overlay and dialog the first time, then renders the body fresh on every open (so a change to `window.ctThirdParty` between opens is reflected).
- Records the currently-focused element to restore later, re-parents the overlay into `document.fullscreenElement` when one is active (else `document.body`), reveals it, attaches the Esc/Tab key handler, scrolls to the top, and moves focus to the close ✕.

```js
import { openLicense } from './CtLicense.mjs';

helpMenuLicenseItem.addEventListener('click', openLicense);
```

### `class CtLicense`

Aggregator with a single static, `CtLicense.open`, referencing `openLicense`.

```js
import { CtLicense } from './CtLicense.mjs';

CtLicense.open();
```

### Side effect: the `[data-ct-license]` trigger

Importing the module runs `wireLicenseTrigger()` once (guarded by an idempotent flag and a `typeof document` check). It attaches a delegated `click` listener on `document`; any click whose target `.closest('[data-ct-license]')` matches has its default prevented and opens the modal. No export is needed to activate this; the import is enough.

```html
<!-- in the shared footer -->
<button type="button" data-ct-license data-testid="footer-license-link"
        aria-haspopup="dialog">MIT License</button>
```

```js
// in app.mjs: importing is all it takes to make the footer link live
import './CtLicense.mjs';
```

## Third-party library declaration

The modal reads `window.ctThirdParty` at open time, a per-tool data hook. Set it before the modal opens to list bundled dependencies:

```js
window.ctThirdParty = [
  { name: 'some-wasm-codec', version: '1.2.3', license: 'Apache-2.0', url: 'https://example.com/repo' }
];
```

Each entry is an object with optional `name`, `version`, `license`, and `url` fields. The modal renders a "Bundled third-party libraries" list (name + version, a license dash-suffix, and a "source" link when `url` is set) plus a note that full texts live in the repository's `NOTICES` file. When `window.ctThirdParty` is absent or not an array, the modal instead states the tool has no third-party libraries and no runtime dependencies. All values are HTML-escaped before rendering.

## Notes

- Browser only. The module touches `document` on evaluation (to wire the trigger) and builds DOM on first open.
- Styles are injected on first build under a `<style>` element (class prefix `jbcl-`). This module has no documented opt-out flag for its styles, unlike `CtModal` and `CtConfirm`. The injected CSS relies on system colors (`Canvas`, `CanvasText`, `LinkText`, `GrayText`, `Highlight`) rather than `--ctc-*`/`--jbcm-*` custom properties, so it tracks light/dark but is not variable-themable per tool.
- `{{project.repo}}` and `{{project.name}}` are build-time tokens, replaced before the file ships. In the raw source they are literal placeholder strings.
- The copyright line in the bundled MIT text reads "Copyright (c) 2026 Jason and Claude (Anthropic)".
- The overlay sits at `z-index: 2147483000` and, while open, lives inside `document.fullscreenElement` when a fullscreen element is active, returning to `document.body` on close.
- A single shared overlay is reused across opens (module-level singletons), so the modal is not re-instantiated per call.
