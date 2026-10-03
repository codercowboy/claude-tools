// source/logic.mjs — the pure, DOM-free engine for __TOOL_TITLE__.
//
// This is the file the unit tests import directly (tests/unit/*.test.mjs) and
// the file the build folds into the shipped app via app.mjs's inline token.
// Keep it DOM-free: no `document`, `window`, or `localStorage` here — only pure
// functions with `export`s. See project-structure/testing.md.
// (Comments here deliberately avoid the literal jbc:inline token syntax so the
//  build doesn't re-expand it; the one real inline token lives in app.mjs.)
//
// Everything below is placeholder logic for the skeleton — replace `transform`
// with your tool's real pure engine (a solver, encoder, colour conversion, …).

// The tool's headline transform. Pure: same input → same output, no side effects.
export function transform(input) {
  if (typeof input !== 'string') return '';
  return [...input].reverse().join('');
}

// A second pure helper, shown so the test hook has more than one entry point.
export function summarize(input) {
  const text = typeof input === 'string' ? input : '';
  const trimmed = text.trim();
  return {
    chars: [...text].length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}
