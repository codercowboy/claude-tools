// =====================================================================
// Diff Viewer — pure engine (DOM-free, exported, unit-testable).
//
// The Myers O(ND) diff engine (line-level, word-level, unified) now lives in the
// shared, Node-importable module lib/formats/CtDiff.mjs (promoted to jason-code,
// vendored here). This file imports it and re-exports its API, and keeps the
// tool-specific built-in SAMPLE_A / SAMPLE_B demo pair local. The unit tests load
// this module's namespace and the app inlines this file at build time, so the
// surface is unchanged; the build resolves the import and inlines the engine body
// (stripping each export) so the shipped index.html stays dependency-free.
// =====================================================================
import {
  splitLines,
  normalizeLine,
  myersDiff,
  diffLines,
  tokenizeWords,
  diffWords,
  toUnifiedDiff,
} from '../../../lib/utils/formats/CtDiff.mjs';

// ---- built-in sample (Load sample button) ----------------------------
// A representative before/after pair chosen to exercise every kind of change
// the tool visualizes AND to make the ignore-* option toggles visibly matter.
// Kept here in the pure module so a unit test can assert it actually produces
// each kind. The lines, by design (whitespace shown with · below for the eye
// only — the strings hold real spaces/tabs):
//   - "Run the fast/slow tests" — a WORD-LEVEL (intra-line) edit.
//   - "Restart the SERVER/server" — differs ONLY by CASE (ignore case flips
//     it changed<->equal).
//   - "Clear the cache···" (trailing spaces) — trim OR ignore-all-ws flips it.
//   - "Notify··the team" (a run of internal double-spaces) — ONLY ignore-all-
//     whitespace flips it (trim leaves interior spacing alone).
//   - "\tCheck the logs" vs "    Check the logs" (tab vs spaces, leading) —
//     trim OR ignore-all-ws flips it.
//   - "Remove old feature flags" — a plain REMOVED line (A only).
//   - "Update the changelog" — a plain ADDED line (B only).
// With every ignore-* option OFF the middle five all read as CHANGED; turning
// the relevant option ON collapses its line(s) to EQUAL.
const SAMPLE_A = [
  'Deploy checklist',
  'Run the fast tests',
  '-----',
  'Restart the SERVER',
  'Clear the cache   ',
  'Notify  the team',
  '\tCheck the logs',
  '-----',
  'Remove old feature flags',
  'Ship it.',
  'All set.',
].join('\n');

const SAMPLE_B = [
  'Deploy checklist',
  'Run the slow tests',
  '-----',
  'Restart the server',
  'Clear the cache',
  'Notify the team',
  '    Check the logs',
  '-----',
  'Ship it.',
  'Update the changelog',
  'All set.',
].join('\n');

export {
  splitLines,
  normalizeLine,
  myersDiff,
  diffLines,
  tokenizeWords,
  diffWords,
  toUnifiedDiff,
  SAMPLE_A,
  SAMPLE_B,
};
