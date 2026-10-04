# CtConfirm

An accessible, promise-based confirm dialog for single-file tools.

`src/lib/components/CtConfirm.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

A drop-in replacement for `window.confirm` that returns a `Promise<boolean>` and styles itself to match the host tool. One export, `confirmDialog(message)`, builds an overlay with a Cancel and a Yes button, resolves `true` on confirm and `false` on cancel, and cleans itself up on close. The dialog is a real [modal](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/dialog_role): `role="dialog"`, `aria-modal`, labelled by the message, focus trapped between the two buttons, and focus returned to the triggering element on close.

Styling is variable-driven. The component injects only structural CSS and reads every visual choice from a `--ctc-*` [CSS custom property](https://developer.mozilla.org/en-US/docs/Web/CSS/--*) with a theme-aware [CSS system color](https://developer.mozilla.org/en-US/docs/Web/CSS/system-color) fallback, so it looks right with no theming and picks up a tool's palette when the tool sets those variables. Browser only (needs `document` and `window`).

## API

### `confirmDialog(message?) → Promise<boolean>`

Shows the dialog and resolves when the user answers.

- `message` — any — the prompt text. `null`, empty, or whitespace-only becomes `'Are you sure?'`; anything else is coerced with `String()`.
- Returns a `Promise<boolean>` that resolves `true` when confirmed, `false` when cancelled. It does not reject.

Yes is the default: it receives initial focus, and Enter confirms. Esc, the Cancel button, and a backdrop click (mousedown on the overlay itself) all cancel. Tab and Shift+Tab cycle between Cancel and Yes and nowhere else. On close the overlay is removed from the DOM, the keydown listener is detached, and focus is restored to whatever was focused before the dialog opened. A `done` guard makes close idempotent, so the first answer wins and the promise resolves once.

The named export is `confirmDialog`, not `confirm`, so it does not shadow `window.confirm`.

```js
import { confirmDialog } from './CtConfirm.mjs';

if (await confirmDialog('Remove this color?')) {
  removeColor();
}
```

### `class CtConfirm`

Aggregator with a single static, `CtConfirm.confirm`, referencing `confirmDialog`. Note the static is named `confirm` even though the function export is `confirmDialog`.

```js
import { CtConfirm } from './CtConfirm.mjs';

const yes = await CtConfirm.confirm('Clear everything?');
```

## Notes

- Browser only. It creates DOM, appends to `document.body`, and listens on `document`.
- Styles self-inject once, on the first call, under `<style id="ctc-style">`. To supply your own CSS instead, set `window.ctConfirmStyles = false` before the first call; the component then injects nothing and your tool must provide all `.ctc-*` classes (`.ctc-overlay`, `.ctc-dialog`, `.ctc-message`, `.ctc-buttons`, `.ctc-btn`, `.ctc-btn--cancel`, `.ctc-btn--yes`).
- Theming variables, all optional, read off any in-scope `:root`/`body` block: `--ctc-accent`, `--ctc-accent-fg` (the Yes button), `--ctc-bg`, `--ctc-fg` (surface and text), `--ctc-backdrop` (overlay), `--ctc-radius`, `--ctc-btn-radius`, `--ctc-shadow`, `--ctc-font`, `--ctc-cancel-border`, `--ctc-focus`, `--ctc-max-width`.
- The focus trap assumes exactly two focusable controls (Cancel and Yes). It is not a general-purpose modal for arbitrary content; for that, see `CtModal`.
- The overlay sits at `z-index: 2147483000`, near the top of the stacking range, so it clears typical tool chrome.
- Each dialog's message element gets a random `id` for `aria-labelledby`, so multiple confirms do not collide.
