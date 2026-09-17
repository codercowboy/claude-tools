// Full-pipeline integration unit tests for encodeToMatrix(): version/size
// selection, determinism, structural shape, and edge cases (node --test,
// no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQr } from './_helpers.mjs';

const { encodeToMatrix, utf8Bytes } = await loadQr();

test('encodeToMatrix(): known 17-byte ASCII input selects version 1 at EC=L (spec capacity boundary)', () => {
  const text = 'A'.repeat(17);
  assert.equal(utf8Bytes(text).length, 17);
  const result = encodeToMatrix(text, 'L');
  assert.equal(result.version, 1);
  assert.equal(result.size, 21); // 17 + 4*1
});

test('encodeToMatrix(): one byte over the V1-L boundary bumps to version 2', () => {
  const result = encodeToMatrix('A'.repeat(18), 'L');
  assert.equal(result.version, 2);
  assert.equal(result.size, 25); // 17 + 4*2
});

test('encodeToMatrix(): higher EC level needs a larger (or equal) version for the same text', () => {
  const text = 'The quick brown fox jumps over the lazy dog, 0123456789!';
  const vL = encodeToMatrix(text, 'L').version;
  const vH = encodeToMatrix(text, 'H').version;
  assert.ok(vH >= vL);
});

test('encodeToMatrix(): result shape — size matches 17+4*version and modules is a size x size boolean grid', () => {
  const result = encodeToMatrix('https://example.com/claude-tools', 'M');
  assert.equal(result.size, 17 + 4 * result.version);
  assert.equal(result.modules.length, result.size);
  for (const row of result.modules) {
    assert.equal(row.length, result.size);
    for (const cell of row) assert.equal(typeof cell, 'boolean');
  }
  assert.ok(result.mask >= 0 && result.mask <= 7);
});

test('encodeToMatrix(): deterministic — same input always produces the same matrix', () => {
  const a = encodeToMatrix('claude-tools QR generator', 'Q');
  const b = encodeToMatrix('claude-tools QR generator', 'Q');
  assert.deepEqual(a, b);
});

test('encodeToMatrix(): different EC levels for the same text can produce different matrices', () => {
  const l = encodeToMatrix('claude-tools', 'L');
  const h = encodeToMatrix('claude-tools', 'H');
  // At minimum the EC level differs even if version happens to coincide.
  assert.notDeepEqual(l.modules, h.modules);
});

test('encodeToMatrix(): handles multi-byte UTF-8 input (emoji, accents, CJK) without throwing', () => {
  for (const text of ['héllo wörld', '日本語のテスト', '🎉🚀✨ claude-tools', '']) {
    if (text === '') continue; // empty is covered by the dedicated error test below
    const result = encodeToMatrix(text, 'M');
    assert.ok(result.version >= 1 && result.version <= 40);
  }
});

test('encodeToMatrix(): throws a clear error on empty input', () => {
  assert.throws(() => encodeToMatrix('', 'M'), /empty input/);
});

test('encodeToMatrix(): throws a clear error when input exceeds V40 capacity at the given EC level', () => {
  const huge = 'x'.repeat(3000); // well beyond even V40-L's ~2953-byte ceiling
  assert.throws(() => encodeToMatrix(huge, 'H'), /too large/i);
});

test('encodeToMatrix(): throws on an invalid EC level', () => {
  assert.throws(() => encodeToMatrix('hello', 'Z'), /invalid ecLevel/);
});

test('encodeToMatrix(): defaults to EC level H when omitted', () => {
  const withDefault = encodeToMatrix('claude-tools');
  const explicit = encodeToMatrix('claude-tools', 'H');
  assert.deepEqual(withDefault, explicit);
});

test('encodeToMatrix(): the largest possible V40-H input (1273 bytes) succeeds; one more throws', () => {
  const maxText = 'x'.repeat(1273);
  const result = encodeToMatrix(maxText, 'H');
  assert.equal(result.version, 40);
  assert.throws(() => encodeToMatrix('x'.repeat(1274), 'H'), /too large/i);
});

test('encodeToMatrix(): version-7+ output includes non-trivial version info (top-left/bottom-left 3x6 blocks not left blank)', () => {
  // Force version >= 7 with a long input; version info is only written for
  // v>=7, so this exercises writeVersionInfo() via the public API.
  const result = encodeToMatrix('x'.repeat(200), 'H');
  assert.ok(result.version >= 7);
  // The reserved 3x6 version-info block (rows size-11..size-9, cols 0..5)
  // should not be uniformly false for every version >= 7 — some bit must be
  // set for a valid nonzero version number's BCH codeword.
  const size = result.size;
  let anyDark = false;
  for (let r = size - 11; r <= size - 9; r++) {
    for (let c = 0; c <= 5; c++) if (result.modules[r][c]) anyDark = true;
  }
  assert.ok(anyDark, 'expected at least one dark module in the version-info block');
});
