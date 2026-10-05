# Invisible Chars

Detect, reveal, and strip invisible, zero-width, bidi, and look-alike Unicode in pasted text. A single self-contained `index.html` that opens straight from `file://`; zero runtime dependencies; nothing leaves your browser.

## Use

Open `index.html`, paste text.

- **Reveal**: every flagged code point becomes a chip (`ZWSP U+200B`, `a U+0430 ~ a`) coloured by category. Words mixing Latin with Cyrillic/Greek are underlined and listed in a warning.
- **Inspector**: click a chip (or a row in "All flagged characters") for name, code point, UTF-8 bytes, UTF-16 units, general category, index and line:column. Tag characters decode to the ASCII they hide.
- **Clean**: normalize (None/NFC/NFKC), convert spaces and separators, replace confusables (opt-in), remove by category, collapse/trim. "Clean & copy" copies the result.
- Your text is never saved; only option toggles persist (`invisible-chars:v1`).

## Develop

Edit `source/`, then `npm run build` (writes `index.html`; never hand-edit it). `npm test` runs `build:check`, `node --test` unit tests, and the Playwright e2e suite (`--workers=1`). See `DESIGN.md`, `PLAN.md`, `tests/TESTS.md`.

## License

MIT. Shown in-product via the footer's MIT License link.
