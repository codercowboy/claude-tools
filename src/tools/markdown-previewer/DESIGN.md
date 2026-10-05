# markdown-previewer — Design

Author: Claude. Design lead: Jason. Source-of-truth spec.

## Summary

A single, self-contained `index.html` (vanilla, no build/deps/CDN, `file://`-safe)
for **live Markdown → HTML preview**. A two-pane layout: a Markdown **editor** on
the left and the **rendered HTML preview** on the right, updating live as you
type. The Markdown → HTML conversion is **hand-rolled** (no library) and covers a
CommonMark-ish subset plus a few GitHub-Flavored-Markdown extensions (task lists,
pipe tables, strikethrough). Everything is local — no network, nothing leaves the
browser.

## Hard constraints

- **Ships as one file.** The committed `index.html` is fully self-contained — all
  HTML/CSS/JS inline, no external assets, no CDN, no npm dependencies, opens via
  `file://`. It is **build-assembled** from `source/` by the shared
  dependency-free Node build (`scripts/build-tool.mjs`, `npm run build`; see
  `docs/conventions.md` § "Build-assembled tools"). Author under `source/`
  (`index.template.html`, `styles.css`, `logic.mjs` = the pure parser, `app.mjs`
  = the DOM layer), run `npm run build`, commit the result. `npm test` runs
  `build --check` first so drift can't slip through.
- **Vanilla browser APIs only.** No secure-context-only APIs. The rendered HTML
  is injected via `innerHTML`, but only ever the tool's **own** generated output
  — which escapes all raw user HTML (see § HTML safety) — never a user string
  directly.
- Vanilla JS/Node, ES modules, zero dependencies (dev-only `@playwright/test`).
- Responsive/mobile; icon tooltips; footer + OG meta; per `docs/conventions.md`.

## Supported Markdown subset

The hand-rolled parser (`mdToHtml(src, opts)` in `logic.mjs`) supports:

**Block constructs**

- **ATX headings** `#` … `######` (with optional closing `#`s), and **setext**
  headings (a paragraph underlined by `===` → h1, or `---` → h2).
- **Paragraphs**, with **hard line breaks** (two-or-more trailing spaces, or a
  trailing backslash `\`, before a newline → `<br>`).
- **Fenced code blocks** — ` ``` ` or `~~~`, with an optional **language info
  string** → `<pre><code class="language-x">`. Content is escaped verbatim; no
  inline processing happens inside a code block.
- **Indented code blocks** — 4-space (or 1-tab) indented lines → `<pre><code>`.
- **Blockquotes** with `>`, **nested** (recursion re-parses the quoted content,
  so `> >` nests).
- **Unordered lists** (`-`, `+`, `*`) and **ordered lists** (`1.`, `1)`), with
  **nesting** by indentation and **loose/tight** rendering (a blank line between
  items makes the list loose → item text wrapped in `<p>`).
- **GitHub task lists** — `- [ ]` / `- [x]` → a disabled `<input type="checkbox">`
  (checked for `[x]`/`[X]`) on a `.task-list-item`.
- **Horizontal rules** — `---`, `***`, `___` (3+), → `<hr>`.
- **GitHub pipe tables** with per-column **alignment** (`:---`, `:---:`, `---:`)
  → `<table>` with `thead`/`tbody` and `text-align` styles.

**Inline constructs**

- **Bold** (`**` / `__`), **italic** (`*` / `_`), **bold+italic** (`***`),
  **strikethrough** (`~~`), and **inline code** (`` ` ``, with multi-backtick
  fences for spans containing backticks).
- **Links** `[text](url "title")`, **images** `![alt](url "title")`,
  **autolinks** `<https://…>` and `<email@host>`, and **reference-style**
  links/images (`[text][ref]`, `[text][]`, `[text]` with a matching
  `[ref]: url "title"` definition collected up front).
- **Backslash escapes** for ASCII punctuation (`\*`, `\_`, `\[`, …).

**Parser approach.** Two layers. A **block parser** walks the input line-by-line,
recognising each block type in a fixed precedence order (blank → fenced code →
ATX heading → thematic break → blockquote → list → table → indented code →
paragraph/setext), recursing for blockquote and list-item contents. An **inline
parser** then runs on each block's text: a single left-to-right scan first
extracts the constructs whose delimiters bind tightest and must not be
re-processed (backslash escapes, code spans, autolinks, links, images) into
**stashed placeholders** holding their final, already-escaped HTML; the remaining
text is HTML-escaped; hard breaks and then emphasis/strikethrough are applied by
regex over the escaped text (placeholders contain no emphasis characters, so they
are never mangled); finally the placeholders are restored. Reference-link
definitions are extracted in a preprocessing pass and removed from the block
stream. Everything is **pure and deterministic** (no DOM, no `Date`, no random),
so the unit tests import `logic.mjs` and assert exact HTML for each construct.

## HTML safety / XSS stance

Even though this is a **local, single-user tool**, the parser **escapes raw HTML
by default** and **neutralizes dangerous URLs**, so nothing a user pastes into
the editor can execute script in the preview pane:

- **Raw HTML is escaped, not passed through.** There is no HTML-block or raw-inline-
  HTML rule. Any `<`, `>`, `&`, `"` in ordinary text is escaped
  (`&lt;`/`&gt;`/`&amp;`/`&quot;`), so pasting `<script>…</script>` or
  `<img onerror=…>` renders as **visible, inert text**, never live markup. The
  preview's `innerHTML` is therefore only ever assigned the tool's own generated
  string, whose only tags are the ones the parser itself emits.
- **URLs are sanitized.** Link `href`s and image `src`s (inline, reference, and
  autolink) run through `sanitizeUrl()`, which decodes numeric/hex HTML entities
  and strips control characters before inspecting the scheme, then **blocks**
  `javascript:` and `vbscript:` outright and blocks `data:` for links (allowing
  only `data:image/*` for images). Blocked URLs become empty (`href=""`), so an
  injected `[x](javascript:alert(1))` cannot run. All URLs and titles are
  attribute-escaped.
- Code-block/code-span contents are escaped verbatim. Titles and image alt text
  are attribute-escaped.

This is a deliberate, documented decision: escaping raw HTML slightly limits the
"passthrough HTML" some Markdown flavors allow, but it makes the preview safe to
point at any pasted content, which is the right default for a paste-anything tool.

## Layout

1. **Header** — title + one-line description + Help (`?`) button.
2. **Toolbar** (left → right) — a **Side by side** view-mode toggle, a **Sync
   scroll** toggle, **Copy HTML** (copies the rendered HTML source), **Clear**
   (empties the editor — confirmed, see below), and **Load sample** (fills the
   editor with a Markdown cheat-sheet). The tool adopts the shared
   `controls.css` include (standard 44px control height + the in-field copy
   pattern), placed after `base.css`.
3. **Split pane** — a Markdown **editor** (`<textarea>`, wrapped in a
   `.ct-field.ct-field--multiline` with a reveal-when-non-empty in-field copy
   button) and the **rendered preview** (`<div>`), each scrolling in its own
   container. The **Side by side** toggle switches between the default
   side-by-side **columns** and a **top/bottom stacked** layout; when stacked
   the editor is the **smaller** pane on top and the preview the **taller** pane
   below (a 1fr / 2fr row split). On mobile (≤ 760px) the panes **stack
   vertically** regardless. The preview is a rendered `<div>`, not a textarea,
   so its "Copy HTML" affordance stays a toolbar button.
4. **Help modal** — first-load popup explaining the tool + supported syntax.

**View-mode toggle.** A `.toggle` button with `aria-pressed` — pressed (the
default) is side-by-side; toggling it off switches to top/bottom. Its
pressed/selected state reuses the same accented ("purple") styling as the Sync
scroll toggle (`.toggle[aria-pressed="true"]`).

## Accessibility & UX

- Real controls with labels; `aria-label` + `title` on icon-only buttons;
  visible `:focus-visible`. The editor is a labelled `<textarea>`; the preview is
  a labelled region.
- Copy uses the shared `ctCopy`/`ctFlash` clipboard pattern with feedback.
- **Clear requires confirmation** via the shared `confirmDialog` modal — the editor
  can hold a lot of hand-written Markdown, which is exactly the "substantial /
  hard-to-recreate content" the confirm convention protects (unlike base64-tool's
  low-stakes single-field Clear, which is carved out). `--jbcc-accent` is set to
  the tool's accent, and the generic `button:hover` rule excludes `.jbcc-btn` so
  the highlighted "Yes" keeps its fill on hover.
- **Sync scroll** proportionally maps editor scroll ↔ preview scroll when
  enabled (optional feature; off by default), guarded against feedback loops.
- Honors `prefers-reduced-motion`. Responsive: panes stack on mobile; long lines
  and wide tables/code scroll **inside** the preview/code container, never the
  page body.
- Light **and** dark themes, including full styling of the rendered preview
  (headings, code, blockquotes, tables, task lists, hr, links) in both.

## Persistence

Per `docs/conventions.md` § "Persist UI state (localStorage)". Versioned key
`markdown-previewer:v1`, holding the **editor text**, the **sync-scroll** toggle,
and the **view-mode** (`sideBySide`) toggle. Saved (debounced) on edit / toggle;
restored on load, then the preview is **re-rendered** from the restored text (the
rendered HTML is **derived**, never stored). An older blob missing `sideBySide`
defaults to side-by-side. First-load Help flag under `markdown-previewer:help-seen:v1`. Every
read/write is `try/catch`-wrapped and degrades silently; with no stored state the
tool starts with a short welcome/sample-less empty editor.

## Testability

- `data-testid` on: editor, preview, `copy-html-btn`, `editor-copy-btn` (the
  in-field Markdown copy), `load-sample-btn`, `clear-btn`, `sync-toggle`,
  `view-toggle`, `help-button`, `help-overlay`, `help-modal`, `modal-close-x`.
- `window.__markdownPreviewer`: the pure functions `mdToHtml(src, opts)`,
  `escapeHtmlForMarkdown(s)`, `sanitizeUrl(url, opts)`, `parseInline(src, refs)`; the
  deterministic entry point `render()`; and a live `state` reference. Inert for
  normal users.

## Deliverables

- `src/tools/markdown-previewer/index.html` (generated), `source/*`,
  `package.json`, `README.md`, `DESIGN.md`, `PLAN.md`. (Tests + `preview.png` are
  authored by later pipeline stages.)

## Out of scope (v1)

- Passthrough raw HTML, footnotes, definition lists, math (LaTeX), syntax
  highlighting (we emit `language-x` classes for a highlighter to hook, but ship
  none), front-matter, and exporting to a file. Keep it a focused live previewer.
