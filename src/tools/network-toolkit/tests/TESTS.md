# Tests — Network Toolkit

Two required layers (per `CLAUDE.md` and `docs/conventions.md`):

- **Unit** — `node --test tests/unit/*.test.mjs`, importing `source/logic.mjs`
  directly (DOM-free pure logic). `npm run test:unit` (build:check runs first).
- **e2e** — `@playwright/test` driving the built `index.html` over `file://`.
  `npm run test:e2e` (build:check runs first).

`npm test` runs both. Current status: **76 unit tests pass, 35 e2e tests pass.**

This tool is **correctness-critical** (networking math), so the unit layer is
deliberately elaborate — it is the primary guarantee that the numbers are right.

## Unit coverage (`tests/unit/`)

### `cidr.test.mjs` — Card 2 `cidrInfo(ip, prefix)`
- The documented canonical case `192.168.1.10/24` — every field
  (network / netmask / wildcard / broadcast / first & last host / usable & total).
- Full prefix sweep of the tricky edges: `/0` (~4.29B usable), `/8`, `/24`,
  `/25` (host-bit masking), `/30` (2 usable), `/31` (RFC 3021 → 2 usable,
  first = network, last = broadcast, no reserved), `/32` (→ 1, all-equal).
- Host bits are masked off the supplied address (`.200/25` → network `.128`).
- Invariant sweep `/1../30`: `total === 2^(32-p)` and `usable === total - 2`.
- String prefix accepted (UI passes `input.value`).
- Friendly throws on a bad prefix (`33`, `-1`, `24.5`, non-numeric) and a bad
  address (`999.*`, too few parts, empty).

### `ipv4.test.mjs` — IPv4 core
- `ipv4ToInt` / `intToIpv4` known value `192.168.1.10 = 3232235786`, boundary
  addresses (`0.0.0.0`, `255.255.255.255`), whitespace trim, and a round-trip
  across eight sample addresses.
- `ipv4ToHex` (`0x`-prefixed, 8-digit padded) and `ipv4ToBinary` (dotted 8-bit
  groups) against known values and boundaries.
- `parseIpv4Decimal` / `parseIpv4Hex` / `parseIpv4Binary`: plain forms,
  underscore/space grouping, `0x` optional & case-insensitive, dotted-vs-plain
  binary, plus a formatter↔parser round-trip.
- Error paths for every function: malformed dotted (out-of-range octet, wrong
  part count, non-numeric), out-of-range ints, out-of-range decimal, bad hex
  (invalid digit, > 8 digits), bad binary (non-binary digit, > 32 bits, bad
  group count) — all friendly `Error`s, never a crash.

### `netmask.test.mjs` — Card 4 `prefixToMask` / `maskToPrefix`
- Known prefix↔mask pairs across the whole range (`/0`, `/1`, `/4`, `/8`, `/16`,
  `/24`, `/25`, `/30`, `/31`, `/32`).
- Round-trip for every prefix `0..32`.
- **Non-contiguous mask rejection** — `255.0.255.0`, `255.255.0.255`,
  `0.255.255.255`, `255.255.255.1`, `128.0.0.1` all throw "contiguous".
- Malformed dotted input delegates to `ipv4ToInt`'s friendly errors.
- Bad prefix throws (`-1`, `33`, `12.5`, non-numeric).

### `ipv6.test.mjs` — Card 3 IPv6
- `ipv6Expand` full 8-group zero-padded form; `ipv6Compress` **RFC 5952**
  canonical (lowercase, no leading zeros, single `::`).
- **Leftmost-longest** zero-run selection; a longer later run beats an earlier
  shorter one; a **single** zero group is NOT compressed.
- Embedded IPv4 suffix accepted on input, normalized to hextets; zone-id
  (`%eth0`) stripped.
- `ipv6ToBigInt` / `ipv6ToHex` / `hexToIpv6` known values and round-trips;
  expand ⇄ compress fixed-point + idempotence sweep.
- Error paths: double `::`, empty, invalid group (`gggg`, 5 hex digits), wrong
  group count, embedded-IPv4 not final, `::` with nothing to fill, bad hex.

### `transfer.test.mjs` — Card 1 transfer / rate
- `sizeToBits`: byte family ×8 and bit family ×1 across every prefix power;
  binary (1024) vs decimal (1000); base defaults to binary unless `1000` given.
- `rateToBitsPerSec`: bit and byte rate families (`1 B/s = 8 bit/s`,
  `12.5 MB/s = 100 Mbps`).
- `transferTime`: the headline **1 GB @ 100 Mbps (decimal) = 80 s exactly**;
  byte-rate path agrees; binary base gives `81.92 s`; string inputs; simple
  ratios; zero amount allowed.
- `referenceTransferTimes`: `1 MB/GB/TB/PB` @ 100 Mbps exact seconds, and the
  row set matches `REFERENCE_SIZES`.
- Error paths: negative/non-numeric amount, non-positive speed, unknown units.
- Unit-table integrity: `SIZE_UNIT_ORDER` (byte then bit) and every rate unit
  fully keyed.

### `formatting.test.mjs` — `formatNumber` / `expToPlain` / `humanizeSeconds`
- `formatNumber`: integers without grouping, trimmed decimals, exponential for
  very large/small (no `e+`, no capital `E`), empty for non-finite/non-number.
- `expToPlain`: exponential-string → plain decimal, positive/negative exponents.
- `humanizeSeconds`: sub-second (`ms` / `µs` / `ns`), whole-second composition
  (`1m 20s`, `1h 1m 1s`, `1d 1h`), Julian-year lead, empty for invalid input.

## e2e coverage (`tests/network-toolkit.e2e.mjs`)

Drives the built `index.html` over `file://` via `data-testid` hooks and the
inert `window.__networkToolkit` namespace.

- **First-load Help** — genuine first-load in a fresh `browser.newContext()`
  (auto-shows once, stays closed after reload, writes the seen flag); re-open
  via `?`. All other tests pre-seed `network-toolkit:help-seen:v1`.
- **Help modal** — ✕ / Esc / backdrop close, focus moves to ✕ on open, focus
  returns to the trigger, Tab stays trapped inside the dialog.
- **Card 1 — Transfer** — default `1m 20s` / `80 s` + 4-row reference table;
  amount edit recomputes; base toggle `80s → 81.92s` with `aria-pressed`
  flipping; unit change recomputes; both unit `<select>`s carry the base.css
  chevron with padding reserved (no clip); invalid speed → friendly error and
  recovery; Copy-all flashes.
- **Card 2 — CIDR** — default `192.168.1.10/24` full result set; `/31` and `/32`
  usable counts + edge-case notes; invalid address → error + recovery;
  per-value copy button flashes ✅.
- **Card 3 — IP converter** — IPv4 loads all four reps; editing int / hex /
  dotted cross-updates the others while leaving the edited field intact (single
  source of truth); invalid IPv4 leaves others intact. IPv6 loads
  compressed/expanded/hex; editing compressed or hex cross-updates to RFC 5952
  canonical; double `::` → friendly error.
- **Card 4 — Netmask ⇄ prefix** — default `/24` + wildcard; prefix→mask and
  mask→prefix both live; non-contiguous mask → friendly error + recovery.
- **Persistence** — inputs, unit and base selections survive a reload (with a
  settle wait for the `file://` write race); `window.__networkToolkit` hook is
  present and inert with working pure functions.
- **Responsive** — wide desktop (1600px) uses real width with no horizontal
  page overflow; mobile (375px, `deviceScaleFactor: 2`) has no horizontal
  overflow and every card fits.
