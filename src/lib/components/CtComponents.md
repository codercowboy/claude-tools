# CtComponents

Shared UI-wiring helpers for single-file tools: segmented controls, tabs, dropzones, banners, an aria-live announcer, and delegated copy buttons.

`src/lib/components/CtComponents.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

A grab-bag of DOM helpers that each tool would otherwise rewrite. The widgets lean on [ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA) roles and states so the controls are keyboard-operable and screen-reader-legible: `wireSegmented` and `wireTabs` manage roving tabindex and selection state, `announce` writes to a visually-hidden live region, and the banner helpers toggle `[hidden]`. The module is dependency-free and self-contained. It imports nothing else, and the copy wiring takes its `copy`/`flash` implementations by injection rather than importing `CtClipboardUtil` directly, which keeps the module standalone.

Everything here needs the DOM. Exports are available as named functions and as statics on a `CtComponents` aggregator class pointing at the same implementations. Some widgets expect specific markup (a `role="tablist"` of `role="tab"` buttons, elements that can hold `[hidden]`), called out per export.

## API

### `iconButton(label, title, onClick?, opts?) → HTMLButtonElement`

Creates a `<button type="button">` with text, an accessible name, and an optional click handler.

- `label` — string — the button's `textContent`. Skipped when `null`.
- `title` — string — sets both `title` and a matching `aria-label`. Skipped when `null`.
- `onClick` — function — attached as a `click` listener when it is a function.
- `opts.className` — string — overrides the class. Default `'icon-btn'`.
- Returns the detached button element. The caller inserts it into the DOM.

```js
import { iconButton } from './CtComponents.mjs';

const btn = iconButton('📋', 'Copy', () => doCopy());
toolbar.appendChild(btn);
```

### `wireSegmented(group, onChange, opts?) → { select, buttons }`

Turns a container of buttons into a single-select segmented control. Click or an Arrow key selects. The chosen button gets `aria-pressed="true"` and `tabIndex = 0`, the rest get `"false"` and `-1` (roving tabindex), then `onChange(value, button)` fires.

- `group` — Element — the container to query within.
- `onChange` — function — called `(value, chosenButton)` on each selection.
- `opts.selector` — string — which descendants are the buttons. Default `'button'`.
- `opts.attr` — string — the selected-state attribute. Default `'aria-pressed'` (pass `'aria-checked'` for a radio-group flavor).
- Returns `{ select(value), buttons }`. `buttons` is the array of matched elements. Call `select(initial)` once to set the starting state; that initial call fires `onChange`.

A button's value is its `data-value`, else its `.value` (when non-empty), else its trimmed text. Arrow Right/Down move forward, Arrow Left/Up move back, wrapping at both ends, and focus follows selection.

```js
import { wireSegmented } from './CtComponents.mjs';

const seg = wireSegmented(document.querySelector('#units'), (v) => setUnit(v));
seg.select('metric'); // set initial state (fires onChange)
```

### `wireTabs(tablist, onChange, opts?) → { select, tabs }`

The tablist analogue of `wireSegmented`. It drives `aria-selected` plus `role="tabpanel"` show/hide instead of `aria-pressed`. Click, Arrow, Home, or End selects. The chosen tab gets `aria-selected="true"` and `tabIndex = 0` (others `"false"` / `-1`), the panel named by its `aria-controls` is shown and sibling tabs' panels are hidden, then `onChange(value, tab)` fires.

- `tablist` — Element — the `role="tablist"` container.
- `onChange` — function — called `(value, chosenTab)` on each selection.
- `opts.selector` — string — which descendants are tabs. Default `'[role="tab"]'`.
- `opts.attr` — string — the selected-state attribute. Default `'aria-selected'`.
- `opts.vertical` — boolean — use ArrowUp/ArrowDown instead of ArrowLeft/ArrowRight.
- Returns `{ select(value), tabs }`. Call `select(initial)` once to set the starting state (fires `onChange`).

A tab's value is its `data-mode`, else `data-value`, else `id`, else trimmed text. Panel handling resolves each tab's `aria-controls` id through `document.getElementById`. A tab with no `aria-controls` toggles no panel. When every tab points `aria-controls` at one shared panel (a language switcher over a single editor, say), that panel is never hidden because the hide loop skips the chosen panel.

```js
import { wireTabs } from './CtComponents.mjs';

const tabs = wireTabs(document.querySelector('[role="tablist"]'), (mode) => render(mode));
tabs.select('encode');
```

Expected markup:

```html
<div role="tablist">
  <button role="tab" data-mode="encode" aria-controls="panel-encode">Encode</button>
  <button role="tab" data-mode="decode" aria-controls="panel-decode">Decode</button>
</div>
<div id="panel-encode" role="tabpanel">…</div>
<div id="panel-decode" role="tabpanel" hidden>…</div>
```

### `wireDropzone(zone, onFiles, opts?) → void`

Wires drag-and-drop file input on an element. It toggles a drag class during a drag and calls `onFiles` with the dropped files.

- `zone` — Element — the drop target.
- `onFiles` — function — called with the [`FileList`](https://developer.mozilla.org/en-US/docs/Web/API/FileList) (`dataTransfer.files`) on drop, only when at least one file was dropped.
- `opts.dragClass` — string — class toggled on the zone while a drag is over it. Default `'ct-drag-over'`.
- Returns nothing.

It prevents the default on `dragenter`/`dragover`/`dragleave`/`drop` so the browser does not navigate to the file. Pairs with the `.ct-dropzone` CSS in `widgets.css`.

```js
import { wireDropzone } from './CtComponents.mjs';

wireDropzone(document.querySelector('.ct-dropzone'), (files) => loadFile(files[0]));
```

### `showBanner(el, msg?) → void` / `hideBanner(el) → void`

Show or hide a message banner by toggling `[hidden]`.

- `showBanner(el, msg?)` — sets `el.textContent` to `msg` when `msg` is given, then sets `el.hidden = false`. No-op for a falsy `el`.
- `hideBanner(el)` — sets `el.hidden = true`. No-op for a falsy `el`.

`showError`, `showWarning`, `hideError`, and `hideWarning` are exported aliases. `showError` and `showWarning` are the same function as `showBanner`; `hideError` and `hideWarning` are the same as `hideBanner`. The error/warning split is a naming convenience for two separate elements, not two behaviors. Pairs with the `.ct-error` / `.ct-warning` CSS in `widgets.css`.

```js
import { showError, hideError } from './CtComponents.mjs';

const err = document.querySelector('.ct-error');
showError(err, 'That is not valid JSON.');
// later
hideError(err);
```

### `announce(msg, opts?) → void`

Writes a message to a visually-hidden [aria-live](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions) region so screen readers announce a dynamic result.

- `msg` — any — coerced with `String()`; `null`/`undefined` become `''`.
- `opts.assertive` — boolean — when truthy, the region is created with `aria-live="assertive"` instead of `"polite"`.
- Returns nothing.

One live region is lazily created per page and appended to `<body>` with `role="status"`, `aria-atomic="true"`, and off-screen clipping styles. The text is cleared, then set after a 30 ms timeout, so identical consecutive messages are still re-announced.

Caveat: `opts.assertive` only takes effect on the first call, which is what creates the region. Later calls reuse the existing region and do not change its `aria-live` value.

```js
import { announce } from './CtComponents.mjs';

announce('Converted 42 rows.');
announce('Conversion failed.', { assertive: true });
```

### `wireCopyButtons(root?, opts?) → void`

Delegated click wiring for copy buttons, built on injected `copy`/`flash` functions. One listener on `root` handles any click that lands on a copy button, resolves the button's target element, reads its value or text, copies it, and flashes the button.

- `root` — Element|Document — where the single click listener is attached and the scope clicks must fall within. Default `document`.
- `opts.copy` — function — the copy implementation (pass `CtClipboardUtil`'s `copy`). Without it the handler no-ops.
- `opts.flash` — function — the flash implementation (pass `CtClipboardUtil`'s `flash`). Optional. The copy still happens without it.
- `opts.selector` — string — which elements are copy buttons. Default `'.ct-copy-btn'`.
- `opts.targetAttr` — string — the button attribute naming the copy source. Default `'data-copy-target'`.
- `opts.skipWhen` — function — predicate `(text, target, btn)` consulted after the target's text is read and before the empty-string guard. Return truthy to ignore the click (no copy, no flash).
- `opts.flashLabel` — string — label passed to `flash`. Default `'✅'`.
- `opts.revertTo` — string — revert glyph passed to `flash`.
- Returns nothing.

The target is resolved by `[data-testid="<id>"]` first, then by `getElementById`. The copied text is the target's `.value` when present, otherwise its `textContent`. An empty string is never copied. `skipWhen` lets a tool route an "empty sentinel" through the shared wiring, for example a `'—'` placeholder in an `<output>` (`skipWhen: t => t === '—'`) or a `data-empty` flag (`skipWhen: (t, el) => el.getAttribute('data-empty') === 'true'`).

```js
import { wireCopyButtons } from './CtComponents.mjs';
import { copy, flash } from './CtClipboardUtil.mjs';

wireCopyButtons(document, { copy, flash });
```

Expected markup:

```html
<output id="result">base64 output…</output>
<button class="ct-copy-btn" data-copy-target="result">Copy</button>
```

### `wireEditableCopy(input, btn) → void`

Shows an in-field copy button only while the input has a value, since CSS alone cannot react to a field's value.

- `input` — HTMLInputElement|HTMLTextAreaElement — the field to watch.
- `btn` — Element — the copy button to show/hide.
- Returns nothing. No-op if either argument is falsy.

It toggles `btn.hidden` on every `input` event and once immediately, hiding the button when the field is empty.

```js
import { wireEditableCopy } from './CtComponents.mjs';

wireEditableCopy(document.querySelector('#url'), document.querySelector('#url-copy'));
```

### `class CtComponents`

Aggregator exposing every function above as a static (`CtComponents.wireTabs`, `CtComponents.announce`, and so on). The `showBanner`/`hideBanner` family is reachable both under its own name and under the error/warning aliases. The statics reference the same implementations, so either access path runs one copy.

## Notes

- Browser only. Every helper touches the DOM.
- `wireSegmented`/`wireTabs` snapshot their buttons at wire time with `querySelectorAll`. Buttons added after the call are not wired.
- Their `select(value)` call fires `onChange`. There is no "set state without firing" path from the returned handle; the internal `fire` flag that would suppress it is not exposed.
- `wireCopyButtons` and `wireEditableCopy` are the only exports that read element values; the rest only set attributes, classes, or text.
- Pairs with `widgets.css` for `.ct-dropzone`, `.ct-error`, and `.ct-warning` styling. This module ships behavior, not those styles.
