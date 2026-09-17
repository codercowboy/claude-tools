# qr-generator tests

Automated end-to-end tests for `tools/qr-generator/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test`, `jsqr`, `pngjs`, and `qrcode` are `devDependencies` of
`tools/qr-generator/package.json`; none of them are ever referenced by
`index.html`, which remains a single, dependency-free file with a hand-rolled
QR encoder and no QR library of its own. The spec drives the finished page
from the outside, through its `data-testid` hooks and the `window.__qr` test
API (see `../DESIGN.md` "Testability" and `../PLAN.md` §11).

## Running the tests

From `tools/qr-generator/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/qr-generator/` (or from the repo root) hoists `node_modules` to the
repo root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would.

## The authoritative correctness gate: round-trip decode

The tool's QR encoder is hand-rolled from scratch (no library — see
`../DESIGN.md`). The only test that actually proves the encoder is *correct*
is a **round-trip decode**: render a QR with the real UI, extract the
rendered `<canvas>` as a genuine PNG file (`canvas.toDataURL('image/png')`,
then real PNG-decoded via `pngjs`), and decode those pixels with an
**independent** decoder, [`jsQR`](https://www.npmjs.com/package/jsqr),
asserting the decoded text equals the original input exactly. This is what
`roundTrip()` in `qr-generator.e2e.mjs` does, and it's exercised across:

- **All 4 EC levels (L/M/Q/H)** with a short string and a URL (the realistic,
  common cases).
- **Unicode/emoji** input at EC M and Q (multi-byte UTF-8 + astral-plane
  emoji surrogate pairs, byte-mode stress).
- **Medium/long text** (~445-byte lorem-ipsum paragraph) at EC M and H,
  landing on mid-size versions.
- **Exact byte-mode capacity boundaries** — a 17-byte string at EC L (fills
  version 1 exactly) and a 1273-byte string at EC H (fills version 40
  exactly) — the input shape most likely to stress padding/placement edge
  cases.
- A repeat of one round-trip at a mobile viewport, to confirm the decode
  holds regardless of viewport/CSS scaling of the canvas.

Each round trip also asserts **version auto-selection is sane**: the
rendered version matches what `window.__qr.selectVersion()` independently
computes for that exact byte length/EC level, and `size === 17 + 4*version`.

### Handling jsQR's own decoder limitations

jsQR (like other real-world scanners) is known to fail to decode certain
*reference-correct* QR codes at specific exact-capacity `(version, EC level)`
combinations — e.g. version 23-L — regardless of which encoder produced
them. So whenever our own decode fails, `roundTrip()` doesn't immediately
fail the test: it generates an **independent reference QR** for the exact
same text, forced to the same version and EC level, using the npm `qrcode`
package (byte mode forced, to match this tool's byte-mode-only encoder), and
decodes *that* through the same jsQR decoder.

- If the reference **also** fails to decode → this is a **documented jsQR
  decoder limitation**, not an encoder bug. The test does not fail; a
  `jsQR-decoder-limitation` annotation is attached to the test result and a
  `[jsQR limitation]` line is printed to the console so it's visible in the
  run output.
- If the reference decodes fine but ours doesn't → this is a **real encoder
  bug**, and the test fails with a detailed message (input length, version,
  EC level, mask, our raw decode result) for a fixer to act on.

The realistic-input tests (short string, URL, Unicode, medium text) assert
`limitation === false` — they're deliberately sized to land on
well-supported versions, so hitting jsQR's own limitation there would be
worth investigating either way. The two exact-capacity-boundary tests
tolerate a documented limitation without failing, since that's exactly the
input shape most likely to trigger one.

## What else is covered

`qr-generator.e2e.mjs`:

1. **`encodeToMatrix` shape & known vectors** — `{version, mask, size,
   modules}` shape, `size === 17 + 4*version`, published ISO/IEC 18004
   byte-mode capacity boundaries (V1-L=17 bytes, V1-M=14 bytes, V40-H max
   1273 bytes, V40-L max 2953 bytes — independent, well-known spec values),
   capacity-overflow past V40 throws a clear `Error` (not a crash), empty
   input throws, invalid EC level throws.
2. **Round-trip decode** — see above.
3. **Canvas rendering** — non-blank (both dark and light pixels present) for
   valid input.
4. **Downloads** — PNG download has real PNG magic bytes and decodes back to
   the input text; SVG download is valid markup whose `M` path-command count
   matches the matrix's dark-module count; both buttons start disabled and
   enable once a valid render exists.
5. **Live re-render (debounced)** — changing scale/quiet-zone changes canvas
   pixel dimensions; changing EC level updates the caption; changing fg/bg
   colors changes the rendered pixel colors.
6. **Low-contrast warning** — default black/white shows no warning; a close
   fg/bg pair triggers it; reverting clears it.
7. **Empty/oversized input** — empty textarea disables downloads and shows
   the placeholder hint with no error; oversized input (exceeds V40-H
   capacity) shows a clear inline error with downloads disabled and no
   broken render; shortening the input recovers cleanly.
8. **`data-testid` hooks** — every testid from `DESIGN.md`/`PLAN.md` present
   exactly once.
9. **`window.__qr` API shape** — every documented member present with the
   right type; `currentMatrix` is `null` until a successful render.
10. **Conventions compliance** — `index.html` source never references
    `crypto.randomUUID` (secure-context-only API, forbidden per
    `docs/conventions.md`); the pasted README/HTML footer's hash sentinel
    (`a97df085179a11175786e1d57d6c2a99`) is present and intact; the tool
    still renders correctly with `crypto.randomUUID` simulated unavailable
    (`Object.defineProperty(crypto, 'randomUUID', { value: undefined })` —
    `delete` is a documented Chromium no-op, per `docs/conventions.md`).
11. **Mobile (375x667 & 360x640, `deviceScaleFactor: 2`, touch)** — no
    horizontal page overflow; the canvas fits within the viewport width;
    controls/download buttons keep ~44px tap targets; real `.tap()`
    interactions (EC level change + PNG download) work end to end; the
    round-trip decode holds at a mobile viewport too; the options grid
    stacks to a single column at 360px.

See `TESTS.md` for the run record and findings.
