// ===== Begin ctCopy =====
/*
 * ctCopy(text) -> Promise<boolean>
 * ctFlash(el, opts?) -> void
 * ---------------------------------------------------------------------------
 * Tiny, dependency-free copy-to-clipboard helpers for claude-tools. Pasteable,
 * not imported: drop this whole block (sentinels included) inside a <script>
 * tag in a tool's single-file index.html, then:
 *
 *     btn.addEventListener('click', async () => {
 *       if (!text) return;
 *       const ok = await ctCopy(text);
 *       if (!ok) return;
 *       ctFlash(btn, { label: '✅', revertTo: '📋' });
 *     });
 *
 * ctCopy(text):
 * - Tries `navigator.clipboard.writeText` first; falls back to a hidden,
 *   off-screen `<textarea>` + `document.execCommand('copy')` for restricted
 *   or insecure contexts (e.g. `file://`, LAN HTTP) where the async
 *   Clipboard API is unavailable or denied.
 * - Always RESOLVES — never rejects/throws. Resolves `true` on success,
 *   `false` if every copy path failed (denied permission, unsupported
 *   browser, etc.) — callers check the boolean rather than try/catch.
 *
 * ctFlash(el, opts?):
 * - Transient "copied" feedback on a button: swaps `el.textContent` to
 *   `opts.label` (default `'✅'`) for `opts.ms` (default `1000`), then
 *   reverts and clears the timer.
 * - Revert target: `opts.revertTo` if given (for icon-only buttons that
 *   always revert to a fixed glyph, e.g. `'📋'`); otherwise the element's
 *   current text — captured once and reused if `ctFlash` is called again on
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
 *   `ctFlash` call and no styles are injected.
 *
 * This is a shared component inlined by the build.
 * Edit here and run `npm run build` — every tool picks it up; there is no hash
 * to recompute. Canonical source:
 * tools/include/copy.js
 */
(function () {
  if (window.ctCopy && window.ctFlash) return; // idempotent if pasted more than once

  window.ctCopy = function (text) {
    text = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  };

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
  window.ctFlash = function (el, opts) {
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
  };
})();
// ===== end ctCopy =====
