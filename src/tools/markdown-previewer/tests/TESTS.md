# Tests — Markdown Previewer

Two required layers (per `CLAUDE.md` and `docs/conventions.md`):

- **Unit** — `node --test tests/unit/*.test.mjs`, importing `source/logic.mjs`
  directly (DOM-free pure parser). `npm run test:unit` (build:check runs first).
- **e2e** — `@playwright/test` driving the built `index.html` over `file://`.
  `npm run test:e2e` (build:check runs first).

`npm test` runs both. Current status: **96 unit tests pass, 22 e2e tests pass.**

## Unit coverage (`tests/unit/`)

### `escaping.test.mjs` — `escapeHtmlForMarkdown` / `escapeAttrForMarkdown`
- `escapeHtmlForMarkdown` escapes `&` `<` `>` `"` (leaves `'`); `&` escaped first so
  entities aren't double-mangled; a `<script>` tag becomes inert text;
  null/undefined → `""`; non-strings coerced.
- `escapeAttrForMarkdown` additionally escapes `'` → `&#39;`; an attribute-breakout
  (`" onerror="…`) is neutralized; null/undefined → `""`.

### `sanitize-url.test.mjs` — `sanitizeUrl`
- Allows http/https/relative/anchor/`mailto:` unchanged; trims whitespace;
  empty/whitespace/null → `""`.
- Blocks `javascript:` (any case) and `vbscript:`; blocks a scheme smuggled past
  a tab/newline/space; blocks **entity-encoded** `javascript:` (hex `&#x6a;` and
  the colon via `&#58;`/`&#x3a;`).
- Blocks `data:` for links by default; allows `data:image/*` **only** when
  `allowImage` is set; `allowImage` does not open non-image `data:`.
- A scheme-less URL with a later colon (`/search?q=a:b`) is allowed.

### `inline.test.mjs` — `parseInline` + inline paths of `mdToHtml`
- Emphasis: `**`/`__` bold, `*`/`_` italic, `***` bold+italic, `~~` strike;
  intra-word underscores are literal.
- Code spans: single- and multi-backtick (containing a backtick); content
  escaped, never emphasized; one surrounding space stripped.
- Links: inline (with/without title), inline-parsed link text, reference /
  collapsed / shortcut references, case-insensitive + whitespace-normalized ref
  keys, unresolved refs left literal.
- Images: inline (alt + title) and reference.
- Autolinks: URL autolink, email autolink → `mailto:`; a bare `<` is escaped.
- Backslash escapes for ASCII punctuation; a backslash before a non-punctuation
  char is literal.
- `parseInline` directly: mixed constructs, refs-map resolution, no-refs call.

### `blocks.test.mjs` — block constructs via `mdToHtml`
- ATX headings h1–h6, optional closing `#`s, inline-parsed content, `#######`
  is not a heading; setext `===`→h1 / `---`→h2.
- Paragraphs (soft-wrap join, blank-separated); hard breaks (two trailing
  spaces, trailing backslash).
- Fenced code (`language-x` class, no-lang, tilde fences, escaped + not
  inline-parsed) and 4-space indented code.
- Blockquotes, incl. nested (`> >`).
- Lists: unordered/ordered (tight), non-1 `start`, indentation nesting, loose
  (blank line → `<p>`) vs tight; task lists (disabled checkboxes,
  `contains-task-list` / `task-list-item`, uppercase `[X]` checked).
- Horizontal rules from `---` / `***` / `___`.
- Tables: left/right/center alignment, inline-parsed cells, no-style unaligned
  columns.
- Empty/whitespace/null → `""`; CRLF normalized.

### `security.test.mjs` — XSS / HTML-safety stance
- Pasted `<script>` and `<img onerror>` render as escaped, inert text (no live
  `<script>`/`<img>`/`onerror`).
- `javascript:` / entity-encoded `javascript:` / `vbscript:` / `data:` links
  neutralized to `href=""`; `data:image/*` allowed for images, non-image `data:`
  blocked for images; a `javascript:` autolink neutralized.
- Image `alt` and link `title` quotes are attribute-escaped (no breakout).
- A mixed raw-HTML paste yields no live `<script>` and no live `javascript:`
  href, while a legitimately-parsed safe link survives.

### `sample-stability.test.mjs` — `SAMPLE_MARKDOWN` + determinism
- Sample is a non-empty string, renders without throwing, and exercises h1/h2,
  bold/italic/strike, inline + fenced code (with lang), ul/ol, task list,
  blockquote, table with alignment, hr, link, and a hard break.
- The sample's demonstrated `<script>` stays escaped/inert.
- Output is deterministic (byte-identical across repeated calls) for the sample
  and a representative fixture.
- The private placeholder sentinel (U+E000) is stripped from input (can't
  smuggle raw HTML back through token restoration).

## e2e coverage (`tests/markdown-previewer.e2e.mjs`)

- **First-load Help** — genuine fresh context auto-shows once, stays closed on
  reload, writes the seen flag; re-open via `?` button.
- **Help modal** (pre-seeded, opened via `?`): `✕` close + focus return to
  trigger; Esc close + focus return; backdrop click closes / inside-dialog click
  does not; Tab / Shift+Tab focus trap stays inside the dialog.
- **Live render**: preview updates as you type; lists/code/blockquote/table
  render; emptying the editor clears the preview.
- **Load sample**: populates the editor (`# Markdown Previewer`) and renders
  heading, table, task checkbox, fenced code with language class.
- **XSS in the live DOM**: a `javascript:` link renders with `href=""` and a
  click fires no dialog; a pasted `<img onerror>` produces no live `<img>` /
  `[onerror]` and no dialog; a pasted `<script>` never executes (a window flag
  stays false) and no live `<script>` exists; `data:image` allowed for an image
  while a `data:text/html` link is neutralized. Dialogs are counted via
  `page.on('dialog')`.
- **Copy HTML**: flashes `Copied!` then reverts (waits for the debounced render
  first, since Copy is a no-op on an empty preview).
- **Clear**: confirms via `confirmDialog` — Yes empties the editor + preview, Cancel
  leaves it untouched.
- **Sync scroll**: toggles `aria-pressed` and persists `syncScroll: true`.
- **Test hook**: `window.__markdownPreviewer` exposes the pure functions,
  `render`, and live `state`; `mdToHtml('# Hi')` and a blocked `sanitizeUrl`
  return the expected values.
- **Persistence**: editor text + sync toggle written to `localStorage` and
  restored on reload (preview re-derived from the restored text).
- **Mobile (375px)**: no horizontal page overflow; panes stack (preview below
  editor); a 400-char code line scrolls inside the `<pre>`/preview, not the page.

## Notes / gotchas handled

- Pre-seed `markdown-previewer:help-seen:v1` via `addInitScript` in every suite
  except the dedicated first-load suite (which uses a fresh `browser.newContext`).
- The preview render is **debounced (~120ms)**: tests wait for the rendered
  element (`expect(...).toBeVisible()`) before asserting on it or clicking Copy,
  rather than reading the preview immediately after `fill`.
- Persistence asserts the `localStorage` blob via `expect.poll` first, then adds
  a ~400ms settle wait before `reload()` to avoid the `file://` write-then-reload
  race (`docs/conventions.md` § Responsive & mobile).
- Clipboard over `file://` is flaky, so the Copy test asserts on the button flash
  (the app's `execCommand` fallback still makes the copy path succeed) rather
  than reading the clipboard.
