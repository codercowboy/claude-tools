# base64-tool — test record

Verified against `tools/base64-tool/index.html`. The primary, authoritative
verification is the automated `@playwright/test` suite
(`base64-tool.e2e.mjs`), run via the CLI against a `file://` URL (the browser
MCP is network-isolated / blocks `file://` in this environment, per
`docs/conventions.md`'s Playwright-CLI fallback).

## Automated CLI run (authoritative)

From `tools/base64-tool/`:

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

**Original result: 43 passed, 5 failed** (48 total, ~43s, single worker,
Chromium). The 5 failures were **real product bugs** in `index.html` (not
test defects — see "Bugs found" below); the tester did not edit
`index.html` to work around them, per the tester's mandate.

**Fixed 2026-08-30 (fixer pass):** both root causes below were corrected in
`index.html`'s `<style>` block only (no markup/JS changes, no test changes):
`[hidden] { display: none !important; }` added once near the top of the
stylesheet (fixes Bug #1/#2 — the mode toggle, the empty file-info row, and
`decode-text-col` now actually hide), and `.output-field button` added to
the mobile `@media (max-width: 640px)` 44px `min-height` rule (fixes Bug #3).

**Result after fix: 48 passed, 0 failed** (48 total, ~21s, single worker,
Chromium). Re-running the same CLI command reproduces the pass. Every
assertion — all pure functions, all encode/decode UI behavior, all
file-encode/download paths, the large-input guards, the
testid/API-shape/footer/no-`randomUUID` checks, and all 8 mobile checks —
now passes cleanly.

**Fixer pass 2026-08-30 (localStorage persistence):** added
`docs/conventions.md` § "Persist UI state (localStorage)" support —
versioned key `base64-tool:v1`, persisting only the **mode** and the two raw
**text inputs** (`encode-text-input`, `decode-input`). Uploaded file bytes
are never persisted; the four encode outputs and the decoded output are
DERIVED and are recomputed on restore, never read back from storage. A new
`localStorage persistence` `describe` block (3 tests) covers: writing the
versioned key on mode toggle + debounced text-input changes and correctly
re-deriving both tabs' outputs after a reload; the Clear buttons persisting
the emptied text (and an emptied tool restoring empty); and full graceful
degradation (`Storage.prototype.setItem`/`getItem` overridden to throw via
`addInitScript`) — no crash, starts empty/encode-mode, and normal
interaction (typing, mode switch, Clear) still works with the localStorage
error swallowed every time.

**Result after the persistence addition: 51 passed, 0 failed** (51 total,
~24s, single worker, Chromium). Footer sentinel hash unchanged
(`a97df085179a11175786e1d57d6c2a99`); no markup was touched, only the
`<script type="module">` body (persistence functions + init) and the pasted
footer's surrounding content were left untouched.

## Results by item

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Pure functions via `window.__base64Tool` | PASS | `encodeText`/`decodeText` round-trip emoji/accents/CJK/mixed/empty-string exactly. `bytesToBase64`/`base64ToBytes` round-trip the full 0–255 byte range; `base64ToBytes` throws on garbage. `toBase64Url`/`fromBase64Url`: verified against a byte sequence (`[0..255]`) that **deterministically** (confirmed via a plain Node `Buffer.toString('base64')` check before writing the test) contains both `+` and `/`; the URL-safe form has neither, nor `=`, and `fromBase64Url` restores the exact original padded string. `parseDataUri('data:image/png;base64,iVBORw0KGgo=')` → `{mime:'image/png', isBase64:true, payload:'iVBORw0KGgo='}` exactly (note: the field is `payload`, not `data` — matches the actual implementation in `index.html`/`PLAN.md` §3, not the shorthand in the tester brief). Non-URI → `null`. `data:text/plain,hello` (no `;base64`) → `isBase64:false`, and `decodeInput()` on it throws a message matching `/base64/i`. `decodeInput`/`normalizeBase64` tolerate embedded whitespace/newlines and URL-safe input with no padding; reject a mixed standard+URL-safe alphabet (`/mixed/i`); every invalid case tried (garbage, empty, whitespace-only, a single truncated char) throws a non-empty `Error`. |
| 2 | Encode UI: live outputs + copy buttons | PASS | Typing live-updates all four outputs to the exact expected values (verified byte-for-byte against the pure functions), including after further edits and a custom MIME type; empty input leaves everything blank. All five copy buttons (4 encode + decode-text) flip 📋→✅ on click and revert after ~1s; the field value copied was independently confirmed correct before clicking. Clipboard read-back was attempted best-effort and was not the blocking assertion (per convention). |
| 3 | File encode via `setInputFiles` | PASS | A small 1×1 PNG (`{name, mimeType, buffer}` in-memory payload) round-trips byte-exact through the Base64 output (`Buffer.from(b64,'base64').equals(originalBuffer)`); `data:` URI carries the file's MIME + same payload; file-info shows filename ("tiny.png") and MIME ("image/png"). A UTF-8 text file with unicode content also round-trips exactly. File wins over typed text (the encoded output changes and matches the file's bytes, not the textarea's), and removing the file restores the exact prior text-based output and re-enables the MIME field — **functionally correct**, but see Bug #1 below: the file-info *row* itself does not visually disappear on removal (or ever, even with no file selected) due to a separate CSS bug. |
| 4 | Decode: text output, binary, invalid input, Download | PASS (functional); 2 sub-cases surfaced Bug #2 (visual only) | A known bare Base64 string and a known `data:` URI decode to the exact expected text, with the correct detected MIME. Binary (PNG) decode data correctly leaves `decode-text-output` unset and enables Download — but see Bug #2: `decode-text-col` does not actually hide itself (stays visually present alongside the binary note) because of the same CSS/`hidden`-attribute conflict as Bug #1. Download as file: both a `.txt` decode (content diffed exactly after `download.saveAs()`) and a `.png` decode (byte-exact diff) trigger a real `download` event with the correct `suggestedFilename()` (`decoded.txt` / `decoded.png`) and correct bytes; Download stays disabled until a decode succeeds. Invalid input (garbage, and a length-unrecoverable URL-safe string) shows a non-empty `decode-error`, keeps Download disabled, produces no `pageerror`, and the tool recovers cleanly on the next valid input. |
| 5 | Large-input guard | PASS | A synthetic 3MB `File` (assigned directly to `state.encode.sourceFile`, then `renderEncodeOutputs()` called — the tester brief's explicitly sanctioned "assert the threshold logic via the hook" path) encodes successfully and shows `encode-warning` with non-empty text. An 11MB synthetic `File` is rejected with an `encode-error` matching `/too large/i` and empty outputs — confirmed no `pageerror` and the page still responsive to a normal text encode immediately after. A 14,000,004-char Base64 string (just over `MAX_DECODE_B64_CHARS`, chosen as a multiple of 4 so it clears the charset/padding checks before hitting the size check) thrown from `decodeInput` directly matches `/too large/i` and `/limit/i`, again with no crash and a normal decode working right after. |
| 6 | `data-testid` hooks, `window.__base64Tool` shape, no `randomUUID`, footer hash | PASS | All 34 documented `data-testid`s (`PLAN.md` §13) present exactly once. `window.__base64Tool` exposes exactly the 14 documented keys with the correct types (13 functions + `state` as an object); `state` confirmed live (reflects `setMode` changes). Source grep confirms `crypto.randomUUID` never appears in `index.html` (this tool needs no random IDs — a standing regression guard, not a non-secure-context simulation, since there's no such call to shadow). Footer sentinel hash present and equal to `a97df085179a11175786e1d57d6c2a99`; independently recomputed md5 of the content between the sentinels matches the declared hash exactly (also independently verified via a one-off `node -e` before writing the test — see below). |
| 7 | Mobile (375×667/360px, dpr2, touch) | PASS (7/8 real checks); 1 sub-case surfaced Bug #3 | Real taps drove: mode switching with correct `aria-pressed` + `decode-section` becoming visible (**but see Bug #1**: `encode-section` itself does not visually hide when switched away from — functional state/`aria-pressed` is correct, the visual is not); typing + live Base64 output; a copy button's ✅ feedback. No horizontal overflow at 375px (outputs populated) or ~360px (decode section, populated). `elementFromPoint` hit-test guard (after `scrollIntoViewIfNeeded()`) confirms nothing overlays `mode-encode-btn` or a copy button. Tap-target check (`expect.soft`, so all four controls were measured): `mode-encode-btn`/`mode-decode-btn`/`encode-dropzone` all met the ~44px minimum; `encode-base64-copy-btn` measured **34px**, short of the ~44px target — see Bug #3. |

## Bugs found (for the fixer — `index.html` not edited by the tester)

All three bugs below share one root cause pattern (CSS `display` set
unconditionally on a class/element selector, overriding the `hidden`
attribute's UA-stylesheet `display: none`) plus one unrelated mobile-CSS
gap. None were worked around in the test suite — the tests assert the
behavior `DESIGN.md`/`PLAN.md` actually call for, and are left failing
(reproducibly, deterministically) as the regression signal.

### Bug #1 (MAJOR) — `hidden` attribute has no visual effect on `<section>` / `.file-info` / `.output-field` elements — **FIXED 2026-08-30**

- **Where:** CSS rules `section { display: flex; ... }` (line ~184),
  `.file-info { display: flex; ... }` (line ~224), and
  `.output-field { display: grid; ... }` (line ~288) in `index.html`'s
  `<style>` block each set `display` unconditionally on the selector, with
  no `:not([hidden])` guard and no `[hidden] { display: none !important }`
  override anywhere in the stylesheet. Per the CSS cascade, a normal
  (non-`!important`) **author** declaration always wins over the browser's
  **user-agent** stylesheet declaration for `[hidden] { display: none }`,
  regardless of selector specificity — so once any of these elements gets
  `hidden` set to `true` via JS (or carries the `hidden` attribute
  statically in markup), it stays fully laid out and visible.
- **Confirmed via direct `getComputedStyle` probe** (not just the failing
  Playwright assertions): after `window.__base64Tool.setMode('decode')`,
  `encode-section` has `hasAttribute('hidden') === true` **and**
  `getComputedStyle(...).display === 'flex'` (and `offsetParent !== null`,
  i.e. actually rendered/visible) — expected `display: none`.
- **Affected elements / triggers:**
  - `encode-section` / `decode-section` — the mode toggle (`setMode`)
    intends to hide the inactive section, but it never visually
    disappears; both sections render stacked on top of each other at
    once. This is the most severe instance: **encode and decode content
    are both visible simultaneously after switching modes**, contradicting
    `DESIGN.md` § Layout ("Mode — Encode / Decode... a segmented toggle or
    tabs") and the whole point of a mode toggle.
  - `encode-file-info` (`.file-info`) — visible **from initial page load**
    (it carries `hidden` in the static markup with no file selected),
    rendering an empty row (blank name/size/mime with just the "✕ Remove
    file" button) before any file is ever chosen, and it never disappears
    after `encode-remove-file-btn` is clicked either.
  - `decode-text-col` (`.output-field`) — stays visible (empty) alongside
    `decode-binary-note` when the decoded payload is binary, instead of
    being hidden per `DESIGN.md` § Decode mode ("Show the decoded text...
    when it's valid UTF-8 text").
- **Expected vs actual:** Expected — element with `hidden = true` renders
  with `display: none` (invisible, no layout box). Actual — element stays
  rendered with its class's explicit `display` value; only elements whose
  hidden-toggle target has *no* explicit `display` in CSS (e.g.
  `encode-error`/`decode-error`/`encode-warning`/`decode-detected-mime`/
  `decode-binary-note`, which only set margin/padding/border/color) hide
  correctly — those all passed.
- **Reproduction (functions/testids involved):** `setMode()` /
  `mode-encode-btn` / `mode-decode-btn` / `encode-section` /
  `decode-section`; `updateFileInfo()` / `encode-file-info` /
  `encode-remove-file-btn`; `renderDecodeOutput()` / `decode-text-col`.
- **Suggested direction (not applied — tester does not edit `index.html`):**
  add a stylesheet-level override such as `[hidden] { display: none !important; }`
  once, near the top of the `<style>` block, so it beats every later
  unconditional `display` rule regardless of order; or scope each
  conflicting rule with `:not([hidden])`.
- **Severity: MAJOR.** The mode toggle — this tool's primary navigation —
  does not actually switch views visually; a user sees both Encode and
  Decode content stacked together after clicking "Decode". This is very
  likely to be immediately visible/confusing to any real user and should
  be fixed before this tool is considered done.
- **Covered by tests:** `tests/base64-tool.e2e.mjs` — `file encode › file
  wins over typed text; removing the file restores the text-based output`
  (line ~360); `decode: text output › binary (non-UTF8) decoded data shows
  the binary note, not the text output` (line ~428); `decode: invalid input
  handling › garbage input shows an inline error...` (line ~492, the
  `decode-text-col` hidden-check specifically); `mobile viewport... › real
  tap: switch to Decode and back updates aria-pressed and visible section`
  (line ~743). All four fail at the same `toBeHidden()` assertion pattern
  with the element resolving as `hidden=""` yet `visible`.

### Bug #2 — same root cause as Bug #1 (`decode-text-col`) — **FIXED 2026-08-30**

Folded into Bug #1 above (same CSS defect, same fix); listed as its own
`decode:` test-suite line item because it was independently discovered from
the decode side before being traced to the same root cause as the mode
toggle.

### Bug #3 (MINOR) — encode output copy buttons (`.output-field button`) miss the mobile 44px tap-target minimum — **FIXED 2026-08-30**

- **Where:** the `@media (max-width: 640px)` block in `index.html`'s
  `<style>` applies `min-height: 44px` to `.mode-toggle button`,
  `.actions-row button`, `.file-info button`, and `.dropzone`, but **not**
  to `.output-field button` — the four encode copy buttons
  (`encode-base64-copy-btn`, `encode-base64url-copy-btn`,
  `encode-datauri-copy-btn`, `encode-snippet-copy-btn`) and
  `decode-text-copy-btn`. The same media query does give
  `.output-field button` `width: 100%`, so the omission of `min-height`
  looks like an oversight rather than intentional.
- **Input / reproduction:** at a 375×667 mobile viewport,
  `encode-base64-copy-btn`'s `boundingBox()` measured **34px tall** (its
  unmodified padding-derived height), short of the ~44px minimum
  `docs/conventions.md` § Responsive & mobile requires for tap targets.
- **Expected vs actual:** Expected ≥44px height on every icon-only /
  primary-action button at mobile widths (matches this tool's own
  `DESIGN.md` § Accessibility & UX: "Buttons and the dropzone get a mobile
  `min-height: 44px` bump for tap-friendliness"). Actual: 34px for the
  encode-output copy buttons specifically.
- **Suggested direction (not applied):** add `.output-field button` (and/or
  `decode-text-copy-btn`'s selector) to the existing mobile `min-height:
  44px` rule alongside the four selectors already there.
- **Severity: MINOR.** The buttons are still tappable (34px is not tiny),
  and the hit-test guard confirms nothing else covers them — this is a
  tap-comfort/conventions-compliance gap, not a functional break.
- **Covered by test:** `tests/base64-tool.e2e.mjs` — `mobile viewport... ›
  mode-toggle buttons and a copy button meet the ~44px tap-target minimum`
  (line ~800), using `expect.soft` so `mode-encode-btn`/`mode-decode-btn`/
  `encode-dropzone` are confirmed passing (≥44px) in the same run that
  flags `encode-base64-copy-btn` at 34px.

## Footer / sentinel integrity

Independently re-verified outside the test suite before writing the
regression test (`node -e` against the raw file, md5 of the content between
the `<!------ Begin Footer HASH: ... ---->` / `<!---- end footer -->`
sentinels): **`a97df085179a11175786e1d57d6c2a99`**, matching both the
embedded declared hash and the value the tester brief asked to confirm.
`crypto.randomUUID` does not appear anywhere in `index.html`'s source.

## Preview image

`tools/base64-tool/preview.png` generated via the Playwright CLI (Chromium,
1200×630, light color scheme): the encode text input filled with `Hello,
world! 👋`, waited for the debounced render, then screenshotted. Two
screenshot-time-only CSS tweaks were injected via `page.addStyleTag()`
purely for this capture (never written to `index.html`): hiding the
always-visible-due-to-Bug-#1 empty `encode-file-info` row, and shrinking
textarea/gap heights so all four encode outputs (Base64, Base64URL, data:
URI, and the top of the JS snippet) fit in the 1200×630 frame alongside the
header, mode toggle, and input. Once Bug #1 and the layout are addressed,
regenerating `preview.png` from the real (unmodified) page is recommended.

## Automated coverage

All 7 assertion categories from the tester brief are encoded as tests in
`base64-tool.e2e.mjs`. **Originally 43 passed, 5 failed**; after the fixer's
CSS-only fix (see notes above and `DESIGN.md` § Fixer notes), **48 passed,
0 failed** — every previously-failing assertion is one of the three bugs
documented above, now resolved, not a test defect. The 2026-08-30
localStorage-persistence fixer pass added a 14th `describe` block (3 tests),
bringing the suite to **51 individual test cases across 14 top-level
`describe` blocks, 51 passed, 0 failed**.
