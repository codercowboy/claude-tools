# CtMarkdown

A safe, deterministic Markdown-to-HTML renderer.

`src/lib/utils/formats/CtMarkdown.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

`mdToHtml(src, opts)` renders [Markdown](https://commonmark.org/) to an HTML string with a line-based block parser and an inline parser. It uses no DOM, no `Date`, and no randomness, so the same Markdown always produces byte-identical HTML. Safety is built in: raw HTML in the source is always escaped (never passed through), and link and image URLs are sanitized against [cross-site-scripting](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS) injection. It supports ATX and setext headings, fenced and indented code, blockquotes, lists (including task lists), pipe tables, reference definitions, emphasis, inline code, autolinks, and hard breaks. The module also exports its escaping and URL-sanitizing helpers.

## API

### `mdToHtml(src, opts?) → string`

Renders Markdown source to HTML. `opts.allowImage` (default `false`) controls whether a `data:` URL is permitted as an image source (see `sanitizeUrl` for the exact rule). A falsy `src` returns `''`. Otherwise the result ends with a trailing newline. CRLF/CR are normalized to LF, leading tabs are expanded to spaces, and reference definitions are pulled out before block parsing.

```js
import { mdToHtml } from './CtMarkdown.mjs';
mdToHtml('# Hi\n\nSome **bold** text.');
// '<h1>Hi</h1>\n<p>Some <strong>bold</strong> text.</p>\n'
```

### `parseInline(src, refs?, opts?) → string`

Renders a single run of inline Markdown (emphasis, inline code, links, images, autolinks, escapes, hard breaks) to HTML. `refs` is the reference-link map (as built internally by `mdToHtml`), defaulting to `{}`. `opts` threads through the same options, including `allowImage`. Raw text is HTML-escaped. This is the inline layer `mdToHtml` calls per block, exposed for a consumer that already has a single line or span.

```js
import { parseInline } from './CtMarkdown.mjs';
parseInline('a `code` and [link](https://x.test)');
// 'a <code>code</code> and <a href="https://x.test">link</a>'
```

### `escapeHtmlForMarkdown(s) → string`

Escapes `&`, `<`, `>`, and `"` for HTML text output. Coerces a nullish argument to `''`.

```js
import { escapeHtmlForMarkdown } from './CtMarkdown.mjs';
escapeHtmlForMarkdown('<b>&"'); // '&lt;b&gt;&amp;&quot;'
```

### `escapeAttrForMarkdown(s) → string`

Like `escapeHtmlForMarkdown` and also escapes `'` (to `&#39;`), for use inside a quoted attribute value.

### `sanitizeUrl(url, opts?) → string`

Returns the original URL when it is considered safe to use as an `href`/`src`, or `''` when blocked. It first decodes numeric and hex HTML entities and strips control and whitespace characters, so a dangerous scheme cannot be smuggled past the check. It then blocks `javascript:` and `vbscript:`. A `data:` URL is blocked unless `opts.allowImage` is set and the payload is a non-SVG `data:image/` (SVG stays blocked even with `allowImage`, since SVG can carry script). The caller is responsible for attribute-escaping the returned URL.

```js
import { sanitizeUrl } from './CtMarkdown.mjs';
sanitizeUrl('https://x.test');                 // 'https://x.test'
sanitizeUrl('javascript:alert(1)');            // ''
sanitizeUrl('data:image/png;base64,AA', { allowImage: true }); // 'data:image/png;base64,AA'
```

## Notes

- The renderer is safe by default. Raw HTML tags in the source render as escaped text, so passing user-authored Markdown through `mdToHtml` does not inject markup. There is no option to allow raw HTML.
- `data:` image URLs are off unless `opts.allowImage` is passed, and `image/svg+xml` is never allowed through a `data:` URL regardless, because an SVG payload can execute script.
- Output is deterministic: identical input always yields identical HTML, which makes it safe to snapshot-test or cache.
- `parseInline` expects the reference map `mdToHtml` builds. Called on its own with no `refs`, reference-style links will not resolve.
</content>
