// =====================================================================
// markdown-previewer — pure parser (DOM-free, exported, unit-testable).
//
// The safe Markdown -> HTML renderer (block + inline parser, URL sanitizer) now
// lives in the shared, Node-importable module src/lib/utils/formats/CtMarkdown.mjs (promoted
// to jason-code, vendored here). This file imports it and re-exports its API, and
// keeps the tool-specific SAMPLE_MARKDOWN cheat-sheet local. The unit tests load
// this module's namespace and the app inlines this file at build time, so the
// surface is unchanged; the build resolves the import and inlines the engine body
// (stripping each export) so the shipped index.html stays dependency-free. Raw
// HTML is always escaped and link/image URLs are sanitized (see DESIGN.md
// § "HTML safety / XSS stance").
// =====================================================================
import {
  mdToHtml,
  parseInline,
  escapeHtmlForMarkdown,
  escapeAttrForMarkdown,
  sanitizeUrl,
} from '../../../lib/utils/formats/CtMarkdown.mjs';

// ---- Load-sample cheat-sheet (pure data) -----------------------------
const SAMPLE_MARKDOWN = [
  '# Markdown Previewer',
  '',
  'A **live** preview of _hand-rolled_ Markdown → HTML. Type on the left,',
  'see the rendered result on the right.',
  '',
  '## Text formatting',
  '',
  '**bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`,',
  'and a hard break at the end of this line.  ',
  'This text is on a new line.',
  '',
  '## Headings',
  '',
  '### H3',
  '#### H4',
  '',
  'Setext H2',
  '---',
  '',
  '## Lists',
  '',
  '- Unordered item',
  '- Another item',
  '  - Nested item',
  '  - Nested item two',
  '',
  '1. Ordered item',
  '2. Ordered item',
  '   1. Nested ordered',
  '',
  '### Task list',
  '',
  '- [x] Write the parser',
  '- [x] Style the preview',
  '- [ ] Ship it',
  '',
  '## Blockquotes',
  '',
  '> A quote.',
  '>',
  '> > A nested quote.',
  '',
  '## Code',
  '',
  '```js',
  'function greet(name) {',
  '  return `Hello, ${name}!`;',
  '}',
  '```',
  '',
  '## Links & images',
  '',
  '[A link](https://example.com "Example") and an autolink <https://example.com>.',
  '',
  'Reference-style: [claude-tools][repo].',
  '',
  '[repo]: https://github.com/codercowboy/claude-tools "claude-tools"',
  '',
  '## Table',
  '',
  '| Feature      | Supported | Notes            |',
  '| :----------- | :-------: | ---------------: |',
  '| Headings     |    yes    |     ATX + setext |',
  '| Tables       |    yes    | with alignment   |',
  '| Task lists   |    yes    |          GFM     |',
  '',
  '---',
  '',
  // NB: the closing tag below is written with an escaped slash so this inline
  // sample can't prematurely terminate the shipped page's script element; in
  // JS the string value is unaffected (backslash-slash is just a slash).
  'Raw HTML like `<script>alert(1)<\/script>` is escaped, not executed.',
  '',
].join('\n');

export {
  mdToHtml,
  parseInline,
  escapeHtmlForMarkdown,
  escapeAttrForMarkdown,
  sanitizeUrl,
  SAMPLE_MARKDOWN,
};
