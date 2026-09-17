# Cron Builder

A single-file, dependency-free web tool for **building, parsing, and
understanding a cron expression**. Edit the raw expression or the per-field
pickers — the two stay in sync — and see a **plain-English explanation** plus
the **next 5 fire times**, all computed offline. Open `index.html` straight from
`file://` — no server, no build, nothing to install. Everything runs locally in
your browser; nothing you type is ever sent anywhere.

## What it does

- **Two-way editing.** The single source of truth is the parsed expression.
  Type into the **raw expression** box, or use the **field pickers** (Every /
  Every N / Range / Specific / Custom) — each side updates the other.
- **Multiple flavors.** Pick a **Flavor** — Standard / Unix (default), Unix with
  seconds, Quartz (Java), Spring @Scheduled, or AWS EventBridge — and the field
  layout, allowed special characters, and day-of-week numbering follow. See
  [Flavors](#flavors).
- **Plain-English explainer.** e.g. `0 9 * * 1-5` → *"At 09:00, on Monday
  through Friday"*.
- **Next 5 runs.** Upcoming fire times in your local time zone, computed with
  pure date math (no library, fully offline).
- **Presets & copy.** Start from a common schedule; copy the expression or the
  run list.

## Flavors

The **Flavor** selector sets the dialect. Standard / Unix is the default.

| Flavor | Fields | Day-of-week | Special chars | Macros |
|--------|--------|-------------|---------------|--------|
| **Standard / Unix** (default) | 5 · `min hour dom month dow` | `0–7`, 0 & 7 = Sun | `* , - /` | yes |
| **Unix with seconds** | 6 · leading `seconds` | `0–7`, 0 & 7 = Sun | `* , - /` | no |
| **Quartz (Java)** | 6 or 7 · `sec min hour dom month dow [year]` | `1–7`, **1 = Sun** | `? L W #` | no |
| **Spring @Scheduled** | 6 · `sec min hour dom month dow` | `0–7`, 0 & 7 = Sun | `? L #` (no `W`) | no |
| **AWS EventBridge** | 6 · `min hour dom month dow year` | `1–7`, **1 = Sun** | `? L W #` | no |

Special characters (only where the flavor allows them):

- **`?`** — "no specific value" (matches like `*`). Quartz & AWS **require
  exactly one** of day-of-month / day-of-week to be `?`.
- **`L`** — last day of month (`L`, or `L-n`); `LW` = last weekday of month;
  day-of-week `nL` = last given weekday (e.g. `5L` = last Friday).
- **`W`** — nearest weekday to a day-of-month (`15W`), never crossing months.
- **`#`** — nth weekday of the month (`6#3` = 3rd Friday in Quartz numbering).

Switching flavor converts the current expression to the new dialect (field
count, day-of-week numbering, and the `?` rule), preserving the weekday meaning
where the flavors allow.

## Supported syntax

Each field is a comma-separated list of terms:

| Term    | Meaning                                  | Example   |
|---------|------------------------------------------|-----------|
| `*`     | every value in the field's range         | `*`       |
| `a`     | a single value                           | `5`       |
| `a-b`   | an inclusive range                       | `1-5`     |
| `*/n`   | every `n`th value across the whole range | `*/15`    |
| `a-b/n` | every `n`th value within a range         | `0-30/10` |
| `a/n`   | every `n`th value starting at `a`        | `5/10`    |
| `a,b,c` | a list (any mix per part)                | `0,15,30` |
| `?`/`L`/`W`/`#` | flavor-specific (see [Flavors](#flavors)) | `? 5L 15W 6#3` |

Field ranges & names (day-of-week numbering is per flavor):

| Field         | Range | Names                                          |
|---------------|-------|------------------------------------------------|
| second (opt.) | 0–59  | —                                              |
| minute        | 0–59  | —                                              |
| hour          | 0–23  | —                                              |
| day-of-month  | 1–31  | `?`, `L`, `W` (flavor-dependent)               |
| month         | 1–12  | `JAN`–`DEC`                                     |
| day-of-week   | 0–7 / 1–7 | `SUN`–`SAT`; unix 0 & 7 = Sunday, Quartz/AWS 1 = Sunday |
| year (opt.)   | 1970–2199 | — (Quartz 7th field / AWS)                 |

The classic macros `@yearly`/`@annually`, `@monthly`, `@weekly`,
`@daily`/`@midnight`, `@hourly` are accepted **in the Standard / Unix flavor**
and expand to their 5-field form.

### Day-of-month vs day-of-week (the OR rule)

Following standard Vixie-cron behavior: when **both** day-of-month and
day-of-week are restricted (neither is `*` or `?`), a day matches when
**either** matches — the two are **OR**'d, not AND'd. When only one is
restricted, only that one constrains the day. The explainer flags this whenever
both are set. A field counts as "restricted" when its text is not `*` and not
`?` (a `*/n` step *is* restricted).

### `?` and day-of-week numbering

`?` ("no specific value") behaves exactly like `*` for matching and reads as
**Every** in the field pickers. It's allowed only in the flavors that support it
(Quartz, Spring, AWS), and Quartz/AWS require exactly one of day-of-month /
day-of-week to be `?`. Day-of-week numbering is flavor-specific: in the unix
flavors `7` is an alias for Sunday (`0`), so `5-7` means Fri–Sun; in Quartz/AWS,
`1` is Sunday through `7` = Saturday. The engine normalizes every day-of-week
value to the same internal convention, so the **next-runs** preview lands on the
correct weekday in every flavor.

## Usage

Open `index.html` in any modern browser (or `npm run serve` to serve it over
HTTP). Edit the expression or the pickers; the explainer and next-runs update as
you go. The **📋** buttons copy the expression / run list (briefly showing a
checkmark). Your expression and the chosen flavor are remembered on this device
(via `localStorage`), so reopening the tool picks up where you left off.

A first-load **Help** popup explains the syntax; reach it again anytime via the
**?** button in the header.

## Notes & limitations

- Ships as one self-contained `index.html` — no CDN, no npm dependencies, works
  offline and via `file://`. Assembled by a dependency-free Node build (see
  "Developing").
- **Times are local.** The next-runs preview uses your device's clock and time
  zone (shown under the list). Around daylight-saving transitions the math
  follows the platform's local-time rules — a skipped wall-clock hour is skipped
  and a repeated hour may fire once. This is a deliberate trade for staying
  dependency-free and offline.
- **Impossible schedules** (e.g. `0 0 30 2 *`) simply show fewer than 5 runs (or
  none) within a 5-year lookahead rather than hanging.
- **Special tokens are flavor-gated**: `?`, `L` (last), `W` (nearest weekday),
  and `#` (nth weekday) are accepted only in the flavors that support them and
  rejected elsewhere with a clear, per-flavor message. A special-token day field
  round-trips through the **Custom** field editor.
- **No destructive-action confirms.** The only content is one short expression
  string and the flavor — trivially reversible (retype or pick another preset) —
  so, per the repo convention's "easily reversible actions may skip the confirm"
  clause, there are none. Only the first-load Help modal applies.
- For automated testing, the page exposes `window.__cronBuilder` with the pure
  functions from `source/logic.mjs` (`parseCron`, `buildCron`, `describeCron`,
  `nextRuns`, `convertExpr`, `parseField`, `buildField`, `fieldEditorMode`,
  `isRestricted`, `dayMatches`, plus `specsForFlavor`, `orderForFlavor`,
  `FLAVORS`, `DEFAULTS`, `FIELD_SPECS` / name tables), a few deterministic entry
  points (`applyExpr`, `renderFromRaw`, `assembleExprFromEditors`), and a live
  `state` reference. This namespace has no effect on normal use.

## Developing (build from source)

The shipped `index.html` is **generated** — never hand-edit it. Author under
`source/` and rebuild:

```
src/tools/cron-builder/
├── source/
│   ├── index.template.html   # page shell + cards + Help modal + build tokens
│   ├── styles.css            # tool styles (cards, field editors, modal)
│   ├── logic.mjs             # pure, DOM-free engine (parse/build/describe/nextRuns)
│   └── app.mjs               # DOM wiring, render, persistence, test hook
└── index.html                # GENERATED — do not edit
```

- `logic.mjs` is the pure engine (no `document`/`window`/`localStorage`); the
  unit tests import it directly and the build inlines it into `app.mjs` via
  `<<ct:inline logic.mjs>>`.
- The build expands `<<ct:include …>>` (shared `base.css`, `footer.html`,
  `copy.js`) and `<<ct:inline …>>` (this tool's own `styles.css` / `logic.mjs` /
  `app.mjs`) into the single self-contained `index.html`.

```bash
cd src/tools/cron-builder
npm install          # tool-local; installs @playwright/test (dev-only)
npm run build        # regenerate index.html from source/
npm run build:check  # verify index.html matches source/ (fails if stale)
npm test             # unit (node --test) + e2e (@playwright/test)
```

Edit `source/`, run `npm run build`, and commit **both** the source and the
regenerated `index.html`.

<!-- readme-footer: paste at the bottom of each tool's README. Keep in sync with tools/include/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
