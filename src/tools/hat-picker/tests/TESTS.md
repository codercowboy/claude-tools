# hat-picker — live MCP browser test record

## Update: confirmDialog adoption, crypto.randomUUID fix, tooltips, keyboard-dismiss-on-add

Fixer pass bringing hat-picker up to current repo conventions and locking in
a hand-applied bug fix:

- **`crypto.randomUUID()` → `newId()` fix, locked in with a regression
  test.** `crypto.randomUUID()` is secure-context-only (undefined and
  throwing over plain HTTP / on a LAN) — this exact bug silently broke Add
  when hat-picker was served over LAN HTTP. The fix (already applied by hand
  before this pass) replaced it with `newId()`, backed by
  `crypto.getRandomValues` with a `Math.random` fallback. Added
  `tests/hat-picker.e2e.mjs`'s "regression: works when crypto.randomUUID is
  unavailable" test, which simulates a non-secure context via
  `page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', {
  value: undefined, configurable: true }); })` + reload, then drives Add
  through the real UI (typing + clicking Add, not the test hook). Verified
  by hand both ways: **fails** against the old `crypto.randomUUID()`-based
  code (Add throws, entry never added) and **passes** with `newId()`. Note:
  plain `delete crypto.randomUUID` (the shorthand suggested in
  `docs/conventions.md`) turned out to be a no-op in Chromium — `randomUUID`
  isn't an own property of the `crypto` instance, so `delete` silently does
  nothing; `Object.defineProperty` reliably shadows it instead. Worth fixing
  the convention doc's suggested snippet in a future pass.
- **Adopted the shared `confirmDialog` component**, replacing hat-picker's
  bespoke generalized `kind: 'row' | 'all'` confirm modal
  (`openConfirm`/`closeConfirm`/`confirmModalAction`/etc. — all removed,
  along with the `#clear-confirm-modal` markup and CSS). Per-entry × →
  `confirmDialog('Remove this entry?')`; Clear all →
  `confirmDialog('Remove all entries?')`. Themed via `--jbcc-accent: var(--brand)`
  (hat-picker's coral primary) plus `--jbcc-accent-fg`/`--jbcc-bg`/`--jbcc-fg`/
  `--jbcc-radius`/`--jbcc-btn-radius`/`--jbcc-focus`/`--jbcc-cancel-border`, so
  "Yes" renders as a clear filled coral button, not white/same-as-Cancel.
  `window.__hatPicker.removeEntry(id)`/`clear()` remain direct, non-modal
  calls. Tests updated to drive `getByRole('dialog')` and the "Yes"/"Cancel"
  button names (the component has no `data-testid`s of its own) instead of
  the old `clear-confirm-*` testids.
- **Pasted the HTML footer** (`tools/include/footer.html`, verbatim) at the
  bottom of `<body>`.
- **Found and fixed a real layout regression while adding the footer**:
  `body` was `display: flex; justify-content: center;` with **no**
  `flex-direction: column` — it worked when `.app` was `body`'s only child
  (a one-item flex row, centered), but adding the footer as a second child
  turned it into a two-item flex row, squeezing `.app` and the footer
  side-by-side (text wrapping character-by-character, `pull-button`
  rendering off-screen). Caught by the mobile-viewport
  `topElementAtCenterOf('pull-button')` test returning `null`
  (`elementFromPoint` outside the viewport). Fixed by removing the flex from
  `body` and centering `.app` via `margin: 0 auto` instead (matching
  `color-converter`'s non-flexed-body pattern) — verified visually via a
  screenshot at 375×667 before and after.
- **Icon-only button tooltip**: the per-entry remove **×** button now
  carries `title="Remove entry"` alongside its existing per-entry
  `aria-label`.
- **Blur (not focus) on a successful add**, per the repo's mobile-keyboard
  convention: a successful `addEntry()` now calls `els.input.blur()` instead
  of `.focus()`, so tapping Add on iOS/Android dismisses the on-screen
  keyboard (there's no dedicated dismiss API — the keyboard follows DOM
  focus). A rejected add (blank/duplicate) still keeps focus so the user can
  fix and resubmit immediately. Covered by a new test asserting both halves.

**Verified both pasted-component hashes match canonical** (`md5` of the
sentinel-delimited block): footer `a97df085179a11175786e1d57d6c2a99`,
confirmDialog `3fe0e7648c094461cf01e8b3e524dbc7`.

Re-run via CLI from `tools/hat-picker/`: `npm run test:e2e` →
**38 passed, 0 failed** (run twice to rule out flakiness). This includes all
prior coverage, updated to drive `confirmDialog` instead of the old bespoke
modal, plus the new crypto/newId regression test and the blur-on-add
assertion. See `DESIGN.md`/`PLAN.md` for the updated spec.

---

## Update (post-v1 change): per-entry ×-confirm + mobile coverage

Per project-lead request, the per-row **×** button no longer removes an entry
immediately — it now opens the same confirm modal Clear all uses (generalized
to carry a message + pending action/target: `kind: 'row' | 'all'`), with
"Remove this entry?", Enter=confirm (default focus), Esc=cancel, backdrop
click=cancel, focus trap, and focus returning to a sane element on close.
`window.__hatPicker.removeEntry(id)` remains a direct, non-modal call for
tests. A mobile-viewport `test.describe` block
(`viewport: 375x667, deviceScaleFactor: 2, hasTouch: true`) was added to
`hat-picker.e2e.mjs`, asserting no horizontal overflow, ~44px tap targets on
`entry-remove`/`clear-all`, add-an-entry via tap, a deterministic instant
draw, and the ×-confirm flow, all at mobile size. Two real tap-target gaps
found during the mobile audit were fixed in `index.html`: `entry-remove` was
36px (now 44px) and `clear-all` was 40px tall (now 44px); the
`remove-winner-toggle` label also gained padding to widen its tappable area.

Re-run via CLI from `tools/hat-picker/`: `npm run test:e2e` →
**33 passed, 0 failed** (run twice to rule out flakiness). This includes all
prior coverage below plus 6 new per-entry-confirm-modal tests and 5 new
mobile-viewport tests. See `DESIGN.md`/`PLAN.md` for the updated spec.

---


Verified against `tools/hat-picker/index.html` using the Playwright MCP
browser tools (`mcp__playwright__browser_*`), a real Chromium instance driven
interactively, not the automated spec. `file://` navigation is blocked by the
MCP browser tool itself ("Access to 'file:' protocol is blocked"), so the
page was served via `python3 -m http.server` on `127.0.0.1:8934` and loaded
as `http://127.0.0.1:8934/index.html` — behavior is otherwise identical
(localStorage, `window.__hatPicker`, DOM — all confirmed working the same
way). The automated Playwright spec (`hat-picker.e2e.mjs`) uses a `file://`
URL directly, since the full `@playwright/test` runner (unlike the MCP tool)
does not block that scheme.

Only harmless console output observed for the whole session: one `404` for
`/favicon.ico` (an artifact of serving over HTTP; irrelevant to the tool).

## Results

| # | Item | Result | Observed |
|---|------|--------|----------|
| 1a | Enter-to-add creates a row | PASS | Filled "Charades" into `entry-input`, counter read `8 / 80`; pressed Enter → `entry-count` = "1 in the hat", `entries` = `[{text:"Charades",...}]`, input cleared, counter reset to `0 / 80`. |
| 1b | Char counter updates live | PASS | `char-counter` textContent tracked input length exactly (`8 / 80` after typing 8 chars). |
| 1c | Blank/whitespace rejected | PASS | `addEntry('   ')` returned `false`; entry count unchanged (stayed at 1). |
| 1d | 80-char cap holds (>80 chars) | PASS | `addEntry('A'.repeat(120))` returned `true` but the stored entry's `text.length === 80` (JS-level `clampText` guard, independent of the input's `maxlength="80"` attribute). |
| 2a | Duplicate handling | PASS | `addEntry('Charades')` called again after it already existed returned `false`; entry count unchanged; confirmed the `shake` CSS class is applied to `entry-input` synchronously on the duplicate attempt. |
| 2b | Per-row remove (×) | PASS | Clicked the real "Remove AAAA…" button in the rendered list; entry removed from `window.__hatPicker.entries`, `entry-count` updated from "2 in the hat" to "1 in the hat". |
| 2c | Empty state show/hide | PASS | With 0 entries, `empty-state` visible and `entry-list` empty; after adding, `empty-state.hidden === true`; after clearing all, `empty-state` visible again. |
| 3 | Pull button disabled <2 / enabled ≥2 | PASS | Checked at 0 entries (`disabled: true`), 1 entry (`disabled: true`), 2 entries (`disabled: false`). All three states confirmed in one run. |
| 4 | Deterministic draw (`instant:true, forceIndex`) | PASS | With entries `[Charades, Pictionary, Codenames, Trivia Night]`, ran `await draw({instant:true, forceIndex:2})`. `winner-reveal` textContent = `"Codenames"`, `winner-announce` (the `aria-live="polite"` region) textContent = `"Codenames"`, both equal to `entries[2].text`. `drawState` = `{phase:"revealed", winnerId:<Codenames id>, winnerText:"Codenames", cycleHandle:null}`. |
| 5a | `pickIndex` purity (fake rng) | PASS | `pickIndex(10, ()=>0.5)` → `5`; `pickIndex(4, ()=>0.99)` → `3`; `pickIndex(4, ()=>0)` → `0`; `pickIndex(4, ()=>0.9999999)` → `3`; same rng value called twice (`pickIndex(7, ()=>0.42857)`) gave the same result (`2`) both times. `pickIndex(0, defaultRng)` threw a `RangeError`. |
| 5b | `pickIndex` unbiased range (real rng) | PASS | 5000 calls to `pickIndex(6, defaultRng)`: 0 out-of-range/non-integer results; bucket counts `{0:819, 1:846, 2:846, 3:863, 4:785, 5:841}` — roughly uniform across all 6 buckets, no bucket starved or dominant. |
| 6 | Remove-winner-after-draw toggle | PASS | Toggled `remove-winner-toggle` on (`settings.removeWinnerAfterDraw === true`), drew with `forceIndex:0` on entries `[Charades, Pictionary, Codenames, Trivia Night]` — winner "Charades" removed from `entries` (4 → 3, `Charades` no longer present), while `winner-reveal` textContent still read `"Charades"` (reveal not blanked by the removal, per DESIGN.md §2/§3). |
| 7a | Clear-all opens confirm modal | PASS | Clicking the real `clear-all` button (3 entries in the hat) made `clear-confirm-modal.hidden === false`, focus moved to `clear-confirm-yes`, modal title read "Clear all 3 entries from the hat?". |
| 7b | Esc cancels | PASS | Pressed `Escape` with the modal open: modal hidden again, entries **unchanged** (still 3), focus returned to `clear-all` button. |
| 7c | Enter confirms | PASS | Reopened modal, pressed `Enter`: modal hidden, `entries` emptied to `[]`, `empty-state` visible, `pull-button` reset to visible+disabled, `draw-again-button` hidden, `winner-reveal` reset to "Ready when you are!". |
| 8a | `instant:true` reveals immediately | PASS | Same run as item 4 — `await draw({instant:true, forceIndex:2})` resolved and updated the DOM with no animation delay (this is the same synchronous test-hook path). |
| 8b | `prefers-reduced-motion: reduce` reveals immediately (real, non-instant draw) | PASS | Used `page.emulateMedia({reducedMotion:'reduce'})` (via `browser_run_code_unsafe`), then called `await draw({forceIndex:1})` **without** `instant:true` on 3 fresh entries. `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`; the draw resolved in `~0.1ms` (vs. the ~2000ms cycle duration in DESIGN.md/PLAN.md) and `winner-reveal` immediately showed `"Reduced B"` (`entries[1]`). This is a distinct code path from the `instant:true` test hook — confirms the OS-level media query is honored independently. |
| Bonus | Real (non-instant, non-reduced-motion) animated draw | PASS | Clicked the actual `pull-button` with 4 entries and normal motion settings; after the click resolved, `drawState.phase === "revealed"`, `winner-reveal`/`winner-announce` both showed the landed winner ("Solo Entry"), confirming the full slot-machine animation path runs and lands correctly, not just the `instant` shortcut. |
| Bonus | `localStorage` persistence | PASS | After interacting with the tool over HTTP, `localStorage.getItem('hat-picker:v1')` returned a valid JSON blob matching the current `entries`/`settings` shape described in PLAN.md §7. |

## Screenshots

- `screenshots/winner-revealed.png` — full-page capture with 4 entries in the
  hat ("Charades", "Pictionary", "Codenames", "Trivia Night") and the winner
  card showing "Pictionary" (forced via `draw({forceIndex:1})`), the
  `aria-live` announce region, and the "Draw again" / toggle / Clear-all
  controls all visible.

## Bugs found

None. Every assertion above matched the behavior specified in `DESIGN.md`
and `PLAN.md` exactly — no deviations, no console errors beyond the expected
harmless `favicon.ico` 404 from serving over plain HTTP.

## Automated coverage

Every item in the table above is additionally encoded as an assertion in
`hat-picker.e2e.mjs` (`@playwright/test`, run against a `file://` URL). That
suite was executed in this same environment: `npx playwright install
chromium` succeeded and `npm run test:e2e` reported **19 passed, 0 failed**.
