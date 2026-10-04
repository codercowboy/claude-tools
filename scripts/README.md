# scripts — the claude-tools build/test scripts

Dependency-free Node scripts (stdlib only, ES modules, Node >= 20) that assemble,
serve and test the tools in this repo. Each script derives `<repo>` as the parent
of its own directory (`scripts/..`), so they run from any working directory.

Day to day you use the `ct` front door (`npm link`, or `node scripts/ct.mjs <verb>`
from a clone); the npm scripts in the root `package.json` call the same things.

## The scripts

| Script | What it does | How to run |
| --- | --- | --- |
| `ct.mjs` | Front-door dispatcher (`bin: ct`). Forwards a verb to a sibling script: `build [--check] [tool]`, `dist`, `test [tool]`, `serve [tool\|dir]`, `run` (opens the built gallery). | `ct <verb>` / `node scripts/ct.mjs <verb>` |
| `build-tool.mjs` | Assembles one tool's committed `index.html` from its `source/index.template.html`: expands `<<ct:inline NAME>>` (the tool's own `source/NAME`), `<<ct:module PATH>>` (ESM-inlines a `src/lib` module) and `<<ct:lib PATH>>` (pastes a `src/lib` file verbatim), fills `{{project.*}}` identity tokens, prepends the "generated" banner. Exports `buildTool`, `runBuild`, `resolveIncludeDir`, `resolveLibDir`, `loadProject`. | Via `build-all.mjs` / `ct build [tool]`; standalone `node scripts/build-tool.mjs --dir=src/tools/<tool>` (`--check` fails if `index.html` is stale). |
| `build-all.mjs` | Builds (or `--check`s) every build-assembled tool (any dir under the scan roots with `source/index.template.html`) plus the gallery (`src/gallery`), or just the tool(s) named. | `npm run build` / `npm run build:check` / `ct build [--check] [tool]` |
| `build-preview-gif.mjs` | Stitches every `src/tools/<tool>/preview.png` into `docs/images/tools-preview.gif`. Run by `ct build` (not by `--check`). | `node scripts/build-preview-gif.mjs` |
| `dist.mjs` | The copy step behind `ct dist`: cleans `dist/`, copies each build-assembled tool's `index.html` to `dist/<tool>/index.html`, and writes the gallery to `dist/index.html` with its `../tools/<tool>/` links rewritten to `<tool>/`. Copies, never moves; generic (walks `src/tools/`). Does not build — `ct dist` / `npm run dist` build first. | `ct dist` / `npm run dist` |
| `test-all.mjs` | No args: runs the `src/lib` unit tests, then every tool under `src/tools/` that has a `tests/playwright.config.mjs`, each via `npx playwright test` from the repo root, in sequence. With tool name(s): just those tools' unit + e2e. Rebuilds each tool `--check` first, so a stale `index.html` fails the run. Needs root deps + Playwright browsers. | `npm run test:all` / `ct test [tool]` |
| `serve.mjs` | Tiny static file server for a directory over `http://` (for behaviour that differs from `file://`). Path-traversal guarded. Port `$PORT` or 8080. | `npm run serve` (serves `src`, gallery at `/gallery/`) / `ct serve [tool\|dir]` (a bare tool name serves `src/tools/<tool>`) |
| `new-tool.mjs` | Scaffolds a new tool by copying [`../src/lib/new-tool-template/`](../src/lib/new-tool-template/) and substituting the `__PLACEHOLDER__` tokens. `--help` lists options (`--name` required). | `node scripts/new-tool.mjs --name=<kebab> [--dest=PATH]` |
| `validate-project.mjs` | Validates a `project.json` against the identity contract (`name` + `repo` required, `repo` an http(s) URL, `tagline` optional). | `node scripts/validate-project.mjs [PATH]` / `--file=PATH` |
| `slice-tool.mjs` | **Legacy** migration aid for the retired flat-include layout. Only works when `$JC_INCLUDE_DIR` is set; otherwise exits 1. | n/a |
| `tests/` | Node test files for the builder's ESM inliner (`esm-inline*.test.mjs`); run with `node --test scripts/tests`. | `node --test scripts/tests` |

## Library tokens

Templates pull shared code from `src/lib/` (`components/`, `utils/`) via:

- `<<ct:module utils/CtZipUtil.mjs>>` — ESM-inlines the module (and its relative
  imports, once, dependencies first); the root module's exports are bound at the
  token site. The builder throws on unsupported forms (`export default`,
  `export *`, `import * as`, cycles, ...); see the header of `build-tool.mjs`.
- `<<ct:lib components/footer.html>>` — pastes a lib file verbatim.
- `<<ct:inline logic.mjs>>` — inlines the tool's own `source/` file.

The old flat `<<ct:include NAME>>` mechanism (and its old flat library dir) is
retired; no tool uses it.

## Config knobs

- **Build roots** (`build-all.mjs`, `$JC_BUILD_ROOTS`): comma- or colon-separated
  repo-relative dirs to scan. Default `src/tools`.
- **project.json search path** (`build-tool.mjs`), first that exists wins:
  `<repo>/.claude/jason-code/project.json`, then `<repo>/project.json` (the one
  this repo ships). If none is found, `{{project.*}}` tokens are left
  unsubstituted and one warning goes to stderr.
- **`$JC_INCLUDE_DIR`** (legacy): the only way to give the retired
  `<<ct:include>>` token an include dir. Unset, such a token fails the build.

## Project-identity tokens

After token expansion, `build-tool.mjs` fills from `project.json`:

- `{{project.name}}` <- `name` (verbatim)
- `{{project.repo}}` <- `repo` (full URL, used in `href`s)
- `{{project.repoLabel}}` <- derived: `repo` with a leading `http(s)://` stripped
- `{{project.tagline}}` <- `tagline`

## `new-tool.mjs` options

`--name` (required, kebab-case) · `--title` · `--desc` · `--hook` (the
`window.__<hook>` test hook) · `--scope` (default `@codercowboy`) · `--group`
(default `com.codercowboy`) · `--dest` (default `./<name>`) · `--force` (allow an
existing empty dest) · `-h`/`--help`. Exit codes: 0 ok · 1 bad usage · 2 template
missing · 3 dest exists/not empty · 4 I/O error.

## `validate-project.mjs` exit codes

0 valid · 1 bad usage · 2 not found · 3 invalid JSON · 4 failed validation.
With no path it searches `.claude/jason-code/project.json`, then `project.json`.
