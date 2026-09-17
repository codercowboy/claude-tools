
  // =====================================================================
  // Network Toolkit — pure logic (DOM-free, unit-tested)
  //
  // No document / window / localStorage in this file. app.mjs inlines it at
  // build time; tests/unit/*.test.mjs import it directly. Every function is
  // pure and throws Error(friendly message) on invalid input — the UI catches
  // and never crashes. This is correctness-critical code; keep it exact.
  // =====================================================================

  // ---------------------------------------------------------------------
  // Number formatting
  // ---------------------------------------------------------------------
  // Clean display string for a Number: no thousands grouping, trailing zeros
  // trimmed, ~12 significant figures for non-integers, exponential only for
  // very large (|n| >= 1e21) or very small (0 < |n| < 1e-7) magnitudes.
  function formatNumber(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e21 || abs < 1e-7) {
      return n.toExponential().replace('e+', 'e').replace('E', 'e');
    }
    if (Number.isInteger(n) && abs < 1e21) {
      return n.toFixed(0);
    }
    let s = n.toPrecision(12);
    if (/e/i.test(s)) s = expToPlain(s);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  // "1.234e+12" / "5e-7" -> plain decimal string.
  function expToPlain(s) {
    const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(s);
    if (!m) return s;
    const sign = m[1];
    const intPart = m[2];
    const fracPart = m[3] || '';
    const exp = parseInt(m[4], 10);
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;
    let out;
    if (pointPos <= 0) {
      out = '0.' + '0'.repeat(-pointPos) + digits;
    } else if (pointPos >= digits.length) {
      out = digits + '0'.repeat(pointPos - digits.length);
    } else {
      out = digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
    }
    return sign + out;
  }

  // A length of time in seconds -> readable "1h 12m 30s" (or "500 ms" / "12 µs"
  // below a second). Whole-second granularity at and above 1 second.
  function humanizeSeconds(sec) {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '';
    if (sec === 0) return '0s';
    if (sec < 1) {
      const ms = sec * 1e3;
      if (ms >= 1) return formatNumber(roundSig(ms, 4)) + ' ms';
      const us = sec * 1e6;
      if (us >= 1) return formatNumber(roundSig(us, 4)) + ' µs';
      return formatNumber(roundSig(sec * 1e9, 4)) + ' ns';
    }
    const units = [
      ['y', 31557600], // Julian year: 365.25 days
      ['d', 86400],
      ['h', 3600],
      ['m', 60],
      ['s', 1],
    ];
    let rem = Math.floor(sec);
    const parts = [];
    for (const [label, s] of units) {
      if (rem >= s) {
        const v = Math.floor(rem / s);
        rem -= v * s;
        parts.push(v + label);
      }
    }
    return parts.join(' ');
  }

  function roundSig(n, sig) {
    if (n === 0) return 0;
    const d = Math.ceil(Math.log10(Math.abs(n)));
    const power = sig - d;
    const mag = Math.pow(10, power);
    return Math.round(n * mag) / mag;
  }

  // ---------------------------------------------------------------------
  // Card 1 — Transfer time & rate
  // ---------------------------------------------------------------------
  // Two families (byte = 8 bits, bit) and prefix powers (base .. Peta).
  // `base` ∈ {1024, 1000} applies between adjacent prefix powers of the SAME
  // family; bit ↔ byte is always ×8 regardless of base.
  const SIZE_UNITS = [
    { key: 'B',  name: 'Byte',      abbr: 'B',  family: 'byte', power: 0 },
    { key: 'KB', name: 'Kilobyte',  abbr: 'KB', family: 'byte', power: 1 },
    { key: 'MB', name: 'Megabyte',  abbr: 'MB', family: 'byte', power: 2 },
    { key: 'GB', name: 'Gigabyte',  abbr: 'GB', family: 'byte', power: 3 },
    { key: 'TB', name: 'Terabyte',  abbr: 'TB', family: 'byte', power: 4 },
    { key: 'PB', name: 'Petabyte',  abbr: 'PB', family: 'byte', power: 5 },
    { key: 'b',  name: 'bit',       abbr: 'b',  family: 'bit',  power: 0 },
    { key: 'Kb', name: 'Kilobit',   abbr: 'Kb', family: 'bit',  power: 1 },
    { key: 'Mb', name: 'Megabit',   abbr: 'Mb', family: 'bit',  power: 2 },
    { key: 'Gb', name: 'Gigabit',   abbr: 'Gb', family: 'bit',  power: 3 },
    { key: 'Tb', name: 'Terabit',   abbr: 'Tb', family: 'bit',  power: 4 },
    { key: 'Pb', name: 'Petabit',   abbr: 'Pb', family: 'bit',  power: 5 },
  ];
  const SIZE_UNIT_BY_KEY = Object.fromEntries(SIZE_UNITS.map((u) => [u.key, u]));

  // Order shown in the amount dropdown: byte family then bit family.
  const SIZE_UNIT_ORDER = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'b', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb'];

  const RATE_UNITS = [
    { key: 'bps',  name: 'bit per second',      abbr: 'bps',  family: 'bit',  power: 0 },
    { key: 'Kbps', name: 'Kilobit per second',  abbr: 'Kbps', family: 'bit',  power: 1 },
    { key: 'Mbps', name: 'Megabit per second',  abbr: 'Mbps', family: 'bit',  power: 2 },
    { key: 'Gbps', name: 'Gigabit per second',  abbr: 'Gbps', family: 'bit',  power: 3 },
    { key: 'Tbps', name: 'Terabit per second',  abbr: 'Tbps', family: 'bit',  power: 4 },
    { key: 'Bps',  name: 'Byte per second',     abbr: 'B/s',  family: 'byte', power: 0 },
    { key: 'KBps', name: 'Kilobyte per second', abbr: 'KB/s', family: 'byte', power: 1 },
    { key: 'MBps', name: 'Megabyte per second', abbr: 'MB/s', family: 'byte', power: 2 },
    { key: 'GBps', name: 'Gigabyte per second', abbr: 'GB/s', family: 'byte', power: 3 },
    { key: 'TBps', name: 'Terabyte per second', abbr: 'TB/s', family: 'byte', power: 4 },
  ];
  const RATE_UNIT_BY_KEY = Object.fromEntries(RATE_UNITS.map((u) => [u.key, u]));

  const REFERENCE_SIZES = [
    { label: '1 MB', unitKey: 'MB' },
    { label: '1 GB', unitKey: 'GB' },
    { label: '1 TB', unitKey: 'TB' },
    { label: '1 PB', unitKey: 'PB' },
  ];

  function normalizeBase(base) {
    return base === 1000 ? 1000 : 1024;
  }

  // Convert a (value, size unit) into a bit count.
  function sizeToBits(value, unitKey, base) {
    const u = SIZE_UNIT_BY_KEY[unitKey];
    if (!u) throw new Error('Unknown size unit.');
    const perFamily = u.family === 'byte' ? 8 : 1;
    return Number(value) * perFamily * Math.pow(normalizeBase(base), u.power);
  }

  // Convert a (value, rate unit) into bits-per-second.
  function rateToBitsPerSec(value, rateUnitKey, base) {
    const u = RATE_UNIT_BY_KEY[rateUnitKey];
    if (!u) throw new Error('Unknown speed unit.');
    const perFamily = u.family === 'byte' ? 8 : 1;
    return Number(value) * perFamily * Math.pow(normalizeBase(base), u.power);
  }

  // Seconds to transfer `size` `sizeUnit` at `rate` `rateUnit`.
  function transferTime(size, sizeUnit, rate, rateUnit, base) {
    const sizeNum = Number(size);
    const rateNum = Number(rate);
    if (!Number.isFinite(sizeNum) || sizeNum < 0) throw new Error('Enter a transfer amount of zero or more.');
    if (!Number.isFinite(rateNum) || rateNum <= 0) throw new Error('Enter a speed greater than zero.');
    const bits = sizeToBits(sizeNum, sizeUnit, base);
    const bitsPerSec = rateToBitsPerSec(rateNum, rateUnit, base);
    return bits / bitsPerSec;
  }

  // For each reference size (1 MB … 1 PB), the seconds it takes at this speed.
  function referenceTransferTimes(rate, rateUnit, base) {
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) throw new Error('Enter a speed greater than zero.');
    const bitsPerSec = rateToBitsPerSec(rateNum, rateUnit, base);
    return REFERENCE_SIZES.map((r) => ({
      label: r.label,
      seconds: sizeToBits(1, r.unitKey, base) / bitsPerSec,
    }));
  }

  // ---------------------------------------------------------------------
  // IPv4 core
  // ---------------------------------------------------------------------
  // Canonical IPv4 value is an unsigned 32-bit integer (Number, 0..2^32-1).
  function ipv4ToInt(dotted) {
    const s = String(dotted == null ? '' : dotted).trim();
    if (s === '') throw new Error('Enter an IPv4 address, like 192.168.0.1.');
    const parts = s.split('.');
    if (parts.length !== 4) throw new Error('An IPv4 address has four parts, like 192.168.0.1.');
    let v = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) throw new Error('Each part of an IPv4 address is a number 0–255.');
      const n = Number(part);
      if (n > 255) throw new Error('Each part of an IPv4 address is a number 0–255.');
      v = v * 256 + n;
    }
    return v >>> 0;
  }

  function intToIpv4(int) {
    const n = Number(int);
    if (!Number.isInteger(n) || n < 0 || n > 0xFFFFFFFF) {
      throw new Error('Enter a whole number from 0 to 4294967295.');
    }
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  function ipv4ToHex(int) {
    const n = Number(int);
    if (!Number.isInteger(n) || n < 0 || n > 0xFFFFFFFF) {
      throw new Error('Enter a whole number from 0 to 4294967295.');
    }
    return '0x' + (n >>> 0).toString(16).padStart(8, '0');
  }

  // Dotted binary, one octet per group: "11000000.10101000.00000001.00000001".
  function ipv4ToBinary(int) {
    const n = Number(int);
    if (!Number.isInteger(n) || n < 0 || n > 0xFFFFFFFF) {
      throw new Error('Enter a whole number from 0 to 4294967295.');
    }
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
      .map((b) => b.toString(2).padStart(8, '0'))
      .join('.');
  }

  function parseIpv4Decimal(str) {
    const s = String(str == null ? '' : str).trim().replace(/[_\s]/g, '');
    if (s === '') throw new Error('Enter a whole number from 0 to 4294967295.');
    if (!/^\d+$/.test(s)) throw new Error('Enter a whole number from 0 to 4294967295.');
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 0xFFFFFFFF) {
      throw new Error('Enter a whole number from 0 to 4294967295.');
    }
    return n >>> 0;
  }

  function parseIpv4Hex(str) {
    let s = String(str == null ? '' : str).trim().replace(/[_\s]/g, '');
    if (s === '') throw new Error('Enter a hex value like 0xC0A80001.');
    s = s.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{1,8}$/.test(s)) throw new Error('Enter a hex value like 0xC0A80001 (up to 8 digits).');
    return parseInt(s, 16) >>> 0;
  }

  // Accepts dotted binary ("11000000.10101000...") or a plain up-to-32-bit
  // binary string.
  function parseIpv4Binary(str) {
    let s = String(str == null ? '' : str).trim();
    if (s === '') throw new Error('Enter a binary value like 11000000.10101000.00000001.00000001.');
    if (s.includes('.')) {
      const parts = s.split('.');
      if (parts.length !== 4) throw new Error('Dotted binary needs four 8-bit groups.');
      let v = 0;
      for (const p of parts) {
        if (!/^[01]{1,8}$/.test(p)) throw new Error('Each binary group is 1–8 bits (0 or 1).');
        v = v * 256 + parseInt(p, 2);
      }
      return v >>> 0;
    }
    s = s.replace(/[_\s]/g, '');
    if (!/^[01]{1,32}$/.test(s)) throw new Error('Enter up to 32 binary digits (0 or 1).');
    return parseInt(s, 2) >>> 0;
  }

  // ---------------------------------------------------------------------
  // Card 2 — CIDR / subnet
  // ---------------------------------------------------------------------
  function cidrInfo(ip, prefix) {
    const ipInt = ipv4ToInt(ip);
    const p = Number(prefix);
    if (!Number.isInteger(p) || p < 0 || p > 32) throw new Error('Prefix length must be a whole number from 0 to 32.');

    const maskInt = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
    const wildcardInt = (~maskInt) >>> 0;
    const networkInt = (ipInt & maskInt) >>> 0;
    const broadcastInt = (networkInt | wildcardInt) >>> 0;
    const totalHosts = Math.pow(2, 32 - p);

    let firstHostInt, lastHostInt, usableHosts;
    if (p === 32) {
      firstHostInt = lastHostInt = networkInt;
      usableHosts = 1;
    } else if (p === 31) {
      // RFC 3021 point-to-point: both addresses usable, none reserved.
      firstHostInt = networkInt;
      lastHostInt = broadcastInt;
      usableHosts = 2;
    } else {
      firstHostInt = (networkInt + 1) >>> 0;
      lastHostInt = (broadcastInt - 1) >>> 0;
      usableHosts = totalHosts - 2;
    }

    return {
      prefix: p,
      address: intToIpv4(ipInt),
      netmask: intToIpv4(maskInt),
      wildcard: intToIpv4(wildcardInt),
      network: intToIpv4(networkInt),
      broadcast: intToIpv4(broadcastInt),
      firstHost: intToIpv4(firstHostInt),
      lastHost: intToIpv4(lastHostInt),
      usableHosts,
      totalHosts,
      cidr: intToIpv4(networkInt) + '/' + p,
    };
  }

  // ---------------------------------------------------------------------
  // Card 4 — Netmask <-> prefix
  // ---------------------------------------------------------------------
  function prefixToMask(prefix) {
    const p = Number(prefix);
    if (!Number.isInteger(p) || p < 0 || p > 32) throw new Error('Prefix length must be a whole number from 0 to 32.');
    const int = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
    return intToIpv4(int);
  }

  function maskToPrefix(mask) {
    const int = ipv4ToInt(mask); // validates dotted form
    // A valid mask is contiguous 1-bits then 0-bits. Then the inverse is a run
    // of low 1-bits, i.e. (inv & (inv+1)) === 0.
    const inv = (~int) >>> 0;
    if ((((inv & (inv + 1)) >>> 0)) !== 0) {
      throw new Error('That isn’t a valid subnet mask — the 1-bits must be contiguous (e.g. 255.255.255.0).');
    }
    let count = 0;
    let n = int >>> 0;
    while (n) { count += n & 1; n >>>= 1; }
    return count;
  }

  // ---------------------------------------------------------------------
  // Card 3 — IPv6
  // ---------------------------------------------------------------------
  // Canonical IPv6 value is a 128-bit BigInt (0 .. 2^128-1).
  const IPV6_MAX = (1n << 128n) - 1n;

  function ipv6ToBigInt(input) {
    let s = String(input == null ? '' : input).trim();
    if (s === '') throw new Error('Enter an IPv6 address, like 2001:db8::1.');
    // Strip a zone id (%eth0) — not preserved.
    const pct = s.indexOf('%');
    if (pct >= 0) s = s.slice(0, pct);
    s = s.toLowerCase();

    const firstDouble = s.indexOf('::');
    if (firstDouble >= 0 && firstDouble !== s.lastIndexOf('::')) {
      throw new Error('An IPv6 address may contain “::” only once.');
    }

    const toGroups = (part) => {
      if (part === '') return [];
      const raw = part.split(':');
      const groups = [];
      for (let i = 0; i < raw.length; i++) {
        const g = raw[i];
        if (g === '') throw new Error('Invalid IPv6 address — check the colons.');
        if (g.includes('.')) {
          if (i !== raw.length - 1) throw new Error('An embedded IPv4 part must be at the end of the address.');
          const v4 = ipv4ToInt(g);
          groups.push((v4 >>> 16) & 0xffff);
          groups.push(v4 & 0xffff);
        } else {
          if (!/^[0-9a-f]{1,4}$/.test(g)) throw new Error('“' + raw[i] + '” isn’t a valid IPv6 group (1–4 hex digits).');
          groups.push(parseInt(g, 16));
        }
      }
      return groups;
    };

    let allGroups;
    if (firstDouble >= 0) {
      const headGroups = toGroups(s.slice(0, firstDouble));
      const tailGroups = toGroups(s.slice(firstDouble + 2));
      const missing = 8 - headGroups.length - tailGroups.length;
      if (missing < 1) throw new Error('“::” must stand in for at least one group of zeros.');
      allGroups = [...headGroups, ...Array(missing).fill(0), ...tailGroups];
    } else {
      allGroups = toGroups(s);
      if (allGroups.length !== 8) throw new Error('An IPv6 address needs 8 groups, or use “::” to fill zeros.');
    }
    if (allGroups.length !== 8) throw new Error('Invalid IPv6 address.');

    let v = 0n;
    for (const g of allGroups) v = (v << 16n) | BigInt(g);
    return v;
  }

  function bigIntToGroups(v) {
    if (typeof v !== 'bigint' || v < 0n || v > IPV6_MAX) throw new Error('IPv6 value out of range.');
    const groups = [];
    for (let i = 0; i < 8; i++) groups.push(Number((v >> BigInt((7 - i) * 16)) & 0xffffn));
    return groups;
  }

  function bigIntToIpv6Expanded(v) {
    return bigIntToGroups(v).map((g) => g.toString(16).padStart(4, '0')).join(':');
  }

  // RFC 5952 canonical form: lowercase, no leading zeros, leftmost-longest run
  // of >= 2 zero groups compressed to "::".
  function bigIntToIpv6Compressed(v) {
    const groups = bigIntToGroups(v);
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (let i = 0; i < 8; i++) {
      if (groups[i] === 0) {
        if (curStart < 0) { curStart = i; curLen = 1; } else { curLen++; }
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      } else {
        curStart = -1; curLen = 0;
      }
    }
    const parts = groups.map((g) => g.toString(16));
    if (bestLen >= 2) {
      const before = parts.slice(0, bestStart);
      const after = parts.slice(bestStart + bestLen);
      return before.join(':') + '::' + after.join(':');
    }
    return parts.join(':');
  }

  function ipv6Expand(input) { return bigIntToIpv6Expanded(ipv6ToBigInt(input)); }
  function ipv6Compress(input) { return bigIntToIpv6Compressed(ipv6ToBigInt(input)); }
  function ipv6ToHex(input) { return '0x' + ipv6ToBigInt(input).toString(16).padStart(32, '0'); }

  function hexToIpv6BigInt(str) {
    let s = String(str == null ? '' : str).trim().replace(/[_\s]/g, '');
    if (s === '') throw new Error('Enter a hex value like 0x20010db8000000000000000000000001.');
    s = s.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{1,32}$/.test(s)) throw new Error('Enter up to 32 hex digits.');
    const v = BigInt('0x' + s);
    if (v > IPV6_MAX) throw new Error('Value is larger than 128 bits.');
    return v;
  }
  function hexToIpv6(str) { return bigIntToIpv6Compressed(hexToIpv6BigInt(str)); }

  export {
    // formatting
    formatNumber, expToPlain, humanizeSeconds,
    // card 1 — transfer / rate
    SIZE_UNITS, SIZE_UNIT_BY_KEY, SIZE_UNIT_ORDER,
    RATE_UNITS, RATE_UNIT_BY_KEY, REFERENCE_SIZES,
    sizeToBits, rateToBitsPerSec, transferTime, referenceTransferTimes,
    // card 3 — IPv4
    ipv4ToInt, intToIpv4, ipv4ToHex, ipv4ToBinary,
    parseIpv4Decimal, parseIpv4Hex, parseIpv4Binary,
    // card 2 — CIDR
    cidrInfo,
    // card 4 — netmask
    prefixToMask, maskToPrefix,
    // card 3 — IPv6
    IPV6_MAX, ipv6ToBigInt, bigIntToIpv6Expanded, bigIntToIpv6Compressed,
    ipv6Expand, ipv6Compress, ipv6ToHex, hexToIpv6BigInt, hexToIpv6,
  };
