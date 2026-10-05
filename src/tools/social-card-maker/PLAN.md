# social-card-maker — PLAN

Implementation plan derived from `DESIGN.md`. Pattern reference:
`src/tools/image-converter/source/*` (canvas/toBlob/persistence/help modal) and
`src/tools/meme-maker/source/logic.mjs` (injected-measure word-wrap, system-font
stacks).

## Files
- `source/index.template.html` — page shell, OG meta, controls markup, canvas
  preview, meta-snippet output, Help modal, footer + shared script includes.
- `source/styles.css` — tool CSS (palette tokens live in the template `:root`).
- `source/logic.mjs` — pure engine (see DESIGN "Pure logic").
- `source/app.mjs` — DOM/canvas/persistence; inlines `logic.mjs`.
- `package.json` — `@codercowboy/social-card-maker`, standard scripts, playwright
  devDep.
- `README.md` — usage + "Developing" + verbatim readme-footer.
- `DESIGN.md`, `PLAN.md`, empty `tests/unit/`.

## Step order
1. `logic.mjs` — implement + export every function in the DESIGN list. Keep
   `composeLayout` / `wrapText` / `buildMetaSnippet` measure-injectable and
   side-effect-free.
2. `index.template.html` — mirror image-converter's structure: `:root` light +
   dark palettes, the include tokens (base.css, controls.css, styles.css inline,
   footer.html, copy.js, JbcConfirm.mjs, app.mjs inline). Controls grouped into
   fieldsets: Content, Background, Logo, Text style, Size, Export, Meta snippet.
3. `styles.css` — layout grid (controls column + preview), canvas-wrap with a
   height cap for tall cards, fieldset styling, meta `.ct-field--multiline`,
   help modal, confirmDialog theming vars.
4. `app.mjs` — DOM refs, state + persistence (options only), the inlined logic,
   `render()` (draw bg/scrim/logo/text + update meta), debounced `toBlob`
   export, file loading for bg + logo (with revoke), download, reset (confirm),
   help modal, `window.__socialCardMaker` hook.
5. `package.json`, `README.md`, empty `tests/unit/` (`.gitkeep`).
6. `npm run build` then `npm run build:check` — both exit 0.

## Render pipeline (app `render()`)
1. Resolve output `{width, height}` from preset/custom → set canvas backing
   store to that exact size (CSS scales the preview down).
2. **Background**: solid → `fillRect`; gradient → `createLinearGradient` from
   `gradientLineCoords`; image → `drawImage` using `coverRect`, then draw the
   **scrim** (`fillRect` tint at overlay opacity).
3. **Logo** (if loaded): `scaleLogoBox` → placed by `composeLayout`'s logoRect.
4. **Text**: for each block (eyebrow/title/subtitle present + non-empty), set the
   canvas font (`canvasFontString`), `wrapText` at the content-box width using
   `ctx.measureText`, collect `{key, lines, fontSize, lineHeight, gapAfter}`.
   Call `composeLayout` → draw each line at its top-left with `textBaseline:'top'`
   and the computed `textAlign`.
5. Update the **meta snippet** field via `buildMetaSnippet`.
6. Debounced `toBlob` → output size readout + enable Download.

## Persistence (`social-card-maker:v1`)
Persist: text strings, bg mode + colors + gradient angle + overlay tint/opacity,
font family/custom, per-block sizes/weights/colors, h/v align, padding, size
preset + custom W/H, format, quality, meta image URL. **Never** the bg/logo image
bytes. Best-effort try/catch; tool works with no stored state.

## Testability
- `data-testid` on every interactive control + the canvas + the meta output.
- `window.__socialCardMaker` exposes the pure functions plus `render()`,
  `loadBackgroundFromDataURL`, `loadLogoFromDataURL`, `getState()`.

## Risks / notes
- Tall (1080×1920) preview: cap canvas display height in CSS so it fits the
  viewport without pushing controls off-screen.
- Do **not** place `ct:include`/`ct:inline` token text in `.mjs` comments — it
  breaks the build. Strip any stray codegen tags before building.
- Only this tool's build is run (`npm run build` / `build:check` in this dir).
