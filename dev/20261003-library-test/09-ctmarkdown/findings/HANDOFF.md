# HANDOFF — 09-ctmarkdown r1 (builder)

Deliverable: `src/lib/tests/unit/CtMarkdown.test.mjs` (test-only; no `src/lib` source touched; no split needed).

## Gate
- `node --test src/lib/tests/` -> tests 622, pass 618, fail 0, todo 4 (2 are mine: KNOWN BUG below).
- `node --test src/lib/tests/unit/CtMarkdown.test.mjs` -> tests 177, pass 175, fail 0, todo 2.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed."
- Mutation proof (temp copies in scratchpad, real lib untouched): removing the javascript:/vbscript: block -> 19 fail; removing `>` escaping -> 11 fail; removing text escaping -> 9 fail.

## Export -> tests
mdToHtml: block/inline/safety/edge tables. parseInline: 3 direct tests (+ refs map). escapeHtmlForMarkdown / escapeAttrForMarkdown: 5 tests. sanitizeUrl: 31-row matrix + 2.

## Construct coverage (all exact byte-output)
Block: ATX h1-6, trailing #s, bare #, 7-hash/no-space negative, setext h1/h2, paragraphs, soft break, blank-line collapse, hr (---/***/___/spaced), blockquote (simple/nested/lazy/4-deep/contains blocks), fenced code (```/~~~, lang->`class="language-X"`, attr-escaped lang, longer fences, markdown not rendered), indented code + tab, ul (-,*,+, marker switch=new list), ol (start=N, `)` delimiter, delimiter switch), nested/mixed/4-deep lists, tight vs loose, multi-para item, lazy continuation, task lists (ul/ol, X), tables (no/left/right/center align, escaped pipe, short row padded, header-only, ends at blank), reference definitions.
Inline: ** __ * _ *** ___ ~~, intraword _ vs *, code spans (double-backtick, escapes, suppresses emphasis), links (title in "", '', (), <angle dest>, nested markup, relative/fragment, shortcut/full ref, case-insensitive, unresolved), autolink + email, image (+title), hard breaks (2-space, backslash), backslash escapes.
Edges: empty/null/undefined/non-string, whitespace-only, trailing newlines, CRLF, lone CR, unicode, U+E000 sentinel stripped, 8 malformed forms, 50-deep blockquote, 5000 paragraphs, double-render byte-identical (x21), no cross-call ref leakage, output framing.

## Safety policy observed (exact)
- Raw HTML is ALWAYS escaped (text, headings, lists, quotes, table cells, link text, code). Test fuzz asserts no unescaped `<` outside the emitted-tag whitelist. Comments and entity-looking text escaped (`&lt;` -> `&amp;lt;`).
- Blocked URL => attribute KEPT but emptied: `<a href="">`, `<img src="">` (not dropped). Blocked: javascript:, vbscript: (case-insensitive, whitespace/control-char and numeric/hex entity smuggling), all data: in links/autolinks. data:image/* allowed for images only. Non-scheme (relative, `//host`, `#frag`), http(s), mailto, tel pass.
- URL/title/alt are attribute-escaped (`& < > " '`); quotes cannot break out. Nothing found UNSAFE.

## Observations / bugs (lib not edited)
1. **BUG (data corruption, not security):** `mdToHtml` ends with `.replace(/\n{2,}/g,'\n')` over the whole output, so blank lines INSIDE `<pre><code>` (fenced or indented) are deleted. Pinned as 2 `todo` tests asserting the correct output + 1 test pinning current behavior. Fix: collapse only outside `<pre>`, or don't rely on the global collapse.
2. **Spec drift:** `mdToHtml(src, opts)` never reads `opts`. `{allowImage:true}` is a no-op there; images ALWAYS allow `data:image/` (parseLinkOrImage passes `allowImage:isImage`). Pinned (opts true/false/undefined/null identical). `data:image/svg+xml` is therefore allowed in `<img>` (script-inert in img context, but note it). `sanitizeUrl` itself does honor `allowImage`.
3. Minor: intraword `*` emphasizes (`2*3*4` -> `2<em>3</em>4`); mailto autolink permits `"` in local part (attr-escaped, safe).

## Repro
```
node --test src/lib/tests/
node --test src/lib/tests/unit/CtMarkdown.test.mjs
node scripts/build-all.mjs --check
```
