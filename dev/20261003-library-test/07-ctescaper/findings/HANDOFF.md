# HANDOFF — 07-ctescaper r1

Artifact: `src/lib/tests/unit/CtEscaper.test.mjs` (zero-dep, table-driven). No src/lib edits.

## Gate
- `node --test src/lib/tests/` -> 377 tests, 377 pass, 0 fail (CtEscaper file alone: 138 pass).
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- Red-proof: in a scratchpad COPY, made escapeCsv and escapeRegex no-ops -> 9 tests failed (round-trip alone would have stayed green; the exact fixtures catch it).

## Context table (19 pairs + filename)
All 19 pairs: roundtrip over 19-input battery (empty, ascii, html/shell/sql/csv/url/md/regex specials, quotes, backslashes, newlines/tabs/vt/ff/bs, control chars, digit-after-control, unicode, emoji/ZWJ/flags, leading BOM, 500x long) = PASS; >=2 exact fixtures each (escape and unescape direction) = PASS.
Base64, HtmlText, HtmlAttr, Xml, Json, JsString, Java, CString, Python, ShSingle, ShDouble, ShAnsiC, PowerShell, Sql, Csv, UrlComponent, UrlFull, Markdown, Regex: roundtrip Y, fixture Y.
Cross-checks vs Buffer base64 / JSON.stringify / encodeURIComponent.
Metadata: CONTEXTS ids unique + fields, CONTEXTS_BY_ID, DEFAULT_ENABLED subset; nest(): order, steps, reverse-unwind, empty chain, unknown ids skipped.
escapeFilename: illegal chars, collapse/trim, diacritics, empty->untitled, reserved names, length.

## Lossy / characterized
- Lossy by design: `filename` only (one-way, unescape null; distinct inputs collide, non-Latin -> "untitled").
- Characterized (not bugs): escapeFilename has NO reserved-name handling (CON -> con) and NO length cap; URL encoders throw URIError on lone surrogates (native); unescapeShSingle needs the quoted form (bare `it'\''s` decodes to `it\s`); unescapeCsv of unquoted text is identity; HTML decoders leave unknown/out-of-range entities intact; nbsp maps to U+00A0.

## Suspected bugs
None. No round-trip failure on the battery.

## Repro
node --test "src/lib/tests/unit/CtEscaper.test.mjs"
node --test src/lib/tests/
node scripts/build-all.mjs --check
