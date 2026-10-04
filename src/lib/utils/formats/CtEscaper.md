# CtEscaper

Escape and unescape a string for roughly 20 syntactic contexts (HTML, code string literals, shells, SQL, URLs, and more).

`src/lib/utils/formats/CtEscaper.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

Each context has an `escape<Context>` and an `unescape<Context>` function, each a pure string transform with no DOM, `window`, or storage. Round-trip contexts satisfy `unescapeX(escapeX(s)) === s` for any `s`: control characters are always emitted in an unambiguous form (`\xNN`, `\uNNNN`, or 3-digit octal) so decoding is deterministic. The module also exports `CONTEXTS`/`CONTEXTS_BY_ID` metadata, a `DEFAULT_ENABLED` id list, and `nest(chain, text)` for composing escapes. Every function below is a named export unless noted.

The escape/unescape functions are documented grouped by context, since the two halves of each context are a pair.

## API

### HTML text — `escapeHtmlText` / `unescapeHtmlText`

`escapeHtmlText` escapes the three characters that break an [HTML](https://developer.mozilla.org/en-US/docs/Web/HTML) text node: `&`, `<`, `>`. `unescapeHtmlText` decodes HTML entities, covering a named-entity table plus numeric (`&#NN;`) and hex (`&#xNN;`) references.

```js
import { escapeHtmlText } from './CtEscaper.mjs';
escapeHtmlText('a < b & c'); // 'a &lt; b &amp; c'
```

### HTML attribute — `escapeHtmlAttr` / `unescapeHtmlAttr`

Like HTML text, and also escapes `"` (to `&quot;`) and `'` (to `&#39;`) so the result is safe inside a quoted attribute value. `unescapeHtmlAttr` decodes entities.

### XML — `escapeXml(text, strict?)` / `unescapeXml`

Escapes the five predefined [XML](https://www.w3.org/TR/xml/) entities: `&`, `<`, `>`, `"`, and `'` (to `&apos;`). This is the canonical `escapeXml` for the whole library. `null`/`undefined` pass through unchanged. A non-string argument is `String()`-coerced, unless `strict` is `true`, in which case it throws a `TypeError`. `unescapeXml` decodes entities.

```js
import { escapeXml } from './CtEscaper.mjs';
escapeXml(`a'b<c`);       // 'a&apos;b&lt;c'
escapeXml(42);            // '42'
escapeXml(42, true);      // throws TypeError
```

### JSON string — `escapeJson` / `unescapeJson`

`escapeJson` is `JSON.stringify` (a quoted JSON string). `unescapeJson` tries `JSON.parse` on the trimmed input and returns the string. If that fails it tolerates an unquoted body by wrapping and parsing it. It can throw if the body is not parseable as a JSON string.

### JS string — `escapeJsString` / `unescapeJsString`

Double-quoted JavaScript literal, with `\v` named and other control chars as `\xNN`. `unescapeJsString` strips a surrounding `"…"` or `'…'` and decodes backslash escapes.

### Java string — `escapeJava` / `unescapeJava`

Double-quoted Java literal, with other control chars as `\uNNNN` (Java has no `\x`). `unescapeJava` decodes backslash escapes including octal.

### C / C++ string — `escapeCString` / `unescapeCString`

Double-quoted C literal, with `\a` and `\v` named and other control chars as 3-digit octal. `unescapeCString` decodes backslash escapes including octal.

### Python string — `escapePython` / `unescapePython`

Single-quoted Python literal, other control chars as `\xNN`. `unescapePython` ignores a leading string prefix (`r`, `b`, `u`), strips the quotes, and decodes escapes including octal.

```js
import { escapePython } from './CtEscaper.mjs';
escapePython("it's\n"); // "'it\\'s\\n'"
```

### Shell single quotes — `escapeShSingle` / `unescapeShSingle`

POSIX single-quoting: wrap in `'…'` and render an embedded `'` as `'\''`. The fully literal form. `unescapeShSingle` walks single-quoted spans and backslash bridges back to the raw text.

### Shell double quotes — `escapeShDouble` / `unescapeShDouble`

POSIX double-quoting: wrap in `"…"` and backslash-escape `\`, `$`, `` ` ``, and `"`. Newlines stay literal.

### Shell ANSI-C — `escapeShAnsiC` / `unescapeShAnsiC`

Bash/zsh [`$'…'` quoting](https://www.gnu.org/software/bash/manual/html_node/ANSI_002dC-Quoting.html) with C-style escapes (`\n`, `\t`, `\xNN`, …). `unescapeShAnsiC` strips the `$'…'` (or `'…'`) wrapper and decodes escapes including octal.

### PowerShell — `escapePowerShell` / `unescapePowerShell`

Single-quoted PowerShell literal, embedded `'` doubled to `''`.

### SQL string — `escapeSql` / `unescapeSql`

Standard SQL string literal: `'…'` with an embedded `'` doubled to `''`.

### CSV field — `escapeCsv` / `unescapeCsv`

[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) field quoting: a field is wrapped in `"…"` (with `"` doubled) only when it contains `"`, `,`, CR, or LF. Otherwise it is returned unchanged.

```js
import { escapeCsv } from './CtEscaper.mjs';
escapeCsv('a,b');   // '"a,b"'
escapeCsv('plain'); // 'plain'
```

### URL component — `escapeUrlComponent` / `unescapeUrlComponent`

[`encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) / `decodeURIComponent`, for a single query value or path segment.

### Full URL — `escapeUrlFull` / `unescapeUrlFull`

`encodeURI` / `decodeURI`, which keep `: / ? # & =` so a whole URL stays usable.

### Markdown — `escapeMarkdown` / `unescapeMarkdown`

Backslash-escapes [CommonMark](https://commonmark.org/) ASCII punctuation (`` * _ ` [ ] ( ) # `` and the rest). `unescapeMarkdown` removes those backslashes.

### Regex — `escapeRegex` / `unescapeRegex`

Escapes [regular-expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions) metacharacters so the text matches literally.

```js
import { escapeRegex } from './CtEscaper.mjs';
escapeRegex('a.b*c'); // 'a\\.b\\*c'
```

### Base64 — `escapeBase64` / `unescapeBase64`

`escapeBase64` encodes the UTF-8 bytes of the text as standard [Base64](https://en.wikipedia.org/wiki/Base64) (hand-rolled, so it is DOM-free and handles non-Latin1 text). `unescapeBase64` decodes, ignoring whitespace and tolerating missing padding. `unescapeBase64` throws `Error('Invalid Base64 input')` on a stray non-Base64 character. A leading U+FEFF survives the round-trip.

```js
import { escapeBase64, unescapeBase64 } from './CtEscaper.mjs';
unescapeBase64(escapeBase64('héllo 🌟')); // 'héllo 🌟'
```

### Filename slug — `escapeFilename`

One-way (there is no `unescapeFilename`). Normalizes with NFKD, strips combining marks and quotes, lower-cases, maps any run of non-`[a-z0-9._-]` to `-`, collapses repeats, and trims leading/trailing `-`/`.`. An empty result becomes `'untitled'`. A base name that matches a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`, `LPT1`-`9`) is prefixed with `_` so the result is always a usable filename.

```js
import { escapeFilename } from './CtEscaper.mjs';
escapeFilename('My Résumé (v2).pdf'); // 'my-resume-v2.pdf'
escapeFilename('con');                // '_con'
```

### `CONTEXTS`

An array describing every context. Each entry is `{ id, label, group, roundTrip, note, escape, unescape }`, where `escape`/`unescape` are the functions above (`unescape` is `null` for the one-way `filename` context). `group` buckets contexts for a UI (`Markup`, `Code strings`, `Shell`, and so on).

```js
import { CONTEXTS } from './CtEscaper.mjs';
CONTEXTS.find((c) => c.id === 'xml').label; // 'XML'
```

### `CONTEXTS_BY_ID`

The same entries keyed by `id`, built with `Object.fromEntries`.

### `DEFAULT_ENABLED`

An array of context ids a UI can enable by default (`html-text`, `html-attr`, `json`, `js-string`, `sh-single`, `sh-double`, `sql`, `csv`, `url-component`, `markdown`, `regex`, `base64`).

### `nest(chain, text) → { steps, output }`

Applies each context's `escape` in order, so the output of one becomes the input of the next. `chain` is an array of context ids (unknown ids are skipped). Returns `output` (the final string) and `steps`, one `{ id, label, value }` per applied step for showing the intermediate results.

```js
import { nest } from './CtEscaper.mjs';
nest(['json', 'sh-double'], 'say "hi"').output;
// escapes for a JSON string, then wraps that for a shell double-quoted arg
```

## Notes

- Round-trip contexts (every one except `filename`) are built so `unescapeX(escapeX(s)) === s` for arbitrary input. `filename` is lossy by design.
- A few decoders throw on invalid input: `unescapeBase64` on a bad character, `unescapeJson` when the body will not parse. The rest tolerate missing or extra delimiters and return a best effort.
- The escapers encode for *producing* a literal. They do not validate that an input already in a given syntax is well-formed.
</content>
