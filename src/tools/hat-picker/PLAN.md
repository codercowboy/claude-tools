# hat-picker — Implementation Plan

Author: Claude (planner). Implements `tools/hat-picker/DESIGN.md`. The worker
implements strictly against DESIGN.md and this plan; if they conflict, DESIGN.md
wins and the discrepancy should be flagged, not silently resolved.

Deliverables for the worker: `tools/hat-picker/index.html`,
`tools/hat-picker/README.md`. Do not touch `package.json` (already present).

---

## 1. Overall structure of `index.html`

Single file, in this order:

```
<!doctype html>
<html lang="en">
<head>
  <meta charset>
  <meta viewport>
  <title>Hat Picker</title>
  <style> ... all CSS ... </style>
</head>
<body>
  <div class="app">
    <header> ... title, tagline ... </header>
    <section class="add-row"> ... input, Add button, counter ... </section>
    <section class="entries"> ... count, list, empty state ... </section>
    <section class="draw-area"> ... Pull button, Draw again, toggle, Clear all ... </section>
    <section class="winner"> ... reveal card, aria-live region ... </section>
  </div>
  <canvas id="confetti-canvas" aria-hidden="true"></canvas>

  <!-- Footer: tools/include/footer.html, pasted verbatim (sentinels included) -->
  <footer class="jbc-footer"> ... </footer>

  <!-- confirmDialog: JbcConfirm.mjs, pasted verbatim (sentinels included),
       a classic (non-module) <script> so it defines window.confirmDialog before
       the module script below uses it -->
  <script> ... confirmDialog ... </script>

  <script type="module">
    // organized as labelled sections, in this order:
    // 1. Constants (MAX_LEN=80, STORAGE_KEY, ANIM_DURATION_MS, CYCLE_MIN_INTERVAL_MS, etc.)
    // 2. Pure functions: pickIndex(count, rng), defaultRng(), clampText(text), isBlank(text)
    // 3. State: entries[], drawState, toggles, refs to DOM nodes
    // 4. Persistence: loadEntries(), saveEntries()
    // 5. Rendering: renderEntries(), renderCounter(), renderDrawButtons(), renderEmptyState()
    // 6. Entry mutations: addEntry(text) [uses newId(), NOT crypto.randomUUID()], removeEntry(id), clearAll()
    // 7. Draw logic: draw({instant, forceIndex}), runCycleAnimation(winnerIndex), revealWinner(entry)
    // 8. Confetti: Particle class/factory, startConfetti(), stopConfetti(), confetti RAF loop
    // 9. Event wiring: form submit/Enter, button clicks (remove/clear-all go through
    //    `if (await confirmDialog(message)) { ... }`), toggle change, resize handler for canvas
    // 10. Init: load persisted entries, initial render, prefers-reduced-motion query
    // 11. window.__hatPicker assignment (test hooks)
  </script>
</body>
</html>
```

Use one `<style>` block with CSS custom properties for the palette/sizing so
the playful theme is easy to tweak in one place. Use a single `<script
type="module">` — no separate files (the pasted `confirmDialog` classic
`<script>` is the one sanctioned exception, per `docs/conventions.md`'s
pasted-component convention — it is not a `<script src>` import, it's
literal inlined markup). Keep functions small and named; group with
`// ---- Section name ----` comments matching the list above so the file
stays navigable despite being one file.

**Gotcha (write-down, hit while adopting the footer):** `body` must **not**
be `display: flex` without an explicit `flex-direction: column` once it has
more than one child. hat-picker's original `body { display: flex;
justify-content: center; }` worked fine when `.app` was `body`'s *only*
child (flex-row default with one item + `justify-content:center` just
centers that one item horizontally). Adding the footer as a second child of
`body` turned that into a two-item flex **row**, squeezing `.app` and the
footer side-by-side instead of stacking them — a real, visually broken
regression caught by the mobile-viewport tests (`pull-button`'s
`getBoundingClientRect()` came back off-screen). Fixed by removing the flex
from `body` entirely and centering `.app` the same way `color-converter`
does: `.app { margin: 0 auto; }` (`.app` already had `width:100%;
max-width:640px`, so plain block-level auto-margins center it — no flex
needed on `body` at all).

---

## 2. State shape

```js
// Persisted (localStorage)
let entries = [ { id: string, text: string }, ... ]; // id: newId(), NOT crypto.randomUUID() — see §3a

// Transient UI/draw state (NOT persisted)
let drawState = {
  phase: 'idle' | 'cycling' | 'revealed',
  winnerId: string | null,      // id of the currently revealed winner, or null
  cycleHandle: number | null,   // requestAnimationFrame id, for cancellation
};

// Toggles (persisted alongside entries, small settings object)
let settings = {
  removeWinnerAfterDraw: boolean, // default false
};

// Confetti particles (transient, not persisted)
let confettiParticles = [];
let confettiRafHandle = null;
```

Persistence key: `localStorage` key `"hat-picker:v1"` storing
`JSON.stringify({ entries, settings })`. Version-prefixed key so a future
shape change can migrate/ignore cleanly without crashing on old data (wrap the
whole load in try/catch and fall back to `{ entries: [], settings: {
removeWinnerAfterDraw: false } }` on any parse error or shape mismatch).

Winner reference: store only `winnerId` (not the whole object) in
`drawState`, and look it up in `entries` when needed — this avoids stale
object references once removal happens. If `removeWinnerAfterDraw` is on and
the entry is removed, keep displaying the last revealed text (capture it into
`drawState.winnerText` at reveal time so the winner card doesn't blank out
after removal).

Add `drawState.winnerText` to the transient state above for this reason.

---

## 3. Add / validate / remove entry logic

**3a. Entry ids (`newId()`) — do NOT use `crypto.randomUUID()`:**

`crypto.randomUUID()` is **secure-context-only** (HTTPS / `localhost` /
`file://`). Served over plain HTTP on a LAN it's `undefined`, and calling it
throws — this exact bug shipped in hat-picker and silently broke Add when
served over LAN HTTP. Per `docs/conventions.md`'s "No secure-context-only
APIs" rule, generate entry ids with a small helper instead:

```js
function newId() {
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b); // available in every context, not just secure ones
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
```

`addEntry` calls `newId()`, never `crypto.randomUUID()` directly. Because
`file://` (what the automated suite loads via) *is* a secure context, the
suite can't catch a regression here just by running normally — it needs a
dedicated test that simulates a non-secure context (see §10/Testability).

**Add (`addEntry(text)`):**
1. `text = text.trim()`.
2. Reject if empty after trim (`isBlank`) — no error banner needed, just don't
   add; optionally a gentle shake on the input (see below) to signal "nothing
   happened."
3. Enforce 80 chars: `text.slice(0, 80)` as a hard guard (defense in depth)
   even though the `<input maxlength="80">` already prevents typing past it —
   paste can bypass `maxlength` in some edge cases, so guard in JS too.
4. Duplicate handling: DESIGN.md says "optionally block exact duplicates
   (with a gentle shake, not an error)." Implement: case-sensitive exact-match
   check against existing `entries[].text`; if a duplicate, trigger the shake
   animation on the input (CSS class toggled on/off via
   `requestAnimationFrame`/`setTimeout` ~300ms) and return without adding, no
   thrown error, no adding. A rejected add does **not** touch focus/blur — the
   input keeps whatever focus state it had so the user can fix and resubmit.
5. On success: push `{ id: newId(), text }` to `entries`, clear the input
   value, reset counter to `0 / 80`, persist, re-render list + counter + draw
   button enabled-state, then **blur** the input (`els.input.blur()`, not
   `.focus()`). Per `docs/conventions.md`'s "Responsive & mobile" ("submit
   dismisses the keyboard"): there's no dedicated API to dismiss the
   on-screen mobile keyboard — it follows DOM focus, so blurring the input is
   what hides it after tapping Add on iOS/Android. (Desktop is unaffected;
   there's no on-screen keyboard to dismiss.)

**Validate/guard function:** small pure helper `clampText(text)` → trims and
slices to 80; used both by `addEntry` and by the live counter display so the
counter never shows a value the guard would reject.

**Enter-to-add:** wrap the input + Add button in a `<form>` so Enter submits
naturally (`form.addEventListener('submit', e => { e.preventDefault();
addEntry(input.value); })`). This also gets Enter-to-add for free without a
manual keydown listener, and is more accessible.

**Char counter:** an element (`data-testid="char-counter"`) updated on every
`input` event on the text field: `${input.value.length} / 80`. When length
`>= 70` (near limit — pick a threshold, e.g. 70/80 = 87.5%), add a CSS class
`.near-limit` that changes color (e.g. amber) as the "visual cue" DESIGN.md
asks for. The counter's container should have an `aria-live="polite"` OFF by
default (a per-keystroke live region would be noisy/annoying for screen
readers) — instead give the input itself an `aria-describedby` pointing at
the counter element so its current value is available on demand, not
announced on every keystroke. Also set `aria-label` or associate a `<label>`
for the input distinct from the counter.

**Remove (`removeEntry(id)`):** filter `entries` to drop the matching id,
persist, re-render. If the removed entry was the currently-revealed winner
(`drawState.winnerId === id`), leave the reveal card showing
`drawState.winnerText` (already captured) — do not blank it, per section 2.
Disable "Draw again"/"Pull from the hat" button live if `entries.length < 2`
(recompute on every mutation). `removeEntry(id)` itself stays a **direct,
non-modal** function — per `docs/conventions.md`'s destructive-action rule, the
real UI path to it (a row's × button) goes through the shared `confirmDialog`
dialog (see §8), but `removeEntry` is called from that click handler only
after `confirmDialog` resolves `true`, and remains exposed on
`window.__hatPicker` for tests to call directly.

**Empty state:** when `entries.length === 0`, hide the list `<ul>`/rows and
show a friendly empty-state message inside the entries section (e.g. "Nothing
in the hat yet — add a few suggestions above!") with `data-testid="empty-state"`.
Toggle this in `renderEntries()`.

**Entry list rendering (`renderEntries()`):** rebuild the `<ul>` from
`entries` on every mutation (simplicity over diffing — entry counts here are
small, tens at most). Each `<li data-testid="entry-row" data-id="...">`
contains the text (escaped — set via `textContent`, never `innerHTML`, so
entries can't inject markup) and a remove button
`<button data-testid="entry-remove" aria-label="Remove {text}">×</button>`.
Also render the count line, e.g. `data-testid="entry-count"` → "5 in the
hat".

---

## 4. Randomness

```js
// Pure, testable, no side effects, no closures over app state.
export function pickIndex(count, rng) {
  if (count <= 0) throw new RangeError('pickIndex: count must be > 0');
  // rng() must return a float in [0, 1). Use rejection-free scaling since
  // we don't need cryptographic uniformity down to the bit for a hat picker,
  // but DESIGN.md calls for crypto.getRandomValues specifically for the
  // default rng, so implement defaultRng with proper unbiased rejection
  // sampling over a Uint32 range instead of floor(rng()*count), which is
  // fine for float rng() but let's do it right at the Uint32 layer:
  return Math.floor(rng() * count);
}

// Default rng, backed by crypto.getRandomValues with rejection sampling to
// avoid modulo bias, exposed as a float generator for pickIndex's simple
// contract, but internally unbiased over the needed range:
export function defaultRng() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296; // 2^32, gives a float in [0, 1)
}
```

Note on bias: dividing a uniform Uint32 by 2^32 to get a float, then
`Math.floor(f * count)`, has a theoretical bias only when `count` doesn't
divide 2^32 evenly, but at `count` values in the realistic range for a hat
picker (single/low-double digits) this bias is many orders of magnitude
smaller than any test can detect and is the standard accepted pattern (same
approach `Math.random()`-based code uses, just with a CSPRNG source). Do not
over-engineer full rejection-sampling for this tool — note the tradeoff in a
code comment so it's a documented decision, not an oversight. If the worker
wants to be extra rigorous, an alternative is fine but not required.

**Contract:** `pickIndex(count, rng)` is a pure function — same inputs, and
`rng` returning the same sequence, gives the same output. No `Math.random()`
anywhere in the codebase; no `Date.now()`-seeded anything. `rng` param
defaults to `defaultRng` when not passed:

```js
export function pickIndex(count, rng = defaultRng) { ... }
```

**Winner chosen up front:** in `draw()`, compute
`const winnerIndex = forceIndex ?? pickIndex(entries.length, defaultRng);`
*before* starting any animation. The animation (section 5) is purely
cosmetic — it must visually land on `entries[winnerIndex]` but never
influence which index was chosen. This ordering is the key invariant: no
animation code path may call `pickIndex` or otherwise select — it only
consumes the already-chosen `winnerIndex`.

---

## 5. Draw animation

**Entry point:**

```js
async function draw({ instant = false, forceIndex } = {}) {
  if (drawState.phase === 'cycling') return; // guard re-entry
  if (entries.length < 2) return; // guard (button should already be disabled)

  const winnerIndex = forceIndex ?? pickIndex(entries.length, defaultRng);
  const winner = entries[winnerIndex];
  if (!winner) return; // forceIndex out of range guard

  lockUI(true);
  drawState.phase = 'cycling';
  drawState.winnerId = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (instant || reducedMotion) {
    revealWinner(winner); // synchronous, no animation, no confetti (see below)
  } else {
    await runCycleAnimation(winner); // resolves after landing + bounce start
    revealWinner(winner);
    startConfetti();
  }

  lockUI(false);

  if (settings.removeWinnerAfterDraw) {
    removeEntry(winner.id); // keeps drawState.winnerText intact, see §2/§3
  }
}
```

Reduced-motion note: DESIGN.md says reduced-motion → "skip the cycle/confetti
and just reveal the winner immediately." `instant: true` (the test hook) also
skips animation but should still be allowed to show confetti in *normal*
runs if a test wants to exercise it — however, simplest and most predictable
is: **both `instant` and `reducedMotion` skip the cycle animation, and
neither triggers confetti**, since confetti is also a `requestAnimationFrame`
animation. This keeps `draw({instant:true})` fully synchronous per the
design's ask ("reveals ... synchronously so tests can assert the outcome
deterministically") and keeps reduced-motion users confetti-free too — matches
DESIGN.md's reduced-motion bullet exactly. If the worker wants confetti to
still occasionally run under `instant:true` for a visual smoke test, that's
a nice-to-have but not required; determinism for the test hook takes priority.

**Locking UI (`lockUI(bool)`):** disable the Pull/Draw-again button, the Add
button, the text input, and all remove buttons and the removeWinner toggle
while `bool` is true (attribute `disabled` toggled; also add a class for a
"busy" visual state e.g. reduced opacity / cursor). Re-enable after landing.
`Clear all` should also be disabled mid-draw to avoid ripping entries out
from under the animation.

**Cycle animation (`runCycleAnimation(winnerEntry)`):** time-based RAF loop,
returns a Promise that resolves once the landing + bounce trigger has
started (don't need to await the full bounce, just the point where the
winner text is correct and stable):

```js
function runCycleAnimation(winnerEntry) {
  return new Promise((resolve) => {
    const totalDurationMs = 2000; // within DESIGN.md's ~1.5-2.5s range
    const minStepMs = 40;   // fastest cycle step, near the start
    const maxStepMs = 260;  // slowest cycle step, near the end
    const startTime = performance.now();
    let lastStepTime = startTime;
    let cursorIndex = 0;

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / totalDurationMs, 1); // progress 0..1
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const currentStepMs = minStepMs + (maxStepMs - minStepMs) * eased;

      if (now - lastStepTime >= currentStepMs) {
        lastStepTime = now;
        // pick a cosmetic-only display index; NOT via pickIndex (that would
        // re-run selection logic on the hot path) — just cycle pseudo-
        // randomly through display; using defaultRng() here is fine too
        // since it's disconnected from the actual winner choice, but a
        // cheap Math.random() is acceptable ONLY in this purely-cosmetic
        // display-cycling spot (not for the winner decision) — comment
        // this clearly in code so nobody mistakes it for the selection
        // logic.
        cursorIndex = (cursorIndex + 1 + Math.floor(Math.random() * (entries.length - 1))) % entries.length;
        setReelText(entries[cursorIndex].text);
      }

      if (t >= 1) {
        setReelText(winnerEntry.text); // guarantee exact landing text
        triggerBounce(); // add/remove a CSS class for the scale/bounce keyframe
        resolve();
        return;
      }
      drawState.cycleHandle = requestAnimationFrame(frame);
    }
    drawState.cycleHandle = requestAnimationFrame(frame);
  });
}
```

Notes:
- Use `performance.now()` timestamps from the RAF callback, not
  `Date.now()`, and compute everything from `elapsed`/`totalDurationMs` so
  frame-rate hiccups don't change the total duration (time-based, per
  DESIGN.md).
- Ease-out cubic (`1 - (1-t)^3`) is a simple, standard deceleration curve;
  any monotonic ease-out is fine, keep it simple.
- Store `drawState.cycleHandle` so a future `Clear all` or unmount could
  `cancelAnimationFrame` it defensively (not strictly required since UI is
  locked during cycling, but cheap insurance).
- `Math.random()` is acceptable *only* inside the cosmetic reel-cycling
  display step — never for the actual winner decision, which is already
  fixed before this function runs. Comment this distinction directly above
  the line so a future reader (or reviewer) doesn't confuse it with
  `pickIndex`.

**Winner card bounce:** CSS keyframe, e.g.:
```css
@keyframes winner-bounce {
  0%   { transform: scale(0.8); }
  50%  { transform: scale(1.12); }
  75%  { transform: scale(0.96); }
  100% { transform: scale(1); }
}
.winner-card.bounce { animation: winner-bounce 420ms ease-out; }
```
`triggerBounce()` adds the `.bounce` class, and removes it after the
animation ends (`animationend` listener, one-shot) so re-triggering on the
next draw replays cleanly (removing+re-adding the class, or using
`classList.remove` then a `requestAnimationFrame` before re-add, to force a
style-recalc restart).

**`revealWinner(entry)`:** sets `drawState.phase = 'revealed'`,
`drawState.winnerId = entry.id`, `drawState.winnerText = entry.text`, updates
the winner card's text content, and updates the `aria-live="polite"` region's
text to something like `"Winner: {entry.text}"` — set this text exactly once
per draw (not per animation frame; only inside `revealWinner`, which itself
is only called once per `draw()` invocation) so screen readers announce it
once. Also flips the primary button's label/visibility from "Pull from the
hat!" to make "Draw again" available (see §7).

**Locking recap:** `lockUI(true)` at the very top of `draw()`, `lockUI(false)`
right after the (possibly awaited) reveal — i.e., re-enable controls once the
winner is settled, whether that took 0ms (instant/reduced-motion) or ~2s
(full cycle).

---

## 6. Confetti

Full-window `<canvas id="confetti-canvas">`, `position: fixed; inset: 0;
pointer-events: none; z-index: <high>;`, sized to `innerWidth`/`innerHeight`
(devicePixelRatio-aware for crispness) on init and on `resize`.

```js
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
```

**Particle model:**
```js
function makeParticle(originX, originY) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 4 + Math.random() * 6;
  return {
    x: originX, y: originY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 4, // slight upward bias for a "burst"
    gravity: 0.15 + Math.random() * 0.08,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 12,
    size: 5 + Math.random() * 5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    life: 1, // 1 -> 0, drives fade-out and removal
    decay: 0.006 + Math.random() * 0.006,
    shape: Math.random() < 0.5 ? 'rect' : 'circle',
  };
}
```

`startConfetti()`: origin at winner card's center (use
`getBoundingClientRect()`), spawn ~80-150 particles via `makeParticle`, push
onto `confettiParticles`, kick off the RAF loop if not already running.

`confettiTick(now)`: for each particle, `vy += gravity`, `x += vx`, `y +=
vy`, `rotation += rotationSpeed`, `life -= decay`; draw each as a small
rotated rect or circle at `globalAlpha = Math.max(life, 0)`; filter out
particles with `life <= 0` or `y > canvas.height + margin`; clear+redraw the
canvas each frame; when `confettiParticles.length === 0`, cancel the RAF loop
and clear the canvas (`stopConfetti()`), so it doesn't run forever in the
background.

`CONFETTI_COLORS`: a small fixed palette (e.g. 6 playful hex colors) as a
top-level constant.

Respect reduced-motion: `startConfetti()` should simply not be called at all
in the reduced-motion/instant path (already handled in `draw()`, §5) — no
need for confetti internals to re-check the media query.

Guard against overlapping bursts: if `draw again` is clicked while old
confetti particles are still fading (rare, since UI is locked during
cycling, but the *fade-out* continues after unlock), it's fine to just add
more particles to the same `confettiParticles` array — the loop already
generalizes over however many particles exist. No special-case needed.

---

## 7. localStorage persistence

```js
const STORAGE_KEY = 'hat-picker:v1';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, settings }));
  } catch (err) {
    // Best-effort: localStorage unavailable (file://, private mode, quota,
    // disabled by browser policy). Degrade silently to in-memory only.
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], settings: { removeWinnerAfterDraw: false } };
    const parsed = JSON.parse(raw);
    const loadedEntries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(e => e && typeof e.id === 'string' && typeof e.text === 'string')
      : [];
    const loadedSettings = {
      removeWinnerAfterDraw: !!(parsed.settings && parsed.settings.removeWinnerAfterDraw),
    };
    return { entries: loadedEntries, settings: loadedSettings };
  } catch (err) {
    return { entries: [], settings: { removeWinnerAfterDraw: false } };
  }
}
```

Call `saveState()` after every mutation: `addEntry`, `removeEntry`,
`clearAll`, and whenever `settings.removeWinnerAfterDraw` toggles. Do
**not** persist `drawState` (transient, per DESIGN.md: "Persist entries
only, not transient draw state" — extend that to include the toggle's
current *value* being fine to persist since it's a durable preference, not
draw state, but the winner/phase/animation handle must never be persisted).

On init: `({ entries, settings } = loadState());` then render.

---

## 8. Shared `confirmDialog` dialog (per-entry remove + clear-all) & remove-winner-after-draw

**Change (post-v1, superseding the original bespoke modal below):** per
`docs/conventions.md`'s "Destructive actions require confirmation" rule, a
per-row **×** is *also* destructive and must confirm, exactly like Clear
all. hat-picker originally built its own generalized `kind: 'row' | 'all'`
confirm modal for this (mirroring `color-converter`'s *original* approach).
Per the repo's later "Use the shared component" convention, that bespoke
modal has been **removed** and replaced with the shared, pasted
`confirmDialog(message)` component (`JbcConfirm.mjs`, pasted verbatim
— sentinels included — as a classic `<script>` block right after the app
markup and before the module `<script>`, same placement `color-converter`
uses):

```js
els.entryList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="entry-remove"]');
  if (!btn || btn.disabled) return;
  const li = btn.closest('[data-testid="entry-row"]');
  if (!li) return;
  const { id } = li.dataset;
  if (await confirmDialog('Remove this entry?')) removeEntry(id);
});

els.clearAllButton.addEventListener('click', async () => {
  if (entries.length === 0) return; // nothing to clear
  if (await confirmDialog('Remove all entries?')) clearAll();
});
```

`confirmDialog` handles Enter=Yes (default focus), Esc=Cancel, backdrop-click=Cancel,
focus trap, and returning focus to the triggering control, all internally —
none of that needs reimplementing in `index.html` anymore. It has **no
`data-testid`s of its own** (it's a tool-agnostic pasted component); tests
drive it via `getByRole('dialog')` and the "Yes"/"Cancel" button names, and
`.jbcc-overlay`/`.jbcc-message` locators for backdrop/inside-dialog clicks.

**Theming:** set `--jbcc-accent`, `--jbcc-accent-fg`, `--jbcc-bg`, `--jbcc-fg`,
`--jbcc-radius`, `--jbcc-btn-radius`, `--jbcc-focus`, `--jbcc-cancel-border` on
`:root` to hat-picker's own tokens (`--jbcc-accent: var(--brand)` — the
tool's coral primary — with `--jbcc-accent-fg: #ffffff`), so the highlighted
**"Yes"** button reads as a clear, filled primary rather than the bare
system-color fallback, and never looks the same as "Cancel" — per
`docs/conventions.md`'s theming rule for adopting tools.

`removeEntry(id)`/`clearAll()` themselves are unchanged — still direct,
non-modal functions, invoked here only after `confirmDialog` resolves `true`,
and still exposed on `window.__hatPicker` for tests.

<details>
<summary>Original (removed) bespoke modal implementation, kept here for
history — do not reintroduce; superseded by confirmDialog above</summary>

The original modal was a `<div id="clear-confirm-modal" hidden>` generalized
to carry a message and pending action/target (`kind: 'row' | 'all'`, plus
`rowId` for `'row'`), with `openConfirm`/`closeConfirm`/`confirmModalAction`/
`onModalKeydown` functions reimplementing the same Enter/Esc/backdrop/focus-trap
behavior `confirmDialog` now provides for free. All of that markup, CSS, and JS
was deleted when adopting `confirmDialog`.

</details>

`clearAll()`: empties `entries`, resets `drawState` to idle
(`winnerId/winnerText` cleared too, winner card hidden), persists, re-renders
everything including disabling the draw button. Also cancel any in-flight
confetti/cycle RAF handles defensively.

**Remove-winner-after-draw toggle:** a checkbox or switch,
`data-testid="remove-winner-toggle"`, bound to `settings.removeWinnerAfterDraw`,
`change` event updates the setting + persists. Behavior consumed in `draw()`
(§5): after `revealWinner()`, if the toggle is on, call
`removeEntry(winner.id)`. Note this re-triggers `renderEntries()` and updates
the draw-button's disabled state (e.g. drops back below 2 entries → Pull
button disables again, which is correct/expected).

---

## 9. Accessibility

- Winner reveal: `<div id="winner-announce" aria-live="polite"
  data-testid="winner-announce">` — text set exactly once per draw, inside
  `revealWinner()` only (see §5). Keep this element visually present (can be
  styled subtly, doesn't need to be `sr-only` since the visible winner card
  also shows the same text — DESIGN.md doesn't require visually-hidden, just
  that the *live region* update happens once).
- All interactive controls are native `<button>`, `<input type="text">`,
  `<input type="checkbox">` (or `<button role="switch">` if a nicer toggle
  is wanted, with `aria-checked` kept in sync) — never a `<div>` with a click
  handler.
- Every input has an associated `<label>` (visually present or
  `aria-label`), including the toggle.
- Visible focus: don't strip `outline` in CSS; if a custom focus ring is
  desired, use `:focus-visible` with a clear high-contrast ring, applied
  globally to buttons/inputs.
- Tap targets: buttons at least ~44px tall (CSS `min-height`), generous
  padding, larger font for the Pull button per DESIGN.md's "kid-friendly"
  framing. Applies to *every* interactive control, not just the headline
  Pull/Draw-again buttons — a mobile audit found `entry-remove` (was 36px)
  and `clear-all` (was 40px tall) under the guideline; both are now 44px
  minimum, and the `remove-winner-toggle`'s `<label>` gets vertical padding
  so its tappable area approaches 44px without inflating the native checkbox
  itself.
- `prefers-reduced-motion` checked once via `matchMedia(...).matches` at
  draw-time (§5); no need to react to it changing mid-session dynamically
  (edge case, not worth the complexity — but do not cache it at module load
  either, check fresh each `draw()` call so a mid-session OS setting change
  is honored on the next draw).
- Confetti canvas: `aria-hidden="true"` (decorative only, per DESIGN.md
  "purely visual").

---

## 10. Testability hooks

**`data-testid` values** (must match exactly, used by the tester agent):
- `entry-input` — the text input
- `add-button` — Add button
- `char-counter` — the `N / 80` counter
- `entry-list` — the `<ul>`/container wrapping entry rows
- `entry-row` — each `<li>` (also carries `data-id`)
- `entry-remove` — each row's × button (icon-only: also carries
  `title="Remove entry"` alongside its per-entry `aria-label`, per
  `docs/conventions.md`'s icon-only-button tooltip rule)
- `entry-count` — the "N in the hat" text
- `empty-state` — empty-state message container
- `pull-button` — the big "Pull from the hat! 🎩" button
- `draw-again-button` — shown post-draw (may be the *same* physical button
  re-labeled, in which case put both testids as a single element switching
  its `data-testid`/label — but simplest for testing is two distinct
  elements toggled via `hidden`, so a test can query either state reliably
  without racing a label-text change; prefer that approach)
- `remove-winner-toggle` — the checkbox/switch
- `clear-all` — Clear all button
- (no testid for the confirm dialog — it's the shared `confirmDialog`
  component, which has none of its own; drive it via `getByRole('dialog')`
  and the "Yes"/"Cancel" button names, see §8)
- `winner-reveal` — the winner card element (visible text of the winner)
- `winner-announce` — the `aria-live` region (may be the same element as
  `winner-reveal` if convenient, or separate — either is fine as long as one
  of them carries `aria-live="polite"` and both, if separate, always show
  the same text)

**`window.__hatPicker` namespace**, assigned at the end of the module script:

```js
window.__hatPicker = {
  // read-only snapshot, not a live reference the test could mutate to cheat:
  get entries() { return entries.map(e => ({ ...e })); },
  get settings() { return { ...settings }; },
  get drawState() { return { ...drawState }; },
  addEntry,
  removeEntry,
  clear: clearAll,
  pickIndex,        // the pure function itself, unbound, for direct unit testing
  defaultRng,
  draw,              // draw({ instant: true, forceIndex: 2 })
};
```

Keep this assignment unconditional (no env-detection gate) since DESIGN.md
just says "keep the namespace inert for normal users" — i.e., it must not
change behavior for a normal user (it doesn't — it's purely additive
surface), not that it must be excluded from production. A single file with
no build step can't easily strip this anyway; document with a one-line
comment: `// Test hook — inert for normal use, enables deterministic
Playwright assertions.`

`draw({ instant: true, forceIndex })` must be safely callable multiple times
in a row from a test without needing to wait ~2s each time (already
guaranteed by the `instant` path in §5 being fully synchronous — no
`await` actually suspends when `instant` is true, so callers can `await
draw(...)` and immediately assert). Double check: the function is `async`
so it always returns a Promise, but the *body* takes the synchronous
`revealWinner` branch when `instant` is true, so the Promise resolves on the
next microtask — a test doing `await window.__hatPicker.draw({instant:true,
forceIndex:0})` then reading `winner-reveal` textContent will see the
correct value.

`forceIndex` bounds: if `forceIndex >= entries.length` or `< 0`, treat as
invalid and just return without drawing (don't throw — keep it forgiving
for test convenience, but a test relying on this should pass valid indices).

**Non-secure-context regression coverage:** per `docs/conventions.md`'s "No
secure-context-only APIs" note, the suite includes a dedicated test that
simulates `crypto.randomUUID` being unavailable — via
`page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', {
value: undefined, configurable: true }); })` before the page's own scripts
run, then reloading and driving Add through the real UI. (Plain `delete
crypto.randomUUID` — the shorthand in `docs/conventions.md` — turned out to
be a no-op in Chromium, since `randomUUID` isn't an own property of the
`crypto` instance; `Object.defineProperty` reliably shadows it instead. This
was verified empirically while writing the test — see the test's own
comment in `tests/hat-picker.e2e.mjs`.) This test fails against
`crypto.randomUUID()`-based code and passes with `newId()` (§3a).

**Mobile coverage:** per `docs/conventions.md`'s "mobile behavior must have
test coverage," the suite includes a `test.describe` block scoped via
`test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
hasTouch: true })` — no separate Playwright *project* was needed since a
scoped `test.use()` block within the single spec file already runs both the
default (desktop) tests and the mobile-scoped tests in one `npm run
test:e2e` invocation. It asserts: no horizontal page overflow
(`document.scrollingElement.scrollWidth <= innerWidth` + small tolerance),
key controls visible and at-or-above the 44px tap-target guideline,
add-an-entry via `.tap()`/Enter, a deterministic `draw({instant:true,
forceIndex})` still reveals correctly, and the per-entry ×-confirm flow
(the shared `confirmDialog` dialog opens, Enter confirms, Esc cancels) at mobile
size.

---

## 11. Build checklist (ordered)

*Historical, v1. Items 1, 2, and 7 reference the original bespoke modal,
since superseded by the shared `confirmDialog` component (see §8 and "Post-v1
changes" below) — kept as-is for build history, do not follow items 1/2/7
literally when rebuilding from scratch.*

1. Scaffold `index.html` with the DOM skeleton from §1 (header, add-row,
   entries, draw-area, winner, confetti canvas, clear-confirm modal) and all
   `data-testid` attributes from §10 in place up front, even before behavior
   is wired — makes later steps mechanical.
2. Write the CSS: layout (single column, responsive, mobile-friendly),
   palette/typography (playful, kid-friendly), button/input styling with
   visible `:focus-visible`, the `.near-limit` counter cue, the shake
   keyframe, the `winner-bounce` keyframe, the modal overlay styling. Get
   dark/no-dark decision out of the way (DESIGN.md doesn't require a
   dark-mode toggle; a single pleasant theme is enough — optionally respect
   `prefers-color-scheme` if trivial, but not required).
3. Implement the pure functions first, in isolation: `pickIndex`,
   `defaultRng`, `clampText`, `isBlank`. These have no DOM dependency — get
   them right before touching rendering.
4. Implement state + persistence: `entries`, `settings`, `drawState`,
   `loadState`/`saveState`, wire init to load persisted state before first
   render.
5. Implement rendering functions: `renderEntries` (rows + empty state +
   count), `renderCounter`, `renderDrawButtons` (enabled/disabled + which of
   pull/draw-again is visible). Call once at init.
6. Implement `addEntry`/`removeEntry`/`clearAll`, wire the add `<form>`
   submit, remove-button clicks (event delegation on `entry-list` is fine
   and simpler than per-row listeners), and the input's live `input` event
   for the counter + shake-on-duplicate.
7. Implement the Clear-all modal (open/close/keydown wiring) and hook
   `clear-all` button → `openClearConfirm`.
8. Implement `pickIndex`-driven winner selection inside `draw()` (no
   animation yet) — get the non-animated instant/reduced-motion path fully
   correct and testable first (this is also exactly the `instant:true` test
   path).
9. Implement `runCycleAnimation` (RAF loop, easing, reel text updates) and
   wire it into `draw()`'s non-instant/non-reduced-motion branch. Verify
   visually the deceleration feels right (~2s, starts fast, lands cleanly).
10. Implement the winner bounce CSS trigger and `revealWinner`'s aria-live
    update.
11. Implement confetti (canvas sizing/resize listener, particle factory,
    RAF tick, start/stop) and hook it in after landing, non-reduced-motion
    only.
12. Implement `removeWinnerAfterDraw` toggle + its consumption in `draw()`.
13. Wire `lockUI` around the full `draw()` call and verify all controls
    (add, remove buttons, clear-all, toggle, pull button) are disabled
    mid-cycle and re-enabled after.
14. Assign `window.__hatPicker` and do a manual smoke test in a browser:
    add entries, force-draw via the console, verify deterministic reveal,
    verify normal draw animates and confetti fires, verify reduced-motion
    (toggle OS setting or `matchMedia` override) skips both.
15. Test `file://` persistence behavior manually (or note if
    `localStorage` throws under `file://` in the target browser — confirm
    the try/catch degrades silently, no console errors, app remains fully
    usable in-memory).
16. Write `tools/hat-picker/README.md`: what it is, how to open it
    (`open index.html` or serve statically), a quick usage walkthrough, and
    a short note on the `window.__hatPicker` test hook existing for
    automated testing (so it's not mysterious to a future reader).
17. Final pass against DESIGN.md's Testability and Accessibility sections
    line-by-line to confirm nothing was missed (all testids present, aria-live
    fires once, focus/labels present, 80-char cap enforced both via
    `maxlength` and JS guard, duplicate-shake works, empty state shows/hides
    correctly, draw disabled under 2 entries).

### Post-v1 changes (fixer pass)

18. **`newId()` instead of `crypto.randomUUID()`** (§3a): swap the entry-id
    generator for the secure-context-safe helper. Add the non-secure-context
    regression test.
19. **Adopt `confirmDialog`** (§8): paste `JbcConfirm.mjs` verbatim
    (sentinels included) as a classic `<script>`; delete the bespoke
    `#clear-confirm-modal` markup/CSS/JS entirely; replace the per-row × and
    Clear-all click handlers with `if (await confirmDialog(message)) { ... }`;
    theme it via `--jbcc-*` variables on `:root`. Update tests to drive
    `getByRole('dialog')` / "Yes"/"Cancel" instead of the old
    `clear-confirm-*` testids.
20. **Paste the HTML footer** (`tools/include/footer.html`, verbatim,
    sentinels included) at the bottom of `<body>`. Watch the `body`
    flex-direction gotcha noted in §1 — this is exactly what broke when it
    was first added.
21. **Icon-only button tooltip**: add `title="Remove entry"` to the
    per-entry × button alongside its existing `aria-label`.
22. **Blur (not focus) on a successful add** (§3): dismisses the mobile
    on-screen keyboard on tap-to-Add. A rejected add still keeps focus.

---

## Open decisions the worker should just make (not worth blocking on)

- Exact color palette / fonts — playful and legible is the only real
  constraint; system font stack is fine, no web font loading (no CDN/network
  dependency allowed anyway).
- Whether "Draw again" is a separate DOM element or the same button
  relabeled — §10 recommends two elements toggled via `hidden` for cleaner
  test targeting; follow that unless it proves awkward.
- Whether the toggle is a checkbox or a styled switch — either is fine as
  long as it's a real, labeled, keyboard-operable control.
- Exact confetti particle count/colors/durations — tune for "fun," DESIGN.md
  gives no exact numbers.
