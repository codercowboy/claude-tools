# markdown-previewer

A single-file, dependency-free HTML **Markdown previewer**. Type Markdown in the
left pane and see the rendered HTML live in the right pane. The Markdown → HTML
conversion is **hand-rolled** — no library, no CDN, no network — so everything
runs locally in your browser and works straight from `file://`.

## Usage

Open `index.html` directly in a browser (double-click it, or `open index.html`) —
no server, build step, or install required. It also works fine served from a
static file server if you'd rather.

- **Editor / preview.** Type Markdown on the left; the preview updates live
  (briefly debounced) on the right. The editor has an in-field copy button
  (top-right, revealed once you've typed something) for grabbing the raw
  Markdown. On narrow screens the two panes stack vertically. Both panes scroll
  within their own containers — long code blocks and wide tables scroll inside
  the preview, never the page.
- **Side by side** (toggle): switches the layout between side-by-side columns
  (the default) and a stacked top/bottom view, where the editor is a smaller
  pane on top and the preview the taller pane below.
- **Sync scroll** (toggle): when on, scrolling one pane scrolls the other
  proportionally.
- **Copy HTML** copies the rendered HTML source to your clipboard.
- **Clear** empties the editor (it asks first — the editor can hold a lot of
  hand-written Markdown).
- **Load sample** fills the editor with a Markdown cheat-sheet that exercises
  every supported construct.

Your editor text, the sync-scroll toggle, and the side-by-side/stacked view are
remembered on this device (`localStorage`), so reopening the tool picks up where
you left off. The rendered HTML is always recomputed from the text, never stored.

## Supported Markdown

A CommonMark-ish subset plus a few GitHub-Flavored-Markdown extensions:

**Blocks**

- ATX headings (`#` … `######`, optional closing `#`s) and setext headings
  (`===` → h1, `---` → h2).
- Paragraphs, with hard line breaks (two-or-more trailing spaces, or a trailing
  `\`).
- Fenced code blocks (` ``` ` or `~~~`) with an optional language
  (→ `<pre><code class="language-x">`) and indented (4-space) code blocks.
- Blockquotes, including nested (`> >`).
- Ordered and unordered lists, nested by indentation, tight or loose.
- GitHub task lists — `- [ ]` / `- [x]`.
- Horizontal rules (`---`, `***`, `___`).
- GitHub pipe tables with per-column alignment (`:---`, `:---:`, `---:`).

**Inline**

- Bold (`**`/`__`), italic (`*`/`_`), bold+italic (`***`), strikethrough (`~~`),
  and inline code (`` ` ``, multi-backtick spans supported).
- Links `[text](url "title")`, images `![alt](url "title")`, autolinks
  `<https://…>` / `<email@host>`, and reference-style links/images
  (`[text][ref]`, `[text][]`, `[text]` + `[ref]: url "title"`).
- Backslash escapes for ASCII punctuation.

### HTML safety

Even though this is a local tool, raw HTML is **escaped by default** rather than
passed through — pasting `<script>…</script>` renders as visible, inert text —
and link/image URLs are sanitized so dangerous schemes (`javascript:`,
`vbscript:`, and `data:` for links) are neutralized. This makes the preview safe
to point at any pasted content. (It also means "passthrough HTML" that some
Markdown flavors allow is intentionally not rendered — see `DESIGN.md`.)

### Out of scope

Deliberately not supported (to keep it a focused live previewer): passthrough
raw HTML, footnotes, definition lists, math (LaTeX), syntax highlighting (a
`language-x` class is emitted for a highlighter to hook, but none ships),
front-matter, and file export.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. The tool is
authored under `source/` and assembled into the one self-contained file (see
`docs/conventions.md` § "Build-assembled tools"):

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS (including full rendered-preview
  typography for light and dark themes).
- `source/logic.mjs` — the **pure, DOM-free** Markdown parser (`mdToHtml` and
  helpers). Imported directly by the unit tests.
- `source/app.mjs` — the DOM wiring (editor ↔ preview, toolbar, help,
  persistence).

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

## Notes

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. It's assembled by a dependency-free Node build.
- The preview's `innerHTML` is only ever assigned the tool's **own** generated
  HTML (which escapes all raw user HTML), never a user string directly.
- For automated testing, the page exposes `window.__markdownPreviewer` with the
  pure functions `mdToHtml(src, opts)`, `parseInline(src, refs)`,
  `escapeHtmlForMarkdown(s)`, and `sanitizeUrl(url, opts)`; the deterministic entry point
  `render()`; and a live (non-cloned) `state` reference. This namespace has no
  effect on normal use.

<!-- readme-footer: keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
