# Hasher

A single-file, dependency-free web tool that computes **MD5, SHA-1, SHA-256,
SHA-512, CRC32** — plus keyed **HMAC** (HMAC-MD5/SHA-1/SHA-256/SHA-512) — of a
text input or a dropped/selected file. Every algorithm is shown at once, each in
its own field. Everything runs locally in your browser; nothing is uploaded.

Open `index.html` directly (`file://`) in any modern browser, or serve it over
HTTP — it works the same either way.

## Usage

- **Text or File.** Toggle the mode. Text is hashed as its UTF-8 bytes; a file
  is read locally and hashed as its raw bytes (its name and size are shown).
- **Every algorithm at once.** MD5, SHA-1, SHA-256, SHA-512, and CRC32 are all
  shown together as lowercase hex — each in its own read-only field with a copy
  button. There is nothing to toggle on or off.
- **Base64.** Enable *Also show Base64* to add a Base64 field to the SHA-family
  digests.
- **HMAC.** Type a key in the **HMAC** section and the keyed
  HMAC-MD5/SHA-1/SHA-256/SHA-512 digests fill in live, alongside the plain
  digests (CRC32 has no HMAC). While the key is empty the HMAC fields show a
  neutral placeholder. The key is held in memory only and is **never** saved to
  your device.
- **Copy.** Each field has its own copy button; **Copy all** copies every shown
  digest as `LABEL: value` lines.

Your input text and the Base64 toggle are remembered on this device (via
`localStorage`). The HMAC key and file contents are never persisted.

## Why the hashes are hand-rolled

The obvious implementation would use the browser's built-in
`crypto.subtle.digest`, but [`SubtleCrypto`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
is a **secure-context-only** API: it is `undefined` when a page is served over
plain LAN HTTP, so it would silently break the "pull it up over the LAN" use
case these tools are built for. So every algorithm here — MD5, SHA-1, SHA-256,
SHA-512, CRC32, and HMAC (RFC 2104) — is implemented by hand in vanilla
JavaScript over `Uint8Array`, and runs identically under `file://`, plain HTTP,
and HTTPS. The implementations are verified against published test vectors.

## Developing (build from source)

This tool is **build-assembled**: the shipped `index.html` is generated from the
`source/` folder and must never be hand-edited.

- Edit the real source under `source/`:
  - `index.template.html` — page shell + include/inline tokens
  - `styles.css` — styles
  - `logic.mjs` — the pure, DOM-free hash engine (exported; unit-tested)
  - `app.mjs` — DOM wiring, modes, persistence, rendering, help modal
- Rebuild and verify:

  ```sh
  npm run build        # regenerate index.html from source/
  npm run build:check  # fail if index.html is stale
  ```

- Commit **both** the `source/` change and the regenerated `index.html`.

### Testing

```sh
npm install          # in THIS directory (never at the repo root)
npm test             # unit (node --test) then e2e (@playwright/test)
npm run test:unit    # pure-logic vectors only
npm run test:e2e     # browser suite only
```

The pure logic lives in `source/logic.mjs` and is imported directly by the unit
tests, so the shipped app and the tests share one source of truth.

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
