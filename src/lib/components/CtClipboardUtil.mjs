// ===== Begin CtClipboardUtil (ES module) =====
/*
 * CtClipboardUtil — copy-to-clipboard + button-flash helpers (ES module; was copy.js)
 * ---------------------------------------------------------------------------
 * import { copy, flash } from '<rel>/jbc-include/components/CtClipboardUtil.mjs';
 * (or `CtClipboardUtil.copy` / `CtClipboardUtil.flash` via the aggregator class
 * at the bottom — statics REFERENCE the named bindings, single implementation.)
 *
 * Formerly the pasteable IIFE copy.js exposing the jbcCopy / jbcFlash window globals;
 * those globals are GONE. `copy` = ex-jbcCopy, `flash` = ex-jbcFlash — bodies
 * unchanged. The `.ctc-flash` CSS still self-injects on the first `flash()` call
 * (ensureStyles) and the `window.ctCopyStyles = false` opt-out is still honored.
 *
 * copy(text) -> Promise<boolean>
 * flash(el, opts?) -> void
 *
 *     btn.addEventListener('click', async () => {
 *       if (!text) return;
 *       const ok = await copy(text);
 *       if (!ok) return;
 *       flash(btn, { label: '✅', revertTo: '📋' });
 *     });
 *
 * copy(text):
 * - Tries `navigator.clipboard.writeText` first; falls back to a hidden,
 *   off-screen `<textarea>` + `document.execCommand('copy')` for restricted
 *   or insecure contexts (e.g. `file://`, LAN HTTP) where the async
 *   Clipboard API is unavailable or denied.
 * - Always RESOLVES — never rejects/throws. Resolves `true` on success,
 *   `false` if every copy path failed (denied permission, unsupported
 *   browser, etc.) — callers check the boolean rather than try/catch.
 *
 * flash(el, opts?):
 * - Transient "copied" feedback on a button: swaps `el.textContent` to
 *   `opts.label` (default `'✅'`) for `opts.ms` (default `1000`), then
 *   reverts and clears the timer.
 * - Revert target: `opts.revertTo` if given (for icon-only buttons that
 *   always revert to a fixed glyph, e.g. `'📋'`); otherwise the element's
 *   current text — captured once and reused if `flash` is called again on
 *   the same element before the previous flash reverted (rapid re-clicks
 *   don't lose the true original label).
 * - Adds a `.ctc-flash` class for the duration, driving a brief, purely
 *   decorative scale pulse (see STYLING below) — no functional behavior
 *   depends on it.
 *
 * STYLING:
 * - The only visual injected is the optional `.ctc-flash` pulse animation,
 *   which is skipped entirely under `prefers-reduced-motion: reduce` (the
 *   text swap + revert timing are unaffected either way).
 * - Full opt-out: set `window.ctCopyStyles = false` BEFORE the first
 *   `flash` call and no styles are injected.
 *
 * This is a shared component inlined by the build (import-inlining; no globals).
 * Edit here and run `npm run build` — every tool picks it up; there is no hash
 * to recompute. Canonical source:
 * html-single-file/assets/components/CtClipboardUtil.mjs
 */


export function copy(text) {
  text = String(text == null ? '' : text);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      function () { return true; },
      function () { return fallbackCopy(text); }
    );
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* unsupported */ }
  document.body.removeChild(ta);
  return ok;
}

var STYLE_ID = 'ctc-copy-style';
function ensureStyles() {
  if (window.ctCopyStyles === false) return; // tool supplies its own CSS
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '@keyframes ctc-flash-pulse{0%{transform:scale(1);}',
    '30%{transform:scale(1.12);}100%{transform:scale(1);}}',
    '.ctc-flash{animation:ctc-flash-pulse 300ms ease;}',
    '@media (prefers-reduced-motion: reduce){.ctc-flash{animation:none;}}'
  ].join('');
  document.head.appendChild(style);
}

var flashTimeouts = new WeakMap();
export function flash(el, opts) {
  opts = opts || {};
  var ms = opts.ms != null ? opts.ms : 1000;
  var label = opts.label != null ? opts.label : '✅';

  ensureStyles();
  clearTimeout(flashTimeouts.get(el));

  var original;
  if (opts.revertTo != null) {
    original = opts.revertTo;
  } else if (el.dataset.ctcFlashOriginal != null) {
    original = el.dataset.ctcFlashOriginal; // already mid-flash; keep true original
  } else {
    original = el.textContent;
  }
  el.dataset.ctcFlashOriginal = original;

  el.textContent = label;
  el.classList.remove('ctc-flash');
  void el.offsetWidth; // restart the CSS animation even on rapid re-clicks
  el.classList.add('ctc-flash');

  var t = setTimeout(function () {
    el.textContent = original;
    el.classList.remove('ctc-flash');
    delete el.dataset.ctcFlashOriginal;
    flashTimeouts.delete(el);
  }, ms);
  flashTimeouts.set(el, t);
}

/** Aggregator (decision #3): statics REFERENCE the named exports above. */
export class CtClipboardUtil {
  static copy = copy;
  static flash = flash;
}
// ===== end CtClipboardUtil =====
