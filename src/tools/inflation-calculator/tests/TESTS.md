# Inflation Calculator — test suite

Two layers, both required and both run by `npm test` (unit first, then e2e).
`build:check` runs in `pretest:unit` / `pretest:e2e`, so a stale `index.html`
(drifted from `source/`) fails the run before any test executes.

```bash
cd src/tools/inflation-calculator
npm install
npx playwright install chromium   # first time only
npm test                          # unit (node --test) + e2e (@playwright/test)
# or individually:
npm run test:unit
npm run test:e2e
```

## Layer 1 — pure-logic unit tests (`node --test`)

Offline, no browser. They import the **same** `source/logic.mjs` the build
inlines into the shipped page (one source of truth, no extraction).

### `tests/unit/logic.test.mjs` — deterministic math on a fixed CPI map

Uses a tiny hand-picked map `{ 2000: 100, 2010: 150, 2020: 200 }` (round numbers
→ exact expected values; keys are numeric strings to prove string/number lookup).

- **`dataRange`** — numeric min/max; throws on an empty/`null` map.
- **`cpiFor`** — number- and string-key lookup; the friendly out-of-range throw
  (`"No CPI data for 1800. Data covers 2000–2020."`); rejects a non-whole year.
- **`adjust`** — CPI-ratio scaling; same-year span returns the amount unchanged;
  reversible round-trip; throws on a non-finite amount / bad year.
- **`cumulativeInflation`** — percent change; `0` on a same-year span; reversed
  span is negative.
- **`annualRate`** — CAGR value; exactly `0` on a same-year span;
  direction-agnostic (reversed span = same-magnitude positive rate); compounding
  the rate across the span reproduces `adjust`.
- **`formatUSD`** — thousands grouping, two decimals, leading minus, `""` for
  non-finite.
- **`formatPercent`** — signed, trailing-zeros trimmed, bare `0%`, `""` for
  non-finite.

### `tests/unit/dataset.test.mjs` — spot-checks against the bundled data

Reads `source/cpi-data.json` (the file inlined into the page) via `fs` +
`JSON.parse` (works on every Node ≥20) and runs the logic against it.

- **Provenance metadata** — `series` `CUUR0000SA0`, `base` `1982-84=100`, a BLS
  `source`, a non-empty `lastUpdated`.
- **Shape** — every key a 4-digit year, every value a finite positive number;
  100+ entries.
- **Contiguity** — years run 1913 → latest (≥ 2025) with no gaps; the index rises
  more than 10× across the century.
- **Documented known values** — `adjust(100, 1990, 2025) ≈ $246.32`; cumulative
  1990→2025 `≈ +146.32%`; annual rate `≈ +2.61%/yr`; `dataRange` = 1913 .. ≥2025.
- **Edges on real data** — same-year span → 0; reversed-span symmetry;
  out-of-range year throws the friendly message naming the real bounds.

## Layer 2 — browser e2e (`@playwright/test`, `file://`)

`tests/inflation-calculator.e2e.mjs` drives the shipped `index.html` from
`file://` via `data-testid`s and the inert `window.__inflationCalculator` hook.
Config: `tests/playwright.config.mjs` (`testMatch: **/*.e2e.mjs`, clipboard
permissions best-effort). Every suite except the first-load one pre-seeds
`inflation-calculator:help-seen:v1` so the auto-modal doesn't intrude; the
first-load suite uses a genuinely fresh `browser.newContext()`.

- **First-load Help** — auto-shows once on a fresh visit, stays closed on reload
  (seen-flag written); re-openable via `?`.
- **Help modal** — opens with focus on the ✕; ✕ / Esc / backdrop all close and
  return focus to `?`; focus trapped inside the dialog; labelled ARIA modal
  (`role=dialog`, `aria-modal`, `aria-labelledby`).
- **Year selects** — both span exactly the CPI range, descending (newest first).
- **Calculation** — $100 1990→2025 → `$246.32`, `+146.32%`, `+2.61%/yr`, and the
  plain-English sentence; `$1,000`-formatted input parsed; swap flips the years
  and recomputes; a trend sparkline renders for a multi-year span.
- **Edge / error** — same-year span → `0%` / `0%/yr` + trend hidden; invalid
  amount shows the error and clears results; empty amount clears without an
  error; out-of-range years aren't selectable.
- **Provenance** — the BLS / CPI-U / `CUUR0000SA0` citation, the `bls.gov/cpi`
  link, and the filled-in covered range are visible.
- **Copy** — amount and result copy buttons flash ✅ then revert to 📋; the amount
  copy button hides when the field is empty.
- **Persistence** — amount + both years survive a reload (with a small settle to
  avoid the `file://` write-then-reload race) and the stored JSON matches.
- **Responsive** — wide (1600px): the card uses width, no horizontal overflow;
  mobile (375px): no horizontal overflow even with a large amount + full span,
  and the calculator still computes.

## Notes / gotchas

- **State via the hook, not write-then-reload.** State changes are driven through
  `window.__inflationCalculator.setInputs(...)` (synchronous `render` +
  `saveState`) to sidestep the `file://` localStorage race
  (docs/conventions.md § Responsive). The one reload test adds a ~400ms settle.
- **`build:data` is out of the test path.** Refreshing the CPI snapshot hits the
  network and is deliberately not part of `build` or `test`.
