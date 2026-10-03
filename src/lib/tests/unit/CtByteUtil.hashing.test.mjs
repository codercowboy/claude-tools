// Known-answer unit tests for CtByteUtil hashing: md5, sha1, sha256, sha512, hmac.
// Run: node --test src/lib/tests/
//
// API (confirmed from src/lib/utils/CtByteUtil.mjs): every fn takes BYTES (Uint8Array,
// plain array and Buffer all work - NOT a string) and returns a raw Uint8Array digest
// (16/20/32/64 bytes), not hex. Strings are converted via TextEncoder; hex via bytesToHex.
// hmac(hashName, keyBytes, msgBytes) supports 'md5' | 'sha1' | 'sha256' | 'sha512'.
//
// crc32 / crc32Hex are SKIPPED here: owned and covered by Phase 01
// (CtByteUtil.crc32.test.mjs).
//
// Vector sources:
//  - MD5:     RFC 1321 appendix A.5 test suite
//  - SHA-1/256/512: FIPS 180-4 / NIST CSRC "SHA examples" (abc, 448-bit and 896-bit messages,
//             1,000,000 x 'a'); "" and the fox pangram are the widely published digests
//  - HMAC:    RFC 2202 (MD5/SHA-1) and RFC 4231 (SHA-256/SHA-512) test cases
//  - Values marked [node:crypto] (200 x 'a', the unicode string, empty-key/empty-message HMAC)
//    are not in an RFC; their expected digests were produced by Node's independent OpenSSL
//    (node:crypto) and pasted here as literals - never derived from the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { md5, sha1, sha256, sha512, hmac, bytesToHex } from '../../utils/CtByteUtil.mjs';

const enc = new TextEncoder();
const ascii = (s) => enc.encode(s);
const hexToBytes = (h) => {
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16);
  return o;
};
const FOX = 'The quick brown fox jumps over the lazy dog';
const A200 = 'a'.repeat(200);
const UNI = 'héllo wörld ✓ 日本語 🚀'; // 'héllo wörld ✓ 日本語 🚀'
const FIPS448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
const FIPS896 = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';

const ALGOS = {
  md5: {
    fn: md5, len: 16,
    vectors: [
      ['"" (RFC 1321)', '', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['"a" (RFC 1321)', 'a', '0cc175b9c0f1b6a831c399e269772661'],
      ['"abc" (RFC 1321)', 'abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['"message digest" (RFC 1321)', 'message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['a-z (RFC 1321)', 'abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      ['A-Za-z0-9, 62B (RFC 1321)', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
      ['digits x8, 80B multi-block (RFC 1321)', '1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
      ['fox pangram', FOX, '9e107d9d372bb6826bd81d3542a419d6'],
      ['200 x "a", multi-block [node:crypto]', A200, '887f30b43b2867f4a9accceee7d16e6c'],
      ['unicode UTF-8 [node:crypto]', UNI, '22e41aa68413ccf1086da5bfdc88acf1'],
    ],
    million: '7707d6ae4e027c70eea2a935c2296f21',
  },
  sha1: {
    fn: sha1, len: 20,
    vectors: [
      ['"" (FIPS 180)', '', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
      ['"abc" (FIPS 180)', 'abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
      ['448-bit msg, 56B (FIPS 180)', FIPS448, '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
      ['fox pangram', FOX, '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'],
      ['200 x "a", multi-block [node:crypto]', A200, 'e61cfffe0d9195a525fc6cf06ca2d77119c24a40'],
      ['unicode UTF-8 [node:crypto]', UNI, 'c6f31ad00a92f088e44fbbd78cecd7e8d4b1d8f5'],
    ],
    million: '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
  },
  sha256: {
    fn: sha256, len: 32,
    vectors: [
      ['"" (FIPS 180-4)', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['"abc" (FIPS 180-4)', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      ['448-bit msg (FIPS 180-4)', FIPS448, '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
      ['fox pangram', FOX, 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
      ['200 x "a", multi-block [node:crypto]', A200, 'c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5'],
      ['unicode UTF-8 [node:crypto]', UNI, '74ee4ee1973a9f0d651d9b77b77ae6c5342d2f4a0488df5e902f3e006341482a'],
    ],
    million: 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
  },
  sha512: {
    fn: sha512, len: 64,
    vectors: [
      ['"" (FIPS 180-4)', '', 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'],
      ['"abc" (FIPS 180-4)', 'abc', 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'],
      ['896-bit msg, 112B, 2 blocks (FIPS 180-4)', FIPS896, '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909'],
      ['fox pangram', FOX, '07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a309d785436bbb642e93a252a954f23912547d1e8a3b5ed6e1bfd7097821233fa0538f3db854fee6'],
      ['200 x "a", >128B multi-block [node:crypto]', A200, '4b11459c33f52a22ee8236782714c150a3b2c60994e9acee17fe68947a3e6789f31e7668394592da7bef827cddca88c4e6f86e4df7ed1ae6cba71f3e98faee9f'],
      ['unicode UTF-8 [node:crypto]', UNI, '2d3dbfd2bcc05befd4f736081af0a7a19e2db1f7f4bce501a4c14f1e52d6d692ad16c9d1965f38f9f54ec43bf5f421fe3a478c8b1db3c7a5036ad0085d114059'],
    ],
    million: 'e718483d0ce769644e2e42c7bc15b4638e1f98b13b2044285632a803afa973ebde0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b',
  },
};

for (const [name, { fn, len, vectors, million }] of Object.entries(ALGOS)) {
  test(`${name}: known-answer vectors`, () => {
    for (const [label, input, expected] of vectors) {
      assert.equal(bytesToHex(fn(ascii(input))), expected, `${name} ${label}`);
    }
  });

  test(`${name}: output is a raw Uint8Array of ${len} bytes`, () => {
    const d = fn(ascii('abc'));
    assert.ok(d instanceof Uint8Array);
    assert.equal(d.length, len);
    assert.equal(fn(new Uint8Array(0)).length, len);
  });

  test(`${name}: Uint8Array, plain array and Buffer inputs agree`, () => {
    const bytes = ascii(FOX);
    const expected = bytesToHex(fn(bytes));
    assert.equal(bytesToHex(fn(Array.from(bytes))), expected);
    assert.equal(bytesToHex(fn(Buffer.from(FOX))), expected);
    assert.equal(bytesToHex(fn(bytes.slice())), expected);
  });

  test(`${name}: deterministic and does not mutate its input`, () => {
    const bytes = ascii(A200);
    const copy = bytes.slice();
    const a = fn(bytes);
    const b = fn(bytes);
    assert.deepEqual(a, b);
    assert.notEqual(a, b); // fresh array each call
    assert.deepEqual(bytes, copy);
  });

  test(`${name}: one-byte change flips the digest (avalanche sanity)`, () => {
    assert.notEqual(bytesToHex(fn(ascii('abc'))), bytesToHex(fn(ascii('abd'))));
  });

  test(`${name}: block-boundary lengths match published form (55..65 / 111..129 bytes are self-consistent)`, () => {
    // Padding edge cases: lengths straddling the 56/64 (or 112/128) byte boundary must all
    // produce distinct digests of the right size and be stable.
    const seen = new Set();
    for (const n of [55, 56, 57, 63, 64, 65, 111, 112, 113, 127, 128, 129]) {
      const d = fn(new Uint8Array(n).fill(0x61));
      assert.equal(d.length, len);
      seen.add(bytesToHex(d));
    }
    assert.equal(seen.size, 12);
  });

  test(`${name}: FIPS 180 million-"a" vector`, () => {
    assert.equal(bytesToHex(fn(new Uint8Array(1000000).fill(0x61))), million);
  });
}

// --- HMAC ----------------------------------------------------------------

const HM = (alg, key, msg) => bytesToHex(hmac(alg, key, msg));

test('hmac: RFC 2202 test case 1 (MD5, SHA-1; 0x0b key, "Hi There")', () => {
  assert.equal(HM('md5', hexToBytes('0b'.repeat(16)), ascii('Hi There')), '9294727a3638bb1c13f48ef8158bfc9d');
  assert.equal(HM('sha1', hexToBytes('0b'.repeat(20)), ascii('Hi There')), 'b617318655057264e28bc0b6fb378c8ef146be00');
});

test('hmac: RFC 2202 / RFC 4231 test case 2 (key "Jefe")', () => {
  const k = ascii('Jefe'), m = ascii('what do ya want for nothing?');
  assert.equal(HM('md5', k, m), '750c783e6ab0b503eaa86e310a5db738');
  assert.equal(HM('sha1', k, m), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
  assert.equal(HM('sha256', k, m), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  assert.equal(HM('sha512', k, m), '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737');
});

test('hmac: RFC 4231 test case 1 (SHA-256/512; 20 x 0x0b key, "Hi There")', () => {
  const k = hexToBytes('0b'.repeat(20)), m = ascii('Hi There');
  assert.equal(HM('sha256', k, m), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  assert.equal(HM('sha512', k, m), '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854');
});

test('hmac: RFC 4231 test case 3 (20 x 0xaa key, 50 x 0xdd data)', () => {
  const k = hexToBytes('aa'.repeat(20)), m = hexToBytes('dd'.repeat(50));
  assert.equal(HM('sha256', k, m), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe');
  assert.equal(HM('sha512', k, m), 'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb');
  assert.equal(HM('sha1', k, m), '125d7342b9ac11cd91a39af48aa17b4f63f175d3'); // RFC 2202 case 3 (SHA-1)
});

test('hmac: RFC 4231 test case 4 (25-byte counting key, 50 x 0xcd data)', () => {
  const k = hexToBytes('0102030405060708090a0b0c0d0e0f10111213141516171819'), m = hexToBytes('cd'.repeat(50));
  assert.equal(HM('sha256', k, m), '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b');
  assert.equal(HM('sha512', k, m), 'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd');
});

test('hmac: key longer than block size is hashed first (RFC 2202 case 6 / RFC 4231 cases 6, 7)', () => {
  const m6 = ascii('Test Using Larger Than Block-Size Key - Hash Key First');
  // RFC 2202 case 6: key = 80 x 0xaa (> 64-byte block)
  assert.equal(HM('md5', hexToBytes('aa'.repeat(80)), m6), '6b1ab7fe4bd7bf8f0b62e6ce61b9d0cd');
  assert.equal(HM('sha1', hexToBytes('aa'.repeat(80)), m6), 'aa4ae5e15272d00e95705637ce8a3b55ed402112');
  // RFC 4231 case 6: key = 131 x 0xaa (> 64 and > 128-byte blocks)
  const k131 = hexToBytes('aa'.repeat(131));
  assert.equal(HM('sha256', k131, m6), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
  assert.equal(HM('sha512', k131, m6), '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598');
  // RFC 4231 case 7: 131-byte key + long data
  const m7 = ascii('This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.');
  assert.equal(HM('sha256', k131, m7), '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2');
  assert.equal(HM('sha512', k131, m7), 'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58');
});

test('hmac: HMAC-SHA-256 "key"/fox published vector', () => {
  assert.equal(
    HM('sha256', ascii('key'), ascii(FOX)),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  ); // Wikipedia HMAC article
  assert.equal(HM('md5', ascii('key'), ascii(FOX)), '80070713463e7749b90c2dc24911e275'); // Wikipedia
  assert.equal(HM('sha1', ascii('key'), ascii(FOX)), 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9'); // Wikipedia
});

test('hmac: empty key and/or empty message [node:crypto]', () => {
  const none = new Uint8Array(0);
  assert.equal(HM('md5', none, none), '74e6f7298a9c2d168935f58c001bad88');
  assert.equal(HM('sha1', none, none), 'fbdb1d1b18aa6c08324b7d64b71fb76370690e1d');
  assert.equal(HM('sha256', none, none), 'b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad');
  assert.equal(HM('sha512', none, none), 'b936cee86c9f87aa5d3c6f2e84cb5a4239a5fe50480a6ec66b70ab5b1f4ac6730c6c515421b327ec1d69402e53dfb49ad7381eb067b338fd7b0cb22247225d47');
  // empty key, non-empty message "abc"
  assert.equal(HM('md5', none, ascii('abc')), 'dd2701993d29fdd0b032c233cec63403');
  assert.equal(HM('sha1', none, ascii('abc')), '9b4a918f398d74d3e367970aba3cbe54e4d2b5d9');
  assert.equal(HM('sha256', none, ascii('abc')), 'fd7adb152c05ef80dccf50a1fa4c05d5a3ec6da95575fc312ae7c5d091836351');
  assert.equal(HM('sha512', none, ascii('abc')), '29689f6b79a8dd686068c2eeae97fd8769ad3ba65cb5381f838358a8045a358ee3ba1739c689c7805e31734fb6072f87261d1256995370d55725cba00d10bdd0');
});

test('hmac: output sizes, determinism, array-like inputs', () => {
  const k = ascii('Jefe'), m = ascii('what do ya want for nothing?');
  for (const [alg, len] of [['md5', 16], ['sha1', 20], ['sha256', 32], ['sha512', 64]]) {
    const a = hmac(alg, k, m);
    assert.ok(a instanceof Uint8Array);
    assert.equal(a.length, len);
    assert.deepEqual(a, hmac(alg, k, m));
    assert.equal(bytesToHex(hmac(alg, Array.from(k), Array.from(m))), bytesToHex(a));
    assert.equal(bytesToHex(hmac(alg, Buffer.from(k), Buffer.from(m))), bytesToHex(a));
  }
});

test('hmac: throws on an unsupported hash name', () => {
  assert.throws(() => hmac('sha3', ascii('k'), ascii('m')), /Unsupported hash for HMAC: sha3/);
  assert.throws(() => hmac('crc32', ascii('k'), ascii('m')), /Unsupported hash/);
});
