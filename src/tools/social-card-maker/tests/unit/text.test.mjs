// Unit tests for text wrapping and string helpers (source/logic.mjs). Pure,
// DOM-free — imported directly, no browser. wrapText is fed a DETERMINISTIC
// measure stub so word-wrap geometry is exact and reproducible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  wrapText,
  hexOk,
  escapeAttrNullSafe,
  slugify,
  outputFilename,
} from '../../source/logic.mjs';

// Monospace measure model: every character is exactly 10px wide.
const mono = (s) => s.length * 10;

// ---- wrapText ----------------------------------------------------------------
test('wrapText greedily breaks between words at the max width', () => {
  // "aaa"=30, "aaa "=40, "aaa bbb"=70 > 60 → break; likewise for ccc.
  assert.deepEqual(wrapText('aaa bbb ccc', 60, mono), ['aaa', 'bbb', 'ccc']);
});

test('wrapText keeps words together while they fit', () => {
  // width 1000 easily fits the whole line; trailing space trimmed.
  assert.deepEqual(wrapText('a b c', 1000, mono), ['a b c']);
});

test('wrapText packs as many words per line as fit', () => {
  // Each word 3 chars; "one two"=70, room for two per 80px line.
  assert.deepEqual(wrapText('one two six ten', 80, mono), ['one two', 'six ten']);
});

test('wrapText keeps a single over-wide word whole on its own line (never split)', () => {
  const word = 'supercalifragilistic'; // 20 chars = 200px, far over the 50px limit
  assert.deepEqual(wrapText(word, 50, mono), [word]);
  // Over-wide word mixed with normal words: each lands on its own line, whole.
  assert.deepEqual(wrapText('hi supercalifragilistic ok', 50, mono), ['hi', 'supercalifragilistic', 'ok']);
});

test('wrapText honors explicit newlines as hard breaks first', () => {
  assert.deepEqual(wrapText('line1\nline2', 1000, mono), ['line1', 'line2']);
  // A blank line between paragraphs is preserved as an empty line.
  assert.deepEqual(wrapText('a\n\nb', 1000, mono), ['a', '', 'b']);
});

test('wrapText combines hard breaks with soft wrapping within a paragraph', () => {
  // First para wraps at 60px; second para is a single short line.
  assert.deepEqual(wrapText('aaa bbb ccc\nzzz', 60, mono), ['aaa', 'bbb', 'ccc', 'zzz']);
});

test('wrapText always returns at least one line, even for empty input', () => {
  assert.deepEqual(wrapText('', 100, mono), ['']);
  assert.deepEqual(wrapText(null, 100, mono), ['']);
  assert.deepEqual(wrapText(undefined, 100, mono), ['']);
});

test('wrapText with a non-positive width never wraps (keeps each paragraph whole)', () => {
  assert.deepEqual(wrapText('aaa bbb ccc', 0, mono), ['aaa bbb ccc']);
});

test('wrapText collapses runs of interior whitespace into single gaps at a break', () => {
  // Multiple spaces between words; the trailing whitespace on a broken line is trimmed.
  assert.deepEqual(wrapText('aaa   bbb', 60, mono), ['aaa', 'bbb']);
});

// ---- hexOk -------------------------------------------------------------------
test('hexOk accepts #rgb and #rrggbb, any case, trimming surrounding space', () => {
  assert.equal(hexOk('#fff'), true);
  assert.equal(hexOk('#ffffff'), true);
  assert.equal(hexOk('#FFF'), true);
  assert.equal(hexOk('#AbC123'), true);
  assert.equal(hexOk('  #abcdef  '), true);
});

test('hexOk rejects malformed values and non-strings', () => {
  assert.equal(hexOk('fff'), false);      // no hash
  assert.equal(hexOk('#ff'), false);      // wrong length
  assert.equal(hexOk('#ffff'), false);    // 4 digits
  assert.equal(hexOk('#gggggg'), false);  // non-hex digits
  assert.equal(hexOk('#12345g'), false);
  assert.equal(hexOk(123456), false);
  assert.equal(hexOk(null), false);
  assert.equal(hexOk(undefined), false);
  assert.equal(hexOk(''), false);
});

// ---- escapeAttrNullSafe --------------------------------------------------------------
test('escapeAttrNullSafe escapes &, <, > and double-quote for a double-quoted attribute', () => {
  assert.equal(escapeAttrNullSafe('a & b'), 'a &amp; b');
  assert.equal(escapeAttrNullSafe('<tag>'), '&lt;tag&gt;');
  assert.equal(escapeAttrNullSafe('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeAttrNullSafe('a"b<c>d&e'), 'a&quot;b&lt;c&gt;d&amp;e');
  // Ampersand is escaped first so it doesn't double-escape the others.
  assert.equal(escapeAttrNullSafe('&lt;'), '&amp;lt;');
});

test('escapeAttrNullSafe leaves single quotes intact and coerces null/undefined to empty', () => {
  assert.equal(escapeAttrNullSafe("it's fine"), "it's fine");
  assert.equal(escapeAttrNullSafe(null), '');
  assert.equal(escapeAttrNullSafe(undefined), '');
  assert.equal(escapeAttrNullSafe(42), '42');
});

// ---- slugify -----------------------------------------------------------------
test('slugify lowercases, strips quotes, and hyphenates runs of non-alphanumerics', () => {
  assert.equal(slugify('My Launch'), 'my-launch');
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  Trim  Me  '), 'trim-me');
  assert.equal(slugify('"Quoted" Title'), 'quoted-title');
  assert.equal(slugify("Jason's Card"), 'jasons-card');
  assert.equal(slugify('a---b'), 'a-b');
});

test('slugify strips leading/trailing hyphens, empties to "", and caps length at 60', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  const long = 'x'.repeat(80);
  assert.equal(slugify(long).length, 60);
});

// ---- outputFilename ----------------------------------------------------------
test('outputFilename slugifies the title and appends the format extension', () => {
  assert.equal(outputFilename('My Launch', 'png'), 'my-launch.png');
  assert.equal(outputFilename('My Launch', 'jpeg'), 'my-launch.jpg');
  assert.equal(outputFilename('My Launch', 'webp'), 'my-launch.webp');
  assert.equal(outputFilename('My Launch', 'JPEG'), 'my-launch.jpg'); // case-insensitive
});

test('outputFilename falls back to "social-card" for an empty title and PNG for a bad format', () => {
  assert.equal(outputFilename('', 'png'), 'social-card.png');
  assert.equal(outputFilename(null, 'webp'), 'social-card.webp');
  assert.equal(outputFilename('!!!', 'jpeg'), 'social-card.jpg');
  assert.equal(outputFilename('Test', 'bogus'), 'test.png'); // unknown format → png ext
});
