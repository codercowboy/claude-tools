# __TOOL_TITLE__

> Skeleton stub — replace this with the tool's real usage. `__TOOL_DESC__`

__TOOL_TITLE__ ships as a single self-contained `index.html` that opens straight
from `file://` — no server, no build, no dependencies. Open it in a modern
browser and type in the top box.

## Developing (build from source)

The shipped `index.html` is **generated** — never hand-edit it. Author under
`source/`, then rebuild:

```sh
npm install          # installs @playwright/test (dev-only)
npm run build        # source/ → index.html
npm run build:check  # fails if the committed index.html is stale
npm test             # build:check + unit (node --test) + e2e (playwright)
npm run serve        # serve this dir over http:// for file://-differing behavior
```

- `source/index.template.html` — page shell + `<<jbc:include …>>` / `<<jbc:inline …>>` tokens.
- `source/styles.css` — the tool's own palette-specific styles.
- `source/logic.mjs` — the pure, DOM-free engine (imported by `tests/unit/`).
- `source/app.mjs` — DOM wiring, persistence, Help modal, and the `window.__<tool>` test hook.

See `project-structure/build-pipeline.md` and `project-structure/testing.md`.

<!-- readme-footer (assets/readme-footer.md) — {{project.*}} filled from project.json. -->

---

Part of **[{{project.name}}]({{project.repo}})** — {{project.tagline}}.

Licensed under the **[MIT License]({{project.repo}}/blob/main/LICENSE)**. Any bundled third-party libraries are listed in the tool's in-app **License** dialog (footer) and in the repository's [`NOTICES`]({{project.repo}}/blob/main/NOTICES) file.

Code by Claude &middot; Ideas by Jason, the ideas guy.
