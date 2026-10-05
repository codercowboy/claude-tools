# social-card-maker — DESIGN

Source-of-truth spec for the **Social Card / OG-image Maker**.

## What it is

A single-file, dependency-free HTML tool that composes a **social share image**
(Open Graph / Twitter card) on a `<canvas>` and exports it as PNG / JPEG / WebP.
Everything runs locally in the browser — the background/logo images never leave
the device. Its distinguishing feature over a plain image editor is that it also
emits the **`og:*` / `twitter:*` meta-tag snippet** tied to the composed card,
copyable to paste straight into a page `<head>` — which ties into this repo's own
Open Graph convention (`docs/conventions.md` § "Link previews").

## Inputs

### Text content
- **Eyebrow / badge** (optional) — a small kicker line above the title (e.g. a
  category or site name). Rendered uppercase-ish per the eyebrow style.
- **Title** (required-ish; empty is allowed) — the large headline.
- **Subtitle** (optional) — a secondary line below the title.

### Background (three modes)
1. **Solid color** — one color fills the canvas.
2. **Linear gradient** — two color stops + an **angle** (CSS `deg` convention:
   0° = up, 90° = right). Endpoints computed by `gradientLineCoords`.
3. **Image** — an uploaded background image, drawn **cover** (scaled to fill,
   center-cropped), with an **overlay scrim**: a tint color + opacity drawn over
   the image so light text stays legible on a busy photo.

### Logo (optional)
- Drop/pick an image. Drawn at a configurable **height** (as a % of the canvas
  short side) above the text stack, aligned with the text's horizontal
  alignment.

### Text controls
- **Font family** — a **SYSTEM-FONTS-ONLY** curated stack (no bundled fonts, per
  repo decision), plus a free-text custom family field. Each pick carries a
  generic fallback so an absent face still renders.
- **Title**: font size (px), weight (400–900), color.
- **Subtitle**: font size, color. **Eyebrow**: font size, color.
- **Alignment**: horizontal (left / center / right) and vertical (top / middle /
  bottom) of the whole text+logo stack within the padded content box.
- **Padding** — inset from the canvas edges (px).
- Text **wraps** to the content-box width (`wrapText`, greedy word-wrap honoring
  explicit newlines).

### Output size
Presets:
- **1200 × 630** — OG landscape (default).
- **1200 × 1200** — square.
- **1080 × 1920** — story / portrait.
- **Custom** — arbitrary W × H (guarded to sane min/max).

### Export
- Format **PNG / JPEG / WebP** + a **quality** slider (JPEG/WebP only).
- Download with a filename slugified from the title (e.g. `My Launch` →
  `my-launch.png`).

### Meta snippet (the differentiator)
A read-only, copyable block of `<meta>` tags reflecting the current card:
`og:title`, `og:description`, `og:type`, `og:image` (+ `og:image:width/height`),
`twitter:card`, `twitter:title/description/image`. The image URL is a small
editable field (default `preview.png`) since the tool can't know the final host.
`og:title` ← title, `og:description` ← subtitle (or eyebrow fallback). Copyable
via the in-field `.ct-copy-btn` (`copy`/`flash` (JbcClipboardUtil)).

## Pure logic (`source/logic.mjs`) — DOM-free, exported, unit-tested

No `document`/`window`/`localStorage`. Anything needing text measurement takes an
injected `measure(str) => number` so tests pass a deterministic fake.

- `FORMATS`, `mimeForFormat`, `formatSupportsQuality`, `clampQuality`,
  `percentToQuality`, `qualityToPercent` — export format + quality helpers.
- `CURATED_FONTS`, `CURATED_BY_NAME`, `resolveFontFamily(spec)`,
  `canvasFontString({fontSize, fontWeight, family})` — system-font stacks.
- `clamp`, `num`, `hexOk`, `escapeAttrNullSafe` — small guards.
- `wrapText(text, maxWidth, measure)` — greedy word-wrap; honors `\n`; a single
  over-wide word stays whole on its own line.
- `PRESETS`, `presetByKey`, `clampSize(w, h)` — output-size presets + guard.
- `gradientLineCoords(angleDeg, w, h)` → `{x0,y0,x1,y1}` — CSS-angle gradient
  endpoints for `createLinearGradient`.
- `coverRect(srcW, srcH, dstW, dstH)` → `{sx,sy,sw,sh}` — source crop rect to
  draw an image **cover** into a destination (center crop).
- `composeLayout(spec)` — **the core layout math.** Given canvas size, padding,
  h/v alignment, an optional logo box, and an ordered list of pre-wrapped text
  blocks (each `{key, lines, fontSize, lineHeight, gapAfter}`), returns the
  content box, the text anchor X + canvas `textAlign`, the logo rect, and for
  every block each line's **top-left draw position** (`textBaseline:'top'`).
  Vertically centers/tops/bottoms the whole stack within the content box.
- `scaleLogoBox(natW, natH, targetH)` → `{w, h}` — logo draw size from a target
  height, preserving aspect.
- `buildMetaSnippet(opts)` — assembles the escaped `<meta …>` string.
- `slugify(str)`, `outputFilename(title, fmt)` — filename generation.
- `formatBytes(bytes)`.

`source/app.mjs` inlines `logic.mjs` and does: DOM wiring, the canvas draw
(background → scrim → logo → text via `composeLayout`), `toBlob` export,
localStorage persistence, the live meta snippet, and the Help modal.

## Conventions applied
- 44px control height (`controls.css`); `.ct-field`/`.ct-copy-btn` in-field copy
  on the meta-snippet output (multiline) and the image-URL field.
- First-load Help modal, `localStorage` key `social-card-maker:help-seen:v1`,
  `data-testid="modal-close-x"`, focus trap, Esc/backdrop close, focus return.
- Options persisted to `social-card-maker:v1` — **never** uploaded image bytes.
- `<select>` styled with `background-color` + `padding-right` **longhands** only.
- Inert `window.__socialCardMaker` test hook + `data-testid`s.
- Wide-screen responsive: controls column + a preview that uses available width;
  the tall (story) canvas is height-capped so it fits the viewport.
- No secure-context-only APIs (`toBlob` only; ids via `getRandomValues`/Math).

## Destructive-action carve-outs
- **Reset** (restore default options + clear images) is **confirmed** via
  `confirmDialog` — it discards a composed card that's non-trivial to redo.
- The **✕** on a loaded background/logo removes just that image (obvious inverse
  of loading; other settings untouched) — **no confirm**, documented here.
- Clearing the short text inputs (title/subtitle/eyebrow) is easily reversible —
  no confirm.

## Testing
- **Unit** (`node --test tests/unit/*.test.mjs`): the pure engine — `wrapText`
  (injected measure stub), `composeLayout`, `gradientLineCoords`, `coverRect`,
  `scaleLogoBox`, presets/`clampSize`, `hexOk`/`escapeAttrNullSafe`, format/quality
  helpers, fonts, `slugify`/`outputFilename`, and **`buildMetaSnippet`** (the
  differentiator) against hand-computed values.
- **E2E** (`playwright test`): drives the built `index.html` over `file://` via
  `data-testid`s + the inert `window.__socialCardMaker` hook — content→meta,
  background modes + scrim, logo, size presets, PNG/JPEG/WebP export validated to
  their real bytes, options-only persistence, responsive/no-overflow, first-load
  Help + License modals.
- See `tests/TESTS.md`. `preview.png` (1200×630) is the tool's own OG image,
  rendered by the tool itself.
