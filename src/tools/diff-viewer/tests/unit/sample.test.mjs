// Unit tests for the built-in sample pair (source/logic.mjs § SAMPLE_A /
// SAMPLE_B) that the "Load sample" button loads. The sample exists to show the
// tool off, so we assert it actually exercises every kind of change the tool
// visualizes: line-level insertions AND deletions AND word-level (intra-line)
// edits. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { SAMPLE_A, SAMPLE_B, diffLines, diffWords } = await loadLogic();

test('SAMPLE_A / SAMPLE_B are non-empty, multi-line, and differ', () => {
  assert.equal(typeof SAMPLE_A, 'string');
  assert.equal(typeof SAMPLE_B, 'string');
  assert.ok(SAMPLE_A.length > 0);
  assert.ok(SAMPLE_B.length > 0);
  assert.notEqual(SAMPLE_A, SAMPLE_B);
  assert.ok(SAMPLE_A.includes('\n'), 'A should be multi-line');
  assert.ok(SAMPLE_B.includes('\n'), 'B should be multi-line');
});

test('the sample produces added, removed, and changed lines', () => {
  const { stats } = diffLines(SAMPLE_A, SAMPLE_B);
  assert.ok(stats.added > 0, `expected added > 0, got ${stats.added}`);
  assert.ok(stats.removed > 0, `expected removed > 0, got ${stats.removed}`);
  assert.ok(stats.changed > 0, `expected changed > 0, got ${stats.changed}`);
});

test('the sample includes at least one word-level (intra-line) change', () => {
  // A "replace" op holds a paired old/new line; word-diffing that pair must
  // yield a mix of equal + insert/delete segments (i.e. not a whole-line swap).
  const { ops } = diffLines(SAMPLE_A, SAMPLE_B);
  const replace = ops.find((op) => op.type === 'replace');
  assert.ok(replace, 'sample should contain a replace op with paired lines');

  const paired = Math.min(replace.aLines.length, replace.bLines.length);
  let sawIntraLine = false;
  for (let i = 0; i < paired; i++) {
    const segs = diffWords(replace.aLines[i], replace.bLines[i]);
    const hasEqual = segs.some((s) => s.type === 'equal' && s.text.trim() !== '');
    const hasChange = segs.some((s) => s.type !== 'equal');
    if (hasEqual && hasChange) { sawIntraLine = true; break; }
  }
  assert.ok(sawIntraLine, 'sample should have a line changed only in part (word-level diff)');
});

// ---------------------------------------------------------------------------
// The enriched sample exists so the ignore-* option toggles VISIBLY matter.
// These tests pin the specific "differ-only-by-X" lines and prove each toggle
// flips exactly those lines between changed and equal.
// ---------------------------------------------------------------------------

// Classify a line (matched by a unique substring, searched on the A side unless
// it is an insert-only line) by the op type it lands in for a given options set:
// 'equal' | 'replace' | 'delete' | 'insert', or null if not found.
function classify(needle, opts = {}, side = 'a') {
  const { ops } = diffLines(SAMPLE_A, SAMPLE_B, opts);
  for (const op of ops) {
    const lines = side === 'b' ? op.bLines : op.aLines;
    if (lines.some((l) => l.includes(needle))) return op.type;
  }
  return null;
}

test('the sample pairs contain whitespace-only and case-only differences', () => {
  const aLines = SAMPLE_A.split('\n');
  const bLines = SAMPLE_B.split('\n');

  // trailing-whitespace-only pair
  const aTrail = aLines.find((l) => l.trimEnd() === 'Clear the cache');
  const bTrail = bLines.find((l) => l.trimEnd() === 'Clear the cache');
  assert.ok(aTrail && bTrail, 'both sides have a "Clear the cache" line');
  assert.notEqual(aTrail, bTrail, 'trailing-space line differs literally');
  assert.equal(aTrail.trim(), bTrail.trim(), '...but only in whitespace');
  assert.match(aTrail, /\s$/, 'A side has trailing whitespace');

  // internal double-space-only pair
  const aDbl = aLines.find((l) => l.includes('Notify') && l.includes('team'));
  const bDbl = bLines.find((l) => l.includes('Notify') && l.includes('team'));
  assert.notEqual(aDbl, bDbl, 'interior-spacing line differs literally');
  assert.match(aDbl, /\S  \S/, 'A side has a run of interior double-spaces');
  assert.equal(aDbl.replace(/\s+/g, ' '), bDbl.replace(/\s+/g, ' '),
    '...but only in interior spacing');

  // tab-vs-spaces (leading) pair
  const aTab = aLines.find((l) => l.includes('Check the logs'));
  const bTab = bLines.find((l) => l.includes('Check the logs'));
  assert.notEqual(aTab, bTab, 'leading-whitespace line differs literally');
  assert.match(aTab, /^\t/, 'A side is tab-indented');
  assert.match(bTab, /^ +\S/, 'B side is space-indented');
  assert.equal(aTab.trimStart(), bTab.trimStart(), '...but only in leading whitespace');

  // case-only pair
  const aCase = aLines.find((l) => l.toLowerCase() === 'restart the server');
  const bCase = bLines.find((l) => l.toLowerCase() === 'restart the server');
  assert.ok(aCase && bCase, 'both sides have a "Restart the server" line');
  assert.notEqual(aCase, bCase, 'case-only line differs literally');
  assert.equal(aCase.toLowerCase(), bCase.toLowerCase(), '...but only in case');
});

test('with every ignore-* option OFF, the whitespace/case lines are changed', () => {
  assert.equal(classify('Clear the cache'), 'replace', 'trailing-ws line is changed');
  assert.equal(classify('Notify'), 'replace', 'interior-double-space line is changed');
  assert.equal(classify('Check the logs'), 'replace', 'tab-vs-spaces line is changed');
  assert.equal(classify('SERVER'), 'replace', 'case-only line is changed');
});

test('ignore leading/trailing whitespace collapses only the trim-able lines', () => {
  const opts = { ignoreLeadingTrailingWhitespace: true };
  assert.equal(classify('Clear the cache', opts), 'equal', 'trailing-ws line -> equal');
  assert.equal(classify('Check the logs', opts), 'equal', 'leading tab/space line -> equal');
  // Interior double-space is NOT leading/trailing, so it must stay changed.
  assert.equal(classify('Notify', opts), 'replace', 'interior spacing stays changed');
  // Case difference is untouched by a whitespace option.
  assert.equal(classify('SERVER', opts), 'replace', 'case-only line stays changed');
});

test('ignore all whitespace collapses every whitespace-only line', () => {
  const opts = { ignoreAllWhitespace: true };
  assert.equal(classify('Clear the cache', opts), 'equal', 'trailing-ws line -> equal');
  assert.equal(classify('Notify', opts), 'equal', 'interior-double-space line -> equal');
  assert.equal(classify('Check the logs', opts), 'equal', 'tab-vs-spaces line -> equal');
  // Case difference is untouched by a whitespace option.
  assert.equal(classify('SERVER', opts), 'replace', 'case-only line stays changed');
});

test('ignore case collapses only the case-only line', () => {
  const opts = { ignoreCase: true };
  assert.equal(classify('SERVER', opts), 'equal', 'case-only line -> equal');
  // Whitespace differences are untouched by ignore-case.
  assert.equal(classify('Clear the cache', opts), 'replace', 'trailing-ws stays changed');
  assert.equal(classify('Notify', opts), 'replace', 'interior spacing stays changed');
  assert.equal(classify('Check the logs', opts), 'replace', 'tab-vs-spaces stays changed');
});

test('toggling an ignore-* option lowers the changed count for those lines', () => {
  const base = diffLines(SAMPLE_A, SAMPLE_B).stats;
  const caseOff = diffLines(SAMPLE_A, SAMPLE_B, { ignoreCase: true }).stats;
  const trimOff = diffLines(SAMPLE_A, SAMPLE_B, { ignoreLeadingTrailingWhitespace: true }).stats;
  const allWsOff = diffLines(SAMPLE_A, SAMPLE_B, { ignoreAllWhitespace: true }).stats;

  assert.equal(caseOff.changed, base.changed - 1, 'ignore case removes 1 changed line');
  assert.equal(trimOff.changed, base.changed - 2, 'trim removes the 2 leading/trailing lines');
  assert.equal(allWsOff.changed, base.changed - 3, 'ignore all whitespace removes all 3 ws lines');
});
