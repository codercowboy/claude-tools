# color-designer — future improvement ideas

A prioritized, concrete backlog for the tool. Each item: the **value** in one
line, then a rough **effort/approach**. Everything here must stay inside the
repo's hard rules — vanilla JS/Node, no dependencies, no build step, one
`index.html` that still works from `file://`. Priorities are a suggestion, not a
commitment; Jason scopes what actually gets built.

## Status (v10)

**Shipped in the v10 batch:** #1 pin/lock, #2 export formats, #3 WCAG contrast,
#4 shareable URL, #5 keyboard shortcuts, #6 saved-palette shelf (localStorage),
#7 richer mood params (`anchorBias`/`roles`, capability only), #8 CVD preview,
#9 deterministic seeded rolls, #12 demo speed + freeze-on-hover, #13 PNG export,
#14 hue-wheel explainer — plus **roll history (back/forward)**, requested
alongside the batch.

**Deferred (per request):** #10 smarter N-role spacing for large N, and #11 the
screen `EyeDropper` API. Details for both remain below.

Remaining/newer ideas start at #15.

## High value / low–moderate effort

1. **Per-swatch lock/pin across rerolls.**
   Value: the killer palette-tool feature — keep the two colors you love, roll
   the rest. Effort: moderate. Add a pin toggle on each swatch (reuse the
   `.swatch-box` overlay that hosts the ＋), store pinned `{schemeIndex,
   colorIndex→color}` in `state`, and have `generateScheme`/`roll` accept a
   `locked` map that it writes into the fixed slots after generation (pure,
   unit-testable) — but note per-scheme locks interact with reroll semantics, so
   scope it (e.g. lock within one scheme) first.

2. **Export formats (copy + download): CSS vars, JSON, Tailwind, SCSS.**
   Value: turns a nice palette into something you can paste into a project.
   Effort: low–moderate. Pure formatters `toCssVars(scheme)`, `toJson`,
   `toTailwind`, `toScss` in the PURE-LOGIC block (trivially unit-tested), plus a
   small format `<select>` beside the existing copy-all textareas. Downloads must
   use a Blob + `URL.createObjectURL` anchor (works from `file://`); keep the
   copy-to-clipboard path as the primary since some `file://` download flows are
   awkward.

3. **Contrast / WCAG scoring per scheme + pairing hints.**
   Value: tells the user which color pairs are actually usable for text, not just
   pretty. Effort: low–moderate. `contrastRatio` already exists; add
   `scorePairs(scheme)` returning each ordered pair's ratio and AA/AAA
   large/normal pass flags, surface a compact matrix or "best text on this bg"
   badge in the expanded demo (which already computes best-contrast pairings).
   Pure and heavily unit-testable.

4. **Shareable URL state (hash-encoded palette + settings).**
   Value: send a palette to someone, or bookmark one, with no backend. Effort:
   moderate. Encode `{algorithm, mood, count, seeds, schemes}` into
   `location.hash` (compact base64 of a minimal JSON), read it on load ahead of
   the localStorage restore. Works from `file://` for the settings; the full
   rolled palette round-trips too since it's already persisted as data. Watch
   hash length; consider encoding only settings + a seed for the RNG if a
   deterministic roll is added (see #9).

5. **Keyboard shortcuts.**
   Value: power-user speed; complements the existing a11y work. Effort: low.
   A single global `keydown` handler (guarded to ignore typing in inputs):
   `R`/Space = reroll, `1–5` = expand scheme n, `?` = help (already a button),
   arrows = step the demo pairing. Reuse existing handlers; add `data-testid`
   nothing-new needed.

## Moderate value / moderate effort

6. **Name palettes + a small saved-palette shelf.**
   Value: keep more than the single last roll; build a personal library. Effort:
   moderate. Extend the `color-designer:v1` store (bump to `:v2` with a
   migration) to an array of named entries; add a "Save this palette" action and
   a compact list to reload/delete. Keep every read/write try/catch-wrapped per
   the persistence convention.

7. **Richer mood params: hue-arc-relative anchors + per-mood role tables.**
   Value: more distinctive moods (e.g. anchors that hug the arc asymmetrically,
   or a mood with its own light/sat role spread). Effort: moderate. Let a mood
   optionally carry `anchorBias` (shift offsets within the arc) and a `roles`
   override merged over the default `ROLES`. Purely additive to the data table
   and `generateScheme`; guard `MOOD_ANY` byte-identity with the existing tests.

8. **Color-blindness simulation preview.**
   Value: check a palette holds up under protan/deutan/tritan vision. Effort:
   moderate. Add pure matrix transforms `simulate(color, type)` and a toggle on
   the demo that repaints swatches through the chosen simulation. Well-known
   fixed matrices — no dependency needed; unit-test the transforms against known
   values.

9. **Deterministic, seeded rolls (a visible seed you can type/share).**
   Value: reproduce or share an exact roll; underpins better URL sharing (#4).
   Effort: low–moderate. `cryptoRng` already has a `makeSeqRng` sibling; add a
   small string→PRNG (e.g. a mulberry32 over a hashed seed string) exposed as an
   optional "seed" field, defaulting to crypto when empty. Pure and testable.

10. **Adjustable N-role strategy / more than 5 roles.**
    Value: larger N (8–10) currently recycles 5 roles; smarter spacing gives
    better spread. Effort: moderate. Generalize `ROLES` to a function of N
    (interpolated lightness/sat ramp) while keeping small-N output stable; lock
    the small-N cases with golden unit tests before changing.

## Lower priority / nice-to-have

11. **Screen eyedropper via the Chromium `EyeDropper` API.**
    Value: pick a seed from anywhere on screen. Effort: low, but capability-gated
    — feature-detect and show the button only where supported; the custom HSV
    picker stays the primary/portable input (DESIGN.md already flags this as a
    future bonus).

12. **Adjustable demo cycle speed + a "freeze on hover" affordance.**
    Value: finer control over the live demo. Effort: low. A small speed control
    feeding `DEMO_CYCLE_MS`; pause-on-hover of the hero card. Keep the
    reduced-motion "start paused" contract.

13. **Palette image/PNG export.**
    Value: drop a palette into a doc or chat. Effort: moderate. Render the strip
    to an offscreen `<canvas>` and download via Blob — no library. Verify the
    `file://` download path in the e2e suite.

14. **"Explain this scheme" annotations.**
    Value: teaches the color theory as you use it — label which swatch is which
    anchor/role, show the harmony geometry on a little wheel. Effort: moderate.
    An inline SVG hue wheel with the anchor hues plotted; data already available
    from `anchorHues`. *(Shipped v10.)*

## New ideas (surfaced during the v10 build)

15. **"Lock all / clear all pins" + a pinned-count badge.**
    Value: pin an entire scheme in one click, or clear every pin fast, once
    per-swatch pinning exists. Effort: low. A small control near the badge that
    reads/writes `state.locked`; the pure `applyLocks` already handles the rest.

16. **Contrast-aware auto-nudge for failing pairs.**
    Value: one click bumps a color's lightness until its best pairing clears WCAG
    AA. Effort: moderate. Reuse `scorePairs`/`contrastRatio` and iterate `l` in
    HSL until the ratio crosses 4.5; offer it inline in the Contrast section.

17. **Export presets & options.**
    Value: per-format tweaks (variable prefix, hue-sorted order, include alpha,
    kebab vs camel keys). Effort: low–moderate. Thread an options object through
    the pure `exportPalette` formatters; a couple of checkboxes in the Export UI.

18. **Import a palette (paste hex/JSON) → seeds or pinned scheme.**
    Value: bring an existing palette in, not just export one out. Effort:
    moderate. Parse a pasted list/JSON with the existing `parseColor`, then either
    add as seeds or drop into scheme 1 with all slots pinned.
