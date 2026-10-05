// =====================================================================
// Barcode Generator - pure logic (DOM-free, unit-tested)
//
// encodeCode128 / encodeEan13 / encodeUpcA / encodeCode39 each return
//   { symbology, modules, text, checkDigit, error, values? }
// where `modules` is a string of '1' (bar) and '0' (space), one char per
// module, WITHOUT quiet zones. Invalid input yields { error } and an empty
// module string, never an exception.
//
// layout(enc, opts) is the shared geometry for the SVG and the canvas PNG;
// toSvg(enc, opts) builds the SVG string (preview and export are the same
// string). Check digits are hand-rolled (no crc32).
//
// app.mjs inlines this file at build time; the jbc imports below are
// flattened in once and the `export`s are stripped. Every CtUtil / image
// name app.mjs needs is imported HERE, and app.mjs redeclares nothing.
// =====================================================================
import { escapeHtml, escapeAttr, clampInt, el, debounce, persistState, onceFlag, downloadBlob } from '../../../lib/utils/CtUtil.mjs';
import { hexToRgb, rgbToHex, canvasToBlob } from '../../../lib/utils/image/CtImageUtil.mjs';

export const SYMBOLOGIES = [
  { id: 'code128', label: 'Code 128', sample: 'PJJ123C' },
  { id: 'ean13', label: 'EAN-13', sample: '590123412345' },
  { id: 'upca', label: 'UPC-A', sample: '03600029145' },
  { id: 'code39', label: 'Code 39', sample: 'CODE39' },
];
export const BARCODE_LIMITS = { maxChars: 80, scale: [1, 20], height: [10, 300], quiet: [0, 100] };
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const SVG_FONT = "'OCR-B','Courier New',monospace";
export const DEFAULT_FG = '#000000';
export const DEFAULT_BG = '#ffffff';
export const TEXT_SIZE = 10;
export const TEXT_BAND = 14;

// ---- Code 128 -------------------------------------------------------
export const CODE128_WIDTHS = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
export const C128 = { CODE_C: 99, CODE_B: 100, CODE_A: 101, START_A: 103, START_B: 104, START_C: 105, STOP: 106 };

export function widthsToModules(widths) {
  let out = '';
  for (let i = 0; i < widths.length; i++) out += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
  return out;
}
export const CODE128_PATTERNS = CODE128_WIDTHS.map(widthsToModules);

const isDigitCode = (c) => c >= 48 && c <= 57;
function digitRunAt(codes, i) {
  let n = 0;
  while (i + n < codes.length && isDigitCode(codes[i + n])) n++;
  return n;
}

// Greedy auto A/B/C plan -> symbol values (start .. data, no checksum/stop).
export function planCode128(codes) {
  const out = [];
  let mode;
  const run0 = digitRunAt(codes, 0);
  if (run0 >= 4 || (run0 === 2 && codes.length === 2)) mode = 'C';
  else if (codes[0] < 32) mode = 'A';
  else mode = 'B';
  out.push(mode === 'C' ? C128.START_C : mode === 'A' ? C128.START_A : C128.START_B);
  const emit = (m, c) => out.push(m === 'A' ? (c < 32 ? c + 64 : c - 32) : c - 32);
  let i = 0;
  while (i < codes.length) {
    const c = codes[i];
    if (mode === 'C') {
      if (digitRunAt(codes, i) >= 2) {
        out.push((c - 48) * 10 + (codes[i + 1] - 48));
        i += 2;
        continue;
      }
      mode = c < 32 ? 'A' : 'B';
      out.push(mode === 'A' ? C128.CODE_A : C128.CODE_B);
      continue;
    }
    const run = digitRunAt(codes, i);
    if (run >= (i + run >= codes.length ? 4 : 6)) {
      if (run % 2 === 1) { emit(mode, c); i++; }
      out.push(C128.CODE_C);
      mode = 'C';
      continue;
    }
    if (mode === 'A' && c >= 96) { mode = 'B'; out.push(C128.CODE_B); continue; }
    if (mode === 'B' && c < 32) { mode = 'A'; out.push(C128.CODE_A); continue; }
    emit(mode, c);
    i++;
  }
  return out;
}

export function code128Checksum(values) {
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += i * values[i];
  return sum % 103;
}

// Decode symbol values (start .. data, no checksum/stop) back to text.
export function decodeCode128Values(values) {
  let mode = values[0] === C128.START_A ? 'A' : values[0] === C128.START_B ? 'B' : 'C';
  let s = '';
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (mode === 'C') {
      if (v === C128.CODE_B) mode = 'B';
      else if (v === C128.CODE_A) mode = 'A';
      else s += (v < 10 ? '0' : '') + v;
    } else if (v === C128.CODE_C) mode = 'C';
    else if (v === C128.CODE_B && mode === 'A') mode = 'B';
    else if (v === C128.CODE_A && mode === 'B') mode = 'A';
    else s += String.fromCharCode(mode === 'A' && v >= 64 ? v - 64 : v + 32);
  }
  return s;
}

function failure(symbology, error) {
  return { symbology, modules: '', text: '', checkDigit: '', error };
}
const printable = (s) => s.replace(/[\u0000-\u001f\u007f]/g, '');

export function encodeCode128(input) {
  const str = input == null ? '' : String(input);
  if (!str.length) return failure('code128', 'Enter some text to encode.');
  if (str.length > BARCODE_LIMITS.maxChars) return failure('code128', 'Too long: at most ' + BARCODE_LIMITS.maxChars + ' characters.');
  const codes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 127) return failure('code128', 'Code 128 supports ASCII only (character ' + (i + 1) + ' is outside 0-127).');
    codes.push(c);
  }
  const values = planCode128(codes);
  const checksum = code128Checksum(values);
  const all = values.concat([checksum, C128.STOP]);
  const modules = all.map((v) => CODE128_PATTERNS[v]).join('');
  return { symbology: 'code128', modules, text: printable(str), checkDigit: String(checksum), error: '', values: values.concat([checksum]) };
}

// ---- EAN-13 / UPC-A -------------------------------------------------
export const EAN_L = '0001101 0011001 0010011 0111101 0100011 0110001 0101111 0111011 0110111 0001011'.split(' ');
export const EAN_G = EAN_L.map((p) => p.split('').reverse().join(''));
export const EAN_R = EAN_L.map((p) => p.replace(/[01]/g, (b) => (b === '1' ? '0' : '1')));
export const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

// Mod-10 check digit for a string of data digits (EAN-13: 12 digits, UPC-A: 11).
// Weights alternate 3,1,3,1 from the rightmost data digit.
export function eanCheckDigit(digits) {
  const s = String(digits);
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const w = (s.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += w * (s.charCodeAt(i) - 48);
  }
  return (10 - (sum % 10)) % 10;
}

function checkedDigits(symbology, input, dataLen, label) {
  const s = input == null ? '' : String(input).replace(/[\s-]/g, '');
  if (!s.length) return { err: failure(symbology, 'Enter ' + dataLen + ' or ' + (dataLen + 1) + ' digits.') };
  if (!/^[0-9]+$/.test(s)) return { err: failure(symbology, label + ' accepts digits only.') };
  if (s.length !== dataLen && s.length !== dataLen + 1) {
    return { err: failure(symbology, label + ' needs ' + dataLen + ' digits (check digit added) or ' + (dataLen + 1) + ' (check digit verified); got ' + s.length + '.') };
  }
  const check = eanCheckDigit(s.slice(0, dataLen));
  if (s.length === dataLen + 1 && Number(s[dataLen]) !== check) {
    return { err: failure(symbology, 'Check digit mismatch: expected ' + check + ' but got ' + s[dataLen] + '.') };
  }
  return { digits: s.slice(0, dataLen) + check, check };
}

function eanModules(d13) {
  const parity = EAN_PARITY[Number(d13[0])];
  let m = '101';
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[Number(d13[i])];
  m += '01010';
  for (let i = 7; i <= 12; i++) m += EAN_R[Number(d13[i])];
  return m + '101';
}

export function encodeEan13(input) {
  const r = checkedDigits('ean13', input, 12, 'EAN-13');
  if (r.err) return r.err;
  return { symbology: 'ean13', modules: eanModules(r.digits), text: r.digits, checkDigit: String(r.check), error: '' };
}

export function encodeUpcA(input) {
  const r = checkedDigits('upca', input, 11, 'UPC-A');
  if (r.err) return r.err;
  return { symbology: 'upca', modules: eanModules('0' + r.digits), text: r.digits, checkDigit: String(r.check), error: '' };
}

// ---- Code 39 --------------------------------------------------------
export const CODE39_PATTERNS = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', A: '100001001', B: '001001001', C: '101001000', D: '000011001', E: '100011000', F: '001011000',
  G: '000001101', H: '100001100', I: '001001100', J: '000011100', K: '100000011', L: '001000011', M: '101000010', N: '000010011',
  O: '100010010', P: '001010010', Q: '000000111', R: '100000110', S: '001000110', T: '000010110', U: '110000001', V: '011000001',
  W: '111000000', X: '010010001', Y: '110010000', Z: '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010',
};
export const CODE39_MOD43 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

export function code39Modules(chars) {
  return chars.split('').map((ch) => CODE39_PATTERNS[ch].split('').map((p, k) => (k % 2 === 0 ? '1' : '0').repeat(p === '1' ? 3 : 1)).join('')).join('0');
}

// opts: { check: bool (append mod-43 check char), star: bool (text shows *DATA*) }
export function encodeCode39(input, opts) {
  const o = opts || {};
  const str = input == null ? '' : String(input).toUpperCase();
  if (!str.length) return failure('code39', 'Enter some text to encode.');
  if (str.length > BARCODE_LIMITS.maxChars) return failure('code39', 'Too long: at most ' + BARCODE_LIMITS.maxChars + ' characters.');
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '*') return failure('code39', 'The * character is reserved for start/stop and cannot be encoded.');
    if (!Object.prototype.hasOwnProperty.call(CODE39_PATTERNS, str[i])) {
      return failure('code39', 'Code 39 supports 0-9, A-Z, space and - . $ / + % only (unsupported: "' + printable(str[i]) + '" at position ' + (i + 1) + ').');
    }
  }
  let data = str;
  let check = '';
  if (o.check) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) sum += CODE39_MOD43.indexOf(str[i]);
    check = CODE39_MOD43[sum % 43];
    data = str + check;
  }
  const modules = code39Modules('*' + data + '*');
  return { symbology: 'code39', modules, text: o.star ? '*' + data + '*' : data, checkDigit: check, error: '' };
}

export function encode(symbology, input, opts) {
  if (symbology === 'ean13') return encodeEan13(input);
  if (symbology === 'upca') return encodeUpcA(input);
  if (symbology === 'code39') return encodeCode39(input, opts);
  return encodeCode128(input);
}

// ---- colors / contrast ------------------------------------------------
export function normalizeHex(v, fallback) {
  const rgb = hexToRgb(v);
  return rgb ? rgbToHex(rgb) : fallback;
}
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function contrastWarning(fg, bg) {
  const f = normalizeHex(fg, DEFAULT_FG);
  const b = normalizeHex(bg, DEFAULT_BG);
  if (luminance(f) > luminance(b)) return 'Light bars on a dark background (inverted) are rejected by many scanners. Use dark bars on a light background.';
  if (contrastRatio(f, b) < 4) return 'Low contrast between bars and background (' + contrastRatio(f, b).toFixed(1) + ':1). Scanners need dark bars on a light background; aim for 4:1 or better.';
  return '';
}

// ---- layout / SVG -----------------------------------------------------
export function defaultQuiet(symbology) {
  return symbology === 'ean13' || symbology === 'upca' ? { left: 11, right: 7 } : { left: 10, right: 10 };
}

// Merge adjacent '1' modules into runs: [{ x, w }] (x relative to symbol start).
export function moduleRuns(modules) {
  const runs = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let j = i;
      while (j < modules.length && modules[j] === '1') j++;
      runs.push({ x: i, w: j - i });
      i = j;
    } else i++;
  }
  return runs;
}

export function layout(enc, opts) {
  const o = opts || {};
  const dq = defaultQuiet(enc.symbology);
  const hasQ = (v) => v !== null && v !== undefined && v !== '';
  const q = BARCODE_LIMITS.quiet;
  const quietL = hasQ(o.quietLeft) ? clampInt(o.quietLeft, q[0], q[1], dq.left) : dq.left;
  const quietR = hasQ(o.quietRight) ? clampInt(o.quietRight, q[0], q[1], dq.right) : dq.right;
  const scale = clampInt(o.scale, BARCODE_LIMITS.scale[0], BARCODE_LIMITS.scale[1], 2);
  const height = clampInt(o.height, BARCODE_LIMITS.height[0], BARCODE_LIMITS.height[1], 60);
  const showText = o.showText !== false;
  const n = enc.modules.length;
  const runs = moduleRuns(enc.modules).map((r) => ({ x: r.x + quietL, w: r.w }));
  const W = quietL + n + quietR;
  const H = height + (showText ? TEXT_BAND : 0);
  const y = height + 12;
  const texts = [];
  if (showText && n > 0) {
    const t = enc.text;
    if (enc.symbology === 'ean13') {
      texts.push({ s: t[0], x: quietL - 1.5, y, anchor: 'end', size: TEXT_SIZE });
      texts.push({ s: t.slice(1, 7), x: quietL + 24, y, anchor: 'middle', size: TEXT_SIZE });
      texts.push({ s: t.slice(7), x: quietL + 71, y, anchor: 'middle', size: TEXT_SIZE });
    } else if (enc.symbology === 'upca') {
      texts.push({ s: t[0], x: quietL - 1.5, y, anchor: 'end', size: 8 });
      texts.push({ s: t.slice(1, 6), x: quietL + 24, y, anchor: 'middle', size: TEXT_SIZE });
      texts.push({ s: t.slice(6, 11), x: quietL + 71, y, anchor: 'middle', size: TEXT_SIZE });
      texts.push({ s: t[11], x: quietL + n + 1.5, y, anchor: 'start', size: 8 });
    } else if (t.length) {
      texts.push({ s: t, x: quietL + n / 2, y, anchor: 'middle', size: TEXT_SIZE });
    }
  }
  return {
    W, H, scale, height, quietL, quietR, runs, texts, showText,
    fg: normalizeHex(o.fg, DEFAULT_FG),
    bg: normalizeHex(o.bg, DEFAULT_BG),
  };
}

// The one SVG string used by the live preview AND the export. Empty string on error.
export function toSvg(enc, opts) {
  if (!enc || enc.error || !enc.modules) return '';
  const g = layout(enc, opts);
  const d = g.runs.map((r) => 'M' + r.x + ',0h' + r.w + 'v' + g.height + 'h-' + r.w + 'z').join('');
  let s = '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + g.W + ' ' + g.H + '" width="' + (g.W * g.scale) + '" height="' + (g.H * g.scale) + '" shape-rendering="crispEdges" role="img" aria-label="' + escapeAttr(enc.symbology + ' barcode ' + enc.text) + '">';
  s += '<rect width="' + g.W + '" height="' + g.H + '" fill="' + g.bg + '"/>';
  s += '<path fill="' + g.fg + '" d="' + d + '"/>';
  for (const t of g.texts) {
    s += '<text x="' + t.x + '" y="' + t.y + '" font-family="' + SVG_FONT + '" font-size="' + t.size + '" text-anchor="' + t.anchor + '" fill="' + g.fg + '">' + escapeHtml(t.s) + '</text>';
  }
  return s + '</svg>';
}
