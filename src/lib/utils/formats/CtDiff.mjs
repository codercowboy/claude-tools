// ===== Begin jbcDiff (ES module) =====
/*
 * jbcDiff — Myers O(ND) text diff engine (line-level, word-level, unified).
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module implementing the Myers O(ND) diff
 * algorithm ("An O(ND) Difference Algorithm and Its Variations", Eugene W.
 * Myers, 1986). One core routine (myersDiff) drives both line-level (diffLines)
 * and word-level (diffWords) diffing; comparison runs on an option-normalized
 * key while emitted ops carry the ORIGINAL text, so the ignore-* options change
 * what counts as equal without changing what is shown. Also emits a standard
 * unified diff (toUnifiedDiff) with configurable context.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs diffing imports this
 * module directly (so `node --test` can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each `export` — so the
 * shipped tool stays dependency-free and file://-openable. See the consuming
 * repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// ---- line splitting ---------------------------------------------------
// '' / null -> [] (empty input contributes zero lines). Otherwise normalize
// CRLF/CR to LF then split on \n; a trailing newline yields a final empty
// line (a file ending in \n genuinely has one).
function splitLines(text) {
  if (text == null || text === '') return [];
  return String(text).replace(/\r\n?/g, '\n').split('\n');
}

// ---- option-driven normalization (comparison key only) ----------------
function normalizeLine(line, opts = {}) {
  let s = String(line ?? '');
  if (opts.ignoreAllWhitespace) {
    s = s.replace(/\s+/g, '');
  } else if (opts.ignoreLeadingTrailingWhitespace) {
    s = s.replace(/^\s+/, '').replace(/\s+$/, '');
  }
  if (opts.ignoreCase) s = s.toLowerCase();
  return s;
}

// ---- Myers O(ND) core -------------------------------------------------
// Returns an ordered list of element ops: { type:'equal'|'delete'|'insert' }.
// eq(x, y) compares two elements (already-normalized keys for lines/tokens).
function myersDiff(a, b, eq = (x, y) => x === y) {
  const N = a.length;
  const M = b.length;
  // Trivial edges keep the trace logic below simple.
  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map(() => ({ type: 'insert' }));
  if (M === 0) return a.map(() => ({ type: 'delete' }));

  const MAX = N + M;
  const offset = MAX;
  const v = new Array(2 * MAX + 1).fill(0);
  const trace = [];
  let done = false;

  for (let d = 0; d <= MAX && !done; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1]; // move down (insertion from b)
      } else {
        x = v[offset + k - 1] + 1; // move right (deletion from a)
      }
      let y = x - k;
      while (x < N && y < M && eq(a[x], b[y])) { x++; y++; } // follow the snake
      v[offset + k] = x;
      if (x >= N && y >= M) { done = true; break; }
    }
  }

  // Backtrack the saved trace to recover the edit sequence.
  const ops = [];
  let x = N;
  let y = M;
  for (let d = trace.length - 1; d > 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
      prevK = k + 1; // came from a down move (insertion)
    } else {
      prevK = k - 1; // came from a right move (deletion)
    }
    const prevX = vPrev[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { // the snake (equal run)
      ops.push({ type: 'equal' });
      x--; y--;
    }
    if (x === prevX) ops.push({ type: 'insert' });
    else ops.push({ type: 'delete' });
    x = prevX; y = prevY;
  }
  // d === 0 leg: any remaining is a leading equal run.
  while (x > 0 && y > 0) { ops.push({ type: 'equal' }); x--; y--; }

  ops.reverse();
  return ops;
}

// ---- line-level diff --------------------------------------------------
// Returns { ops, stats }. Each op: { type, aStart, bStart, aLines, bLines }
// (aStart/bStart are 0-based positions in the original line arrays).
function diffLines(a, b, opts = {}) {
  const aLines = splitLines(a);
  const bLines = splitLines(b);
  const aKey = aLines.map((l) => normalizeLine(l, opts));
  const bKey = bLines.map((l) => normalizeLine(l, opts));
  const raw = myersDiff(aKey, bKey);

  const ops = [];
  let ai = 0;
  let bi = 0;
  let i = 0;
  while (i < raw.length) {
    if (raw[i].type === 'equal') {
      const aS = ai;
      const bS = bi;
      while (i < raw.length && raw[i].type === 'equal') { ai++; bi++; i++; }
      ops.push({
        type: 'equal', aStart: aS, bStart: bS,
        aLines: aLines.slice(aS, ai), bLines: bLines.slice(bS, bi),
      });
    } else {
      const aS = ai;
      const bS = bi;
      let dels = 0;
      let ins = 0;
      while (i < raw.length && raw[i].type !== 'equal') {
        if (raw[i].type === 'delete') { ai++; dels++; }
        else { bi++; ins++; }
        i++;
      }
      if (dels && ins) {
        ops.push({
          type: 'replace', aStart: aS, bStart: bS,
          aLines: aLines.slice(aS, ai), bLines: bLines.slice(bS, bi),
        });
      } else if (dels) {
        ops.push({ type: 'delete', aStart: aS, bStart: bS, aLines: aLines.slice(aS, ai), bLines: [] });
      } else {
        ops.push({ type: 'insert', aStart: aS, bStart: bS, aLines: [], bLines: bLines.slice(bS, bi) });
      }
    }
  }
  return { ops, stats: computeStats(ops) };
}

function computeStats(ops) {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const op of ops) {
    if (op.type === 'insert') {
      added += op.bLines.length;
    } else if (op.type === 'delete') {
      removed += op.aLines.length;
    } else if (op.type === 'replace') {
      const paired = Math.min(op.aLines.length, op.bLines.length);
      changed += paired;
      if (op.aLines.length > paired) removed += op.aLines.length - paired;
      if (op.bLines.length > paired) added += op.bLines.length - paired;
    }
  }
  return { added, removed, changed };
}

// ---- word-level (intra-line) diff -------------------------------------
// Tokenize into word-runs / whitespace-runs / single other chars — lossless
// (join('') reproduces the input).
function tokenizeWords(str) {
  const s = String(str ?? '');
  const tokens = s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g);
  return tokens || [];
}

// Returns [{ type:'equal'|'delete'|'insert', text }] with adjacent same-type
// segments coalesced.
function diffWords(a, b) {
  const at = tokenizeWords(a);
  const bt = tokenizeWords(b);
  const raw = myersDiff(at, bt);
  const segs = [];
  let ai = 0;
  let bi = 0;
  for (const op of raw) {
    let text;
    if (op.type === 'equal') { text = at[ai]; ai++; bi++; }
    else if (op.type === 'delete') { text = at[ai]; ai++; }
    else { text = bt[bi]; bi++; }
    const last = segs[segs.length - 1];
    if (last && last.type === op.type) last.text += text;
    else segs.push({ type: op.type, text });
  }
  return segs;
}

// ---- unified diff -----------------------------------------------------
function toUnifiedDiff(a, b, opts = {}, cfg = {}) {
  const context = cfg.context == null ? 3 : Math.max(0, cfg.context | 0);
  const aName = cfg.aName || 'a';
  const bName = cfg.bName || 'b';
  const { ops } = diffLines(a, b, opts);

  // Flatten ops -> tagged rows with running 1-based line numbers.
  const rows = [];
  let an = 0;
  let bn = 0;
  for (const op of ops) {
    if (op.type === 'equal') {
      for (let i = 0; i < op.aLines.length; i++) {
        rows.push({ tag: ' ', text: op.aLines[i], a: ++an, b: ++bn });
      }
    } else if (op.type === 'delete') {
      for (const l of op.aLines) rows.push({ tag: '-', text: l, a: ++an, b: null });
    } else if (op.type === 'insert') {
      for (const l of op.bLines) rows.push({ tag: '+', text: l, a: null, b: ++bn });
    } else { // replace: deletes then inserts
      for (const l of op.aLines) rows.push({ tag: '-', text: l, a: ++an, b: null });
      for (const l of op.bLines) rows.push({ tag: '+', text: l, a: null, b: ++bn });
    }
  }

  const changedIdx = [];
  for (let i = 0; i < rows.length; i++) if (rows[i].tag !== ' ') changedIdx.push(i);
  if (changedIdx.length === 0) return '';

  // Group changed rows into hunks, padding by `context` and merging groups
  // whose gaps are within 2*context.
  const groups = [];
  let start = changedIdx[0];
  let end = changedIdx[0];
  for (let n = 1; n < changedIdx.length; n++) {
    if (changedIdx[n] - end <= 2 * context + 1) {
      end = changedIdx[n];
    } else {
      groups.push([start, end]);
      start = changedIdx[n];
      end = changedIdx[n];
    }
  }
  groups.push([start, end]);

  const out = [`--- ${aName}`, `+++ ${bName}`];
  for (const [gs, ge] of groups) {
    const hs = Math.max(0, gs - context);
    const he = Math.min(rows.length - 1, ge + context);
    const hunk = rows.slice(hs, he + 1);

    const aLinesInHunk = hunk.filter((r) => r.a != null);
    const bLinesInHunk = hunk.filter((r) => r.b != null);
    const aCount = aLinesInHunk.length;
    const bCount = bLinesInHunk.length;
    // For a zero-count side (pure insert/delete) the standard header uses the line BEFORE the hunk,
    // i.e. the number of that side's lines preceding it — not a bare 0 (#1014-H). 0 only when the
    // hunk sits at the very start. Non-zero counts keep the first in-hunk line's own number.
    let aBefore = 0;
    let bBefore = 0;
    for (let i = 0; i < hs; i++) { if (rows[i].a != null) aBefore++; if (rows[i].b != null) bBefore++; }
    const aStart = aCount ? aLinesInHunk[0].a : aBefore;
    const bStart = bCount ? bLinesInHunk[0].b : bBefore;

    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const r of hunk) out.push(r.tag + r.text);
  }
  return out.join('\n');
}

export {
  splitLines,
  normalizeLine,
  myersDiff,
  diffLines,
  tokenizeWords,
  diffWords,
  toUnifiedDiff,
};
// ===== end jbcDiff (ES module) =====
