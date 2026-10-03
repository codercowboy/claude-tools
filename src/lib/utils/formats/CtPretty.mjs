// ===== Begin jbcPretty (ES module) =====
/*
 * jbcPretty — multi-language pretty-printer / minifier engine.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module: six hand-rolled, zero-dependency
 * language engines (JSON, YAML, HTML, CSS, SQL, JavaScript). Every engine's
 * overriding invariant is that output is *semantically equivalent* to input:
 * JSON/YAML/HTML/CSS get full pretty + minify; JS and SQL get reliable
 * pretty-print + SAFE minify only (comments + insignificant whitespace, fully
 * string/regex/template aware — never identifier renaming, dead-code removal,
 * or AST rewriting). Each public fn takes (src, opts) and returns a string, or
 * throws Error with a friendly .message (line/col where locatable) on invalid
 * input. The tokenizers (tokenizeJS, tokenizeSQL) are exported for consumers
 * that want to assert token-stream equivalence. Any built-in demo/sample text
 * stays with the consuming tool, not in this shared engine.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs this engine imports the
 * module directly (so `node --test` can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each `export` — so
 * the shipped tool stays dependency-free and file://-openable. See the consuming
 * repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

// Number of bytes in a UTF-8 encoding of a string (for the stats line).
function byteLength(str) {
  // TextEncoder exists in browsers and Node >= 11; fall back to a manual
  // UTF-8 byte count if it is somehow unavailable.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.codePointAt(i);
    if (c > 0xffff) i++; // surrogate pair
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// Turn a numeric or string indent option into the actual indent unit.
function indentUnit(indent) {
  if (indent === '\t' || indent === 'tab') return '\t';
  const n = Number(indent);
  if (Number.isFinite(n) && n >= 0) return ' '.repeat(n);
  return '  ';
}

// Compute { line, col } (1-based) for a character offset in src.
function lineColFromOffset(src, offset) {
  let line = 1;
  let col = 1;
  const lim = Math.max(0, Math.min(offset, src.length));
  for (let i = 0; i < lim; i++) {
    if (src[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

// =====================================================================
// JSON (full pretty + minify)
// =====================================================================

function jsonError(src, err) {
  let msg = err && err.message ? err.message : String(err);
  // Newer V8 error messages for the "Unexpected token" case embed the whole
  // source ("Unexpected token 'x', \"<source>\" is not valid JSON") — trim it
  // down to the readable reason.
  const tokMatch = /^(Unexpected token .+?),\s*"[\s\S]*"\s*is not valid JSON$/.exec(msg);
  if (tokMatch) msg = tokMatch[1];
  // Prefer an explicit "line L column C"; fall back to "position N".
  const lineColMatch = /line (\d+) column (\d+)/.exec(err && err.message ? err.message : '');
  if (lineColMatch) {
    const reason = msg.replace(/\s+in JSON at position \d+.*$/, '');
    return new Error(`Invalid JSON: ${reason} (line ${lineColMatch[1]}, col ${lineColMatch[2]})`);
  }
  const posMatch = /position (\d+)/.exec(err && err.message ? err.message : '');
  if (posMatch) {
    const { line, col } = lineColFromOffset(src, Number(posMatch[1]));
    const reason = msg.replace(/\s+in JSON at position \d+.*$/, '');
    return new Error(`Invalid JSON: ${reason} (line ${line}, col ${col})`);
  }
  return new Error(`Invalid JSON: ${msg}`);
}

function formatJSON(src, opts = {}) {
  const indent = opts.indent === undefined ? 2 : opts.indent;
  let value;
  try {
    value = JSON.parse(src);
  } catch (err) {
    throw jsonError(src, err);
  }
  const unit = indent === '\t' || indent === 'tab' ? '\t' : Number(indent);
  return JSON.stringify(value, null, unit);
}

function minifyJSON(src) {
  let value;
  try {
    value = JSON.parse(src);
  } catch (err) {
    throw jsonError(src, err);
  }
  return JSON.stringify(value);
}

// =====================================================================
// CSS (full pretty + minify)
// =====================================================================
//
// A small, string-aware parser. It correctly skips strings ('/"), comments
// (/* */) and url(...) (incl. unquoted) so structural characters ({ } ; )
// inside those are never misread. Format builds a node tree and re-indents;
// minify is a single string-aware pass.

// Read a quoted string starting at src[i] (a quote char). Returns end index
// (one past the closing quote).
function cssReadString(src, i) {
  const quote = src[i];
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === quote) return i + 1;
    i++;
  }
  return i;
}

// Read a url(...) token starting at src[i] === '(' (called after "url").
// Handles quoted and unquoted contents; returns end index (past ')').
function cssReadUrlParen(src, i) {
  i++; // past '('
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = cssReadString(src, i); continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === ')') return i + 1;
    i++;
  }
  return i;
}

// True when a "url(" function token begins at src[i] (i at 'u'/'U'), and it
// is a real function call (not the tail of an identifier like "myurl").
function cssIsUrlAt(src, i) {
  if (i + 3 >= src.length) return false;
  if (src.slice(i, i + 4).toLowerCase() !== 'url(') return false;
  const prev = i > 0 ? src[i - 1] : '';
  return !/[A-Za-z0-9_-]/.test(prev);
}

// Parse a CSS block body (or the whole stylesheet when top-level) into nodes.
// Returns { nodes, next } where next is the index after the block (past '}').
function cssParseNodes(src, start, topLevel) {
  const nodes = [];
  let i = start;
  let buf = '';
  const n = src.length;
  const pushDecl = () => {
    if (buf.trim() !== '') nodes.push({ type: 'decl', text: buf });
    buf = '';
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const cs = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      const comment = src.slice(cs, i);
      if (buf.trim() === '') nodes.push({ type: 'comment', text: comment });
      // inline comments (mid-declaration/prelude) are dropped — harmless in CSS
      continue;
    }
    if (c === '"' || c === "'") { const e = cssReadString(src, i); buf += src.slice(i, e); i = e; continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(src, i)) {
      const e = cssReadUrlParen(src, i + 3);
      buf += src.slice(i, e);
      i = e;
      continue;
    }
    if (c === '{') {
      const prelude = buf;
      buf = '';
      const inner = cssParseNodes(src, i + 1, false);
      nodes.push({ type: 'rule', prelude, body: inner.nodes });
      i = inner.next;
      continue;
    }
    if (c === '}') {
      pushDecl();
      return { nodes, next: i + 1 };
    }
    if (c === ';') {
      pushDecl();
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  pushDecl();
  return { nodes, next: i };
}

// Collapse insignificant whitespace in a CSS fragment, string/url aware.
function cssCollapseWS(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") { const e = cssReadString(text, i); out += text.slice(i, e); i = e; continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(text, i)) {
      const e = cssReadUrlParen(text, i + 3);
      out += text.slice(i, e);
      i = e;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(text[j])) j++;
      out += ' ';
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Find the first top-level ':' in a declaration (skips strings/url/parens).
function cssFindColon(text) {
  let depth = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") { i = cssReadString(text, i); continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(text, i)) { i = cssReadUrlParen(text, i + 3); continue; }
    if (c === '(') { depth++; i++; continue; }
    if (c === ')') { depth--; i++; continue; }
    if (c === ':' && depth === 0) return i;
    i++;
  }
  return -1;
}

function cssFormatDecl(text) {
  const t = cssCollapseWS(text).trim();
  const idx = cssFindColon(t);
  if (idx < 0) return t + ';';
  const prop = t.slice(0, idx).trim();
  const value = t.slice(idx + 1).trim();
  return `${prop}: ${value};`;
}

function cssFormatPrelude(text, pad) {
  const t = cssCollapseWS(text).replace(/\s*,\s*/g, ',').trim();
  // one selector per line for readability
  const parts = cssSplitTopLevel(t, ',');
  return parts.map((p) => p.trim()).join(',\n' + pad);
}

// Split on a separator char at top level (skip strings/url/parens).
function cssSplitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") { const e = cssReadString(text, i); cur += text.slice(i, e); i = e; continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(text, i)) { const e = cssReadUrlParen(text, i + 3); cur += text.slice(i, e); i = e; continue; }
    if (c === '(') { depth++; cur += c; i++; continue; }
    if (c === ')') { depth--; cur += c; i++; continue; }
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  parts.push(cur);
  return parts;
}

function cssEmit(nodes, depth, unit, lines) {
  const pad = unit.repeat(depth);
  for (const node of nodes) {
    if (node.type === 'comment') {
      lines.push(pad + node.text.trim());
    } else if (node.type === 'decl') {
      lines.push(pad + cssFormatDecl(node.text));
    } else if (node.type === 'rule') {
      const prelude = cssFormatPrelude(node.prelude, pad);
      if (node.body.length === 0) {
        lines.push(pad + prelude + ' {');
        lines.push(pad + '}');
      } else {
        lines.push(pad + prelude + ' {');
        cssEmit(node.body, depth + 1, unit, lines);
        lines.push(pad + '}');
      }
    }
  }
}

function formatCSS(src, opts = {}) {
  const unit = indentUnit(opts.indent === undefined ? 2 : opts.indent);
  const { nodes } = cssParseNodes(src, 0, true);
  const lines = [];
  // Blank line between top-level rules for readability.
  for (let k = 0; k < nodes.length; k++) {
    if (k > 0 && (nodes[k].type === 'rule' || nodes[k - 1].type === 'rule')) {
      lines.push('');
    }
    cssEmit([nodes[k]], 0, unit, lines);
  }
  // No global \n{3,} collapse: the emitter only inserts single structural blank lines, so any
  // run of 3+ newlines lives inside a comment or a multi-line string and must be preserved.
  return lines.join('\n').trim() + '\n';
}

function minifyCSS(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const STRUCT = new Set(['{', '}', ';', ',', ':']);
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      // A dropped comment acts like whitespace, but gets the SAME neighbour-trimming as a
      // whitespace run: insert a single space only when it actually separates two tokens, never
      // adjacent to a structural char (keeps minify idempotent and avoids a stray `red ;`).
      const next = src[i];
      const prev = out[out.length - 1];
      if (next !== undefined && !/\s/.test(next) && !STRUCT.has(next)
        && prev !== undefined && !/\s/.test(prev) && !STRUCT.has(prev)) {
        out += ' ';
      }
      continue;
    }
    if (c === '"' || c === "'") { const e = cssReadString(src, i); out += src.slice(i, e); i = e; continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(src, i)) { const e = cssReadUrlParen(src, i + 3); out += src.slice(i, e); i = e; continue; }
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      // find the next non-space char
      const next = src[j];
      const prev = out[out.length - 1];
      if (STRUCT.has(next) || STRUCT.has(prev) || prev === undefined || next === undefined) {
        // drop the whitespace entirely
      } else {
        out += ' ';
      }
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  // Drop the last ';' in each block: ';}' -> '}' (string-aware pass).
  let result = '';
  i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c === '"' || c === "'") { const e = cssReadString(out, i); result += out.slice(i, e); i = e; continue; }
    if ((c === 'u' || c === 'U') && cssIsUrlAt(out, i)) { const e = cssReadUrlParen(out, i + 3); result += out.slice(i, e); i = e; continue; }
    // Collapse redundant semicolons (`;;` → `;`) and drop the last one in a block (`;}` → `}`).
    if (c === ';' && (out[i + 1] === ';' || out[i + 1] === '}')) { i++; continue; }
    result += c;
    i++;
  }
  return result.trim();
}

// =====================================================================
// SQL (pretty-print full; SAFE minify)
// =====================================================================
//
// Token-based, NOT a full parser. Aware of string literals ('...' with ''
// escapes), quoted identifiers ("..." and `...`), line comments (-- ...) and
// block comments (/* */). Format only moves whitespace and changes the case
// of recognized keywords; minify only strips comments and collapses
// whitespace. Neither ever removes, reorders, or rewrites a token.

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'ON', 'JOIN', 'INNER',
  'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'USING', 'GROUP', 'BY',
  'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXCEPT',
  'INTERSECT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
  'TABLE', 'VIEW', 'INDEX', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'DEFAULT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN',
  'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'COUNT', 'SUM',
  'AVG', 'MIN', 'MAX', 'CAST', 'WITH', 'RETURNING', 'INT', 'INTEGER', 'VARCHAR',
  'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'CONSTRAINT', 'UNIQUE', 'CHECK',
  'TRUE', 'FALSE', 'LIMIT', 'OVER', 'PARTITION',
]);

function tokenizeSQL(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      tokens.push({ type: 'ws', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '-' && src[i + 1] === '-') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      tokens.push({ type: 'lineComment', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      tokens.push({ type: 'blockComment', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; }
        if (src[j] === "'") { j++; break; }
        j++;
      }
      tokens.push({ type: 'string', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"' || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === q && src[j + 1] === q) { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      tokens.push({ type: 'quotedId', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9.eE+\-xXa-fA-F]/.test(src[j])) {
        // stop a stray +/- that is not part of an exponent
        if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1] || '')) break;
        j++;
      }
      tokens.push({ type: 'number', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_@#$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_@#$]/.test(src[j])) j++;
      tokens.push({ type: 'word', value: src.slice(i, j) });
      i = j;
      continue;
    }
    tokens.push({ type: 'punct', value: c });
    i++;
  }
  return tokens;
}

function sqlApplyCase(word, keywordCase) {
  if (keywordCase === 'unchanged') return word;
  if (!SQL_KEYWORDS.has(word.toUpperCase())) return word;
  return keywordCase === 'lower' ? word.toLowerCase() : word.toUpperCase();
}

// Significant tokens only (drop whitespace) for format layout; comments kept.
function sqlSignificant(tokens) {
  return tokens.filter((t) => t.type !== 'ws');
}

const SQL_CLAUSE = new Set([
  'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'SET',
  'UNION', 'EXCEPT', 'INTERSECT', 'RETURNING', 'JOIN',
]);
const SQL_CLAUSE2 = new Set([
  'GROUP BY', 'ORDER BY', 'INSERT INTO', 'DELETE FROM', 'UNION ALL',
  'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN',
  'OUTER JOIN', 'PARTITION BY',
]);
const SQL_CLAUSE3 = new Set([
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
]);
const SQL_SUBCLAUSE = new Set(['AND', 'OR', 'ON']);
// Keyword-named functions: a following '(' is a call, so no space before it.
const SQL_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST']);

function formatSQL(src, opts = {}) {
  const unit = indentUnit(opts.indent === undefined ? 2 : opts.indent);
  const keywordCase = opts.keywordCase || 'unchanged';
  const toks = sqlSignificant(tokenizeSQL(src));
  // words for multi-word clause lookahead
  const upperAt = (k) => (toks[k] && toks[k].type === 'word' ? toks[k].value.toUpperCase() : null);

  let out = '';
  let depth = 0; // paren depth
  let atLineStart = true;

  const nl = (level) => {
    out = out.replace(/[ \t]+$/, '');
    out += '\n' + unit.repeat(Math.max(0, level));
    atLineStart = true;
  };
  const emit = (text) => { out += text; atLineStart = false; };

  const needSpace = (prev, cur) => {
    if (!prev) return false;
    const pv = prev.value, cv = cur.value;
    if (pv === '(') return false;
    if (cv === ')' || cv === ',' || cv === ';') return false;
    if (cv === '.' || pv === '.') return false;
    if (cv === '(') {
      if (prev.type === 'word' && !SQL_KEYWORDS.has(pv.toUpperCase())) return false;
      if (prev.type === 'word' && SQL_FUNCTIONS.has(pv.toUpperCase())) return false; // keyword function call
      if (prev.type === 'quotedId') return false;
      return true;
    }
    return true;
  };

  let prev = null;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'lineComment' || t.type === 'blockComment') {
      if (!atLineStart) emit(' ');
      emit(t.value);
      if (t.type === 'lineComment') nl(depth);
      prev = t;
      continue;
    }
    // multi-word clause detection (words only)
    if (t.type === 'word') {
      const w1 = upperAt(k);
      const w2 = upperAt(k + 1);
      const w3 = upperAt(k + 2);
      const three = w1 && w2 && w3 ? `${w1} ${w2} ${w3}` : null;
      const two = w1 && w2 ? `${w1} ${w2}` : null;
      if (three && SQL_CLAUSE3.has(three)) {
        if (out !== '') nl(depth);
        emit([toks[k], toks[k + 1], toks[k + 2]].map((x) => sqlApplyCase(x.value, keywordCase)).join(' '));
        prev = toks[k + 2];
        k += 2;
        continue;
      }
      if (two && SQL_CLAUSE2.has(two)) {
        if (out !== '') nl(depth);
        emit([toks[k], toks[k + 1]].map((x) => sqlApplyCase(x.value, keywordCase)).join(' '));
        prev = toks[k + 1];
        k += 1;
        continue;
      }
      if (SQL_CLAUSE.has(w1)) {
        if (out !== '') nl(depth);
        emit(sqlApplyCase(t.value, keywordCase));
        prev = t;
        continue;
      }
      if (SQL_SUBCLAUSE.has(w1)) {
        if (out !== '') nl(depth + 1);
        emit(sqlApplyCase(t.value, keywordCase));
        prev = t;
        continue;
      }
      if (needSpace(prev, t)) emit(' ');
      emit(sqlApplyCase(t.value, keywordCase));
      prev = t;
      continue;
    }
    // punctuation / operators
    if (t.value === '(') {
      if (needSpace(prev, t)) emit(' ');
      emit('(');
      depth++;
      // A following SELECT is a clause and places its own newline at the new depth; don't pre-emit one
      // here too, or the subquery opens with a stray blank line after "(" (#1014-O.2).
      prev = t;
      continue;
    }
    if (t.value === ')') {
      depth = Math.max(0, depth - 1);
      emit(')');
      prev = t;
      continue;
    }
    if (t.value === ',' && depth === 0) {
      emit(',');
      nl(depth + 1);
      prev = t;
      continue;
    }
    if (t.value === ';') {
      emit(';');
      nl(depth);
      prev = t;
      continue;
    }
    if (needSpace(prev, t)) emit(' ');
    emit(t.value);
    prev = t;
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

function minifySQL(src) {
  const toks = tokenizeSQL(src);
  let out = '';
  let pendingSpace = false;
  for (const t of toks) {
    if (t.type === 'ws') { if (out !== '') pendingSpace = true; continue; }
    if (t.type === 'lineComment' || t.type === 'blockComment') { if (out !== '') pendingSpace = true; continue; }
    if (pendingSpace && out !== '') out += ' ';
    out += t.value;
    pendingSpace = false;
  }
  return out.trim();
}

// =====================================================================
// HTML (full pretty + conservative minify)
// =====================================================================
//
// Hand-rolled tokenizer: tags (open/close/self-closing), attributes (kept as
// the verbatim raw open-tag string, so quotes and values with < > are never
// corrupted), text, comments, doctype, and raw-text elements (script, style,
// pre, textarea) whose contents are preserved byte-for-byte. HTML whitespace
// can be significant, so minify is deliberately conservative.

const HTML_VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const HTML_RAWTEXT = new Set(['script', 'style', 'pre', 'textarea']);
const HTML_INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em',
  'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'img', 'button', 'label',
  'select', 'input',
]);

function htmlTagName(rawOpen) {
  const m = /^<\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(rawOpen);
  return m ? m[1].toLowerCase() : '';
}

function tokenizeHTML(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] === '<') {
      if (src.startsWith('<!--', i)) {
        let end = src.indexOf('-->', i + 4);
        end = end < 0 ? n : end + 3;
        tokens.push({ type: 'comment', value: src.slice(i, end) });
        i = end;
        continue;
      }
      if (src[i + 1] === '!') {
        let end = src.indexOf('>', i);
        end = end < 0 ? n : end + 1;
        tokens.push({ type: 'doctype', value: src.slice(i, end) });
        i = end;
        continue;
      }
      if (src[i + 1] === '/') {
        let end = src.indexOf('>', i);
        end = end < 0 ? n : end + 1;
        const raw = src.slice(i, end);
        tokens.push({ type: 'endTag', name: htmlTagName(raw.replace('/', '')), raw });
        i = end;
        continue;
      }
      if (/[a-zA-Z]/.test(src[i + 1] || '')) {
        // read start tag, respecting quotes in attribute values
        let j = i + 1;
        while (j < n) {
          const c = src[j];
          if (c === '"' || c === "'") {
            const q = c;
            j++;
            while (j < n && src[j] !== q) j++;
            j++;
            continue;
          }
          if (c === '>') { j++; break; }
          j++;
        }
        const raw = src.slice(i, j);
        const name = htmlTagName(raw);
        const selfClosing = /\/\s*>$/.test(raw) || HTML_VOID.has(name);
        tokens.push({ type: 'startTag', name, raw, selfClosing });
        i = j;
        if (HTML_RAWTEXT.has(name) && !/\/\s*>$/.test(raw)) {
          // consume verbatim raw content up to the matching close tag
          const closeRe = new RegExp('</\\s*' + name + '\\b', 'i');
          const rest = src.slice(i);
          const m = closeRe.exec(rest);
          const contentEnd = m ? i + m.index : n;
          tokens.push({ type: 'text', value: src.slice(i, contentEnd), raw: true });
          i = contentEnd;
        }
        continue;
      }
      // a bare '<' that is not a tag — treat as text
      let j = i + 1;
      while (j < n && src[j] !== '<') j++;
      tokens.push({ type: 'text', value: src.slice(i, j) });
      i = j;
      continue;
    }
    let j = i;
    while (j < n && src[j] !== '<') j++;
    tokens.push({ type: 'text', value: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

function htmlBuildTree(tokens) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  for (const t of tokens) {
    if (t.type === 'startTag') {
      const el = {
        type: 'element',
        name: t.name,
        raw: t.raw,
        rawText: HTML_RAWTEXT.has(t.name),
        children: [],
      };
      top().children.push(el);
      if (!t.selfClosing) stack.push(el);
    } else if (t.type === 'endTag') {
      // lenient: pop to the nearest matching open element
      let idx = -1;
      for (let k = stack.length - 1; k >= 1; k--) {
        if (stack[k].type === 'element' && stack[k].name === t.name) { idx = k; break; }
      }
      if (idx >= 0) stack.length = idx;
    } else {
      top().children.push(t);
    }
  }
  return root;
}

function htmlCollapse(text) {
  return text.replace(/\s+/g, ' ');
}

// Try to render an element (and inline descendants) on a single line.
// Returns the string, or null if a block-level child forces block layout.
function htmlRenderInline(node) {
  if (node.type === 'text') return htmlCollapse(node.value);
  if (node.type === 'comment' || node.type === 'doctype') return null;
  if (node.type !== 'element') return null;
  if (node.rawText) return null; // raw-text elements always block
  if (HTML_VOID.has(node.name) || /\/\s*>$/.test(node.raw)) return node.raw;
  let inner = '';
  for (const c of node.children) {
    if (c.type === 'comment' || c.type === 'doctype') return null;
    if (c.type === 'element' && !HTML_INLINE.has(c.name)) return null;
    const piece = htmlRenderInline(c);
    if (piece === null) return null;
    inner += piece;
  }
  return node.raw + inner + `</${node.name}>`;
}

function htmlEmit(node, depth, unit, lines) {
  const pad = unit.repeat(depth);
  if (node.type === 'text') {
    const t = htmlCollapse(node.value).trim();
    if (t) lines.push(pad + t);
    return;
  }
  if (node.type === 'comment' || node.type === 'doctype') {
    lines.push(pad + node.value.trim());
    return;
  }
  if (node.type !== 'element') return;
  if (node.rawText) {
    const raw = node.children.map((c) => (c.raw ? c.value : '')).join('');
    lines.push(pad + node.raw + raw + `</${node.name}>`);
    return;
  }
  if (HTML_VOID.has(node.name) || /\/\s*>$/.test(node.raw)) {
    lines.push(pad + node.raw);
    return;
  }
  // element with children: try single-line inline first
  const nonWs = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (nonWs.length === 0) {
    lines.push(pad + node.raw + `</${node.name}>`);
    return;
  }
  const inlineAll = nonWs.every((c) => c.type === 'text' || (c.type === 'element' && HTML_INLINE.has(c.name)));
  if (inlineAll) {
    const rendered = htmlRenderInline(node);
    if (rendered !== null && !rendered.includes('\n')) {
      lines.push(pad + rendered);
      return;
    }
  }
  lines.push(pad + node.raw);
  for (const c of node.children) htmlEmit(c, depth + 1, unit, lines);
  lines.push(pad + `</${node.name}>`);
}

function formatHTML(src, opts = {}) {
  const unit = indentUnit(opts.indent === undefined ? 2 : opts.indent);
  const root = htmlBuildTree(tokenizeHTML(src));
  const lines = [];
  for (const c of root.children) htmlEmit(c, 0, unit, lines);
  // No global \n{3,} collapse: htmlEmit never inserts blank lines, so any run of 3+ newlines
  // lives inside a raw-text element (<pre>/<textarea>/<script>/<style>) or a comment — preserve it.
  return lines.join('\n').trim() + '\n';
}

function htmlKeepComment(value) {
  // Preserve IE conditional comments and bang-comments (<!--! ... -->).
  return /^<!--\[if/i.test(value) || /^<!--!/.test(value) || /\[endif\]/i.test(value);
}

function minifyChildren(children, out) {
  for (let k = 0; k < children.length; k++) {
    const c = children[k];
    if (c.type === 'comment') {
      if (htmlKeepComment(c.value)) out.push(c.value);
      continue;
    }
    if (c.type === 'doctype') { out.push(c.value); continue; }
    if (c.type === 'text') {
      if (c.raw) { out.push(c.value); continue; }
      const prev = children[k - 1];
      const next = children[k + 1];
      const isBlockNeighbor = (sib) =>
        !sib || (sib.type === 'element' && !HTML_INLINE.has(sib.name)) ||
        sib.type === 'comment' || sib.type === 'doctype';
      if (c.value.trim() === '') {
        // whitespace-only: drop between block elements; keep one space between inline
        if (isBlockNeighbor(prev) && isBlockNeighbor(next)) continue;
        out.push(' ');
      } else {
        // collapse internal runs; preserve a single leading/trailing space
        out.push(c.value.replace(/\s+/g, ' '));
      }
      continue;
    }
    if (c.type === 'element') {
      if (c.rawText) {
        const raw = c.children.map((x) => (x.raw ? x.value : '')).join('');
        out.push(c.raw + raw + `</${c.name}>`);
        continue;
      }
      out.push(c.raw);
      if (!(HTML_VOID.has(c.name) || /\/\s*>$/.test(c.raw))) {
        minifyChildren(c.children, out);
        out.push(`</${c.name}>`);
      }
    }
  }
}

function minifyHTML(src) {
  const root = htmlBuildTree(tokenizeHTML(src));
  const out = [];
  minifyChildren(root.children, out);
  return out.join('').trim();
}

// =====================================================================
// YAML (documented subset — full pretty + minify)
// =====================================================================
//
// Supported: block mappings, block sequences, nesting, scalars (plain,
// single/double-quoted), booleans/null/numbers, "#" comments, blank lines,
// flow collections ([...] / {...}), and a single optional leading "---".
// Explicitly UNSUPPORTED (detected and rejected, never mis-parsed):
// anchors/aliases (&/*), tags (!/!!), complex keys (?), block scalars (|/>),
// and multiple documents. Comments are dropped by format/minify.

function yamlErr(msg, line) {
  return new Error(line ? `${msg} (line ${line})` : msg);
}

// Strip a trailing "# comment" from a line, respecting quotes. A '#' starts a
// comment only at start-of-line or when preceded by whitespace.
function yamlStripComment(line) {
  let i = 0;
  const n = line.length;
  let quote = null;
  while (i < n) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; i++; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    i++;
  }
  return line;
}

function yamlUnsupportedScan(content, line) {
  const t = content.trim();
  if (t === '') return;
  if (t[0] === '&') throw yamlErr('Unsupported YAML feature: anchors', line);
  if (t[0] === '*') throw yamlErr('Unsupported YAML feature: aliases', line);
  if (t[0] === '!') throw yamlErr('Unsupported YAML feature: tags', line);
  if (t === '?' || t.startsWith('? ')) throw yamlErr('Unsupported YAML feature: complex keys', line);
}

function yamlValueUnsupported(value, line) {
  const t = value.trim();
  if (t === '') return;
  if (t === '|' || t === '>' || /^[|>][+-]?\d*\s*$/.test(t)) {
    throw yamlErr('Unsupported YAML feature: block scalars', line);
  }
  if (t[0] === '&') throw yamlErr('Unsupported YAML feature: anchors', line);
  if (t[0] === '*') throw yamlErr('Unsupported YAML feature: aliases', line);
  if (t[0] === '!') throw yamlErr('Unsupported YAML feature: tags', line);
}

function parseYAML(src) {
  const rawLines = src.split(/\r?\n/);
  const lines = [];
  let seenDoc = false;
  for (let k = 0; k < rawLines.length; k++) {
    const lineNo = k + 1;
    const raw = rawLines[k];
    if (/\t/.test(raw.slice(0, raw.length - raw.trimStart().length))) {
      throw yamlErr('Unsupported YAML feature: tab indentation', lineNo);
    }
    const stripped = yamlStripComment(raw).replace(/\s+$/, '');
    const trimmed = stripped.trim();
    if (trimmed === '') continue;
    if (trimmed === '---') {
      if (seenDoc || lines.length > 0) throw yamlErr('Unsupported YAML feature: multiple documents', lineNo);
      seenDoc = true;
      continue;
    }
    if (trimmed === '...') { continue; }
    const indent = stripped.length - stripped.trimStart().length;
    const content = stripped.slice(indent);
    yamlUnsupportedScan(content, lineNo);
    lines.push({ indent, content, lineNo });
  }
  if (lines.length === 0) return null;
  // A top-level flow document (e.g. the output of minifyYAML): parse the
  // whole thing as a single flow collection.
  if (lines[0].content[0] === '{' || lines[0].content[0] === '[') {
    return yamlParseFlow(lines.map((l) => l.content).join(' '), lines[0].lineNo);
  }
  return yamlParseLines(lines);
}

function yamlParseLines(lines) {
  const base = lines[0].indent;
  if (yamlIsSeqMarker(lines[0].content)) return yamlParseSeq(lines, base);
  return yamlParseMap(lines, base);
}

function yamlIsSeqMarker(content) {
  return content === '-' || content.startsWith('- ');
}

function yamlAfterDash(content) {
  return content === '-' ? '' : content.slice(2).trim();
}

// Find the ':' that separates a mapping key from its value: colon followed by
// whitespace or end-of-string, at top level (skip quotes and flow brackets).
function yamlFindColon(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 >= text.length || /\s/.test(text[i + 1]))) return i;
  }
  return -1;
}

function yamlParseMap(lines, base) {
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== base) throw yamlErr('Bad indentation', line.lineNo);
    const idx = yamlFindColon(line.content);
    if (idx < 0) throw yamlErr('Expected "key: value"', line.lineNo);
    const key = yamlParseScalar(line.content.slice(0, idx).trim(), line.lineNo);
    const rest = line.content.slice(idx + 1).trim();
    i++;
    if (rest !== '') {
      yamlValueUnsupported(rest, line.lineNo);
      obj[String(key)] = yamlParseFlowOrScalar(rest, line.lineNo);
      // A deeper-indented line following an inline value is malformed YAML — error rather
      // than silently discarding its content (consistent with the under-indent throw below).
      if (i < lines.length && lines[i].indent > base) throw yamlErr('Bad indentation', lines[i].lineNo);
    } else {
      // A block value is either deeper-indented, OR a same-indent block
      // sequence (valid YAML: a "- item" list may sit at the key's column).
      const valueLines = [];
      while (i < lines.length && (lines[i].indent > base ||
        (lines[i].indent === base && yamlIsSeqMarker(lines[i].content)))) {
        valueLines.push(lines[i++]);
      }
      obj[String(key)] = valueLines.length ? yamlParseLines(valueLines) : null;
    }
  }
  return obj;
}

function yamlParseSeq(lines, base) {
  const arr = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== base || !yamlIsSeqMarker(line.content)) throw yamlErr('Bad sequence item', line.lineNo);
    const rest = yamlAfterDash(line.content);
    const contentCol = base + 2;
    i++;
    const children = [];
    while (i < lines.length && lines[i].indent > base) children.push(lines[i++]);
    if (rest === '') {
      arr.push(children.length ? yamlParseLines(children) : null);
    } else if (rest[0] === '[' || rest[0] === '{') {
      if (children.length) throw yamlErr('Bad indentation', children[0].lineNo);
      arr.push(yamlParseFlow(rest, line.lineNo));
    } else if (yamlFindColon(rest) >= 0) {
      const sub = [{ indent: contentCol, content: rest, lineNo: line.lineNo }, ...children];
      arr.push(yamlParseLines(sub));
    } else {
      // A plain scalar item cannot own deeper-indented child lines — error rather than drop them.
      if (children.length) throw yamlErr('Bad indentation', children[0].lineNo);
      yamlValueUnsupported(rest, line.lineNo);
      arr.push(yamlParseScalar(rest, line.lineNo));
    }
  }
  return arr;
}

function yamlParseFlowOrScalar(text, lineNo) {
  const t = text.trim();
  if (t[0] === '[' || t[0] === '{') return yamlParseFlow(t, lineNo);
  return yamlParseScalar(t, lineNo);
}

function yamlParseScalar(text, lineNo) {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (t[0] === '"') return yamlParseDouble(t, lineNo);
  if (t[0] === "'") return yamlParseSingle(t, lineNo);
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  if (/^[-+]?0x[0-9a-fA-F]+$/.test(t)) return Number(t);
  return t;
}

function yamlParseDouble(t, lineNo) {
  // find the matching closing quote
  let i = 1;
  let out = '';
  while (i < t.length) {
    const c = t[i];
    if (c === '\\') {
      const next = t[i + 1];
      const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0' };
      out += map[next] !== undefined ? map[next] : next;
      i += 2;
      continue;
    }
    if (c === '"') return out;
    out += c;
    i++;
  }
  throw yamlErr('Unterminated double-quoted string', lineNo);
}

function yamlParseSingle(t, lineNo) {
  let i = 1;
  let out = '';
  while (i < t.length) {
    const c = t[i];
    if (c === "'" && t[i + 1] === "'") { out += "'"; i += 2; continue; }
    if (c === "'") return out;
    out += c;
    i++;
  }
  throw yamlErr('Unterminated single-quoted string', lineNo);
}

// Flow collection parser: [a, b], {k: v}, and nested combinations.
function yamlParseFlow(text, lineNo) {
  const state = { s: text, i: 0, lineNo };
  yamlSkipWs(state);
  const value = yamlFlowValue(state);
  yamlSkipWs(state);
  return value;
}

function yamlSkipWs(state) {
  while (state.i < state.s.length && /\s/.test(state.s[state.i])) state.i++;
}

function yamlFlowValue(state) {
  yamlSkipWs(state);
  const c = state.s[state.i];
  if (c === '[') return yamlFlowArray(state);
  if (c === '{') return yamlFlowObject(state);
  return yamlFlowScalar(state);
}

function yamlFlowArray(state) {
  state.i++; // '['
  const arr = [];
  yamlSkipWs(state);
  if (state.s[state.i] === ']') { state.i++; return arr; }
  while (state.i < state.s.length) {
    arr.push(yamlFlowValue(state));
    yamlSkipWs(state);
    const c = state.s[state.i];
    if (c === ',') { state.i++; yamlSkipWs(state); continue; }
    if (c === ']') { state.i++; return arr; }
    throw yamlErr('Malformed flow sequence', state.lineNo);
  }
  throw yamlErr('Unterminated flow sequence', state.lineNo);
}

function yamlFlowObject(state) {
  state.i++; // '{'
  const obj = {};
  yamlSkipWs(state);
  if (state.s[state.i] === '}') { state.i++; return obj; }
  while (state.i < state.s.length) {
    yamlSkipWs(state);
    const key = yamlFlowScalarRaw(state, true);
    yamlSkipWs(state);
    if (state.s[state.i] !== ':') throw yamlErr('Expected ":" in flow mapping', state.lineNo);
    state.i++;
    const value = yamlFlowValue(state);
    obj[String(key)] = value;
    yamlSkipWs(state);
    const c = state.s[state.i];
    if (c === ',') { state.i++; continue; }
    if (c === '}') { state.i++; return obj; }
    throw yamlErr('Malformed flow mapping', state.lineNo);
  }
  throw yamlErr('Unterminated flow mapping', state.lineNo);
}

function yamlFlowScalar(state) {
  return yamlFlowScalarRaw(state, false);
}

function yamlFlowScalarRaw(state, isKey) {
  yamlSkipWs(state);
  const c = state.s[state.i];
  if (c === '"' || c === "'") {
    const start = state.i;
    const quote = c;
    state.i++;
    while (state.i < state.s.length) {
      if (quote === '"' && state.s[state.i] === '\\') { state.i += 2; continue; }
      if (quote === "'" && state.s[state.i] === "'" && state.s[state.i + 1] === "'") { state.i += 2; continue; }
      if (state.s[state.i] === quote) { state.i++; break; }
      state.i++;
    }
    const raw = state.s.slice(start, state.i);
    return quote === '"' ? yamlParseDouble(raw, state.lineNo) : yamlParseSingle(raw, state.lineNo);
  }
  let start = state.i;
  while (state.i < state.s.length && !/[,\]}:]/.test(state.s[state.i])) {
    // a ':' only terminates a key
    state.i++;
  }
  const token = state.s.slice(start, state.i).trim();
  return yamlParseScalar(token, state.lineNo);
}

// ---- YAML emitters ----

function yamlScalarNeedsQuote(str) {
  if (str === '') return true;
  if (/^[\s]|[\s]$/.test(str)) return true;
  // A newline/CR/tab anywhere must be quoted — a raw newline produces invalid YAML and a
  // silent value change on re-parse. JSON.stringify escapes these to a valid double-quoted scalar.
  if (/[\n\r\t]/.test(str)) return true;
  if (/[:#\[\]{}&*!|>'"%@`,]/.test(str)) return true;
  if (/^[-?]/.test(str) && (str.length === 1 || /\s/.test(str[1]))) return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(str)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(str)) return true;
  return false;
}

function yamlDumpScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const str = String(value);
  if (yamlScalarNeedsQuote(str)) return JSON.stringify(str);
  return str;
}

function yamlEmitBlock(value, pad, unit, lines) {
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        if (Array.isArray(item)) {
          if (item.length === 0) { lines.push(pad + '- []'); continue; }
          lines.push(pad + '-');
          yamlEmitBlock(item, pad + unit, unit, lines);
        } else {
          const keys = Object.keys(item);
          if (keys.length === 0) { lines.push(pad + '- {}'); continue; }
          const sub = [];
          yamlEmitBlock(item, pad + '  ', unit, sub);
          lines.push(pad + '- ' + sub[0].slice((pad + '  ').length));
          for (let k = 1; k < sub.length; k++) lines.push(sub[k]);
        }
      } else {
        lines.push(pad + '- ' + yamlDumpScalar(item));
      }
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const v = value[key];
      const keyStr = yamlScalarNeedsQuote(key) ? JSON.stringify(key) : key;
      if (Array.isArray(v)) {
        if (v.length === 0) lines.push(pad + keyStr + ': []');
        else { lines.push(pad + keyStr + ':'); yamlEmitBlock(v, pad + unit, unit, lines); }
      } else if (v !== null && typeof v === 'object') {
        if (Object.keys(v).length === 0) lines.push(pad + keyStr + ': {}');
        else { lines.push(pad + keyStr + ':'); yamlEmitBlock(v, pad + unit, unit, lines); }
      } else {
        lines.push(pad + keyStr + ': ' + yamlDumpScalar(v));
      }
    }
    return;
  }
  lines.push(pad + yamlDumpScalar(value));
}

function formatYAML(src, opts = {}) {
  const unit = indentUnit(opts.indent === undefined ? 2 : opts.indent);
  const value = parseYAML(src);
  if (value === null) return '';
  if (typeof value !== 'object') return yamlDumpScalar(value) + '\n';
  const lines = [];
  yamlEmitBlock(value, '', unit, lines);
  return lines.join('\n') + '\n';
}

function yamlDumpFlowScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const str = String(value);
  // stricter quoting inside flow (commas/brackets matter)
  if (yamlScalarNeedsQuote(str)) return JSON.stringify(str);
  return str;
}

function yamlDumpFlow(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(yamlDumpFlow).join(', ') + ']';
  }
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).map((k) => {
      const keyStr = yamlScalarNeedsQuote(k) ? JSON.stringify(k) : k;
      return keyStr + ': ' + yamlDumpFlow(value[k]);
    }).join(', ') + '}';
  }
  return yamlDumpFlowScalar(value);
}

function minifyYAML(src) {
  const value = parseYAML(src);
  if (value === null) return '';
  return yamlDumpFlow(value);
}

// =====================================================================
// JavaScript (pretty-print + SAFE minify; token-level, NO AST)
// =====================================================================
//
// The tokenizer is the crux. It distinguishes line/block comments, single/
// double strings, template literals (incl. nested ${...} and nested
// templates), regex-literals-vs-division (via the preceding-significant-token
// rule), numbers, identifiers/keywords, and punctuators. Both transforms only
// move/normalize whitespace — never reorder, remove (except comments/
// whitespace), or rewrite a token. Minify is conservative around ASI: it
// never joins tokens across an existing newline.

// Keywords after which a '/' begins a regex (not division).
const JS_REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do',
  'else', 'yield', 'await', 'throw', 'case', 'default', 'else',
]);
// Identifier-like tokens after which '/' is division.
const JS_VALUE_KEYWORDS = new Set(['this', 'super', 'true', 'false', 'null']);

const JS_PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '.', '?', ':', '=', '+', '-', '*',
  '/', '%', '<', '>', '!', '~', '&', '|', '^',
];

function tokenizeJS(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  const braceStack = []; // 'block' or 'template'

  const prevSignificant = () => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      const t = tokens[k].type;
      if (t !== 'ws' && t !== 'lineComment' && t !== 'blockComment') return tokens[k];
    }
    return null;
  };

  const regexAllowed = () => {
    const p = prevSignificant();
    if (!p) return true;
    if (p.type === 'number' || p.type === 'string' || p.type === 'regex') return false;
    // A template token ending in `${` is an expression head/continuation → a regex may start there;
    // a closed template (ending in `` ` ``) or a tail span is a value → division.
    if (p.type === 'template') return /\$\{$/.test(p.value);
    if (p.type === 'name') {
      if (JS_VALUE_KEYWORDS.has(p.value)) return false;
      if (JS_REGEX_KEYWORDS.has(p.value)) return true;
      return false; // ordinary identifier => division
    }
    if (p.type === 'punct') {
      if (p.value === ')' || p.value === ']') return false;
      if (p.value === '}') return true; // treat block close as statement position
      if (p.value === '++' || p.value === '--') return false; // postfix yields a value → division
      return true; // after any other operator/punctuator, regex is allowed
    }
    return true;
  };

  const readTemplateSpan = () => {
    const start = i;
    i++; // consume ` or }
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return { value: src.slice(start, i), open: false }; }
      if (c === '$' && src[i + 1] === '{') { i += 2; return { value: src.slice(start, i), open: true }; }
      i++;
    }
    return { value: src.slice(start, i), open: false };
  };

  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      tokens.push({ type: 'ws', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      tokens.push({ type: 'lineComment', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      tokens.push({ type: 'blockComment', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && regexAllowed()) {
      // read a regex literal
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n) {
        const cc = src[j];
        if (cc === '\\') { j += 2; continue; }
        if (cc === '\n') break; // unterminated — bail to division
        if (cc === '[') inClass = true;
        else if (cc === ']') inClass = false;
        else if (cc === '/' && !inClass) { ok = true; j++; break; }
        j++;
      }
      if (ok) {
        while (j < n && /[a-zA-Z]/.test(src[j])) j++; // flags
        tokens.push({ type: 'regex', value: src.slice(i, j) });
        i = j;
        continue;
      }
      // not a valid regex — fall through and treat '/' as punctuator
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '\n') break; // unterminated
        if (src[j] === q) { j++; break; }
        j++;
      }
      tokens.push({ type: 'string', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '`') {
      const span = readTemplateSpan();
      tokens.push({ type: 'template', value: span.value });
      if (span.open) braceStack.push('template');
      continue;
    }
    if (c === '}' && braceStack.length && braceStack[braceStack.length - 1] === 'template') {
      braceStack.pop();
      const span = readTemplateSpan(); // consumes the '}' and continues the template
      tokens.push({ type: 'template', value: span.value });
      if (span.open) braceStack.push('template');
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      if (c === '0' && /[xXoObB]/.test(src[i + 1] || '')) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++;
      } else {
        while (j < n && /[0-9._]/.test(src[j])) j++;
        if (src[j] === 'e' || src[j] === 'E') {
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
      }
      if (src[j] === 'n') j++; // BigInt
      tokens.push({ type: 'number', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$ -￿]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$ -￿]/.test(src[j])) j++;
      tokens.push({ type: 'name', value: src.slice(i, j) });
      i = j;
      continue;
    }
    // punctuator — longest match
    let matched = null;
    for (const p of JS_PUNCT) {
      if (src.startsWith(p, i)) { matched = p; break; }
    }
    if (matched) {
      tokens.push({ type: 'punct', value: matched });
      if (matched === '{') braceStack.push('block');
      else if (matched === '}') braceStack.pop();
      i += matched.length;
      continue;
    }
    tokens.push({ type: 'punct', value: c });
    i++;
  }
  return tokens;
}

function jsIsWordish(type) {
  return type === 'name' || type === 'number';
}

// Whether two adjacent significant tokens need a separating space so they do
// not merge into a different token (used by both format and minify).
function jsNeedSpace(prev, cur) {
  if (!prev) return false;
  const pv = prev.value, cv = cur.value;
  const pt = prev.type, ct = cur.type;
  if (pt === 'blockComment' || ct === 'blockComment') return true;
  if (jsIsWordish(pt) && jsIsWordish(ct)) return true;
  if (pt === 'number' && cv[0] === '.') return true; // 1 .toFixed()
  // regex adjacency and comment-forming pairs
  const last = pv[pv.length - 1];
  const first = cv[0];
  if ((last === '/' || first === '/') && (last + first === '//' || last + first === '/*')) return true;
  const OP = '+-*/%<>=&|^~!?.';
  if (OP.includes(last) && OP.includes(first)) return true;
  // a keyword/identifier immediately before a regex/template/string is fine to
  // keep adjacent, but keep a space between two wordish already handled above.
  return false;
}

// ---- formatJS spacing model -----------------------------------------------
// The re-indenter is still purely whitespace-level: it only inserts/removes
// spaces and newlines BETWEEN tokens, so the ordered token stream (and thus
// the program's meaning) is untouched, and ASI is preserved because existing
// line-breaks are never removed. On top of the old bracket-depth indenting we
// now add token-level *spacing*: spaces around binary operators (never unary),
// after commas, before block "{", plus import/export-list statements kept on
// one line and blank lines between top-level sections.

// Binary/assignment/comparison operators that read best with a space on each
// side. "+"/"-" are only binary when the previous token produces a value (see
// jsOpIsBinary), so unary +/- stay tight.
const JS_BINARY_OPS = new Set([
  '||', '&&', '??', '==', '!=', '===', '!==', '<', '>', '<=', '>=',
  '+', '-', '*', '/', '%', '**',
  '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=',
  '&=', '|=', '^=', '&&=', '||=', '??=',
  '<<', '>>', '>>>', '&', '|', '^', '=>', '?',
]);

// Reserved words that take a space before and/or after them. Deliberately
// EXCLUDES the value keywords (this/super/true/false/null) so they space like
// ordinary identifiers (e.g. "!this", not "! this").
const JS_KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return',
  'static', 'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield', 'as', 'from', 'async', 'get', 'set',
]);

// Keywords that begin a top-level statement (used only as an ASI fallback when
// an import/export list has no terminating semicolon).
const JS_STMT_START_KW = new Set([
  'import', 'export', 'const', 'let', 'var', 'function', 'class', 'async',
  'return', 'if', 'for', 'while', 'do', 'switch', 'throw', 'try',
]);

// True when a token produces a value, so a following "+"/"-" is binary (and a
// following "/" would be division). Mirrors the tokenizer's regex-vs-division
// rule so we never mistake unary +/- for binary.
function jsIsValueEnd(prev) {
  if (!prev) return false;
  const t = prev.type;
  if (t === 'number' || t === 'string' || t === 'regex') return true;
  if (t === 'template') return !/\$\{$/.test(prev.value); // open head/middle → expression follows
  if (t === 'name') return !JS_REGEX_KEYWORDS.has(prev.value);
  if (t === 'punct') return prev.value === ')' || prev.value === ']' || prev.value === '++' || prev.value === '--';
  return false;
}

function jsOpIsBinary(prev, op) {
  if (!JS_BINARY_OPS.has(op)) return false;
  if (op === '+' || op === '-') return jsIsValueEnd(prev); // else unary
  return true;
}

// Whether to emit a space before `cur`. `prevBinary` says whether `prev` was a
// binary operator (so the token after it also gets a space). This only ever
// ADDS optional spaces; the must-not-merge cases fall back to jsNeedSpace.
function jsSpaceBefore(prev, cur, prevBinary) {
  if (!prev) return false;
  if (jsNeedSpace(prev, cur)) return true;
  const pv = prev.value, cv = cur.value, pt = prev.type, ct = cur.type;

  // never a space after a member operator
  if (pt === 'punct' && (pv === '.' || pv === '?.')) return false;
  // hug-left tokens: no space before them
  if (ct === 'punct' && (cv === ',' || cv === ';' || cv === ')' || cv === ']' ||
    cv === '.' || cv === '?.' || cv === ':')) return false;
  // a space after , ; :
  if (pt === 'punct' && (pv === ',' || pv === ';' || pv === ':')) return true;

  // binary operators get a space on both sides
  if (ct === 'punct' && jsOpIsBinary(prev, cv)) return true;
  if (prevBinary) return true;

  // a space before a block "{" (function/if/for/while/…, => {, else {, try {)
  if (ct === 'punct' && cv === '{') {
    if (pt === 'punct' && (pv === ')' || pv === '=>')) return true;
    if (pt === 'name' && JS_KEYWORDS.has(pv)) return true;
    return false;
  }
  // a reserved keyword gets a space before and after it
  if (ct === 'name' && JS_KEYWORDS.has(cv)) return true;
  if (pt === 'name' && JS_KEYWORDS.has(pv)) return true;

  return false;
}

function formatJS(src, opts = {}) {
  const unit = indentUnit(opts.indent === undefined ? 2 : opts.indent);
  const toks = tokenizeJS(src);
  // significant items with a "newline before" flag (preserve existing breaks
  // so ASI behavior never changes)
  const items = [];
  let pendingNL = false;
  for (const t of toks) {
    if (t.type === 'ws') { if (t.value.includes('\n')) pendingNL = true; continue; }
    const nlBefore = pendingNL;
    pendingNL = false;
    items.push({ t, nlBefore });
    if (t.type === 'lineComment') pendingNL = true; // a line comment forces a break after
  }

  let out = '';
  let depth = 0;
  let parenDepth = 0;
  const pad = (d) => unit.repeat(Math.max(0, d));

  // Top-level section tracking (for blank lines between the import group and
  // the const/function/class definitions that follow).
  let seenTopStmt = false;
  let prevStmtImport = false;

  // Render items[from..to] on a single line (import / export-list statements).
  const renderInline = (from, to) => {
    let s = '';
    let pBinary = false;
    for (let j = from; j <= to; j++) {
      const cur = items[j].t;
      const prev = j > from ? items[j - 1].t : null;
      if (j === from) {
        s += cur.value;
      } else {
        let sp = jsSpaceBefore(prev, cur, pBinary);
        // import/export braces read nicer with inner spaces: "{ a, b }"
        if (prev.value === '{' && cur.value !== '}') sp = true;
        if (cur.value === '}') sp = true;
        s += (sp ? ' ' : '') + cur.value;
      }
      pBinary = cur.type === 'punct' && jsOpIsBinary(prev, cur.value);
    }
    return s;
  };

  // Does items[k] begin an import / export-list statement (kept single-line)?
  const isInlineStmtStart = (k) => {
    const t = items[k].t;
    const atStart = k === 0 || items[k].nlBefore || (items[k - 1] && items[k - 1].t.value === ';');
    if (!atStart || t.type !== 'name') return false;
    const next = items[k + 1] && items[k + 1].t;
    if (t.value === 'import') return !!next && next.value !== '(' && next.value !== '.'; // not import()/import.meta
    if (t.value === 'export') return !!next && (next.value === '{' || next.value === '*');
    return false;
  };

  // Index of the last item of the inline statement beginning at k.
  const inlineStmtEnd = (k) => {
    let d = 0;
    for (let j = k; j < items.length; j++) {
      const { t, nlBefore } = items[j];
      const v = t.value;
      if (t.type === 'punct') {
        if (v === '{' || v === '(' || v === '[') d++;
        else if (v === '}' || v === ')' || v === ']') d--;
      }
      if (t.type === 'punct' && v === ';' && d === 0) return j; // terminating ;
      // ASI fallback: a new line at depth 0 right after the specifier string
      // or the clause "}" ends the statement.
      if (j > k && d === 0 && nlBefore) {
        const prevTok = items[j - 1].t;
        if (prevTok.type === 'string' || prevTok.value === '}') return j - 1;
      }
    }
    return items.length - 1;
  };

  let prevBinary = false;
  for (let k = 0; k < items.length; k++) {
    const { t, nlBefore } = items[k];
    const v = t.value;
    const prev = k > 0 ? items[k - 1].t : null;

    // ---- import / export-list statements: keep on one line ----
    if (isInlineStmtStart(k)) {
      const end = inlineStmtEnd(k);
      const curImport = t.value === 'import';
      if (k > 0) {
        let blank = false;
        if (seenTopStmt && !(curImport && prevStmtImport)) blank = true;
        out += (blank ? '\n' : '') + '\n' + pad(0);
      }
      out += renderInline(k, end);
      seenTopStmt = true;
      prevStmtImport = curImport;
      prevBinary = false;
      k = end;
      continue;
    }

    const isCloser = t.type === 'punct' && (v === '}' || v === ']' || v === ')');
    const isStmtToken = t.type !== 'lineComment' && t.type !== 'blockComment';

    let willNL = false;
    if (k > 0) {
      const pv = prev.value;
      const forceAfter = prev.type === 'punct' && (pv === '{' || (pv === ';' && parenDepth === 0));
      const forceLineComment = prev.type === 'lineComment';
      const forceBeforeClose = t.type === 'punct' && v === '}';
      willNL = nlBefore || forceAfter || forceLineComment || forceBeforeClose;
    }

    if (k === 0) {
      out += v;
      seenTopStmt = isStmtToken;
      prevStmtImport = false;
    } else if (willNL) {
      const lineDepth = isCloser ? depth - 1 : depth;
      let blank = false;
      if (depth === 0 && !isCloser) {
        const isTerminator = prev.value === ';' || (prev.type === 'punct' && prev.value === '}');
        if (!seenTopStmt) {
          if (isStmtToken) { seenTopStmt = true; prevStmtImport = false; }
        } else if (isTerminator) {
          blank = true;            // a non-import top-level statement always separates
          prevStmtImport = false;
        }
      }
      out += (blank ? '\n' : '') + '\n' + pad(lineDepth) + v;
    } else {
      out += (jsSpaceBefore(prev, t, prevBinary) ? ' ' : '') + v;
    }

    prevBinary = t.type === 'punct' && jsOpIsBinary(prev, v);

    if (t.type === 'punct') {
      if (v === '{' || v === '[' || v === '(') depth++;
      else if (v === '}' || v === ']' || v === ')') depth = Math.max(0, depth - 1);
      if (v === '(') parenDepth++;
      else if (v === ')') parenDepth = Math.max(0, parenDepth - 1);
    }
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function minifyJS(src) {
  const toks = tokenizeJS(src);
  let out = '';
  let prevSig = null;
  let pendingNL = false;
  for (const t of toks) {
    if (t.type === 'ws') {
      if (t.value.includes('\n')) pendingNL = true;
      continue;
    }
    if (t.type === 'lineComment') { pendingNL = true; continue; }
    if (t.type === 'blockComment') {
      if (t.value.includes('\n')) pendingNL = true;
      continue;
    }
    if (prevSig !== null) {
      if (pendingNL) out += '\n';
      else if (jsNeedSpace(prevSig, t)) out += ' ';
    }
    out += t.value;
    prevSig = t;
    pendingNL = false;
  }
  return out.trim();
}

// =====================================================================
// Exports (names are a contract — consumers import them)
// =====================================================================

export {
  byteLength, indentUnit, lineColFromOffset,
  formatJSON, minifyJSON,
  parseYAML, formatYAML, minifyYAML,
  formatHTML, minifyHTML,
  formatCSS, minifyCSS,
  tokenizeSQL, formatSQL, minifySQL,
  tokenizeJS, formatJS, minifyJS,
};
