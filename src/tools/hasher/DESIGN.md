# Hasher — Design

Source-of-truth spec for the **Hasher** tool. Single-file, vanilla, zero-deps,
`file://`-safe, build-assembled from `source/`.

## What it is

A local hashing utility. Feed it **text** or a **file** and it shows **every**
algorithm at once — **MD5, SHA-1, SHA-256, SHA-512, CRC32** — as lowercase hex
(and optionally Base64 for the SHA family), each digest in its own read-only
field. Alongside the plain digests it shows the **keyed HMAC** variant of each
block hash — **HMAC-MD5, HMAC-SHA-1, HMAC-SHA-256, HMAC-SHA-512** (CRC32 has no
HMAC) — grouped in an HMAC section with a key field, filling in live as you type
the key. Everything runs in the browser; nothing is uploaded.

## Hard requirements (call-outs)

- **NO SubtleCrypto — every algorithm is hand-rolled.** `crypto.subtle.*` is a
  **secure-context-only** API: it is `undefined` when the page is served over
  plain LAN HTTP, so relying on it would silently break the exact LAN use-case
  these tools care about (see `docs/conventions.md` § "No secure-context-only
  APIs"). Therefore **MD5, SHA-1, SHA-256, SHA-512, CRC32, and HMAC are all
  implemented by hand** in pure JS in `source/logic.mjs`, operating on
  `Uint8Array`. They run identically under `file://`, plain HTTP, and HTTPS.
  This is not a preference — it is the whole reason the tool exists in this repo
  rather than being a two-line `crypto.subtle.digest` wrapper.
- **Never persist a secret.** Per `docs/conventions.md` § "Persist UI state",
  the **HMAC key is treated as a secret**: it lives **in memory only** and is
  **never** written to `localStorage`. Neither is the HMAC on/off state nor any
  file contents. Only the non-sensitive UI state is persisted (see Persistence).
- **Zero dependencies at runtime.** Vanilla browser APIs only
  (`TextEncoder`, `DataView`, `BigInt`, `Uint8Array`). No `btoa`/`atob` reliance
  in the pure logic — Base64/Hex encoders are hand-rolled so the same
  `logic.mjs` runs unchanged under `node --test`.

## Pure logic API (`source/logic.mjs`, DOM-free, exported)

All hash functions take a `Uint8Array` and return a `Uint8Array` digest (raw
bytes); encoders turn bytes into strings. Unit tests (and the shipped app, via
`<<ct:inline logic.mjs>>`) import the same file.

- `textToBytes(str) -> Uint8Array` — UTF-8 encode.
- `md5(bytes) -> Uint8Array(16)`
- `sha1(bytes) -> Uint8Array(20)`
- `sha256(bytes) -> Uint8Array(32)`
- `sha512(bytes) -> Uint8Array(64)`
- `crc32(bytes) -> number` — unsigned 32-bit; `crc32Hex(bytes)` formats it as
  8-char lowercase hex.
- `hmac(hashName, keyBytes, msgBytes) -> Uint8Array` — RFC 2104 HMAC.
  `hashName` ∈ `'md5' | 'sha1' | 'sha256' | 'sha512'` (block size 64 for
  MD5/SHA-1/SHA-256, 128 for SHA-512). The UI only exposes HMAC for the SHA
  family, but the function supports MD5 too.
- `bytesToHex(bytes) -> string` — lowercase, no separators.
- `bytesToBase64(bytes) -> string` — standard alphabet, padded.

These MUST match published test vectors. Anchors verified in the self-check:
- `bytesToHex(sha256(textToBytes('abc')))` =
  `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`
- `bytesToHex(md5(textToBytes('')))` = `d41d8cd98f00b204e9800998ecf8427e`
- `bytesToHex(sha1(textToBytes('abc')))` =
  `a9993e364706816aba3e25717850c26c9cd0d89d`
- `bytesToHex(sha512(textToBytes('abc')))` starts `ddaf35a1…`
- `crc32Hex(textToBytes('123456789'))` = `cbf43926`
- `bytesToHex(hmac('sha256', textToBytes('key'), textToBytes('The quick brown
  fox jumps over the lazy dog')))` =
  `f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8`

Implementation notes: one shared big-/little-endian padder (`0x80`, zero fill,
64-bit length field) serves MD5 (little-endian words + length), SHA-1/256
(big-endian, 64-byte block), and SHA-512 (big-endian, 128-byte block, 128-bit
length field, all upper bits zero for realistic sizes). SHA-512 uses `BigInt`
masked to 64 bits for clarity/correctness. Bit-length is computed as a JS number
(exact well past any file size we'll hash).

## UI / behavior

- **Two input modes** (button toggle, `aria-pressed`): **Text** and **File**.
  - **Text mode:** a textarea; its UTF-8 bytes are hashed. Live, debounced.
  - **File mode:** a dropzone (drag-drop or click to choose) showing the file's
    **name** and **size**; a remove (✕) button clears it. The file is read as an
    `ArrayBuffer`. A soft warning appears above ~5 MB; a hard cap (~50 MB) with a
    clear error prevents locking up the tab. (Hashing is synchronous on the main
    thread — a Web Worker is a noted future improvement, not in scope here.)
- **No algorithm selection.** Every algorithm is always computed and shown at
  once — there is no card of checkboxes to pick which appear. (This replaced the
  earlier show/hide toggles.)
- **Controls & in-field copy (`controls.css`).** The tool adopts the shared
  `controls.css` include (after `base.css`): a standard 44px control height, and
  an **in-field copy button** inside every value field (`.ct-field` +
  `.ct-copy-btn`). Output value fields show their copy button **always**; the
  editable **text input** reveals its in-field copy only when non-empty. The
  **HMAC key is a secret and gets no copy button** (per the include's guidance).
- **Value fields.** Each digest is a **read-only `<input>`** in a `.ct-field`,
  with a `<label>` naming it (e.g. `MD5 · Hex`) and an always-shown copy button.
- **Output encoding:** Hex is always shown (lowercase). A **"Also show Base64
  (SHA family)"** checkbox adds a second Base64 field to the SHA-1/256/512
  entries — both plain and HMAC (CRC32 and MD5 stay hex-only, matching the
  brief). Persisted.
- **Plain and HMAC together:** the **plain** digests (MD5, SHA-1, SHA-256,
  SHA-512, CRC32) are shown, and a separate **HMAC** section shows the keyed
  variant of each block hash (HMAC-MD5/SHA-1/SHA-256/SHA-512; no HMAC-CRC32). A
  single **HMAC key** text field sits at the top of that section; as the key is
  typed the HMAC fields fill in **live** (debounced). With an **empty key** (or
  no source) the HMAC fields show a neutral em-dash placeholder — never an error.
  The key is **never persisted** (in-memory only).
- **Copy all:** a **"Copy all"** button copies every computed digest — plain and
  HMAC — as `LABEL: value` lines (plus a `LABEL (Base64): value` line where
  Base64 is shown). Disabled when there is no source. Copy uses the shared
  `copy`/`flash` (JbcClipboardUtil) (title + aria-label on every copy button).
- **Empty input:** with no text / no file, every value field shows an em-dash
  **placeholder** (empty value) rather than the hash of the empty string, to
  avoid implying an error. (The pure functions still hash the empty string
  correctly — that's just the display choice.)

### Destructive actions

The Text mode has a **Clear** button. Clearing a textarea is a low-stakes,
easily-retyped action, so — like `base64-tool` and `rest-tester` — it **skips**
the `confirmDialog` modal (documented carve-out per `docs/conventions.md` §
"Destructive actions require confirmation"). Removing a selected file is
likewise trivially reversible (re-drop it) and skips the confirm.

## Persistence

- Key `hasher:v1` (versioned, namespaced). Persists **only**: `mode`,
  `inputText`, and `showBase64`. Every read/write is `try/catch`-wrapped and
  degrades silently; the tool works fully with no stored state.
- **Never persisted:** the HMAC key, any file bytes, and all derived digests
  (recomputed on load).
- First-load Help flag under `hasher:help-seen:v1`, same try/catch-degrade
  pattern (storage failure ⇒ treat as seen, don't nag).

## Accessibility / conventions

- First-load **Help** modal (auto-once, then via the `?` button): `role="dialog"`,
  `aria-modal`, labelled heading, initial focus to the ✕, focus trap, Esc /
  backdrop close, focus-return, reduced-motion aware, `[hidden]` guarded, a
  pinned top-right **✕** (`data-testid="modal-close-x"`) as the sole close
  affordance.
- Icon-only buttons carry `title` + `aria-label`. Results announced via a polite
  `aria-live` region (once, not per keystroke).
- `<select>`? None used; still ship the shared `ct-base` block (`[hidden]`
  guard, `touch-action`) plus `controls.css`. Generic `button:hover` excludes
  `.jbcc-btn`.
- Light **and** dark themes (token palette + `prefers-color-scheme`).
  Responsive: stacks on narrow screens, no horizontal overflow, ~44px targets,
  long hex values wrap/scroll inside their own container.

## Test hooks

`window.__hasher` (inert for real users) exposes the pure functions
(`md5`, `sha1`, `sha256`, `sha512`, `crc32`, `crc32Hex`, `hmac`, `textToBytes`,
`bytesToHex`, `bytesToBase64`), a deterministic entry point (`recompute`,
`setMode`), and the live `state`. `data-testid`s on every interactive element.

## Out of scope / limitations

- No Web Worker (main-thread hashing; large-file cap instead).
- HMAC is shown for every block hash (MD5, SHA-1, SHA-256, SHA-512); CRC32 has
  no HMAC. Base64 is offered for the SHA family only (plain and HMAC).
- Key is interpreted as UTF-8 text (no hex/base64 key input mode) — kept simple.
