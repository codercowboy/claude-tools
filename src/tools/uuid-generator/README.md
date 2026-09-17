# UUID Generator

A single-file, dependency-free web tool for generating and inspecting
identifiers. Open `index.html` straight from `file://` — no server, no build,
nothing to install. Everything runs locally in your browser; nothing you
generate is ever sent anywhere.

## What it does

### Generate

Pick an **ID type**, set a **Count** (1–1000), and click **Generate** for a
fresh batch:

- **UUID v4** — random (RFC 4122/9562).
- **UUID v7** — time-ordered (RFC 9562): a 48-bit millisecond timestamp up
  front, so v7 IDs sort chronologically.
- **ULID** — 26-char, Crockford base32, time-sortable (48-bit timestamp + 80
  bits of randomness).
- **nanoid** — compact, URL-safe, using the official 21-char default alphabet
  (length adjustable).
- **Token** — a generic random string of your chosen **Length** and
  **Alphabet**: Hex, Base62, Base64URL, or a **Custom** character set.

Options:

- **UUID v4 / v7:** Uppercase, Hyphens on/off, and a **Wrap** style — plain,
  quoted (`"…"`), or braces (`{…}`).
- **nanoid / Token:** set the **Length**. Tokens also pick an **Alphabet** (and
  an Uppercase toggle, handy for hex).

Copy any single value with its **📋** button (it flashes ✅), or **Copy all** to
grab the whole list, one per line.

### Inspect

Paste a UUID (hyphens, `{braces}`, or a `urn:uuid:` prefix are all tolerated)
and see:

- **Validity** with a friendly reason if it's malformed.
- **Canonical form** (with a copy button).
- **Version** and **variant** (name + bit pattern).
- The embedded **timestamp** for **v1** and **v7** UUIDs (ISO + local).
- The five-field **breakdown**, and **Nil** / **Max** UUID call-outs.

## Randomness — `crypto.getRandomValues`, never `randomUUID()`

All randomness comes from **`crypto.getRandomValues`**, which works in **every**
context — opened from `file://` *or* served over plain HTTP on a LAN. This tool
deliberately never calls **`crypto.randomUUID()`**: that API is
secure-context-only, is `undefined` over plain LAN HTTP, and *throws* when
called there (a documented gotcha in this repo). If `crypto` is entirely absent
(very old/exotic environments), the tool falls back to `Math.random` and says so
in the results header — that fallback is a graceful degrade, not
cryptographically strong.

## Usage

Open `index.html` in any modern browser (or `npm run serve` to serve it over
HTTP). Your selected type, count, and options are remembered on this device (via
`localStorage`), so reopening the tool restores your setup — the **generated
values themselves are not stored** (they're throwaway; just click Generate
again). There are no destructive "Clear" actions to confirm: regenerating a
batch is one click, and the Inspect field is a single short input.

A first-load **Help** popup explains the tool; reach it again anytime via the
**?** button in the header.

## Developing (build from source)

The shipped `index.html` is **generated** — never hand-edit it. Author under
`source/` and rebuild:

```
src/tools/uuid-generator/
├── source/
│   ├── index.template.html   # page shell + Generate/Inspect markup + Help modal + build tokens
│   ├── styles.css            # tool styles (segmented controls, option groups, result list, modal)
│   ├── logic.mjs             # pure, DOM-free engine (id algorithms + inspection)
│   └── app.mjs               # DOM wiring, byte source, render, persistence, test hook
└── index.html                # GENERATED — do not edit
```

- `logic.mjs` is the pure engine (no `document`/`window`/`localStorage`, and no
  `crypto` — randomness is **injected** as bytes). The unit tests import it
  directly and the build inlines it into `app.mjs` via `<<ct:inline logic.mjs>>`.
- The build expands `<<ct:include …>>` (shared `base.css`, `footer.html`,
  `copy.js`) and `<<ct:inline …>>` (this tool's `styles.css` / `logic.mjs` /
  `app.mjs`) into the single self-contained `index.html`.

```bash
cd src/tools/uuid-generator
npm install          # tool-local; installs @playwright/test (dev-only)
npm run build        # regenerate index.html from source/
npm run build:check  # verify index.html matches source/ (fails if stale)
npm test             # unit (node --test) + e2e (@playwright/test)
```

Edit `source/`, run `npm run build`, and commit **both** the source and the
regenerated `index.html`.

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. Assembled by a dependency-free Node build (see
  "Developing"). Nothing you generate is ever sent anywhere.
- The pure generators are **deterministic given their inputs** — each takes its
  random bytes (and time, where relevant) as arguments: `uuidV4(bytes)`,
  `uuidV7(time, bytes)`, `ulid(time, bytes)`, `nanoid(size, bytes, alphabet)`,
  `randomToken(len, alphabet, bytes)`, and `inspectUuid(str)`. This is what lets
  the tests pass fixed bytes and assert exact outputs.
- **Modulo-bias note:** char mapping uses `byte % alphabet.length`, which is
  exactly uniform for power-of-two alphabets (hex = 16, base64url = 64, the
  64-char nanoid alphabet). Non-power-of-two alphabets (base62, some custom sets)
  carry a negligible bias — an accepted, documented trade for deterministic,
  testable generation in a dev utility. UUID field packing and ULID encoding are
  exact.
- For automated testing, the page exposes `window.__uuidGenerator` with the pure
  functions from `source/logic.mjs`, the alphabet/version constants, the byte
  source (`getRandomBytes`, which uses `getRandomValues`, never `randomUUID`), a
  few deterministic entry points (`setMode`, `setType`, `generateBatch`,
  `renderInspect`), and a live `state` reference. This namespace has no effect on
  normal use.

<!-- readme-footer: paste at the bottom of each tool's README. Keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
