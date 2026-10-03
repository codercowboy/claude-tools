# __TOOL_TITLE__ — DESIGN

> Source-of-truth spec. Replace every section below with the real design.

## Purpose

What __TOOL_TITLE__ does and who it's for, in a sentence or two. (`__TOOL_DESC__`)

## Behavior

- Inputs, outputs, and the core transform (the pure function in `source/logic.mjs`).
- Single source of truth: the input drives everything; derived views recompute.
- Persistence: what's saved to `localStorage` under `__TOOL_NAME__:v1` — and what
  is deliberately NOT (secrets, transient/derived state).

## Confirm-before-destructive carve-outs

List any destructive action that intentionally SKIPS the confirm modal and why
(e.g. "Clear on a single short input is trivially retyped"). If there are none,
say so. See `html-single-file/ethos.md` § Destructive actions.

## Accessibility & responsiveness

Notes on focus, `aria-live`, reduced-motion, and how the layout behaves on phone
and wide-desktop viewports.

## Third-party libraries

None — 100% vanilla, zero runtime dependencies. (If that ever changes, document
the bundled-library bar from `html-single-file/ethos.md` here.)
