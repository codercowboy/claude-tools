// ===== Begin jbcCrc32 =====
/*
 * jbcCrc32(bytes) -> uint32
 * ---------------------------------------------------------------------------
 * CRC-32 (ISO 3309 / ITU-T V.42 / PNG / ZIP) over a byte sequence, returned as
 * an unsigned 32-bit integer. This is the standard reflected CRC with the
 * 0xedb88320 polynomial — the exact checksum the PNG chunk format and the ZIP
 * local/central records require.
 *
 * Pasteable, not imported: drop this whole block (sentinels included) inside a
 * <script> tag in a tool's single-file index.html, ahead of the module <script>
 * that uses it, and call the global `jbcCrc32(bytes)`. `bytes` is any indexed,
 * length-bearing byte source (Uint8Array or a plain array of 0..255).
 *
 * The 256-entry lookup table is precomputed once at load. This block is
 * runtime-only (a browser global); a tool whose pure, unit-tested
 * source/logic.mjs needs CRC-32 should keep its own module-level copy rather
 * than depend on this global, which only exists in the assembled page.
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
(function () {
  if (window.jbcCrc32) return; // idempotent if pasted more than once

  var TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  window.jbcCrc32 = function (bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
})();
// ===== end jbcCrc32 =====
