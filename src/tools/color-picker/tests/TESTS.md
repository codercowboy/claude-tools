# color-picker — test record

Verified against `tools/color-picker/index.html`. The primary, authoritative
verification is the automated `@playwright/test` suite
(`color-picker.e2e.mjs`), run via the CLI against a `file://` URL. A live
Playwright MCP browser spot-check was attempted but could not reach the page
in this environment (`file:` is blocked, and a local `http.server` could not
be reached either — a known environment/network-isolation limitation, not a
tool problem); a standalone Playwright script (using the same Chromium
install as the CLI suite) was used instead for visual verification
(screenshots), and its results are folded in below.

This record was last refreshed for a **third fixer pass adding localStorage
UI-state persistence** (`color-picker:v1`, per `docs/conventions.md` "Persist
UI state (localStorage)") — see "Persistence (color-picker:v1)" below. It
supersedes the earlier record (63 tests) from a second **fixer pass
addressing 3 findings from an adversarial visual review**: a CSS-specificity
bug that washed out the ctConfirm "Yes" button's and the active Choose Color
toggle's hover background to near-white; the mouse-mode loupe rendering over
the header/toolbar before the first pointermove; and the mobile touch-mode
loupe overlapping the "Drag to aim" hint pill. See "Adversarial-review fixer
pass" below, and `PLAN.md` "Post-v1 changes (adversarial-review fixer
pass)".

## Automated CLI run (authoritative)

From `tools/color-picker/`:

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

**Result: 68 passed, 0 failed** (single worker, ~15s).

## Results by item

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Pure formatters (`rgbaString`/`hexString`) | PASS | Unchanged by this pass. |
| 2 | Deterministic load + sample (core correctness) | PASS | Unchanged by this pass. |
| 3 | `addColor` adds a row (newest on top), swatch/rgba/hex match | PASS | Unchanged. |
| 4 | Choose Color toggle: active/`aria-pressed` state, cursor, loupe (mouse) | PASS | Unchanged. |
| 5 | Copy buttons (rgba-copy / hex-copy / Copy-all) | PASS | Unchanged icon-flip/label-flip behavior. |
| 6 | **Remove single row via the shared `ctConfirm` dialog** | PASS | `getByRole('dialog')`, `aria-modal="true"`, message text, default focus on "Yes"; Esc cancels; Enter confirms and removes; Cancel button and backdrop click both cancel (clicking inside the dialog does not); `window.__colorPicker.removeColorById(id)` remains a direct, non-modal call. |
| 7 | **Remove all via the shared `ctConfirm` dialog** | PASS | Disabled at 0 colors; clicking while disabled is a no-op (no dialog); opens with the all-colors message and default focus on "Yes"; Esc cancels; Enter confirms and empties the list, re-disabling the button; `window.__colorPicker.removeAllColors()` remains a direct, non-modal call. |
| 8 | Derived output textareas (RGBA/HEX one-per-line) | PASS | Unchanged; the "removing one color" test still drives the row trash + `ctConfirm` Enter path end-to-end. |
| 9 | Pointer-gesture regressions (pinch-release / mid-drag toggle) | PASS | Unchanged. |
| 10 | `data-testid` hooks + `window.__colorPicker` API shape | PASS | The now-removed `confirm-modal*` testids were dropped from the top-level-testid list (the dialog has none of its own — a deliberate property of the shared, tool-agnostic component). `window.__colorPicker` now also exposes `removeColorById`/`removeAllColors`, verified present alongside every pre-existing member. |
| 11 | Touch relative-drag crosshair (mobile viewport) | PASS | Unchanged. |
| 12 | General mobile responsiveness (375px / 360px) | PASS | Unchanged, **plus** two new checks: the per-row `ctConfirm` dialog opens/confirms correctly via `.tap()` at mobile size, and the footer renders without causing horizontal overflow at 375px. |
| 13 | **Icon-only buttons carry a non-empty `title`** (new) | PASS | Per-row rgba-copy, hex-copy, and trash buttons; both Copy-all buttons; the touch-toast dismiss (×) button — all assert a truthy `title` attribute. This directly covers the bug Jason reported (copy buttons had no tooltip). |
| 14 | **Shared HTML footer** (new) | PASS | Renders exactly once, links to `https://github.com/codercowboy/claude-tools`, and does not break desktop layout — explicitly asserts `getComputedStyle(document.body).display !== 'flex'` (color-picker's flex container is the inner `.app` div, never `body`, so the footer being a second child of `body` is the safe shape — see "Footer / layout check" below) plus no horizontal overflow and the toolbar's primary button still on-screen. |
| 15 | **Loupe not over header on mouse-mode activation** (new) | PASS | See "Adversarial-review fixer pass" below. |
| 16 | **Hover states stay legible (CSS specificity)** (new) | PASS | See "Adversarial-review fixer pass" below. |
| 17 | **Touch loupe doesn't cover the hint pill** (new) | PASS | See "Adversarial-review fixer pass" below. |
| 18 | **localStorage UI-state persistence** (`color-picker:v1`, new) | PASS | See "Persistence (color-picker:v1)" below. |

## Persistence (color-picker:v1)

Third fixer pass, per `docs/conventions.md` "Persist UI state (localStorage)"
(hat-picker is the exemplar). New `test.describe('localStorage persistence
(color-picker:v1)', ...)` block, 5 tests:

- **What's persisted:** only `state.colors` (the collected color list —
  `{id, r, g, b, a}[]`, newest-first), under the versioned key
  `"color-picker:v1"`, e.g. `{"colors":[...]}`. The loaded **image is
  deliberately never persisted** (bytes can be large, and the color list is
  independent of the image); the two derived rgba/hex textareas are likewise
  never stored — they're recomputed from `state.colors` by
  `renderColorList()`/`renderOutputs()` on every load, same as on every
  in-session change.
- **Save on change:** `saveState()` is called at the end of `addColor`,
  `removeColorById`, and `removeAllColors` — the three functions that mutate
  `state.colors` (covering sampling via a real click, the `addColor` test
  hook, per-row trash, and Remove all).
- **Restore on load:** `loadState()` runs in the Init section, before the
  first render; it validates the stored shape (array of colors with
  in-range integer `r`/`g`/`b`, numeric `0<=a<=1`, integer `id`) and falls
  back to `{ colors: [] }` on anything unreadable/malformed/absent — same
  empty-start behavior as before persistence existed. `nextId` is bumped past
  the max restored id so newly added colors after a restore never collide
  with restored ones. `renderColorList()` then renders the rows and
  re-derives both textareas — this happens with **no image loaded**, proving
  the color list is independent of the image.
- **Best-effort + safe:** both `saveState()`/`loadState()` wrap every
  `localStorage` call in `try/catch` and degrade silently. Verified with a
  dedicated test that overrides `window.localStorage` (via
  `page.addInitScript`) with a getter whose `getItem`/`setItem`/etc. all
  throw `DOMException`: the tool starts empty (no rows, both textareas
  empty, Remove-all/Copy-all disabled), and adding a color + running the
  full Remove-all → `ctConfirm` → Enter flow still works end-to-end with
  **zero uncaught page errors**.
- **Distinct from the existing one-time touch toast.** The unrelated
  `TOUCH_TOAST_SEEN_KEY` (`'colorPickerTouchHintSeen'`) one-time-toast flag
  for the mobile touch-aim hint was left untouched — a separate, unversioned
  key, not folded into the `color-picker:v1` blob, and its dismiss-once
  behavior is unaffected by this pass (still covered by the pre-existing
  mobile touch-crosshair tests).
- Also covered: a real deterministic image-load-and-click sample (not just
  the `addColor` hook) writes the versioned key; per-row remove updates the
  stored list to the remaining color; Remove-all persists an empty list that
  survives a reload (`{"colors":[]}`, all rows gone, outputs empty,
  Remove-all disabled again after reload).

Both pasted-block hashes re-verified unchanged after this pass (neither the
footer nor `ctConfirm` block was touched):

- Footer: `a97df085179a11175786e1d57d6c2a99` — matches.
- ctConfirm: `3fe0e7648c094461cf01e8b3e524dbc7` — matches.

## Adversarial-review fixer pass (3 findings)

**Finding 1 (BLOCKER — conventions violation).** The page-wide
`button:hover:not(:disabled)` rule (CSS specificity 0,2,1) beat both the
pasted ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0) and
`.choose-color-btn.active` (0,2,0): hovering the "Yes" button in either
confirm dialog, or the active Choose Color toggle, repainted the solid
accent-blue background to near-white (`#eef1f8`) while the text stayed
white — effectively invisible, and a direct violation of
`docs/conventions.md`'s "Yes" must read as "a clear, filled primary." Fixed
by excluding `.ctc-btn` and `.choose-color-btn.active` from the generic
hover rule (`button:hover:not(:disabled):not(.ctc-btn):not(.choose-color-btn.active)`)
and adding an explicit `.choose-color-btn.active:hover` rule (0,3,0) that
re-asserts the filled accent state. The pasted ctConfirm block itself was
**not** touched — its md5 hash is unchanged (verified, see below) — only the
tool's own `<style>` block changed. Verified via a standalone Playwright
script measuring `getComputedStyle(...).backgroundColor` before/after
`.hover()`:

```
Yes bg before hover = rgb(47, 111, 237)
Yes bg AFTER hover  = rgb(47, 111, 237)   (unchanged — no more wash-out)
Yes text color after hover = rgb(255, 255, 255)
Cancel bg after hover = rgba(128, 128, 128, 0.15)   (distinct from Yes)
```

4 new tests (`hover states stay legible (CSS specificity regression)`
describe block): "Yes" hover in the remove-all dialog, "Yes" hover in the
per-row dialog, the active Choose Color toggle's hover, and a control test
confirming ordinary/inactive buttons (Reset view) still get the normal
`#eef1f8` light hover, unaffected by the fix.

**Finding 2 (MAJOR — visual).** `loupeEl.hidden = false` was set immediately
on mouse-mode Choose Color activation, but `loupeEl.style.left/top` were
only ever assigned inside `updateLoupe()`, which only runs on a real
`pointermove`/`pointerenter` over the canvas. Until the mouse first entered
the canvas, `#loupe` (`position: fixed`, left/top unset) fell back to its
static DOM position and rendered as a stray opaque circle over the
header/toolbar. Fixed with a new `positionLoupeDefault()` helper, called
once on activation before un-hiding the loupe: centers it over the canvas
(and draws the pixel under that point if an image is already loaded).
`updateLoupe()` takes over the instant a real pointer event fires. New test
(`Choose Color toggle` describe block) clicks the toggle — which moves the
mouse to the toolbar button, not the canvas — then asserts the loupe's
rendered rect doesn't overlap `.toolbar` and its center falls inside the
stage.

**Finding 3 (MINOR — visual).** On a ~375px mobile viewport, the touch-mode
loupe — offset up ~120+22px from the dead-center crosshair via the shared
`.loupe` CSS transform — overlapped and hid the "Drag to aim, tap to pick"
hint pill, which was anchored at `top: 8px`, squarely inside the loupe's
swept area on a canvas that short. Fixed by re-anchoring `.touch-hint` to
`bottom: 52px` instead (clear of the also-bottom-anchored one-time
`touch-toast` pill at `bottom: 8px`, so neither pill overlaps the other when
both show on a fresh first activation). New test (`mobile viewport ...:
touch relative-drag crosshair` describe block) loads an image, taps Choose
Color, and measures both pills' rects, asserting no overlap; verified via a
standalone script:

```
hintBox  = { x: 104.7, y: 381.4, width: 165.5, height: 26.2 }
loupeBox = { x: 128.5, y: 214.9, width: 120.0, height: 120.0 }
```

(loupe bottom edge 334.9 < hint top edge 381.4 — clear gap, no overlap.)

**Both pasted-block hashes re-verified unchanged** after all three fixes
(neither the footer nor ctConfirm block was edited):

- Footer: `a97df085179a11175786e1d57d6c2a99` — matches.
- ctConfirm: `3fe0e7648c094461cf01e8b3e524dbc7` — matches.

## `ctConfirm` "Yes" button styling (the reported bug)

Verified visually via a standalone Playwright screenshot (Chromium, same
browser install as the CLI suite): opening the per-row trash confirm dialog
renders **"Yes" as a solid filled blue button** (`--ctc-accent: var(--accent)`
= `#2f6fed`, white text) clearly distinct from the outlined white "Cancel"
button — not the previous bare-`AccentColor` fallback that rendered
near-white and indistinguishable from Cancel. `index.html`'s `:root` now sets
`--ctc-accent`, `--ctc-accent-fg`, `--ctc-bg`, `--ctc-fg`, `--ctc-radius`,
`--ctc-btn-radius`, `--ctc-focus`, `--ctc-cancel-border` to the tool's own
tokens.

## Footer / layout check

Per the task brief's warning that a sibling tool's layout broke when the
footer became a second child of a `display: flex` `body` (squeezing content
/ pushing a button off-screen): color-picker's `body` has **never** been
`display: flex` — only the inner `.app` `<div>` is
(`display: flex; flex-direction: column`), the same safe shape
`tools/color-designer` and `tools/color-converter` already use. This was not
just assumed — it was explicitly re-verified after pasting the footer:

- `getComputedStyle(document.body).display` asserted `!== 'flex'` (test
  suite, "shared footer" describe block).
- No horizontal overflow (`scrollWidth <= innerWidth + 2`) at desktop
  (1000px), 375px, and 360px widths — both via the automated suite and via a
  standalone Playwright script that captured full-page screenshots at all
  three sizes.
- Screenshots (desktop full page, mobile 375px full page, mobile 360px full
  page) show the toolbar, canvas stage, color list, derived-output
  textareas, and footer all stacking correctly with no squeeze, overlap, or
  off-screen elements; the footer sits centered below the app content with
  normal block-flow spacing (`margin: 3rem auto 0`).
- The toolbar's `load-btn` bounding box was asserted on-screen
  (`x >= 0, y >= 0`) after the footer's addition.

## Bugs found

None (beyond the two the task brief already identified and this pass fixed:
missing copy-button tooltips, and the `ctConfirm` "Yes" button rendering
white/indistinguishable from "Cancel"). Every assertion above matched the
behavior specified in `DESIGN.md` and `PLAN.md` (including this pass's
updates) and matched `index.html`'s actual implementation — no console
errors observed during any run. All 50 pre-existing tests continue to pass
(after being updated in place where they drove the now-removed bespoke
modal), alongside 7 new tests (57 total).

## Automated coverage

**68 tests** across 17 `describe` blocks (up from 63 tests / 16 blocks): one
new describe block was added for this pass ("localStorage persistence
(color-picker:v1)", 5 tests). Earlier growth (57 -> 63): one test was added
to the "Choose Color toggle" block (loupe not over the header on
activation), one new describe block was added ("hover states stay legible
(CSS specificity regression)", 4 tests), and one test was added to the
mobile touch describe block (loupe doesn't cover the hint pill).
**68 passed, 0 failed.**

## Cleanup

Root-level `node_modules/`, `package-lock.json`, and this tool's
`test-results/`/`.playwright-mcp/` install/output artifacts were removed
after the run — the repo is left source-only, per `docs/conventions.md`
"Build pipeline" cleanup step.
