// ===== Begin CtModal (ES module) =====
/*
 * createModal({ title?, body?, onClose? }) -> { open, close, root }   (ES module; was jbcModal / modal.js)
 * ---------------------------------------------------------------------------
 * The shared accessible content-modal primitive for single-file tools — the
 * one place the Help / Options / About / License dialog contract is
 * implemented.
 *
 *     import { createModal } from '<rel>/jbc-include/components/CtModal.mjs';
 *     // (or `CtModal.create` via the aggregator class at the bottom — the
 *     //  static REFERENCES the named binding, single implementation.)
 *
 *     var help = createModal({
 *       title: 'How this works',
 *       body: '<p>Paste some text and hit Convert…</p>'  // string OR a Node
 *     });
 *     helpButton.addEventListener('click', help.open);
 *
 * Each call BUILDS one modal and returns a small handle:
 *   - open()   show it (records the trigger, moves focus inside)
 *   - close()  hide it (restores focus to the trigger, runs onClose)
 *   - root     the overlay element; `root.querySelector('.jbcm-body')` is the
 *              content container if you want to swap `body` between opens.
 *
 * Options:
 *   - title    heading text; renders an <h2> and wires `aria-labelledby`.
 *              Omit it and the dialog is labelled `aria-label="Dialog"`.
 *   - titleId  explicit id for that <h2> (and the `aria-labelledby` it wires).
 *              Default: a random id. Pass a stable one when a test or another
 *              element references it (e.g. `titleId: 'help-title'`).
 *   - body     string (assigned as innerHTML) OR a DOM Node (appended). Omit
 *              to start empty and fill `.jbcm-body` yourself.
 *   - onClose  called (no args) after each close — handy for a "seen" flag.
 *   - testid   `data-testid` prefix for stable test hooks: the overlay gets
 *              `${testid}-overlay`, the dialog `${testid}-modal` (default:
 *              `jbcm-overlay` / `jbcm-dialog`). The ✕ is always `modal-close-x`.
 *   - autoOpen the FIRST-LOAD variant: a once-flag handle `{ seen(), mark() }`
 *              (e.g. `CtUtil's onceFlag(KEY)`). On a genuinely fresh visit
 *              (`seen()` false) the modal auto-opens and marks the flag, so it
 *              shows exactly once and never again — the first-load Help popup.
 *              Injected (not a hard CtUtil dependency) so this stays standalone.
 *
 * THE CONTRACT (implemented here once, for every tool):
 *   - role="dialog", aria-modal="true", labelled by the title.
 *   - A persistent close ✕ pinned to the dialog's top-right corner — always
 *     reachable even when the content scrolls; it is the sole dedicated close
 *     affordance (no redundant bottom "Close").
 *   - Initial focus moves to the ✕; a focus trap cycles Tab / Shift+Tab over
 *     the ✕ plus any content controls and wraps at both ends.
 *   - Esc and backdrop-click close; focus returns to the triggering element.
 *   - Scrolls to the top on open; reduced-motion aware (no fade when the
 *     visitor asked for less motion).
 *   - Fullscreen-safe: the browser only paints the fullscreen element's own
 *     subtree, so on open the overlay is re-parented into
 *     document.fullscreenElement (and restored to <body> on close) — the modal
 *     shows and stays interactive over fullscreen content.
 *
 * STYLING — the component adapts to each tool's look:
 * - It injects only structural CSS; every VISUAL choice reads from a CSS
 *   variable with a theme-aware system-color fallback, so it looks right with
 *   no theming AND matches your tool if you set a few variables anywhere in
 *   scope (e.g. your :root / body theme block):
 *     --jbcm-bg, --jbcm-fg              (dialog surface + text)
 *     --jbcm-backdrop                  (overlay behind the dialog)
 *     --jbcm-border, --jbcm-shadow      (dialog border + shadow)
 *     --jbcm-radius                    (corner rounding)
 *     --jbcm-font, --jbcm-max-width     (dialog font + width cap)
 *     --jbcm-focus                     (focus ring)
 * - Full opt-out: set `window.ctModalStyles = false` BEFORE the first call
 *   and NO styles are injected — your tool then supplies all `.jbcm-*` CSS
 *   (.jbcm-overlay/.jbcm-dialog/.jbcm-close/.jbcm-title/.jbcm-body).
 *
 * Formerly the pasteable IIFE modal.js exposing the old `jbcModal` window global;
 * that global is GONE — `createModal` = ex-jbcModal, body unchanged. The CSS
 * still self-injects on the first createModal() call (ensureModalStyles) and the
 * `window.ctModalStyles = false` opt-out is still honored.
 *
 * This is a shared component inlined by the build (import-inlining; no globals).
 * Edit here and run `npm run build` — every tool picks it up; there is no hash
 * to recompute. Canonical source:
 * html-single-file/assets/components/CtModal.mjs
 */

var MODAL_STYLE_ID = 'jbcm-style';
function ensureModalStyles() {
  if (window.ctModalStyles === false) return; // tool supplies its own CSS
  if (document.getElementById(MODAL_STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = MODAL_STYLE_ID;
  style.textContent = [
    '.jbcm-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;',
    'align-items:center;justify-content:center;padding:1rem;color-scheme:light dark;',
    'background:var(--jbcm-backdrop,rgba(0,0,0,0.5));}',
    '.jbcm-overlay[hidden]{display:none!important;}',
    '@media (prefers-reduced-motion:no-preference){',
    '.jbcm-overlay{animation:jbcm-fade .15s ease;}',
    '@keyframes jbcm-fade{from{opacity:0}to{opacity:1}}}',
    '.jbcm-dialog{position:relative;box-sizing:border-box;width:100%;',
    'max-width:var(--jbcm-max-width,40rem);max-height:min(85vh,680px);overflow-y:auto;',
    'background:var(--jbcm-bg,Canvas);color:var(--jbcm-fg,CanvasText);',
    'border:1px solid var(--jbcm-border,GrayText);',
    'border-radius:var(--jbcm-radius,12px);',
    'box-shadow:var(--jbcm-shadow,0 12px 32px rgba(0,0,0,0.35));',
    'padding:1.25rem 3rem 1.25rem 1.4rem;',
    'font-family:var(--jbcm-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);',
    'font-size:.9rem;line-height:1.5;}',
    '.jbcm-title{margin:0 0 .7rem;font-size:1.2rem;line-height:1.25;}',
    '.jbcm-body{margin:0;}',
    '.jbcm-close{position:absolute;top:.5rem;right:.5rem;width:40px;height:40px;',
    'min-height:0;display:flex;align-items:center;justify-content:center;padding:0;',
    'border:0;border-radius:8px;background:transparent;color:inherit;',
    'font-size:1.6rem;line-height:1;cursor:pointer;}',
    '.jbcm-close:hover{background:rgba(127,127,127,0.18);}',
    '.jbcm-close:focus-visible{outline:2px solid var(--jbcm-focus,Highlight);',
    'outline-offset:2px;}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);
}

export function createModal(opts) {
  opts = opts || {};
  ensureModalStyles();

  var prevFocus = null;
  var titleId = (opts.titleId != null && String(opts.titleId) !== '')
    ? String(opts.titleId)
    : 'jbcm-title-' + Math.random().toString(36).slice(2);
  var tidPrefix = (opts.testid != null && String(opts.testid) !== '') ? String(opts.testid) : null;

  var overlay = document.createElement('div');
  overlay.className = 'jbcm-overlay';
  overlay.hidden = true;
  overlay.setAttribute('data-testid', tidPrefix ? tidPrefix + '-overlay' : 'jbcm-overlay');

  var dialog = document.createElement('div');
  dialog.className = 'jbcm-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('data-testid', tidPrefix ? tidPrefix + '-modal' : 'jbcm-dialog');

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'jbcm-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('title', 'Close');
  closeBtn.setAttribute('data-testid', 'modal-close-x');
  closeBtn.innerHTML = '&times;';
  dialog.appendChild(closeBtn);

  if (opts.title != null && String(opts.title) !== '') {
    var titleEl = document.createElement('h2');
    titleEl.className = 'jbcm-title';
    titleEl.id = titleId;
    titleEl.textContent = String(opts.title);
    dialog.appendChild(titleEl);
    dialog.setAttribute('aria-labelledby', titleId);
  } else {
    dialog.setAttribute('aria-label', 'Dialog');
  }

  var bodyEl = document.createElement('div');
  bodyEl.className = 'jbcm-body';
  if (opts.body != null) {
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body.nodeType) bodyEl.appendChild(opts.body);
  }
  dialog.appendChild(bodyEl);

  overlay.appendChild(dialog);
  // Present-but-hidden from construction (not lazily on first open): the
  // overlay is queryable immediately and its `[hidden]` collapses it to
  // display:none, matching the semantics of a statically-authored modal.
  if (document.body) document.body.appendChild(overlay);

  function focusables() {
    return Array.prototype.slice
      .call(dialog.querySelectorAll(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return !el.disabled && el.getClientRects().length > 0; });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) return;
    e.preventDefault();
    var i = f.indexOf(document.activeElement);
    var n = e.shiftKey ? i - 1 : i + 1;
    if (n < 0) n = f.length - 1;
    if (n >= f.length) n = 0;
    f[n].focus();
  }

  function open() {
    if (!overlay.parentNode) document.body.appendChild(overlay);
    prevFocus = document.activeElement;
    // Fullscreen-safe: the browser only renders the fullscreen element's subtree.
    var host = document.fullscreenElement || document.body;
    if (overlay.parentNode !== host) host.appendChild(overlay);
    overlay.hidden = false;
    document.addEventListener('keydown', onKey, true);
    dialog.scrollTop = 0;
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus(); } catch (e) { /* ignore */ }
    }
    prevFocus = null;
    if (typeof opts.onClose === 'function') opts.onClose();
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) { e.preventDefault(); close(); }
  });

  // First-load variant: auto-open ONCE, gated by an injected once-flag handle
  // (e.g. CtUtil's onceFlag(KEY)). Mark seen BEFORE opening so it stays a true
  // "once" even if the visitor navigates away without closing — never again.
  var once = opts.autoOpen;
  if (once && typeof once.seen === 'function' && !once.seen()) {
    if (typeof once.mark === 'function') once.mark();
    open();
  }

  return { open: open, close: close, root: overlay };
}

/** Aggregator (decision #3): static REFERENCES the named export above. */
export class CtModal {
  static create = createModal;
}
// ===== end CtModal =====
