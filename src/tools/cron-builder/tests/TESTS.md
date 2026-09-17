# Cron Builder — tests

Two layers, both required (see `docs/conventions.md` § "Pure-logic unit tests"):

- **Unit** — `node --test tests/unit/*.test.mjs`. Offline, DOM-free, deterministic.
  Imports the tool's pure engine directly from `source/logic.mjs` (via
  `tests/unit/_helpers.mjs`, the same file the build inlines into `index.html`).
- **e2e** — `@playwright/test` driving the shipped `index.html` from `file://`
  through `data-testid` hooks and the inert `window.__cronBuilder` namespace.

Run everything: `npm test` (unit then e2e). `build:check` runs first via
`pretest:unit` / `pretest:e2e`, so a stale `index.html` fails the run.

```bash
cd src/tools/cron-builder
npm install
npx playwright install chromium   # first time only
npm test
```

Current status: **61 unit tests + 25 e2e tests, all green.**

## Unit tests (`tests/unit/`)

Deterministic: `nextRuns` is always called with a fixed `from` Date built via the
local `Date` constructor, and assertions read local getters — so results don't
depend on the machine's time zone.

- **`parse-build.test.mjs`** — `parseCron` ↔ `buildCron` round-trips: 5-field and
  6-field (seconds); `*`, single values, lists (`1,15`), ranges (`1-5`), whole
  steps (`*/15`), range-steps (`10-50/10`, `0-30/10`), step-from (`5/10`); month
  names `JAN–DEC` and day names `SUN–SAT` (case-insensitive); `7`→Sunday value-set
  normalization (literal `7` preserved on rebuild); `?` handling (parses, kept on
  rebuild, matches like `*`); macro expansion (`@daily`/`@hourly`/…); whitespace
  collapse; the model shape; and a **regression** that names containing `L`/`W`
  (`JUL`, `WED`) are accepted (see "Source change" below).
- **`describe.test.mjs`** — `describeCron` English for common shapes: clean
  `At HH:MM` / `At HH:MM:SS`, weekday ranges, every-N and range-step minutes,
  day-of-month / month / weekday clauses, the dom/dow **OR** wording (`… or on
  Friday`), the "only one restricted → no or" case, `?` yielding no day clause,
  and a non-empty fallback for an exotic custom shape.
- **`next-runs.test.mjs`** — `nextRuns` correctness: daily times & spacing;
  strictly-after-`from`; step across hour boundary; lists; range-step hours; the
  **Vixie-cron OR rule** proved with `0 0 13 * 5` (Jan 13 2024 is a Saturday yet
  fires, alongside every Friday — OR, not AND); dow-only and dom-only
  restrictions; month restriction + year rollover; end-of-month rollover
  (`0 0 31 * *` skips Feb/Apr); the impossible `0 0 30 2 *` returning **zero**
  runs (no hang); 6-field seconds stepping; empty array for a non-Date/NaN
  `from`; and the `count` cap.
- **`invalid.test.mjs`** — friendly-error rejection: empty input, wrong field
  count (both directions), per-field out-of-range values, malformed fields
  (`abc`, reversed range, `*/0`, bad step), the unsupported `L`/`W`/`#` tokens
  (including digit-attached `5L` / `15W`), misplaced/disallowed `?`, unknown
  macro, a 5-field macro in seconds mode, and an empty list term.
- **`editor-mode.test.mjs`** — `fieldEditorMode` derivation (`every` / `step` /
  `range` / `specific` / `custom`) that drives raw→picker sync.

## e2e tests (`cron-builder.e2e.mjs`)

- **First-load Help** — genuine fresh `browser.newContext()` (not seeded):
  auto-shows once, stays closed on reload, seen-flag written, reopen via `?`.
- **Help modal** (pre-seeded) — ✕ / Esc / backdrop close, focus moves to ✕ and
  returns to the trigger, Tab/Shift+Tab focus trap.
- **Default render** — default `0 9 * * 1-5`, five field cards (no seconds card),
  explainer text.
- **Two-way sync** — raw → pickers (mode selects + inputs, named dow checkboxes)
  and pickers → raw (mode/value edits and specific-dow checkboxes rewrite the raw
  box and re-derive the explainer).
- **Explainer** — live update and the dom/dow **OR note** shown only when both are
  restricted.
- **Next runs** — 5 rows render with a timezone note; impossible expression shows
  the empty note and no rows.
- **Presets** — applying a preset fills the expression, re-derives, resets the
  select.
- **Seconds toggle** — switches 5 ↔ 6 fields and adds/removes the seconds card.
- **Invalid input** — friendly error without crashing, recovery, and the
  non-standard-token message.
- **Copy flashes** — expression 📋→✅→📋 and run-list "Copy all"→"Copied!"→revert.
- **Persistence** — expression + seconds toggle written to `localStorage` and
  restored on reload (small settle wait to dodge the `file://` write-then-reload
  race noted in the conventions).
- **Test hook** — `window.__cronBuilder` exposes the pure functions and live
  state.
- **Mobile (375px)** — no horizontal overflow, every card fits, still edits and
  re-derives.

## Source change made while testing

Testing surfaced a real bug and it was fixed in `source/logic.mjs` (then rebuilt):

- The `L`/`W`/`#` "non-standard token" guard used `/[LW#]/i`, which matched the
  incidental `L` in the month name **`JUL`** and the `W` in the day name **`WED`**
  — so any expression using those documented `JAN–DEC` / `SUN–SAT` names was
  wrongly rejected. The guard is now token-aware: `#` is rejected outright, while
  `L`/`W` are rejected only in a token that isn't a recognized name. Real Quartz
  extensions (`L`, `LW`, `5L`, `15W`, `5#3`, …) are still rejected with the same
  friendly message. Covered by the JUL/WED regression test in
  `parse-build.test.mjs` and the digit-attached-token cases in `invalid.test.mjs`.
