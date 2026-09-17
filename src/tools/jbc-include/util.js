// ===== Begin jbcUtil =====
/*
 * jbcUtil — tiny, dependency-free runtime helpers for single-file tools.
 * ---------------------------------------------------------------------------
 * Pasteable, not imported: drop this whole block (sentinels included) inside a
 * <script> tag in a tool's single-file index.html, then reach for the helpers
 * on the global `jbcUtil` object. Establish this BEFORE the module <script>
 * that runs the tool so the global exists when the tool code executes.
 *
 * These are the browser/DOM-facing idioms every tool re-rolled by hand. They
 * are deliberately runtime-only (they touch document / URL / setTimeout), so
 * they live in this inlined <script> — not in a tool's pure, unit-tested
 * source/logic.mjs. Pure algorithms (e.g. crc32) live in their own block.
 *
 * jbcUtil.downloadBlob(data, filename, mime?):
 * - Triggers a file download. `data` may be a Blob, a string, or a Uint8Array
 *   (anything the Blob constructor accepts). A Blob is used as-is; anything
 *   else is wrapped in a Blob (with `mime` as its type when given).
 * - Creates an object URL, clicks a temporary hidden <a download>, then revokes
 *   the URL on a short timeout so the download has time to start.
 *
 * jbcUtil.debounce(fn, ms):
 * - Returns a trailing-edge debounced wrapper: repeated calls reset the timer,
 *   and `fn` runs once, `ms` after the last call, with the latest args and
 *   `this`.
 *
 * jbcUtil.formatBytes(n):
 * - Formats a byte count as a compact human string with NO space between the
 *   number and unit. Under 1KB shows integer bytes with a lowercase "b"
 *   (e.g. "678b"); KB/MB/GB show 2 decimals and TB shows 1; tiers are binary
 *   (1024). Non-finite / missing input formats as "0b".
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
(function () {
  if (window.jbcUtil) return; // idempotent if pasted more than once

  function downloadBlob(data, filename, mime) {
    var blob = (data instanceof Blob)
      ? data
      : new Blob([data], mime ? { type: mime } : undefined);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename == null ? '' : String(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return Math.round(n) + 'b';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(units[i] === 'TB' ? 1 : 2) + units[i];
  }

  window.jbcUtil = {
    downloadBlob: downloadBlob,
    debounce: debounce,
    formatBytes: formatBytes
  };
})();
// ===== end jbcUtil =====
