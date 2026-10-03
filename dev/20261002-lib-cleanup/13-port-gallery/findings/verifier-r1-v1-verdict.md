# Verifier r1 v1 verdict - 13-port-gallery: PASS

| DoD row | Command | Evidence | Result |
|---|---|---|---|
| Smoke-check (behavior gate) | prescribed playwright one-liner (+ "MIT License" text check) | `btn: true modalVisible: true MIT: true errors(0)` | PASS |
| No flat includes | `grep -nE "<<ct:include" src/gallery/source` | no output, rc=1 | PASS |
| Template uses lib | grep ct:lib/module/inline | L14 `<<ct:lib components/styles/gallery.css>><<ct:inline styles.css>>`; L80 `<<ct:lib components/footer.html>>`; L81 `<script type="module"><<ct:module components/CtLicense.mjs>></script>` | PASS |
| Rebuild | `node scripts/build-tool.mjs --dir="src/gallery"` | `built index.html (18749 chars)` | PASS |
| build-all --check | `node scripts/build-all.mjs --check` | `Checked 10 tool(s); 0 failed.` | PASS |
| Built html | grep | `data-ct-license` x3 lines; `CtLicense|openLicense` x10 lines; no `<<ct:`, `{{X}}`, `__X__` tokens | PASS |
| Scope | `find -newer src/gallery/source/index.template.html` (excl. dev/.claude/tmp) | only `src/gallery/index.html`; lib/scripts/tools/project.json mtimes (13:07-13:25, Oct 2) all predate builder edit (16:42) | PASS |

I edited nothing in the gallery/lib; my build-tool run was a deterministic regenerate only.
