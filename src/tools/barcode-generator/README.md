# Barcode Generator

Single-file HTML tool that generates 1D barcodes (Code 128 with automatic A/B/C code sets, EAN-13, UPC-A, Code 39) with a live preview and crisp SVG / PNG export. Everything runs in your browser; open `index.html` straight from `file://`.

- Check digits are computed (or verified) and shown. Invalid input produces a message, never an error page.
- Options: module width (1-20 px), bar height, quiet zone, human-readable text, bar and background colors. A warning appears when contrast is low or inverted.
- Export: SVG (the same markup as the preview), PNG (drawn on a canvas at an integer pixel width per module), and Copy SVG.
- QR codes are out of scope.

## Develop
Edit `source/`, then `npm run build` (repo root builds every tool) and commit `index.html` too. `npm test` runs the `node --test` unit suite and the Playwright e2e suite.

## License
MIT. The footer's License link opens the license in-product.
