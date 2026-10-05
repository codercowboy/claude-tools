import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, classifyCodePoint, INVISIBLES, CONFUSABLES, CATEGORIES, decodeTag, cpLabel, utf16Units, generalCategory, findMixedScript, hasLegitNonLatin } from '../../source/logic.mjs';
import { posAt } from '../../../../lib/utils/CtUtil.mjs';

const one = (s) => { const r = scan(s); assert.equal(r.items.length, 1, JSON.stringify(s)); return r.items[0]; };

test('every explicit table-1 row is detected with the spec name/category/strip', () => {
  const rows = [
    [0x200B, 'ZWSP', 'zerowidth', true], [0x200C, 'ZWNJ', 'zerowidth', true], [0x200D, 'ZWJ', 'zerowidth', true],
    [0x2060, 'WJ', 'zerowidth', true], [0xFEFF, 'BOM', 'zerowidth', true], [0x180E, 'MVS', 'zerowidth', true],
    [0x00AD, 'SHY', 'format', true], [0x034F, 'CGJ', 'format', true], [0x061C, 'ALM', 'bidi', true],
    [0x200E, 'LRM', 'bidi', true], [0x200F, 'RLM', 'bidi', true], [0x202A, 'LRE', 'bidi', true],
    [0x202B, 'RLE', 'bidi', true], [0x202C, 'PDF', 'bidi', true], [0x202D, 'LRO', 'bidi', true],
    [0x202E, 'RLO', 'bidi', true], [0x2066, 'LRI', 'bidi', true], [0x2067, 'RLI', 'bidi', true],
    [0x2068, 'FSI', 'bidi', true], [0x2069, 'PDI', 'bidi', true],
    [0x2061, 'FA', 'format', true], [0x2062, 'IT', 'format', true], [0x2063, 'IS', 'format', true], [0x2064, 'IP', 'format', true],
    [0x206A, 'ISS', 'format', true], [0x206F, 'NODS', 'format', true],
    [0xFFF9, 'IAA', 'format', true], [0xFFFA, 'IAS', 'format', true], [0xFFFB, 'IAT', 'format', true],
    [0xFFFC, 'OBJ', 'format', true], [0xFFFD, 'REPL', 'format', false],
    [0x00A0, 'NBSP', 'space', false], [0x1680, 'OGSP', 'space', false], [0x2000, 'EN-Q', 'space', false],
    [0x2007, 'FIGSP', 'space', false], [0x2009, 'THINSP', 'space', false], [0x200A, 'HAIRSP', 'space', false],
    [0x202F, 'NNBSP', 'space', false], [0x205F, 'MMSP', 'space', false], [0x3000, 'IDSP', 'space', false],
    [0x2028, 'LS', 'separator', false], [0x2029, 'PS', 'separator', false], [0x0085, 'NEL', 'separator', false],
    [0x3164, 'HF', 'filler', true], [0x115F, 'HCF', 'filler', true], [0x1160, 'HJF', 'filler', true],
    [0xFFA0, 'HWHF', 'filler', true], [0x2800, 'BRAILLE0', 'filler', true], [0x17B4, 'KHM', 'filler', true], [0x17B5, 'KHM', 'filler', true],
  ];
  for (const [cp, tag, category, strip] of rows) {
    const it = one('a' + String.fromCodePoint(cp) + 'b');
    assert.equal(it.cp, cp);
    assert.equal(it.tag, tag, cpLabel(cp));
    assert.equal(it.category, category, cpLabel(cp));
    assert.equal(it.strip, strip, cpLabel(cp));
    assert.ok(it.name && it.name !== '(unnamed)', cpLabel(cp));
  }
});

test('specific names and hex labels', () => {
  const z = one('x\u200By');
  assert.equal(z.name, 'ZERO WIDTH SPACE');
  assert.equal(z.hex, 'U+200B');
  assert.equal(one('\u202E').name, 'RIGHT-TO-LEFT OVERRIDE');
});

test('ordinary text, space, tab, LF, CR are not flagged', () => {
  const r = scan('Hello, world!\tTab\r\nLine two\n');
  assert.equal(r.items.length, 0);
  assert.equal(r.counts.flagged, 0);
  assert.equal(r.counts.total, 'Hello, world!\tTab\r\nLine two\n'.length);
});

test('variation selector ranges: VS1-16 not stripped by default, VS17-256 stripped', () => {
  for (let i = 0; i < 16; i++) {
    const it = one('a' + String.fromCodePoint(0xFE00 + i));
    assert.equal(it.category, 'variation'); assert.equal(it.tag, 'VS' + (i + 1)); assert.equal(it.strip, false);
  }
  for (const i of [0, 1, 100, 239]) {
    const it = one('a' + String.fromCodePoint(0xE0100 + i));
    assert.equal(it.category, 'variation'); assert.equal(it.tag, 'VS' + (i + 17)); assert.equal(it.strip, true);
    assert.equal(it.utf16.length, 2);
  }
});

test('tag characters: range, decode, hidden ASCII', () => {
  assert.equal(decodeTag(0xE0041), 'A');
  assert.equal(decodeTag(0xE0020), ' ');
  assert.equal(decodeTag(0xE007E), '~');
  assert.equal(decodeTag(0xE007F), null);
  assert.equal(decodeTag(0x41), null);
  const hidden = [...'secret'].map((c) => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join('');
  const r = scan('hi' + hidden + '!');
  assert.equal(r.items.length, 6);
  assert.ok(r.items.every((i) => i.category === 'tag' && i.strip));
  assert.equal(r.hiddenAscii, 'secret');
  assert.equal(r.items[0].decoded, 's');
  assert.equal(one('\u{E0001}').tag, 'LANG');
  assert.equal(one('\u{E007F}').name, 'CANCEL TAG');
});

test('C0/C1 controls flagged; tab/LF/CR excluded; DEL and C1 included; NEL is a separator', () => {
  for (let cp = 0; cp <= 0x1F; cp++) {
    const s = 'a' + String.fromCodePoint(cp) + 'b';
    if (cp === 9 || cp === 10 || cp === 13) { assert.equal(scan(s).items.length, 0, 'cp ' + cp); continue; }
    const it = one(s);
    assert.equal(it.category, 'control'); assert.equal(it.strip, true);
  }
  assert.equal(one('\u0000').tag, 'NUL');
  assert.equal(one('\u001B').tag, 'ESC');
  assert.equal(one('\u007F').tag, 'DEL');
  for (let cp = 0x80; cp <= 0x9F; cp++) {
    const it = one(String.fromCodePoint(cp));
    assert.equal(it.category, cp === 0x85 ? 'separator' : 'control', 'cp ' + cp);
  }
  assert.equal(one('\u009B').tag, 'CSI');
});

test('generic fallback: unlisted Cf and Zs are caught; plain space is not', () => {
  const cf = one('a\u0600b'); // ARABIC NUMBER SIGN is Cf, not in the table
  assert.equal(cf.category, 'format'); assert.equal(cf.name, 'FORMAT CHARACTER'); assert.equal(cf.strip, true);
  const cf2 = one('\u{E0000}'.replace('\u{E0000}', '\u{1D173}')); // MUSICAL SYMBOL BEGIN BEAM (Cf)
  assert.equal(cf2.category, 'format');
  assert.equal(classifyCodePoint(0x20), null);
  assert.equal(one('a\u2008b').category, 'space'); // PUNCTUATION SPACE is in the 2000 range
});

test('lone surrogates: invalid, flagged, no UTF-8', () => {
  const r = scan('a\uD800b');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].tag, 'SURR');
  assert.equal(r.items[0].category, 'control');
  assert.equal(r.items[0].strip, true);
  assert.equal(r.items[0].utf8, null);
  assert.equal(r.counts.total, 3);
  assert.equal(scan('\uDC00').items[0].tag, 'SURR');
  // a valid pair is one code point, not two surrogates
  assert.equal(scan('\u{1F600}').items.length, 0);
  assert.equal(scan('\u{1F600}').counts.total, 1);
});

test('astral characters are one code point; positions are UTF-16 based', () => {
  const r = scan('\u{1F600}\u200B');
  assert.equal(r.counts.total, 2);
  assert.equal(r.items[0].index, 2);
  assert.equal(r.items[0].column, 3);
});

test('line/column agrees with jbc posAt', () => {
  const text = 'ab\ncd\u200Be\n\u{1F600}\u200Df\r\n\u00A0z\uFEFF';
  for (const it of scan(text).items) {
    const p = posAt(text, it.index);
    assert.deepEqual([it.line, it.column], [p.line, p.column], it.hex);
  }
});

test('inspector data: utf8 bytes, utf16 units, general category', () => {
  const z = one('\u200B');
  assert.equal(z.utf8, 'E2 80 8B');
  assert.deepEqual(z.utf16, ['200B']);
  assert.equal(z.gc, 'Cf');
  const tag = one('\u{E0041}');
  assert.equal(tag.utf8, 'F3 A0 81 81');
  assert.deepEqual(tag.utf16, ['DB40', 'DC41']);
  assert.equal(one('\u00A0').utf8, 'C2 A0');
  assert.equal(one('\u00A0').gc, 'Zs');
  assert.equal(one('\u0430').gc, 'Ll');
  assert.equal(generalCategory('A'), 'Lu'); assert.equal(generalCategory('1'), 'Nd'); assert.equal(generalCategory('!'), 'Po');
});

test('cpLabel / utf16Units', () => {
  assert.equal(cpLabel(0x41), 'U+0041');
  assert.equal(cpLabel(0x1F600), 'U+1F600');
  assert.deepEqual(utf16Units(0x1F600), ['D83D', 'DE00']);
  assert.deepEqual(utf16Units(0x20), ['0020']);
});

test('counts: per-category and flagged match the items', () => {
  const r = scan('a\u200Bb\u200Cc\u202Ed\u00A0e\u0430f');
  assert.deepEqual([r.counts.byCategory.zerowidth, r.counts.byCategory.bidi, r.counts.byCategory.space, r.counts.byCategory.confusable], [2, 1, 1, 1]);
  assert.equal(r.counts.flagged, 5);
  assert.equal(r.counts.total, 11);
  assert.equal(Object.keys(r.counts.byCategory).length, CATEGORIES.length);
});

test('confusables: flagged only for non-ASCII; chip data names the Latin twin', () => {
  const it = one('p\u0430ypal');
  assert.equal(it.category, 'confusable');
  assert.deepEqual(it.confusable, { latin: 'a', script: 'Cyrillic' });
  assert.equal(it.hex, 'U+0430');
  assert.equal(scan('paypal a c e o p').items.length, 0);
  assert.equal(one('\u03BF').confusable.latin, 'o'); // Greek omicron
  assert.equal(one('\u2019').confusable.latin, "'");
  assert.equal(one('\u2212').confusable.latin, '-');
  assert.equal(Object.keys(CONFUSABLES).every((k) => Number(k) > 0x7F), true);
  assert.ok(Object.keys(CONFUSABLES).length >= 50);
});

test('mixed-script words', () => {
  const r = scan('hello p\u0430ypal \u043F\u0440\u0438\u0432\u0435\u0442 world');
  assert.equal(r.mixedScript.length, 1);
  assert.equal(r.mixedScript[0].word, 'p\u0430ypal');
  assert.equal(r.mixedScript[0].start, 6);
  assert.equal(r.mixedScript[0].end, 12);
  // a mixed word is flagged even when no char is in the confusables table
  assert.equal(findMixedScript('abc\u0434').length, 1); // Latin + Cyrillic ?
  assert.equal(findMixedScript('x\u03C0').length, 1); // Latin + Greek pi
  assert.equal(findMixedScript('hello \u043F\u0440\u0438\u0432\u0435\u0442').length, 0);
  assert.equal(findMixedScript('plain ascii text').length, 0);
  assert.equal(hasLegitNonLatin('\u043F\u0440\u0438\u0432\u0435\u0442'), true);
  assert.equal(hasLegitNonLatin('hello'), false);
  assert.equal(hasLegitNonLatin('\u0430\u0431'), false); // 2 chars only
});

test('emoji machinery is marked inEmoji; stray ZWJ/VS16 are not', () => {
  const fam = scan('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
  assert.equal(fam.items.length, 2);
  assert.ok(fam.items.every((i) => i.inEmoji));
  const heart = scan('\u2764\uFE0F');
  assert.equal(heart.items.length, 1);
  assert.equal(heart.items[0].inEmoji, true);
  assert.equal(scan('a\u200Db').items[0].inEmoji, false);
  assert.equal(scan('a\uFE0F').items[0].inEmoji, false);
  assert.equal(scan('\u{1F468}\u200Dx').items[0].inEmoji, false);
  // skin tone + VS16 before the joiner
  assert.equal(scan('\u{1F468}\u{1F3FD}\u200D\u{1F9B0}').items[0].inEmoji, true);
  assert.equal(scan('\u{1F468}\uFE0F\u200D\u{1F469}').items.every((i) => i.inEmoji), true);
});

test('empty and non-string input', () => {
  assert.equal(scan('').counts.total, 0);
  assert.equal(scan(null).counts.flagged, 0);
});

test('INVISIBLES table has a name for every row', () => {
  for (const [cp, row] of Object.entries(INVISIBLES)) {
    assert.ok(row.name && row.tag && row.category, cp);
    assert.ok(CATEGORIES.some((c) => c.id === row.category), cp);
  }
});
