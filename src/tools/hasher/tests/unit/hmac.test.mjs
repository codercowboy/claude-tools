// HMAC known-answer tests against published RFC vectors:
//   - HMAC-MD5 / HMAC-SHA-1 from RFC 2202
//   - HMAC-SHA-256 / HMAC-SHA-512 from RFC 4231
// Includes the > block-size key path (RFC 4231 test case 6, key = 131 bytes,
// which forces the "hash the key first" branch).
//
// node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHasher } from './_helpers.mjs';

const { hmac, textToBytes, bytesToHex } = await loadHasher();

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
const asc = (s) => textToBytes(s);
const digestHex = (name, key, msg) => bytesToHex(hmac(name, key, msg));

// RFC 2202 / RFC 4231 Test Case 2 — key "Jefe", data "what do ya want for nothing?"
const JEFE = asc('Jefe');
const NOTHING = asc('what do ya want for nothing?');

test('HMAC-MD5: RFC 2202 test case 2', () => {
  assert.equal(digestHex('md5', JEFE, NOTHING), '750c783e6ab0b503eaa86e310a5db738');
});

test('HMAC-SHA-1: RFC 2202 test case 2', () => {
  assert.equal(digestHex('sha1', JEFE, NOTHING), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
});

test('HMAC-SHA-256: RFC 4231 test case 2', () => {
  assert.equal(
    digestHex('sha256', JEFE, NOTHING),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
});

test('HMAC-SHA-512: RFC 4231 test case 2', () => {
  assert.equal(
    digestHex('sha512', JEFE, NOTHING),
    '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
  );
});

// RFC 4231 Test Case 1 — key = 20 bytes of 0x0b, data = "Hi There".
test('HMAC-SHA-256 / SHA-512: RFC 4231 test case 1', () => {
  const key = hexToBytes('0b'.repeat(20));
  const data = asc('Hi There');
  assert.equal(
    digestHex('sha256', key, data),
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  );
  assert.equal(
    digestHex('sha512', key, data),
    '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
  );
});

// RFC 4231 Test Case 6 — key = 131 bytes of 0xaa (> block size, so the impl
// must hash the key first). This is the branch that catches an over-long-key bug.
test('HMAC-SHA-256 / SHA-512: RFC 4231 test case 6 (over-block-size key)', () => {
  const key = hexToBytes('aa'.repeat(131));
  const data = asc('Test Using Larger Than Block-Size Key - Hash Key First');
  assert.equal(
    digestHex('sha256', key, data),
    '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
  );
  assert.equal(
    digestHex('sha512', key, data),
    '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598',
  );
});

// The vector called out verbatim in DESIGN.md.
test('HMAC-SHA-256: DESIGN.md key/fox vector', () => {
  assert.equal(
    digestHex('sha256', asc('key'), asc('The quick brown fox jumps over the lazy dog')),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  );
});

test('hmac(): throws on an unsupported hash name', () => {
  assert.throws(() => hmac('sha3', JEFE, NOTHING), /Unsupported hash/);
});
