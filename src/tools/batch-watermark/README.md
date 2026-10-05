# Batch Watermark

Single-file HTML tool that stamps a text or logo watermark on many images at once, previews it on one, and exports the whole batch as a `.zip` (or one file at a time). Everything runs in your browser; open `index.html` straight from `file://`.

- **Watermark:** multi-line text (system fonts, fill, optional stroke and drop shadow) or an uploaded logo image.
- **Placement:** 9-anchor grid plus offset X/Y and margin; size, opacity, rotation; optional tiling (staggered rows, grid rotated about the image centre, capped at 2000 tiles).
- **Resolution independent:** size, margin, offset and tile spacing are percentages of each image's short side, so one setting looks the same on 800 px and 6000 px photos. The preview uses the exact same composition path as the export.
- **Output:** same format as each source (GIF/BMP/SVG become PNG) or force PNG / JPEG / WebP with a quality slider. Forcing JPEG flattens transparency onto white (the UI warns). Files are named `{name}-watermarked.{ext}`; collisions get `-1`, `-2`. More than one image exports as `watermarked.zip`; one image downloads directly; "Download each" is the secondary path.
- **Batch behaviour:** sequential, one reused canvas, lazy decode per file, progress `N/M` with Cancel. A file that cannot be read, is too large (>40 MB or >20000 px a side) or fails to encode gets an error row and the rest still export. Images are never saved; only watermark settings persist in this browser.
- **Metadata:** canvas re-encode strips EXIF and color profiles. Fonts are your system's; a font missing on the exporting machine falls back silently.

## Develop
Edit `source/`, then `npm run build` (repo root builds every tool) and commit `index.html` too. `npm test` runs the `node --test` unit suite and the Playwright e2e suite. The zip writer is the shared `src/lib/utils/CtZipUtil.mjs` `storeZip` (imported, not copied).

## License
MIT. The footer's License link opens the license in-product.
