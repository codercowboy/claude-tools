# uuid-generator — test record

Verified against `tools/uuid-generator/index.html` (the build-assembled single
file) and `source/logic.mjs` (the pure engine). Two required layers, per
`docs/conventions.md` § "Pure-logic unit tests":

1. **`node --test` unit tests** (`tests/unit/*.test.mjs`) — offline, no browser,
   importing `source/logic.mjs` directly. Randomness is **injected**: every
   generator is fed FIXED bytes (and time, where relevant) so outputs are exact
   and deterministic.
2. **`@playwright/test` e2e suite** (`tests/uuid-generator.e2e.mjs`) — drives the
   shipped `index.html` from a `file://` URL via `data-testid` hooks and the
   `window.__uuidGenerator` test API.

`build:check` runs first (via `pretest:unit` / `pretest:e2e`), so a stale build
fails the run.

## How to run

From `tools/uuid-generator/`:

```sh
npm install
npx playwright install chromium   # first time only
npm test                          # unit (node --test) then e2e (@playwright/test)
# or individually:
npm run test:unit
npm run test:e2e
```

## Latest result

- **Unit: 58 passed, 0 failed** (`node --test`, ~0.7s).
- **e2e: 29 passed, 0 failed** (Chromium, single worker, ~11.5s, `file://`).

No source changes were required — the tool passed both layers as built.

## Unit coverage (`tests/unit/`)

- **`uuid-v4.test.mjs`** — `uuidV4(bytes)`: all-zero / all-0xff / ramp bytes to
  exact canonical strings; version nibble always `4`; variant bits always `10xx`;
  non-version/variant bytes preserved; caller array not mutated; short/undefined
  input degrades to zeros. Plus `formatUuidBytes` (raw hyphenation, no forcing).
- **`uuid-v7.test.mjs`** — `uuidV7(time, bytes)`: exact output for `time=1`;
  version `7` + variant `10xx`; the **high 48 bits equal the timestamp**
  (big-endian ms) across several times incl. the 48-bit max; negative/NaN time
  clamps to 0; and **`inspectUuid` round-trips the encoded time exactly**.
- **`ulid.test.mjs`** — `ulid(time, bytes)`: exactly 26 chars; Crockford-only,
  uppercase, excludes I/L/O/U; exact zero/`0xff` outputs; the 10-char time
  prefix is **monotonic** (lexicographic == chronological). Plus
  `encodeTimeCrockford` (big-endian) and `bytesToCrockford` (pad/truncate).
- **`nanoid-token.test.mjs`** — `nanoid(size, bytes, alphabet)` length + alphabet
  membership + custom alphabet + power-of-two index mapping; the official 64-char
  alphabet constant. `randomToken(len, alphabet, bytes)` for **hex / base62 /
  base64url / custom**, exact mapping incl. modulo wrap (`255 % 16 = f`), empty
  alphabet falls back to hex.
- **`inspect.test.mjs`** — `inspectUuid(str)`: version + variant detection;
  tolerant of **braces**, **`urn:uuid:`**, **case**, **missing hyphens**, and
  surrounding whitespace; rejects empty / too-short / too-long / non-hex; Nil and
  Max UUID call-outs; v1 Gregorian timestamp decode (exact ISO); all four variant
  buckets (`0xxx` / `10xx` / `110x` / `111x`).
- **`no-random-uuid.test.mjs`** — **guard against the documented repo bug class:**
  strips comments from `index.html` + `source/*` and asserts there is **no
  `crypto.randomUUID(` invocation (or bare reference) in executable code**, while
  confirming the tool *does* use `crypto.getRandomValues`. (Prose mentions of the
  banned API in comments are expected — they document the ban — so comments are
  stripped before scanning.)

Bulk **count bounds** are exercised in the e2e layer (the clamp lives in the DOM
layer, `app.mjs`, not in the pure engine): 0 → 1, 5000 → 1000, N → N rows.

## e2e coverage (`tests/uuid-generator.e2e.mjs`)

- **First-load Help** — genuine first visit in a fresh `browser.newContext()`
  auto-shows the modal, initial focus on the ✕, seen-flag persists, stays closed
  on reload; re-openable via the `?` button. Close paths: **✕ / Esc / backdrop**
  (inside-dialog click does not close), **focus trap** (Tab/Shift+Tab stay
  inside), **focus return** to the trigger. Other tests pre-seed
  `uuid-generator:help-seen:v1` via `addInitScript`.
- **Generate each id type** — UUID v4 (canonical, version `4`), UUID v7 (version
  `7`), ULID (26-char Crockford), nanoid (21 chars), Token (32-char hex); and
  contextual option-group visibility incl. the Custom-alphabet field.
- **Bulk count** — N → exactly N rows; singular "1 value" label; clamping.
- **UUID format toggles** — uppercase re-formats existing values (no new
  randomness); hyphens-off strips to 32 chars (same underlying value); wrap =
  braces wraps in `{…}`.
- **Copy feedback** — per-row 📋 → ✅ → 📋, and Copy all → "Copied!" → "Copy all".
- **Inspect** — pasted v4 shows valid + version + variant + canonical; a v7
  (built via the pure hook with a known time) decodes its ISO timestamp; an
  invalid string shows an error and renders no breakdown.
- **Non-secure context** — `crypto.randomUUID` shadowed to `undefined` via
  `addInitScript` + `Object.defineProperty` (NOT `delete`, a no-op in Chromium,
  per conventions). Confirms `randomUUID` is undefined, `getRandomValues` intact,
  `hasSecureRandom` true, and that **every id type still generates** with no
  Math.random-fallback warning.
- **Persistence** — type / count / token length / alphabet / mode / inspect text
  round-trip through `localStorage` across a reload; generated **values are not
  persisted** (`saved.values` is `undefined`). Reloads use a settle wait to avoid
  the documented `file://` write-then-reload race.
- **Test hook** — `window.__uuidGenerator` exposes the pure functions and live
  `state` and is inert for real users.
- **Mobile (375px)** — no horizontal page overflow; generation still works.
