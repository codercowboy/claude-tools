# Pre-task receipt — Phase 3f Round A (port: src/gallery)

**Date:** 2026-10-03 · session 0004

> **Authorization:** session-0004 standing autonomous-drive authorization (Gate B) + user explicitly chose "Split into two rounds" for Phase 3f. This is Round A (gallery port); Round B is the retire + toolchain/README cleanup.

## Roster shown (ship team, serial)
```
builder   · charter: shipping   · sonnet
verifier  · charter: verifier   · sonnet
  ↳ on FAIL only: verify ↔ bug-fixer loop · bug-fixer · sonnet · cap 2 (then surface blocker)
```

## Definition of done
Port `src/gallery` (the landing page; 10th build target) onto the ct lib. It's a STATIC page — `source/index.template.html` + `styles.css`, no app.mjs, no tests.
- Template: `<<ct:include gallery.css>>` → `<<ct:lib components/styles/gallery.css>>`; `<<ct:include footer.html>>` → `<<ct:lib components/footer.html>>`; keep `<<ct:inline styles.css>>`.
- The old footer inlined `license.js` (so the footer License button worked). The new footer.html dropped that → ADD a `<script type="module"><<ct:module components/CtLicense.mjs>></script>` so the gallery's footer License button still opens the modal (CtLicense self-wires `[data-ct-license]`).
- MANDATORY smoke-check: headless load of the built gallery `index.html` → ZERO pageerror/console.error AND `[data-ct-license]` present AND clicking it opens the License modal (there is no test harness, so the smoke-check IS the behavior gate).
- Gates: no `<<ct:include>>` remain in `src/gallery/source`; smoke clean; `build-all --check` 10/10.

## Paths
- in (read): `src/lib/components/` (footer.html, CtLicense.mjs, styles/gallery.css), epic decisions.md (recipe + R6 smoke-check lesson)
- out (write): `src/tools/.. ` NO — `src/gallery/source/` + the regenerated `src/gallery/index.html`

## Advanced
time 1h · scope: src/gallery only · models sonnet · retries builder 5 / verify-loop cap 2 / verifier 1

**Accepted:** standing autonomous authorization (session 0004 Gate B) + user "Split into two rounds"
