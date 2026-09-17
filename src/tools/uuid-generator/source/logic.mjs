  // ===== BEGIN PURE-LOGIC (DOM-free; unit-tested via tests/unit/*.test.mjs
  // which import this file directly, and inlined into app.mjs by the build's
  // ct:inline token — see docs/conventions.md Build-assembled tools).
  //
  // ⚠️ RANDOMNESS IS INJECTED. No function here touches `crypto`, `Date`,
  // `document`, `window`, or `localStorage`. Every generator takes its random
  // bytes (and time, where relevant) as arguments, so tests pass fixed bytes
  // and assert exact outputs. The app layer (app.mjs) supplies bytes from
  // `crypto.getRandomValues` — NEVER `crypto.randomUUID()` (secure-context-only,
  // throws over plain LAN HTTP; see DESIGN.md). =====

  // ---- Alphabets & tables ------------------------------------------------

  // Crockford base32 — excludes I, L, O, U (ULID).
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // The official nanoid default URL alphabet (64 chars, power of two → the
  // per-char `% length` mapping below is exactly uniform for it).
  const NANOID_ALPHABET =
    'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

  const TOKEN_ALPHABETS = {
    hex: '0123456789abcdef',
    base62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  };

  const VERSION_NAMES = {
    1: 'Version 1 (time-based)',
    2: 'Version 2 (DCE security)',
    3: 'Version 3 (name-based, MD5)',
    4: 'Version 4 (random)',
    5: 'Version 5 (name-based, SHA-1)',
    6: 'Version 6 (reordered time)',
    7: 'Version 7 (time-ordered)',
    8: 'Version 8 (custom)',
  };

  // ---- Shared helpers ----------------------------------------------------

  function toByte(v) {
    // Coerce an injected byte value to 0..255 (undefined → 0), so a short input
    // array degrades predictably rather than emitting NaN.
    return (Number(v) || 0) & 0xff;
  }

  function byteToHex(b) {
    return toByte(b).toString(16).padStart(2, '0');
  }

  // 16 bytes → canonical lowercase hyphenated 8-4-4-4-12.
  function formatUuidBytes(bytes) {
    let hex = '';
    for (let i = 0; i < 16; i++) hex += byteToHex(bytes[i]);
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20, 32)
    );
  }

  // ---- UUID v4 (random) --------------------------------------------------

  function uuidV4(bytes) {
    const b = new Uint8Array(16);
    for (let i = 0; i < 16; i++) b[i] = toByte(bytes && bytes[i]);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant (10xx)
    return formatUuidBytes(b);
  }

  // ---- UUID v7 (time-ordered, RFC 9562) ----------------------------------
  // 48-bit big-endian unix_ts_ms | ver(4b)=7 | rand_a(12b) | var(2b)=10 |
  // rand_b(62b). `time` is Unix ms; only the non-timestamp bytes are used for
  // randomness. Timestamp is split high-16 / low-32 so all shifts stay within
  // 32-bit range (ms epoch < 2^48 < 2^53, exact as a double).
  function uuidV7(time, bytes) {
    const b = new Uint8Array(16);
    for (let i = 0; i < 16; i++) b[i] = toByte(bytes && bytes[i]);
    const ts = Math.max(0, Math.floor(Number(time) || 0));
    const high = Math.floor(ts / 0x100000000); // top 16 bits of the 48
    const low = ts % 0x100000000;              // low 32 bits
    b[0] = (high >>> 8) & 0xff;
    b[1] = high & 0xff;
    b[2] = (low >>> 24) & 0xff;
    b[3] = (low >>> 16) & 0xff;
    b[4] = (low >>> 8) & 0xff;
    b[5] = low & 0xff;
    b[6] = (b[6] & 0x0f) | 0x70; // version 7
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant (10xx)
    return formatUuidBytes(b);
  }

  // ---- ULID --------------------------------------------------------------

  // 48-bit ms timestamp → 10 Crockford chars (most-significant first).
  function encodeTimeCrockford(time, len = 10) {
    let t = Math.max(0, Math.floor(Number(time) || 0));
    let out = '';
    for (let i = 0; i < len; i++) {
      const mod = t % 32;
      out = CROCKFORD[mod] + out;
      t = (t - mod) / 32;
    }
    return out;
  }

  // Big-endian bit stream → Crockford chars. The accumulator is flushed every
  // time it holds >= 5 bits, so it never exceeds ~12 bits (stays well within a
  // safe integer / 32-bit range) regardless of input length.
  function bytesToCrockford(bytes, numChars) {
    let bits = 0;
    let value = 0;
    let out = '';
    const n = bytes ? bytes.length : 0;
    for (let i = 0; i < n; i++) {
      value = (value << 8) | toByte(bytes[i]);
      bits += 8;
      while (bits >= 5) {
        out += CROCKFORD[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      out += CROCKFORD[(value << (5 - bits)) & 31];
    }
    if (numChars == null) return out;
    return out.slice(0, numChars).padEnd(numChars, CROCKFORD[0]);
  }

  // `time`: Unix ms → 10 chars; `bytes`: 10-byte (80-bit) source → 16 chars.
  function ulid(time, bytes) {
    return encodeTimeCrockford(time, 10) + bytesToCrockford(bytes, 16);
  }

  // ---- nanoid ------------------------------------------------------------

  function nanoid(size = 21, bytes, alphabet = NANOID_ALPHABET) {
    const n = Math.max(0, Math.floor(Number(size) || 0));
    const alpha = alphabet && alphabet.length ? alphabet : NANOID_ALPHABET;
    let id = '';
    for (let i = 0; i < n; i++) {
      id += alpha[toByte(bytes && bytes[i]) % alpha.length];
    }
    return id;
  }

  // ---- Generic random token ---------------------------------------------

  function randomToken(len, alphabet, bytes) {
    const n = Math.max(0, Math.floor(Number(len) || 0));
    const alpha = alphabet && alphabet.length ? String(alphabet) : TOKEN_ALPHABETS.hex;
    let out = '';
    for (let i = 0; i < n; i++) {
      out += alpha[toByte(bytes && bytes[i]) % alpha.length];
    }
    return out;
  }

  // ---- Inspect -----------------------------------------------------------

  // Gregorian epoch (1582-10-15) → Unix epoch offset, in 100-ns units.
  const GREGORIAN_OFFSET_100NS = 122192928000000000n;

  function variantOf(nibble) {
    // The variant is defined by the high bits of the 17th hex digit.
    if ((nibble & 0x8) === 0) return { name: 'NCS (reserved, legacy)', bits: '0xxx' };
    if ((nibble & 0xc) === 0x8) return { name: 'RFC 4122 / DCE 1.1', bits: '10xx' };
    if ((nibble & 0xe) === 0xc) return { name: 'Microsoft (reserved)', bits: '110x' };
    return { name: 'Reserved (future)', bits: '111x' };
  }

  function inspectUuid(str) {
    const raw = String(str == null ? '' : str).trim();
    const empty = {
      valid: false, error: null, canonical: null, hex: null,
      version: null, versionName: null, variant: null, variantName: null,
      variantBits: null, isNil: false, isMax: false, timestamp: null, fields: null,
    };
    if (raw === '') return { ...empty, error: 'Enter a UUID to inspect.' };

    const stripped = raw.replace(/^urn:uuid:/i, '').replace(/[{}]/g, '').trim();
    const hex = stripped.replace(/-/g, '');
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
      return { ...empty, error: 'Not a valid UUID — expected 32 hexadecimal digits (with or without hyphens/braces).' };
    }

    const lower = hex.toLowerCase();
    const canonical =
      lower.slice(0, 8) + '-' + lower.slice(8, 12) + '-' + lower.slice(12, 16) +
      '-' + lower.slice(16, 20) + '-' + lower.slice(20, 32);

    const isNil = lower === '0'.repeat(32);
    const isMax = lower === 'f'.repeat(32);

    const version = parseInt(lower[12], 16);
    const variantNibble = parseInt(lower[16], 16);
    const variant = variantOf(variantNibble);

    let timestamp = null;
    if (!isNil && !isMax) {
      if (version === 7) {
        // First 48 bits = Unix ms.
        const ms = parseInt(lower.slice(0, 12), 16);
        timestamp = new Date(ms);
      } else if (version === 1) {
        // 60-bit Gregorian timestamp in 100-ns units, split across fields.
        const timeLow = BigInt('0x' + lower.slice(0, 8));
        const timeMid = BigInt('0x' + lower.slice(8, 12));
        const timeHi = BigInt('0x' + lower.slice(13, 16)); // skip version nibble
        const t100ns = (timeHi << 48n) | (timeMid << 32n) | timeLow;
        const unixMs = Number((t100ns - GREGORIAN_OFFSET_100NS) / 10000n);
        timestamp = new Date(unixMs);
      }
    }

    return {
      valid: true,
      error: null,
      canonical,
      hex: lower,
      version: Number.isNaN(version) ? null : version,
      versionName: VERSION_NAMES[version] || (isNil ? 'Nil UUID' : isMax ? 'Max UUID' : `Version ${version} (unknown)`),
      variant: variantNibble,
      variantName: variant.name,
      variantBits: variant.bits,
      isNil,
      isMax,
      timestamp,
      fields: {
        timeLow: lower.slice(0, 8),
        timeMid: lower.slice(8, 12),
        timeHiAndVersion: lower.slice(12, 16),
        clockSeqAndVariant: lower.slice(16, 20),
        node: lower.slice(20, 32),
      },
    };
  }

  export {
    CROCKFORD,
    NANOID_ALPHABET,
    TOKEN_ALPHABETS,
    VERSION_NAMES,
    formatUuidBytes,
    uuidV4,
    uuidV7,
    encodeTimeCrockford,
    bytesToCrockford,
    ulid,
    nanoid,
    randomToken,
    inspectUuid,
  };
  // ===== END PURE-LOGIC =====
