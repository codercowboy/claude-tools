# social-card-maker — tests

Two layers, both required (`npm test` runs `build:check` → unit → e2e).

## Unit (`node --test tests/unit/*.test.mjs`)

Pure, DOM-free logic imported straight from `../../source/logic.mjs` — no browser.
Anything needing text measurement takes an injected `measure(str) => number`, so a
deterministic monospace stub makes word-wrap geometry exact.

- **`format-fonts.test.mjs`** — `FORMATS` (png/jpeg/webp mime/ext/lossy, no AVIF);
  `mimeForFormat` + `formatSupportsQuality` case-insensitive defaults;
  `clampQuality` bounds + default fallback; `percentToQuality`/`qualityToPercent`
  convert and round-trip; `clamp`/`num` guards; `formatBytes` B/KB/MB/GB;
  `CURATED_FONTS`/`CURATED_BY_NAME` shape; `resolveFontFamily` (curated stack,
  System-UI fallback, custom-family quoting + override); `canvasFontString`
  `"<weight> <size>px <stack>"` with weight/size clamping.
- **`text.test.mjs`** — `wrapText` greedy word-wrap at a width, multi-word packing,
  an over-wide word kept whole on its own line, explicit `\n` hard breaks (incl.
  blank lines), combined hard+soft wrapping, always ≥1 line, non-positive width
  never wraps. `hexOk` (#rgb/#rrggbb, case, trim; rejects junk/non-strings);
  `escapeAttrNullSafe` (`& < > "`, ampersand-first, single-quote left intact, null→"");
  `slugify` (lowercase, quote-strip, hyphenation, trim, 60-cap, empty→"");
  `outputFilename` (slug + ext, fallbacks).
- **`geometry.test.mjs`** — `gradientLineCoords` endpoint geometry for 0/90/180/270/
  45° (CSS convention: 0°=up, 90°=right), center-symmetry, angle normalization
  (mod 360, negatives). `coverRect` center-crop cover fit (wider/taller/equal
  aspect, OG→story). `scaleLogoBox` aspect-preserving height scale. `PRESETS`/
  `presetByKey` sizes + fallback; `clampSize` rounds + bounds to
  `[MIN_SIDE, MAX_SIDE]`. `composeLayout` (the core math): content box, text anchor
  + `textAlign`, logo rect + gap, per-line top-left draw positions for centered/
  middle, top/left+logo, bottom/right, zero-height-logo ignore, inter-block-only
  gaps, invalid-alignment defaults — all against hand-computed values.
- **`meta.test.mjs`** — **the differentiator.** `buildMetaSnippet` emits the full
  ordered `og:*` / `twitter:*` block; title/description mirror into both og and
  twitter; content values are attribute-escaped (quotes, `&`, `<`, `>`, incl. an
  ampersand in the image URL); empty/whitespace title/description lines are
  omitted while the static tags stay; `imageUrl` defaults to `preview.png` and
  `twitterCard` to `summary_large_image`; dimensions appear only when positive and
  are rounded; `og:site_name` only when supplied.

## E2E (`playwright test --config=tests/playwright.config.mjs`)

Drives the built `index.html` over `file://` via `data-testid`s and the inert
`window.__socialCardMaker` hook. Backgrounds/logos are generated in-page as data
URLs and fed through `loadBackgroundFromDataURL` / `loadLogoFromDataURL` — no
fixture asset, no file dialog.

- Test-hook surface (pure fns + deterministic entry points).
- Content → live meta: eyebrow/title/subtitle update `og:*`/`twitter:*`;
  description falls back to the eyebrow; the Image-URL field flows into
  `og:image`/`twitter:image`; the snippet reflects the preset dimensions; Copy
  meta button copies the textarea contents.
- Background modes: solid/gradient/image visibility toggles; each renders distinct
  non-blank canvas pixels; scrim opacity changes image-mode pixels; remove button.
- Logo add/remove changes the composition.
- Output size: each preset sets the canvas backing store to its declared
  dimensions; custom W×H reveals + applies (clamped).
- Export: **PNG** download validated to its IHDR width/height (= preset dims);
  **JPEG** (`FF D8 FF`) and **WebP** (`RIFF`…`WEBP`) magic-byte checks; quality
  slider shown only for the lossy formats.
- Persistence: options only under `social-card-maker:v1` — never image bytes
  (`data:image`/`blob:`/`bgImg`… absent); restored on reload, image not carried
  over; Reset via shared `confirmDialog`.
- Responsive: no horizontal overflow at 1400px and 375px; the tall (story) canvas
  is height-capped to the viewport.
- First-load Help modal (auto-once, `✕` `modal-close-x`, focus trap, Esc/backdrop,
  focus return, `[hidden]` display guard); License modal (MIT + "100% vanilla",
  Esc, the `[data-jbc-license]` trigger).

## Running

```sh
npm install && npx playwright install chromium
npm test            # build:check → unit → e2e
```
