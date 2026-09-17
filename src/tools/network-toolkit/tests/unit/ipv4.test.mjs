// Unit tests — IPv4 core: dotted ⇄ int ⇄ hex ⇄ binary, and the parsers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const {
  ipv4ToInt, intToIpv4, ipv4ToHex, ipv4ToBinary,
  parseIpv4Decimal, parseIpv4Hex, parseIpv4Binary,
} = await loadLogic();

// 192.168.1.10 = 0xC0A8010A = 3232235786
const IP = '192.168.1.10';
const IP_INT = 3232235786;
const IP_HEX = '0xc0a8010a';
const IP_BIN = '11000000.10101000.00000001.00001010';

test('ipv4ToInt — known value', () => {
  assert.equal(ipv4ToInt(IP), IP_INT);
});

test('ipv4ToInt — boundary addresses', () => {
  assert.equal(ipv4ToInt('0.0.0.0'), 0);
  assert.equal(ipv4ToInt('255.255.255.255'), 4294967295);
  assert.equal(ipv4ToInt('0.0.0.1'), 1);
  assert.equal(ipv4ToInt('1.0.0.0'), 16777216);
});

test('ipv4ToInt — trims surrounding whitespace', () => {
  assert.equal(ipv4ToInt('  192.168.1.10  '), IP_INT);
});

test('intToIpv4 — known value and boundaries', () => {
  assert.equal(intToIpv4(IP_INT), IP);
  assert.equal(intToIpv4(0), '0.0.0.0');
  assert.equal(intToIpv4(4294967295), '255.255.255.255');
});

test('ipv4ToInt / intToIpv4 round-trip across many values', () => {
  const samples = ['0.0.0.0', '255.255.255.255', '192.168.1.10', '10.0.0.1',
                   '172.16.254.1', '8.8.8.8', '203.0.113.255', '127.0.0.1'];
  for (const ip of samples) {
    assert.equal(intToIpv4(ipv4ToInt(ip)), ip, ip);
  }
});

test('ipv4ToHex — 0x-prefixed, zero-padded to 8 digits', () => {
  assert.equal(ipv4ToHex(IP_INT), IP_HEX);
  assert.equal(ipv4ToHex(0), '0x00000000');
  assert.equal(ipv4ToHex(4294967295), '0xffffffff');
  assert.equal(ipv4ToHex(1), '0x00000001');
});

test('ipv4ToBinary — dotted 8-bit groups', () => {
  assert.equal(ipv4ToBinary(IP_INT), IP_BIN);
  assert.equal(ipv4ToBinary(0), '00000000.00000000.00000000.00000000');
  assert.equal(ipv4ToBinary(4294967295), '11111111.11111111.11111111.11111111');
});

test('parseIpv4Decimal — plain integer forms', () => {
  assert.equal(parseIpv4Decimal(String(IP_INT)), IP_INT);
  assert.equal(parseIpv4Decimal('0'), 0);
  assert.equal(parseIpv4Decimal('4294967295'), 4294967295);
  // Tolerates spaces / underscores as grouping.
  assert.equal(parseIpv4Decimal('3 232 235 786'), IP_INT);
  assert.equal(parseIpv4Decimal('3_232_235_786'), IP_INT);
});

test('parseIpv4Hex — with or without 0x, any case', () => {
  assert.equal(parseIpv4Hex('0xC0A8010A'), IP_INT);
  assert.equal(parseIpv4Hex('c0a8010a'), IP_INT);
  assert.equal(parseIpv4Hex('0x1'), 1);
  assert.equal(parseIpv4Hex('FFFFFFFF'), 4294967295);
});

test('parseIpv4Binary — dotted and plain forms', () => {
  assert.equal(parseIpv4Binary(IP_BIN), IP_INT);
  assert.equal(parseIpv4Binary('11000000101010000000000100001010'), IP_INT);
  assert.equal(parseIpv4Binary('1'), 1);
  // Short dotted groups (1–8 bits each) are accepted.
  assert.equal(parseIpv4Binary('11000000.10101000.1.1010'), IP_INT);
});

test('parsers round-trip against the formatters', () => {
  const ints = [0, 1, 256, 65535, IP_INT, 4294967295];
  for (const n of ints) {
    assert.equal(parseIpv4Decimal(String(n)), n);
    assert.equal(parseIpv4Hex(ipv4ToHex(n)), n);
    assert.equal(parseIpv4Binary(ipv4ToBinary(n)), n);
  }
});

// -------- error paths: all friendly Errors, never a crash --------

test('ipv4ToInt — friendly throws on malformed dotted', () => {
  assert.throws(() => ipv4ToInt(''), /Enter an IPv4/);
  assert.throws(() => ipv4ToInt('1.2.3'), /four parts/);
  assert.throws(() => ipv4ToInt('1.2.3.4.5'), /four parts/);
  assert.throws(() => ipv4ToInt('256.1.1.1'), /0.?255/);
  assert.throws(() => ipv4ToInt('192.168.1.999'), /0.?255/);
  assert.throws(() => ipv4ToInt('a.b.c.d'), /0.?255/);
  assert.throws(() => ipv4ToInt('192.168..1'), /0.?255/);
});

test('intToIpv4 / ipv4ToHex / ipv4ToBinary — reject out-of-range ints', () => {
  for (const fn of [intToIpv4, ipv4ToHex, ipv4ToBinary]) {
    assert.throws(() => fn(-1), /0 to 4294967295/);
    assert.throws(() => fn(4294967296), /0 to 4294967295/);
    assert.throws(() => fn(1.5), /whole number/);
  }
});

test('parseIpv4Decimal — friendly throws', () => {
  assert.throws(() => parseIpv4Decimal(''), /0 to 4294967295/);
  assert.throws(() => parseIpv4Decimal('4294967296'), /0 to 4294967295/);
  assert.throws(() => parseIpv4Decimal('-5'), /0 to 4294967295/);
  assert.throws(() => parseIpv4Decimal('12.5'), /0 to 4294967295/);
  assert.throws(() => parseIpv4Decimal('abc'), /0 to 4294967295/);
});

test('parseIpv4Hex — friendly throws', () => {
  assert.throws(() => parseIpv4Hex(''), /hex value/);
  assert.throws(() => parseIpv4Hex('0xGG'), /hex value/);
  assert.throws(() => parseIpv4Hex('0x1FFFFFFFF'), /up to 8 digits/); // 9 digits
});

test('parseIpv4Binary — friendly throws', () => {
  assert.throws(() => parseIpv4Binary(''), /binary value/);
  assert.throws(() => parseIpv4Binary('012'), /32 binary digits|0 or 1/);
  assert.throws(() => parseIpv4Binary('1'.repeat(33)), /32 binary digits/);
  assert.throws(() => parseIpv4Binary('1111.2222.3333.4444'), /1.?8 bits|four/);
  assert.throws(() => parseIpv4Binary('101.101'), /four/);
});
