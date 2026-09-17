# qr-generator — test record

Verified against `tools/qr-generator/index.html`. The primary, authoritative
verification is the automated `@playwright/test` suite
(`qr-generator.e2e.mjs`), run via the CLI against a `file://` URL in a real
Chromium browser (MCP browser tooling blocks `file://` in this environment,
so the CLI suite is the sole verification path here — no separate MCP
spot-check was possible or needed).

## Automated CLI run (authoritative)

From `tools/qr-generator/`:

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

**Result: 54 passed, 0 failed** (run twice in a row to rule out flakiness —
identical result both times, ~17-18s per run, single worker). Was 51/51
before this round of changes (default EC level M → H, plus PNG `tEXt` and
SVG `<metadata>` export metadata) added 3 new tests: default-EC-on-load,
PNG metadata, and SVG metadata. Was 48/48 before that, before the "Persist
UI state (localStorage)" describe block (3 new tests) was added.

## Change: default error-correction level M → H

The EC-level `<select>`'s default is now **H** (~30% recovery) — the markup
`selected` option, `encodeToMatrix`'s default parameter, and the
persistence fallback (when nothing/invalid is stored) all agree on H. A new
test (`default options › EC level defaults to H...`) asserts this on a
fresh load, independent of any user interaction. Tests that previously
asserted or depended on a default of M (the "degrades silently" persistence
test's markup-default assertion, and the PNG/SVG download filename-pattern
tests that don't explicitly select an EC level) were updated to expect H.
Tests that explicitly parametrize EC level (`'M'`, `['L','M','Q','H']`,
etc.) are unaffected — those still exercise M directly on request.

Higher EC level lowers per-version data capacity, so version
auto-selection may pick a larger version for the same input than it did at
M — this is expected and doesn't change any pass/fail outcome; the
capacity/oversized-input round-trip and error-handling tests (§7 below)
still hold at the new default.

## Change: PNG + SVG export metadata

Both downloads now carry attribution metadata (`Author` = "claude tools",
plus the GitHub repo URL), added via hand-rolled vanilla code in
`index.html` — no library, per the single-file/no-deps constraint:

- **PNG** — `injectPngTextChunks`/`addPngMetadata` parse the
  `canvas.toDataURL('image/png')` byte stream as a PNG chunk sequence and
  insert `tEXt` chunks (`Author`, `Source`, `Software`) — each with a
  correctly computed CRC-32 — immediately before `IEND`, leaving every other
  chunk (including all pixel data) byte-for-byte untouched. Wrapped in
  try/catch with a fallback to the plain PNG so a download can never break.
- **SVG** — `toSVGString` now also emits a Dublin Core `<metadata>` block
  (`<dc:creator>`/`<dc:source>`, `xmlns:dc` declared) and a leading XML
  comment, both carrying the same attribution, additive to the existing
  `<rect>`/`<path>` geometry.

New tests added:

- **`downloads › Download PNG embeds Author/Source tEXt metadata and still
  decodes`** — walks the downloaded PNG's raw chunk stream with an
  independent (test-side, not `index.html`'s) CRC-32 implementation,
  verifies every chunk's CRC (proving spec-correct framing, not just
  presence), asserts a `tEXt` chunk with `Author`="claude tools" and one
  with `Source`=the GitHub repo URL exist, and — critically — that the same
  downloaded bytes **still decode to the exact original input** via the dev
  jsQR decoder, proving the injected chunks did not corrupt the pixel data.
- **`downloads › Download SVG embeds claude tools + repo URL metadata`** —
  asserts the downloaded SVG text contains "claude tools" and the repo URL
  inside a `<metadata>` block and inside a leading XML comment, that
  `xmlns:dc` is declared, and that the document is still well-formed
  (`<svg …>` root, ends with `</svg>`).
- The existing SVG dark-module-count test (`M\d` path-command count vs. the
  matrix's dark-module count) continues to pass unchanged with the new
  metadata markup present — confirms the added text doesn't accidentally
  introduce stray `M<digit>` sequences that would skew that count.

## Change: shared controls.css (in-field copy + standard control height)

The tool now opts into the shared `controls.css` include
(`<<ct:include controls.css>>`, after `base.css` and before the tool's own
color rules — see `docs/conventions.md` § "Standard control height & in-field
copy"):

- **In-field copy on the editable text/URL input.** The `<textarea>` is now
  wrapped in `.ct-field.ct-field--multiline` with a `.ct-copy-btn` copy button
  pinned to its top-right (multiline variant). The QR output is an image, so
  the input is the tool's one copyable text value. Wired to the shared
  `ctCopy`/`ctFlash` helpers (`copy.js`, now included in its own `<script>`).
  Per convention for an **editable** field, the button is revealed **only when
  the field is non-empty** — the app toggles the button's `hidden` on `input`
  (and re-syncs after `applyStoredState()`, which sets `.value` directly with
  no `input` event). It carries `title` + `aria-label` + a `qr-input-copy`
  `data-testid`.
- **Standard control height (`--control-h: 44px`).** Per-tool `min-height:
  44px` rules on the single-line inputs and buttons were removed; the shared
  `--control-h` now governs the EC-level `<select>`, the number inputs, and the
  buttons uniformly. The multiline `<textarea>` (excluded from `--control-h`)
  keeps its own taller intrinsic height, and the `color` inputs keep their own
  `44px`.
- **Copy-button styling guards.** The generic `button:hover` accent-brightness
  rule now excludes `.ct-copy-btn` (`:not(.ct-copy-btn)`) so the icon button
  keeps its own subtle opacity/background hover from `controls.css` instead of
  the accent wash. The `textarea`'s `padding-right` is re-declared as a longhand
  after the tool's `padding` shorthand so the first line of text never runs
  under the icon (the shorthand trap from `docs/conventions.md`).

New tests added:

- **`in-field copy on the text/URL input`** (5 tests) — the button lives inside
  a `.ct-field` (multiline variant), carries `.ct-copy-btn` + `title`/`aria-label`;
  is hidden while empty, revealed when non-empty, hidden again when cleared
  (whitespace-only counts as empty); stays visible after a reload that restores
  a non-empty input; clicking copies the exact input text to the clipboard
  (captured via a `writeText` override) and flashes ✅ then reverts to 📋; and
  its computed background stays transparent (excluded from the accent hover).
- **`standard control height (controls.css --control-h)`** (3 tests) —
  `--control-h` resolves to `44px`; the select, number inputs, and download
  buttons are each exactly `44px` tall; the multiline textarea is taller.
- `qr-input-copy` added to the `data-testid` presence check.

A build bug was caught and fixed during this change: `<<ct:include copy.js>>`
must be wrapped in an explicit `<script>…</script>` in the template (the build
does a plain text substitution and does not auto-wrap). Left unwrapped, the
`copy.js` banner comment — which contains the literal text "`<script>`" — was
parsed by the browser as a real start tag, swallowing the rest of the document
(including the `app.mjs` module), so `window.__qr` and the whole app failed to
initialize. Wrapping the include fixes it.

## Round-trip decode outcome (the correctness gate)

**PASS across the full tested matrix — every realistic input decoded
correctly, with no jsQR decoder limitations encountered at all.**

The hand-rolled encoder's output was rendered to a real `<canvas>` through
the actual UI, extracted as a genuine PNG (`canvas.toDataURL('image/png')`
→ real PNG-decoded via `pngjs`), and decoded with an independent decoder
(`jsQR`). Every one of the following round-tripped back to the exact
original input string:

| Input | EC levels tested | Result |
|---|---|---|
| Short string (`"HELLO WORLD"`, 11 bytes) | L, M, Q, H | PASS (all 4) |
| URL (`https://github.com/codercowboy/claude-tools/tools/qr-generator`, 64 bytes) | L, M, Q, H | PASS (all 4) |
| Unicode/emoji (`"Héllo Wörld — 世界 🎉🚀 café ☕ naïve résumé"`, multi-byte UTF-8 + astral-plane emoji) | M, Q | PASS (both) |
| Medium/long text (~445-byte lorem-ipsum paragraph) | M, H | PASS (both) |
| Exact V1-L capacity boundary (17 bytes, fills version 1 exactly) | L | PASS |
| Exact V40-H capacity boundary (1273 bytes, fills version 40 exactly) | H | PASS |
| Mobile-viewport repeat (URL-shaped string) | M | PASS |

**No `[jsQR limitation]` annotations were logged in either run** — not even
for the two exact-capacity boundary cases (V1-L and V40-H), which are
exactly the input shape most likely to trigger a decoder-side edge case like
the documented v23-L limitation. Both decoded cleanly via jsQR without
needing to fall back to the reference-encoder cross-check. The fallback/
cross-check logic (generate an independent reference QR for the same
text/version/EC via the npm `qrcode` package, byte mode forced, and decode
it with the same jsQR decoder to distinguish "jsQR limitation" from "real
encoder bug") is implemented and exercised by the test harness on every
round trip, it simply never needed to trigger — our decode succeeded
directly every time.

Each round trip additionally asserted **version auto-selection is sane**:
the rendered `version` matched what `window.__qr.selectVersion()`
independently computes for the exact same byte length/EC level, and
`size === 17 + 4*version` held in every case.

## Results by item

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | `encodeToMatrix` shape (`{version, mask, size, modules}`, `size = 17+4*version`) | PASS | |
| 2 | Known byte-mode capacity boundaries (V1-L=17, V1-M=14, V40-H=1273, V40-L=2953 — published ISO/IEC 18004 values, independent of this tool's own tables) | PASS | Exact version-boundary transitions (n vs n+1 byte) all matched. |
| 3 | Capacity-overflow past V40 throws a clear `Error`, not a crash | PASS | Tested 1 byte over V40-H max, 1 byte over V40-L max, and a grossly oversized input (5000 chars); all threw with a non-empty, descriptive message. |
| 4 | Empty input throws a clear error | PASS | |
| 5 | Invalid EC level throws a clear error | PASS | |
| 6 | **Round-trip decode (authoritative gate)** | PASS | See table above — 15 round-trip tests, all passed, zero jsQR-limitation fallbacks triggered. |
| 7 | Canvas renders non-blank (dark + light pixels present) | PASS | |
| 8 | PNG download: real PNG magic bytes, non-trivial size, and the downloaded file itself decodes back to the input text | PASS | |
| 9 | SVG download: valid markup, dark-module (`M` path command) count matches the matrix exactly | PASS | |
| 10 | Downloads disabled with no input, enabled once a valid render exists | PASS | |
| 11 | Live re-render (debounced): scale, quiet zone, EC level, fg/bg colors | PASS | Scale/quiet-zone changes verified via canvas pixel-dimension change; color changes verified by sampling the actual rendered pixel color at the quiet-zone corner. |
| 12 | Low-contrast fg/bg warning fires and clears correctly | PASS | |
| 13 | Empty input: canvas hidden, downloads disabled, hint shown, no error | PASS | |
| 14 | Typing then clearing returns cleanly to the empty state | PASS | |
| 15 | Oversized input: clear inline error, canvas stays hidden, downloads stay disabled (no broken render) | PASS | |
| 16 | Recovering from an oversized-input error by shortening the input re-renders normally | PASS | |
| 17 | All `data-testid` hooks present exactly once | PASS | All 16 testids from DESIGN.md/PLAN.md verified. |
| 18 | `window.__qr` API shape matches PLAN.md §11.2 exactly | PASS | Every documented member present with the correct type; `MASK_FNS` has exactly 8 entries. |
| 19 | `currentMatrix` is `null` with no input, populated after a render | PASS | |
| 20 | No `crypto.randomUUID` usage in `index.html` source | PASS | Static grep against the raw source. |
| 21 | Footer hash sentinel present and intact (`a97df085179a11175786e1d57d6c2a99`) | PASS | |
| 22 | Renders correctly with `crypto.randomUUID` simulated unavailable (non-secure-context regression guard) | PASS | Belt-and-braces — the tool never calls this API to begin with (confirmed by item 20), so this is a guard against a future regression, not an active bug catch. |
| 23 | Mobile (375×667, dpr2, touch): no horizontal overflow, canvas fits viewport width, ~44px tap targets, real `.tap()` interactions (EC level change + PNG download), round-trip decode holds at mobile viewport | PASS | All 5 sub-checks passed. |
| 24 | Mobile (360×640): no horizontal overflow, options grid stacks to a single column | PASS | |
| 25 | **Persist UI state (localStorage)**: setting input + changing EC level/scale/quiet-zone/fg/bg writes the versioned `qr-generator:v1` key with the exact values | PASS | Verified the raw stored JSON blob's fields match the live form state. |
| 26 | Persistence: reloading restores input + all options into the DOM, and the QR **re-renders from the restored input+options** (never itself persisted) — restored `currentMatrix` matches the pre-reload matrix exactly, and independently re-running `encodeToMatrix()` on the restored input/EC also matches | PASS | Confirms restore round-trips through the real encoder, not just that DOM values look right. |
| 27 | Persistence degrades silently when `localStorage` throws on every call (`getItem`/`setItem`/`removeItem`/`clear` all throw, simulated via `addInitScript` overriding the `window.localStorage` accessor) — tool loads with markup defaults, no crash/`pageerror`, and still works fully in-memory (typing, EC/scale/quiet-zone changes, render) | PASS | No `pageerror` events observed; defaults (`M`, scale `8`, quiet zone `4`, `#000000`/`#ffffff`, empty input) held. |

## Bugs found

**None.** No real encoder bugs were found, and no jsQR decoder limitations
were encountered either (the suite's fallback/cross-check logic for
triaging a decode failure against an independent `qrcode`-package reference
is implemented and ready, but was never actually needed — see "Round-trip
decode outcome" above). Every assertion matched the behavior specified in
`DESIGN.md`/`PLAN.md` and the actual `index.html` implementation. No console
errors observed during any run.

## `preview.png`

Generated via a standalone Playwright script (same Chromium install as the
CLI suite): loads the tool, enters a real URL
(`https://github.com/codercowboy/claude-tools`) at EC level M, waits for a
real render, then shrinks the whole page to fit a 1200×630 crop via
`document.body.style.zoom` (a real re-layout at reduced scale, not a
post-hoc image resize) and screenshots the clean, rendered state — header,
input, options, the actual rendered QR code, download buttons, and the
footer all visible. Saved to `tools/qr-generator/preview.png`, confirmed
1200×630 PNG.

## Cleanup

Root-level `node_modules/`, `package-lock.json`, and this tool's
`test-results/`/`.playwright-mcp/` install/output artifacts were removed
after the run — the repo is left source-only (plus the delivered
`preview.png` and `tests/` files), per `docs/conventions.md` "Build
pipeline" cleanup step.
