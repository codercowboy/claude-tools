# Inflation Calculator — PLAN

Implementation plan derived from `DESIGN.md`. Build-assembled from `source/`.

## Files

- `source/cpi-data.json` — committed CPI-U snapshot (meta + `data` map,
  1913–2025). Canonical data artifact; inlined into the page by the build.
- `source/build-data.mjs` — dependency-free refresh script (v2 API with a
  `BLS_API_KEY`, else v1 merge). Wired as `npm run build:data`; **not** part of
  `build`/`test`.
- `source/logic.mjs` — pure engine: `dataRange`, `cpiFor`, `adjust`,
  `cumulativeInflation`, `annualRate`, `formatUSD`, `formatPercent`. DOM-free,
  exported; imported by unit tests and inlined into `app.mjs`.
- `source/app.mjs` — DOM wiring, render, persistence, Help modal, test hook.
  Reads the bundled CPI from `window.__INFLATION_CPI__`.
- `source/styles.css` — tool colors/layout (light + dark).
- `source/index.template.html` — page shell + include/inline tokens + the
  `window.__INFLATION_CPI__ = <<ct:inline cpi-data.json>>;` data bootstrap.
- `package.json`, `README.md`, `DESIGN.md`, `PLAN.md`.
- `tests/unit/` — dir created now; the suite itself is a later stage.

## Build wiring

Template `<style>` order: `<<ct:include base.css>><<ct:include controls.css>><<ct:inline styles.css>>`.
Body: `<<ct:include footer.html>>`, then `<script><<ct:include copy.js>></script>`,
a `<script>` setting `window.__INFLATION_CPI__`, then
`<script type="module"><<ct:inline app.mjs>></script>` (which begins with
`<<ct:inline logic.mjs>>`).

## Steps

1. Write `cpi-data.json` (generated/validated via a throwaway script so the JSON
   is well-formed and years are contiguous 1913→2025).
2. Write `logic.mjs` (pure functions + friendly range errors).
3. Write `app.mjs` (state, DOM refs, render pipeline, selects population, swap,
   in-field copy, Help modal, persistence, `window.__inflationCalculator`).
4. Write `styles.css`, `index.template.html`.
5. Write `build-data.mjs` refresh script.
6. Write `package.json` (from base64-tool template; name
   `@codercowboy/inflation-calculator`; add `build:data` script) + `README.md`.
7. `npm run build` then `npm run build:check` (both exit 0).
8. `node -e` self-check of `adjust` against known CPI values.

## Validation checks

- `adjust(100, 1990, 2025, cpi)` ≈ `100 × 321.943/130.7` ≈ `$246.32`.
- `dataRange` → `{ minYear: 1913, maxYear: 2025 }`.
- `cpiFor(1800, cpi)` throws a friendly range error.
- `annualRate(1990, 2025, cpi)` ≈ a low-single-digit %/yr.
