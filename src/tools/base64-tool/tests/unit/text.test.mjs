// text <-> Base64 unit tests: encodeText(), decodeText() (node --test, no
// browser/DOM). Covers UTF-8 edge cases (accents, CJK, astral emoji) and the
// fatal:true invalid-UTF-8 rejection that lets the tool tell text from binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBase64Tool } from './_helpers.mjs';

const { encodeText, decodeText, bytesToBase64 } = await loadBase64Tool();

test('encodeText(): known vector — "A" -> "QQ=="', () => {
  assert.equal(encodeText('A'), 'QQ==');
});

test('decodeText(): known vector — "QQ==" -> "A"', () => {
  assert.equal(decodeText('QQ=='), 'A');
});

test('encodeText(): empty string, null, and undefined all encode to an empty Base64 string', () => {
  assert.equal(encodeText(''), '');
  assert.equal(encodeText(null), '');
  assert.equal(encodeText(undefined), '');
});

test('encodeText() / decodeText() round-trip identity across ASCII, accents, CJK, and astral emoji', () => {
  const samples = [
    'hello world',
    'héllo wörld — café',
    '日本語のテストです',
    '🎉🚀✨ claude-tools',
    'mixed: café 日本語 🎉 done',
    'line1\nline2\ttabbed',
  ];
  for (const s of samples) {
    assert.equal(decodeText(encodeText(s)), s, JSON.stringify(s));
  }
});

test('decodeText(): throws on Base64 that decodes to invalid UTF-8 (fatal decoding)', () => {
  // 0xFF is never a valid UTF-8 lead or continuation byte on its own.
  const invalidUtf8B64 = bytesToBase64(new Uint8Array([0xFF, 0xFE]));
  assert.throws(() => decodeText(invalidUtf8B64));
});

test('decodeText(): valid multi-byte UTF-8 sequences decode without throwing', () => {
  assert.equal(decodeText(encodeText('€')), '€'); // 3-byte UTF-8
  assert.equal(decodeText(encodeText('\u{1F600}')), '\u{1F600}'); // 4-byte astral emoji
});
