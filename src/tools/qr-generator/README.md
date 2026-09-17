# qr-generator

Generate a QR code from text or a URL, entirely in your browser. Open
`index.html` directly (works from `file://`, no server needed) — no build
step, no network requests, no third-party QR library. The encoder (byte
mode, ISO/IEC 18004, versions 1–40, EC levels L/M/Q/H) is hand-rolled from
scratch in vanilla JavaScript: UTF-8 segment encoding, Reed-Solomon error
correction over GF(256), the full module matrix (finder/timing/alignment
patterns, format/version info via BCH codes), and masking.

## Usage

1. Open `index.html` in a browser.
2. Paste or type text (or a URL) into the **Content** box. The QR code
   renders live as you type.
3. Adjust options as needed:
   - **Error correction level** — L/M/Q/H, trading data capacity for
     resilience to damage/obstruction (default **M**, ~15% recovery).
   - **Module scale** — pixels per module in the rendered/downloaded PNG.
   - **Quiet zone** — blank border width, in modules (default 4, the spec
     recommendation — don't shrink this if the code needs to scan reliably).
   - **Foreground / background color** — a contrast warning appears if the
     pair is too close to reliably scan.
4. Click **Download PNG** or **Download SVG** to save the result.

If the input is too long to fit even at version 40 (the largest QR size) for
the selected EC level, a clear inline error explains why — try a lower EC
level or shorter input.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. This tool is
authored under `source/` and assembled back into that one file:

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free QR encoder (the hand-rolled
  Reed-Solomon/matrix/masking logic). Keeps the `PURE-LOGIC` sentinels so
  unit tests still work.
- `source/app.mjs` — the DOM wiring.

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

## Notes

- **Generation only** — this tool does not scan/decode QR codes.
- The encoder is a pure function, `encodeToMatrix(text, ecLevel)`, exposed
  (along with its internals) on `window.__qr` for testing; it's inert for
  normal use. See `DESIGN.md` and `PLAN.md` in this folder for the full
  algorithm write-up if you're curious how the encoder works under the hood.

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
