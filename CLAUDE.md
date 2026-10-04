# CLAUDE.md — working in claude-tools

claude-tools is a portfolio of single-file, vanilla-JS web tools under `src/tools/*`. Each tool ships one self-contained `index.html` (assembled from its `source/`) that runs from `file://` with no runtime dependencies. The dev/test dependencies live once in the root `package.json`; there is no per-tool `package.json`. Full architecture: `docs/technical.md`.

## Dev commands

Everything runs through `ct` (`scripts/ct.mjs`, the `ct` bin) or the matching root `npm` scripts:

- `npx ct build [tool]` — assemble every tool's `index.html` (or just one) from its `source/`
- `npx ct dist` — build, then assemble the deployable `dist/` (gallery at `dist/index.html`, each tool at `dist/<tool>/index.html`)
- `npx ct test [tool]` — run the full suite (`src/lib` unit + every tool's e2e), or one tool's unit + e2e
- `npx ct serve [tool]` — serve a tool (or the whole gallery) over `http://localhost:8080`
- `npx ct run` — open the built gallery in a browser

Setup is a single root install: `npm install`, then `npx playwright install chromium`. There is no per-tool install step.

## Living docs — keep these in sync

Some things about the repo are hand-maintained, not generated. When you add or change a tool, update the ones that apply **in the same change**, so the repo stays honest.

### When a tool is ADDED

- **`src/gallery/source/index.template.html`** — add the tool's `<a class="tool">` card, then `npx ct build` to regenerate `src/gallery/index.html`. Never hand-edit the built file.
- **`README.md`** — add a row to the **The tools** table.
- **`docs/alternatives.md`** — add the tool's alternatives/analogs entry. Research and verify every link against its real page; never list from memory (see the `jbc-voice` conventions).
- **`docs/technical.md`** — the overview names the count and lists the tools ("The nine tools are …"); update that. Add to the dependency/toolkit breakdown only if the tool introduces a new dev dependency.
- **Root `package.json`** — add relevant `keywords`. Any new dev dependency the tool's tests need goes in the root `devDependencies` (not in the tool dir).
- **Preview assets** — add the tool's own `preview.png`; regenerate `docs/images/tools-preview.gif` with `node scripts/build-preview-gif.mjs` if you refresh the montage.
- **`dist/`** — `npx ct dist` to regenerate the committed deployable tree (the new tool is picked up automatically), then commit it.

### When a tool is CHANGED

- **Rebuild and commit `index.html`** — `npx ct build <tool>`. The committed `index.html` must match `source/`; `build:check` and the test runner both fail on drift.
- **Regenerate and commit `dist/`** — `npx ct dist`. `dist/` is committed, so it goes stale whenever a built `index.html` or the gallery changes.
- **The tool's own `README.md` / `DESIGN.md` / `PLAN.md`** — if behavior changed.
- **The gallery card + the README table row** — if the one-line description changed.
- **Re-run `npx ct test <tool>`**, and regenerate the tool's `preview.png` if the UI changed.

### Auto-discovered — do NOT hand-register a tool

`ct`'s verbs and the `scripts/build-all.mjs`, `scripts/dist.mjs`, and `scripts/test-all.mjs` runners find tools by scanning `src/tools/` — build and dist by a `source/index.template.html`, the tests by a `tests/playwright.config.mjs`. A new tool with those files is picked up automatically. There is no tool list in `ct` or the runners to edit. `scripts/new-tool.mjs` scaffolds a tool with the right layout (no per-tool `package.json`). (`dist/` output is generated — regenerate it with `ct dist`, never hand-edit it.)

## House voice for docs

Project docs (`README.md`, `docs/technical.md`, `docs/alternatives.md`) follow Jason "Coder Cowboy" Baker's house voice. Before writing or revising one, get oriented with the `jbc-voice` skill. Reference/technical docs are third-person and neutral; the README is warm and first-person. Scan a draft against the `jbc-voice` anti-patterns (Claudisms) before calling it done.
