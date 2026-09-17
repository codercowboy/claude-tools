# qr-generator — Design

Author: Claude. Design lead: Jason. Source-of-truth spec.

## Summary

A single, self-contained `index.html` (vanilla, no build/deps/CDN) that generates
a **QR code** from text/URL input, rendered to canvas with PNG + SVG download.
The QR encoder is **hand-rolled in vanilla JS** (no library — that's the
interesting/constraint-driven part). v1 is **generation only** (no scanning).

## Hard constraints

- One self-contained `index.html`; vanilla only. **No QR library, no CDN** — the
  encoder is implemented from scratch.
- No secure-context-only APIs. Responsive/mobile; icon tooltips; footer + OG +
  `preview.png`; per `docs/conventions.md`. All local, no network.

## The encoder (hand-rolled — the crux)

Implement **byte mode (UTF-8)** QR encoding per the spec, general enough to be
correct:

- **Versions 1–40**, **error-correction levels L / M / Q / H**.
- Steps: UTF-8 encode input → byte-mode segment (mode indicator + char-count
  indicator sized per version) → pad to capacity (terminator + pad bytes
  0xEC/0x11) → split into ECC blocks → **Reed-Solomon** error-correction
  codewords (GF(256), generator polynomials) → interleave data + ECC codewords →
  place into the module matrix.
- **Matrix**: finder patterns (+ separators), timing patterns, alignment
  patterns (per version), dark module, reserve + write **format info** (BCH,
  EC level + mask) and **version info** (v≥7, BCH), then data bits in the
  zig-zag order skipping function modules.
- **Masking**: apply each of the 8 mask patterns to data modules, score by the
  4 penalty rules, pick the lowest-penalty mask.
- **Auto-version**: pick the **smallest version** whose capacity (for the chosen
  EC level, byte mode) fits the input; error clearly if it exceeds v40 capacity.
- Keep the matrix builder a **pure function**: `encodeToMatrix(text, ecLevel)` →
  `{ version, mask, size, modules: boolean[][] }` (true = dark). This is the
  primary correctness surface.

## Layout

1. **Header** — title + one-line description.
2. **Input** — a **textarea** (text or URL) with a length/capacity hint.
3. **Options** — **EC level** `<select>` (L/M/Q/H, default **H**, ~30%
   recovery — the markup `selected` option, `encodeToMatrix`'s default
   parameter, and the persistence fallback all agree on H); **module
   scale** (px per module) and/or output size; **quiet zone** (default 4
   modules); optional **foreground/background colors** (default black on white —
   keep good contrast for scannability; warn on low contrast). Note: a higher
   EC level lowers per-version data capacity, so version auto-selection may
   pick a larger version for the same input than at a lower EC level — this
   is expected; the capacity/oversized-input handling (§5 below) still holds.
4. **Output** — the QR rendered to a `<canvas>` (crisp: integer module scaling,
   `imageSmoothingEnabled=false`, include the quiet zone), a small caption
   (version + EC level), and **Download PNG** (`canvas.toDataURL`, with
   embedded metadata — see below) + **Download SVG** (vector — crisp at any
   size, with embedded metadata) buttons (+ tooltips). Live-updates as the
   input/options change (debounced).
5. Capacity-exceeded / empty input → a clear inline message (no broken render).

### Export metadata

Both download formats carry attribution metadata (author + this repo's URL),
added purely as extra, non-visual data — the rendered QR pixels/geometry are
byte-identical to a plain export, so decodability is unaffected:

- **PNG** — a hand-rolled `tEXt`-chunk injector (vanilla, no library):
  `canvas.toDataURL('image/png')` bytes are parsed as a PNG chunk stream
  (8-byte signature + `length/type/data/CRC-32` chunks), and `tEXt` chunks
  (`Author` = "claude tools", `Source` = the GitHub repo URL, `Software` =
  "claude-tools qr-generator", each with a correctly computed CRC-32) are
  inserted immediately before `IEND`. Every other chunk, including all pixel
  data (`IDAT`), is copied through untouched. If injection fails for any
  reason, the download falls back to the plain, unmodified PNG (never breaks
  the download).
- **SVG** — a Dublin Core `<metadata>` block (`<dc:creator>`/`<dc:source>`,
  `xmlns:dc` declared on the root `<svg>`) plus a leading XML comment, both
  carrying the same author + repo URL. Purely additive markup around the
  existing `<rect>`/`<path>` geometry — the SVG stays valid and crisp/
  scannable.

## Accessibility & UX

- Real controls with labels; `aria-label`+`title` on icon/download buttons;
  visible focus. Canvas has an `aria-label`/alt describing it ("QR code for: …").
- Responsive: canvas scales down to fit narrow screens without overflow; controls
  stack on mobile. Reduced-motion: no essential animation (live re-render is fine;
  no decorative motion).

## Testability

- `data-testid` on: input textarea, EC-level select, scale/quiet-zone/color
  controls, the canvas, PNG + SVG download buttons, the version/EC caption, error
  message.
- `window.__qr`: the pure `encodeToMatrix(text, ecLevel)` and helpers
  (`utf8Bytes`, RS/GF helpers if useful) so tests can assert the module matrix.
- Tests (primary correctness):
  - **Round-trip decode**: render/serialize the matrix and decode it with a
    **dev-only** QR decoder (a devDependency used ONLY in tests — the shipped tool
    stays dependency-free) to assert it decodes back to the input, across EC
    levels and a range of input sizes (incl. a URL and Unicode).
  - **Known vectors**: assert `encodeToMatrix` picks the expected version/size for
    representative inputs; assert capacity-overflow errors past v40.
  - Canvas renders (non-blank) for valid input; SVG/PNG download data is produced;
    empty/oversized input handled; mobile coverage.

## Deliverables

- `tools/qr-generator/index.html`, `README.md`, `tests/` (@playwright/test +
  mobile; round-trip decode using a dev-only decoder).

## Persistence

Per `docs/conventions.md` ("Persist UI state (localStorage)"), the tool restores
where the user left off:

- **Persisted** (versioned key `qr-generator:v1`): the input textarea text, EC
  level, module scale, quiet zone, and foreground/background colors.
- **Not persisted** (derived): the rendered QR canvas/matrix — it is always
  recomputed from the restored input + options on load, never stored itself.
- **Save on change** (every `input` event on the six fields above); **restore
  on load**, before the initial render.
- **Best-effort + safe**: every `localStorage` read/write is wrapped in
  `try/catch` and degrades silently — the tool works fully with no stored
  state (unavailable/throwing `localStorage`, `file://`, private mode, quota).

## Out of scope (v1)

- **Scanning/decoding** from an image/camera, other encodation modes
  (numeric/alphanumeric/kanji optimization — byte mode covers everything),
  logos/branding overlays, batch generation, ECI. Keep it a clean generator.
