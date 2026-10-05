# Batch Watermark tests
- `tests/unit/layout.test.mjs`: `layoutWatermark` scale, nine anchors + margin, offset, resolution independence, rotation/fallbacks/bad input, tile grid + stagger + rotated coverage, tile cap.
- `tests/unit/fonts-names.test.mjs`: font stacks/`resolveFontFamily`, stroke/shadow scaling, `textBlockMetrics`, format mapping, `uniqueName` dedupe, `buildZip` round-trip through the srcset-builder zip reader, asserts `storeZip` is imported (not copied) and `app.mjs` imports only components.
- `tests/batch-watermark.e2e.mjs` (19 tests, Chromium, file://): 3 differently-sized images -> unzipped in-test, pixels differ at the anchor and are unchanged elsewhere; relative sizing; anchor; tiling; preview == output; logo mode + opacity; format switch; JPEG flatten; name dedupe; download-each; corrupt/oversize/export-time failures; persistence.
Run: `npm test` (build:check first, `--workers=1`).
