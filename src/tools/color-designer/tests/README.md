# color-designer tests

Automated end-to-end tests for `tools/color-designer/index.html`, using
[`@playwright/test`](https://playwright.dev/). These are **dev/test-only** —
`@playwright/test` is a `devDependency` of `tools/color-designer/package.json`;
it is never referenced by `index.html`, which remains a single,
dependency-free file. The spec drives the finished page from the outside,
through its `data-testid` hooks and the `window.__colorDesigner` test API
(see `../DESIGN.md` § Testability and `../PLAN.md` § 13).

## Running the tests

From `tools/color-designer/`:

```sh
npm install
npx playwright install chromium   # one-time browser download (~180MB)
npm run test:e2e
```

This repo uses npm workspaces (`tools/*`), so `npm install` from inside
`tools/color-designer/` (or from the repo root) hoists `node_modules` to the
repo root — that's normal npm workspace behavior, not a mistake.

The spec opens `../index.html` directly via a `file://` URL (no local server
required) using `pathToFileURL`, so it works the same way a user opening the
file in a browser would.

## What's covered

`color-designer.e2e.mjs`:

1. **Pure math.** `rgbToHsl`/`hslToRgb` round-trip a spread of colors within
   ±1 per channel (8-bit quantization tolerance); grayscale has `s=0` and a
   finite (not `NaN`) hue. `parseColor` across hex (3/4/6/8-digit, with/
   without `#`, case-insensitive) and `rgb()`/`rgba()` (comma syntax with
   optional alpha and channel/alpha clamping, and the modern slash syntax
   which requires alpha); invalids (garbage, empty, percentages, named
   colors, `hsl()`, malformed function syntax, out-of-form hex lengths) all
   → `null`. `rgbaString`/`hexString` canonical output: alpha always present
   and trimmed to ≤3 decimals in `rgba(...)`; lowercase `#rrggbb`, and
   `#rrggbbaa` only when `a < 1`.
2. **Harmony anchor math.** For each of the 6 algorithms, `generateScheme`
   with a fixed non-degenerate `rngSeq` (and zero seeds, so no injection
   distorts hues) produces exactly 5 colors whose hues — read back via
   `rgbToHsl` — match `anchorHues(algorithm, H)`'s cycling rule (`slot i` →
   `anchors[i % anchors.length]`, per `PLAN.md` § 5) within a small
   (`2°`) tolerance that absorbs 8-bit RGB round-trip quantization without
   masking a real anchor-math bug. Anchor counts are cross-checked against
   `DESIGN.md`'s table (complementary=2, analogous=3, triadic=3,
   splitComplementary=3, tetradic=4, monochromatic=1).
3. **Determinism.** `generateScheme`/`rollWith` called twice with the exact
   same `rngSeq` produce byte-identical results. A "known input → known
   output" test independently reconstructs `generateScheme('complementary',
   [], rngSeq=[0,0,0])`'s expected 5 colors from the documented lower-level
   primitives (`anchorHues` + `hslToRgb` + the `ROLES` table from `PLAN.md`
   § 5) and asserts an exact match against `generateScheme`'s real output —
   verifying the wiring, not just repeatability.
4. **THE KEY RULE.** In Random mode, `roll({algorithm:'random', ...})`
   resolves to exactly one concrete algorithm and every one of the 5
   returned schemes is structurally coherent with that algorithm's anchor
   pattern (checked via `rollWith` with a crafted `rngSeq[0]` that
   deterministically picks `triadic`, and independently via a real UI
   roll). A specific selection (e.g. Triadic) is used by all 5 schemes and
   stays fixed across repeated re-rolls until the `<select>` changes —
   asserted both through `window.__colorDesigner` and by driving the real
   `<select>` + Roll button and reading `algorithm-used-label`.
5. **Seeds.** With 0 seeds, `generateScheme` never crashes and always
   returns 5 colors. With 1 seed, exactly 1 of the 5 output colors is that
   seed on every trial (`pickSeedCount` is deterministically 1 when the pool
   has exactly 1 color). With 2 seeds, 1 or 2 match; with 5 seeds (pool > 3),
   1–3 match and never more — all checked over many trials with real
   `cryptoRng` to exercise the actual production entry point, not just a
   crafted sequence.
6. **Accordion.** The first scheme auto-expands **only on initial page load**;
   every **re-roll collapses all** schemes (none auto-open). Opening one scheme
   closes whatever was open (exactly one `aria-expanded="true"` at a time);
   clicking the already-open scheme collapses it (zero-open is a valid state);
   changing N or adding a seed does not spuriously re-expand. Each scheme's
   detail panel is a DOM child directly after its own toggle button within the
   same `scheme-row` wrapper (renders between that row and the next).
7. **Detail.** Per-color rgba/hex fields exactly match `rgbaString`/
   `hexString` for the scheme's 5 colors, in order, with copy-check
   feedback; the two Copy-all textareas match `rgbaOutput(i)`/`hexOutput(i)`
   exactly (both derived, line-aligned, 5 lines each) with "Copied!"
   feedback on click.
8. **Clear seeds via the shared `ctConfirm` component.** This tool uses the
   pasted `tools/include/confirm.js` component verbatim, which has **no**
   `data-testid` — tests use `page.getByRole('dialog')` and
   `page.getByRole('button', {name: 'Yes'/'Cancel'})` instead. Clicking
   "Clear seeds" opens the dialog (`role="dialog"`, `aria-modal="true"`,
   message "Clear all seed colors?", default focus on "Yes"); Enter confirms
   and empties the seed list; Esc cancels and keeps the seeds. A per-chip ×
   removes that seed directly with **no** dialog ever appearing.
9. **Reduced motion.** With `page.emulateMedia({reducedMotion: 'reduce'})`
   set before reload, swatches render at `opacity: 1` immediately after the
   auto-roll (no fade wait needed) and the live demo's cycling `setInterval`
   is never created (`state.demo.intervalId` stays `null`) — contrasted with
   a normal-motion test confirming the interval **is** set for the open
   scheme.
10. **`data-testid` hooks + API shape.** Every testid from `PLAN.md` § 13
    (top-level sections, all 5 scheme rows × 5 swatches, the open detail
    panel's demo/color-rows/copy-all elements, seed chips) is present
    exactly where expected. `window.__colorDesigner` exposes the full
    documented shape (all pure math, harmony/generation, seed actions,
    `performRoll`, `state`, and the two output getters) with correct
    `typeof`s; `state` is confirmed a live reference.
11. **Mobile (~375×667, `deviceScaleFactor: 2`, `hasTouch: true`).** Real
    `.tap()`s (not `window.__*` hooks, not keyboard) drive Roll, expanding
    an accordion scheme, and adding a seed color. No horizontal page
    overflow with a full state (seeds + expanded scheme + running demo) at
    375px and again down to 360px. A lower-level `elementFromPoint`
    hit-test guard confirms nothing overlays the Roll button or an
    accordion expand control at mobile size — checking that the hit element
    is the control itself or one of its own legitimate descendants (its
    swatch strip / hex label), not an unrelated element on top — per the
    lesson from a sibling tool where a passing functional test still missed
    a real overlay bug and only the hit-test guard caught it.
12. **Configurable colors-per-scheme (N).** Each scheme has exactly N colors
    across a range of N values (2, 4, 10) driven via the colors-per-scheme
    control and `count` param; default is 4.
13. **Layout v2.** The seed section precedes the controls bar in the DOM; the
    controls-row order is Roll again → harmony select → algorithm-used label;
    the Roll button label is `Roll again` followed by two `&nbsp;` then 🎲.
14. **Wiggle + tooltips.** Adding a seed toggles the wiggle animation class on
    the single Roll-again button (neutralized, not removed, under reduced
    motion); icon-only buttons (per-color copies, Copy-all, chip ×, picker
    trigger) carry non-empty `title` tooltips.
15. **Seed color picker.** The trigger swatch reflects the current input color;
    opening the picker initializes H/S/V/A from the current parsed input;
    drag/keyboard/hook changes write canonical hex (alpha=1) or `rgba()`
    (alpha<1) back to the input and update the swatch; the alpha slider works;
    Esc and click-outside close it (focus returns to the trigger). Driven by at
    least one **real pointer drag** (plus the deterministic hooks) and exercised
    at mobile size via touch.

See `TESTS.md` for the run record and any findings.
