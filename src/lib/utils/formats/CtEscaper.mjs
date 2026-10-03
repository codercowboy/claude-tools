// ===== Begin jbcEscape (ES module) =====
/*
 * jbcEscape — escape / unescape across ~20 syntactic contexts.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module. One escape<Context> + unescape<Context>
 * per context, each a pure string transform with no document/window/localStorage.
 * Round-trip contexts satisfy unescapeX(escapeX(s)) === s for arbitrary s;
 * control characters are always emitted in an unambiguous form (\xNN, \uNNNN,
 * 3-digit octal) so decoding is deterministic. Also exports the CONTEXTS /
 * CONTEXTS_BY_ID metadata, DEFAULT_ENABLED, and nest(chain, text).
 *
 * A tool whose pure, unit-tested source/logic.mjs needs escaping imports this
 * module directly (so `node --test` can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each `export` — so the
 * shipped tool stays dependency-free and file://-openable. See the consuming
 * repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

// Two hex digits for a code unit (0..255).
function hex2(n) { return n.toString(16).toUpperCase().padStart(2, '0'); }
// Four hex digits.
function hex4(n) { return n.toString(16).toUpperCase().padStart(4, '0'); }
// Three-digit octal (0..255).
function oct3(n) { return n.toString(8).padStart(3, '0'); }

// If `s` begins with `open` and ends with `close`, return the inner slice;
// otherwise return `s` unchanged. Used by decoders to tolerate an input that
// still carries (or has already lost) its delimiters.
function stripWrapping(s, open, close) {
  if (s.length >= open.length + close.length &&
      s.startsWith(open) && s.endsWith(close)) {
    return s.slice(open.length, s.length - close.length);
  }
  return s;
}

// ---------------------------------------------------------------------
// Base64 over UTF-8 bytes — hand-rolled so it is DOM-free and identical in
// Node and the browser (btoa is DOM-only and mangles non-Latin1).
// ---------------------------------------------------------------------
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const m = Object.create(null);
  for (let i = 0; i < B64_ALPHABET.length; i++) m[B64_ALPHABET[i]] = i;
  return m;
})();

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(triple >> 18) & 0x3f];
    out += B64_ALPHABET[(triple >> 12) & 0x3f];
    out += i + 1 < bytes.length ? B64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    out += i + 2 < bytes.length ? B64_ALPHABET[triple & 0x3f] : '=';
  }
  return out;
}

function base64ToBytes(str) {
  const clean = str.replace(/[\r\n\t ]/g, '');
  const body = clean.replace(/=+$/, '');
  for (const ch of body) {
    if (!(ch in B64_LOOKUP)) throw new Error('Invalid Base64 input');
  }
  const bytes = [];
  for (let i = 0; i < body.length; i += 4) {
    const c0 = B64_LOOKUP[body[i]];
    const c1 = i + 1 < body.length ? B64_LOOKUP[body[i + 1]] : 0;
    const c2 = i + 2 < body.length ? B64_LOOKUP[body[i + 2]] : 0;
    const c3 = i + 3 < body.length ? B64_LOOKUP[body[i + 3]] : 0;
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (i + 1 < body.length) bytes.push((triple >> 16) & 0xff);
    if (i + 2 < body.length) bytes.push((triple >> 8) & 0xff);
    if (i + 3 < body.length) bytes.push(triple & 0xff);
  }
  return new Uint8Array(bytes);
}

const _encoder = new TextEncoder();
// ignoreBOM: true so a leading U+FEFF survives the byte round-trip — the
// default decoder silently strips a leading BOM, breaking unescape(escape(s)).
const _decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function escapeBase64(text) {
  return bytesToBase64(_encoder.encode(text));
}
export function unescapeBase64(str) {
  return _decoder.decode(base64ToBytes(str));
}

// ---------------------------------------------------------------------
// HTML / XML entities
// ---------------------------------------------------------------------
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  deg: '°', middot: '·', bull: '•', euro: '€',
  pound: '£', cent: '¢', yen: '¥', sect: '§',
  para: '¶', dagger: '†', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’',
};

function decodeHtmlEntities(str) {
  return str.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
        try { return String.fromCodePoint(cp); } catch { return m; }
      }
      return m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body] : m;
  });
}

// HTML text content — escape the three that break text nodes.
export function escapeHtmlText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function unescapeHtmlText(str) { return decodeHtmlEntities(str); }

// HTML attribute value — also the quote characters.
export function escapeHtmlAttr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function unescapeHtmlAttr(str) { return decodeHtmlEntities(str); }

// XML — the five predefined entities. The canonical escapeXml for the whole library
// (CtUtil's escapeXmlBasic was folded into this). null/undefined pass through as
// themselves; any other non-string is String()-coerced, unless `strict`, which throws.
export function escapeXml(text, strict = false) {
  if (text === null || text === undefined) return text;
  if (typeof text !== 'string') {
    if (strict) throw new TypeError('escapeXml: expected a string, got ' + typeof text);
    text = String(text);
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
export function unescapeXml(str) { return decodeHtmlEntities(str); }

// ---------------------------------------------------------------------
// Code string literals
// ---------------------------------------------------------------------

// JSON — the spec's own stringify (quoted) and parse.
export function escapeJson(text) { return JSON.stringify(text); }
export function unescapeJson(str) {
  const t = str.trim();
  try {
    const v = JSON.parse(t);
    if (typeof v === 'string') return v;
  } catch { /* fall through */ }
  // Tolerate an unquoted body: wrap and parse.
  return JSON.parse('"' + t.replace(/^"|"$/g, '') + '"');
}

// Shared control-char escaper for C-family double-quoted literals.
function escapeStringLiteral(text, { quote, extraNamed = {}, otherControl }) {
  const named = {
    '\\': '\\\\', [quote]: '\\' + quote,
    '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f',
    ...extraNamed,
  };
  let out = quote;
  for (const ch of text) {
    if (Object.prototype.hasOwnProperty.call(named, ch)) { out += named[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) { out += otherControl(cp); continue; }
    out += ch;
  }
  return out + quote;
}

// Shared decoder for backslash escapes in C-family / Python / shell $'' forms.
function decodeBackslashEscapes(inner, { hexU = true, octal = false } = {}) {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') { out += ch; continue; }
    const n = inner[i + 1];
    if (n === undefined) { out += '\\'; break; }
    switch (n) {
      case 'n': out += '\n'; i++; break;
      case 'r': out += '\r'; i++; break;
      case 't': out += '\t'; i++; break;
      case 'b': out += '\b'; i++; break;
      case 'f': out += '\f'; i++; break;
      case 'v': out += '\v'; i++; break;
      case 'a': out += '\x07'; i++; break;
      case 'e': out += '\x1b'; i++; break;
      case '0': case '1': case '2': case '3':
      case '4': case '5': case '6': case '7':
        if (octal) {
          let j = i + 1, digits = '';
          while (j < inner.length && digits.length < 3 && /[0-7]/.test(inner[j])) { digits += inner[j]; j++; }
          out += String.fromCharCode(parseInt(digits, 8) & 0xff);
          i = j - 1;
        } else if (n === '0') { out += '\0'; i++; }
        else { out += n; i++; }
        break;
      case 'x': {
        const m = /^[0-9a-fA-F]{1,2}/.exec(inner.slice(i + 2));
        if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += 1 + m[0].length; }
        else { out += 'x'; i++; }
        break;
      }
      case 'u': {
        if (hexU) {
          if (inner[i + 2] === '{') {
            const end = inner.indexOf('}', i + 3);
            if (end !== -1) {
              const hexv = inner.slice(i + 3, end);
              out += String.fromCodePoint(parseInt(hexv, 16) || 0);
              i = end; break;
            }
          }
          const m = /^[0-9a-fA-F]{4}/.exec(inner.slice(i + 2));
          if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += 1 + m[0].length; break; }
        }
        out += 'u'; i++; break;
      }
      case 'U': {
        const m = /^[0-9a-fA-F]{8}/.exec(inner.slice(i + 2));
        if (m) { out += String.fromCodePoint(parseInt(m[0], 16) || 0); i += 1 + m[0].length; }
        else { out += 'U'; i++; }
        break;
      }
      default: out += n; i++; break; // \\ \" \' \` \? etc → the char itself
    }
  }
  return out;
}

// JS — double-quoted; \xNN for other control chars.
export function escapeJsString(text) {
  return escapeStringLiteral(text, {
    quote: '"',
    extraNamed: { '\v': '\\v' },
    otherControl: (cp) => '\\x' + hex2(cp),
  });
}
export function unescapeJsString(str) {
  const inner = stripWrapping(str.trim(), '"', '"');
  const body = inner === str.trim() ? stripWrapping(str.trim(), "'", "'") : inner;
  return decodeBackslashEscapes(body);
}

// Java — double-quoted; other control chars → \uNNNN (no \x in Java).
export function escapeJava(text) {
  return escapeStringLiteral(text, {
    quote: '"',
    otherControl: (cp) => '\\u' + hex4(cp),
  });
}
export function unescapeJava(str) {
  const inner = stripWrapping(str.trim(), '"', '"');
  return decodeBackslashEscapes(inner, { octal: true });
}

// C / C++ — double-quoted; \a \v named; other control → 3-digit octal.
export function escapeCString(text) {
  return escapeStringLiteral(text, {
    quote: '"',
    extraNamed: { '\v': '\\v', '\x07': '\\a' },
    otherControl: (cp) => '\\' + oct3(cp),
  });
}
export function unescapeCString(str) {
  const inner = stripWrapping(str.trim(), '"', '"');
  return decodeBackslashEscapes(inner, { octal: true });
}

// Python — single-quoted; \xNN for other control.
export function escapePython(text) {
  return escapeStringLiteral(text, {
    quote: "'",
    otherControl: (cp) => '\\x' + hex2(cp),
  });
}
export function unescapePython(str) {
  let t = str.trim().replace(/^[rbuRBU]{1,2}/, ''); // ignore a string prefix
  const inner = stripWrapping(t, "'", "'");
  const body = inner === t ? stripWrapping(t, '"', '"') : inner;
  return decodeBackslashEscapes(body, { octal: true });
}

// ---------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------

// POSIX single-quote: '…', embedded ' becomes '\''.
export function escapeShSingle(text) {
  return "'" + text.replace(/'/g, "'\\''") + "'";
}
export function unescapeShSingle(str) {
  // Walk: single-quoted spans are literal; a backslash outside quotes escapes
  // the next char (covers the '\'' bridge our encoder emits).
  let out = '', inSingle = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inSingle) {
      if (ch === "'") { inSingle = false; } else { out += ch; }
    } else if (ch === "'") { inSingle = true; }
    else if (ch === '\\') { if (i + 1 < str.length) { out += str[++i]; } }
    else { out += ch; }
  }
  return out;
}

// POSIX double-quote: "…", escape \ $ ` and ".
export function escapeShDouble(text) {
  return '"' + text.replace(/([\\$`"])/g, '\\$1') + '"';
}
export function unescapeShDouble(str) {
  const inner = stripWrapping(str.trim(), '"', '"');
  return inner.replace(/\\([\\$`"])/g, '$1');
}

// POSIX ANSI-C quoting: $'…' with C-style escapes.
export function escapeShAnsiC(text) {
  let out = "$'";
  const named = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\f': '\\f', '\b': '\\b' };
  for (const ch of text) {
    if (Object.prototype.hasOwnProperty.call(named, ch)) { out += named[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) { out += '\\x' + hex2(cp); continue; }
    out += ch;
  }
  return out + "'";
}
export function unescapeShAnsiC(str) {
  let t = str.trim();
  if (t.startsWith("$'")) t = t.slice(2);
  else if (t.startsWith("'")) t = t.slice(1);
  if (t.endsWith("'")) t = t.slice(0, -1);
  return decodeBackslashEscapes(t, { octal: true });
}

// PowerShell single-quote: '…', embedded ' becomes ''.
export function escapePowerShell(text) {
  return "'" + text.replace(/'/g, "''") + "'";
}
export function unescapePowerShell(str) {
  const inner = stripWrapping(str.trim(), "'", "'");
  return inner.replace(/''/g, "'");
}

// ---------------------------------------------------------------------
// SQL / CSV
// ---------------------------------------------------------------------

// Standard SQL string literal: '…', embedded ' becomes ''.
export function escapeSql(text) {
  return "'" + text.replace(/'/g, "''") + "'";
}
export function unescapeSql(str) {
  const inner = stripWrapping(str.trim(), "'", "'");
  return inner.replace(/''/g, "'");
}

// CSV field per RFC 4180: quote only when the field contains " , CR or LF.
export function escapeCsv(text) {
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}
export function unescapeCsv(str) {
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1).replace(/""/g, '"');
  }
  return str;
}

// ---------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------
export function escapeUrlComponent(text) { return encodeURIComponent(text); }
export function unescapeUrlComponent(str) { return decodeURIComponent(str); }

export function escapeUrlFull(text) { return encodeURI(text); }
export function unescapeUrlFull(str) { return decodeURI(str); }

// ---------------------------------------------------------------------
// Markdown — backslash-escape CommonMark ASCII punctuation.
// ---------------------------------------------------------------------
const MD_SPECIAL = '\\`*_{}[]()#+-.!|>~';
const MD_ESCAPE_RE = new RegExp('[' + MD_SPECIAL.replace(/[\\\]^-]/g, '\\$&') + ']', 'g');
export function escapeMarkdown(text) {
  return text.replace(MD_ESCAPE_RE, '\\$&');
}
export function unescapeMarkdown(str) {
  return str.replace(new RegExp('\\\\([' + MD_SPECIAL.replace(/[\\\]^-]/g, '\\$&') + '])', 'g'), '$1');
}

// ---------------------------------------------------------------------
// Regex — escape metacharacters so the text matches literally.
// ---------------------------------------------------------------------
const RE_SPECIAL = /[.*+?^${}()|[\]\\/-]/g;
export function escapeRegex(text) { return text.replace(RE_SPECIAL, '\\$&'); }
export function unescapeRegex(str) {
  return str.replace(/\\([.*+?^${}()|[\]\\/-])/g, '$1');
}

// ---------------------------------------------------------------------
// Filename slug — one-way (no decode).
// ---------------------------------------------------------------------
export function escapeFilename(text) {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    || 'untitled';
  // Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are invalid even WITH an
  // extension — prefix with "_" so the result is always a usable filename (#1014-O).
  const base = slug.split('.')[0];
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(base)) return '_' + slug;
  return slug;
}

// ---------------------------------------------------------------------
// Context metadata
// ---------------------------------------------------------------------
export const CONTEXTS = [
  { id: 'html-text', label: 'HTML text', group: 'Markup', roundTrip: true,
    note: 'Escapes & < > for text between tags.',
    escape: escapeHtmlText, unescape: unescapeHtmlText },
  { id: 'html-attr', label: 'HTML attribute', group: 'Markup', roundTrip: true,
    note: 'Also escapes " and \' for a quoted attribute value.',
    escape: escapeHtmlAttr, unescape: unescapeHtmlAttr },
  { id: 'xml', label: 'XML', group: 'Markup', roundTrip: true,
    note: 'The five predefined entities: & < > " \'.',
    escape: escapeXml, unescape: unescapeXml },

  { id: 'json', label: 'JSON string', group: 'Code strings', roundTrip: true,
    note: 'JSON.stringify output (quoted). Decode with JSON.parse.',
    escape: escapeJson, unescape: unescapeJson },
  { id: 'js-string', label: 'JS string', group: 'Code strings', roundTrip: true,
    note: 'Double-quoted; \\xNN for other control chars.',
    escape: escapeJsString, unescape: unescapeJsString },
  { id: 'java', label: 'Java string', group: 'Code strings', roundTrip: true,
    note: 'Double-quoted; other control chars as \\uNNNN.',
    escape: escapeJava, unescape: unescapeJava },
  { id: 'c-string', label: 'C / C++ string', group: 'Code strings', roundTrip: true,
    note: 'Double-quoted; other control chars as 3-digit octal.',
    escape: escapeCString, unescape: unescapeCString },
  { id: 'python', label: 'Python string', group: 'Code strings', roundTrip: true,
    note: "Single-quoted; \\xNN for other control chars.",
    escape: escapePython, unescape: unescapePython },

  { id: 'sh-single', label: 'Shell: single quotes', group: 'Shell', roundTrip: true,
    note: "POSIX '…' — the fully literal form; ' becomes '\\''.",
    escape: escapeShSingle, unescape: unescapeShSingle },
  { id: 'sh-double', label: 'Shell: double quotes', group: 'Shell', roundTrip: true,
    note: 'POSIX "…" — escapes \\ $ ` and ". Newlines stay literal.',
    escape: escapeShDouble, unescape: unescapeShDouble },
  { id: 'sh-ansi-c', label: "Shell: $'…' (ANSI-C)", group: 'Shell', roundTrip: true,
    note: "Bash/zsh $'…' with C-style \\n \\t \\xNN escapes.",
    escape: escapeShAnsiC, unescape: unescapeShAnsiC },
  { id: 'powershell', label: 'PowerShell', group: 'Shell', roundTrip: true,
    note: "Single-quoted '…'; ' becomes ''. (Double-quoted PS uses ` and $.)",
    escape: escapePowerShell, unescape: unescapePowerShell },

  { id: 'sql', label: 'SQL string', group: 'Data / query', roundTrip: true,
    note: "Standard '…'; ' becomes ''. MySQL also allows \\; Postgres E'…'.",
    escape: escapeSql, unescape: unescapeSql },
  { id: 'csv', label: 'CSV field (RFC 4180)', group: 'Data / query', roundTrip: true,
    note: 'Quoted only when it contains " , or a newline; " becomes "".',
    escape: escapeCsv, unescape: unescapeCsv },

  { id: 'url-component', label: 'URL component', group: 'Web', roundTrip: true,
    note: 'encodeURIComponent — for one query value or path segment.',
    escape: escapeUrlComponent, unescape: unescapeUrlComponent },
  { id: 'url-full', label: 'Full URL', group: 'Web', roundTrip: true,
    note: 'encodeURI — keeps : / ? # & = so a whole URL stays usable.',
    escape: escapeUrlFull, unescape: unescapeUrlFull },
  { id: 'markdown', label: 'Markdown', group: 'Web', roundTrip: true,
    note: 'Backslash-escapes CommonMark punctuation (* _ ` [ ] ( ) # …).',
    escape: escapeMarkdown, unescape: unescapeMarkdown },

  { id: 'regex', label: 'Regex literal', group: 'Regex', roundTrip: true,
    note: 'Escapes metacharacters so the text matches literally.',
    escape: escapeRegex, unescape: unescapeRegex },

  { id: 'base64', label: 'Base64 (UTF-8)', group: 'Encoding', roundTrip: true,
    note: 'Standard Base64 of the UTF-8 bytes.',
    escape: escapeBase64, unescape: unescapeBase64 },

  { id: 'filename', label: 'Safe filename slug', group: 'Filename', roundTrip: false,
    note: 'One-way: lowercased, non [a-z0-9._-] → "-", collapsed.',
    escape: escapeFilename, unescape: null },
];

export const CONTEXTS_BY_ID = Object.fromEntries(CONTEXTS.map((c) => [c.id, c]));

export const DEFAULT_ENABLED = [
  'html-text', 'html-attr', 'json', 'js-string', 'sh-single', 'sh-double',
  'sql', 'csv', 'url-component', 'markdown', 'regex', 'base64',
];

// ---------------------------------------------------------------------
// Nesting composer — apply each context's escape in order.
// nest(['json','sh-double'], text) escapes for JSON, then wraps that string
// for a shell double-quoted argument.
// ---------------------------------------------------------------------
export function nest(chain, text) {
  const steps = [];
  let value = text;
  for (const id of chain) {
    const ctx = CONTEXTS_BY_ID[id];
    if (!ctx) continue;
    value = ctx.escape(value);
    steps.push({ id, label: ctx.label, value });
  }
  return { steps, output: value };
}
// ===== end jbcEscape (ES module) =====
