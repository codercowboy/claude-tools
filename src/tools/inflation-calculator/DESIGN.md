# Inflation Calculator — DESIGN

Source-of-truth spec for the `inflation-calculator` tool.

## What it is

A single-file, offline web tool that answers "what is $X from year A worth in
year B?" using the **U.S. Bureau of Labor Statistics CPI-U** annual series
(`CUUR0000SA0` — Consumer Price Index for All Urban Consumers, U.S. city
average, all items, base period **1982-84 = 100**).

Enter an **amount**, a **from** year, and a **to** year; the tool shows:

- the **equivalent amount** in the target year (big, primary result),
- a plain-English **"$X in YYYY has the same buying power as $Y in ZZZZ"**
  sentence,
- the **cumulative inflation %** over the span,
- the **average annual inflation rate %** (CAGR) over the span,
- a tiny inline **SVG trend line** of the CPI across the selected span
  (decorative, `aria-hidden`).

Everything runs locally. The CPI dataset is **bundled into the shipped
`index.html`** at build time, so the tool is fully offline at runtime — no
network request is ever made.

## Data

- **Series:** `CUUR0000SA0` (CPI-U, U.S. city average, all items, NSA).
- **Values:** the **annual average** index for each year (BLS period `M13`).
- **Base:** 1982-84 = 100.
- **Range shipped:** **1913 – 2025** (2025 is the most recent *complete*
  calendar-year annual average; the in-progress current year is intentionally
  excluded because its annual average is not yet final).
- **Source / license:** U.S. Bureau of Labor Statistics, <https://www.bls.gov/cpi/>.
  BLS data is a **U.S. Government work — public domain**. Cited, no license
  restriction.

### Data path used (build-time acquisition)

The scope calls for a build-time fetcher writing `source/cpi-data.json`, inlined
into the shipped HTML so runtime stays offline. In this environment:

- `download.bls.gov` (the flat file `cu.data.1.AllItems`) returns **HTTP "Access
  Denied"** to non-interactive clients (bot mitigation).
- The **BLS public API v1** (`api.bls.gov/publicAPI/v1`, no key) is reachable
  and returns `M13` annual values — **but** the unregistered/keyless v1 tier
  **ignores `startyear`/`endyear`** and only ever returns the latest ~3 years.
  The full 1913→present history requires an API **registration key** (v2),
  which this sandbox does not have.

**Therefore the shipped `source/cpi-data.json` is a committed snapshot**
hand-entered from BLS's published CPI-U annual-average table (public domain).
The two most-recent values were **verified live** against the BLS API v1 at
build time (2024 = 313.689, 2025 = 321.943 — both matched). `source/build-data.mjs`
is the documented refresh script: with a `BLS_API_KEY` set it fetches the full
range via the v2 API; without one it fetches the recent years via v1 and
**merges** them into the existing snapshot (updating the tail, preserving
history). It is wired as `npm run build:data` and is **not** part of `build` or
`test` (no network at build/test time).

### `source/cpi-data.json` shape

```json
{
  "series": "CUUR0000SA0",
  "seriesTitle": "CPI for All Urban Consumers (CPI-U), U.S. city average, all items",
  "base": "1982-84=100",
  "source": "U.S. Bureau of Labor Statistics",
  "sourceUrl": "https://www.bls.gov/cpi/",
  "note": "Annual average index (BLS period M13). Public domain (U.S. Government work).",
  "lastUpdated": "2026-09-07",
  "data": { "1913": 9.9, "1914": 10.0, ... "2025": 321.943 }
}
```

The build inlines this file verbatim into the page via
`window.__INFLATION_CPI__ = <<ct:inline cpi-data.json>>;` (a JSON object literal
is valid JS), so `app.mjs` reads it from the global with zero runtime I/O.

## Pure logic (`source/logic.mjs`, DOM-free, unit-tested)

Every function is deterministic given a passed `cpi` map (`{ year: index }`,
year keys may be numbers or numeric strings). Presentation lives in `app.mjs`.

- `dataRange(cpi) → { minYear, maxYear }` — numeric min/max of the years present.
- `cpiFor(year, cpi) → number` — index for a year; **throws** a friendly
  `Error` when the year is outside the data (`"No CPI data for 1800. Data covers
  1913–2025."`).
- `adjust(amount, fromYear, toYear, cpi) → number` — `amount × cpi[to]/cpi[from]`.
- `cumulativeInflation(fromYear, toYear, cpi) → number` — percent change,
  `(cpi[to]/cpi[from] − 1) × 100`.
- `annualRate(fromYear, toYear, cpi) → number` — average annual rate (CAGR) in
  percent: `((cpi[to]/cpi[from])^(1/(to−from)) − 1) × 100`; `0` when
  `to === from`. Direction-agnostic (n = `to − from`; a reversed span yields the
  same-magnitude positive rate, matching the forward span).
- `formatUSD(n) → string` and `formatPercent(n) → string` — shared, testable
  display formatting (so the sentence, the tiles, and any copy all agree).

Out-of-range / non-finite inputs surface as thrown `Error`s the UI catches and
shows in an `aria-live` region.

## UI

Single centered card (this is a one-purpose tool, not the multi-card layout of
dev-converter), scaling up to a comfortable max-width on wide screens.

- **Inputs row:** Amount (text, `inputmode="decimal"`, in-field copy when
  non-empty), **From year** `<select>`, a **swap** (⇄) button, **To year**
  `<select>`. Both selects are bounded by `dataRange` (descending, most-recent
  first is friendlier; from defaults to an older year, to defaults to newest).
- **Primary result:** the equivalent amount, large, with an in-field copy.
- **Sentence:** "$100.00 in 1990 has the same buying power as $Y in 2025."
- **Two stat tiles:** Cumulative inflation, Average annual rate.
- **Trend:** small inline SVG polyline of CPI over the span (`aria-hidden`,
  hidden when the span is a single year).
- **Error line:** polite `aria-live`, shown for invalid amount / bad state.
- **Help (?)** button → first-load modal (auto-shows once), with the ✕ close,
  focus trap, Esc/backdrop close, per the repo modal conventions.

### Conventions adopted

- `<<ct:include base.css>>` then `<<ct:include controls.css>>` then the tool's
  own colors; `<<ct:include footer.html>>`, `<<ct:include copy.js>>`.
- 44px control heights; in-field copy (`.ct-field` / `.ct-copy-btn`) on the
  amount and result. `<select>` padding set with **longhands** (chevron trap),
  `min-width` for the year width.
- First-load Help key `inflation-calculator:help-seen:v1`.
- Persist **inputs only** under `inflation-calculator:v1` = `{ amount,
  fromYear, toYear }` (never derived values). `try/catch`, degrade silently.
- og/twitter meta + build-inlined footer.
- `data-testid`s throughout + an inert `window.__inflationCalculator` hook
  exposing the pure functions, the loaded CPI, and deterministic entry points.
- Responsive incl. wide-screen; `touch-action: manipulation` via base.css;
  no secure-context-only APIs (no clipboard-only paths — `copy.js` handles the
  `file://` fallback).

## Destructive actions

None that warrant a confirm — the only inputs are an amount and two dropdowns,
all trivially re-enterable. There is no "Clear list"/bulk-destroy action, so the
`ctConfirm` component is not used. (Documented carve-out per conventions.)

## Non-goals

- Not monthly/seasonal CPI, not chained CPI (C-CPI-U), not regional series.
- No forecasting beyond the shipped data range.
- No currency other than USD; CPI-U is a U.S. index.
