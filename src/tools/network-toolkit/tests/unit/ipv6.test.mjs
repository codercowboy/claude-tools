// Unit tests — Card 3 IPv6: expand / compress (RFC 5952) / hex, round-trips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const {
  IPV6_MAX, ipv6ToBigInt, bigIntToIpv6Expanded, bigIntToIpv6Compressed,
  ipv6Expand, ipv6Compress, ipv6ToHex, hexToIpv6BigInt, hexToIpv6,
} = await loadLogic();

test('ipv6Expand — full 8-group zero-padded form', () => {
  assert.equal(ipv6Expand('2001:db8::1'),
    '2001:0db8:0000:0000:0000:0000:0000:0001');
  assert.equal(ipv6Expand('::'),
    '0000:0000:0000:0000:0000:0000:0000:0000');
  assert.equal(ipv6Expand('::1'),
    '0000:0000:0000:0000:0000:0000:0000:0001');
  assert.equal(ipv6Expand('fe80::'),
    'fe80:0000:0000:0000:0000:0000:0000:0000');
});

test('ipv6Compress — RFC 5952: lowercase, no leading zeros, single ::', () => {
  assert.equal(ipv6Compress('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(ipv6Compress('0:0:0:0:0:0:0:0'), '::');
  assert.equal(ipv6Compress('0:0:0:0:0:0:0:1'), '::1');
  assert.equal(ipv6Compress('FE80:0:0:0:0:0:0:0'), 'fe80::');
  assert.equal(ipv6Compress('2001:DB8:0:0:0:0:0:1'), '2001:db8::1');
});

test('ipv6Compress — leftmost-longest zero run wins', () => {
  // Two runs of two zeros; the leftmost is compressed, the later stays literal.
  assert.equal(ipv6Compress('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1');
  // A longer later run beats an earlier shorter one.
  assert.equal(ipv6Compress('1:0:0:2:0:0:0:3'), '1:0:0:2::3');
});

test('ipv6Compress — a single zero group is NOT compressed (RFC 5952)', () => {
  assert.equal(ipv6Compress('2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1');
});

test('ipv6 — embedded IPv4 suffix accepted on input, normalized to hextets', () => {
  // ::ffff:192.168.1.1 → ::ffff:c0a8:101
  assert.equal(ipv6Compress('::ffff:192.168.1.1'), '::ffff:c0a8:101');
  assert.equal(ipv6Expand('::ffff:192.168.1.1'),
    '0000:0000:0000:0000:0000:ffff:c0a8:0101');
});

test('ipv6 — zone id (%eth0) is stripped', () => {
  assert.equal(ipv6Compress('fe80::1%eth0'), 'fe80::1');
  assert.equal(ipv6ToBigInt('fe80::1%eth0'), ipv6ToBigInt('fe80::1'));
});

test('ipv6ToBigInt — known values', () => {
  assert.equal(ipv6ToBigInt('::'), 0n);
  assert.equal(ipv6ToBigInt('::1'), 1n);
  assert.equal(ipv6ToBigInt('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'), IPV6_MAX);
  assert.equal(ipv6ToBigInt('2001:db8::1'),
    0x20010db8000000000000000000000001n);
});

test('ipv6ToHex — 0x + 32 hex digits, zero-padded', () => {
  assert.equal(ipv6ToHex('::1'), '0x00000000000000000000000000000001');
  assert.equal(ipv6ToHex('2001:db8::1'), '0x20010db8000000000000000000000001');
  assert.equal(ipv6ToHex('::'), '0x00000000000000000000000000000000');
});

test('hexToIpv6 / hexToIpv6BigInt — round-trip', () => {
  assert.equal(hexToIpv6('0x20010db8000000000000000000000001'), '2001:db8::1');
  assert.equal(hexToIpv6('20010db8000000000000000000000001'), '2001:db8::1');
  assert.equal(hexToIpv6BigInt('0x1'), 1n);
  assert.equal(hexToIpv6('0x1'), '::1');
});

test('ipv6 — expand ⇄ compress round-trips (canonical fixed point)', () => {
  const samples = ['::', '::1', '2001:db8::1', 'fe80::', '2001:db8:0:0:1:0:0:1',
                   'ff02::1:ff00:0', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'];
  for (const s of samples) {
    const expanded = ipv6Expand(s);
    const compressed = ipv6Compress(s);
    // Both derive from the same BigInt, so they must agree.
    assert.equal(ipv6ToBigInt(expanded), ipv6ToBigInt(s), `expand ${s}`);
    assert.equal(ipv6ToBigInt(compressed), ipv6ToBigInt(s), `compress ${s}`);
    // Compression is idempotent (canonical output re-compresses to itself).
    assert.equal(ipv6Compress(compressed), compressed, `idempotent ${s}`);
    assert.equal(ipv6Expand(compressed), expanded, `expand(compress) ${s}`);
  }
});

test('bigIntToIpv6Expanded / Compressed — reject out-of-range BigInt', () => {
  assert.throws(() => bigIntToIpv6Expanded(-1n), /out of range/);
  assert.throws(() => bigIntToIpv6Compressed(IPV6_MAX + 1n), /out of range/);
});

// -------- error paths --------

test('ipv6ToBigInt — rejects a double ::', () => {
  assert.throws(() => ipv6ToBigInt('2001::db8::1'), /only once/);
});

test('ipv6ToBigInt — friendly throws on malformed input', () => {
  assert.throws(() => ipv6ToBigInt(''), /Enter an IPv6/);
  assert.throws(() => ipv6ToBigInt('gggg::1'), /valid IPv6 group/);
  assert.throws(() => ipv6ToBigInt('12345::1'), /valid IPv6 group/); // 5 hex digits
  assert.throws(() => ipv6ToBigInt('1:2:3:4:5:6:7'), /8 groups/);    // too few, no ::
  assert.throws(() => ipv6ToBigInt('1:2:3:4:5:6:7:8:9'), /8 groups/); // too many
  assert.throws(() => ipv6ToBigInt('1:::2'), /check the colons|only once/);
});

test('ipv6ToBigInt — embedded IPv4 must be the final part', () => {
  // A hextet after the dotted-quad within the same colon-group is rejected.
  assert.throws(() => ipv6ToBigInt('::192.168.1.1:abcd'), /at the end/);
});

test('ipv6ToBigInt — :: must stand in for at least one group', () => {
  // Eight explicit groups plus a :: has nothing left to fill.
  assert.throws(() => ipv6ToBigInt('1:2:3:4:5:6:7:8::'), /at least one|only once/);
});

test('hexToIpv6BigInt — friendly throws', () => {
  assert.throws(() => hexToIpv6BigInt(''), /hex value/);
  assert.throws(() => hexToIpv6BigInt('0xZZ'), /up to 32 hex digits/);
  assert.throws(() => hexToIpv6BigInt('1'.repeat(33)), /up to 32 hex digits/);
});
