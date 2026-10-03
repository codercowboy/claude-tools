
// ===== Begin CtComponents (ES module) =====
/*
 * CtComponents — the shared UI-wiring helpers (ES module; was 8 helpers on the
 * classic-script util.js global). Dependency-free, SELF-CONTAINED (no import
 * of any other module; showBanner/hideBanner back the banner helpers).
 *
 *     import { wireTabs, wireDropzone, announce } from '<rel>/jbc-include/components/CtComponents.mjs';
 *     // (or `CtComponents.wireTabs` etc. via the aggregator class at the bottom —
 *     //  the statics REFERENCE the named bindings, single implementation.)
 *
 * Bodies are moved VERBATIM from util.js (behavior-preserving + a11y gate); only
 * the access path changed (the old util.js global's X -> named import X).
 *
 * iconButton(label, title, onClick?, opts?):
 * - A `<button type=button class="icon-btn">` with `label` text, `title` +
 *   matching `aria-label`, and an optional click handler. `opts.className`
 *   overrides the class.
 *
 * wireSegmented(group, onChange, opts?):
 * - Turns a container of buttons into an accessible single-select segmented
 *   control. Click or Arrow-key selects; the chosen button gets
 *   aria-pressed="true" (roving tabindex), others "false", then
 *   `onChange(value, button)` fires. A button's value is its `data-value`, else
 *   `.value`, else trimmed text. `opts.attr` ("aria-checked"), `opts.selector`.
 *   Returns `{ select(value), buttons }`; call `select(initial)` once to set the
 *   starting state.
 *
 * wireTabs(tablist, onChange, opts?):
 * - Turns a role="tablist" container of role="tab" buttons into an accessible
 *   tabs widget — the tablist analogue of wireSegmented (aria-selected +
 *   role=tabpanel show/hide, not aria-pressed). Click or Arrow/Home/End selects:
 *   the chosen tab gets aria-selected="true" + roving tabindex="0" (others
 *   "false"/"-1"), the panel named by its `aria-controls` is shown and the
 *   siblings' panels hidden, then `onChange(value, tab)` fires. A tab's value is
 *   its `data-mode`, else `data-value`, else `id`, else trimmed text. Tabs that
 *   all point one `aria-controls` at a SINGLE panel (e.g. a language switcher over
 *   one editor) keep that shared panel shown; a tab with no `aria-controls`
 *   toggles no panel (a panel-less selector styled as tabs). `opts.selector`
 *   (default '[role="tab"]'), `opts.attr` (default "aria-selected"),
 *   `opts.vertical` (ArrowUp/Down instead of ArrowLeft/Right). Returns
 *   `{ select(value), tabs }`; call `select(initial)` once to set the starting
 *   state.
 *
 * wireDropzone(zone, onFiles, opts?):
 * - Wires drag-and-drop file input: toggles `opts.dragClass` (default
 *   "ct-drag-over") during a drag and calls `onFiles(dataTransfer.files)` on
 *   drop. Pairs with the `.ct-dropzone` CSS in widgets.css.
 *
 * showError(el, msg?) / showWarning(el, msg?):   (impl: showBanner)
 * - Banner toggle: set `el.textContent` (when `msg` given) and reveal by
 *   clearing `[hidden]`. show/hideWarning are the same operation on a separate
 *   element. Pairs with the `.ct-error` / `.ct-warning` CSS in widgets.css.
 *
 * hideError(el) / hideWarning(el):   (impl: hideBanner)
 * - Hide a banner: sets `el.hidden = true` (no-op for a falsy `el`).
 *
 * showBanner(el, msg?) / hideBanner(el): the shared implementations behind the four above.
 * (Moved here from util.js in R12 — the banner trio is no longer on the util.js global.)
 *
 * announce(msg, opts?):
 * - Writes `msg` to a lazily-created, visually-hidden aria-live region (one per
 *   page) so screen readers announce dynamic results. `opts.assertive` uses
 *   aria-live="assertive". Re-announces even identical consecutive messages.
 *
 * wireCopyButtons(root?, opts?):
 * - Delegated copy wiring on top of the injected `opts.copy` / `opts.flash`
 *   (CtClipboardUtil's `copy`/`flash` — callers pass them in:
 *   `wireCopyButtons(document, { copy, flash })`). One listener on
 *   `root` (default document) handles clicks on `opts.selector` (default
 *   ".ct-copy-btn") that carry `opts.targetAttr` (default "data-copy-target"),
 *   resolving the target by `[data-testid]` then `id`, copying its value/text,
 *   and flashing the button. No-ops if `opts.copy` is absent.
 *   `opts.skipWhen(text, target, btn)`: an optional predicate consulted AFTER the
 *   target's text is read and BEFORE the truly-empty (`!text`) guard; when it
 *   returns truthy the click is ignored (no copy, no flash). This lets a tool
 *   route an "empty sentinel" through the shared wiring: escaper shows a "—" in
 *   an `<output>` that means "nothing to copy" (`skipWhen: t => t === '—'`), and
 *   jwt-decoder carries a `data-empty` flag while the value is non-empty
 *   (`skipWhen: (t, el) => el.getAttribute('data-empty') === 'true'`). Absent (the
 *   default) the behavior is unchanged. `opts.flashLabel` (default "✅") and
 *   `opts.revertTo` set the flash.
 *
 * wireEditableCopy(input, btn):
 * - Reveals an in-field copy `btn` only while `input` has a value (CSS can't
 *   read a value); toggles `btn.hidden` on input and once immediately.
 *
 * This is a shared component inlined by the build (import-inlining; no globals).
 * Edit the canonical copy, re-vendor, run `npm run build`. Canonical source:
 * html-single-file/assets/components/CtComponents.mjs
 */

// ---- iconButton / wireSegmented / wireTabs / wireDropzone ----
export function iconButton(label, title, onClick, opts) {
  opts = opts || {};
  var b = document.createElement('button');
  b.type = 'button';
  b.className = opts.className || 'icon-btn';
  if (label != null) b.textContent = label;
  if (title != null) { b.title = title; b.setAttribute('aria-label', title); }
  if (typeof onClick === 'function') b.addEventListener('click', onClick);
  return b;
}

export function wireSegmented(group, onChange, opts) {
  opts = opts || {};
  var attr = opts.attr || 'aria-pressed';
  var buttons = Array.prototype.slice.call(group.querySelectorAll(opts.selector || 'button'));
  function valueOf(btn) {
    var dv = btn.getAttribute('data-value');
    if (dv != null) return dv;
    if (btn.value != null && btn.value !== '') return btn.value;
    return (btn.textContent || '').trim();
  }
  function select(value, fire) {
    var chosen = null;
    for (var i = 0; i < buttons.length; i++) {
      var on = valueOf(buttons[i]) === value;
      buttons[i].setAttribute(attr, on ? 'true' : 'false');
      buttons[i].tabIndex = on ? 0 : -1;
      if (on) chosen = buttons[i];
    }
    if (fire !== false && typeof onChange === 'function') onChange(value, chosen);
  }
  buttons.forEach(function (btn, idx) {
    btn.addEventListener('click', function () { select(valueOf(btn)); });
    btn.addEventListener('keydown', function (e) {
      var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
        : ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0);
      if (!dir) return;
      e.preventDefault();
      var next = buttons[(idx + dir + buttons.length) % buttons.length];
      next.focus();
      select(valueOf(next));
    });
  });
  return { select: function (v) { select(v); }, buttons: buttons };
}

export function wireTabs(tablist, onChange, opts) {
  opts = opts || {};
  var selAttr = opts.attr || 'aria-selected';
  var vertical = !!opts.vertical;
  var tabs = Array.prototype.slice.call(tablist.querySelectorAll(opts.selector || '[role="tab"]'));
  function valueOf(tab) {
    var dm = tab.getAttribute('data-mode');
    if (dm != null) return dm;
    var dv = tab.getAttribute('data-value');
    if (dv != null) return dv;
    if (tab.id) return tab.id;
    return (tab.textContent || '').trim();
  }
  function panelFor(tab) {
    var id = tab.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }
  function applyPanels(chosen) {
    var chosenPanel = chosen ? panelFor(chosen) : null;
    // Hide every panel a non-chosen tab controls, EXCEPT the chosen panel — so a
    // tablist whose tabs all drive one shared panel never hides it, and a tab
    // with no aria-controls simply toggles nothing.
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] === chosen) continue;
      var p = panelFor(tabs[i]);
      if (p && p !== chosenPanel) p.hidden = true;
    }
    if (chosenPanel) chosenPanel.hidden = false;
  }
  function select(value, fire) {
    var chosen = null;
    for (var i = 0; i < tabs.length; i++) {
      var on = valueOf(tabs[i]) === value;
      tabs[i].setAttribute(selAttr, on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      if (on) chosen = tabs[i];
    }
    applyPanels(chosen);
    if (fire !== false && typeof onChange === 'function') onChange(value, chosen);
  }
  tabs.forEach(function (tab, idx) {
    tab.addEventListener('click', function () { select(valueOf(tab)); });
    tab.addEventListener('keydown', function (e) {
      var fwd = vertical ? 'ArrowDown' : 'ArrowRight';
      var back = vertical ? 'ArrowUp' : 'ArrowLeft';
      var next = -1;
      if (e.key === fwd) next = (idx + 1) % tabs.length;
      else if (e.key === back) next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      else return;
      e.preventDefault();
      var nt = tabs[next];
      nt.focus();
      select(valueOf(nt));
    });
  });
  return { select: function (v) { select(v); }, tabs: tabs };
}

export function wireDropzone(zone, onFiles, opts) {
  opts = opts || {};
  var dragClass = opts.dragClass || 'ct-drag-over';
  ['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add(dragClass); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove(dragClass); });
  });
  zone.addEventListener('drop', function (e) {
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length && typeof onFiles === 'function') onFiles(dt.files);
  });
}

// ---- banners: showError / showWarning / hideError / hideWarning (+ showBanner / hideBanner) ----
export function showBanner(elm, msg) {
  if (!elm) return;
  if (msg != null) elm.textContent = msg;
  elm.hidden = false;
}
export function hideBanner(elm) { if (elm) elm.hidden = true; }
export const showError = showBanner;
export const showWarning = showBanner;
export const hideError = hideBanner;
export const hideWarning = hideBanner;

// ---- announce (aria-live) ----
var liveRegion = null;
export function announce(msg, opts) {
  opts = opts || {};
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', opts.assertive ? 'assertive' : 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    var s = liveRegion.style;
    s.position = 'absolute'; s.width = '1px'; s.height = '1px'; s.margin = '-1px';
    s.padding = '0'; s.border = '0'; s.overflow = 'hidden';
    s.clip = 'rect(0 0 0 0)'; s.clipPath = 'inset(50%)'; s.whiteSpace = 'nowrap';
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  var r = liveRegion;
  setTimeout(function () { r.textContent = String(msg == null ? '' : msg); }, 30);
}

// ---- wireCopyButtons / wireEditableCopy ----
export function wireCopyButtons(root, opts) {
  root = root || document;
  opts = opts || {};
  var selector = opts.selector || '.ct-copy-btn';
  var targetAttr = opts.targetAttr || 'data-copy-target';
  var skipWhen = (typeof opts.skipWhen === 'function') ? opts.skipWhen : null;
  root.addEventListener('click', function (e) {
    var btn = (e.target && e.target.closest) ? e.target.closest(selector) : null;
    if (!btn || (root.contains && !root.contains(btn))) return;
    var id = btn.getAttribute(targetAttr);
    if (!id) return;
    var target = document.querySelector('[data-testid="' + id + '"]') || document.getElementById(id);
    if (!target) return;
    var text = (target.value != null) ? target.value : target.textContent;
    if (skipWhen && skipWhen(text, target, btn)) return;
    if (!text) return;
    if (typeof opts.copy !== 'function') return;
    Promise.resolve(opts.copy(text)).then(function (ok) {
      if (ok && typeof opts.flash === 'function') {
        opts.flash(btn, { label: opts.flashLabel || '✅', revertTo: opts.revertTo });
      }
    });
  });
}

export function wireEditableCopy(input, btn) {
  if (!input || !btn) return;
  function refresh() { btn.hidden = !(input.value && input.value.length); }
  input.addEventListener('input', refresh);
  refresh();
}

/** Aggregator (decision #3): statics REFERENCE the named exports above. */
export class CtComponents {
  static iconButton = iconButton;
  static wireSegmented = wireSegmented;
  static wireTabs = wireTabs;
  static wireDropzone = wireDropzone;
  static showError = showBanner;
  static showWarning = showBanner;
  static hideError = hideBanner;
  static hideWarning = hideBanner;
  static showBanner = showBanner;
  static hideBanner = hideBanner;
  static announce = announce;
  static wireCopyButtons = wireCopyButtons;
  static wireEditableCopy = wireEditableCopy;
}
// ===== end CtComponents =====
