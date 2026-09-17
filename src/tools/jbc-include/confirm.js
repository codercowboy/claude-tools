// ===== Begin ctConfirm =====
/*
 * ctConfirm(message?) -> Promise<boolean>
 * ---------------------------------------------------------------------------
 * A tiny, dependency-free confirm dialog for claude-tools. Pasteable, not
 * imported: drop this whole block (sentinels included) inside a <script> tag
 * in a tool's single-file index.html, then:
 *
 *     if (await ctConfirm('Remove this color?')) { ...do it... }
 *
 * - Returns a Promise<boolean>: true = confirmed, false = cancelled.
 * - message is optional; null/empty/whitespace becomes "Are you sure?".
 * - "Yes" is the highlighted default: Enter confirms. Esc / "Cancel" /
 *   backdrop-click cancel. Focus is trapped and returned to the caller's
 *   element on close. role="dialog", aria-modal, labelled by the message.
 *
 * STYLING — the component adapts to each tool's look:
 * - It injects only structural CSS; every VISUAL choice reads from a CSS
 *   variable with a theme-aware system-color fallback, so it looks right with
 *   no theming AND matches your tool if you set a few variables anywhere in
 *   scope (e.g. your :root / body theme block):
 *     --ctc-accent, --ctc-accent-fg   (the "Yes" button)
 *     --ctc-bg, --ctc-fg              (dialog surface + text)
 *     --ctc-backdrop                  (overlay behind the dialog)
 *     --ctc-radius, --ctc-btn-radius  (corner rounding)
 *     --ctc-shadow, --ctc-font        (dialog shadow + font)
 *     --ctc-cancel-border, --ctc-focus, --ctc-max-width
 * - Full opt-out: set `window.ctConfirmStyles = false` BEFORE the first call
 *   and NO styles are injected — your tool then supplies all `.ctc-*` CSS
 *   (.ctc-overlay/.ctc-dialog/.ctc-message/.ctc-buttons/.ctc-btn/
 *   .ctc-btn--cancel/.ctc-btn--yes).
 *
 * This is a shared component inlined by the build.
 * Edit here and run `npm run build` — every tool picks it up; there is no hash
 * to recompute. Canonical source:
 * tools/include/confirm.js
 */
(function () {
  if (window.ctConfirm) return; // idempotent if pasted more than once

  var STYLE_ID = 'ctc-style';
  function ensureStyles() {
    if (window.ctConfirmStyles === false) return; // tool supplies its own CSS
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ctc-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;',
      'align-items:center;justify-content:center;padding:1rem;',
      'color-scheme:light dark;background:var(--ctc-backdrop,rgba(0,0,0,0.5));}',
      '.ctc-dialog{box-sizing:border-box;width:100%;',
      'max-width:var(--ctc-max-width,22rem);padding:1.25rem 1.25rem 1rem;',
      'background:var(--ctc-bg,Canvas);color:var(--ctc-fg,CanvasText);',
      'border-radius:var(--ctc-radius,12px);',
      'box-shadow:var(--ctc-shadow,0 10px 40px rgba(0,0,0,0.3));',
      'font-family:var(--ctc-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);}',
      '.ctc-message{margin:0 0 1.1rem;font-size:1rem;line-height:1.45;}',
      '.ctc-buttons{display:flex;justify-content:flex-end;gap:0.6rem;}',
      '.ctc-btn{box-sizing:border-box;min-height:44px;padding:0.5rem 1.1rem;',
      'border-radius:var(--ctc-btn-radius,8px);font:inherit;font-weight:600;',
      'cursor:pointer;border:1px solid transparent;}',
      '.ctc-btn:focus-visible{outline:2px solid var(--ctc-focus,AccentColor);',
      'outline-offset:2px;}',
      '.ctc-btn--cancel{background:transparent;color:inherit;',
      'border-color:var(--ctc-cancel-border,rgba(128,128,128,0.5));}',
      '.ctc-btn--cancel:hover{background:rgba(128,128,128,0.15);}',
      '.ctc-btn--yes{background:var(--ctc-accent,AccentColor);',
      'color:var(--ctc-accent-fg,AccentColorText);}',
      '.ctc-btn--yes:hover{filter:brightness(1.08);}'
    ].join('');
    document.head.appendChild(style);
  }

  window.ctConfirm = function (message) {
    ensureStyles();
    var text = (message == null || String(message).trim() === '')
      ? 'Are you sure?' : String(message);

    return new Promise(function (resolve) {
      var previouslyFocused = document.activeElement;

      var overlay = document.createElement('div');
      overlay.className = 'ctc-overlay';

      var dialog = document.createElement('div');
      dialog.className = 'ctc-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      var msgEl = document.createElement('p');
      msgEl.className = 'ctc-message';
      msgEl.textContent = text;
      var msgId = 'ctc-msg-' + Math.random().toString(36).slice(2);
      msgEl.id = msgId;
      dialog.setAttribute('aria-labelledby', msgId);

      var buttons = document.createElement('div');
      buttons.className = 'ctc-buttons';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ctc-btn ctc-btn--cancel';
      cancelBtn.textContent = 'Cancel';

      var yesBtn = document.createElement('button');
      yesBtn.type = 'button';
      yesBtn.className = 'ctc-btn ctc-btn--yes';
      yesBtn.textContent = 'Yes';

      buttons.appendChild(cancelBtn);
      buttons.appendChild(yesBtn);
      dialog.appendChild(msgEl);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      var done = false;
      function close(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKeydown, true);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
        }
        resolve(result);
      }

      function onKeydown(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        } else if (e.key === 'Tab') {
          // trap focus between the two buttons
          e.preventDefault();
          var order = [cancelBtn, yesBtn];
          var idx = order.indexOf(document.activeElement);
          var next = e.shiftKey ? idx - 1 : idx + 1;
          if (next < 0) next = order.length - 1;
          if (next >= order.length) next = 0;
          order[next].focus();
        }
      }

      document.addEventListener('keydown', onKeydown, true);
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) close(false);
      });
      cancelBtn.addEventListener('click', function () { close(false); });
      yesBtn.addEventListener('click', function () { close(true); });

      yesBtn.focus(); // "Yes" is the default
    });
  };
})();
// ===== end ctConfirm =====
