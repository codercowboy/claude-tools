# Tests
- `tests/unit/vectors.test.mjs` (node --test): Code 128 table + vectors, EAN-13/UPC-A vectors + check digits, Code 39 structure/mod-43, Code 128 auto-mode decode-and-reverify round trips, validation (never throws), layout/SVG geometry, escaping, contrast.
- `tests/barcode-generator.e2e.mjs` (Playwright, file://, workers=1): preview, symbology toggle (aria/keyboard), validation, injection, PNG pixel row == modules x scale (decoded from the downloaded file), SVG download + copy, colors, contrast warning, persistence, License, Help a11y, overflow.
