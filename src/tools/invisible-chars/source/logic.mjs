
  // =====================================================================
  // Invisible Chars \u2014 pure logic (DOM-free, unit-tested)
  //
  // No document / window / localStorage in this file. app.mjs inlines it at
  // build time via <<ct:inline logic.mjs>> (the imports below are flattened in
  // and the `export`s stripped); tests/unit/*.test.mjs import it directly.
  //
  // Everything iterates by CODE POINT (`for..of`), never UTF-16 units. Detection
  // order per code point: (1) explicit table, (2) range rules (variation
  // selectors, tag characters, C0/C1 controls), (3) generic \p{Cf}/\p{Zs}/\p{Zl}/
  // \p{Zp} fallback, (4) the curated confusables map. See DESIGN.md.
  // =====================================================================
  import { textToBytes, bytesToHex } from '../../../lib/utils/CtByteUtil.mjs';

  // ---------------------------------------------------------------------
  // Categories (also the order chips/legend/counts are shown in)
  // ---------------------------------------------------------------------
  export const CATEGORIES = [
    { id: 'zerowidth', label: 'Zero-width', blurb: 'ZWSP, ZWNJ, ZWJ, word joiner, BOM' },
    { id: 'bidi', label: 'Bidi controls', blurb: 'LRM/RLM, embeddings, overrides, isolates (Trojan Source)' },
    { id: 'format', label: 'Format / misc', blurb: 'soft hyphen, CGJ, invisible math operators, annotations, other Cf' },
    { id: 'variation', label: 'Variation selectors', blurb: 'VS1-16 (glyph choice) and VS17-256 (steganography)' },
    { id: 'tag', label: 'Tag characters', blurb: 'U+E0000 block; can smuggle hidden ASCII' },
    { id: 'filler', label: 'Fillers', blurb: 'Hangul fillers, Braille blank, Khmer inherent vowels' },
    { id: 'control', label: 'Control characters', blurb: 'C0 / C1 controls, DEL, lone surrogates' },
    { id: 'space', label: 'Unusual spaces', blurb: 'NBSP and other non-ASCII spaces (converted, not removed)' },
    { id: 'separator', label: 'Line / paragraph separators', blurb: 'U+2028, U+2029, NEL (converted to a newline)' },
    { id: 'confusable', label: 'Confusables', blurb: 'non-ASCII look-alikes of Latin letters and punctuation' },
  ];

  // ---------------------------------------------------------------------
  // Data table 1 \u2014 explicit invisible / suspicious code points
  //   cp -> { tag, name, category, strip }
  // `strip` = removed by the default "Remove invisibles" action.
  // Spaces/separators are converted, never removed. Ranges (variation
  // selectors, tags, C0/C1) are handled by rangeRule() below.
  // ---------------------------------------------------------------------
  export const INVISIBLES = {};
  function add(cp, tag, name, category, strip) {
    INVISIBLES[cp] = { tag, name, category, strip };
  }
  add(0x200B, 'ZWSP', 'ZERO WIDTH SPACE', 'zerowidth', true);
  add(0x200C, 'ZWNJ', 'ZERO WIDTH NON-JOINER', 'zerowidth', true);
  add(0x200D, 'ZWJ', 'ZERO WIDTH JOINER', 'zerowidth', true);
  add(0x2060, 'WJ', 'WORD JOINER', 'zerowidth', true);
  add(0xFEFF, 'BOM', 'ZERO WIDTH NO-BREAK SPACE / BOM', 'zerowidth', true);
  add(0x180E, 'MVS', 'MONGOLIAN VOWEL SEPARATOR', 'zerowidth', true);
  add(0x00AD, 'SHY', 'SOFT HYPHEN', 'format', true);
  add(0x034F, 'CGJ', 'COMBINING GRAPHEME JOINER', 'format', true);
  add(0x061C, 'ALM', 'ARABIC LETTER MARK', 'bidi', true);
  add(0x200E, 'LRM', 'LEFT-TO-RIGHT MARK', 'bidi', true);
  add(0x200F, 'RLM', 'RIGHT-TO-LEFT MARK', 'bidi', true);
  add(0x202A, 'LRE', 'LEFT-TO-RIGHT EMBEDDING', 'bidi', true);
  add(0x202B, 'RLE', 'RIGHT-TO-LEFT EMBEDDING', 'bidi', true);
  add(0x202C, 'PDF', 'POP DIRECTIONAL FORMATTING', 'bidi', true);
  add(0x202D, 'LRO', 'LEFT-TO-RIGHT OVERRIDE', 'bidi', true);
  add(0x202E, 'RLO', 'RIGHT-TO-LEFT OVERRIDE', 'bidi', true);
  add(0x2066, 'LRI', 'LEFT-TO-RIGHT ISOLATE', 'bidi', true);
  add(0x2067, 'RLI', 'RIGHT-TO-LEFT ISOLATE', 'bidi', true);
  add(0x2068, 'FSI', 'FIRST STRONG ISOLATE', 'bidi', true);
  add(0x2069, 'PDI', 'POP DIRECTIONAL ISOLATE', 'bidi', true);
  add(0x2061, 'FA', 'FUNCTION APPLICATION', 'format', true);
  add(0x2062, 'IT', 'INVISIBLE TIMES', 'format', true);
  add(0x2063, 'IS', 'INVISIBLE SEPARATOR', 'format', true);
  add(0x2064, 'IP', 'INVISIBLE PLUS', 'format', true);
  [
    ['ISS', 'INHIBIT SYMMETRIC SWAPPING'], ['ASS', 'ACTIVATE SYMMETRIC SWAPPING'],
    ['IAFS', 'INHIBIT ARABIC FORM SHAPING'], ['AAFS', 'ACTIVATE ARABIC FORM SHAPING'],
    ['NADS', 'NATIONAL DIGIT SHAPES'], ['NODS', 'NOMINAL DIGIT SHAPES'],
  ].forEach(([tag, name], i) => add(0x206A + i, tag, name + ' (deprecated)', 'format', true));
  add(0xFFF9, 'IAA', 'INTERLINEAR ANNOTATION ANCHOR', 'format', true);
  add(0xFFFA, 'IAS', 'INTERLINEAR ANNOTATION SEPARATOR', 'format', true);
  add(0xFFFB, 'IAT', 'INTERLINEAR ANNOTATION TERMINATOR', 'format', true);
  add(0xFFFC, 'OBJ', 'OBJECT REPLACEMENT CHARACTER', 'format', true);
  add(0xFFFD, 'REPL', 'REPLACEMENT CHARACTER (mojibake signal)', 'format', false);
  add(0x00A0, 'NBSP', 'NO-BREAK SPACE', 'space', false);
  add(0x1680, 'OGSP', 'OGHAM SPACE MARK', 'space', false);
  [
    ['EN-Q', 'EN QUAD'], ['EM-Q', 'EM QUAD'], ['ENSP', 'EN SPACE'], ['EMSP', 'EM SPACE'],
    ['3/M', 'THREE-PER-EM SPACE'], ['4/M', 'FOUR-PER-EM SPACE'], ['6/M', 'SIX-PER-EM SPACE'],
    ['FIGSP', 'FIGURE SPACE'], ['PUNCSP', 'PUNCTUATION SPACE'], ['THINSP', 'THIN SPACE'],
    ['HAIRSP', 'HAIR SPACE'],
  ].forEach(([tag, name], i) => add(0x2000 + i, tag, name, 'space', false));
  add(0x202F, 'NNBSP', 'NARROW NO-BREAK SPACE', 'space', false);
  add(0x205F, 'MMSP', 'MEDIUM MATHEMATICAL SPACE', 'space', false);
  add(0x3000, 'IDSP', 'IDEOGRAPHIC SPACE', 'space', false);
  add(0x2028, 'LS', 'LINE SEPARATOR', 'separator', false);
  add(0x2029, 'PS', 'PARAGRAPH SEPARATOR', 'separator', false);
  add(0x0085, 'NEL', 'NEXT LINE', 'separator', false);
  add(0x3164, 'HF', 'HANGUL FILLER', 'filler', true);
  add(0x115F, 'HCF', 'HANGUL CHOSEONG FILLER', 'filler', true);
  add(0x1160, 'HJF', 'HANGUL JUNGSEONG FILLER', 'filler', true);
  add(0xFFA0, 'HWHF', 'HALFWIDTH HANGUL FILLER', 'filler', true);
  add(0x2800, 'BRAILLE0', 'BRAILLE PATTERN BLANK', 'filler', true);
  add(0x17B4, 'KHM', 'KHMER VOWEL INHERENT AQ', 'filler', true);
  add(0x17B5, 'KHM', 'KHMER VOWEL INHERENT AA', 'filler', true);

  // C0 / C1 control names (tab, LF, CR are ordinary whitespace and not flagged;
  // U+0085 NEL is the explicit 'separator' row above).
  const C0 = ['NUL', 'NULL', 'SOH', 'START OF HEADING', 'STX', 'START OF TEXT', 'ETX', 'END OF TEXT',
    'EOT', 'END OF TRANSMISSION', 'ENQ', 'ENQUIRY', 'ACK', 'ACKNOWLEDGE', 'BEL', 'BELL', 'BS', 'BACKSPACE',
    'HT', 'CHARACTER TABULATION', 'LF', 'LINE FEED', 'VT', 'LINE TABULATION', 'FF', 'FORM FEED',
    'CR', 'CARRIAGE RETURN', 'SO', 'SHIFT OUT', 'SI', 'SHIFT IN', 'DLE', 'DATA LINK ESCAPE',
    'DC1', 'DEVICE CONTROL ONE', 'DC2', 'DEVICE CONTROL TWO', 'DC3', 'DEVICE CONTROL THREE',
    'DC4', 'DEVICE CONTROL FOUR', 'NAK', 'NEGATIVE ACKNOWLEDGE', 'SYN', 'SYNCHRONOUS IDLE',
    'ETB', 'END OF TRANSMISSION BLOCK', 'CAN', 'CANCEL', 'EM', 'END OF MEDIUM', 'SUB', 'SUBSTITUTE',
    'ESC', 'ESCAPE', 'FS', 'FILE SEPARATOR', 'GS', 'GROUP SEPARATOR', 'RS', 'RECORD SEPARATOR',
    'US', 'UNIT SEPARATOR'];
  const C1 = ['PAD', 'PADDING CHARACTER', 'HOP', 'HIGH OCTET PRESET', 'BPH', 'BREAK PERMITTED HERE',
    'NBH', 'NO BREAK HERE', 'IND', 'INDEX', 'NEL', 'NEXT LINE', 'SSA', 'START OF SELECTED AREA',
    'ESA', 'END OF SELECTED AREA', 'HTS', 'CHARACTER TABULATION SET', 'HTJ', 'CHARACTER TABULATION WITH JUSTIFICATION',
    'VTS', 'LINE TABULATION SET', 'PLD', 'PARTIAL LINE FORWARD', 'PLU', 'PARTIAL LINE BACKWARD',
    'RI', 'REVERSE LINE FEED', 'SS2', 'SINGLE SHIFT TWO', 'SS3', 'SINGLE SHIFT THREE',
    'DCS', 'DEVICE CONTROL STRING', 'PU1', 'PRIVATE USE ONE', 'PU2', 'PRIVATE USE TWO',
    'STS', 'SET TRANSMIT STATE', 'CCH', 'CANCEL CHARACTER', 'MW', 'MESSAGE WAITING',
    'SPA', 'START OF GUARDED AREA', 'EPA', 'END OF GUARDED AREA', 'SOS', 'START OF STRING',
    'SGCI', 'SINGLE GRAPHIC CHARACTER INTRODUCER', 'SCI', 'SINGLE CHARACTER INTRODUCER',
    'CSI', 'CONTROL SEQUENCE INTRODUCER', 'ST', 'STRING TERMINATOR', 'OSC', 'OPERATING SYSTEM COMMAND',
    'PM', 'PRIVACY MESSAGE', 'APC', 'APPLICATION PROGRAM COMMAND'];

  // Range rule (step 2). Returns an entry like INVISIBLES rows, or null.
  function rangeRule(cp) {
    if (cp >= 0xFE00 && cp <= 0xFE0F) {
      const n = cp - 0xFE00 + 1;
      return { tag: 'VS' + n, name: 'VARIATION SELECTOR-' + n, category: 'variation', strip: false };
    }
    if (cp >= 0xE0100 && cp <= 0xE01EF) {
      const n = cp - 0xE0100 + 17;
      return { tag: 'VS' + n, name: 'VARIATION SELECTOR-' + n, category: 'variation', strip: true };
    }
    if (cp === 0xE0001) return { tag: 'LANG', name: 'LANGUAGE TAG', category: 'tag', strip: true };
    if (cp >= 0xE0020 && cp <= 0xE007F) {
      const dec = decodeTag(cp);
      const name = cp === 0xE007F ? 'CANCEL TAG'
        : cp === 0xE0020 ? 'TAG SPACE' : 'TAG LATIN ' + (/[a-z]/.test(dec) ? 'SMALL LETTER ' : /[A-Z]/.test(dec) ? 'CAPITAL LETTER ' : '') + dec.toUpperCase();
      return { tag: 'TAG', name, category: 'tag', strip: true };
    }
    if (cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F)) {
      if (cp === 0x09 || cp === 0x0A || cp === 0x0D || cp === 0x85) return null; // whitespace / NEL (explicit)
      const i = cp <= 0x1F ? cp * 2 : cp === 0x7F ? -1 : (cp - 0x80) * 2;
      if (cp === 0x7F) return { tag: 'DEL', name: 'DELETE', category: 'control', strip: true };
      const t = cp <= 0x1F ? C0 : C1;
      return { tag: t[i], name: t[i + 1], category: 'control', strip: true };
    }
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      return { tag: 'SURR', name: 'UNPAIRED SURROGATE (invalid)', category: 'control', strip: true };
    }
    return null;
  }

  // A tag character E0020+x carries ASCII x (E0020..E007E). Everything else -> null.
  export function decodeTag(cp) {
    return cp >= 0xE0020 && cp <= 0xE007E ? String.fromCharCode(cp - 0xE0000) : null;
  }

  // ---------------------------------------------------------------------
  // Data table 2 \u2014 curated confusables subset (UTS #39, single code point ->
  // single ASCII char, near-identical in common fonts). NOT the full file.
  //   cp -> { latin, script }
  // ---------------------------------------------------------------------
  export const CONFUSABLES = {};
  function conf(script, pairs) {
    for (const [cp, latin] of pairs) CONFUSABLES[cp] = { latin, script };
  }
  conf('Cyrillic', [
    [0x0430, 'a'], [0x0441, 'c'], [0x0435, 'e'], [0x043E, 'o'], [0x0440, 'p'], [0x0445, 'x'],
    [0x0443, 'y'], [0x0456, 'i'], [0x0458, 'j'], [0x0455, 's'], [0x0501, 'd'], [0x04BB, 'h'],
    [0x051B, 'q'], [0x051D, 'w'],
    [0x0410, 'A'], [0x0412, 'B'], [0x0421, 'C'], [0x0415, 'E'], [0x041D, 'H'], [0x0406, 'I'],
    [0x0408, 'J'], [0x041A, 'K'], [0x041C, 'M'], [0x041E, 'O'], [0x0420, 'P'], [0x0405, 'S'],
    [0x0422, 'T'], [0x0425, 'X'], [0x0423, 'Y'],
  ]);
  conf('Greek', [
    [0x03BF, 'o'], [0x03BD, 'v'], [0x03B9, 'i'], [0x03B1, 'a'],
    [0x0391, 'A'], [0x0392, 'B'], [0x0395, 'E'], [0x0396, 'Z'], [0x0397, 'H'], [0x0399, 'I'],
    [0x039A, 'K'], [0x039C, 'M'], [0x039D, 'N'], [0x039F, 'O'], [0x03A1, 'P'], [0x03A4, 'T'],
    [0x03A5, 'Y'], [0x03A7, 'X'],
  ]);
  conf('Latin-like', [
    [0x0131, 'i'], [0x01C0, 'l'], [0x217C, 'l'], [0x2160, 'I'], [0x2113, 'l'], [0x1D0F, 'o'], [0x0261, 'g'],
  ]);
  conf('Punctuation', [
    [0x2010, '-'], [0x2011, '-'], [0x2013, '-'], [0x2212, '-'],
    [0x02B9, "'"], [0x2032, "'"], [0xFF07, "'"], [0x2018, "'"], [0x2019, "'"],
    [0x201C, '"'], [0x201D, '"'], [0x2024, '.'], [0x201A, ','], [0x2215, '/'], [0x2044, '/'], [0xFF3C, '\\'],
  ]);

  // ---------------------------------------------------------------------
  // Small helpers (local on purpose: text-toolkit's equivalents are private)
  // ---------------------------------------------------------------------
  export function cpLabel(cp) {
    return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  }

  // UTF-16 code units of one code point as uppercase hex strings.
  export function utf16Units(cp) {
    const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
    if (cp <= 0xFFFF) return [hex(cp)];
    const v = cp - 0x10000;
    return [hex(0xD800 + (v >> 10)), hex(0xDC00 + (v & 0x3FF))];
  }

  const GC_LIST = ['Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Mn', 'Mc', 'Me', 'Nd', 'Nl', 'No', 'Pc', 'Pd', 'Ps', 'Pe',
    'Pi', 'Pf', 'Po', 'Sm', 'Sc', 'Sk', 'So', 'Zs', 'Zl', 'Zp', 'Cc', 'Cf', 'Cs', 'Co', 'Cn'];
  const GC_RES = GC_LIST.map((gc) => [gc, new RegExp('^\\p{' + gc + '}$', 'u')]);

  // General category (two letters) of a single code point string.
  export function generalCategory(ch) {
    for (const [gc, re] of GC_RES) if (re.test(ch)) return gc;
    return 'Cn';
  }

  const RE_FALLBACK_CF = /^\p{Cf}$/u;
  const RE_FALLBACK_ZS = /^\p{Zs}$/u;
  const RE_PICT = /^\p{Extended_Pictographic}$/u;
  const RE_EMOJI_MOD = /^\p{Emoji_Modifier}$/u;

  // Steps 1-3 of the detection order for one code point. Returns
  // { tag, name, category, strip } or null (plain character).
  export function classifyCodePoint(cp) {
    if (cp === 0x20) return null; // the ordinary space
    const explicit = INVISIBLES[cp];
    if (explicit) return explicit;
    const range = rangeRule(cp);
    if (range) return range;
    const ch = String.fromCodePoint(cp);
    if (RE_FALLBACK_CF.test(ch)) return { tag: 'CF', name: 'FORMAT CHARACTER', category: 'format', strip: true };
    if (RE_FALLBACK_ZS.test(ch)) return { tag: 'SP', name: 'SPACE SEPARATOR', category: 'space', strip: false };
    return null;
  }

  // ---------------------------------------------------------------------
  // scan(text)
  // ---------------------------------------------------------------------
  function utf8Hex(ch, cp) {
    if (cp >= 0xD800 && cp <= 0xDFFF) return null; // lone surrogate has no valid UTF-8
    return bytesToHex(textToBytes(ch)).toUpperCase().replace(/(..)(?=.)/g, '$1 ');
  }

  // The code points of `text` as [{cp, ch, index}] (index = UTF-16 offset).
  function codePoints(text) {
    const out = [];
    let index = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      out.push({ cp, ch, index });
      index += ch.length;
    }
    return out;
  }

  const RE_TOKEN = /[^\s\p{P}]+/gu;
  const RE_LATIN = /\p{Script=Latin}/u;
  const RE_CYR_GRK = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

  // Words that mix Latin with Cyrillic or Greek letters (the homograph signal).
  export function findMixedScript(text) {
    const out = [];
    for (const m of text.matchAll(RE_TOKEN)) {
      const word = m[0];
      if (RE_LATIN.test(word) && RE_CYR_GRK.test(word)) {
        out.push({ word, start: m.index, end: m.index + word.length });
      }
    }
    return out;
  }

  // True if there is a whole word (3+ letters) written purely in Cyrillic/Greek:
  // likely legitimate text that "Replace confusables" would damage.
  export function hasLegitNonLatin(text) {
    for (const m of text.matchAll(RE_TOKEN)) {
      const w = m[0];
      if ([...w].length >= 3 && /^[\p{Script=Cyrillic}\p{Script=Greek}]+$/u.test(w)) return true;
    }
    return false;
  }

  export function scan(text) {
    text = String(text == null ? '' : text);
    const cps = codePoints(text);
    const items = [];
    const byCategory = {};
    for (const c of CATEGORIES) byCategory[c.id] = 0;
    let line = 1;
    let lineStart = 0; // UTF-16 index where the current line starts
    let hiddenAscii = '';

    for (let i = 0; i < cps.length; i++) {
      const { cp, ch, index } = cps[i];
      if (cp === 0x0A) { line++; lineStart = index + 1; continue; }
      let cls = classifyCodePoint(cp);
      let confusable = null;
      if (!cls && cp > 0x7F && CONFUSABLES[cp]) {
        const c = CONFUSABLES[cp];
        confusable = { latin: c.latin, script: c.script };
        cls = { tag: ch, name: c.script + ' look-alike of "' + c.latin + '"', category: 'confusable', strip: false };
      }
      if (!cls) continue;

      // Legit emoji machinery: ZWJ between pictographs, VS16 after a pictograph.
      let inEmoji = false;
      if (cp === 0x200D) {
        let p = i - 1;
        if (p >= 0 && cps[p].cp === 0xFE0F) p--;
        if (p >= 0 && RE_EMOJI_MOD.test(cps[p].ch)) p--; // skin tone: base is behind it
        const prev = p >= 0 ? cps[p] : null;
        const next = cps[i + 1];
        inEmoji = !!(prev && next && (RE_PICT.test(prev.ch) || RE_EMOJI_MOD.test(prev.ch)) && RE_PICT.test(next.ch));
      } else if (cp === 0xFE0F) {
        const prev = cps[i - 1];
        const next = cps[i + 1];
        inEmoji = !!((prev && RE_PICT.test(prev.ch)) || (prev && next && next.cp === 0x20E3));
      }

      const tagChar = decodeTag(cp);
      if (tagChar !== null) hiddenAscii += tagChar;

      byCategory[cls.category]++;
      items.push({
        index, line, column: index - lineStart + 1,
        cp, ch, hex: cpLabel(cp),
        name: cls.name, tag: cls.tag, category: cls.category, strip: cls.strip,
        confusable, inEmoji,
        decoded: tagChar,
        gc: generalCategory(ch),
        utf8: utf8Hex(ch, cp),
        utf16: utf16Units(cp),
      });
    }

    const mixedScript = findMixedScript(text);
    return {
      items,
      counts: { byCategory, flagged: items.length, total: cps.length },
      mixedScript,
      hiddenAscii,
    };
  }

  // ---------------------------------------------------------------------
  // Transforms
  // ---------------------------------------------------------------------
  export function normalizeText(text, form) {
    text = String(text == null ? '' : text);
    return form === 'NFC' || form === 'NFKC' ? text.normalize(form) : text;
  }

  export function defaultCleanOptions() {
    return {
      normalize: 'none',        // 'none' | 'NFC' | 'NFKC'
      spaces: true,             // non-ASCII spaces -> U+0020
      separators: true,         // LS / PS / NEL -> \n
      replaceConfusables: false,
      preserveEmoji: true,      // keep ZWJ between pictographs, VS16 after one
      collapse: false,          // runs of spaces/tabs -> one space
      trim: false,              // trim both ends of the whole text
      strip: {                  // remove by category
        zerowidth: true, bidi: true, format: true, tag: true, filler: true, control: true,
        variation: true,        // VS17-256
        vs1to16: false,         // VS1-16 (glyph choice / emoji presentation)
      },
    };
  }

  // How many code points the normalization form changed (prefix/suffix trimmed diff).
  function changedCodePoints(a, b) {
    if (a === b) return 0;
    const x = [...a];
    const y = [...b];
    let s = 0;
    while (s < x.length && s < y.length && x[s] === y[s]) s++;
    let e = 0;
    while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
    return Math.max(x.length, y.length) - s - e;
  }

  function isRemovable(item, strip, preserveEmoji) {
    if (preserveEmoji && item.inEmoji) return false;
    switch (item.category) {
      case 'variation': return item.cp <= 0xFE0F ? !!strip.vs1to16 : !!strip.variation;
      case 'space': case 'separator': case 'confusable': return false;
      default: return !!strip[item.category] && item.strip;
    }
  }

  // Pipeline (fixed order): normalize -> convert spaces/separators -> replace
  // confusables (opt) -> remove strip-set by category -> collapse/trim (opt).
  export function clean(text, opts) {
    const o = Object.assign(defaultCleanOptions(), opts || {});
    o.strip = Object.assign(defaultCleanOptions().strip, (opts && opts.strip) || {});
    let out = String(text == null ? '' : text);

    const normalized = normalizeText(out, o.normalize);
    const normalizedChanged = changedCodePoints(out, normalized);
    out = normalized;

    let converted = 0;
    let replaced = 0;
    if (o.spaces || o.separators || o.replaceConfusables) {
      let buf = '';
      for (const ch of out) {
        const cp = ch.codePointAt(0);
        const info = INVISIBLES[cp] || (cp === 0x20 ? null : classifyCodePoint(cp));
        if (info && info.category === 'space' && o.spaces) { buf += ' '; converted++; continue; }
        if (info && info.category === 'separator' && o.separators) { buf += '\n'; converted++; continue; }
        if (o.replaceConfusables && cp > 0x7F && CONFUSABLES[cp] && !info) {
          buf += CONFUSABLES[cp].latin; replaced++; continue;
        }
        buf += ch;
      }
      out = buf;
    }

    // Strip on a fresh scan of the transformed text (positions/emoji context now current).
    const { items } = scan(out);
    const kill = items.filter((it) => isRemovable(it, o.strip, o.preserveEmoji));
    let removed = 0;
    if (kill.length) {
      let buf = '';
      let pos = 0;
      for (const it of kill) {
        buf += out.slice(pos, it.index);
        pos = it.index + it.ch.length;
        removed++;
      }
      out = buf + out.slice(pos);
    }

    if (o.collapse) out = out.replace(/[ \t]{2,}/g, ' ');
    if (o.trim) out = out.trim();
    return { text: out, removed, converted, replaced, normalizedChanged };
  }

  // A sample that exercises every category.
  export const SAMPLE_TEXT =
    'Hello\u200Bworld\uFEFF \u2014 visit p\u0430ypal.com\u00A0today\n' +
    'Total:\u202E 100\u202C USD\n' +
    'Hidden: \u{E0068}\u{E0069}\u{E0021}\n' +
    'Family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a \u2764\uFE0F\n';
