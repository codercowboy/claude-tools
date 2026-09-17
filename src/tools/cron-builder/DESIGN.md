# Cron Builder — DESIGN.md

Source-of-truth spec for the **Cron Builder** utility. A single-file,
dependency-free web tool that lets you build, parse, understand, and preview a
cron expression — editing either the **raw expression** or the **per-field
pickers**, with a **plain-English explainer** and a **"next N runs"** preview,
all computed offline with pure date math.

## What it is

A two-way cron editor. The single source of truth is a **parsed model**
derived from the raw expression string; every other view (field editors,
explainer, next-runs) is derived from that model. Edit the raw text or any
field picker and everything else re-derives.

- **Multi-flavor.** A **Flavor** `<select>` chooses the dialect, which drives the
  field count/positions, the allowed special characters, and the day-of-week
  numbering. **Standard / Unix is the default.** See [Flavors](#flavors).
- Runs entirely in the browser. Nothing is sent anywhere; no network, no deps.

## Flavors

The active flavor is a pure input to `parseCron` / `buildCron` / `describeCron`
/ `nextRuns` (`parseCron(expr, { flavor })`). The model records `flavor`,
`order`, `seconds`, and `hasYear`. Day-of-week values are **normalized
internally to the JS convention** (0 = Sunday … 6 = Saturday) so `nextRuns`
date math is correct in every flavor, while term objects keep the **literal**
cron numbers for serialization + editor round-trips.

| Flavor | Fields | DOW numbering | Special chars | Macros |
|--------|--------|---------------|---------------|--------|
| **Standard / Unix** (default) | 5: `min hour dom month dow` | `0–7`, 0 & 7 = Sun | `* , - /` | yes (`@daily`, …) |
| **Unix with seconds** | 6: `sec min hour dom month dow` | `0–7`, 0 & 7 = Sun | `* , - /` | no |
| **Quartz (Java)** | 6 or 7: `sec min hour dom month dow [year]` | `1–7`, **1 = Sun** | `? L W #` | no |
| **Spring @Scheduled** | 6: `sec min hour dom month dow` | `0–7`, 0 & 7 = Sun | `? L #` (no `W`) | no |
| **AWS EventBridge** | 6: `min hour dom month dow year` (year, not sec) | `1–7`, **1 = Sun** | `? L W #` | no |

- **`?`** — "no specific value"; matches like `*` (not "restricted"). Rejected
  in Standard / Unix and Unix-with-seconds. **Quartz & AWS require exactly one
  of day-of-month / day-of-week to be `?`** (so both can't be `*`/values).
- **`L`** — day-of-month `L` = last day; `L-n` = n days before the last day;
  `LW` = last weekday of month. Day-of-week `nL` = the last given weekday (e.g.
  `5L` in Spring = last Friday); bare `L` in dow = Saturday.
- **`W`** — day-of-month `nW` = the nearest weekday to day n (never crossing
  into an adjacent month).
- **`#`** — day-of-week `n#k` = the k-th given weekday (e.g. Quartz `6#3` =
  3rd Friday). `k` must be 1–5.
- **year** — Quartz's optional 7th field and AWS's trailing field. An
  out-of-range / past year yields fewer/zero runs within the 5-year horizon
  (no hang).
- **Switching flavor** converts the current expression via the pure, tested
  `convertExpr(expr, from, to)`: it adds/removes the seconds/year fields,
  renumbers day-of-week to the target's base (preserving the weekday meaning),
  applies the `?` rule, and degrades unsupported specials — always producing a
  string that parses in the target flavor (falling back to that flavor's
  default if the input can't be parsed).

A field carrying `L`/`W`/`#` is flagged `special` and matched date-by-date in
`nextRuns` (in addition to any plain numeric values in the same field); it
round-trips through the **Custom** field editor.

## Supported cron syntax

Each of the 5 (or 6) fields is a comma-separated list of *terms*. A term is one
of:

| Term        | Meaning                                   | Example    |
|-------------|-------------------------------------------|------------|
| `*`         | every value in the field's range          | `*`        |
| `a`         | a single value                            | `5`        |
| `a-b`       | an inclusive range                        | `1-5`      |
| `*/n`       | every `n`th value across the whole range  | `*/15`     |
| `a-b/n`     | every `n`th value within a range          | `0-30/10`  |
| `a/n`       | every `n`th value starting at `a`         | `5/10`     |
| `a,b,c`     | a list (any mix of the above, per part)   | `0,15,30`  |
| `?`         | "no specific value" — **dom/dow only**    | `?`        |

Field ranges and names:

| Field         | Range   | Names accepted                          |
|---------------|---------|-----------------------------------------|
| second (opt.) | 0–59    | —                                       |
| minute        | 0–59    | —                                       |
| hour          | 0–23    | —                                       |
| day-of-month  | 1–31    | `?`                                      |
| month         | 1–12    | `JAN`–`DEC` (case-insensitive)          |
| day-of-week   | 0–7     | `SUN`–`SAT`; both `0` and `7` = Sunday; `?` |

Also accepted for convenience: the classic macros `@yearly`/`@annually`,
`@monthly`, `@weekly`, `@daily`/`@midnight`, `@hourly`, expanded to their
5-field equivalents on parse.

### `?` handling

`?` is Quartz's "no specific value" marker, valid only in **day-of-month** and
**day-of-week**. For matching it behaves exactly like `*` (the whole range). It
is normalized to `*` when the expression is rebuilt from the field editors
(they are semantically identical). Documented so the round-trip `? → *` isn't
mistaken for a bug.

### `7` = Sunday

In day-of-week, `7` is an alias for Sunday (`0`). Value sets normalize `7 → 0`,
so `5-7` expands to Fri, Sat, Sun (`{5,6,0}`) and `0-7` to every day. A literal
`7` typed by the user is preserved verbatim in the rebuilt string.

### Day-of-month vs day-of-week (the OR rule)

The classic Vixie-cron rule, which this tool follows:

- If **both** day-of-month and day-of-week are *restricted* (neither is `*` or
  `?`), a day matches when **either** matches — the two are **OR**'d.
- If only one is restricted, only that one constrains the day.
- If both are `*`/`?`, every day matches.

"Restricted" means the field's raw text is **not** `*` and **not** `?` (a
`*/n` step *is* restricted). The explainer surfaces this with an explicit note
whenever both are restricted, and joins the two day clauses with **"or"**.

## Pure logic (`source/logic.mjs`)

DOM-free, deterministic, unit-tested. The build inlines it into the shipped app;
the unit tests import it directly.

- **`parseCron(expr, { flavor })` → model.** Splits into the flavor's fields
  (5/6/7, seconds-leading or year-trailing), parses each into a field object
  `{ raw, terms, wildcard, question, special, values, valueSet }`, and returns
  `{ flavor, order, seconds, hasYear, second?, minute, hour, dom, month, dow,
  year? }`. Throws a friendly `Error` on any invalid field, wrong field count,
  out-of-range value, bad step, reversed range, a special char the flavor
  doesn't allow, or a `?`-rule violation. Macros (`@daily` …) are expanded first
  (Standard / Unix only). Back-compat: the old `{ seconds:true }` option maps to
  the Unix-with-seconds flavor.
- **`buildCron(model)` → string.** Serializes each field's `terms` to canonical
  text (numeric; `?` preserved) and joins with spaces. Deterministic inverse of
  `parseCron` up to normalization (names → numbers, `?` kept, whitespace
  collapsed).
- **`describeCron(model)` → string.** Plain-English description, e.g.
  *"At 09:00, on Monday through Friday"*, *"Every 15 minutes"*,
  *"At 00:00, on day 1 of the month"*. Clean `At HH:MM[:SS]` phrasing when
  minute/hour (and second) are single values; a readable generic fallback
  otherwise. Both-restricted day fields are joined with "or".
- **`nextRuns(model, from, count)` → Date[].** The next `count` times strictly
  after `from` that match, computed with **pure local-time date math** (no
  library). Honors steps/ranges/lists across all fields and the dom/dow OR rule.
  Returns fewer than `count` (possibly zero) if the expression matches nothing
  within a **5-year** lookahead from `from` (e.g. `0 0 30 2 *`). `from` is a
  parameter for deterministic testing.

`nextRuns` algorithm: start at the boundary strictly after `from` (next second
in seconds mode, else next minute at `:00`), then repeatedly climb — month →
day (dom/dow combined) → hour → minute → (second) — resetting lower fields to
their minimum whenever a higher field advances, using local `Date` setters so
month/day/DST rollover is handled by the platform. Matches are collected; after
each match the clock advances one unit. Bounded by a 5-year horizon and an
iteration guard so an impossible expression can't loop forever.

**Time zone / DST.** All math and display are in the **viewer's local time**;
the next-runs panel prints the resolved IANA zone. Around DST transitions,
local-setter normalization means a skipped wall-clock hour is skipped and a
repeated hour may fire once — an accepted, documented trade for staying
dependency-free and local.

Also exported for the app/tests: `fieldEditorMode(field)` (derives the picker
mode — `every` / `step` / `range` / `specific` / `custom` — and its params from
a parsed field), `parseField`, `buildField`, the `FIELD_SPECS`, and the
`MONTH_NAMES` / `DOW_NAMES` tables.

## UI

Single-column card stack (matches dev-converter / base64-tool), light + dark,
responsive, mobile-friendly.

1. **Header** — title, subtitle, **Help (`?`)** button.
2. **Expression card** —
   - **Flavor** `<select>` (`data-testid="flavor-select"`) — Standard / Unix,
     Unix with seconds, Quartz, Spring @Scheduled, AWS EventBridge. Changing it
     converts the current expression to the new flavor.
   - **Raw expression** text input (`data-testid="cron-input"`) with a copy
     button; edits re-derive everything.
   - An **error** line (`role="alert"`, `aria-live="polite"`) for invalid input.
   - **Presets** `<select>` (every minute, every 15 min, hourly, daily
     midnight, weekdays 9am, weekly, monthly, yearly) — standard 5-field
     schedules; picking one switches to the Standard / Unix flavor.
3. **Field editors** — one card per field for the active flavor (seconds/year
   only when the flavor has them): a mode
   `<select>` (Every / Every N / Range / Specific / Custom) plus mode-specific
   inputs. Month & day-of-week use named checkboxes (Specific) and named
   `<select>`s (Range); numeric fields use number/text inputs. Any change
   assembles a new expression via the editors, writes it to the raw box, and
   re-derives the explainer + next-runs (without rebuilding the editors, to keep
   focus).
4. **Explainer card** — the `describeCron` string (`aria-live="polite"`), plus
   the dom/dow OR note when both are restricted.
5. **Next runs card** — the next **5** matching times in local time, each with a
   relative hint, a "Copy all" button, and the resolved time-zone note.

### Single source of truth / data flow

The **raw expression string** is the persisted source. On every change it is
parsed to the model; editors, explainer, and next-runs are **derived** from the
model and rebuilt from scratch (no derived view writes back to another). Editor
input flows one way: editors → assembled expression string → parse → model →
derived views. There is no two-way sync between derived views.

## Conventions honored

- First-load **Help** popup (`cron-builder:help-seen:v1`; auto-shows once, ✕ +
  Esc + backdrop + focus-trap + focus-return; `[hidden]` guarded).
- **Persist** `cron-builder:v1` = `{ expr, flavor }` only (no derived output;
  a legacy `{ seconds:true }` shape still loads as Unix-with-seconds);
  best-effort `try/catch`; tool works with no stored state.
- Copy via shared `ctCopy` / `ctFlash` (`<<ct:include copy.js>>`), delegated
  handler; per-value + "Copy all".
- Shared `base.css` (`<select>` fix, `[hidden]` guard, `touch-action`) and
  `footer.html` inlined by the build.
- `<select>` filled with `background-color` (never the shorthand — keeps the
  chevron); `button:hover` excludes `.ctc-btn`; `[hidden]{display:none
  !important}` present.
- Light + dark palettes; responsive down to ~360px; OG meta + HTML footer.
- `data-testid`s throughout; inert `window.__cronBuilder` hook exposing the pure
  functions, a few deterministic entry points, and live state.

### Confirm-modal carve-out

The Cron Builder holds no built-up, hard-to-recreate content — just one short
expression string and toggle. Changing a preset or clearing the box is trivially
reversible (retype or pick another preset), so, per the conventions'
"easily reversible actions may skip the confirm" clause, **there are no
destructive-action confirm modals**. Only the first-load Help modal applies.

## Non-goals / limitations

- Special characters are supported **only where the active flavor allows them**
  (see [Flavors](#flavors)); using one elsewhere is reported as invalid with a
  clear, per-flavor message (e.g. `W` in Spring, any of `L`/`W`/`#` in
  Standard / Unix).
- Special-token day fields (`L`/`W`/`#`) round-trip through the **Custom** field
  editor rather than getting a bespoke picker.
- DST edge behavior is local-setter-based (documented above).
- `describeCron` guarantees a sensible string for every valid model but only
  aims for polished phrasing on common shapes; exotic custom fields get a
  readable generic description.
