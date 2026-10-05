# Design

## Layout
`source/logic.mjs` is pure and DOM-free (unit-tested); `source/app.mjs` is wiring only; both are assembled with the template and `styles.css` into `index.html` by the repo build. The only the shared lib imports in logic are `textToBytes`/`bytesToHex` (UTF-8 bytes); app uses `el`, `persistState`, `debounce`, `onceFlag`, `wireSegmented`, `wireCopyButtons`, `showWarning`/`hideWarning`, `announce`, `copy`/`flash`, `createModal`, `JbcLicense`.

## Detection (per code point, never UTF-16 units)
1. explicit `INVISIBLES` table, 2. range rules (VS1-16, VS17-256, tag chars, C0/C1, lone surrogates), 3. generic `\p{Cf}` (-> format, "FORMAT CHARACTER", strip) and `\p{Zs}` (-> space) fallback, 4. curated `CONFUSABLES` (70 entries, non-ASCII only). Tab, LF, CR and U+0020 are never flagged. U+FFFD is flagged but never removed.
`scan()` also marks emoji machinery (`inEmoji`): ZWJ between Extended_Pictographic code points (skipping VS16/skin tone before it) and VS16 after a pictograph or before a keycap.

## Clean pipeline (fixed order)
normalize -> convert spaces/separators -> replace confusables (opt) -> remove by category (on a fresh scan) -> collapse/trim (opt). Defaults: normalize None, spaces and separators converted, confusables off, preserve emoji on, VS1-16 not removed, VS17-256 removed. Category boxes remove only items the table marks removable; variation selectors follow their own two boxes.

## Decisions
- Reveal and Clean are both visible (no view switch); the segmented control is Normalize only.
- Tag characters are removed even inside flag-emoji sequences (an emoji + tags + cancel pattern is also the hidden-ASCII smuggling shape); documented in the UI.
- Reveal renders at most 5000 chips and the all-flagged table 500 rows (notes shown); cleaning always covers everything.
- `cpLabel`/`utf16Units` are local copies (text-toolkit's are private); promotion candidate if a third tool needs them.
- Input text is never persisted; options only. Rendering uses `el`/`textContent`, never innerHTML.

## Limitations
Names are bundled only for table characters; confusables are a curated hint, not UTS #39. Mixed-script uses whitespace/punctuation tokenisation, so a real word like "µm" can be flagged.
