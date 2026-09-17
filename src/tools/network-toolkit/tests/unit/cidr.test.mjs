// Unit tests — Card 2: cidrInfo(ip, prefix). Correctness-critical subnet math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { cidrInfo } = await loadLogic();

test('cidrInfo /24 — the canonical documented case', () => {
  const r = cidrInfo('192.168.1.10', 24);
  assert.equal(r.prefix, 24);
  assert.equal(r.address, '192.168.1.10');
  assert.equal(r.network, '192.168.1.0');
  assert.equal(r.netmask, '255.255.255.0');
  assert.equal(r.wildcard, '0.0.0.255');
  assert.equal(r.broadcast, '192.168.1.255');
  assert.equal(r.firstHost, '192.168.1.1');
  assert.equal(r.lastHost, '192.168.1.254');
  assert.equal(r.usableHosts, 254);
  assert.equal(r.totalHosts, 256);
  assert.equal(r.cidr, '192.168.1.0/24');
});

test('cidrInfo /8', () => {
  const r = cidrInfo('10.20.30.40', 8);
  assert.equal(r.network, '10.0.0.0');
  assert.equal(r.netmask, '255.0.0.0');
  assert.equal(r.wildcard, '0.255.255.255');
  assert.equal(r.broadcast, '10.255.255.255');
  assert.equal(r.firstHost, '10.0.0.1');
  assert.equal(r.lastHost, '10.255.255.254');
  assert.equal(r.usableHosts, 16777214);
  assert.equal(r.totalHosts, 16777216);
  assert.equal(r.cidr, '10.0.0.0/8');
});

test('cidrInfo /0 — the whole address space, ~4.29B usable', () => {
  const r = cidrInfo('192.168.1.10', 0);
  assert.equal(r.network, '0.0.0.0');
  assert.equal(r.netmask, '0.0.0.0');
  assert.equal(r.wildcard, '255.255.255.255');
  assert.equal(r.broadcast, '255.255.255.255');
  assert.equal(r.firstHost, '0.0.0.1');
  assert.equal(r.lastHost, '255.255.255.254');
  assert.equal(r.usableHosts, 4294967294);
  assert.equal(r.totalHosts, 4294967296);
  assert.equal(r.cidr, '0.0.0.0/0');
});

test('cidrInfo /30 — smallest classic subnet, 2 usable hosts', () => {
  const r = cidrInfo('192.168.1.10', 30);
  assert.equal(r.network, '192.168.1.8');
  assert.equal(r.netmask, '255.255.255.252');
  assert.equal(r.wildcard, '0.0.0.3');
  assert.equal(r.broadcast, '192.168.1.11');
  assert.equal(r.firstHost, '192.168.1.9');
  assert.equal(r.lastHost, '192.168.1.10');
  assert.equal(r.usableHosts, 2);
  assert.equal(r.totalHosts, 4);
});

test('cidrInfo /31 — RFC 3021 point-to-point: 2 usable, no reserved broadcast', () => {
  const r = cidrInfo('192.168.1.10', 31);
  assert.equal(r.network, '192.168.1.10');
  assert.equal(r.netmask, '255.255.255.254');
  assert.equal(r.wildcard, '0.0.0.1');
  assert.equal(r.broadcast, '192.168.1.11');
  // Both addresses are usable: first = network, last = broadcast.
  assert.equal(r.firstHost, '192.168.1.10');
  assert.equal(r.lastHost, '192.168.1.11');
  assert.equal(r.usableHosts, 2);
  assert.equal(r.totalHosts, 2);
});

test('cidrInfo /32 — single host: network = broadcast = host', () => {
  const r = cidrInfo('192.168.1.10', 32);
  assert.equal(r.network, '192.168.1.10');
  assert.equal(r.netmask, '255.255.255.255');
  assert.equal(r.wildcard, '0.0.0.0');
  assert.equal(r.broadcast, '192.168.1.10');
  assert.equal(r.firstHost, '192.168.1.10');
  assert.equal(r.lastHost, '192.168.1.10');
  assert.equal(r.usableHosts, 1);
  assert.equal(r.totalHosts, 1);
});

test('cidrInfo masks the host bits off the given address', () => {
  // .130 in a /25 lands in the upper half; .200 masks down to network .128.
  const r = cidrInfo('192.168.1.200', 25);
  assert.equal(r.network, '192.168.1.128');
  assert.equal(r.broadcast, '192.168.1.255');
  assert.equal(r.firstHost, '192.168.1.129');
  assert.equal(r.lastHost, '192.168.1.254');
  assert.equal(r.usableHosts, 126);
  assert.equal(r.totalHosts, 128);
});

test('cidrInfo accepts a string prefix (UI passes input.value)', () => {
  const r = cidrInfo('192.168.1.10', '24');
  assert.equal(r.prefix, 24);
  assert.equal(r.network, '192.168.1.0');
});

test('cidrInfo prefix count sanity — usable = total - 2 for /1../30', () => {
  for (let p = 1; p <= 30; p++) {
    const r = cidrInfo('203.0.113.5', p);
    assert.equal(r.totalHosts, Math.pow(2, 32 - p), `total for /${p}`);
    assert.equal(r.usableHosts, r.totalHosts - 2, `usable for /${p}`);
  }
});

test('cidrInfo throws friendly on a bad prefix', () => {
  assert.throws(() => cidrInfo('192.168.1.1', 33), /0 to 32/);
  assert.throws(() => cidrInfo('192.168.1.1', -1), /0 to 32/);
  assert.throws(() => cidrInfo('192.168.1.1', 24.5), /whole number/);
  assert.throws(() => cidrInfo('192.168.1.1', 'x'), /0 to 32/);
});

test('cidrInfo throws friendly on a bad address', () => {
  assert.throws(() => cidrInfo('999.1.1.1', 24), /0.?255/);
  assert.throws(() => cidrInfo('1.2.3', 24), /four parts/);
  assert.throws(() => cidrInfo('', 24), /Enter an IPv4/);
});
