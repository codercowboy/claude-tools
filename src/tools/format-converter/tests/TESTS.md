# Format Converter — Tests

Two required layers (docs/conventions.md § "Pure-logic unit tests"):

1. **Unit** — `node --test` over `tests/unit/*.test.mjs`, importing the pure
   engine `source/logic.mjs` directly (no browser, no DOM).
2. **e2e** — `@playwright/test` driving the built `index.html` from `file://`
   via `data-testid` hooks and the `window.__formatConverter` test API.

`build:check` runs first (via `pretest:unit` / `pretest:e2e`), so a stale
`index.html` fails the run.

## Running

```
cd src/tools/format-converter
npm install
npx playwright install chromium   # first time only
npm test            # unit then e2e (both must be green)
npm run test:unit   # just the offline unit layer
npm run test:e2e    # just the browser layer
```

## Current status

- **Unit:** 90 tests pass (0 fail).
- **e2e:** 32 tests pass (0 fail).

## Unit coverage (`tests/unit/`)

- **`json.test.mjs`** — nested parse, indent option (0/2/4), round-trip,
  friendly error on invalid JSON.
- **`csv-tsv.test.mjs`** — RFC-4180 edge cases (quoted fields with embedded
  commas, escaped `""` quotes, embedded newlines), CRLF normalization,
  trailing-newline handling, header on/off, custom delimiter, TSV via tab;
  emit for array-of-objects (union columns, first-seen order), array-of-arrays,
  array-of-primitives (`value` column), single object as one row, nested cell
  `JSON.stringify`; friendly errors for non-tabular / non-uniform models;
  CSV↔TSV lossless round-trips.
- **`properties.test.mjs`** — dotted-key nesting, numeric-index arrays
  (`list.0=`), integer-but-not-`0..n-1` staying object keys, `=`/`:`/space
  separators, `#`/`!` comments, line continuations, `\uXXXX` + `\n`/`\t`
  decoding, escaped separators in keys, key/value escaping on emit, the
  escape-unicode option, leading-space escaping, object↔dotted round-trip.
- **`xml.test.mjs`** — the element/attribute/text convention (`@name` attrs,
  bare-text value, `#text` when mixed), repeated tags → arrays, empty elements,
  entity + CDATA decoding, declaration/comment skipping, friendly errors
  (mismatched close, no root, invalid root name), attributes strategy,
  declaration toggle, and XML→model→XML round-trip.
- **`yaml.test.mjs`** — supported subset (block maps/sequences, inline maps as
  sequence items, scalar type inference, quoted scalars with escapes, flow
  collections, comments + `---`, `|`/`>` block scalars) round-trips;
  JSON↔YAML round-trip; each unsupported construct (anchors, aliases, tags,
  merge keys, complex keys, multi-doc, tab indentation) rejected with the
  documented error.
- **`detect-convert.test.mjs`** — `detectFormat` on a representative input of
  each format, `null` on empty/ambiguous; `convert()` matrix (JSON→XML,
  YAML→JSON, JSON→CSV, JSON→.properties, CSV→JSON, XML→JSON→XML), `from='auto'`
  detection + reporting, and friendly errors (auto-detect failure, non-tabular
  → CSV, invalid JSON, unknown source/target format).

## e2e coverage (`tests/format-converter.e2e.mjs`)

- **Test hook** — `window.__formatConverter` exposes the documented pure
  functions + live `state`.
- **Live conversions** — JSON→XML, YAML→JSON, JSON→CSV, JSON→.properties.
- **Auto-detect** — status line reports the detected format; unrecognizable
  input shows a friendly message.
- **Swap (⇄)** — swaps From/To and feeds output back as input (round-trip).
- **Contextual option groups** — CSV, indent, XML, .properties groups show/hide
  per From/To; the delimiter input disables for TSV; the empty-options note
  stays hidden (every target maps to a group).
- **Options affect output** — indent, XML declaration toggle, CSV header toggle.
- **Error handling** — invalid JSON, impossible mapping (string → CSV),
  unsupported YAML anchor — friendly error, output cleared, page still
  responsive.
- **Copy** — flashes "Copied!" then reverts.
- **Sample / Clear** — Sample loads an example; Clear on non-empty input runs
  the `confirmDialog` guard (Cancel keeps content, Yes empties it).
- **Persistence** — input, From/To, and options survive a reload (isolated
  context + a settle wait before reload per the `file://` flake note).
- **Mobile (375×667, dpr2, touch)** — no horizontal overflow; real taps on the
  selects and input work.
- **First-load Help popup** — auto-shows once on a genuine fresh context;
  suppressed thereafter; opens via `?`; `role="dialog"`/`aria-modal`; initial
  focus on ✕; Esc / backdrop / ✕ close and return focus; focus trap.

## Notes / gotchas honored

- **First-load modal** is pre-seeded (`format-converter:help-seen:v1`) in the
  shared `beforeEach` so it never blocks unrelated tests; the genuine
  first-load case uses its own `browser.newContext()`.
- **`file://` write-then-reload flake** — the persistence test relies on each
  Playwright test's isolated (empty) context rather than clearing state in an
  init script (which would wipe persisted state on the reload), plus a ~400ms
  settle wait before `reload()`.
- The shipped `index.html` never references Playwright — it stays a
  dependency-free single file.
