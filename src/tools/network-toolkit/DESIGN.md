# Network Toolkit — DESIGN.md

Source-of-truth spec for the `network-toolkit` utility.

## What it is

A single-file, **offline** stack of networking calculators developers reach for:
transfer-time math, CIDR/subnet math, IP-representation conversion, and
netmask ⇄ prefix conversion. Everything is **pure, local computation** — the
tool performs **no** DNS, whois, ping, or any network request whatsoever.
Nothing typed ever leaves the browser.

It ships as one self-contained `index.html` that opens from `file://`, authored
build-assembled from `source/` (see `docs/conventions.md` § Build-assembled
tools). Vanilla JS, zero runtime deps, no secure-context-only APIs.

## Cards

Four independent cards, stacked (dev-converter multi-card layout). Each card
validates its own inputs and shows friendly, non-crashing errors via a polite
`aria-live` region.

### Card 1 — Transfer time & rate calculator

Enter an **amount** to transfer (value + unit) and a **speed** (value + rate
unit); the card shows the **time it takes**, humanized (e.g. `1h 12m 30s`) and
as an exact seconds value. Below it, a **reference table** shows how long
**1 MB / 1 GB / 1 TB / 1 PB** take to transfer at the entered speed.

- **Units.** Amount accepts any **bit OR byte** unit, from Byte → Petabyte and
  bit → Petabit, with fully-spelled dropdown labels + abbreviation, e.g.
  `Gigabit (Gb)`, `Gigabyte (GB)` — the dev-converter unit-naming convention.
  Speed accepts bit-per-second and byte-per-second units up to Tera, labelled
  `Megabit per second (Mbps)`, `Megabyte per second (MB/s)`, etc.
- **bit ↔ byte is always ×8.**
- **Prefix base.** A **Binary (1024) / Decimal (1000)** toggle applies uniformly
  to every prefix power (the same base handling dev-converter exposes), so the
  math stays consistent and testable. Default is **Decimal (1000)** — the
  convention network transfer rates are quoted in. This is documented in the
  card hint and Help. (Real-world nuance — bit rates are conventionally decimal
  while byte file sizes are often binary — is called out in Help; the toggle
  lets the user match whichever convention they mean.)

### Card 2 — CIDR / subnet calculator

Enter an IPv4 address + prefix (e.g. `192.168.0.0/24`) and get: netmask,
wildcard mask, network address, broadcast address, first/last usable host,
usable host count, and total address count.

- **Edge cases.** `/31` (RFC 3021 point-to-point): 2 usable hosts, first =
  network, last = broadcast, no reserved network/broadcast. `/32`: 1 host
  (host = network = broadcast). `/0`: 4 294 967 294 usable hosts.
- Broadcast/first/last are still computed for `/31` and `/32`; the card notes
  that broadcast is not meaningful there.

### Card 3 — IP representation converter

- **IPv4:** dotted ⇄ integer (decimal) ⇄ hex (`0x…`) ⇄ dotted-binary. Editing
  any one representation updates the others (single source of truth = the
  unsigned 32-bit integer).
- **IPv6:** compressed ⇄ expanded ⇄ hex (`0x…`, 32 digits). Editing any one
  updates the others (single source of truth = the 128-bit BigInt). Supports
  `::` zero-compression (RFC 5952 canonical output: lowercase, no leading
  zeros, leftmost-longest run compressed, single-group zero runs not
  compressed), embedded IPv4 suffix on input, and zone-id stripping.

### Card 4 — Netmask ⇄ prefix

Convert a dotted netmask to `/prefix` and a prefix back to a dotted netmask,
both directions live. **Validates that a mask is contiguous** (1-bits then
0-bits, e.g. `255.255.255.0`); a non-contiguous mask like `255.0.255.0` is
rejected with a friendly error. Also shows the wildcard mask.

## Pure logic (`source/logic.mjs`) — correctness-critical, heavily unit-tested

DOM-free, exported ES module; `app.mjs` inlines it at build (`<<ct:inline
logic.mjs>>`) and `tests/unit/*.test.mjs` import it directly. Every function is
pure and throws `Error` with a friendly message on invalid input (never
crashes the UI).

Surface:

- **Formatting:** `formatNumber(n)`, `humanizeSeconds(sec)`.
- **Data-size / rate:** `SIZE_UNITS`, `SIZE_UNIT_BY_KEY`, `RATE_UNITS`,
  `RATE_UNIT_BY_KEY`, `sizeToBits(value, unitKey, base)`,
  `rateToBitsPerSec(value, rateUnitKey, base)`,
  `transferTime(size, sizeUnit, rate, rateUnit, base)` → seconds,
  `referenceTransferTimes(rate, rateUnit, base)` → `[{label, seconds}]`,
  `REFERENCE_SIZES`.
- **IPv4:** `ipv4ToInt(dotted)`, `intToIpv4(int)`, `ipv4ToHex(int)`,
  `ipv4ToBinary(int)`, `parseIpv4Hex(str)`, `parseIpv4Decimal(str)`,
  `parseIpv4Binary(str)`.
- **CIDR:** `cidrInfo(ip, prefix)` → `{prefix, address, netmask, wildcard,
  network, broadcast, firstHost, lastHost, usableHosts, totalHosts, cidr}`.
- **Netmask:** `maskToPrefix(dottedMask)` (throws on non-contiguous),
  `prefixToMask(prefix)`.
- **IPv6:** `ipv6ToBigInt(str)`, `ipv6Expand(str)`, `ipv6Compress(str)`,
  `ipv6ToHex(str)`, `hexToIpv6(hexStr)` (→ compressed), `bigIntToIpv6Expanded`,
  `bigIntToIpv6Compressed`.

## UX / conventions

- **First-load Help** popup (accessible modal, `✕` close, Esc/backdrop close,
  focus trap, reduced-motion), auto-shown once; seen-flag
  `network-toolkit:help-seen:v1`. Reachable afterward via the `?` button.
- **Persistence:** `network-toolkit:v1` stores the raw inputs and unit/base
  selections for every card (never derived output). Best-effort try/catch.
- **controls.css adopted:** 44px control height; in-field copy buttons — always
  on read-only outputs, revealed-when-non-empty on editable inputs. Watch the
  `<select>` padding-longhand + width trap (spelled-out unit names need width).
- **Responsive & wide-screen:** cards stack on narrow screens with no
  horizontal overflow; the app widens on large viewports (wider `max-width`,
  grids grow). Wide result tables scroll inside their own container.
- **Testability:** stable `data-testid`s + inert `window.__networkToolkit`
  hook exposing the pure functions, live `state`, and a few render entry points.
- og/Twitter meta in `<head>`, build-inlined footer, `preview.png` (later
  stage).

## Non-goals / limitations

- No DNS, whois, ping, traceroute, geolocation, or any network I/O — purely
  offline math. (This is the point: it works from `file://` with no server.)
- IPv6 is treated as a 128-bit value; scopes/zone-ids are stripped, not
  preserved. Embedded-IPv4 is accepted on input but normalized to hextet output.
- Prefix-base toggle is applied uniformly rather than auto-switching base by
  unit family, a deliberate simplicity/correctness choice (documented in Help).

## Destructive-action note

Clear buttons only wipe short, easily-retyped single inputs, so per
`docs/conventions.md` they skip the confirm modal (documented carve-out).
