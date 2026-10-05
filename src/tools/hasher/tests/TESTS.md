# Tests — Hasher

Two required layers (per `CLAUDE.md` and `docs/conventions.md`):

- **Unit** — `node --test tests/unit/*.test.mjs`, importing `source/logic.mjs`
  directly (DOM-free pure logic). `npm run test:unit` (build:check runs first).
- **e2e** — `@playwright/test` driving the built `index.html` over `file://`.
  `npm run test:e2e` (build:check runs first).

`npm test` runs both. Current status: **39 unit tests pass, 26 e2e tests pass.**

Because this is a hasher, the unit layer is the load-bearing one: correctness is
proven only by matching **published test vectors** and by cross-checking every
input length against Node's own `crypto` (imported in the TEST only — the tool
itself is deliberately hand-rolled, see below).

## Unit coverage (`tests/unit/`)

### `hashes.test.mjs` — MD5 / SHA-1 / SHA-256 / SHA-512
- Published vectors for each: empty string, `"abc"`, and the pangram
  `"The quick brown fox jumps over the lazy dog"`.
- MD5 uses the full RFC 1321 appendix A.5 suite (`""`, `a`, `abc`, `message
  digest`, the alphabet, the alphanumeric string).
- SHA-1 / SHA-256 / SHA-512 include the classic multi-block FIPS 180-4 example
  messages (`abcdbcde…`, the 896-bit / 112-char message for SHA-512).
- Digest byte-lengths (16 / 20 / 32 / 64) and determinism on an 80-byte
  (multi-block) input.

### `crc32.test.mjs` — CRC32 (IEEE, poly 0xEDB88320)
- The canonical check value `crc32("123456789") = cbf43926` (both `crc32Hex`
  and the raw unsigned number).
- Empty input → `0` / `"00000000"`; more vectors (`a`, `abc`, the pangram).
- `crc32Hex` is always 8 lowercase hex chars; the return is an unsigned 32-bit
  number.

### `hmac.test.mjs` — HMAC (RFC 2104)
- **RFC 2202** HMAC-MD5 and HMAC-SHA-1 test case 2 (key `"Jefe"`).
- **RFC 4231** HMAC-SHA-256 and HMAC-SHA-512 test cases 1, 2, and **6** — case 6
  uses a 131-byte key (> block size), forcing the "hash the key first" branch.
- The `key`/pangram HMAC-SHA-256 vector called out verbatim in `DESIGN.md`.
- `hmac()` throws on an unsupported hash name.

### `encoders.test.mjs` — `textToBytes` / `bytesToHex` / `bytesToBase64`
- `textToBytes`: ASCII, empty/nullish, 2- and 3-byte UTF-8 (`é`, `✓`), and an
  **astral** char (`😀`, U+1F600 → 4 bytes); cross-checked against Node `Buffer`.
- `bytesToHex`: known bytes (lowercase, zero-padded), empty, all 256 byte values
  vs Node `Buffer`.
- `bytesToBase64`: every padding case (0/1/2 remainder), known vectors, and a
  sweep of sizes vs Node `Buffer`.

### `padding.test.mjs` — block-boundary / padding cross-check
- MD5 / SHA-1 / SHA-256 / SHA-512 vs `node:crypto` for **every length 0..200**
  bytes — the range that exercises all the padding edge cases.
- Explicit boundary lengths (55/56/63/64/65 for the 64-byte-block family;
  111/112/119/120/127/128/129 for SHA-512's 128-byte block + 16-byte length
  field spill).
- A 10,000-byte input to confirm the streaming loop.
- `node:crypto` is imported **only in this test**, never in the tool.

### `no-subtlecrypto.guard.test.mjs` — hand-rolled guard
- Asserts `index.html`, `source/logic.mjs`, and `source/app.mjs` contain **no
  `crypto.subtle`** usage (nor `crypto.randomUUID`) in code — comments/prose that
  mention it to explain why it's avoided are stripped before the check. This is
  the whole reason the tool exists in this repo: SubtleCrypto is
  secure-context-only and would break over plain LAN HTTP.

## e2e coverage (`tests/hasher.e2e.mjs`)

- **First-load Help** — genuine fresh context auto-shows once with initial focus
  on the ✕, stays closed on reload, writes the seen flag; re-open via `?` button.
- **Help modal** (pre-seeded, opened via `?`): ✕ close + focus return to
  trigger; Esc close + focus return; backdrop click closes / inside-dialog click
  does not; Tab keeps focus trapped inside the dialog.
- **All algorithms shown at once**: there is **no** algorithm-checkbox card
  (`algo-toggles`/`algo-*`/`no-algos-note`/`hmac-toggle` all absent); every plain
  digest field (MD5/SHA-1/SHA-256/SHA-512/CRC32) and every HMAC field
  (HMAC-MD5/SHA-1/SHA-256/SHA-512, no HMAC-CRC32) is present. Empty source → each
  value input is empty with an em-dash **placeholder**. Typing text fills every
  plain digest at once with correct vectors; Clear returns them to placeholders.
- **Plain and HMAC together, live**: plain digests stay put while the HMAC fields
  fill in **live** as the key is typed (HMAC-MD5/SHA-1/SHA-256 vectors); the plain
  SHA-256 is unchanged (not replaced by its HMAC). Clearing the key returns the
  HMAC fields to the neutral placeholder (no error). A key with no source stays a
  placeholder.
- **Base64 toggle**: adds a Base64 field to both the plain and HMAC SHA-family
  entries (value = Base64 of the raw digest); MD5/CRC32 never get a Base64 field.
- **HMAC key secrecy**: the key field has **no** in-field copy button; **the key
  is NOT written to localStorage** (full-storage scan) and the persisted blob has
  only `inputText/mode/showBase64` (no `hmacKey`/`hmacEnabled`).
- **File mode**: a selected file (contents `"abc"`) hashes to the SHA-256 vector;
  name shown; remove clears back to the placeholder.
- **Copy feedback**: per-field copy (plain and HMAC) flashes ✅ → 📋; the text
  input reveals its in-field copy only when non-empty; Copy all flashes
  `Copied!` → `Copy all` and (when the headless clipboard is readable) carries
  both a plain and an HMAC line; Copy all is disabled with no source.
- **Persistence**: mode/input/Base64 restored on reload (blob keys exactly
  `inputText/mode/showBase64`); the HMAC key does **not** survive a reload.
- **Test hook**: `window.__hasher` exposes the pure functions + live state and
  computes the SHA-256 / CRC32 vectors.
- **Mobile (375px)**: no horizontal overflow with all digests + Base64 + HMAC
  shown.

## Notes / gotchas handled

- Pre-seed `hasher:help-seen:v1` via `addInitScript` in every suite except the
  dedicated first-load suite (which uses a fresh `browser.newContext`).
- Persistence tests add a small settle wait (~400 ms) after the write before
  `reload()` to avoid the `file://` write-then-reload race (docs/conventions.md).
- Copy-flash assertions catch the ✅ label inside its ~1 s window, then assert
  the revert with a 2 s timeout.
