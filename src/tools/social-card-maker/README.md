# social-card-maker

A single-file, dependency-free HTML tool for composing **social share images**
(Open Graph / Twitter cards) entirely in your browser. Set a title, subtitle, and
optional eyebrow/badge; pick a solid, gradient, or photo background; drop in a
logo; style the type; export **PNG / JPEG / WebP**; and copy the matching
`og:image` / `twitter:card` **meta tags** to paste into your page `<head>`.
Everything runs locally through the browser's native `<canvas>` — no network
requests, no uploads, nothing leaves your machine.

## Usage

Open `index.html` directly in a browser (double-click it, or `open index.html`) —
no server, build step, or install required. It also works served from a static
file server if you'd rather.

1. **Content.** Enter an optional **eyebrow/badge**, a **title**, and an optional
   **subtitle**. Text wraps to the padded content box; press Enter for a hard
   line break.
2. **Background.** Choose:
   - **Solid color** — one color fills the card.
   - **Linear gradient** — two color stops + an **angle** (CSS convention: 0° =
     up, 90° = right).
   - **Image + scrim** — drop a photo (drawn *cover*, center-cropped to fill),
     then tint it with a **scrim** (color + opacity) so text stays legible.
3. **Logo** (optional). Drop a logo image; it sits above the text and follows the
   text alignment. Size it as a percent of the card's short side.
4. **Text style.** Pick a **system font** (or type a custom family), set per-line
   **size / weight / color**, choose **horizontal** (left/center/right) and
   **vertical** (top/middle/bottom) alignment, and set the **edge padding**.
5. **Output size.** **1200×630** (OG landscape), **1200×1200** (square),
   **1080×1920** (story), or a **custom** width × height.
6. **Export.** Choose **PNG / JPEG / WebP** (+ a quality slider for the lossy
   formats). **Download** saves the image with a filename slugified from the
   title (e.g. `My Launch` → `my-launch.png`).
7. **Meta tags.** The **Meta tags** panel shows the `og:*` / `twitter:*` markup
   for the current card — set the **Image URL** to where your `preview.png` will
   actually live, then copy the block into your page `<head>`.

Your text and style **preferences are remembered on this device** between visits
— the **background and logo images themselves are never stored**.

### Only system fonts

By repo decision, **no fonts are bundled**. The font dropdown offers common
system families (each with a generic fallback), plus a free-text **custom family**
field. A face that isn't installed falls back gracefully rather than failing.

### Limits & notes

- **No AVIF export.** A browser `<canvas>` can't encode AVIF across browsers, so
  it isn't offered. PNG / JPEG / WebP are.
- **Cover-fit backgrounds.** An uploaded background is scaled to fill and
  center-cropped; it isn't letterboxed. Use the scrim to keep text readable.
- **Meta image URL.** The tool can't know your final host, so `og:image` defaults
  to the relative `preview.png` — edit the Image URL field to an absolute URL if
  you need reliable previews on services like iMessage.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. The code is
authored under `source/` and assembled into the one self-contained file (see
`docs/conventions.md` § "Build-assembled tools"):

- `source/index.template.html` — the page shell + shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (word-wrap, layout math,
  gradient geometry, cover-fit crop, the meta-snippet builder, filename +
  format helpers). Imported directly by the unit tests.
- `source/app.mjs` — the DOM / canvas / `toBlob` / persistence wiring.

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then
  commit both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It uses only vanilla browser APIs
  (`FileReader`/`createObjectURL`, `<img>`, `<canvas>` 2D, `canvas.toBlob`),
  none of which are secure-context-only, so it also works over plain LAN HTTP.
- For automated testing, the page exposes `window.__socialCardMaker` with the
  pure functions (`composeLayout`, `wrapText`, `gradientLineCoords`, `coverRect`,
  `scaleLogoBox`, `buildMetaSnippet`, `slugify`, `outputFilename`, `presetByKey`,
  `clampSize`, `resolveFontFamily`, `canvasFontString`, format/quality helpers),
  the deterministic entry points `render()`, `loadBackgroundFromDataURL(url)`,
  `loadLogoFromDataURL(url)`, and a `getState()` accessor. This namespace has no
  effect on normal use.

<!-- readme-footer: keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Licensed under the **[MIT License](https://github.com/codercowboy/claude-tools/blob/main/LICENSE)**. Any bundled third-party libraries are listed in the tool's in-app **License** dialog (footer) and in the repository's [`NOTICES`](https://github.com/codercowboy/claude-tools/blob/main/NOTICES) file.

Code by Claude &middot; Ideas by Jason, the ideas guy.
