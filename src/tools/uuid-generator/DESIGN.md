# UUID Generator — DESIGN.md

Source-of-truth spec for the `uuid-generator` tool. One self-contained,
dependency-free `index.html` (assembled from `source/` by the repo build) that
opens straight from `file://` — no server, no CDN, nothing to install.
Everything runs locally in the browser; nothing is ever sent anywhere.

## Purpose

A developer's go-to for generating and inspecting identifiers:

- **UUID v4** (random)
- **UUID v7** (time-ordered, RFC 9562)
- **ULID** (Crockford base32, time-sortable)
- **nanoid** (URL-safe, compact)
- **Random tokens** (configurable length + alphabet: hex / base62 / base64url /
  custom)

Plus an **Inspect** mode: paste a UUID and see its version, variant, embedded
timestamp (v1/v7), field breakdown, and validity.

## ⚠️ CRITICAL — randomness source (the secure-context gotcha)

**All randomness comes from `crypto.getRandomValues` into a `Uint8Array`. We
never call `crypto.randomUUID()`.**

This is the one non-negotiable of this tool. `crypto.randomUUID()` is a
**secure-context-only** API: it is `undefined` when a page is served over plain
LAN HTTP and *throws* ("crypto.randomUUID is not a function") when called there.
This tool is meant to work identically from `file://` **and** over a plain-HTTP
LAN server, so `randomUUID()` is banned outright (see `docs/conventions.md` §
"Single-file HTML tools" — the documented repo bug that bit hat-picker).

- `crypto.getRandomValues` works in **every** context (secure or not) and is
  what we use.
- A `Math.random` fallback is used **only if `crypto` is entirely absent**
  (extremely old/exotic environments) so the tool degrades rather than dying.
  This fallback is not cryptographically strong and the tool says so.
- `crypto.getRandomValues` caps a single call at **65536 bytes**; the byte
  source **chunks** larger requests so bulk generation of long tokens still
  works.

Because Playwright loads pages via `file://` (which *is* a secure context), an
e2e test alone will **not** catch a `randomUUID()` regression — the test suite
(built later) must simulate a non-secure context via
`Object.defineProperty(crypto, 'randomUUID', { value: undefined,
configurable: true })` (NOT `delete crypto.randomUUID`, a no-op in Chromium)
and/or grep the shipped file for the forbidden call. The tool itself must
contain zero references to `crypto.randomUUID`.

## Architecture (build-assembled)

Authored under `source/`, assembled into `index.html` by
`scripts/build-tool.mjs`. Never hand-edit `index.html` (the `build:check` guard,
wired into `pretest`, fails a stale build).

- `source/index.template.html` — page shell, `<head>`/OG meta, markup for both
  modes, the Help modal, and build tokens.
- `source/styles.css` — tool styles (inlined after shared `base.css`).
- `source/logic.mjs` — the **pure, DOM-free engine** (all id algorithms +
  inspection). Exported ES module; imported directly by the unit tests and
  inlined into `app.mjs` via `<<ct:inline logic.mjs>>`.
- `source/app.mjs` — DOM wiring, rendering, the byte source, persistence, test
  hook.

Shared includes pulled in by the build: `base.css`, `copy.js`, `footer.html`.

## Pure logic (`source/logic.mjs`) — deterministic, injectable randomness

Every generator takes its random **bytes** (and time, where relevant) as an
argument, so tests pass fixed bytes and assert exact outputs. No function in
`logic.mjs` touches `crypto`, `Date`, `document`, `window`, or `localStorage` —
the app layer supplies bytes and the current time.

Required functions (deterministic given inputs):

- **`uuidV4(bytes)`** — `bytes`: 16-byte source. Sets version nibble to `4`
  (`bytes[6] = (bytes[6] & 0x0f) | 0x40`) and variant to RFC 4122
  (`bytes[8] = (bytes[8] & 0x3f) | 0x80`). Returns canonical lowercase
  hyphenated `8-4-4-4-12`. Does not mutate the caller's array (copies first).
- **`uuidV7(time, bytes)`** — `time`: Unix ms; `bytes`: 16-byte source (only the
  non-timestamp bytes are used for randomness). First 48 bits = big-endian
  `unix_ts_ms`; version nibble `7`; variant `10`. Returns canonical form. *Note:
  the brief lists `uuidV7(bytesOrTime)`; we implement the explicit, fully
  deterministic two-arg form `uuidV7(time, bytes)`.*
- **`ulid(time, bytes)`** — `time`: Unix ms → 10 Crockford-base32 chars;
  `bytes`: 10-byte (80-bit) source → 16 Crockford chars. Returns the 26-char
  uppercase ULID. Crockford alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
  (excludes I, L, O, U).
- **`nanoid(size, bytes, alphabet)`** — `size` (default 21), `bytes` (>= `size`
  bytes), `alphabet` (default the official nanoid URL alphabet, 64 chars). Maps
  each char `alphabet[bytes[i] % alphabet.length]`.
- **`randomToken(len, alphabet, bytes)`** — `len` chars from `alphabet` (a
  string), one byte per char via `alphabet[bytes[i] % alphabet.length]`.
- **`inspectUuid(str)`** — parses a pasted string (tolerates `{}`, `urn:uuid:`,
  missing/extra hyphens, case). Returns `{ valid, error, canonical, hex,
  version, versionName, variant, variantName, variantBits, isNil, isMax,
  timestamp, fields }`. `timestamp` (a JS `Date`) is decoded for **v1** (60-bit
  Gregorian 100-ns, via BigInt) and **v7** (48-bit Unix ms); `null` otherwise.

**Bias note.** Char mapping uses `byte % alphabet.length`. For power-of-two
alphabets (hex = 16, base64url = 64, the 64-char nanoid alphabet) this is
exactly uniform. For non-power-of-two alphabets (base62, some custom) there is a
negligible modulo bias — an accepted, documented trade for deterministic,
testable, single-byte-per-char generation in a dev utility (this is not a
key-derivation tool). ULID and UUID field packing are exact.

Exported alphabet constants: `CROCKFORD`, `NANOID_ALPHABET`, `TOKEN_ALPHABETS`
(`{ hex, base62, base64url }`), plus `VERSION_NAMES`.

## UI

Two top-level modes via a segmented toggle: **Generate** | **Inspect** (mirrors
base64-tool's encode/decode toggle).

### Generate mode

- **ID type** — segmented control: `UUID v4` · `UUID v7` · `ULID` · `nanoid` ·
  `Token`.
- **Control row (single inline line).** The config card lays its controls out on
  **one horizontal row** that wraps gracefully on narrow/mobile: the **Generate**
  button leads at the front (left), followed by **Count**, then the contextual
  option group for the selected type. Control heights are standardized via the
  shared `controls.css` include (`<<ct:include controls.css>>`, after `base.css`).
- **Count** — number input 1–1000 (clamped) — how many to generate at once.
  **Default 10 for every id type** (persisted default is 10 too).
- **Contextual options** (shown per selected type; hidden groups use the
  `[hidden]` guard):
  - UUID v4 / v7: **Uppercase** toggle, **Hyphens** toggle, **Wrapping** select
    (`Plain` / `Quoted "…"` / `Braces {…}`).
  - ULID: none (always uppercase Crockford).
  - nanoid: **Length** number input (default 21).
  - Token: **Length** number input (default 32), **Alphabet** select (`Hex` /
    `Base62` / `Base64URL` / `Custom`), a **Custom alphabet** text field (shown
    only when Alphabet = Custom), and an **Uppercase** toggle (meaningful for
    hex; documented). The **Alphabet** select is sized (`width:auto` +
    `min-width`) for its longest option ("Hex (0-9a-f)") and sets its padding
    with **longhands** (`padding-right: 2rem` for the chevron), so the value
    never overflows onto the dropdown caret (the `<select>` padding-shorthand
    trap; see `docs/conventions.md`).
- **Generate** button — leads the control row (front/left) and regenerates the
  list. Values that sit in a field use the shared **in-field `.ct-copy-btn`**
  pattern (e.g. the Inspect canonical form); per-row **Copy** and **Copy all**
  are unchanged.
- **Results**: a rendered **list** of values, each row with the value (monospace,
  selectable) and a per-row **Copy** button (📋 → ✅ via `ctFlash`). A header row
  shows the count and a **Copy all** button (newline-joined). Empty state before
  first generate.

Generation runs automatically on load (restored settings) and whenever a
setting that changes the *shape* is committed; the **Generate** button always
produces a fresh batch. Values are **not** persisted (they're throwaway).

### Inspect mode

- A text input for a pasted UUID.
- Live breakdown (updates on input, debounced): **validity** (valid/invalid with
  a friendly reason), **canonical form** (with a Copy button), **version** +
  name, **variant** + name + bits, **embedded timestamp** for v1/v7 (ISO + local
  + relative), a **field breakdown** (the five hyphen groups), and **Nil**/**Max**
  UUID call-outs.

## Conventions honored

- **First-load Help** modal (`role="dialog"`, `aria-modal`, labelled; initial
  focus to the ✕; focus trap; Esc + backdrop close; focus return; reduced-motion;
  `[hidden]` guard). Auto-shows once; seen-flag `uuid-generator:help-seen:v1`
  (try/catch; degrade to not-showing). Reachable later via the header **?**
  button. A **✕** pinned top-right is the sole dedicated close affordance.
- **Persist UI state** under `uuid-generator:v1` (try/catch, versioned): selected
  mode, type, count, uppercase/hyphens/wrap, nanoid length, token length /
  alphabet / custom alphabet, and the inspect input. **Never** the generated
  values (derived/throwaway).
- **Copy** via the shared `ctCopy`/`ctFlash` (`copy.js`), per-row and **Copy
  all**; icon buttons carry `title` + `aria-label`.
- **`<select>`** elements get the shared `base.css` fix; the tool sets their fill
  with `background-color` (never the `background` shorthand, which would wipe the
  chevron).
- **`[hidden]` guard** in `base.css` (contextual option groups rely on it).
- Generic `button:hover` excludes `.ctc-btn` (`button:hover:not(:disabled):not(.ctc-btn)`)
  so a future confirm dialog's accent button isn't washed out (the documented
  hover-specificity trap).
- **Light + dark** palettes; **responsive/mobile** (no horizontal overflow, 44px
  tap targets, `touch-action: manipulation` via `base.css`; a commit blurs the
  focused field to dismiss the mobile keyboard).
- **OG/Twitter meta** in `<head>` (relative `preview.png`) and the build-inlined
  **HTML footer**.
- **Test hook**: `window.__uuidGenerator` exposes the pure functions + a few
  deterministic entry points + a live `state` reference; inert for real users.
- **`data-testid`** on interactive elements.

## Destructive-action confirm — carve-out

There is **no** "Clear" of hard-to-recreate content. The generated list is
throwaway (one click of **Generate** rebuilds it), and the Inspect input is a
single short field easily retyped. Per `docs/conventions.md` § "Destructive
actions require confirmation", these are **easily reversible** and are
deliberately exempt from a confirm modal — documented here as an intentional
carve-out, not a gap.

## Out of scope

- UUID v1/v3/v5/v6/v8 **generation** (v1/v7 timestamps are *decoded* in Inspect;
  v3/v5 need a namespace + MD5/SHA-1 hashing — that's the future Hasher tool).
- No network, no persistence of generated values.
