# hat-picker

A single-file random picker for game night: type in a list of suggestions
(games, activities, whatever you're deciding on) and pull a random winner from
the hat with a fun slot-machine animation and a confetti burst.

## Usage

Open `index.html` directly in a browser — no server, no build step, no
dependencies:

```sh
open tools/hat-picker/index.html
```

Or serve it statically if you prefer:

```sh
npx --yes serve tools/hat-picker
```

### How it works

1. Type a suggestion (up to 80 characters) and press **Enter** or click **Add**.
   A live counter shows how much room you have left; the input gives a gentle
   shake if you try to add a blank entry or a duplicate.
2. Keep adding entries — each one gets a remove (×) button, and the list shows
   a running count ("N in the hat").
3. Once you have at least 2 entries, click **Pull from the hat! 🎩**. The
   reveal card cycles rapidly through the entries, slows down, and lands on a
   randomly chosen winner, with a bounce and a confetti burst.
4. Click **Draw again** to repeat. Turn on **Remove winner after draw** if you
   want each winner taken out of the hat so it can't repeat.
5. **Clear all** asks for confirmation before wiping the list (Enter = yes,
   Esc = cancel).

Your entries (and the "remove winner after draw" preference) are saved to
`localStorage` automatically, so they're still there next time you open the
page. If `localStorage` isn't available (e.g. some browsers restrict it under
`file://`), the tool falls back to in-memory state for that session — nothing
breaks.

### Randomness

The winner is chosen by a pure `pickIndex(count, rng)` function backed by
`crypto.getRandomValues` — it's picked *before* the animation runs. The
slot-machine cycle is purely cosmetic and never influences which entry wins.

`prefers-reduced-motion` is respected: if set, the cycle and confetti are
skipped and the winner is revealed immediately.

### Testing hook

The page exposes a `window.__hatPicker` object (entries snapshot, `addEntry`,
`removeEntry`, `clear`, the pure `pickIndex`, `defaultRng`, and a
deterministic `draw({ instant: true, forceIndex })`) so automated tests (e.g.
Playwright) can drive and assert the tool without waiting on animations. It's
inert for normal use — just extra surface on `window`.

## Developing (build from source)

The shipped `index.html` is **generated** — don't hand-edit it. This tool grew
large enough to earn a build (see `docs/conventions.md` § "Build-assembled
tools"), so the code is authored under `source/` and inlined into the one file:

- `source/index.template.html` — the page shell + pasted shared includes.
- `source/styles.css` — the tool's CSS.
- `source/logic.mjs` — the pure, DOM-free engine (entry validation, `pickIndex`,
  `defaultRng`). Imported directly by unit tests.
- `source/app.mjs` — the DOM wiring (entries, animation, localStorage).

Commands (run in this directory):

- `npm run build` — assemble `source/` → `index.html` (vanilla Node, no deps).
- `npm run build:check` — fail if `index.html` is out of date with `source/`.
  This runs automatically before `npm run test:unit` / `test:e2e`, so `npm test`
  catches a forgotten rebuild. **Edit `source/`, then `npm run build`, then commit
  both.**

<!-- readme-footer: keep in sync with src/lib/components/readme-footer.md -->

---

Part of **[claude-tools](https://github.com/codercowboy/claude-tools)** — a collection of small, single-file, vanilla web & unix tools.

Code by Claude &middot; Ideas by Jason, the ideas guy.
