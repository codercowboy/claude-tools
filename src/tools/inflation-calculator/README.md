# Inflation Calculator

A single-file, offline web tool that answers **"what is $X from year A worth in
year B?"** using bundled U.S. inflation data.

Open `index.html` in any modern browser — straight from `file://`, no server, no
build, no network. Enter a dollar amount, pick a **from** year and a **to** year,
and see:

- the **equivalent amount** in the target year,
- a plain-English **"$X in YYYY has the same buying power as $Y in ZZZZ"** sentence,
- the **cumulative inflation %** over the span,
- the **average annual inflation rate %** (compounded), and
- a small **CPI-U trend line** across the selected span.

Your amount and year selections are remembered on this device (via
`localStorage`); nothing is ever sent anywhere.

## Data source & citation

The tool bundles the **U.S. Bureau of Labor Statistics Consumer Price Index for
All Urban Consumers (CPI-U)**:

- **Series:** `CUUR0000SA0` — U.S. city average, all items, not seasonally
  adjusted.
- **Values:** the **annual average** index for each year (BLS period `M13`).
- **Base period:** 1982-84 = 100.
- **Range shipped:** **1913 – 2025** (the most recent *complete* calendar-year
  annual average; the in-progress current year is excluded until its annual
  average is finalized).
- **Source:** U.S. Bureau of Labor Statistics — <https://www.bls.gov/cpi/>.
- **License:** BLS data is a **U.S. Government work — public domain.** No usage
  restrictions; cited here for provenance.

The data is committed as `source/cpi-data.json` and **inlined into the shipped
`index.html` at build time**, so the tool is fully offline at runtime.

### How the shipped data was obtained

The committed snapshot was **hand-entered from BLS's published CPI-U
annual-average table** (public domain), and its two most-recent values were
**verified against the live BLS API** at build time (2024 = 313.689,
2025 = 321.943). A fully automated full-history fetch was not possible from the
build sandbox: `download.bls.gov` blocks non-interactive clients, and the
keyless BLS API v1 ignores the requested year range (returning only the latest
few years). The full 1913→present history requires a free BLS API registration
key.

### Refreshing the data

`source/build-data.mjs` refreshes `source/cpi-data.json` from the BLS API. It is
**not** part of `npm run build` or `npm test` (no network at build/test time).

```bash
# Recent years via the keyless v1 API, merged into the committed snapshot:
npm run build:data

# Full 1913→present history via the v2 API (free key from
# https://data.bls.gov/registrationEngine/):
BLS_API_KEY=your_key_here npm run build:data

# then re-inline the refreshed data into index.html and commit both:
npm run build
```

## Notes & limitations

- Figures are **nominal-dollar comparisons** using the national CPI-U basket —
  they reflect the U.S. average, not any one region, city, or household.
- Uses **annual averages**, not monthly or seasonally adjusted values.
- CPI-U is a U.S. index; the tool is USD-only.
- No forecasting beyond the shipped data range; years outside 1913–2025 are not
  selectable.

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from
`source/` and must never be hand-edited.

```
source/
├── index.template.html   # page shell + include/inline tokens + data bootstrap
├── styles.css            # tool colors & layout
├── logic.mjs             # pure, DOM-free engine (adjust / rates / formatting)
├── app.mjs               # DOM wiring, render, persistence, Help modal
├── cpi-data.json         # committed BLS CPI-U snapshot (inlined into the page)
└── build-data.mjs        # data refresh script (npm run build:data)
```

Edit `source/`, then:

```bash
npm run build         # regenerate index.html from source/
npm run build:check   # verify index.html matches source/ (CI guard)
npm test              # unit (node --test) + e2e (@playwright/test)
```

The pure logic in `source/logic.mjs` is DOM-free and unit-tested directly; each
math function (`adjust`, `cumulativeInflation`, `annualRate`, `dataRange`) is
deterministic given a passed CPI map.

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
