// Unit tests for nanoid + randomToken (source/logic.mjs).
// node --test, no browser/DOM. Bytes + alphabet injected → exact output,
// asserting length and alphabet membership.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, ramp, fill } from './_helpers.mjs';

const { nanoid, randomToken, NANOID_ALPHABET, TOKEN_ALPHABETS } = await loadLogic();

// ---- nanoid --------------------------------------------------------------

test('NANOID_ALPHABET: the official 64-char URL alphabet', () => {
  assert.equal(NANOID_ALPHABET.length, 64);
  assert.equal(
    NANOID_ALPHABET,
    'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
  );
});

test('nanoid: length equals size', () => {
  assert.equal(nanoid(21, ramp(21)).length, 21);
  assert.equal(nanoid(5, ramp(5)).length, 5);
  assert.equal(nanoid(64, ramp(64)).length, 64);
});

test('nanoid: ramp bytes map to alphabet[i] (power-of-two → exact index)', () => {
  // byte i (< 64) % 64 === i, so nanoid(5, [0..4]) is the alphabet prefix.
  assert.equal(nanoid(5, ramp(5)), NANOID_ALPHABET.slice(0, 5)); // "usean"
});

test('nanoid: every char is in the alphabet', () => {
  const id = nanoid(40, ramp(40));
  for (const c of id) assert.ok(NANOID_ALPHABET.includes(c), `char ${c} not in alphabet`);
});

test('nanoid: a custom alphabet is honored', () => {
  assert.equal(nanoid(4, ramp(4), 'AB'), 'ABAB'); // 0,1,2,3 % 2 → A,B,A,B
});

test('nanoid: 0xff bytes select the last alphabet char (255 % 64 = 63)', () => {
  assert.equal(nanoid(3, fill(3, 0xff)), NANOID_ALPHABET[63].repeat(3));
});

// ---- randomToken ---------------------------------------------------------

test('TOKEN_ALPHABETS: hex/base62/base64url exact contents', () => {
  assert.equal(TOKEN_ALPHABETS.hex, '0123456789abcdef');
  assert.equal(TOKEN_ALPHABETS.hex.length, 16);
  assert.equal(TOKEN_ALPHABETS.base62.length, 62);
  assert.equal(TOKEN_ALPHABETS.base64url.length, 64);
  assert.equal(
    TOKEN_ALPHABETS.base64url,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  );
});

test('randomToken hex: exact mapping incl. modulo wrap (255 % 16 = 15 → f)', () => {
  assert.equal(
    randomToken(4, TOKEN_ALPHABETS.hex, Uint8Array.from([0, 1, 2, 255])),
    '012f'
  );
});

test('randomToken hex: length + alphabet membership', () => {
  const t = randomToken(32, TOKEN_ALPHABETS.hex, ramp(32));
  assert.equal(t.length, 32);
  for (const c of t) assert.ok(TOKEN_ALPHABETS.hex.includes(c));
});

test('randomToken base62: length + alphabet membership', () => {
  const t = randomToken(50, TOKEN_ALPHABETS.base62, ramp(50));
  assert.equal(t.length, 50);
  for (const c of t) assert.ok(TOKEN_ALPHABETS.base62.includes(c));
});

test('randomToken base62: ramp bytes map to alphabet[i] while i < 62', () => {
  assert.equal(randomToken(10, TOKEN_ALPHABETS.base62, ramp(10)), '0123456789');
});

test('randomToken base64url: power-of-two, exact index mapping', () => {
  assert.equal(
    randomToken(64, TOKEN_ALPHABETS.base64url, ramp(64)),
    TOKEN_ALPHABETS.base64url
  );
});

test('randomToken custom alphabet: honored, with modulo wrap', () => {
  assert.equal(
    randomToken(3, 'XY', Uint8Array.from([0, 1, 2])),
    'XYX'
  );
});

test('randomToken: empty alphabet falls back to hex', () => {
  const t = randomToken(4, '', Uint8Array.from([0, 1, 2, 3]));
  assert.equal(t, '0123');
});
