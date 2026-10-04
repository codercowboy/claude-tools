# CtModal

The shared accessible content-modal primitive for single-file tools: one `createModal` call builds a Help / Options / About / License-style dialog and hands back a small open/close handle.

`src/lib/components/CtModal.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

`createModal(opts)` builds one modal from a title and body, appends it to the page hidden, and returns `{ open, close, root }`. It implements the dialog contract once for every tool: [`role="dialog"`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/dialog_role), `aria-modal`, a persistent close ✕ pinned top-right, a focus trap over the ✕ plus any content controls, Esc and backdrop close, focus return to the trigger, scroll-to-top on open, [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) awareness, and [fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)-safety (re-parented into `document.fullscreenElement` on open so it paints over fullscreen content).

Styling is variable-driven. The component injects structural CSS only and reads every visual choice from a `--jbcm-*` [CSS custom property](https://developer.mozilla.org/en-US/docs/Web/CSS/--*) with a [CSS system color](https://developer.mozilla.org/en-US/docs/Web/CSS/system-color) fallback, so it looks right unthemed and matches a tool that sets those variables. Browser only.

Where `CtConfirm` is a fixed two-button yes/no, this is for arbitrary content and arbitrary count of modals per page.

## API

### `createModal(opts?) → { open, close, root }`

Builds one modal and returns its handle.

- `opts.title` — string — heading text. Renders an `<h2>` and wires `aria-labelledby`. Omit it and the dialog is labelled `aria-label="Dialog"` instead.
- `opts.titleId` — string — explicit `id` for the `<h2>` (and the `aria-labelledby` pointing at it). Default: a random id. Pass a stable one when a test or another element references it.
- `opts.body` — string | Node — a string is assigned as `innerHTML`; a DOM Node is appended. Omit to start empty and fill `.jbcm-body` yourself later.
- `opts.onClose` — function — called with no arguments after each close. Handy for a "seen" flag.
- `opts.testid` — string — `data-testid` prefix. The overlay gets `${testid}-overlay`, the dialog `${testid}-modal` (defaults `jbcm-overlay` / `jbcm-dialog`). The ✕ is always `modal-close-x`.
- `opts.autoOpen` — object — a once-flag handle `{ seen(), mark() }` (for example `CtUtil`'s `onceFlag(KEY)`). On a fresh visit (`seen()` returns false) the modal marks the flag and auto-opens, so a first-load Help popup shows exactly once. Injected rather than imported, so the module stays standalone.

Returns a handle:
- `open()` — shows the modal, records the trigger as the element to refocus, re-parents into the fullscreen element when one is active, reveals it, attaches the key handler, scrolls to top, and focuses the ✕.
- `close()` — hides it, detaches the key handler, restores the overlay to `document.body`, returns focus to the recorded trigger, and runs `onClose`. No-op when already hidden.
- `root` — the overlay element. `root.querySelector('.jbcm-body')` is the content container, useful for swapping `body` between opens.

The modal is built present-but-hidden from construction, not lazily on first open, so `root` is queryable immediately and `[hidden]` collapses it to `display:none`. When `opts.body` is a string it becomes `innerHTML`; when it is a Node (`body.nodeType` truthy) it is appended.

```js
import { createModal } from './CtModal.mjs';

const help = createModal({
  title: 'How this works',
  body: '<p>Paste some text and hit Convert.</p>'
});
helpButton.addEventListener('click', help.open);
```

First-load-once Help popup, with an injected once-flag:

```js
import { createModal } from './CtModal.mjs';
import { onceFlag } from '../utils/CtUtil.mjs'; // whatever supplies { seen, mark }

createModal({
  title: 'Welcome',
  body: welcomeNode,
  autoOpen: onceFlag('seen-help-v1')
});
```

### `class CtModal`

Aggregator with a single static, `CtModal.create`, referencing `createModal`.

```js
import { CtModal } from './CtModal.mjs';

const about = CtModal.create({ title: 'About', body: '<p>…</p>' });
about.open();
```

## Notes

- Browser only. It builds DOM, appends to `document.body`, and listens on `document` while open.
- Styles self-inject once, on the first `createModal` call, under `<style id="jbcm-style">`. To supply your own CSS, set `window.ctModalStyles = false` before the first call; the component then injects nothing and your tool provides all `.jbcm-*` classes (`.jbcm-overlay`, `.jbcm-dialog`, `.jbcm-close`, `.jbcm-title`, `.jbcm-body`).
- Theming variables, all optional: `--jbcm-bg`, `--jbcm-fg` (surface and text), `--jbcm-backdrop` (overlay), `--jbcm-border`, `--jbcm-shadow`, `--jbcm-radius`, `--jbcm-font`, `--jbcm-max-width`, `--jbcm-focus` (focus ring).
- The focus trap and Esc handler are attached only while the modal is open and removed on close, so a page with several modals does not stack listeners.
- There is a single dedicated close affordance, the top-right ✕. No redundant bottom "Close" button is rendered.
- The overlay sits at `z-index: 2147483000`. While open it is re-parented into `document.fullscreenElement` when one exists and restored to `document.body` on close.
- `autoOpen` marks the flag before opening, so the "once" holds even if the visitor leaves without closing.
