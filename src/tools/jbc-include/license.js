/* ct-license — shared License modal.
   Inlined on EVERY page via footer.html (the ct:include license.js token wrapped
   in a script tag), so any tool that carries the footer gets it
   for free. Opens on a click of any [data-ct-license] trigger (the footer link) or
   via `window.ctLicense()`. Shows the project's MIT license, plus any bundled
   third-party libraries a tool declares by setting
   `window.ctThirdParty = [{ name, version, license, url }]` before the modal is
   opened (only audio-converter does today). Accessible modal (role=dialog,
   aria-modal, focus trap, Esc/backdrop close, focus return), reduced-motion
   aware, and fullscreen-safe (re-parents into document.fullscreenElement while
   fullscreen so it shows over fullscreen content). Palette-agnostic via CSS system
   colors so it tracks the page's light/dark. */
(function () {
  if (window.__ctLicenseInit) return; // idempotent
  window.__ctLicenseInit = true;

  var REPO = 'https://github.com/codercowboy/claude-tools';
  var MIT = [
    'MIT License',
    '',
    'Copyright (c) 2026 Jason and Claude (Anthropic)',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy',
    'of this software and associated documentation files (the "Software"), to deal',
    'in the Software without restriction, including without limitation the rights',
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
    'copies of the Software, and to permit persons to whom the Software is',
    'furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all',
    'copies or substantial portions of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
    'SOFTWARE.'
  ].join('\n');

  var overlay, dialog, prevFocus, styleEl;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent =
      '.ctl-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.5);}' +
      '.ctl-overlay[hidden]{display:none!important;}' +
      '@media (prefers-reduced-motion:no-preference){.ctl-overlay{animation:ctl-fade .15s ease;}@keyframes ctl-fade{from{opacity:0}to{opacity:1}}}' +
      '.ctl-dialog{position:relative;box-sizing:border-box;width:100%;max-width:40rem;max-height:min(85vh,680px);overflow-y:auto;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:1.25rem 3rem 1.25rem 1.4rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.9rem;line-height:1.5;color-scheme:light dark;}' +
      '.ctl-dialog h2{margin:0 0 .6rem;font-size:1.2rem;}' +
      '.ctl-dialog h3{margin:1rem 0 .4rem;font-size:1rem;}' +
      '.ctl-dialog a{color:LinkText;}' +
      '.ctl-lead{margin:0 0 .8rem;}' +
      '.ctl-text{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;line-height:1.45;background:color-mix(in srgb,CanvasText 6%,Canvas);border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:8px;padding:.7rem .8rem;overflow-x:auto;margin:0;}' +
      '.ctl-tp{margin:.2rem 0 .6rem;padding-left:1.2rem;}.ctl-tp li{margin-bottom:.3rem;}' +
      '.ctl-note{margin:.6rem 0 0;opacity:.75;font-size:.82rem;}' +
      '.ctl-close{position:absolute;top:.5rem;right:.5rem;width:40px;height:40px;min-height:0;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;font-size:1.6rem;line-height:1;cursor:pointer;}' +
      '.ctl-close:hover{background:rgba(127,127,127,.18);}' +
      '.ctl-close:focus-visible{outline:2px solid Highlight;outline-offset:2px;}';
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function build() {
    injectStyles();
    overlay = document.createElement('div');
    overlay.className = 'ctl-overlay';
    overlay.hidden = true;
    overlay.setAttribute('data-testid', 'license-overlay');
    overlay.innerHTML =
      '<div class="ctl-dialog" role="dialog" aria-modal="true" aria-labelledby="ctl-title" data-testid="license-modal">' +
        '<button type="button" class="ctl-close" data-testid="license-close-x" aria-label="Close" title="Close">&times;</button>' +
        '<h2 id="ctl-title">License</h2>' +
        '<div class="ctl-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    dialog = overlay.querySelector('.ctl-dialog');
    overlay.querySelector('.ctl-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) { e.preventDefault(); close(); }
    });
  }

  function renderBody() {
    var html =
      '<p class="ctl-lead">This project (<strong>claude-tools</strong>) is released under the <strong>MIT License</strong>. ' +
      '<a href="' + REPO + '" target="_blank" rel="noopener noreferrer">github.com/codercowboy/claude-tools</a></p>' +
      '<pre class="ctl-text">' + esc(MIT) + '</pre>';
    var tp = Array.isArray(window.ctThirdParty) ? window.ctThirdParty : [];
    if (tp.length) {
      html += '<h3>Bundled third-party libraries</h3><ul class="ctl-tp">';
      tp.forEach(function (d) {
        var label = esc(d.name || '') + (d.version ? ' ' + esc(d.version) : '');
        var lic = d.license ? ' &mdash; ' + esc(d.license) : '';
        var link = d.url ? ' &middot; <a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">source</a>' : '';
        html += '<li>' + label + lic + link + '</li>';
      });
      html += '</ul><p class="ctl-note">Full third-party license texts are in the repository’s NOTICES file.</p>';
    } else {
      html += '<p class="ctl-note">No third-party libraries — this tool is 100% vanilla, with no runtime dependencies.</p>';
    }
    overlay.querySelector('.ctl-body').innerHTML = html;
  }

  function focusables() {
    return Array.prototype.slice
      .call(dialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
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
    if (!overlay) build();
    renderBody();
    prevFocus = document.activeElement;
    // Fullscreen-safe: the browser only renders the fullscreen element's subtree.
    var host = document.fullscreenElement || document.body;
    if (overlay.parentNode !== host) host.appendChild(overlay);
    overlay.hidden = false;
    document.addEventListener('keydown', onKey, true);
    dialog.scrollTop = 0;
    overlay.querySelector('.ctl-close').focus({ preventScroll: true });
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
    if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (e) {} }
    prevFocus = null;
  }

  window.ctLicense = open;

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-ct-license]');
    if (t) { e.preventDefault(); open(); }
  });
})();
