/* CtLicense — shared License modal (components/CtLicense.mjs).
   An ES module with a SIDE-EFFECT: importing it wires a global click listener
   (once) that opens the modal on any [data-ct-license] trigger (the footer link in
   components/footer.html). Every tool that carries the footer imports this module in its
   app.mjs, so the footer link works for free; the footer no longer inlines a script.
   Also callable as `openLicense()` / `CtLicense.open()` (there is no window global
   any more). Shows the project's MIT license, plus any bundled
   third-party libraries a tool declares by setting
   `window.ctThirdParty = [{ name, version, license, url }]` before the modal is
   opened (e.g. a tool that bundles a wasm codec — a per-tool DATA config hook, read at
   open time). Accessible modal (role=dialog,
   aria-modal, focus trap, Esc/backdrop close, focus return), reduced-motion
   aware, and fullscreen-safe (re-parents into document.fullscreenElement while
   fullscreen so it shows over fullscreen content). Palette-agnostic via CSS system
   colors so it tracks the page's light/dark. Module-private names carry a "License"
   qualifier so the build's import-flattening cannot collide with app.mjs top-levels. */
var LICENSE_REPO = '{{project.repo}}';
var LICENSE_REPO_LABEL = LICENSE_REPO.replace(/^https?:\/\//, '');
var LICENSE_MIT_TEXT = [
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

var licenseOverlay, licenseDialog, licensePrevFocus, licenseStyleEl;

function escapeLicenseHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function injectLicenseStyles() {
  if (licenseStyleEl) return;
  licenseStyleEl = document.createElement('style');
  licenseStyleEl.textContent =
    '.jbcl-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.5);}' +
    '.jbcl-overlay[hidden]{display:none!important;}' +
    '@media (prefers-reduced-motion:no-preference){.jbcl-overlay{animation:jbcl-fade .15s ease;}@keyframes jbcl-fade{from{opacity:0}to{opacity:1}}}' +
    '.jbcl-dialog{position:relative;box-sizing:border-box;width:100%;max-width:40rem;max-height:min(85vh,680px);overflow-y:auto;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:1.25rem 3rem 1.25rem 1.4rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.9rem;line-height:1.5;color-scheme:light dark;}' +
    '.jbcl-dialog h2{margin:0 0 .6rem;font-size:1.2rem;}' +
    '.jbcl-dialog h3{margin:1rem 0 .4rem;font-size:1rem;}' +
    '.jbcl-dialog a{color:LinkText;}' +
    '.jbcl-lead{margin:0 0 .8rem;}' +
    '.jbcl-text{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;line-height:1.45;background:color-mix(in srgb,CanvasText 6%,Canvas);border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:8px;padding:.7rem .8rem;overflow-x:auto;margin:0;}' +
    '.jbcl-tp{margin:.2rem 0 .6rem;padding-left:1.2rem;}.jbcl-tp li{margin-bottom:.3rem;}' +
    '.jbcl-note{margin:.6rem 0 0;opacity:.75;font-size:.82rem;}' +
    '.jbcl-close{position:absolute;top:.5rem;right:.5rem;width:40px;height:40px;min-height:0;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;font-size:1.6rem;line-height:1;cursor:pointer;}' +
    '.jbcl-close:hover{background:rgba(127,127,127,.18);}' +
    '.jbcl-close:focus-visible{outline:2px solid Highlight;outline-offset:2px;}';
  (document.head || document.documentElement).appendChild(licenseStyleEl);
}

function buildLicenseDialog() {
  injectLicenseStyles();
  licenseOverlay = document.createElement('div');
  licenseOverlay.className = 'jbcl-overlay';
  licenseOverlay.hidden = true;
  licenseOverlay.setAttribute('data-testid', 'license-overlay');
  licenseOverlay.innerHTML =
    '<div class="jbcl-dialog" role="dialog" aria-modal="true" aria-labelledby="jbcl-title" data-testid="license-modal">' +
      '<button type="button" class="jbcl-close" data-testid="license-close-x" aria-label="Close" title="Close">&times;</button>' +
      '<h2 id="jbcl-title">License</h2>' +
      '<div class="jbcl-body"></div>' +
    '</div>';
  document.body.appendChild(licenseOverlay);
  licenseDialog = licenseOverlay.querySelector('.jbcl-dialog');
  licenseOverlay.querySelector('.jbcl-close').addEventListener('click', closeLicense);
  licenseOverlay.addEventListener('mousedown', function (e) {
    if (e.target === licenseOverlay) { e.preventDefault(); closeLicense(); }
  });
}

function renderLicenseBody() {
  var html =
    '<p class="jbcl-lead">This project (<strong>{{project.name}}</strong>) is released under the <strong>MIT License</strong>. ' +
    '<a href="' + LICENSE_REPO + '" target="_blank" rel="noopener noreferrer">' + LICENSE_REPO_LABEL + '</a></p>' +
    '<pre class="jbcl-text">' + escapeLicenseHtml(LICENSE_MIT_TEXT) + '</pre>';
  var tp = Array.isArray(window.ctThirdParty) ? window.ctThirdParty : [];
  if (tp.length) {
    html += '<h3>Bundled third-party libraries</h3><ul class="jbcl-tp">';
    tp.forEach(function (d) {
      var label = escapeLicenseHtml(d.name || '') + (d.version ? ' ' + escapeLicenseHtml(d.version) : '');
      var lic = d.license ? ' &mdash; ' + escapeLicenseHtml(d.license) : '';
      var link = d.url ? ' &middot; <a href="' + escapeLicenseHtml(d.url) + '" target="_blank" rel="noopener noreferrer">source</a>' : '';
      html += '<li>' + label + lic + link + '</li>';
    });
    html += '</ul><p class="jbcl-note">Full third-party license texts are in the repository’s NOTICES file.</p>';
  } else {
    html += '<p class="jbcl-note">No third-party libraries — this tool is 100% vanilla, with no runtime dependencies.</p>';
  }
  licenseOverlay.querySelector('.jbcl-body').innerHTML = html;
}

function licenseFocusables() {
  return Array.prototype.slice
    .call(licenseDialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
    .filter(function (el) { return !el.disabled && el.getClientRects().length > 0; });
}

function onLicenseKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeLicense(); return; }
  if (e.key !== 'Tab') return;
  var f = licenseFocusables();
  if (!f.length) return;
  e.preventDefault();
  var i = f.indexOf(document.activeElement);
  var n = e.shiftKey ? i - 1 : i + 1;
  if (n < 0) n = f.length - 1;
  if (n >= f.length) n = 0;
  f[n].focus();
}

export function openLicense() {
  if (!licenseOverlay) buildLicenseDialog();
  renderLicenseBody();
  licensePrevFocus = document.activeElement;
  // Fullscreen-safe: the browser only renders the fullscreen element's subtree.
  var host = document.fullscreenElement || document.body;
  if (licenseOverlay.parentNode !== host) host.appendChild(licenseOverlay);
  licenseOverlay.hidden = false;
  document.addEventListener('keydown', onLicenseKey, true);
  licenseDialog.scrollTop = 0;
  licenseOverlay.querySelector('.jbcl-close').focus({ preventScroll: true });
}

function closeLicense() {
  if (!licenseOverlay || licenseOverlay.hidden) return;
  licenseOverlay.hidden = true;
  document.removeEventListener('keydown', onLicenseKey, true);
  if (licenseOverlay.parentNode !== document.body) document.body.appendChild(licenseOverlay);
  if (licensePrevFocus && typeof licensePrevFocus.focus === 'function') { try { licensePrevFocus.focus(); } catch (e) {} }
  licensePrevFocus = null;
}

var licenseTriggerWired = false;
function wireLicenseTrigger() {
  if (licenseTriggerWired || typeof document === 'undefined') return; // idempotent
  licenseTriggerWired = true;
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-ct-license]');
    if (t) { e.preventDefault(); openLicense(); }
  });
}
wireLicenseTrigger(); // self-wire on module evaluation

export class CtLicense {
  static open = openLicense;
}
