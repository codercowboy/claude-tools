# `test-support/` — provenance

These dev/test-only ESM helpers are the canonical copies, **consolidated up**
out of claude-tools. They are distilled from the inline test idioms that all
**43 tools** re-rolled — no shared test helper existed there before this pass;
the only per-tool "shared" file, `tests/unit/_helpers.mjs`, was itself
copy-pasted per tool with a near-identical `loadLogic()` core.

Source repo: **claude-tools** (`https://github.com/codercowboy/claude-tools`,
not published). Candidate numbers (`#NN`) reference that repo's
`tmp/promotion-search-20260915/candidates-tests.md`. Each helper below is born
byte-identical here and in `claude-tools/src/tools/test-support/` (divergence:
none).

Consolidated from the inline idioms in all 43 tools' test suites:
`annotator`, `apng-maker`, `ascii-art`, `audio-converter`, `base64-tool`,
`color-converter`, `color-designer`, `color-picker`, `cron-builder`,
`curl-tool`, `dev-converter`, `diff-viewer`, `dither-studio`, `escaper`,
`favicon-kit`, `format-converter`, `hasher`, `hat-picker`, `image-converter`,
`image-cropper`, `image-metadata`, `images-to-pdf`, `inflation-calculator`,
`js-api-tester`, `json-explorer`, `json-schema-tool`, `jwt-decoder`,
`markdown-previewer`, `meme-maker`, `network-toolkit`, `pretty-printer`,
`qr-generator`, `regex-tester`, `rest-tester`, `social-card-maker`,
`sprite-packer`, `srcset-builder`, `stego`, `text-toolkit`, `timezone-planner`,
`url-tool`, `uuid-generator`, `video-gif`
(each under `claude-tools/src/tools/<name>/tests/`).

## Helpers

### `setup.mjs`

- `toolUrl(import.meta.url)` — **#1** (43 tools). The byte-identical `__dirname`
  + `pathToFileURL(resolve(__dirname, '../index.html')).href` preamble in every
  `*.e2e.mjs`.
- `helpSeenKey(toolName)` — derives the `` `${toolName}:help-seen:v1` `` key that
  each suite hardcoded (travels with #3).
- `seedHelpSeen(page, key)` — **#3** (43 tools). The
  `addInitScript((k)=>{try{localStorage.setItem(k,'1')}catch{}}, KEY)` that
  suppresses the first-load Help popup, universal in every `beforeEach`.

### `unit.mjs`

- `loadLogic(import.meta.url)` — **#4** (43 tools). The memoized dynamic import
  of `../../source/logic.mjs` that was the copy-pasted core of every tool's
  `tests/unit/_helpers.mjs` (only the exported name varied — `loadHasher`,
  `loadColorConverter`, `loadBase64Tool`, …).

### `shared-ui.mjs`

- `assertLicenseModal(page)` — **#2** (43 tools). All three extractors flagged
  the footer License-modal suite as the single strongest candidate; the describe
  block was essentially identical across tools (open via `footer-license-link`,
  assert `license-modal` visible with MIT text, ✕ focused, Esc/backdrop close,
  focus return). Asserts the shared inlined `footer.html` + `license.js`.

### `playwright.base.config.mjs`

- base `defineConfig` — **#5** (43 tools). Identical `defineConfig` (testDir
  `.`, `testMatch '**/*.e2e.mjs'`, `fullyParallel`, `reporter: 'list'`, clipboard
  `use.permissions`) except a header comment; outliers a tool still overrides on
  extend (`color-designer` `retries: 1`; `qr-generator`
  `workers: 1, timeout: 30000, fullyParallel: false`; the clipboard-less tools).

### `interaction.mjs` (train 01, 2026-09-28)

Interaction / lifecycle helpers, promoted from candidates-tests #6, #7, #10,
#12, #18, #19. Source repo **claude-tools-dev** (the working copy of claude-tools),
consolidated from the ad-hoc copies in `src/tools/<name>/tests/<name>.e2e.mjs`
of: `hat-picker` (help modal a11y / first-load auto-show), `json-explorer`
(help modal a11y, `window.__jsonExplorer` shape + `waitForFunction` ready poll,
`ctConfirm` Clear dialog, `pageerror` guard), `rest-tester` (`pageerror` guard),
`meme-maker`, `image-converter`, `ascii-art`, `pretty-printer` (`.ctc-dialog`
confirm assertions). Dependency-free; unit-covered here by
`tests/interaction.test.mjs` (fake page/locator objects) and exercised for real
in the consumer tools' Playwright suites.

- `waitForToolReady(page, ns, {prop='state', timeout})` — **#18**.
- `trackPageErrors(page)` -> `{errors, assertNone()}` — **#19**.
- `assertHookShape(page, ns, keys)` / `driveHook(page, ns, method, ...args)` — **#7**.
- `assertModalA11y(page, {trigger, overlay, modal, closeX, labelledBy})` — **#6**
  (defaults target the shared Help modal; testids overridable).
- `assertHelpAutoShows(browser, url, {overlay, modal, closeX, text})` — **#10**.
- `assertConfirmDialog(page, {open, text, action})` — **#12**; asserts the inlined
  `JbcConfirm` (`.jbcc-overlay .jbcc-dialog`, `.jbcc-btn--yes/--cancel`) (selectors moved from `.ctc-*` in the jbc ES6 modularization, 2026-09-30).
- `assertDropDispatch(page, {selector, dragClass, fileCount, fileName, mime, b64})`, `TINY_PNG_B64`,
  `assertRovingTabs(page, {tabs, horizontal})` — **promoted 2026-10-01 (jbc-es6-modularize R13)** from
  claude-tools-dev's repo-local additions (2026-09-30): the drop-path contract for `JbcComponents.wireDropzone`
  and the APG tablist kbnav contract for `wireTabs`. Browser-exercised in the consumer suites; fake-page unit
  coverage in `tests/interaction.test.mjs`.

### `files.mjs` + `binary.mjs` (train 02, 2026-09-28)

File / download / binary-fixture helpers, promoted from candidates-tests #13-#16,
#22, #23. Source repo **claude-tools-dev**, consolidated from the ad-hoc copies in
`src/tools/<name>/tests/<name>.e2e.mjs` of: `sprite-packer`, `srcset-builder`,
`stego`, `ascii-art`, `favicon-kit`, `image-converter`, `meme-maker` (`crc32` /
`pngChunk` / `makePng`; `u16le`/`u32le`/ZIP local-header walks), `social-card-maker`
(`canvasSignature`, `readDownloadBytes`), `image-cropper` / `image-metadata` /
`apng-maker` / `dither-studio` (download + upload idioms). Dependency-free
(`node:fs`, `node:zlib`); unit-covered by `tests/files-binary.test.mjs`.

- `files.mjs`: `captureDownload(page, triggerFn)` **#13**; `readDownloadBytes(download)`,
  `downloadBytes(...)`, `MAGIC`/`PNG_SIGNATURE`, `sniffType`, `expectMagic` **#14**;
  `uploadFile(page, testidOrLocator, {name,mimeType,buffer})` **#15**;
  `canvasSignature(page, selector)`, `canvasPixels`, `countChangedPixels(a,b)` **#23**.
- `binary.mjs`: `crc32`/`refCrc32`, `pngChunk`, `makePng(w,h,rgbaOrPaintFn)`,
  `noisePaint`, `TINY_PNG_BUFFER` **#16**; `u16le`/`u32le`/`ascii`, `readStoreZip`
  (EOCD -> central -> local; stored + deflated) **#22**. Pure and standalone so
  verifiers can trust it as an independent reader.

## Not consolidated (yet)

Higher-value but out of this pass (see `candidates-tests.md` #6–#30): the
persistence round-trip + `settleStorage` (#8), `expectNoOverflow` (#9), and the
watch-tier helpers. (Download/upload I/O #13–#15 and the fixture factory #16
landed in train 02.) Promote as later consumers land.

### storage.mjs + layout.mjs + clipboard.mjs (train 03, 2026-09-28)

Storage / layout / clipboard e2e helpers, promoted from candidates-tests #8, #9,
#11, #17, #20, #21 (and the reusable slice of #24). Source repo
**claude-tools-dev**, consolidated from the ad-hoc copies in
`src/tools/<name>/tests/<name>.e2e.mjs` of: `hasher`, `stego`, `jwt-decoder`,
`rest-tester` (secret-absence localStorage dump-and-scan; `localStorage`-throws
init scripts), `json-explorer` (Storage.prototype throws), `annotator`,
`apng-maker`, `ascii-art`, `dither-studio`, `favicon-kit`, `images-to-pdf`,
`diff-viewer` (scrollWidth vs innerWidth at 375 / 1400), `hasher`, `dev-converter`,
`escaper`, `curl-tool` (scrollWidth vs clientWidth), `dev-converter`, `hat-picker`,
`hasher` (clipboard stub / best-effort read / copy flash). Dependency-free;
unit-covered by `tests/storage-layout-clipboard.test.mjs`.

- `storage.mjs`: `dumpStorage`, `readStored`, `settleStorage(page,key,{predicate})` **#8**
  (poll replaces the fixed ~400ms file:// settle), `persistRoundTrip`, `assertOnlyKeys`,
  `assertLacksKeys`; `breakStorage(page,{mode:'methods'|'access'|'quota'})` **#20**;
  `assertNotPersisted(page, secret|secrets, {allowKeys})` **#21** (scans local + session
  storage keys/values and the URL).
- `layout.mjs`: `VIEWPORTS` (mobile 375 / narrow 380 / tablet / wide 1400 / ultrawide 1700)
  **#11**, `resolveViewport`, `setViewport`, `measureOverflow`, `expectNoOverflow(page,{viewport,tolerance})` **#9**.
- `clipboard.mjs`: `stubClipboard`, `readClipboard`, `expectCopyFlash(btn,{flash,revert})` **#17**.
- **#24 watch-tier NOT promoted**: `mulberry32` / `setNativeInput` / `dragOnCanvas` /
  control-height assert have no second consumer in claude-tools-dev today, and
  reduced-motion emulation is a one-line `page.emulateMedia` (single consumer,
  hat-picker). Promote when a second tool needs them.

### files.mjs uploadFile widening (adoption sweep 1000d r2, 2026-09-28)

`uploadFile(page, input, files)` now accepts a single `{name,mimeType,buffer}`, an array of
them (multi-file inputs, e.g. apng-maker frames) or filesystem path(s) (stego suspect input).
Backward compatible. Unit-covered in `tests/files-binary.test.mjs`.
