# Tests

`npm test` = `build:check` + `node --test tests/unit/*.test.mjs` + Playwright (`tests/invisible-chars.e2e.mjs`, `--workers=1`, Chromium, file://).

Unit (`tests/unit/`)
- `detect.test.mjs`: every table row, VS/tag/C0/C1 ranges, Cf/Zs fallback, lone surrogates, astral, posAt parity, inspector data, confusables, mixed-script, emoji marking, tag decode.
- `clean.test.mjs`: exact outputs for strip-by-category, spaces, separators, confusables, collapse/trim, pipeline order, NFC/NFKC (incl. non-effects on invisibles), emoji preservation, sample text.
- `hygiene.test.mjs`: no stray export/import in built HTML; no raw invisible chars in our own source; no innerHTML assignment.

E2E: shell (hook, License, Help a11y, first-load Help), paste -> chips -> inspector (+ table, keyboard, surrogate, HTML-injection safety, confusable toggle, 5000-chip cap), clean panel (every option, segmented normalize incl. arrow keys, Clean & copy, copy flash), persistence (options only, corrupt storage), responsive/a11y, self-contained.

Mutation checks done: removing the emoji-preserve guard and flipping VS17-256 strip reddened unit tests; swapping the confusable filter reddened the e2e toggle test.
