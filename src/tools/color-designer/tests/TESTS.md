# color-designer — test record

Verified against `tools/color-designer/index.html`. The primary,
authoritative verification is the automated `@playwright/test` suite
(`color-designer.e2e.mjs`), run via the CLI against a `file://` URL. A live
Playwright MCP browser spot-check was not attempted this session — per the
tester brief, this environment's MCP browser is confirmed network-isolated
and blocks `file://` (established across prior sibling-tool test runs:
`tools/hat-picker`, `tools/color-picker`, `tools/color-converter`), so it
cannot reach a single-file `index.html` either directly or via a local
static server. The CLI run below is authoritative.

## v10 round — palette-workflow feature batch

Added a large feature batch: per-swatch **pin/lock** across rerolls, **roll
history** (back/forward), **deterministic seeded rolls**, **export** (CSS vars /
SCSS / JSON / Tailwind / HEX / RGBA + Copy/Download/PNG), **WCAG contrast**
scoring, an **“explain this scheme” hue wheel**, **color-blindness preview**,
**demo-speed** + freeze-on-hover, **shareable-link** hash state, a **saved-
palette shelf** (localStorage), **keyboard shortcuts**, and additive **richer
mood params** (`anchorBias`/`roles`, off by default).

**v10 result: 90 unit + 191 e2e = 281 passed, 0 failed.** (Unit up from v9's 67
via `features.test.mjs`; e2e up from 173 via `color-designer-features.e2e.mjs`
plus the presence-test additions.)

- **Pure logic** (`tests/unit/features.test.mjs`, 23 tests): seeded rng
  (`hashStringToInt`/`mulberry32`/`makeSeededRng` determinism + reproducible
  rolls); CVD (`simulateCVD` identity for none/unknown, known matrix output for
  red under protanopia, grey invariance); locks (`applyLocks` position-based
  overwrite, out-of-range skip, alpha default); WCAG (`contrastGrade`/
  `contrastLabel` thresholds, `bestForegroundIndex`, `scorePairs`); export
  formatters (every format non-empty + shape checks, unknown → hex fallback);
  richer mood params (absent `anchorBias`/`roles` byte-identical to `MOOD_ANY`;
  `roles`/`anchorBias` change output as intended).
- **UI** (`tests/color-designer-features.e2e.mjs`, 18 tests): pin survives a
  reroll while others change / unpin / prune-on-shrink; history back/forward +
  forward-tail truncation + end-disabling; seeded-roll reproducibility; export
  select↔textarea + copy/download/PNG present; contrast rows = N; hue-wheel SVG
  dot per color; CVD repaint with untouched state colors; demo-speed persistence;
  share-hash round-trip + garbage-hash fallback; save/load/delete + persistence;
  keyboard shortcuts fire (and are ignored while typing).

**Bug found:** none in the product this round. One infra change: added
`retries: 1` to `playwright.config.mjs` to absorb an occasional reload+restore
**timing flake** under heavy parallel load (localStorage isolation across
contexts was empirically confirmed — it's CPU contention, not shared state, and
a different reload test flaked each run, never the same one). Footer/ctConfirm/
copy.js pasted-block hashes still match (untouched). `MOOD_ANY`-equivalence and
all prior v9 assertions still pass unchanged.

## v9 round — deeper mood/seed coverage + a keyboard-a11y bug fix

Two things: (a) a new **unit** file `tests/unit/moods-deep.test.mjs` and two new
**e2e** `describe` blocks that add real coverage of the mood layer and the
add-as-seed ＋ button (beyond the shape checks the v8 round below added); and
(b) a **genuine bug** found while writing the keyboard test, fixed with a
one-line, clearly-correct guard.

**Bug found + fixed (keyboard accessibility of the ＋ button).** The scheme
header is a `div[role="button"] tabindex="0"` whose `keydown` handler did
`if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleClick(i); }`
with no target check. The ＋ add-as-seed button is a real `<button>` nested in
that header. Pressing Enter/Space while the ＋ was focused **bubbled** to the
header handler, which `preventDefault`-ed the key — cancelling the button's own
native activation — and toggled the scheme row instead. Net effect: the ＋'s
action was **unreachable by keyboard** (confirmed: Enter on a focused ＋ flipped
the row's `aria-expanded` false→true and added **zero** seed chips). Fixed by
guarding the header handler with `if (e.target !== toggle) return;` so it only
responds to keys pressed on the header itself; bubbled keystrokes from the ＋
now reach that button's native activation. The edit touches only the module
`<script>` (not the pasted footer/ctConfirm blocks). No prior test exercised
header keyboard toggling, so this path was previously uncovered in both
directions.

New **unit** tests (`moods-deep.test.mjs`, 11 cases): `moodBaseHue` arc
containment for **every** themed mood across a 51-point rng sweep (not just
ocean/sunset); wrapped-arc math for warm (330→60) and sunset (335→45) crossing
360, plus normalization; the multi-arc selection branch (first draw picks the
arc, second the hue); themed-mood first-color-in-arc through `generateScheme`
for all offset-0 harmonies; **direction** checks that pastel is lighter *and*
less saturated than deep for identical rng draws, and that a larger `roleScale`
widens the in-scheme lightness swing (isolated with collapsed-range custom
moods); `spread=0` collapses every harmony to a single hue (via `anchorHues`
and via a spread-0 mood's generated colors clustering < 4°); a seed's base hue
honored for a hue-free (deep) mood but overridden by a themed (ocean) arc;
`'surprise'` never resolving to `'any'` across a 400-value sweep (and reaching
≥2 distinct moods); and `MOOD_ANY` === omitting mood across **every** algorithm
× counts {2,4,7,10}.

New **e2e** tests (2 `describe` blocks, 7 cases): (1) *add-swatch-as-seed:
keyboard, reduced motion, cross-form dedupe* — the ＋ activates from the
keyboard (focus + Enter) and adds a chip without rerolling (the regression the
bug fix above enables); under `prefers-reduced-motion` the ＋ still adds the
seed but the Roll button's wiggle resolves to `animation-name: none` (the class
is still applied, per the nudge's documented reduced-motion contract); dedupe by
canonical `rgba()` across hex / comma-`rgba()` / slash-`rgb()` forms of one
color collapses to a single chip, while a 1-channel-different color is **not**
deduped; and the header itself still toggles via Enter *and* Space when it (not
a child ＋) is focused (covers the new `e.target` guard's keep-working path).
(2) *mood: badge + roll survive a reload* — a themed mood (Ocean · Triadic)
restores its badge, its `mood-select` value, its resolved `.mood`, and the
**exact** rolled `schemes` (deep-equal proof of a restore, not a fresh random
roll); the classic "Any" mood restores a harmony-only badge.

**v9 result: 67 unit + 173 e2e = 240 passed, 0 failed** (up from v8's 56 + 166:
+11 unit, +7 e2e). The footer and ctConfirm pasted-component blocks were not
touched (the fix and all additions are in the module `<script>`, the two test
files, and docs); their sentinel hashes are unchanged.

## v8 round — moods + add-swatch-as-seed ＋ button (feature round)

Recorded here for completeness (this round predates the v9 test-deepening
above). Two features landed: (1) **Moods** — a `MOODS` data table layered on
top of the harmony (`hueArcs`/`spread`/`sat`/`light`/`roleScale`), with
`MOOD_MAP`, `MOOD_ANY` (a byte-for-byte no-op default), `SURPRISE_POOL`,
`moodBaseHue`, and `lerpRange`; `roll({…, mood})` resolves `'surprise'` to one
flavored mood per roll and echoes `.mood`; state key `moodSelect` persists in
`color-designer:v1`; the badge reads "Mood · Harmony". (2) The **add-as-seed ＋
button** on generated swatches (`addSeedFromColor`, deduped, wiggles, no
reroll), with the scheme header changed from a `<button>` to a
`div[role="button"] tabindex="0"` so the ＋ isn't nested in a button. Covered by
`tests/unit/moods.test.mjs` (mood shape, `anchorHues` spread, `'any'`-no-op,
`'surprise'` resolution) and e2e `describe` blocks "moods" and
"add-swatch-as-seed button" (badge, persistence, no-reroll, row-toggle guard,
dedupe). Suite totals after this round: **56 unit + 166 e2e**.

## v7 round — localStorage persistence (fixer pass)

Applied `docs/conventions.md` § "Persist UI state (localStorage)" — hat-picker
is the exemplar pattern. `index.html` gained a versioned key
**`color-designer:v1`**, a `saveState()`/`restoreState()` pair (both fully
try/catch-wrapped, per the convention), and a new `init()` that replaces the
old unconditional `window.addEventListener('DOMContentLoaded', performRoll)`.

What's persisted: the harmony `<select>` value, colors-per-scheme **N**, the
seed colors, and — because a roll is **random** and can't be
deterministically recomputed from its inputs — the **actual last-rolled
schemes** plus which algorithm was used and which scheme was expanded.
`saveState()` is called from every place that changes any of this: `addSeed`,
`removeSeed`, `clearSeedsDirect`, the harmony/count `<select>` `change`
handlers, `performRoll` (every roll, initial or re-roll), and `setExpanded`
(accordion open/close). `restoreState()` validates the stored blob field by
field (known algorithm key, finite count, well-formed `{raw, color}` seeds,
and a roll whose `schemes` is exactly 5 arrays of exactly `count`
`{r,g,b,a}` colors) and only reports success (`true`) when a **complete,
well-formed roll** was found — anything missing/unreadable/malformed makes
`init()` fall back to the normal fresh auto-roll, unchanged from before this
round. On a successful restore, `init()` renders the restored schemes
directly (re-expanding the previously-open scheme and restarting its live
demo) instead of auto-rolling — so reopening the tool shows exactly the
palette the user left, not a new random one. Nothing here touches the
wiggle-on-add nudge, the theme-per-roll behavior, or any other existing flow.

New `describe` block "localStorage persistence" (3 tests): (1) interacting
(add a seed, change harmony to Triadic, N to 6, roll, expand scheme index 2)
writes a `color-designer:v1` blob whose shape matches the live state
including the exact rolled `schemes`; reloading restores the identical
harmony/N/seeds/schemes/expanded-index — verified both via `state` and via
the UI (`harmony-select`/`count-select` values, seed chip count, the
re-expanded accordion row) — and specifically confirms the restored
`schemes` deep-equal the pre-reload ones (proof of a restore, not a fresh
random roll, which would almost certainly differ); (2) harmony/N changes,
seed removal, and `clearSeeds()` each independently update the stored blob;
(3) with `Storage.prototype.setItem`/`getItem` overridden to throw (via
`page.addInitScript`, applied on reload — the same simulation technique
`hat-picker`'s `crypto.randomUUID` regression test uses for a browser-level
API failure), the tool still auto-rolls a full 5-scheme palette on load and
stays fully interactive (seed add, harmony/count change, re-roll, accordion
expand) with **zero** `pageerror` events throughout — confirming the
degrade-silently contract holds under a genuinely throwing `localStorage`,
not just a missing one.

**v7 (this round) result: 142 passed, 0 failed**, run twice for stability
(~25–27s each) — up from v6's 139 (+3 new tests, 0 removed/changed); every
v6/v5/v4/v3/v2 item is unchanged and still passes verbatim. The footer
(`a97df085179a11175786e1d57d6c2a99`) and `ctConfirm`
(`3fe0e7648c094461cf01e8b3e524dbc7`) pasted-component blocks were re-hashed
after this round's edit (which touched only the module `<script>`, plus a
new `tests/color-designer.e2e.mjs` `describe` block and a `DESIGN.md`
"Persistence" section) and both still match their sentinel hashes exactly —
neither pasted block was touched.

## v6 round — ctConfirm "Yes" hover-specificity fix (fixer pass)

Adversarial-review finding (BLOCKER): the page-wide
`button:hover:not(:disabled)` rule (specificity 0,2,1) outranked the pasted
ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0), so hovering the
"Yes" button in the Clear-seeds confirm dialog washed its solid accent-purple
background (`rgb(124, 58, 237)`) out to near-white `#f1ecfc`
(`rgb(241, 236, 252)`) while the text stayed white — effectively invisible.
Violates `docs/conventions.md`'s ctConfirm hover-specificity note ("Yes"
must read as a clear, filled primary).

Fixed by excluding `.ctc-btn` from the generic hover rule. A first attempt
(`button:hover:not(:disabled):not(.ctc-btn)`) passed the new regression test
but **broke the pre-existing** "purple primary button hover" test: adding
`:not(.ctc-btn)` raises the generic rule's specificity from 0,2,1 to 0,3,1,
which newly out-specifies `.btn-primary:hover:not(:disabled)`'s 0,3,0 (tied
on the class/pseudo-class count, but the generic rule now also carries the
`button` element selector) — re-breaking Roll again's fill/text-invert
hover. Fixed for real by also excluding `.btn-primary` structurally
(`button:hover:not(:disabled):not(.ctc-btn):not(.btn-primary)`), so neither
accent button competes with the generic rule on specificity at all — the
same belt-and-braces pattern the sibling `color-picker` tool used for its
active toggle. The pasted ctConfirm block itself was not touched.

New `describe` block "ctConfirm "Yes" hover stays legible (CSS specificity
regression)" (3 tests): hovering "Yes" in the Clear-seeds dialog stays
`rgb(124, 58, 237)` with white text and differs from Cancel's hover
background; an ordinary button (Add seed) still gets the unchanged light
`#f1ecfc` hover; Roll again (`.btn-primary`) still inverts to white
fill/purple text on hover (re-confirms the pre-existing "purple primary
button hover" test still passes after the fix).

**v6 (this round) result: 139 passed, 0 failed**, up from v5's 136 (+3 new
tests, 0 removed/changed). The footer (`a97df085179a11175786e1d57d6c2a99`)
and `ctConfirm` (`3fe0e7648c094461cf01e8b3e524dbc7`) pasted-component blocks
were re-hashed after this round's edit (which touched only the generic
`button:hover` rule in `<style>`) and both still match their sentinel
hashes exactly.

## v5 round — mobile keyboard dismiss on Add seed (fixer pass)

Applied the repo-wide "submit dismisses the keyboard" convention
(`docs/conventions.md` § Responsive & mobile) to the seed **Add** action, the
only commit/submit control in this tool. `handleAddSeed()` in `index.html`
now:

- On a **successful** add: clears the input, clears `seedError`, then calls
  `seedInputEl.blur()` (previously it called `.focus()`) — dismissing the
  on-screen keyboard on mobile.
- On a **rejected** add (empty/invalid): sets the inline error text and now
  explicitly calls `seedInputEl.focus()` so the input keeps focus (and the
  keyboard stays up) for the user to fix the value.

No other behavior changed — the wiggle-on-add nudge on the Roll button, the
picker's two-way sync, and every other flow are untouched. A new
`describe` block, "Add seed: mobile keyboard dismiss convention" (3 tests),
asserts: a successful add leaves `document.activeElement !== seedInputEl`;
a rejected add (invalid text, and separately empty text) leaves
`seedInputEl` focused. The footer and `ctConfirm` pasted blocks were not
touched and were re-hashed to confirm (see "Pasted-component integrity"
below, carried over unchanged from prior rounds).

## v4 round — purple-button hover fix, spacer-label alignment, richer live demo

Four fixes/enhancements from `DESIGN.md` § "Controls bar" and § "Scheme
detail (expanded panel) → Live demo", implemented in `index.html` and
verified here; everything from v2/v3 (harmony math, N, seed injection,
accordion, wiggle, seed color picker) is unchanged and re-verified below.

1. **Purple primary button hover fix.** The old `.roll-btn:hover` rule
   (`filter: brightness(1.08)`) didn't actually control the hover fill — a
   higher-specificity base rule (`button:hover:not(:disabled) { background:
   #f1ecfc; }`) was silently winning over `.roll-btn`'s `background:
   var(--accent)`, so on hover the fill fell back to near-white while the
   text stayed white — an invisible label. Fixed with a new `.btn-primary`
   class (`.roll-btn` now carries both classes) whose `:hover:not(:disabled)`
   rule has enough specificity to always win, and **inverts** rather than
   fades: white fill, purple text, purple border stays purple throughout.
2. **Alignment via spacer label.** `.controls-bar`'s `align-items` moved from
   `center` to `flex-start` so every control's *box* top-aligns; the Roll
   button (previously label-less) is now wrapped in its own `.control` with
   an empty-but-`&nbsp;`-filled, `aria-hidden="true"` spacer `<label>` above
   it (Bootstrap-5 style) so its box top matches the harmony/colors-per-scheme
   selects' box tops. `.algo-badge` opts back into `align-self: center` since
   it isn't a form control.
3. **Richer live demo — all N colors, not ~4.** The expanded scheme's demo
   now renders `N` **sample lines** (`scheme-demo-lines`/`scheme-demo-line`),
   one per scheme color used as a background with its own best-contrast text
   (relative-luminance based, reusing `bestContrastIndex`), rotated so the
   current pairing leads — so the count scales with N and every color in the
   palette is visible simultaneously. A new **swatch column**
   (`scheme-demo-swatches`/`scheme-demo-swatch`, `N-1` swatches) shows every
   *non*-background color painted against the current demo background, and
   updates every time the pairing changes.
4. **Slower auto-cycle + playback controls.** The auto-cycle interval moved
   from ~2.5s to **7.5s** (~1/3 as often, `DEMO_CYCLE_MS`), keeping the
   existing CSS-transition crossfade. New **play/pause** toggle
   (`scheme-demo-toggle`, `aria-pressed` + `title`/`aria-label` "Pause"/
   "Play") and **prev/next** step buttons (`scheme-demo-prev`/
   `scheme-demo-next`, titled "Previous"/"Next") let the user pause the
   auto-cycle and manually step the pairing; `prefers-reduced-motion` now
   makes the demo **start paused** (no auto-cycle interval at all) while
   prev/next still work for manual stepping. `window.__colorDesigner` gained
   deterministic hooks `demoNext()`, `demoPrev()`, `demoTogglePlayback()`
   (plus `demoPlay`/`demoPause`) and `state.demo` grew `pairingIndex`
   (replacing the old unbounded `cycleStep`) and `isPlaying`.

## v3 round — visual seed color picker

This update adds the **visual HSV seed color picker** described in
`DESIGN.md` § "Seed color picker (visual — the primary input)" — the item the
v2 round explicitly left out of scope. The add-a-color row now starts with a
**swatch/eyedropper trigger button** whose fill is a live, checkerboard-backed
swatch of the text input's currently-parsed color; clicking it opens a
**popup** (a saturation/value square, a hue slider, and an alpha slider, all
custom `<div>`s driven by Pointer Events — no `<canvas>`, no native
`<input type="color">`). Dragging (mouse or touch) or arrow-key-nudging any
control writes the resulting color back into the text input as canonical
`#rrggbb` hex (alpha = 1) or `rgba(r, g, b, a)` (alpha < 1), and opening the
picker always re-parses whatever is currently in the text input (falling back
to a mid-hue/full-saturation/full-value/opaque default when it's empty or
invalid). The popup closes on Esc or a click outside it, returning focus to
the trigger, and stays within the viewport (flipping above the trigger and
clamping left/right near an edge; ~260px wide, fits a ~360px mobile screen).
Everything else — the harmony/generation engine, N, accordion, wiggle,
layout — is unchanged from the v2 round.

New pure helpers `rgbToHsv`/`hsvToRgb` (HSV, distinct from the existing
`rgbToHsl`/`hslToRgb` HSL pair) and three test hooks — `openSeedPicker()`,
`closeSeedPicker()`, `setSeedPickerHSVA({h,s,v,a})` — were added to
`window.__colorDesigner`, plus a live `state.seedPicker = {open,h,s,v,a}`
readback, per DESIGN.md's testability requirements.

## Automated CLI run (authoritative)

From `tools/color-designer/`:

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

Chromium was already installed in this environment (`npx playwright install
chromium` completed silently, exit 0). `npm run test:e2e` was run **five**
times in a row to rule out flakiness — the new v4 suite includes real
`page.hover()`/`click()` interactions and one real 3-second wall-clock wait
(to confirm the slower auto-cycle doesn't advance early), which are exactly
the kind of test worth re-running for stability. A pre-existing mobile test
(`no overlay intercepts hit-testing...`) turned out to need a fix too — see
"Bugs found" below — and was independently stress-run 20/20 in isolation
after the fix, plus held across all five full-suite runs.

**v4 result: 133 passed, 0 failed** (all five runs, ~22–25s each). This was
up from the v3 round's 112.

**v5 (this round) result: 136 passed, 0 failed**, run twice for stability
(~22s each) — the +3 over v4 is the new "Add seed: mobile keyboard dismiss
convention" `describe` block; no existing test was removed or changed, and
every v4/v3/v2 item is unchanged and still passes verbatim.

## Results by item (v4 additions)

| # | Item | Result | Notes |
|---|------|--------|-------|
| v4-1 | Purple primary button hover: fill/text invert | PASS | Before hover: purple fill (`rgb(124, 58, 237)`) + white text. On `page.hover()`: fill flips to white, text flips to purple, border stays purple throughout — `color !== background` always holds (the exact regression the old white-on-white bug violated). `.btn-primary` class confirmed present (reusable rule, not `#rollBtn`-specific). |
| v4-2 | Controls-bar alignment: spacer label top-aligns the Roll button | PASS | `roll-btn` and `harmony-select` `boundingBox().y` differ by ≤3px; same for `count-select`. The spacer `<label>` is confirmed `aria-hidden="true"` with a literal `&nbsp;` (U+00A0) as its only content — never an empty announced label. |
| v4-3 | Live demo: all-N sample lines + swatch column | PASS | At default N=4: exactly 4 `scheme-demo-line`s and 3 (`N-1`) `scheme-demo-swatch`es; re-rolling at N=7 scales both to 7 and 6. Sample lines have distinct backgrounds (not all identical). The swatch column's colors never include the index currently used as the demo background. |
| v4-4 | Live demo: playback controls (play/pause, prev, next) | PASS | Controls have non-empty `title` + `aria-label`; `window.__colorDesigner` exposes `demoNext`/`demoPrev`/`demoTogglePlayback` as functions and `state.demo.{pairingIndex,isPlaying}` with the right types. Without reduced motion the demo auto-plays (`isPlaying: true`, toggle shows "Pause", `aria-pressed="true"`) and does **not** advance within 3 real seconds (confirms the ~3x-slower cadence vs. the old ~2.5s). Clicking the toggle pauses (interval cleared, toggle → "Play") and clicking again resumes. `demoNext`/`demoPrev` hooks and real clicks on Next/Previous both change `pairingIndex` (wrapping at N) and re-render the hero card's `--demo-bg`; prev/next keep working while paused, without silently resuming the auto-cycle. |
| v4-5 | Live demo: `prefers-reduced-motion` starts paused | PASS | Under `reducedMotion: 'reduce'`, the demo loads with `isPlaying: false`, `intervalId: null`, toggle showing "Play" — and `demoNext`/a real click on Next still step `pairingIndex` (and don't silently start the auto-cycle). |

## Results by item (v5)

| # | Item | Result | Notes |
|---|------|--------|-------|
| v5-1 | Add seed (success) blurs the seed input | PASS | Focus the input, fill a valid color, click Add — a chip is created and `document.activeElement` is no longer the seed input (checked both via Playwright's `toBeFocused()` and an independent `document.activeElement === ...` evaluate). |
| v5-2 | Add seed (rejected: invalid text) keeps focus | PASS | Focus the input, fill invalid text, click Add — the inline error is shown, no chip is created, and the input remains focused. |
| v5-3 | Add seed (rejected: empty) keeps focus | PASS | Same as above with an empty input — still rejected (parseColor('') is null), error shown, input remains focused. |

## Results by item (v2/v3, re-verified this round)

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Pure math: `rgbToHsl`/`hslToRgb` round-trip, `parseColor`, `rgbaString`/`hexString` | PASS | Unchanged from v2 — this layer wasn't touched. |
| 2 | Harmony anchor math per algorithm | PASS | Unchanged — the picker doesn't touch generation. |
| 3 | Determinism (`makeSeqRng`/`rollWith`) | PASS | Unchanged. |
| 4 | THE KEY RULE: Random-mode coherence across all 5 schemes | PASS | Unchanged. |
| 5 | Seed injection bounds | PASS | Unchanged — seeds are still plain `{r,g,b,a}` objects regardless of whether they were typed or picked. |
| 6 | Configurable colors-per-scheme (N) | PASS | Unchanged. |
| 7 | Accordion (v2 rule) | PASS | Unchanged. |
| 8 | Detail: per-color rows + copy-all match the scheme | PASS | Unchanged. |
| 9 | Clear seeds via `ctConfirm`; per-chip × direct | PASS | Unchanged. |
| 10 | Reduced motion | PASS | Unchanged. |
| 11 | `data-testid` hooks + `window.__colorDesigner` API shape (v2 shape) | PASS | Unchanged — the v2 shape assertion still passes verbatim (new members are additive, checked separately). |
| 12 | Layout (v2) | PASS | Unchanged. |
| 13 | Wiggle nudge on adding a seed | PASS | Unchanged — still fires whether the seed came from typing or the picker, since both funnel through the same `addSeed()`. |
| 14 | Tooltips | PASS | Unchanged; the picker trigger's own tooltip is covered separately below. |
| 15 | Mobile (375×667, dpr2, touch) — v2 suite | PASS | Unchanged. |
| 16 | Seed picker: pure `rgbToHsv`/`hsvToRgb` math — **new** | PASS | Round-trips a spread of 8 colors within ±1/channel; known primaries/grays (`red`, `white`, `black`, `blue`) match exact expected HSV. |
| 17 | Seed picker: trigger swatch reflects the typed input — **new** | PASS | Typing a valid hex live-updates the swatch's computed `background-color`; empty and invalid text both fall back to `transparent` (the checkerboard shows through); adding a seed clears the input, which resets the trigger to the neutral state. |
| 18 | Seed picker: opening initializes from the current input — **new** | PASS | `#ff0000` → open → `h≈0, s=1, v=1, a=1`. A translucent `rgba()` → open → matching hsv + `a<1` preserved exactly. Empty/invalid input → the documented default (mid hue, full sat/val, alpha 1). Re-opening after the text changed while closed re-parses the new value (not stale). |
| 19 | Seed picker: `data-testid` hooks + API shape — **new** | PASS | Trigger/popup/sv-square/hue-slider/alpha-slider all present exactly once; trigger carries `title`/`aria-label="Pick a color"`; trigger is the first child of `.seed-add-row` (before the text input and Add); popup is hidden until `openSeedPicker()`; `window.__colorDesigner` exposes `rgbToHsv`, `hsvToRgb`, `openSeedPicker`, `closeSeedPicker`, `setSeedPickerHSVA` as functions and `state.seedPicker` as an object. |
| 20 | Seed picker: popup stays within the viewport — **new** | PASS | After opening at the default desktop size, the popup's bounding box is fully inside the viewport (accounts for the flip-above/clamp logic being a no-op when there's room). |
| 21 | Seed picker: two-way sync via `setSeedPickerHSVA` — **new** | PASS | Opaque color → hex written to the input + swatch updates; `a<1` → `rgba(...)` (never hex); a partial update (`{a: 0.25}` alone) leaves `h`/`s`/`v` untouched; out-of-range input (`h:730, s:2, v:-1, a:5`) is clamped/normalized to `h≈10, s:1, v:0, a:1`. |
| 22 | Seed picker: real pointer drag (mouse) — **new** | PASS | A real `page.mouse.down()`/`move()`/`up()` sequence on the sv-square lands at the expected `s`/`v` (within tolerance) and writes a parseable color into the input; dragging the hue slider to the 120° position writes `#00ff00` exactly; dragging the alpha slider to the midpoint produces `rgba(...)` output. |
| 23 | Seed picker: closing (Esc / click-outside) + focus return — **new** | PASS | Esc closes and returns focus to the trigger; a `page.mouse.click()` outside the popup closes it; clicking the trigger again toggles it closed; `aria-expanded` tracks open state throughout. |
| 24 | Seed picker: keyboard arrow-key nudging — **new** | PASS | `ArrowRight` on the focused hue slider: `h: 0→1`; `Shift+ArrowRight`: `h: 0→10`; `ArrowLeft` on the alpha slider decreases `a` and flips the input to `rgba()`; `ArrowUp` on the sv-square increases `v`. |
| 25 | Seed picker: Add still uses the synced text value — **new** | PASS | Picking a color via `setSeedPickerHSVA`, then clicking Add, produces exactly one seed chip whose label matches `hexString(parseColor(<the synced input value>))` — i.e. the picker and Add share the same text-input source of truth, no separate code path. |
| 26 | Seed picker: mobile viewport (375×667, dpr2, touch) real touch drag — **new** | PASS | A synthetic `PointerEvent(pointerType:'touch')` drag sequence on the sv-square (same technique the sibling `color-picker` tool's mobile suite uses, since Playwright's touchscreen API doesn't give fine drag control) lands at the expected `s`/`v` and writes a parseable color; a touch drag on the hue slider lands at the expected hue, and the popup's bounding box is confirmed to fit within the 375px-wide viewport; no horizontal page overflow with the picker open down to ~360px. |

## Bugs found

None in the product for this round either. `index.html` matches
`DESIGN.md`/`PLAN.md` exactly everywhere checked, including: the hover
inversion never producing matching fill/text colors, the spacer label being
`aria-hidden` and never announced, the demo's sample-line/swatch counts
scaling exactly with N, the swatch column always excluding the current
background index, the auto-cycle genuinely running ~3x slower, and prev/next
working identically whether playing or paused, and under reduced motion.

Two **test-authoring** issues were found and fixed while writing/re-running
the v4 suite (neither is a product bug):

- An early version of the "real click on Next" test read the hero card's
  *animated* `getComputedStyle(...).backgroundColor` immediately after the
  click, which can still equal the pre-click value on the very next
  synchronous read (the 600ms CSS crossfade transition hasn't progressed yet
  at that point). Fixed by reading the `--demo-bg` custom property directly
  (set synchronously by `renderDemo`, not animated) instead of the rendered,
  transitioning color.
- The pre-existing mobile test `no overlay intercepts hit-testing on the
  Roll button or an accordion expand control` started flaking (~1 in 7-10
  runs) at the 375×667 mobile viewport. Root cause: it measures
  `boundingBox()`/`elementFromPoint()` **without scrolling** — a real tap
  auto-scrolls first, but this manual hit-test didn't. The initially-open
  scheme's toggle already sat close to the bottom of a 667px fold pre-v4
  (seed section + controls bar are tall), and it's normal, expected page
  content, not a bug — but on the ~40% of rolls whose randomly-picked
  algorithm label (e.g. "Split-complementary") is long enough to affect
  controls-bar wrapping, the toggle's center could land a few px past
  y=667, making `elementFromPoint` return `null` (off-canvas) — a false
  negative, not a real overlay. Fixed by adding
  `locator.scrollIntoViewIfNeeded()` before measuring, matching what an
  actual tap does; re-stress-tested 20/20 in isolation after the fix, with
  no repeat failures across 5 additional full-suite runs.

The footer (`HASH: a97df085179a11175786e1d57d6c2a99`) and `ctConfirm`
(`HASH: 3fe0e7648c094461cf01e8b3e524dbc7`) pasted-component blocks were
independently re-hashed after all v4 edits and both still match their
sentinel hashes exactly — neither block was touched. Re-verified again after
the v5 keyboard-dismiss edit (which touched only `handleAddSeed()`): both
hashes still match.

## Automated coverage

All items above (v7 + v6 + v5 + v4 + the re-verified v2/v3 items) are encoded
as assertions in `color-designer.e2e.mjs` (**142** individual test cases
across 36 top-level `describe` blocks — 139 tests / 35 `describe` blocks
carried over unchanged from the v6 round, plus 1 new `describe` block / 3 new
tests for the v7 localStorage-persistence feature). **142 passed, 0
failed.**
