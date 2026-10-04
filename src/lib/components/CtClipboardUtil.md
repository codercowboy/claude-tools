# CtClipboardUtil

Copy text to the clipboard and flash a button to confirm it.

`src/lib/components/CtClipboardUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

Two functions. `copy(text)` writes a string to the clipboard and `flash(el)` gives a button a brief "copied" state. `copy` tries the [async Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) first and falls back to a hidden `<textarea>` plus [`document.execCommand('copy')`](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) for contexts where the async API is unavailable or denied, such as `file://` pages or plain-HTTP LAN addresses. Single-file tools often run from exactly those contexts, which is why the fallback exists. `copy` never throws, callers check its boolean result. Both functions need the DOM (a browser). `flash` self-injects a small CSS pulse animation on first use unless the tool opts out.

The module exports the two functions as named bindings and also as statics on a `CtClipboardUtil` aggregator class. The statics reference the same functions, so either access path runs one implementation.

## API

### `copy(text) → Promise<boolean>`

Copies `text` to the clipboard.

- `text` — any — coerced with `String()`; `null`/`undefined` become `''`.
- Returns a `Promise<boolean>` that always resolves, never rejects. `true` means the copy succeeded, `false` means every path failed (permission denied, unsupported browser).

It tries `navigator.clipboard.writeText` when that API is present. On rejection it falls back to the off-screen `<textarea>` + `execCommand` path. When the async API is absent entirely, it goes straight to the fallback.

```js
import { copy } from './CtClipboardUtil.mjs';

const ok = await copy('hello world');
if (!ok) console.warn('copy failed');
```

### `flash(el, opts?) → void`

Shows transient "copied" feedback on a button by swapping its text for a moment, then reverting.

- `el` — Element — the button (or any element with `textContent`) to flash.
- `opts.label` — string — text shown during the flash. Default `'✅'`.
- `opts.ms` — number — how long the flash lasts, in milliseconds. Default `1000`.
- `opts.revertTo` — string — fixed text to revert to. Use it for icon-only buttons that should always return to a known glyph (for example `'📋'`). When omitted, `flash` reverts to the element's text as captured at the first flash.
- Returns nothing.

The revert text is stored on `el.dataset.ctcFlashOriginal` while a flash is in flight. If `flash` is called again on the same element before the previous one reverted, the stored original is reused, so rapid re-clicks never freeze the flash label in as the "original". Each element's revert timer is tracked in a [`WeakMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap) and cleared on re-entry.

`flash` adds the `.ctc-flash` class for the duration to drive a scale-pulse animation. The class is removed and re-added with a forced reflow (`void el.offsetWidth`) so the animation restarts even on a repeat click. Nothing functional depends on the class, it is decoration.

```js
import { copy, flash } from './CtClipboardUtil.mjs';

btn.addEventListener('click', async () => {
  const ok = await copy(valueToCopy);
  if (ok) flash(btn, { label: '✅', revertTo: '📋' });
});
```

### `class CtClipboardUtil`

Aggregator with `static copy` and `static flash` pointing at the two functions above. Lets a consumer reach them as `CtClipboardUtil.copy(...)` / `CtClipboardUtil.flash(...)` without separate imports.

```js
import { CtClipboardUtil } from './CtClipboardUtil.mjs';

await CtClipboardUtil.copy('text');
CtClipboardUtil.flash(btn);
```

## Notes

- Browser only. Both functions touch `document`, `navigator`, and `window`. There is no server-side or isomorphic path.
- The `.ctc-flash` pulse CSS is injected once, on the first `flash` call, under the `<style id="ctc-copy-style">` element. The animation is disabled under [`prefers-reduced-motion: reduce`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion); the text swap and timing are unaffected.
- To suppress the injected CSS entirely (the tool supplies its own `.ctc-flash` styling), set `window.ctCopyStyles = false` before the first `flash` call.
- `copy` resolves `false` rather than throwing on failure, so wrap the result check in a boolean test, not try/catch.
- `execCommand('copy')` is deprecated but kept as the fallback because it still works where the async Clipboard API does not. Its removal would break copying from `file://` and insecure contexts.
