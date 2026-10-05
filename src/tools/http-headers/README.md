# HTTP Header Explainer

A no-network HTTP header explainer, linter, and builder. Paste a raw request or response header block and get each header explained, validated, and checked against a security checklist, or build a recommended header set and copy it. One self-contained `index.html`; opens straight from `file://`, zero runtime dependencies.

## Use it

Open `index.html` in a browser.

- **Input** - paste a request, a response, `curl -i` / `curl -v` output (`< ` / `> ` prefixes), or HTTP/2 lowercase headers. Handles CRLF/LF, obsolete line folding, and redirect chains (the last response is analysed; pick another from the Message menu). "Treat as" overrides request/response detection.
- **Explain** - a card per header with purpose, example, pitfalls, and a spec reference (RFC / MDN text, offline), plus warnings for deprecated, duplicated, or malformed values.
- **Checklist** - pass / warn / fail / info for HSTS, CSP, X-Content-Type-Options, clickjacking protection, Referrer-Policy, Permissions-Policy, COOP/CORP/COEP, cookie flags, deprecated headers, information disclosure, CORS sanity, and cache sensitivity, each with a ready-to-paste fix. Summary counts only, no letter grade.
- **Build** - presets (Static site, API/JSON, SPA, Download) or pick headers yourself; copy the block, download `.txt`, or switch to nginx / Apache / Express snippets.

Your pasted text is remembered locally, but the values of `Authorization`, `Cookie`, `Set-Cookie`, and `Proxy-Authorization` are replaced with `[redacted]` before saving.

## Develop

Author in `source/` (`index.template.html`, `styles.css`, `logic.mjs`, `app.mjs`), then `npm run build`. Never hand-edit `index.html`.

```
npm run build        # assemble index.html
npm run build:check  # fail if index.html is stale
npm run test:unit    # node --test (pure logic in source/logic.mjs)
npm run test:e2e     # Playwright, file:// (run with --workers=1 on shared hosts)
```

`source/logic.mjs` is DOM-free: `parseHeaderBlock`, the knowledge base (`KB`), `securityChecklist` / `analyze`, `buildHeaderBlock`, and `redactForStorage`.

## License

MIT - see the footer's License link in the app.
