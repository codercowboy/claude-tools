# Network Toolkit

A single-file, offline network calculator for developers: transfer-time math,
CIDR/subnet math, IP-representation conversion, and netmask ⇄ prefix
conversion. Open `index.html` in any modern browser — it works straight from
`file://`, no server, no build, no dependencies.

> **Fully offline — no network calls.** This tool does **no** DNS lookups,
> whois, pings, or requests of any kind. Everything is pure local computation;
> nothing you type ever leaves your browser.

## Cards

### Transfer Time & Rate
Enter an **amount** to transfer and a **speed**; get the transfer **time**
(humanized, e.g. `1h 12m 30s`, plus exact seconds). A reference table shows how
long **1 MB / 1 GB / 1 TB / 1 PB** take at that speed.

- Amounts and speeds accept any **bit or byte** unit, with fully-spelled
  dropdowns + abbreviations (`Gigabit (Gb)`, `Gigabyte (GB)`,
  `Megabit per second (Mbps)`, `Megabyte per second (MB/s)`, …).
- **bit ↔ byte is always ×8.**
- The **Decimal (1000) / Binary (1024)** toggle sets the prefix base uniformly.
  Network rates are conventionally decimal (`Mbps` = 1,000,000 bit/s); file
  sizes are often binary — pick whichever convention you mean.

### CIDR / Subnet
Enter an IPv4 address and a prefix (e.g. `192.168.0.0/24`) → netmask, wildcard
mask, network address, broadcast address, first/last usable host, usable host
count, and total address count.

- `/31` (RFC 3021 point-to-point): 2 usable hosts, no reserved broadcast.
- `/32`: a single host (network = broadcast = host).
- `/0`: 4 294 967 294 usable hosts.

### IP Converter
Edit any representation and the rest update live:

- **IPv4:** dotted ⇄ integer ⇄ hex (`0x…`) ⇄ dotted-binary.
- **IPv6:** compressed ⇄ expanded ⇄ hex (`0x…`, 32 digits). Handles `::`
  zero-compression (RFC 5952 canonical output), embedded-IPv4 input, and
  zone-id stripping.

### Netmask ⇄ Prefix
Convert a dotted netmask to `/prefix` and back, both directions. **Rejects
non-contiguous masks** (e.g. `255.0.255.0`). Also shows the wildcard mask.

## Notes & limitations

- **No network access, ever.** No DNS, whois, ping, traceroute, or geolocation —
  every result is pure local math, so the tool works entirely from `file://`.
- **Prefix base is applied uniformly.** The Decimal (1000) / Binary (1024)
  toggle sets the base for *every* prefix power at once; it does not
  auto-switch base by unit family (bit rates decimal, byte sizes binary). Pick
  the base that matches the convention you mean — this is a deliberate
  simplicity/correctness choice.
- **IPv6 is a 128-bit value.** A **zone/scope id** (e.g. `fe80::1%eth0`) is
  **stripped**, not preserved. An **embedded IPv4** suffix (`::ffff:192.168.1.1`)
  is accepted on input but normalized to hextet output (`::ffff:c0a8:101`).
  Output is RFC 5952 canonical (lowercase, no leading zeros, leftmost-longest
  zero run compressed to a single `::`).

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from
`source/` and must never be hand-edited.

```
cd src/tools/network-toolkit
npm run build        # assemble source/ -> index.html
npm run build:check  # verify index.html matches source/ (used by pretest)
```

- `source/index.template.html` — page shell + include/inline tokens
- `source/styles.css` — tool styling
- `source/logic.mjs` — the pure, DOM-free engine (imported directly by unit tests)
- `source/app.mjs` — DOM wiring, rendering, persistence

Edit `source/`, run `npm run build`, and commit **both** the source and the
regenerated `index.html`.

### Testing

```
npm install          # tool-local (never at the repo root)
npm test             # unit (node --test) then e2e (@playwright/test)
npm run test:unit    # pure-logic unit tests only
npm run test:e2e     # browser suite only
```

<!-- readme-footer: paste at the bottom of each tool's README. Keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
