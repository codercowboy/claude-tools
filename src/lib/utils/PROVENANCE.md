# `assets/` — provenance of consolidated shared includes

These inlined `<script>`/`<style>` includes are the canonical copies. Where an
asset was **consolidated up** out of a consuming repo (rather than authored
here first), this file records the source repo and the exact per-tool call sites
it replaced, so the direction of promotion is auditable.

Source repo for the entries below: **claude-tools**
(`https://github.com/codercowboy/claude-tools`, not published). The candidate
numbers (`#NN`) reference that repo's
`tmp/promotion-search-20260915/candidates-tools.md` clustering pass.

---

## `util.js` — `jbcUtil` runtime helpers (adopted 2026-09-15)

A sentinel-bannered `<script>` block exposing the global `jbcUtil`, born
byte-identical here and in `claude-tools/src/tools/jbc-include/util.js`
(divergence: none — no branding, tokens, or nested includes).

Consolidates three DOM-facing idioms. All call sites are under
`claude-tools/src/tools/<name>/source/` (download/debounce idioms are app-layer;
`formatBytes` is defined in `app.mjs` in some tools and in the unit-tested
`logic.mjs` in others — see the layering note below).

### `jbcUtil.downloadBlob(data, filename, mime?)` — #27 (19 tools)

`annotator`, `apng-maker`, `ascii-art`, `audio-converter`, `dither-studio`,
`favicon-kit`, `base64-tool`, `color-designer`, `image-converter`,
`image-cropper`, `image-metadata`, `images-to-pdf`, `meme-maker`,
`qr-generator`, `stego`, `video-gif`, `sprite-packer`, `social-card-maker`,
`srcset-builder`. Several had already factored a local `triggerDownload` /
`downloadBlob`; `dither-studio`'s `downloadBlob(blob, filename)` is the cleanest
model and the API (create objectURL → click hidden `<a download>` → revoke on a
timeout) follows it.

### `jbcUtil.debounce(fn, ms)` — #28 (16 tools)

`ascii-art`, `diff-viewer`, `dither-studio`, `base64-tool`, `color-converter`,
`favicon-kit`, `hasher`, `image-converter`, `image-cropper`, `js-api-tester`,
`markdown-previewer`, `pretty-printer`, `regex-tester`, `qr-generator`,
`social-card-maker`, `uuid-generator`. Textbook trailing-edge debounce, verbatim
in every tool (some inline as `scheduleParse`/`scheduleRender`).

### `jbcUtil.formatBytes(n, { base = 1024 } = {})` — #29 (15 tools)

`apng-maker`, `ascii-art`, `audio-converter`, `base64-tool`, `hasher`,
`image-converter`, `image-cropper`, `image-metadata`, `images-to-pdf`, `stego`,
`video-gif`, `social-card-maker`, `srcset-builder`, `pretty-printer`,
`rest-tester`. **`rest-tester` is the origin of the `base` option** — it formats
with a 1000 divisor (network transfer readouts) while the other 14 use 1024; the
`{ base }` option reconciles that split.

> **Layering note.** `downloadBlob`/`debounce` are always app-layer (DOM), so a
> runtime global fits every consumer. `formatBytes`, however, is defined inside
> the pure, `node --test`-imported `source/logic.mjs` in `audio-converter`,
> `base64-tool`, `image-converter`, `image-cropper`, `images-to-pdf`,
> `image-metadata`, `rest-tester`, `social-card-maker`, `stego`, and
> `srcset-builder`. Those consumers cannot reference a browser-only global from
> `logic.mjs` without breaking their unit tests — they need a Node-importable
> form (or keep a local copy). Only the app-layer `formatBytes` definitions
> (`apng-maker`, `ascii-art`, `hasher`, `video-gif`) adopt `jbcUtil.formatBytes`
> directly.

### `jbcUtil.clamp` / `num` / `clampInt` — #30 numeric guards (adopted 2026-09-29)

`clamp(n,lo,hi)`, `num(v,fallback?)`, `clampInt(v,lo,hi,fallback)`. Guard
primitives reinvented across ~13 tools (`annotator`, `ascii-art`, `apng-maker`,
`dither-studio`, `images-to-pdf`, `meme-maker`, `video-gif`, `sprite-packer`,
`social-card-maker`, plus color/inflation/uuid tools now split to the published
repo). `meme-maker`'s `clamp`/`num` is the model. `clampInt` follows
`dither-studio`'s value-based form (`parseInt(v,10)` then clamp); pass an input
element's `.value` for the "read a control" idiom. `dither-studio` (app-layer
`clampInt`) adopted directly this round.

### `jbcUtil.escapeHtml` / `escapeAttr` / `escapeXml` — #31 (adopted 2026-09-29)

`escapeHtml` escapes an HTML/XML text node (`& < >`); `escapeAttr` adds the
quotes (`"`→`&quot;`, `'`→`&#39;`); `escapeXml` emits the five predefined XML
entities (`'`→`&apos;`). `escaper`'s `logic.mjs` (`escapeHtmlText`/`…Attr`/
`escapeXml`) is the canonical spec these mirror. ~10 consumers: `apng-maker`,
`ascii-art`, `escaper`, `format-converter`, `image-metadata`, `js-api-tester`,
`markdown-previewer`, `regex-tester`, `social-card-maker`, `srcset-builder`.
`apng-maker` and `js-api-tester` (app-layer `escapeHtml`) adopted directly this
round; the others define their escapes inside a unit-tested `logic.mjs`
(logic-layer — see the layering note; they need a Node-importable carve).

### `jbcUtil.getRandomBytes(n)` / `makeId()` — #42 (adopted 2026-09-29)

`getRandomBytes(n)` → `Uint8Array` via `crypto.getRandomValues` (chunked past
the 65536-byte cap, `Math.random` fallback), and `makeId()` → `"s_"`+16 hex.
Encodes the repo rule that `crypto.randomUUID` throws over `file://` / plain-HTTP
LAN, so it is never used. 6 consumers: `annotator`, `apng-maker`, `hat-picker`,
`images-to-pdf`, `meme-maker` (+ `uuid-generator`, now split out). `annotator`'s
`makeId` is the model. `apng-maker` (app-layer `makeId`) adopted directly this
round; `annotator`/`meme-maker` define theirs in `logic.mjs` (logic-layer).

### `jbcUtil.persistState(key, defaults)` — #25 (adopted 2026-09-29)

Versioned, best-effort localStorage persist driven by a `defaults` shape (put a
version in the key). Returns `{ load, save }`: `load()` overlays stored values on
the defaults, coercing each by the default's TYPE and dropping non-finite
numbers; `save(state)` writes ONLY the schema keys, so secrets (never in the
schema) and derived output stay out. All access try/catch-guarded. The single
most universal scaffold — every tool hand-rolls `saveState()`/`loadState()`
identically at `<tool>:v1`. `sprite-packer`'s `typeof DEFAULTS[k]` coercion is
the model, and it adopted directly this round.

### `jbcUtil.onceFlag(key)` — #26 (adopted 2026-09-29)

One-shot "help seen" flag → `{ seen, mark }` on `<tool>:help-seen:v1`; a storage
throw is treated as already-seen (never re-nag). Byte-for-byte identical in every
tool. `sprite-packer` (`hasSeenHelp`/`markHelpSeen`) adopted directly this round.

> **App-layer vs logic-layer (this batch).** `persistState`/`onceFlag`/`makeId`/
> `getRandomBytes` are runtime-only (localStorage / crypto) and fit a global.
> `clamp`/`num` and `escapeHtml`/`escapeAttr`/`escapeXml` are pure and are
> exposed here as app-layer conveniences — but where a tool defines them inside a
> unit-tested `source/logic.mjs` (`escaper`, `ascii-art`, `markdown-previewer`,
> `regex-tester`, `social-card-maker`, `meme-maker`, `annotator`), it can NOT
> reference these browser globals from `logic.mjs` without breaking `node --test`.
> Those consumers need a Node-importable carve (blocked with claude-tools #1005),
> the same constraint that keeps `crc32.js`'s logic-layer consumers on local copies.

### DOM/UI wiring helpers — #34/#35/#36/#43/#51/#53/#54 (adopted 2026-09-29)

The browser/DOM-facing wiring idioms every tool re-rolls. All are runtime-only
(document / DOM / matchMedia), so they belong on the `jbcUtil` global, never in a
unit-tested `source/logic.mjs`.

- **`el(tag, props, children)`** — #43 hyperscript element factory (6 tools:
  `escaper`, `apng-maker`, `annotator`, `ascii-art`, `audio-converter`,
  `image-metadata`; `pretty-printer` defines its own in `logic.mjs`). `escaper`'s
  variant is the model; the shared one is a superset (adds string/number text
  children + all `aria-*`/`role`). **`iconButton(label, title, onClick, opts?)`** —
  `apng-maker`'s local extraction, promoted verbatim (class defaults to
  `icon-btn`).
- **`wireSegmented(group, onChange, opts?)`** — #35 accessible single-select over
  a button group (aria-pressed toggle + roving tabindex + arrow keys). Codifies
  the inline `aria-pressed` pattern across ~18 tools; the richer roving-tabindex
  tablist (#24) folds in here.
- **`wireTabs(tablist, onChange, opts?)`** — #24 the DISTINCT tablist primitive
  (adopted 2026-09-30, Train 31 · #1013 B4) the wireSegmented sweep deferred:
  `role="tablist"`/`role="tab"` with `aria-selected` toggle + roving tabindex +
  Arrow/Home/End, and `aria-controls` → `role="tabpanel"` show/hide (NOT the
  segmented control's `aria-pressed`). Value = `data-mode`/`data-value`/`id`/text;
  `opts.selector`/`attr`/`vertical`. Codifies the hand-rolled `setMode`/`setTab`
  wiring in the 5 tab tools — **timezone-planner** (4 tabs), **json-schema-tool**
  (3), **apng-maker** (2), **pretty-printer** (6 lang tabs over one shared panel —
  the shared-`aria-controls` path keeps that panel shown), and **sprite-packer**
  (×2: a pack/slice panel tablist + a panel-less output-format selector). Tabs
  with no `aria-controls` toggle no panel; tabs sharing one panel never hide it.
- **`wireDropzone(zone, onFiles, opts?)`** — #36 4-event drag-highlight + drop.
  `apng-maker`'s `wireDropzone` is the cleanest local extraction (17 tools).
- **`showError`/`hideError`/`showWarning`/`hideWarning(el, msg?)`** — #51 banner
  toggles ([hidden] + textContent). `format-converter`/`js-api-tester`/
  `image-converter`/`image-cropper` model.
- **`announce(msg, opts?)`** — #53 lazily-created visually-hidden aria-live region
  (`color-designer`, `hasher`, `hat-picker`, `annotator`, `rest-tester`).
- **`prefersReducedMotion()` + `restartAnimation(el, cls)`** — #54 reduced-motion
  gate + reflow-restart trick (`color-designer`, `color-picker`, `hat-picker`,
  `json-explorer`).
- **`wireCopyButtons(root?, opts?)` + `wireEditableCopy(input, btn)`** — #34
  copy-affordance wiring on top of `ctCopy`/`ctFlash` (copy.js): the delegated
  `data-copy-target` click handler (~25 tools) and the reveal-when-non-empty
  in-field toggle. **The delegated copy-target contract is owned by claude-tools
  ticket #1003a** (route per-tool copy wiring through shared `ctCopy`); this
  promotion keeps it opts-driven so 1003a can extend it without a breaking change.

CSS half → the new sibling **`widgets.css`** (below).

Pilot consumers switched this round (all app-layer, all already inline `util.js`):
`apng-maker` (`iconButton` + `wireDropzone`), `js-api-tester` (`showError`/
`hideError`), `dither-studio` (`.ct-checkerboard` via `widgets.css`). Full
fan-out is claude-tools 1001d.

> **Deferred — blocked-with-#1005 (logic-layer).** Three punchlist items in this
> group turned out to live in unit-tested `source/logic.mjs` and so cannot
> reference a browser global: **#44** `humanizeDuration`/`formatDuration`
> (`audio-converter`, `dev-converter`; `video-gif`'s app-layer `formatDuration`
> has divergent semantics), **#47** `slugify` (`social-card-maker`,
> `text-toolkit`), **#58** `wrapText` + canvas `fonts.mjs` (`meme-maker`,
> `social-card-maker`). They need a Node-importable module carve.

### Image / canvas helpers — #38/#39/#45 (adopted 2026-09-29)

App-layer image/canvas idioms used in `app.mjs` (DOM / canvas / object-URL
lifecycle), so they belong on the `jbcUtil` global, never in a unit-tested
`source/logic.mjs`.

- **`loadImageFile(file, opts?)`** — #38 the canonical "validate → decode →
  hand back the `<img>`" path (12 tools: `annotator`, `apng-maker`, `ascii-art`,
  `dither-studio`, `favicon-kit`, `image-converter`, `image-cropper`,
  `meme-maker`, `stego`, `social-card-maker`, `sprite-packer`, `srcset-builder`).
  Resolves `{ img, url, width, height }`; `opts.accept` type-guard (default
  `/^image\//`); the caller owns the object URL (`favicon-kit`/`apng-maker` keep
  it as a thumbnail) unless `opts.revoke=true` auto-revokes after decode.
- **`canvasToBlob(canvas, type?, quality?)` + `canvasToPngBytes(canvas)`** — #39
  (10 tools: `apng-maker`, `favicon-kit`, `image-converter`, `image-cropper`,
  `images-to-pdf`, `meme-maker`, `srcset-builder`, `qr-generator`,
  `sprite-packer`, `stego`). `canvasToBlob` is the graceful promisified
  `toBlob` (resolves `null` on failure — `srcset-builder`'s `encodeCanvas` is the
  model); `canvasToPngBytes` builds on it (rejects when unencodable —
  `apng-maker`'s model).
- **`setupHiDPICanvas(canvas, opts?)`** — #45 DPR backing-store scaling (5 tools:
  `color-picker`, `annotator`, `hat-picker`, `image-cropper`, `meme-maker`).
  `opts.width/height` (CSS px) or client size; `opts.maxDpr` cap; toggles
  `opts.style`/`opts.transform`/`opts.context`. Covers both the "size + transform"
  path (`hat-picker`'s confetti canvas) and the "size only, map coords by hand"
  path (`image-cropper`, via `transform:false`).

Pilot consumers switched this round (all app-layer): `apng-maker`
(`canvasToPngBytes`), `srcset-builder` (`encodeCanvas` → `canvasToBlob`),
`favicon-kit` (`loadImageFile`), `hat-picker` (`setupHiDPICanvas` — its template
gained the `<<ct:include util.js>>` token). Full fan-out is claude-tools 1001d.

> **Deferred — blocked-with-#1005 (logic-layer).** The rest of punchlist group C
> lives in unit-tested `source/logic.mjs` (imported, not a browser global), so it
> needs a Node-importable module carve: **#50** `checkImageLimits`
> (`image-converter`/`image-cropper`/`srcset-builder` — defined, exported, and
> unit-tested in `logic.mjs`), **#37** `base64.mjs` (7 consumers), **#40**
> `color.mjs` (2), **#46** `canvasFormats.mjs` (5), **#55** `rectGizmo.mjs` (3),
> **#56** `dither.mjs` (3). #59 misc 2-tool watch utils saw no 3rd app-layer
> consumer this round.

---

## `widgets.css` — `.ct-*` UI-widget styles (adopted 2026-09-29)

A sentinel-bannered `<style>` include (`ct-widgets`) exposing palette-agnostic
widget classes, born byte-identical here and in
`claude-tools/src/tools/jbc-include/widgets.css` (divergence: none — `.ct-*`
classes, tunable CSS custom properties, no identity tokens). Inlined via
`<<ct:include widgets.css>>`. Consolidates the CSS halves of the DOM/UI wiring
group:

- **`.ct-checkerboard`** — #41 transparency backdrop (8 tools: `annotator`,
  `favicon-kit`, `dither-studio`, `color-*`, `social-card-maker`, `sprite-packer`).
  Unified `repeating-conic-gradient` recipe; tune with `--ct-checker` /
  `--ct-checker-size`.
- **`.ct-segmented`** — #35 accent for the pressed button in a segmented group.
- **`.ct-dropzone` / `.ct-drag-over`** — #36 dashed drop target + drag highlight.
- **`.ct-banner` / `.ct-error` / `.ct-warning`** — #51 error/warning banners.

Pilot: `dither-studio`'s transparency backdrop now uses `.ct-checkerboard`.

---

## `crc32.js` — `jbcCrc32(bytes) -> uint32` (adopted 2026-09-15)

A sentinel-bannered `<script>` block exposing the global `jbcCrc32` (standard
reflected CRC-32, `0xedb88320` polynomial, 256-entry table), born byte-identical
here and in `claude-tools/src/tools/jbc-include/crc32.js` (divergence: none).

### #15 / #32 (9 tools)

**Origin: `favicon-kit`** — `claude-tools/src/tools/favicon-kit/source/logic.mjs`.
Proven duplication: `qr-generator`, `sprite-packer`, and `srcset-builder` carry
"ported from favicon-kit" comments, and `image-metadata` says "same approach as
the hasher tool."

- app-layer (`source/app.mjs`, runtime global fits): `color-designer`,
  `qr-generator`.
- pure-logic (`source/logic.mjs`, unit-tested — **cannot** use a browser global
  without breaking `node --test`): `favicon-kit` (origin), `apng-maker`,
  `dither-studio`, `image-metadata`, `sprite-packer`, `srcset-builder`,
  `hasher`.

> **Layering note.** CRC-32 is a pure algorithm most consumers use inside
> `logic.mjs`. The runtime-global `crc32.js` cleanly serves only the two
> app-layer consumers; the seven `logic.mjs` consumers need a Node-importable
> module (a future carve) rather than this inlined global. Recorded here so the
> fan-out doesn't try to force the global into unit-tested logic.

---

## `crc32.mjs` — Node-importable `export function crc32(bytes)` (adopted 2026-09-30)

The carve the `crc32.js` layering note called for. An ES module (`export function
crc32(bytes) -> uint32`) with the **same** reflected `0xedb88320` algorithm and
256-entry table as the `crc32.js` global, born byte-identical here and in
`claude-tools/src/tools/jbc-include/crc32.mjs` (divergence: none — no branding,
tokens, or nested includes).

Where `crc32.js` is a paste-only browser global (unusable from a unit-tested
`source/logic.mjs`, which `node --test` imports directly), `crc32.mjs` is
importable in Node **and** collapses cleanly into the single-file page: the
consuming repo's build resolves `import { crc32 } from '…/crc32.mjs'` and inlines
this module's body into the shipped `index.html`, stripping the `export`, so the
tool stays dependency-free and `file://`-openable. This is what unblocks the
logic-layer CRC-32 consumers (and, by the same import-inlining build capability,
the other deferred `*.mjs` carves — `base64.mjs`, `color.mjs`, `canvasFormats.mjs`,
`checkImageLimits`, etc.).

### #15 / #32 logic-layer consumers (7 tools)

The seven `source/logic.mjs` consumers the `crc32.js` layering note flagged:
`favicon-kit` (origin), `apng-maker`, `dither-studio`, `image-metadata`,
`sprite-packer`, `srcset-builder`, `hasher`. Each drops its local `crc32` copy for
`import { crc32 } from '../../jbc-include/crc32.mjs'` (and re-exports it where a
unit test reads `crc32` off the `logic.mjs` namespace). Pilot switched at adoption:
`favicon-kit`. `crc32.js` stays for the two app-layer consumers (`color-designer`,
`qr-generator`).

---

## `modal.js` — `jbcModal` content-modal primitive (variant added 2026-09-30)

The shared accessible content-modal primitive (role=dialog, aria-modal, focus
trap, Esc/backdrop close, focus return, reduced-motion, scroll-to-top, persistent
✕). It was authored here first; it is **not** consolidated up out of a consumer.
What changed 2026-09-30 is the **first-load Help variant** the 34 hand-rolled
`claude-tools` Help modals need (candidate **#60**), added as four
backward-compatible options:

- **`testid`** (string) — `data-testid` prefix so a tool keeps stable test hooks:
  overlay `${testid}-overlay`, dialog `${testid}-modal` (default unchanged:
  `jbcm-overlay` / `jbcm-dialog`). The ✕ is always `modal-close-x`.
- **`titleId`** (string) — an explicit id for the `<h2>` + its `aria-labelledby`
  (default: random). Lets a test assert a stable `aria-labelledby` target.
- **`autoOpen`** (`{ seen(), mark() }` handle, e.g. `jbcUtil.onceFlag(KEY)`) — the
  first-load variant: on a genuinely fresh visit the modal auto-opens and marks
  the flag, so it shows exactly once and never again. Injected (not a hard
  `jbcUtil` dependency) so `modal.js` stays standalone/pasteable.
- Overlay is appended to `document.body` at **construction** (hidden), not lazily
  on first open — so `getByTestId(...-overlay)` resolves at load and `[hidden]`
  collapses it to `display:none`, matching a statically-authored modal's semantics.

### #60 consumers — first batch (train 07, adopted into `claude-tools`)

The first 10-tool batch switched off their hand-rolled focus-trap Help modal onto
`jbcModal({ testid:'help', titleId:'help-title', title, body:<#help-body
template>, autoOpen: jbcUtil.onceFlag(HELP_SEEN_KEY) })` — **8 migrated**:
`hat-picker`, `escaper`, `hasher`, `jwt-decoder`, `pretty-printer`,
`regex-tester`, `timezone-planner`, `diff-viewer`. The remaining ~26 Help-modal
tools follow in train 08 via the same recipe. All call sites are under
`claude-tools/src/tools/<name>/source/`.

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`
> (its `npm test` is a zero-dep CJS runner for the `jbc` CLI only), so — as with
> `util.js` / `crc32.js` / `confirm.js` / `copy.js` — the `jbcModal` variant is
> validated **in the consumer**: `claude-tools`'s real-browser Playwright e2e
> exercises the full contract via `test-support`'s `assertModalA11y` +
> `assertHelpAutoShows` across every migrated tool.

---

## `escaper.mjs` / `diff.mjs` / `markdown.mjs` — Node-importable engine modules (promoted 2026-09-30)

Three whole-library engine carves promoted up out of `claude-tools` tools into
Node-importable ES modules (phase 11 · #1004a batch A), each born byte-identical
here and in `claude-tools/src/tools/jbc-include/<lib>.mjs` (divergence: none — no
branding, tokens, or nested includes; generified `jbc`-marked `export`ed API):

- **`escaper.mjs`** (`jbcEscape`) — ~40 pure escape/unescape context transforms
  (HTML/XML, JSON/JS/Java/C/Python string literals, shell single/double/ANSI-C +
  PowerShell, SQL/CSV, URL, Markdown, regex, Base64-over-UTF-8, filename slug)
  plus the `CONTEXTS` / `CONTEXTS_BY_ID` metadata, `DEFAULT_ENABLED`, and
  `nest(chain, text)` composer. Round-trip contexts satisfy
  `unescapeX(escapeX(s)) === s`. From `claude-tools` `escaper`.
- **`diff.mjs`** (`jbcDiff`) — the Myers O(ND) diff engine ("An O(ND) Difference
  Algorithm and Its Variations", Eugene W. Myers, 1986): `myersDiff` core reused
  for `diffLines` (line-level) and `diffWords` (word-level), plus `splitLines`,
  `normalizeLine` (ignore-* options), `tokenizeWords`, and `toUnifiedDiff`
  (standard unified diff with configurable context). From `claude-tools`
  `diff-viewer`. The tool keeps its own `SAMPLE_A`/`SAMPLE_B` demo pair local.
- **`markdown.mjs`** (`jbcMarkdown`) — a safe, deterministic Markdown→HTML
  renderer: line-based block parser + inline parser, entry `mdToHtml(src, opts)`,
  plus `parseInline`, `escapeHtml`, `escapeAttr`, and `sanitizeUrl`. Safety is
  baked in — raw HTML is always escaped, and `sanitizeUrl` blocks
  `javascript:`/`vbscript:`/`data:` (decoding numeric/hex entities and stripping
  control/whitespace chars first so a scheme can't be smuggled past the check;
  `data:image/` is allowed only when `opts.allowImage`). From `claude-tools`
  `markdown-previewer`, which keeps its `SAMPLE_MARKDOWN` cheat-sheet (it carries
  `claude-tools` project identity) local.

Where a browser global (like `crc32.js`) is unusable from a unit-tested
`source/logic.mjs` that `node --test` imports directly, these `.mjs` modules are
importable in Node **and** collapse cleanly into the single-file page: the
consuming repo's build resolves `import { … } from '…/<lib>.mjs'` and inlines the
module body into the shipped `index.html`, stripping the `export`, so the tool
stays dependency-free and `file://`-openable (claude-tools #1005 import-inlining).

### Consumers switched at adoption (claude-tools)

`escaper` → `escaper.mjs`, `diff-viewer` → `diff.mjs`, `markdown-previewer` →
`markdown.mjs`. Each origin `source/logic.mjs` dropped its local engine for
`import { … } from '../../jbc-include/<lib>.mjs'` and re-exports the API so its
unit tests (which read the `logic.mjs` namespace) and its app hook keep working.
Batches B + C (the remaining 7 whole-library modules — pretty-printer,
format-converter, timezone-planner, hasher, video-gif, images-to-pdf, curl-tool)
follow in later rounds.

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`,
> and these modules are DOM-free, so they are validated **in the consumer**:
> `claude-tools`'s `node --test` unit suites import each module directly (escaper
> 69, diff-viewer 77, markdown-previewer 96 — 0 fail) and its Playwright e2e
> exercises the inlined engine in a real browser (escaper 21, diff-viewer 34,
> markdown-previewer 29 — 0 fail; markdown-previewer's suite covers the XSS
> stance).

---

## `format.mjs` / `timezone.mjs` / `curl.mjs` / `pretty.mjs` — Node-importable engine modules (promoted 2026-09-30)

> **RETIRED 2026-09-30 (Train 35 · R5):** `duration.mjs` and `timezone.mjs` no longer exist; their bodies moved verbatim into `CtDateTimeUtil.mjs`. Notes below are historical.


Four more whole-library engine carves promoted up out of `claude-tools` tools
into Node-importable ES modules (phase 19 · #1004a batch B), each born
byte-identical here and in `claude-tools/src/tools/jbc-include/<lib>.mjs`
(divergence: none — no branding, tokens, or nested includes; generified
`jbc`-marked `export`ed API):

- **`format.mjs`** (`jbcFormat`) — structured-data format conversion engine.
  Per format a `parse<Source>(text, opts)` → plain JS value and an
  `emit<Target>(model, opts)` → text; a `PARSERS`/`EMITTERS` registry plus
  `convert(text, from, to, opts)` drive round-trips, and `detectFormat(text)`
  auto-detects the source. Covers JSON, CSV, TSV, YAML (a practical hand-written
  subset), `.properties`, and XML; `FORMATS` is the id+label registry a UI builds
  its selects from. From `claude-tools` `format-converter` (whole file was the
  engine; no tool-local sample data).
- **`timezone.mjs`** (`jbcTimezone`) — timezone / calendar / date-math engine on
  `Intl.DateTimeFormat` + `formatToParts` (no zone database ships): zone offsets
  and DST-aware wall-clock conversion, a meeting-overlap planner, a
  one-instant-into-many-zones converter, DST state + next-transition detection,
  and naive (UTC-field) calendar arithmetic (business-day math, ISO week,
  `diffParts`/`formatDiff`). The caller supplies IANA zone ids. From
  `claude-tools` `timezone-planner`, which keeps its own zone catalogue in the
  sibling `zones.mjs` (unchanged, still inlined locally).
- **`curl.mjs`** (`jbcCurl`) — HTTP-request model, curl/wget command parser, and
  multi-language code emitter. A POSIX-ish `tokenizeShell` feeds `parseCurl`/
  `parseWget`; `buildCurl`/`buildWget` regenerate commands; and
  `toFetch`/`toNode`/`toPython`/`toHttpie`/`toPowerShell`/`toGo` (+ `convert`)
  emit equivalent code. Every function is TOTAL (best-effort + a note, never a
  throw; no eval). Runs on Web-platform globals present in Node 20+
  (`TextEncoder`/`TextDecoder`, `btoa`/`atob`). From `claude-tools` `curl-tool`.
- **`pretty.mjs`** (`jbcPretty`) — multi-language pretty-printer / minifier: six
  hand-rolled, zero-dependency engines (JSON, YAML, HTML, CSS, SQL, JavaScript),
  each preserving semantic equivalence (JS/SQL get SAFE minify only — comments +
  insignificant whitespace, fully string/regex/template aware). Tokenizers
  (`tokenizeJS`, `tokenizeSQL`) are exported for token-stream equivalence checks.
  From `claude-tools` `pretty-printer`, which keeps its built-in `SAMPLES`
  ("Load sample" demo text) local — it carries `claude-tools` project identity
  and, inside its template-literal sample strings, the WORDS import/export and a
  literal script close-tag; those are sample DATA, masked by the #1005 inliner's
  codeMask, so the shared engine stays free of tool identity and of any real
  top-level import/export.

Where a browser global (like `crc32.js`) is unusable from a unit-tested
`source/logic.mjs` that `node --test` imports directly, these `.mjs` modules are
importable in Node **and** collapse cleanly into the single-file page: the
consuming repo's build resolves `import { … } from '…/<lib>.mjs'` and inlines the
module body into the shipped `index.html`, stripping the `export`, so the tool
stays dependency-free and `file://`-openable (claude-tools #1005 import-inlining).

### Consumers switched at adoption (claude-tools)

`format-converter` → `format.mjs`, `timezone-planner` → `timezone.mjs`,
`curl-tool` → `curl.mjs`, `pretty-printer` → `pretty.mjs`. Each origin
`source/logic.mjs` dropped its local engine for
`import { … } from '../../jbc-include/<lib>.mjs'` and re-exports the API so its
unit tests (which read the `logic.mjs` namespace) and its app hook keep working.
The final #1004a whole-library remainder (`hasher`, `video-gif`, `images-to-pdf`)
follows in batch C.

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`,
> and these modules are DOM-free, so they are validated **in the consumer**:
> `claude-tools`'s `node --test` unit suites import each module directly
> (format-converter 93, timezone-planner 75, curl-tool 60, pretty-printer 114 —
> 0 fail) and its Playwright e2e exercises the inlined engine in a real browser
> (format-converter 35, timezone-planner 27, curl-tool 22, pretty-printer 39 —
> 0 fail).

---

## `hasher.mjs` / `images-to-pdf.mjs` — Node-importable codec engines (promoted 2026-09-30)

The final whole-library carves (phase 20 · #1004a batch C — the heaviest codec
engines), each born byte-identical here and in
`claude-tools/src/tools/jbc-include/<lib>.mjs` (divergence: none — no branding,
tokens, or nested includes; generified `jbc`-marked `export`ed API, only the file
header changed, algorithm bytes untouched):

- **`hasher.mjs`** (`jbcHasher`) — hand-rolled hash engine. `md5`, `sha1`,
  `sha256`, and `sha512` (BigInt, masked to 64 bits) hash a `Uint8Array` to a
  `Uint8Array` digest; `hmac(name, key, msg)` is RFC-2104 HMAC over any of them.
  Every digest is hand-rolled on purpose — no `crypto.subtle.*`, which is
  secure-context-only and would break a tool opened over plain LAN HTTP or from
  `file://`. Byte / hex / base64 encoders (`textToBytes`, `bytesToHex`,
  `bytesToBase64`) are hand-rolled too, so the module loads unchanged under
  `node --test`. CRC-32 is **not** re-implemented here: the module imports `crc32`
  from the sibling `crc32.mjs` and re-exports it alongside the `crc32Hex` hex
  wrapper, so a single import gives a hasher UI every algorithm it offers. From
  `claude-tools` `hasher` (whole file was the engine; no tool-local data — `hasher`
  already imported the shared `crc32.mjs` per #1003b, and that import is preserved).
- **`images-to-pdf.mjs`** (`jbcImagesToPdf`) — zero-dependency minimal PDF-1.4
  writer. `buildPdf(images, options)` (and the `planPages` + `assemblePdf` pair it
  wraps) takes already-encoded JPEG bytes plus each image's pixel dimensions and
  returns a complete multi-page PDF as a `Uint8Array`, embedding each image as a
  `/DCTDecode` XObject and emitting a correct xref table + trailer. Also exports the
  page-geometry math — points / millimetre units (`mmToPt`/`ptToMm`), named page
  sizes (`PAGE_SIZES_PT`), orientation (`applyOrientation`/`orientedPageSize`) and
  contain / cover / actual / fit placement (`computePlacement`) — plus PDF number /
  string formatters and quality helpers. It never touches `document`/`window`/
  `canvas`: all image *encoding* stays in the caller, this module only lays out and
  serialises bytes. From `claude-tools` `images-to-pdf` (whole file was the engine;
  no tool-local data).
  - **Update (phase 31 · Train 32, 2026-10-01):** the module's embedded
    `formatBytes` was replaced with a sibling `import { formatBytes } from
    './formatBytes.mjs'` (the same sibling-import pattern `hasher.mjs` uses for
    `crc32.mjs`), so the byte-size readout now shares the one canonical
    `formatBytes` instead of a byte-identical in-engine copy. Behaviour is
    unchanged (the embedded copy was proven equal to the shared default in Train
    30); the build inlines the shared `formatBytes` body exactly once. Re-vendored
    byte-identical; manifest sha1 re-baselined `3a5475d6…` → `5c8c2e90…`.

The third batch-C library, **`video-gif`** (GIF89a assembler + variable-width LZW
+ median-cut quantizer + Floyd–Steinberg dither), was **deferred from this round**
and promoted in **phase 28** (see the `video-gif.mjs` section at the end of this
file). Its engine is a clean pure module, but the origin tool inlines its
`logic.mjs` twice — once into module scope and once inside a `WORKER_SOURCE`
template literal (a Blob-URL module worker) — and the old build-wide inline dedup
would hoist an imported engine into only the first point, leaving the worker
without the engine. **Train 28's A3 per-inline-site inlining fixed that**, and
phase 28 then carved + switched it (worker string now receives its own full
engine).

Where a browser global (like `crc32.js`) is unusable from a unit-tested
`source/logic.mjs` that `node --test` imports directly, these `.mjs` modules are
importable in Node **and** collapse cleanly into the single-file page: the
consuming repo's build resolves `import { … } from '…/<lib>.mjs'` and inlines the
module body into the shipped `index.html`, stripping the `export` (and, for
`hasher`, hoisting the shared `crc32` body exactly once), so the tool stays
dependency-free and `file://`-openable (claude-tools #1005 import-inlining).

### Consumers switched at adoption (claude-tools)

`hasher` → `hasher.mjs`, `images-to-pdf` → `images-to-pdf.mjs`. Each origin
`source/logic.mjs` dropped its local engine for
`import { … } from '../../jbc-include/<lib>.mjs'` and re-exports the API so its
unit tests (which read the `logic.mjs` namespace) and its app hook keep working.

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`,
> and these modules are DOM-free, so they are validated **in the consumer**:
> `claude-tools`'s `node --test` unit suites import each module directly
> (hasher 39, images-to-pdf 40 — 0 fail; hasher's `md5`/`sha1`/`sha256`/`sha512`
> are checked against `node:crypto` for every input length 0..200, the exact
> block-boundary lengths, and a 10 000-byte input) and its Playwright e2e exercises
> the inlined engine in a real browser (hasher 27, images-to-pdf 24 — 0 fail).

---

## `formatBytes.mjs` — Node-importable logic-layer byte formatter (promoted 2026-09-30) — RETIRED 2026-09-30 (Train 35 · R4b)

> **RETIRED:** the file no longer exists. Its body moved verbatim into `CtByteUtil.mjs` (named export `formatBytes`); every consumer imports it from there. The historical notes below describe the original module.

The `#29` carve the `util.js` layering note called for, on the **logic-layer**
side. An ES module (`export function formatBytes(bytes) -> string`) born
byte-identical here and in `claude-tools/src/tools/jbc-include/formatBytes.mjs`
(divergence: none — no branding, tokens, or nested includes), phase 24 · #1001
logic-carve A.

Spec: `Number(bytes) || 0` coercion, an integer count with a `" B"` suffix below
1 KiB, otherwise one decimal in binary (1024) tiers — KB, MB, GB, capped at GB, a
space between number and unit (`"1.5 KB"`, `"976.6 KB"`, `"931.3 GB"`).

> **Two formatters, by design.** This is **not** the app-layer
> `jbcUtil.formatBytes` global (`util.js`, #29): that one uses **no space**, a
> lowercase `"b"` under 1 KB, **two** decimals for KB/MB/GB, and a **TB** tier
> (redefined 2026-09-15). The `util.js` #29 layering note recorded that
> `formatBytes` is defined inside a pure, unit-tested `source/logic.mjs` in many
> tools, which cannot reference a browser-only global from `logic.mjs` without
> breaking `node --test`, and that those consumers "need a Node-importable form."
> This module IS that form, and it preserves the **logic-layer** consumers' own
> long-standing output (space / uppercase `"B"` / one decimal / 1024 / KB-MB-GB) —
> which differs from the `util.js` global's output. The two coexist: a tool picks
> the global (app-layer) or this module (logic-layer) per where its size readout
> is computed. Do not conflate or unify them.

Where the `util.js` global is unusable from a unit-tested `source/logic.mjs`
that `node --test` imports directly, this `.mjs` module is importable in Node
**and** collapses cleanly into the single-file page: the consuming repo's build
resolves `import { formatBytes } from '…/formatBytes.mjs'` and inlines the module
body into the shipped `index.html`, stripping the `export`, so the tool stays
dependency-free and `file://`-openable (claude-tools #1005 import-inlining).

### #29 logic-layer consumers — equivalence-proven fan-out (8 tools)

Equivalence against the canonical was proven per consumer over a vector set
(bytes 0, 1, 1023, 1024, 1536, 1e6, 1.5e9, 1e12, + the image tools' 8 MB / 40 MB
limits) BEFORE any swap. **6 switched** (dropped the local `formatBytes`, now
`import { formatBytes } from '../../jbc-include/formatBytes.mjs'` + re-export
where a unit test reads it): `audio-converter`, `image-converter`,
`image-cropper`, `social-card-maker`, `stego`, `srcset-builder`. Of these, four
were byte-identical on every input and two (`audio-converter`, `stego`) were
identical on every real byte count and differed only on non-finite/non-numeric
garbage the canonical coerces to `"0 B"` (never a reachable file size — every call
site passes a `.size`/`.length` or a constant limit), so the switch is
behaviour-preserving.

**2 LEFT + documented** (genuinely divergent observable output, NOT
force-swapped): `image-metadata` uses **2-decimal precision when the value is
< 10** (`toFixed(v < 10 ? 2 : 1)`) and an `''` sentinel for null/NaN;
`rest-tester` uses **1000-based decimal** tiers (network-transfer readouts) and a
`'—'` sentinel. Both would change their displayed bytes under this canonical, so
they keep their local copies.

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`,
> and this module is DOM-free, so it is validated **in the consumer**:
> `claude-tools`'s `node --test` unit suites import the module (via each switched
> tool's `logic.mjs` namespace) and its Playwright e2e exercises the inlined
> formatter in a real browser across the six switched tools.

---

## `base64.mjs` / `duration.mjs` / `slugify.mjs` / `posAt.mjs` / `wrapText.mjs` — logic-layer text/data utils (promoted 2026-09-30)

> **RETIRED 2026-09-30 (Train 35 · R5):** `duration.mjs` and `timezone.mjs` no longer exist; their bodies moved verbatim into `CtDateTimeUtil.mjs`. Notes below are historical.


The `#1001` logic-carve batch B — five small text/data helpers that were
hand-rolled inside pure, unit-tested `source/logic.mjs` files (so a browser
global can't serve them without breaking `node --test`), promoted on the same
mechanism as `crc32.mjs` / `formatBytes.mjs` (phase 25). Each is a
Node-importable ES module born byte-identical here and in
`claude-tools/src/tools/jbc-include/<name>.mjs` (divergence: none — no branding,
tokens, or nested includes).

- **`base64.mjs`** — `base64UrlToBytes(input) -> Uint8Array` (base64url/standard
  decode: strips whitespace, tolerates missing padding, maps `-_` onto `+/`,
  validates, friendly Errors) + `utf8ToBase64(str) -> string` (UTF-8-safe
  standard-base64 encode). A two-function codec module: the two consumers use
  opposite directions (decode vs encode), both preserved verbatim.
- **`duration.mjs`** — `formatDuration(seconds) -> string` ("m:ss"/"h:mm:ss"
  clock) + `humanizeDuration(ms) -> string` ("1d 2h 3m 4s" breakdown; sub-second
  "500ms"; 0 -> "0ms"; non-finite -> ""). A two-function formatter module: one
  consumer wants the clock, the other the breakdown.
- **`slugify.mjs`** — `slugify(str) -> string`, the conservative ASCII filename
  slug (trim / lowercase / quote-strip / non-alnum -> `-` / trim dashes / 60-cap).
  Does **not** transliterate diacritics — a tool that needs "Café" -> "cafe"
  keeps its own NFKD-normalizing slugifier (they are different specs).
- **`posAt.mjs`** — `posAt(text, index) -> { line, column }`, a 0-based offset to
  1-based line/column (split on `\n`, index clamped to length) — the readout a
  hand-rolled parser wants for error positions.
- **`wrapText.mjs`** — `wrapText(text, maxWidth, measure) -> string[]`, greedy
  word-wrap: explicit newlines are hard breaks, an over-wide word is kept whole,
  and width is measured by an **injected `measure(str) -> number`** so the pure
  wrapping logic carries no canvas/DOM dependency (the call site passes
  `ctx.measureText(s).width`).

> **`base64` / `duration` are deliberately two-function toolkits.** Their two
> consumers each used a *different* one of the pair, and both functions are
> behaviour-preserved verbatim. The consuming repo's build inlines the **whole**
> module into each switched tool (one function unused there — the same shape as
> `hasher.mjs` inlining every algorithm a tool doesn't call). `wrapText.mjs`
> inlines its callers' `num(maxWidth, 0)` coercion as
> `Number.isFinite(Number(x)) ? Number(x) : 0` so the module carries no `num`
> binding that would collide with the consumer's own `num` when inlined —
> observably identical.

### Consumers — equivalence-proven fan-out

Equivalence against each canonical was proven per consumer over a
util-appropriate vector set (base64 round-trips incl. unicode/emoji + base64url
padding; durations 0/59s/90s/1h/25h + ms; slugify unicode/punct/empty/60-cap;
posAt line boundaries + clamp; wrapText widths/long-words/newlines) by
**reconstructing each consumer's original local util independently** BEFORE any
swap (122/122 equivalent). **9 swaps landed** (drop the local copy, `import { … }
from '../../jbc-include/<name>.mjs'`, re-export where a unit test reads it):
`jwt-decoder` (base64UrlToBytes), `rest-tester` (utf8ToBase64), `audio-converter`
(formatDuration), `dev-converter` (humanizeDuration), `json-schema-tool` (posAt,
internal — no re-export), `json-explorer` (posAt), `meme-maker` (wrapText),
`social-card-maker` (wrapText + slugify).

**1 LEFT + documented** (genuinely divergent observable output, NOT
force-swapped): `text-toolkit`'s `slugify` is an NFKD diacritic-stripping,
`splitWords`-based, **uncapped** variant ("Café Menu" -> "cafe-menu") — a
different spec from the ASCII canonical — so it keeps its local copy.

> **Test strategy.** Same as the other logic-layer modules: DOM-free, validated
> in the consumer — `claude-tools`'s `node --test` suites import each module via
> the switched tools' `logic.mjs` namespace, and Playwright e2e exercises the
> inlined helpers in a real browser.

## `color.mjs` / `dither.mjs` / `canvasFormats.mjs` / `checkImageLimits.mjs` / `rectGizmo.mjs` — logic-layer image/canvas utils (promoted 2026-09-30)

The `#1001` logic-carve batch C (FINAL) — five image/canvas helpers that were
hand-rolled inside pure, unit-tested `source/logic.mjs` files (so a browser
global can't serve them without breaking `node --test`), promoted on the same
mechanism as `crc32.mjs` / `formatBytes.mjs` / the phase-25 text utils (phase 26).
Each is a Node-importable ES module born byte-identical here and in
`claude-tools/src/tools/jbc-include/<name>.mjs` (divergence: none — no branding,
tokens, or nested includes). All are PURE — any canvas/DOM stays at the call site.

- **`color.mjs`** — `clampByte(v) -> 0..255` (integer clamp, truncates via `|0`),
  `hexToRgb(hex) -> [r,g,b] | null`, `rgbToHex([r,g,b]) -> "#rrggbb"`,
  `parsePalette(list) -> [[r,g,b], ...]`. The DOM-free colour primitives an
  indexed-image / palette tool needs. (A tool wanting diacritic-free luminance,
  e.g. `ascii-art`, is a future adopter — not carved here.)
- **`dither.mjs`** — `nearestColorIndex(r,g,b,palette)` + the reduce-to-a-palette
  engine `floydSteinberg` / `atkinson` (error diffusion) + `bayerMatrix` / `bayer`
  (ordered). Takes raw RGBA + a palette, returns a `Uint8Array` of palette
  indices. Imports `clampByte` from `color.mjs` so a consumer inlining both gets
  exactly one copy (the build dedups it).
- **`canvasFormats.mjs`** — `FORMATS` (the png/jpeg/webp encoders a `<canvas>`
  natively supports, each `{ mime, ext, label, lossy }`) + `mimeForFormat(fmt)` +
  `formatSupportsQuality(fmt)`. AVIF and animated-GIF are deliberately absent
  (not canvas-encodable). Metadata only; the `toBlob` call stays at the call site.
- **`checkImageLimits.mjs`** — `makeImageLimitChecker({ action, dimSep })` returns
  a bound `checkImageLimits({bytes,width,height}) -> {level,message}` large-image
  guard (soft warn + hard error on both file size and pixel dimensions; strict `>`
  boundaries; the file-size cap wins over a warn). Thresholds exported:
  `WARN_FILE_BYTES` 8 MB, `MAX_FILE_BYTES` 40 MB, `WARN_PIXELS` ~24 MP,
  `MAX_DIMENSION` 20000 px/side. A **factory** because the one per-tool part — the
  warn verb ("converting" / "cropping" / "generating many widths") and the ×/x
  dimension separator — is injected at configuration time (the wrapText pattern),
  so the guard logic + thresholds are shared while each consumer keeps its exact
  wording. Imports `formatBytes` from `formatBytes.mjs`.
- **`rectGizmo.mjs`** — `normalizeRect(rect)` (non-negative w,h; a handle dragged
  past the opposite edge flips sign), `HANDLE_IDS`, `oppositeHandle(id)`,
  `handlePoints(rect)`, `hitTestHandle(rect,px,py,tol)`. The pure geometry behind
  an interactive crop/selection rectangle — coordinates in, handle id out.

> **`checkImageLimits` is a factory + `dither` imports `color`.** Two shape notes:
> the guard is configured once per tool (`makeImageLimitChecker(opts)`) rather
> than taking opts on every call, so the consuming repo can inject its wording in
> the one file it edits (`logic.mjs`) while leaving the `app.mjs` call sites and
> the unit tests calling the bound function untouched — and it sidesteps the
> import-inliner's aliased-import rename. `dither.mjs` reuses `color.mjs`'s
> `clampByte` (a transitive module->module import the consuming build dedups) so
> exactly one copy exists when a consumer inlines both.

### Consumers — equivalence-proven fan-out

Equivalence against each canonical was proven per consumer over a
util-appropriate vector set (color hex<->rgb round-trips + fractional/clamped
channels + #fff/#000; dither a known 4×4 buffer -> identical index bytes for
Floyd–Steinberg / Atkinson / Bayer + `nearestColorIndex`; canvasFormats every
MIME/ext mapping; checkImageLimits at/over/under the byte + dimension thresholds
incl. boundaries and the ×/x separators; rectGizmo handle hit-tests at corners/
edges/inside/outside + a resize delta) by **reconstructing each consumer's
original local util independently** BEFORE any swap (172/172 equivalent). **5 swaps
landed** (drop the local copy, `import { … } from '../../jbc-include/<name>.mjs'`,
re-export where a unit test reads it): `dither-studio` (color + dither),
`image-converter` (canvasFormats + checkImageLimits), `image-cropper`
(checkImageLimits + rectGizmo), `srcset-builder` (checkImageLimits).

**1 was NOT unified onto the shared dither** (by design): `video-gif`'s dither.
Its `ditherFloydSteinberg` genuinely diverges from this canonical — its
`clampByte` lacks the `|0` truncation, changing output on some inputs (23/192
sampled buffers) — so it is **not** swapped onto `dither.mjs`/`color.mjs`. Instead,
phase 28 carved video-gif's whole engine (quantizer + LZW + GIF89a assembler + its
own divergent dither) into a self-contained **`video-gif.mjs`** (see that section
at the end of this file). That also resolved the worker double-inline blocker
noted here: `video-gif`'s `app.mjs` inlines `logic.mjs` twice (module scope AND a
`WORKER_SOURCE` Blob-worker string), and Train 28's A3 per-inline-site inlining now
feeds the worker site its own full engine.

> **Test strategy.** Same as the other logic-layer modules: DOM-free, validated
> in the consumer — `claude-tools`'s `node --test` suites import each module via
> the switched tools' `logic.mjs` namespace, and Playwright e2e exercises the
> inlined helpers in a real browser.

---

## `video-gif.mjs` — Node-importable whole-library GIF89a encoder engine (promoted 2026-09-30)

The **final** #1004a whole-library carve (phase 28 · batch C; #1013 C3), born
byte-identical here and in `claude-tools/src/tools/jbc-include/video-gif.mjs`
(divergence: none — no branding, tokens, or nested includes; generified
`jbc`-marked `export`ed API; only the file header was swapped, the algorithm bytes
are byte-identical to the origin `logic.mjs` body).

- **`video-gif.mjs`** (`jbcVideoGif`) — a self-contained animated-GIF encoder.
  A **median-cut** colour quantizer (`quantize`, `buildHistogram`), nearest /
  Floyd–Steinberg **palette mapping** (`nearestColorIndex`, `mapToPaletteIndices`,
  `ditherFloydSteinberg`), GIF **variable-width LZW** (`lzwEncode`, code size
  2..12, clear/EOI, dictionary reset at 4096), and a hand-rolled **GIF89a
  assembler** (`buildColorTable`, `buildGraphicControlExtension`,
  `buildImageDescriptor`, `buildNetscapeExtension` looping, `toSubBlocks`,
  `gif89aEncode` — a global palette shared by all frames) plus the full pipeline
  `samplePixels` + `encodeFramesToGif`. It never touches `document`/`window`/
  `canvas`: the consumer extracts RGBA frames from a `<video>`/`<canvas>` and this
  module returns the GIF bytes. From `claude-tools` `video-gif` (whole file was the
  engine; no imports, no tool-local sample data).

**Two constraints make this module unlike the other engines:**

1. **NO backticks / template literals — anywhere, header included.** video-gif's
   `app.mjs` inlines the engine body into a `WORKER_SOURCE` **backtick worker-source
   string** (a Blob-URL module worker, so the tool works from `file://`). A stray
   backtick would terminate that string, so the module uses ordinary string
   concatenation throughout. (This is why the other codec engines' template-literal
   strings are fine — they inline into a normal `<script type="module">`, not a
   worker string — but this one must stay backtick-free.)
2. **It is inlined at TWO sites per build** — once at module scope (main-thread
   fallback) and once inside the `WORKER_SOURCE` string. The old build-wide inline
   dedup starved the second (worker) site, which is why this module was the ONE
   batch-C library **left behind** in phase 20. **Train 28's A3 per-inline-site
   inlining fixed exactly that**: each `<<ct:inline logic.mjs>>` site now gets its
   own full engine. phase 28 proved the unblock end-to-end on the real tool — the
   built `index.html` has each engine function (`encodeFramesToGif`, `gif89aEncode`,
   `quantize`, `lzwEncode`, `ditherFloydSteinberg`, `clampByte`, …) **exactly twice**
   (module + worker), **0** bare `import`/`export`, and the extracted worker body is
   **syntax-valid** with **0** interior backticks.

**Divergent dither — kept self-contained, NOT unified.** video-gif's
`ditherFloydSteinberg` + local `clampByte` genuinely differ from the shared
`dither.mjs`/`color.mjs`: its `clampByte` omits the `|0` truncation, so output
differs on 23/192 sampled buffers (proven phase 26). The whole-library carve
therefore keeps video-gif's dither **inside** `video-gif.mjs` rather than swapping
it onto the shared dither/color modules — the correct, byte-preserving choice for a
whole-library promotion.

Where a browser global would be unusable from a unit-tested `source/logic.mjs` that
`node --test` imports directly, this `.mjs` module is importable in Node **and**
collapses cleanly into the single-file page: the consuming repo's build resolves
`import { … } from '…/video-gif.mjs'` and inlines the module body into the shipped
`index.html` (stripping the `export`, once per inline site), so the tool stays
dependency-free and `file://`-openable (claude-tools #1005 import-inlining + Train
28 A3 per-site inlining).

### Consumers switched at adoption (claude-tools)

`video-gif` → `video-gif.mjs`. Its `source/logic.mjs` dropped its local engine for
`import { … } from '../../jbc-include/video-gif.mjs'` and re-exports all 14 symbols
so its unit tests (which read the `logic.mjs` namespace) and its app hook keep
working; `app.mjs` was **not** touched (A3 handles both inline sites via the
existing `<<ct:inline logic.mjs>>` tokens).

> **Test strategy.** jason-code ships no DOM/browser test harness for `assets/`,
> and this module is DOM-free, so it is validated **in the consumer**:
> `claude-tools`'s `node --test` unit suite imports it via the switched tool's
> `logic.mjs` namespace (38/0 — LZW round-trips through an independent decoder,
> median-cut palette bounds, dither determinism, and a full GIF89a container
> decode), and its Playwright e2e (22/0) exercises the inlined engine in a real
> browser at **both** sites — `window.__videoGif` (module scope) and the real
> Create-GIF worker pipeline (the `WORKER_SOURCE` Blob worker) that renders and
> downloads an actual GIF.

**#1004a is now complete — 10/10 whole-library modules** promoted + switched +
green (batch A: `escaper`/`diff`/`markdown`; batch B: `format`/`timezone`/`curl`/
`pretty`; batch C: `hasher`/`images-to-pdf`/`video-gif`).

## `util.js` / `formatBytes.mjs` / `slugify.mjs` — additive API enhancements + holdout adoptions (phase 30 · #1013 group B, 2026-09-30)

Three EXISTING shared modules gained additive options so the last hand-rolled
holdout consumers could adopt them. **The hard invariant: every new option's
DEFAULT reproduces the pre-change behavior exactly**, so an option-free call is
byte-identical to the old function and every already-adopted consumer is
behaviorally unchanged. Proven end-to-end in claude-tools: whole-repo
`build:check` **35/35** (the deterministic re-inline of these modules is the only
change to the untouched tools), plus each adopter's `node --test` unit suite
unchanged and the swapped tools' Playwright e2e green.

- **`jbcUtil.wireCopyButtons(root?, opts?)`** — new **`opts.skipWhen(text, target,
  btn)`** predicate, consulted after the target's text is read and before the
  `!text` empty-guard; a truthy return ignores the click (no copy, no flash).
  Default (absent) leaves the delegated copy wiring untouched. Ticket #1003a had
  identified two legitimate skips that the narrower contract couldn't express;
  this closes them. Adopters: **escaper** (`'—'` `<output>` sentinel →
  `skipWhen: t => t === '—'`) and **jwt-decoder** (`data-empty="true"` while the
  value is non-empty → `skipWhen: (t, el) => el.getAttribute('data-empty') ===
  'true'`), both of which dropped their duplicated hand-rolled delegated listeners.

- **`formatBytes(bytes, opts?)`** — new
  `{ base, decimals, space, units, byteUnit, invalid, invalidWhen }`. Defaults:
  base 1024, decimals 1, space true, `['KB','MB','GB']`, byteUnit `'B'`, and the
  historical `Number(bytes) || 0` coercion (→ "0 B") when `invalid` is unset.
  `decimals` accepts a `fn(scaledValue)` for magnitude-varying precision.
  Adopters (equivalence-proven per consumer against a hand-reconstructed copy of
  its original local function BEFORE the swap): **rest-tester**
  (`{ base: 1000, invalid: '—' }`), **image-metadata**
  (`{ decimals: v => v < 10 ? 2 : 1, invalid: '', invalidWhen: n => n == null ||
  isNaN(n) }`), and **images-to-pdf** (whose engine module's own `formatBytes`
  is the plain default spec → routed to the shared default).

- **`slugify(str, opts?)`** — new diacritic-aware variant
  `slugify(str, { diacritics: true, cap? })`: NFKD-normalize + strip combining
  marks (U+0300–U+036F), split into words with the camelCase / acronym / digit-run
  model, lowercase, join with `-`; `cap` (default null) leaves it UNCAPPED. The
  default ASCII collapse-and-cap-at-60 path is unchanged. This is a DIFFERENT word
  model from the default (which collapses non-alphanumeric runs) — it replicates
  the `splitWords`-based slug several text tools hand-rolled. Adopter:
  **text-toolkit** (`"Café Menu"` → `"cafe-menu"`, uncapped). social-card-maker
  (the one prior importer) calls the default and is unchanged.

---

## `formats/` — format engines moved + PascalCased (2026-09-30)

Train 34 · R1 (jbc ES6 modularization, Set 1): the six Node-importable format
engines moved into `assets/formats/` with PascalCase names, content unchanged
(pure move; sha1s identical): `escaper.mjs` -> `formats/CtEscaper.mjs`,
`format.mjs` -> `formats/CtFormat.mjs`, `markdown.mjs` -> `formats/CtMarkdown.mjs`,
`pretty.mjs` -> `formats/CtPretty.mjs`, `curl.mjs` -> `formats/CtCurl.mjs`,
`diff.mjs` -> `formats/CtDiff.mjs`. The build's include resolver now accepts
subfolder names (`<<ct:include formats/CtEscaper.mjs>>`).

---

## `image/` — image engines moved + PascalCased (2026-09-30)

Train 34 · R2 (jbc ES6 modularization, Set 1): `dither.mjs` -> `image/CtDither.mjs`,
`images-to-pdf.mjs` -> `image/CtImagesToPdf.mjs`, `video-gif.mjs` -> `image/CtVideoGif.mjs`.
CtVideoGif is a pure move. CtDither and CtImagesToPdf each had one internal import
specifier changed to point one level up, because `color.mjs` and `formatBytes.mjs` stay at
the assets root until R6: `'./color.mjs'` -> `'../color.mjs'`, `'./formatBytes.mjs'` ->
`'../formatBytes.mjs'`.

---

## `components/` — static assets moved (2026-09-30)

Train 34 · R3 (jbc ES6 modularization, Set 1 FINAL): pure moves, content unchanged
(sha1s identical): `base.css`, `controls.css`, `widgets.css`, `gallery.css` ->
`components/styles/` (CSS stays lowercase), `footer.html` -> `components/footer.html`,
`readme-footer.md` -> `components/readme-footer.md`. Include tokens become
`<<ct:include components/footer.html>>` / `<<ct:include components/styles/base.css>>` etc.

---

## `CtByteUtil.mjs` — byte utilities merged (2026-09-30)

Train 35 · R4a (jbc ES6 modularization, Set 2 — behavior-preserving, NOT byte-identical).
New module `CtByteUtil.mjs` (sha1 `4c77a427...`) merges four former assets and retires them:
`crc32.js` + `crc32.mjs` -> named export `crc32` (ONE impl), `base64.mjs` ->
`base64UrlToBytes`/`utf8ToBase64`, `hasher.mjs` -> `md5`/`sha1`/`sha256`/`sha512`/`hmac`/
`bytesToHex`/`bytesToBase64`/`textToBytes`/`crc32Hex`. `formatBytes` is exported too but
DEFINED in-module (R4b moved the body in verbatim from the now-retired `formatBytes.mjs`; all consumers incl. `checkImageLimits.mjs` and `image/CtImagesToPdf.mjs` import it from `CtByteUtil.mjs`). The file ends with
`export class CtByteUtil` whose static members REFERENCE the named functions (no
reimplementation). Not yet included: `getRandomBytes` (carve DEFERRED to R12, util.js final pass).

Equivalence: `crc32.js` (the `window` global) and `crc32.mjs` were proven bit-identical to each
other, to the merged `crc32`, to an independent table-free bitwise CRC-32 and to `node:zlib`
over 218 vectors (known check values, empty/ASCII/binary/5 MiB, fuzz) — harness kept in the
consuming repo's round folder (`tmp/builder-r1/prove-equivalence.mjs`). The hasher engine's
only internal edit: its `import { crc32 } from './crc32.mjs'` became the in-module `crc32`, its
trailing export block became inline `export function`s, and its internal helper
`concatBytes` was renamed `concatTwoBytes` (the build flattens a whole module into a consumer
page, so a generic helper name can collide with a consumer's own — dither-studio hit this).
The `window.jbcCrc32` global is eliminated; its seven consumers were already importing the
module twin, so `crc32.js` had no live includers left.

---

## `CtDateTimeUtil.mjs` — duration + timezone merged (2026-09-30)

Train 35 · R5 (jbc ES6 modularization, Set 2 — behavior-preserving, NOT byte-identical).
New module `CtDateTimeUtil.mjs` (sha1 `ff584951...`) merges two former assets and retires them:
`duration.mjs` (`formatDuration`, `humanizeDuration`) + `timezone.mjs` (the full Intl-based
timezone / calendar / date-math export set + `WEEKDAY_NAMES`). Bodies concatenated verbatim, each
source's doc-comment kept as a titled section; no cross-deps, no global, no logic merge. Ends with
`export class CtDateTimeUtil` whose statics REFERENCE the named functions (single impl).
Equivalence: old vs new value-parity harness (694,713 cases: duration over 0/negative/large/NaN/fractional
ranges; timezone API over 12 zones x 13 DST-edge instants, overlap/grid, date math, parseNaive), also
checked against the class statics and vendored copy — 0 mismatches. Consumers: dev-converter,
audio-converter, timezone-planner. Note: PROVENANCE sections above for `duration.mjs`/`timezone.mjs`
are historical; those files no longer exist.

---

## `image/CtImageUtil.mjs` — color + canvasFormats + checkImageLimits + rectGizmo merged (2026-09-30)

Train 35 · R6a (jbc ES6 modularization, Set 2 — behavior-preserving, NOT byte-identical).
New module `image/CtImageUtil.mjs` (sha1 `ae54c210...`) merges four former assets and retires them:
`color.mjs` (`clampByte`, `hexToRgb`, `rgbToHex`, `parsePalette`), `canvasFormats.mjs` (`FORMATS`,
`mimeForFormat`, `formatSupportsQuality`), `checkImageLimits.mjs` (`makeImageLimitChecker` + the four
threshold constants) and `rectGizmo.mjs` (`normalizeRect`, `HANDLE_IDS`, `oppositeHandle`, `handlePoints`,
`hitTestHandle`). Bodies concatenated verbatim, each source's doc-comment kept as a titled section; ends
with `export class CtImageUtil` whose statics REFERENCE the named bindings (single impl). The module
imports `formatBytes` from `../CtByteUtil.mjs` (the former `./CtByteUtil.mjs` import of
`checkImageLimits.mjs`, path adjusted for `image/`). `image/CtDither.mjs` now imports `clampByte` from
`./CtImageUtil.mjs`. Equivalence: old vs new value-parity harness (132,084 cases over colour values,
every FORMATS key, size/pixel/dimension boundaries incl. formatBytes message strings, rect geometry and
hit-tests), also checked against the class statics and the vendored copy — 0 mismatches. Consumers:
social-card-maker, image-converter, image-cropper, srcset-builder, dither-studio. Notes: PROVENANCE sections
above for `color.mjs`/`canvasFormats.mjs`/`checkImageLimits.mjs`/`rectGizmo.mjs` are historical; those
files no longer exist. util.js image helpers are carved separately (R6b).

## `util.js` image helpers -> `image/CtImageUtil.mjs` (2026-10-01)

Train 35 · R6b (jbc ES6 modularization, Set 2 — behavior-preserving, NOT byte-identical).
`loadImageFile`, `canvasToBlob`, `canvasToPngBytes` carved out of `util.js` (defs, `jbcUtil` export-object
entries and header doc-comment removed) and appended, bodies verbatim (modulo the 2-space IIFE dedent), as a
titled section of `image/CtImageUtil.mjs` (named exports + `CtImageUtil` statics). No util.js back-import:
`canvasToPngBytes` -> `canvasToBlob` stays inside the moved group and no other util.js function used them.
New sha1s: `util.js` `dc7d9a34...`, `image/CtImageUtil.mjs` `795b4b4f...`. Callers: favicon-kit, srcset-builder,
apng-maker now `import` from `image/CtImageUtil.mjs` (the `jbcUtil.<helper>` accessors no longer exist).
`getRandomBytes` and the remaining util.js functions are untouched (getRandomBytes deferred to R12).

## `copy.js` -> `components/CtClipboardUtil.mjs` (2026-10-01)

`copy.js` retired (IIFE, `window.jbcCopy`/`window.jbcFlash` + `window.jbcCopyStyles` opt-out). New
`components/CtClipboardUtil.mjs` (sha1 `18eac35c...`): named exports `copy` (ex-jbcCopy) + `flash` (ex-jbcFlash),
bodies ported verbatim (2-space IIFE dedent; the `window.x = function` assignments became `export function`; the
pasted-twice idempotency guard dropped — modules evaluate once). `ensureStyles` (CSS self-inject on first `flash()`,
`ctc-copy-style`) and the `window.jbcCopyStyles === false` opt-out preserved. `export class CtClipboardUtil`
aggregator (statics REFERENCE the named bindings). `util.js` `wireCopyButtons` no longer reads the ct window globals/
`ctFlash` (a pre-existing mismatch with this file's ct-named copy.js): it takes `opts.copy`/`opts.flash`. New
sha1: `util.js` `086deea8...`. Equivalence harness: round 09-set2-r7-ctclipboardutil `tmp/builder-r1/prove-identity.mjs`.

## `modal.js` -> `components/CtModal.mjs` (2026-10-01)

`modal.js` retired (IIFE, `window.jbcModal` + `window.jbcModalStyles` opt-out). New `components/CtModal.mjs`
(sha1 `981ccc58...`): named export `createModal` (ex-jbcModal), body ported verbatim (2-space IIFE dedent; the
`window.jbcModal = function` assignment became `export function`; the pasted-twice idempotency guard dropped —
modules evaluate once). `ensureModalStyles` (renamed from ensureStyles + STYLE_ID->MODAL_STYLE_ID to avoid a flatten collision; CSS self-inject on first `createModal()`, `jbcm-style`), the
`window.jbcModalStyles === false` opt-out, focus-trap / Esc / backdrop-close / aria-modal / role=dialog /
focus-restore / fullscreen-safe re-parenting / `autoOpen` all preserved. `export class CtModal` aggregator
(`static create = createModal`). Equivalence harness: claude-tools-dev round 10-set2-r8-jbcmodal
`tmp/builder-r1/prove-identity.mjs`.

## `confirm.js` -> `components/CtConfirm.mjs` (2026-10-01)

`confirm.js` retired (IIFE, `window.jbcConfirm` + `window.jbcConfirmStyles` opt-out). New `components/CtConfirm.mjs`
(sha1 `29061870...`): named export `confirmDialog` (ex-jbcConfirm; deliberately NOT `confirm` so it never shadows
`window.confirm`), body ported verbatim (2-space IIFE dedent; `window.jbcConfirm = function` became `export function`;
the pasted-twice idempotency guard dropped). `ensureConfirmStyles` + `CONFIRM_STYLE_ID` (renamed from
ensureStyles/STYLE_ID to avoid a flatten collision with CtClipboardUtil; CSS self-inject on first call, id
`ctc-style` unchanged), the `window.jbcConfirmStyles === false` opt-out, role=dialog / aria-modal / aria-labelledby /
Enter-Esc-backdrop / focus-trap / focus-restore all preserved. `export class CtConfirm` aggregator
(`static confirm = confirmDialog`). Equivalence harness: claude-tools-dev round 11-set2-r9-ctconfirm
`tmp/builder-r1/prove-identity.mjs`.

## `license.js` -> `components/CtLicense.mjs` (2026-10-01)

`license.js` retired (IIFE; `window.jbcLicense` API + `window.__jbcLicenseInit` idempotency global; inlined into every page by a
nested include token in `components/footer.html`). New `components/CtLicense.mjs` (sha1 `dff3fde7...`): named export `openLicense`
(ex the `open` fn behind `window.jbcLicense`) + `export class CtLicense { static open = openLicense }`; body ported verbatim (2-space
dedent; init guard + API global dropped). SELF-WIRING preserved: importing the module attaches (once; module-level
`licenseTriggerWired` guard) the document click listener that opens the modal on any `[data-ct-license]` trigger. `window.jbcThirdParty`
(per-tool DATA config of bundled deps) is still read at open time. Module-private names carry a "License" qualifier
(`licenseOverlay`, `escapeLicenseHtml`, `openLicense`, `closeLicense`, `LICENSE_MIT_TEXT`, ...) so import-flattening cannot collide with
an app.mjs top-level. `jbcl-*` CSS self-inject-on-first-open, role=dialog/aria-modal/focus-trap/Esc/backdrop/focus-restore/fullscreen
re-parenting unchanged. `components/footer.html` drops its nested `<<jbc:include license.js>>` script; each footer-carrying tool imports the
module from its app.mjs. Equivalence harness: claude-tools-dev round 12-set2-r10-jbclicense `tmp/builder-r1/prove-identity.mjs`.

## `util.js` UI helpers -> `components/CtComponents.mjs` (2026-10-01)

The 8 UI-wiring helpers (`iconButton`, `wireSegmented`, `wireTabs`, `wireDropzone`, `showError` [impl `showBanner`], `announce`,
`wireCopyButtons`, `wireEditableCopy`) left `util.js` and live in the new ES module `components/CtComponents.mjs` as named exports +
`export class CtComponents` (statics reference the named exports). Bodies are moved verbatim (dedent only); the module is self-contained
(no jbcUtil dependency). `wireCopyButtons(root, opts)` keeps the R7 `opts.copy`/`opts.flash` signature (callers pass CtClipboardUtil's
`copy`/`flash`). `util.js` keeps only `showBanner`/`hideBanner` privately for the residual `showWarning`/`hideError`/`hideWarning`;
the rest of the residual (debounce/el/clamp/num/downloadBlob/getRandomBytes/...) is R12's. Consumers import the helpers by name and no longer
read `jbcUtil.<helper>` for these eight. `components/styles/widgets.css` comments now point at CtComponents. Equivalence harness: claude-tools-dev
round 13-set2-r11-ctcomponents `tmp/builder-r1/prove-equivalence.mjs`.

## `util.js` -> `CtUtil.mjs` (+ posAt/slugify/wrapText absorbed; getRandomBytes -> CtByteUtil; banner trio -> CtComponents) (2026-10-01)

`util.js` (the classic-script `window.jbcUtil` IIFE, the last paste-in global) is retired; so are `posAt.mjs`, `slugify.mjs`, `wrapText.mjs`.
New ES module `CtUtil.mjs` (named exports + `export class CtUtil`, import-free): downloadBlob, debounce, formatBytesCompact, clamp, num, clampInt,
escapeHtmlBasic/escapeAttrBasic/escapeXmlBasic, persistState, onceFlag, el, prefersReducedMotion, restartAnimation, setupHiDPICanvas, posAt, slugify, wrapText
(bodies verbatim; 2-space IIFE dedent only). The aggregator keeps the legacy names (`CtUtil.formatBytes`, `CtUtil.escapeHtml`, ...). Four exports are renamed
because the single-file build flattens every imported module into one script (no tree-shaking), so a same-named top-level function in two modules is a duplicate
declaration: `formatBytes` (vs `CtByteUtil.formatBytes`, a distinct helper) and `escapeHtml/escapeAttr/escapeXml` (vs `CtMarkdown` / `CtEscaper`).
`getRandomBytes` + `makeId` moved to `CtByteUtil.mjs` (named exports + aggregator statics); the banner trio (`showWarning`, `hideError`, `hideWarning`) plus
`showBanner`/`hideBanner` moved to `components/CtComponents.mjs` beside `showError`. Equivalence harness: claude-tools-dev round
14-set2-r12-jbcutil-final `tmp/builder-r1/prove-equivalence.mjs`.

## API-naming cleanup — one owner per bare top-level name (R16, 2026-10-01)

Reverses R12's flatten-forced suffixes. `CtUtil`: `formatBytesCompact` (+ static `formatBytes`) removed — use `CtByteUtil.formatBytes(bytes, opts)` (spaced, capital `B`, 1 decimal);
`escapeHtmlBasic` -> `escapeHtml`; `escapeAttrBasic` -> `escapeAttr`; `escapeXmlBasic` (+ static) removed. `CtMarkdown`: `escapeHtml`/`escapeAttr` -> `escapeHtmlForMarkdown`/`escapeAttrForMarkdown`.
`CtEscaper.escapeXml(text, strict = false)` is the canonical XML escaper (null/undefined pass through; non-strings coerced, or TypeError when strict). `makeId` unchanged in `CtByteUtil`.
Harness: claude-tools-dev round 16-api-naming-cleanup `tmp/builder-r1/prove-equivalence.mjs`.

---

## `CtZipUtil.mjs` — STORE-only ZIP writer promoted (2026-10-01)

NEW dedicated module (a sibling of `CtByteUtil.mjs`, not a section inside it). Exports `storeZip(files)` (`files: [{ name, bytes }]` -> `Uint8Array`; deterministic, zero DOS date/time, STORE method 0) plus the little-endian DataView writers `u16le` / `u32le`; imports `crc32` from `./CtByteUtil.mjs`.
Lifted VERBATIM from `claude-tools-dev/src/tools/favicon-kit/source/logic.mjs` — the byte-identical copy that favicon-kit, srcset-builder and sprite-packer each carried. All three now import it; `u16le`/`u32le` are exported because favicon-kit's ICO container writer also uses them.
Born identical in canonical and the claude-tools-dev vendored mirror (`divergence: []`). Tests: each consumer's `tests/unit/zip.test.mjs` (`crc32("123456789") == 0xCBF43926`, PK signatures, EOCD).
