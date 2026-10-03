# jbc-include-old vs. new utils/ + components/ — dropped-code check (for #1008)

Scope: `src/lib/jbc-include-old/` (10 files) vs `src/lib/utils/` and `src/lib/components/`.
Report only; no code changed.

## TL;DR

- **No behavior is dropped from the old JS.** Every function in confirm/copy/crc32/license/util has a counterpart.
- **Every old CSS rule survives**, but all selectors and variables were **renamed `ct-` to `jbc-`**. The ported tools, their tests and `source/styles.css` still use the old names. This is the biggest port cost.
- **Every old JS global was removed.** `ctConfirm`, `ctCopy`, `ctFlash`, `ctLicense`, `jbcCrc32`, `jbcUtil` and `ctThirdParty` no longer exist as globals. The new files are ESM with named exports, and `build-tool.mjs` has **no import-inlining** yet. This is the second big risk.
- **One real behavior change:** `formatBytes`. The old compact `jbcUtil.formatBytes` (`"678b"`, `"1.50KB"`, TB tier) was deliberately removed. It is reproducible only by passing options (see 2d).
- **One wiring gap:** the new `footer.html` no longer carries the `<script>` that inlined `license.js`.

## 1. File-by-file mapping

| Old file | New counterpart | Verdict |
|---|---|---|
| `base.css` | `components/styles/base.css` | Identical rules. Only the banner comment text and sentinels changed (`ct-base` to `jbc-base`). |
| `controls.css` | `components/styles/controls.css` | Same rules. Classes renamed `.ct-field`, `.ct-field--multiline`, `.ct-copy-btn` to `.jbc-*`. |
| `gallery.css` | `components/styles/gallery.css` | Identical rules. Comments and sentinels only. |
| `footer.html` | `components/footer.html` | Classes renamed `ct-footer*` to `jbc-footer*` and the license trigger `data-ct-license` to `data-jbc-license`. Hardcoded repo, name and label became `{{project.name/repo/repoLabel}}` tokens. The tagline in the footer HTML is unchanged. **The trailing `<script><<ct:include license.js>></script>` was removed.** |
| `readme-footer.md` | `components/readme-footer.md` | Hardcoded claude-tools text and URLs became `{{project.name}}`, `{{project.repo}}` and `{{project.tagline}}` tokens. Same content once tokens are substituted. |
| `confirm.js` | `components/JbcConfirm.mjs` | Same logic (Escape, Tab trap, mousedown-outside, focus restore, self-injected styles). Renames in 2a. |
| `copy.js` | `components/JbcClipboardUtil.mjs` | `copy` and `flash`, bodies unchanged apart from renames. |
| `crc32.js` | `utils/JbcByteUtil.mjs` (`crc32`, `crc32Hex`) | Same reflected 0xedb88320 CRC-32. PROVENANCE says it was proven bit-identical. |
| `util.js` | `utils/JbcUtil.mjs` (`downloadBlob`, `debounce`) and `utils/JbcByteUtil.mjs` (`formatBytes`) | `formatBytes` changed behavior, see 2d. |
| `license.js` | `components/JbcLicense.mjs` | Same modal. Global entry points removed, see 2c. |

## 2. Per-pair detail

### 2a. confirm.js to JbcConfirm.mjs
- API: global `window.ctConfirm(msg)` is now the named export `confirmDialog(msg)`, also `JbcConfirm.confirm`. The name deliberately avoids shadowing `window.confirm`.
- Renames:
  - CSS classes `.ctc-*` to `.jbcc-*`.
  - Custom properties `--ctc-*` to `--jbcc-*` (accent, accent-fg, bg, fg, backdrop, radius, btn-radius, shadow, font, cancel-border, focus, max-width).
  - Style element id `ctc-style` to `jbcc-style`.
  - Opt-out flag `window.ctConfirmStyles` to `window.jbcConfirmStyles`.
- The idempotency guard (`if (window.ctConfirm) return`) is gone, which is natural for a module. Behavior is otherwise kept.

### 2b. copy.js to JbcClipboardUtil.mjs
- `window.ctCopy(text)` becomes `copy(text)`, and `window.ctFlash(el, opts)` becomes `flash(el, opts)`. Both are also static on `JbcClipboardUtil`.
- `.ctc-flash` becomes `.jbcc-flash`. This now shares the `jbcc-` prefix with JbcConfirm. It is harmless, but note it.
- Opt-out `window.ctCopyStyles` becomes `window.jbcCopyStyles`.
- Clipboard API first, then the hidden-textarea `execCommand` fallback, is kept. It always resolves.

### 2c. license.js to JbcLicense.mjs
- Kept:
  - The MIT text.
  - The third-party table.
  - Focus trap and Escape handling.
  - Fullscreen-safe host (`document.fullscreenElement`).
  - A delegated click handler on the trigger attribute, self-wired on module evaluation.
- Renames:
  - `[data-ct-license]` to `[data-jbc-license]`.
  - `window.ctThirdParty` to `window.jbcThirdParty` (read at open time).
  - CSS classes `.ctl-*` to `.jbcl-*`.
- **Dropped:** the global `window.ctLicense()` opener. It is replaced by the named export `openLicense()` and `JbcLicense.open`. Any caller that used `window.ctLicense()` needs updating. Existing e2e tests reference `ctLicense` (inflation-calculator, qr-generator and uuid-generator).
- **Wiring caveat:** the old `footer.html` inlined `license.js` itself, so every tool got the modal for free. The new `footer.html` has no script. A tool must now import or inline `JbcLicense.mjs` explicitly, or the footer License button does nothing. This is easy to miss.

### 2d. util.js to JbcUtil.mjs and JbcByteUtil.mjs
- `downloadBlob(data, filename, mime)` and `debounce(fn, ms)` are identical. They are now named exports and statics on `JbcUtil`. `window.jbcUtil` is gone.
- **`formatBytes` is a behavior change.** The old version returned `"678b"` below 1 KB, then `"1.50KB"` (2 decimals, no space, TB tier at 1 decimal). The new `JbcByteUtil.formatBytes` returns `"678 B"` and `"1.5 KB"` by default (1 decimal, space, capped at GB). It is deliberately gone from JbcUtil (PROVENANCE "R16"). The old output can be reproduced with `{ space:false, byteUnit:'b', decimals:2, units:['KB','MB','GB','TB'] }`, with one caveat. The old version used 1 decimal for TB, so use `decimals: v => ...` there if exact parity matters. The old version also had no `invalid` path and coerced non-finite input to `"0b"`. Tests or UI strings that expect `"…b"` or `"…KB"` with no space will break unless options are passed.
- Neither `util.js` nor the other 4 old JS files is an exact "pre-module of the same file" for the whole of the new module. JbcUtil and JbcByteUtil are supersets that merge many other jason-code modules.

### 2e. crc32.js to JbcByteUtil.crc32
- `window.jbcCrc32(bytes)` becomes `crc32(bytes)` (also `JbcByteUtil.crc32`). The algorithm is identical.
- It now returns the same unsigned uint32. `crc32Hex` is a new bonus.
- Only qr-generator and color-designer consume it today, via `const crc32 = jbcCrc32;` in `app.mjs`.

## 3. LOUD FLAGS: dropped, renamed or changed

1. **Global names removed.** None of these has a runtime shim:
   `window.ctConfirm`, `ctCopy`, `ctFlash`, `ctLicense`, `jbcCrc32`, `jbcUtil` (and `.downloadBlob`, `.debounce`, `.formatBytes`), `ctThirdParty`, and the opt-out flags `ctConfirmStyles`, `ctCopyStyles`.
2. **Compact `jbcUtil.formatBytes` is gone.** Options-only parity, see 2d.
3. **CSS and attribute prefix rename `ct-` to `jbc-`.** These need rewriting in every tool's `source/` and in the Playwright tests:

   | Old | New |
   |---|---|
   | `.ct-field`, `.ct-field--multiline`, `.ct-copy-btn` | `.jbc-field`, `.jbc-field--multiline`, `.jbc-copy-btn` |
   | `.ct-footer*` | `.jbc-footer*` |
   | `.ctc-*` | `.jbcc-*` |
   | `.ctl-*` | `.jbcl-*` |
   | `--ctc-*` | `--jbcc-*` |
   | `data-ct-license` | `data-jbc-license` |
   | `ct-base`, `ct-controls`, `ct-gallery` sentinels | `jbc-*` sentinels |

   Rough footprint across `src/tools` (files, excluding generated `index.html`): `ct-copy-btn` 28 source and 37 test files; `ct-field` 27 and 36; `ctc-` 23 and 50; `ctConfirm` 28 and 34; `ctCopy` and `ctFlash` 12-14 and 21-23; `ct-footer` 4 and 13; `data-ct-license` 0 and 9; `ctLicense` 5 and 14.
4. **Footer no longer inlines the license script.** See 2c.
5. **License and confirm idempotency guards removed.** These were pasted-twice protections, and an ES module is evaluated once, so this is fine.
6. **Comment refs in new controls.css point to `jbc:include` and `web-craft.md`.** These are cosmetic but stale: `jbc:include` is not a token the build recognizes (the build only handles `ct:`).
7. **Provenance and docs references to the old paths remain.** The new module headers mention `jbc-include/components/...` paths. Those paths no longer exist in this repo (see section 5).

I found no old function, CSS rule or include with zero counterpart. Everything old has a renamed or re-shaped equivalent, with the exceptions flagged above (globals, `formatBytes` shape, footer script wiring).

## 4. Net-new in the new library (no old equivalent)

- `components/styles/widgets.css`: `.jbc-checkerboard` plus segmented, tabs and dropzone styles. Its header still says "claude-tools shared ... `ct:include widgets.css`".
- `components/JbcComponents.mjs`: `iconButton`, `wireSegmented`, `wireTabs`, `wireDropzone`, `showBanner`/`showError`/`showWarning`/`hideError`, `announce`, `wireCopyButtons`, `wireEditableCopy`.
- `components/JbcModal.mjs`: `createModal` (generic modal factory; opt-out `window.jbcModalStyles`).
- `utils/JbcUtil.mjs` extras: `clamp`, `num`, `clampInt`, `escapeHtml`, `escapeAttr`, `persistState`, `onceFlag`, `el`, `prefersReducedMotion`, `restartAnimation`, `setupHiDPICanvas`, `posAt`, `slugify`, `wrapText`.
- `utils/JbcByteUtil.mjs` extras: base64/hex/UTF-8 converters, `md5`, `sha1`, `sha256`, `sha512`, `hmac`, `getRandomBytes`, `makeId`.
- `utils/JbcDateTimeUtil.mjs`, `utils/JbcZipUtil.mjs`.
- `utils/formats/`: JbcCurl, JbcDiff, JbcEscaper, JbcFormat, JbcMarkdown, JbcPretty.
- `utils/image/`: JbcCanvasCapture, JbcDither, JbcImagesToPdf, JbcImageUtil, JbcVideoGif.
- `utils/PROVENANCE.md` (1076 lines) records the origin of each consolidation. It documents the old `jbcUtil` set as formerly 19, 16 and 15 call sites.

## 5. Reconciliation recommendation for #1008

### The build problem
`scripts/build-tool.mjs`:
- `INCLUDE_DIR` is a single flat dir, `src/lib/jbc-include-old`.
- `TOKEN_RE = /<<ct:(include|inline) ([\w.-]+)>>/g`, with names matched as a single basename (`[\w.-]+`, so no slashes).
- It does **not** process `import`/`export`. The new module headers say "the single-file build inlines this module body into the shipped index.html, stripping `export`"; that capability was not carried into this repo's `build-tool.mjs`.

### Include-name resolution

Pick one and apply it consistently. Recommended: **keep `<<ct:include NAME>>` as the front end and let the resolver search several dirs by basename.**

| Old include | New file | Notes |
|---|---|---|
| `base.css` | `components/styles/base.css` | Direct. |
| `controls.css` | `components/styles/controls.css` | Direct. |
| `gallery.css` | `components/styles/gallery.css` | Direct. |
| (new) `widgets.css` | `components/styles/widgets.css` | Optional. |
| `footer.html` | `components/footer.html` | Direct, but needs `{{project.*}}` substitution (already supported by the build) and a separate license include. |
| `readme-footer.md` | `components/readme-footer.md` | Same token substitution. |
| `confirm.js` | `components/JbcConfirm.mjs` | Module. |
| `copy.js` | `components/JbcClipboardUtil.mjs` | Module. |
| `license.js` | `components/JbcLicense.mjs` | Module. |
| `util.js` | `utils/JbcUtil.mjs` (+ `utils/JbcByteUtil.mjs` for `formatBytes`) | Module. |
| `crc32.js` | `utils/JbcByteUtil.mjs` | Module (superset of crc32). |

Options for the resolver:
- **(a) Multi-dir search by basename** over `components/styles`, `components`, `utils`, `utils/formats` and `utils/image`. Names are unique today. Smallest change, but a name collision is possible later. Fail loudly on duplicates.
- **(b) Allow a relative path in the token** (extend the regex to `[\w./-]+`, for example `<<ct:include components/styles/base.css>>`). Explicit and unambiguous. Prefer this if it is feasible.

### The ESM vs. global problem
The tools currently inline plain `<script>` globals before the module script. Three ways to bridge the gap:

1. **Add import inlining to `build-tool.mjs`** (matches what the new module headers assume).
   - A tool's `app.mjs` writes `import { copy, flash } from '.../JbcClipboardUtil.mjs'`.
   - The build resolves the specifier, inlines the module body into the single `<script type="module">`, strips `export`, hoists each dependency once, and handles name collisions across modules.
   - This is the cleanest long-term and keeps `node --test` working for `logic.mjs`.
   - Cost: real build work. `scripts/build-tool.mjs` was only just reconciled and has no import handling yet. A stale-check (`--check`) must stay deterministic.
   - Watch the `JbcByteUtil.mjs` module in particular. It is 585 lines, and an inlined whole-module copy grows each tool's size unless the build tree-shakes.
   - Also watch for `window.*` side effects (JbcLicense self-wires on evaluation).
2. **Global shim.** Keep the `<script>` inlining but add a thin shim file (for example `components/globals-shim.js`) that imports the modules and assigns the old globals (`window.ctConfirm = confirmDialog`, etc.).
   - It still needs a module bundling step, because inlined classic scripts cannot `import`.
   - Faster, but it keeps the dead global names and defeats the point of the port. At most use this for a transitional step.
3. **Mechanical rewrite** of each tool's `source/*.mjs` to use named imports, plus a build step (1). This is the real port.

Recommendation: do (1) plus (3), and do not ship a shim. Sequence the port in this order:
1. Teach the build to inline ES imports (or choose a bundler) and add a basename or path resolver. Add a `--check` test for it.
2. Add `ct-` to `jbc-` rename codemods for CSS, HTML, JS and Playwright tests (see section 3 table). Do the rename in one tool first (a small one such as `base64-tool`) and verify e2e 9/9 and `build:check`.
3. Replace the 5 `jbcUtil` consumers, the 16 `ctCopy`/`ctFlash` consumers and the 2 `jbcCrc32` consumers.
4. Decide the `formatBytes` shape per tool: pass options for parity, or update expected UI strings in the tests.
5. Add an explicit `JbcLicense` import to every tool that carries the footer. This replaces the footer's former script block.
6. Update `window.ctThirdParty` to `window.jbcThirdParty` (inflation-calculator and others that set it), and `window.ctLicense` callers to `openLicense`.
7. Only then repoint the build's include dir to the new dirs and delete `jbc-include-old/`.

### Safety net before deleting `jbc-include-old/`
- Confirm no tool source still contains `ct-`, `ctc-`, `ctl-`, `ctConfirm`, `ctCopy`, `ctFlash`, `ctLicense`, `ctThirdParty`, `data-ct-license`, `jbcUtil.`, `jbcCrc32`: `grep -rE` over `src/tools` excluding generated `index.html`.
- Run the full e2e suite (9/9) and `build:check` across all tools.
- Also update docs and comments that name the old paths (PLAN/DESIGN/TESTS in color-converter, color-designer, qr-generator and others).
