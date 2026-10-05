// Known-answer tests for the four cryptographic digests (MD5, SHA-1, SHA-256,
// SHA-512) against PUBLISHED test vectors. Vectors from RFC 1321 (MD5), FIPS
// 180 / the SHA family test suites, and the classic pangram. This is the whole
// point of a hasher: a wrong bit anywhere changes the digest completely, so
// matching a published vector is the only proof the implementation is correct.
//
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHasher } from './_helpers.mjs';

const { md5, sha1, sha256, sha512, textToBytes, bytesToHex } = await loadHasher();

const hex = (fn, str) => bytesToHex(fn(textToBytes(str)));

const FOX = 'The quick brown fox jumps over the lazy dog';
// A > 1-block input for MD5/SHA-1/SHA-256 (block = 64 bytes): 1,000,000 'a'
// is the FIPS "million a" vector but slow; use the RFC/NESSIE 'a'*80 plus the
// standard multi-block vectors instead, and cross-check long inputs in
// padding.test.mjs against Node crypto.
const A80 = 'a'.repeat(80);

// ---------------------------------------------------------------------------
// MD5 (RFC 1321 appendix A.5 test suite)
// ---------------------------------------------------------------------------
test('md5(): published vectors', () => {
  assert.equal(hex(md5, ''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hex(md5, 'a'), '0cc175b9c0f1b6a831c399e269772661');
  assert.equal(hex(md5, 'abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(hex(md5, 'message digest'), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(hex(md5, 'abcdefghijklmnopqrstuvwxyz'), 'c3fcd3d76192e4007dfb496cca67e13b');
  assert.equal(
    hex(md5, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'),
    'd174ab98d277d9f5a5611c2c9f419d9f',
  );
  assert.equal(hex(md5, FOX), '9e107d9d372bb6826bd81d3542a419d6');
  // Digest is 16 bytes.
  assert.equal(md5(textToBytes('')).length, 16);
});

// ---------------------------------------------------------------------------
// SHA-1 (FIPS 180 / NIST examples)
// ---------------------------------------------------------------------------
test('sha1(): published vectors', () => {
  assert.equal(hex(sha1, ''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.equal(hex(sha1, 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(
    hex(sha1, 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
  );
  assert.equal(hex(sha1, FOX), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
  assert.equal(sha1(textToBytes('')).length, 20);
});

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4 examples)
// ---------------------------------------------------------------------------
test('sha256(): published vectors', () => {
  assert.equal(hex(sha256, ''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(sha256, 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // 448-bit two-block message (FIPS 180-4).
  assert.equal(
    hex(sha256, 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
  assert.equal(hex(sha256, FOX), 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
  assert.equal(sha256(textToBytes('')).length, 32);
});

// ---------------------------------------------------------------------------
// SHA-512 (FIPS 180-4 examples) — note the 128-bit length field / 128-byte block
// ---------------------------------------------------------------------------
test('sha512(): published vectors', () => {
  assert.equal(
    hex(sha512, ''),
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
  );
  assert.equal(
    hex(sha512, 'abc'),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  );
  // Two-block (896-bit) message.
  assert.equal(
    hex(sha512, 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'),
    '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909',
  );
  assert.equal(
    hex(sha512, FOX),
    '07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a309d785436bbb642e93a252a954f23912547d1e8a3b5ed6e1bfd7097821233fa0538f3db854fee6',
  );
  assert.equal(sha512(textToBytes('')).length, 64);
});

// ---------------------------------------------------------------------------
// Multi-block coverage (input clearly spanning several blocks)
// ---------------------------------------------------------------------------
test('all four digests handle a multi-block (80-byte) input', () => {
  // Only that they produce the right-length digest and are deterministic; the
  // exact-value cross-check against Node crypto is in padding.test.mjs.
  assert.equal(md5(textToBytes(A80)).length, 16);
  assert.equal(sha1(textToBytes(A80)).length, 20);
  assert.equal(sha256(textToBytes(A80)).length, 32);
  assert.equal(sha512(textToBytes(A80)).length, 64);
  assert.deepEqual(sha256(textToBytes(A80)), sha256(textToBytes(A80)));
});
