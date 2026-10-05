# Pretty-Printer & Minifier — PLAN

Implementation plan from `DESIGN.md`. Files and the Opus build train.

## Files

```
src/tools/pretty-printer/
├── DESIGN.md · PLAN.md
├── package.json · README.md · preview.png
├── source/
│   ├── index.template.html   # shell + tab row + input/output + Help modal + tokens
│   ├── styles.css            # + <<ct:include base.css>>
│   ├── logic.mjs             # ALL hand-rolled engines + SAMPLES (pure, exported)
│   └── app.mjs               # tabs (ARIA), mode/indent/options, live run, persistence, hooks
├── index.html                # GENERATED — never hand-edit
└── tests/
    ├── playwright.config.mjs
    ├── unit/{json,yaml,html,css,sql,js,samples}.test.mjs   # ELABORATE
    └── *.e2e.mjs
```

## Build order (engines first, hardest-validated first)

1. **Builder** — implement `source/logic.mjs` engine-by-engine in this order,
   each with its own internal tokenizer where needed:
   1. JSON (trivial, sets the error-message/line:col pattern)
   2. CSS (tokenizer: strings/comments/url/at-rules)
   3. SQL (token-based; keyword list + string/identifier/comment awareness)
   4. HTML (tokenizer: tags/attrs/comments/raw-text elements)
   5. YAML (subset parser + block/flow emitters; explicit unsupported-feature errors)
   6. JS (the crux tokenizer: comments/strings/templates/regex-vs-division; then
      re-indent + safe minify honoring the DESIGN safety rules)
   Then `app.mjs` (tabs + controls + live run + persistence + `window.__prettyPrinter`),
   `styles.css`, `index.template.html` (mirror base64-tool token usage; include
   `JbcConfirm.mjs` for the sample-load guard and `copy.js`), `package.json` (from
   base64-tool; name `@codercowboy/pretty-printer`), first-pass `README.md`.
   Run `npm run build` + `build:check`. No tests / no preview.png this stage.
2. **Verifier #1** — adversarial review vs DESIGN, focus on the safety
   invariants (JS regex/template/ASI, SQL/CSS/HTML string+comment preservation,
   YAML unsupported-feature rejection). CHANGES_REQUESTED → fix before proceeding.
3. **Test-builder** — the headline: **VERY elaborate** `node --test` unit suites
   per language (idempotency, semantic equivalence, per-language invariants,
   adversarial batteries; JS/SQL minify must be validated as still-parseable +
   token-equivalent — use `node:vm`/`new Function`/`node --check`), plus the
   `@playwright/test` e2e suite (tabs/ARIA, per-language format+minify, persistence,
   mobile, first-load Help). `npm install` in the tool dir, run to green.
4. **Documenter** — finalize `README.md` (per-language usage + honest scope/
   limitations of each hand-rolled engine), gallery card in
   `src/tools/source/index.template.html` + rebuild, `preview.png` (~1200×630).
5. **Verifier #2 + fix loop** — full pass vs DESIGN + conventions, re-run
   `npm test`; loop verify→fix (≤5) until APPROVED. Clean install artifacts.

## Risks / notes
- JS tokenizer is the highest-risk component; over-invest tests there. Prefer
  conservative minify (leave a newline) over any ASI risk.
- YAML: keep the supported subset explicit and reject the rest loudly.
- Watch the `<select>` chevron / `background` shorthand trap and the `[hidden]`
  cascade trap (both bit dev-converter's lineage); reuse the fixes.
- Single source of truth per tab; output always derived, never persisted.
