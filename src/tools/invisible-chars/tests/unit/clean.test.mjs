import test from 'node:test';
import assert from 'node:assert/strict';
import { clean, normalizeText, defaultCleanOptions, scan, SAMPLE_TEXT } from '../../source/logic.mjs';

test('default clean: removes zero-width, bidi, tags; converts NBSP; keeps plain text exactly', () => {
  const r = clean('a\u200Bb\uFEFFc\u202Ed\u2066e\u{E0041}f\u00A0g');
  assert.equal(r.text, 'abcdef g');
  assert.equal(r.removed, 5);
  assert.equal(r.converted, 1);
  assert.equal(r.replaced, 0);
});

test('plain text passes through untouched (tab, CRLF, accents, emoji)', () => {
  const t = 'Caf\u00E9\tna\u00EFve\r\n\u{1F600} done\n';
  const r = clean(t);
  assert.equal(r.text, t);
  assert.deepEqual([r.removed, r.converted, r.replaced], [0, 0, 0]);
});

test('every default-strip category is removed', () => {
  const samples = {
    zerowidth: '\u200B\u200C\u2060\uFEFF\u180E', bidi: '\u061C\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069',
    format: '\u00AD\u034F\u2061\u2062\u2063\u2064\u206A\uFFF9\uFFFC\u0600', tag: '\u{E0001}\u{E0041}\u{E007F}',
    filler: '\u3164\u115F\u1160\uFFA0\u2800\u17B4\u17B5', control: '\u0000\u0007\u001B\u007F\u0080\u009F',
    variation: '\u{E0100}\u{E01EF}',
  };
  for (const [cat, s] of Object.entries(samples)) {
    assert.equal(clean('a' + s + 'b').text, 'ab', cat);
  }
  assert.equal(clean('a\uD800b').text, 'ab'); // lone surrogate
});

test('REPLACEMENT CHARACTER is flagged but never stripped', () => {
  assert.equal(clean('a\uFFFDb').text, 'a\uFFFDb');
});

test('strip by category checkbox: unchecking keeps that category only', () => {
  const t = 'a\u200Bb\u202Ec\u00ADd';
  assert.equal(clean(t, { strip: { bidi: false } }).text, 'ab\u202Ecd');
  assert.equal(clean(t, { strip: { zerowidth: false } }).text, 'a\u200Bbcd');
  assert.equal(clean(t, { strip: { format: false } }).text, 'abc\u00ADd');
  const none = { strip: { zerowidth: false, bidi: false, format: false, tag: false, filler: false, control: false, variation: false } };
  assert.equal(clean(t, none).text, t);
});

test('variation selectors: VS1-16 kept by default, removed with its own checkbox; VS17-256 removed', () => {
  const t = 'a\uFE00b\uFE0Ec\u{E0100}d';
  assert.equal(clean(t).text, 'a\uFE00b\uFE0Ecd');
  assert.equal(clean(t, { strip: { vs1to16: true } }).text, 'abcd');
  assert.equal(clean(t, { strip: { variation: false } }).text, 'a\uFE00b\uFE0Ec\u{E0100}d');
});

test('emoji preservation: ZWJ sequences and VS16 kept by default, stray ones removed', () => {
  const fam = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  assert.equal(clean(fam).text, fam);
  assert.equal(clean(fam).removed, 0);
  assert.equal(clean('\u2764\uFE0F', { strip: { vs1to16: true } }).text, '\u2764\uFE0F');
  assert.equal(clean('a\u200Db' + fam).text, 'ab' + fam);
  assert.equal(clean(fam, { preserveEmoji: false }).text, '\u{1F468}\u{1F469}\u{1F467}');
  assert.equal(clean('\u2764\uFE0F', { preserveEmoji: false, strip: { vs1to16: true } }).text, '\u2764');
  // ZWJ is stripped by default when the zero-width box is off? no: unchecked box keeps it
  assert.equal(clean('a\u200Db', { strip: { zerowidth: false } }).text, 'a\u200Db');
});

test('space conversion: NBSP and the Zs family become U+0020; toggle off keeps them', () => {
  const spaces = '\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000';
  const r = clean('a' + spaces + 'b');
  assert.equal(r.text, 'a' + ' '.repeat(spaces.length) + 'b');
  assert.equal(r.converted, spaces.length);
  assert.equal(clean('a\u00A0b', { spaces: false }).text, 'a\u00A0b');
  assert.equal(clean('a\u00A0b', { spaces: false }).converted, 0);
});

test('separators: LS, PS, NEL become newline; toggle off keeps them', () => {
  assert.equal(clean('a\u2028b\u2029c\u0085d').text, 'a\nb\nc\nd');
  assert.equal(clean('a\u2028b\u2029c\u0085d').converted, 3);
  assert.equal(clean('a\u2028b', { separators: false }).text, 'a\u2028b');
});

test('confusable replacement is opt-in and exact', () => {
  const t = 'p\u0430yp\u0430l \u0410\u0412\u0421 \u2018hi\u2019 \u201Cq\u201D \u2212 \u03BF';
  assert.equal(clean(t).text, t); // default OFF
  const r = clean(t, { replaceConfusables: true });
  assert.equal(r.text, 'paypal ABC \'hi\' "q" - o');
  assert.equal(r.replaced, 11);
  assert.equal(clean('plain', { replaceConfusables: true }).replaced, 0);
});

test('collapse / trim are off by default and work when on', () => {
  assert.equal(clean('  a   b\t\tc  ').text, '  a   b\t\tc  ');
  assert.equal(clean('  a   b\t\tc  ', { collapse: true }).text, ' a b c ');
  assert.equal(clean('  a   b  ', { trim: true }).text, 'a   b');
  assert.equal(clean('\u00A0\u00A0a\u00A0\u00A0b\u00A0', { collapse: true, trim: true }).text, 'a b');
});

test('pipeline order: normalize before strip, strip after confusables, spaces before collapse', () => {
  // NFKC turns NBSP into a space itself, so nothing is left to "convert".
  const r = clean('a\u00A0b', { normalize: 'NFKC' });
  assert.equal(r.text, 'a b'); assert.equal(r.converted, 0); assert.equal(r.normalizedChanged, 1);
  // NFKC maps the Cyrillic-lookalike script letter U+2113 to Latin l; confusable replace then has nothing left
  const r2 = clean('\u2113', { normalize: 'NFKC', replaceConfusables: true });
  assert.equal(r2.text, 'l'); assert.equal(r2.replaced, 0);
  // same input without normalize is replaced by the confusables step
  assert.equal(clean('\u2113', { replaceConfusables: true }).replaced, 1);
});

test('NFC / NFKC: exact behaviour and non-effects on invisibles', () => {
  assert.equal(normalizeText('e\u0301', 'NFC'), '\u00E9');
  assert.equal(normalizeText('e\u0301', 'none'), 'e\u0301');
  assert.equal(normalizeText('\uFF21\uFB01\u00B2', 'NFKC'), 'Afi2');
  assert.equal(normalizeText('\uFF21', 'NFC'), '\uFF21');
  for (const form of ['NFC', 'NFKC']) {
    for (const ch of ['\u200B', '\uFEFF', '\u202E', '\u200D', '\u{E0041}', '\u2060']) {
      assert.equal(normalizeText('a' + ch + 'b', form), 'a' + ch + 'b', form + ' keeps ' + ch.codePointAt(0).toString(16));
    }
    assert.equal(normalizeText('\u0430', form), '\u0430'); // Cyrillic a not mapped to Latin
  }
  assert.equal(normalizeText('a\u00A0b', 'NFC'), 'a\u00A0b'); // NFC leaves NBSP
  assert.equal(normalizeText('a\u00A0b', 'NFKC'), 'a b');
  assert.equal(normalizeText('\u3164', 'NFKC'), '\u1160'); // filler is not removed, just remapped
  // end to end: NFKC alone does not remove ZWSP, clean does
  assert.equal(clean('a\u200Bb', { normalize: 'NFKC', strip: { zerowidth: false } }).text, 'a\u200Bb');
  assert.equal(clean('a\u200Bb', { normalize: 'NFKC' }).text, 'ab');
  assert.equal(clean('e\u0301', { normalize: 'NFC' }).normalizedChanged, 2);
  assert.equal(clean('abc', { normalize: 'NFKC' }).normalizedChanged, 0);
});

test('NFKC then strip: lone surrogates and astral input survive', () => {
  assert.equal(clean('\u{1F600}\u200B\uD800x', { normalize: 'NFC' }).text, '\u{1F600}x');
});

test('sample text: exact cleaned output and stats', () => {
  const r = clean(SAMPLE_TEXT);
  assert.equal(r.text, 'Helloworld \u2014 visit p\u0430ypal.com today\nTotal: 100 USD\nHidden: \nFamily: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a \u2764\uFE0F\n');
  assert.equal(r.removed, 7); assert.equal(r.converted, 1);
  const s = scan(SAMPLE_TEXT);
  assert.equal(s.counts.flagged, 12);
  assert.equal(s.mixedScript.length, 1);
});

test('defaultCleanOptions matches the spec defaults', () => {
  const d = defaultCleanOptions();
  assert.equal(d.normalize, 'none'); assert.equal(d.spaces, true); assert.equal(d.replaceConfusables, false);
  assert.equal(d.preserveEmoji, true); assert.equal(d.strip.vs1to16, false); assert.equal(d.strip.variation, true);
  assert.equal(d.collapse, false); assert.equal(d.trim, false);
  assert.notEqual(defaultCleanOptions().strip, d.strip); // fresh object each call
});

test('clean does not mutate the options it is given', () => {
  const o = { strip: { bidi: false } };
  clean('x', o);
  assert.deepEqual(o, { strip: { bidi: false } });
});
