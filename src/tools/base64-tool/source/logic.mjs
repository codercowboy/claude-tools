  // ===== BEGIN PURE-LOGIC (unit-tested by tests/unit/*.test.mjs via
  // tests/unit/extract-inline-module.mjs — see docs/conventions.md) =====

  // bytes <-> Base64 -------------------------------------------------------

  // Chunked to avoid a stack-overflow from String.fromCharCode.apply on very
  // large byte arrays (Function.prototype.apply has an argument-count limit).
  function bytesToBase64(bytes) {
    const CHUNK = 0x8000; // 32k
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    let binary;
    try {
      binary = atob(b64);
    } catch {
      throw new Error('Invalid Base64 input.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // text <-> Base64, via TextEncoder/TextDecoder (NOT raw btoa/atob on the
  // string — btoa throws on any code point outside Latin1, so straight
  // `btoa(str)` silently breaks on accents/emoji/CJK). fatal:true makes
  // TextDecoder throw on invalid UTF-8 instead of substituting U+FFFD, which
  // is what lets decode mode tell "valid UTF-8 text" from "binary data".

  function encodeText(str) {
    return bytesToBase64(new TextEncoder().encode(String(str ?? '')));
  }

  function decodeText(b64) {
    const bytes = base64ToBytes(b64);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // throws on invalid UTF-8
  }

  // Base64 <-> Base64URL ----------------------------------------------------

  function toBase64Url(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    let b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const rem = b64.length % 4;
    if (rem === 1) throw new Error('Invalid Base64URL length.');
    if (rem === 2) b64 += '==';
    else if (rem === 3) b64 += '=';
    return b64;
  }

  // data: URI parsing ---------------------------------------------------
  // data:[<mime>][;param=value ...][;base64],<data>
  // We only need mime + whether the payload is base64 + the raw payload text.

  function parseDataUri(s) {
    const str = String(s ?? '').trim();
    const m = str.match(/^data:([^,]*),([\s\S]*)$/);
    if (!m) return null;
    const parts = m[1].split(';').filter((p) => p !== '');
    const isBase64 = parts[parts.length - 1] === 'base64';
    if (isBase64) parts.pop();
    const mime = parts[0] || 'text/plain';
    return { mime, isBase64, payload: m[2] };
  }

  // Tolerant normalization for pasted Base64: strips whitespace/newlines,
  // accepts either the standard or URL-safe alphabet (not a mix of both — a
  // string containing both '+/' AND '-_' is ambiguous and rejected), restores
  // dropped padding, then validates the final charset.

  function normalizeBase64(input) {
    let s = String(input ?? '').replace(/\s+/g, '');
    if (s === '') throw new Error('No input to decode.');
    const hasUrlSafe = /[-_]/.test(s);
    const hasStandard = /[+/]/.test(s);
    if (hasUrlSafe && hasStandard) {
      throw new Error('Mixed standard and URL-safe Base64 characters.');
    }
    if (hasUrlSafe) {
      s = fromBase64Url(s);
    } else {
      const rem = s.length % 4;
      if (rem === 1) throw new Error('Invalid Base64 length.');
      if (rem !== 0) s += '='.repeat(4 - rem);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
      throw new Error('Contains characters outside the Base64 alphabet.');
    }
    return s;
  }

  // One entry point for the whole decode flow: accepts raw Base64/Base64URL OR
  // a data: URI, returns the decoded bytes + best-effort text + detected mime.
  // Throws a friendly Error on anything invalid — callers catch and display
  // err.message.

  const MAX_DECODE_B64_CHARS = 14_000_000; // ~10MB decoded

  function decodeInput(raw) {
    const trimmed = String(raw ?? '').trim();
    if (trimmed === '') throw new Error('Nothing to decode.');

    const parsed = parseDataUri(trimmed);
    let mime = null;
    let payload = trimmed;
    if (parsed) {
      if (!parsed.isBase64) {
        throw new Error('Only base64-encoded data: URIs are supported.');
      }
      mime = parsed.mime;
      payload = parsed.payload;
    }

    const clean = normalizeBase64(payload);
    if (clean.length > MAX_DECODE_B64_CHARS) {
      throw new Error(
        `Input too large to decode (${clean.length.toLocaleString()} characters, ` +
        `limit ${MAX_DECODE_B64_CHARS.toLocaleString()}).`
      );
    }
    const bytes = base64ToBytes(clean);

    let text = null;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }

    return { mime: mime || 'application/octet-stream', bytes, text, isText: text !== null };
  }

  // MIME -> file extension, for the Download button's filename.

  const MIME_EXTENSIONS = {
    'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css', 'text/csv': 'csv',
    'text/markdown': 'md', 'application/json': 'json',
    'application/javascript': 'js', 'text/javascript': 'js',
    'application/xml': 'xml', 'text/xml': 'xml',
    'application/pdf': 'pdf', 'application/zip': 'zip',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
    'video/mp4': 'mp4', 'video/webm': 'webm',
    'application/octet-stream': 'bin',
  };

  function extensionForMime(mime) {
    const clean = String(mime || '').toLowerCase().split(';')[0].trim();
    if (MIME_EXTENSIONS[clean]) return MIME_EXTENSIONS[clean];
    const subtype = clean.split('/')[1];
    if (subtype) {
      const simple = subtype.split('+')[0].replace(/[^a-z0-9]/g, '');
      if (simple) return simple;
    }
    return 'bin';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  }

  export {
    bytesToBase64,
    base64ToBytes,
    encodeText,
    decodeText,
    toBase64Url,
    fromBase64Url,
    parseDataUri,
    normalizeBase64,
    decodeInput,
    MAX_DECODE_B64_CHARS,
    MIME_EXTENSIONS,
    extensionForMime,
    formatBytes,
  };
  // ===== END PURE-LOGIC =====
