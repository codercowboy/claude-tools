// Padding / block-boundary cross-check. Hash inputs of EVERY length from 0..200
// bytes and compare the hand-rolled MD5/SHA-1/SHA-256/SHA-512 against Node's
// built-in `crypto` as an independent reference. This is what catches padding
// bugs: the tricky lengths are right around each block boundary — e.g. an input
// whose length + 1 (for 0x80) leaves too few bytes for the length field, forcing
// an extra padding block, and specifically the SHA-512 case where the message is
// long enough that the 128-bit (16-byte) length field spills the block.
//
// IMPORTANT: `node:crypto` is imported ONLY here in the TEST. The tool itself is
// hand-rolled on purpose (no crypto.subtle / node crypto) so it works in a
// non-secure context — see guard.test.mjs, which asserts the shipped source has
// no crypto.subtle usage.
//
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadHasher } from './_helpers.mjs';

const { md5, sha1, sha256, sha512, bytesToHex } = await loadHasher();

const ALGOS = [
  { name: 'md5', fn: md5, node: 'md5' },
  { name: 'sha1', fn: sha1, node: 'sha1' },
  { name: 'sha256', fn: sha256, node: 'sha256' },
  { name: 'sha512', fn: sha512, node: 'sha512' },
];

function nodeHex(node, bytes) {
  return createHash(node).update(Buffer.from(bytes)).digest('hex');
}

for (const { name, fn, node } of ALGOS) {
  test(`${name}(): matches node:crypto for every length 0..200 (padding coverage)`, () => {
    for (let len = 0; len <= 200; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 31 + 7) & 0xff;
      const got = bytesToHex(fn(bytes));
      const want = nodeHex(node, bytes);
      assert.equal(got, want, `${name} len=${len}`);
    }
  });
}

// Explicit boundary lengths that historically break padding, tested for all
// four so a regression is loud and specific.
test('all digests: exact block-boundary lengths match node:crypto', () => {
  // 55/56/63/64 exercise the SHA-256/MD5/SHA-1 (64-byte block, 8-byte length)
  // extra-block edge; 111/112/119/120/127/128 exercise SHA-512's 128-byte
  // block / 16-byte length field spill.
  const lens = [0, 1, 55, 56, 57, 63, 64, 65, 111, 112, 113, 119, 120, 127, 128, 129];
  for (const { name, fn, node } of ALGOS) {
    for (const len of lens) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 17 + 3) & 0xff;
      assert.equal(bytesToHex(fn(bytes)), nodeHex(node, bytes), `${name} len=${len}`);
    }
  }
});

// A larger multi-block input to make sure the streaming loop is correct too.
test('all digests: match node:crypto for a large (10000-byte) input', () => {
  const bytes = new Uint8Array(10000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 29) & 0xff;
  for (const { name, fn, node } of ALGOS) {
    assert.equal(bytesToHex(fn(bytes)), nodeHex(node, bytes), name);
  }
});
