// ===== Begin jbcMarkdown (ES module) =====
/*
 * jbcMarkdown — safe Markdown → HTML renderer (DOM-free, deterministic).
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module: a line-based block parser (parseBlocks)
 * plus an inline parser (parseInline), entry point mdToHtml(src, opts). No DOM,
 * no Date, no randomness — the same Markdown always produces byte-identical HTML.
 * Safety is baked in: raw HTML is always escaped (never passed through), and
 * link/image URLs are sanitized (sanitizeUrl blocks javascript:/vbscript:/data:
 * — a data: URL is allowed only for an image, only when the caller passes
 * opts.allowImage (default off), and only for a non-SVG data:image/ payload;
 * image/svg+xml stays blocked even with allowImage since SVG can carry script).
 * opts threads through mdToHtml -> parseBlocks -> parseInline -> link/image.
 * Also exports escapeHtmlForMarkdown / escapeAttrForMarkdown.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs Markdown rendering
 * imports this module directly (so `node --test` can load it); the single-file
 * build inlines this module body into the shipped index.html — stripping each
 * `export` — so the shipped tool stays dependency-free and file://-openable. See
 * the consuming repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// ---- escaping --------------------------------------------------------
function escapeHtmlForMarkdown(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttrForMarkdown(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- URL sanitization ------------------------------------------------
// Decode numeric/hex HTML entities and strip control chars first (so a
// scheme can't be smuggled past the check), then block dangerous schemes.
// Returns the ORIGINAL url when safe (the caller attribute-escapes it), or
// '' when blocked.
function sanitizeUrl(url, opts = {}) {
  const raw = String(url ?? '').trim();
  if (raw === '') return '';
  const decoded = raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/[\u0000-\u001f\u007f\s]/g, '');
  const scheme = (decoded.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1];
  if (scheme) {
    const s = scheme.toLowerCase();
    if (s === 'javascript' || s === 'vbscript') return '';
    if (s === 'data') {
      // Allow a data: URL only for a non-SVG image payload and only when the caller opts in.
      // SVG can carry script, so image/svg+xml stays blocked even with allowImage (#1014-F).
      if (opts.allowImage && /^data:image\//i.test(decoded) && !/^data:image\/svg\b/i.test(decoded)) return raw;
      return '';
    }
  }
  return raw;
}

// ---- small line helpers ---------------------------------------------
const isBlank = (l) => /^[ \t]*$/.test(l);
const isFence = (l) => /^ {0,3}(`{3,}|~{3,})/.test(l);
const isAtx = (l) => /^ {0,3}#{1,6}(?:[ \t]|$)/.test(l);
const isHr = (l) =>
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(l);
const isBlockquote = (l) => /^ {0,3}>/.test(l);
const leadingSpaces = (l) => (l.match(/^ */) || [''])[0].length;

function matchListItem(line) {
  let m = line.match(/^( {0,3})([-+*])([ \t]+)([\s\S]*)$/);
  if (m) {
    return { indent: m[1].length, ordered: false, marker: m[2],
      delimiter: m[2], contentIndent: m[1].length + 1 + m[3].length,
      content: m[4], startNum: 1 };
  }
  m = line.match(/^( {0,3})(\d{1,9})([.)])([ \t]+)([\s\S]*)$/);
  if (m) {
    return { indent: m[1].length, ordered: true, marker: m[2],
      delimiter: m[3], contentIndent: m[1].length + m[2].length + 1 + m[4].length,
      content: m[5], startNum: parseInt(m[2], 10) };
  }
  // empty items: "-" or "1." on their own line
  m = line.match(/^( {0,3})([-+*])[ \t]*$/);
  if (m) {
    return { indent: m[1].length, ordered: false, marker: m[2],
      delimiter: m[2], contentIndent: m[1].length + 2, content: '', startNum: 1 };
  }
  m = line.match(/^( {0,3})(\d{1,9})([.)])[ \t]*$/);
  if (m) {
    return { indent: m[1].length, ordered: true, marker: m[2],
      delimiter: m[3], contentIndent: m[1].length + m[2].length + 2,
      content: '', startNum: parseInt(m[2], 10) };
  }
  return null;
}

const isTableDelimiterRow = (l) =>
  /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(l) &&
  l.includes('-');

function isBlockStart(lines, i) {
  const l = lines[i];
  return (
    isFence(l) || isAtx(l) || isHr(l) || isBlockquote(l) ||
    matchListItem(l) ||
    (l.includes('|') && i + 1 < lines.length && isTableDelimiterRow(lines[i + 1]))
  );
}

// ---- table row splitting --------------------------------------------
function splitTableRow(line) {
  let s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (s[k] === '|') { cells.push(cur); cur = ''; continue; }
    cur += s[k];
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// =====================================================================
// Inline parser
// =====================================================================

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

// Find the index of the matching ']' for a '[' at openIdx (depth + escape
// aware). Returns -1 if unbalanced.
function matchBracket(src, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < src.length; k++) {
    const ch = src[k];
    if (ch === '\\') { k++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return k; }
  }
  return -1;
}

// Find the matching ')' for a '(' at openIdx.
function matchParen(src, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < src.length; k++) {
    const ch = src[k];
    if (ch === '\\') { k++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return k; }
  }
  return -1;
}

// Parse a link destination string ("url", "<url>", "url \"title\"").
function parseDest(s) {
  const str = s.trim();
  if (str === '') return { url: '', title: '' };
  let url;
  let title = '';
  if (str[0] === '<') {
    const e = str.indexOf('>');
    if (e < 0) return null;
    url = str.slice(1, e);
    title = str.slice(e + 1).trim();
  } else {
    const m = str.match(/^(\S+)(?:[ \t]+([\s\S]+))?$/);
    if (!m) return null;
    url = m[1];
    title = (m[2] || '').trim();
  }
  if (title) {
    const t = title.match(/^"([\s\S]*)"$|^'([\s\S]*)'$|^\(([\s\S]*)\)$/);
    title = t ? (t[1] ?? t[2] ?? t[3]) : title;
  }
  return { url, title };
}

function refKey(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Find the run of exactly `len` backticks starting at/after `from`.
function findCodeClose(src, from, len) {
  let k = from;
  while (k < src.length) {
    if (src[k] === '`') {
      let run = 0;
      while (src[k + run] === '`') run++;
      if (run === len) return k;
      k += run;
    } else {
      k++;
    }
  }
  return -1;
}

function parseInline(src, refs, opts) {
  refs = refs || {};
  opts = opts || {};
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return '\uE000' + (tokens.length - 1) + '\uE000';
  };

  let work = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // backslash escape / hard break
    if (c === '\\') {
      const next = src[i + 1];
      if (next === '\n') { work += stash('<br>\n'); i += 2; continue; }
      if (next && PUNCT.includes(next)) { work += stash(escapeHtmlForMarkdown(next)); i += 2; continue; }
      work += '\\'; i++; continue;
    }

    // inline code span
    if (c === '`') {
      let run = 0;
      while (src[i + run] === '`') run++;
      const close = findCodeClose(src, i + run, run);
      if (close >= 0) {
        let code = src.slice(i + run, close).replace(/\n/g, ' ');
        if (code.length > 1 && /^ /.test(code) && / $/.test(code) && /[^ ]/.test(code)) {
          code = code.slice(1, -1);
        }
        work += stash('<code>' + escapeHtmlForMarkdown(code) + '</code>');
        i = close + run;
        continue;
      }
      work += '`'.repeat(run); i += run; continue;
    }

    // autolink / email  (raw HTML otherwise gets escaped as text)
    if (c === '<') {
      const rest = src.slice(i);
      let m = rest.match(/^<([a-z][a-z0-9+.-]{1,31}:[^<>\s]*)>/i);
      if (m) {
        const safe = sanitizeUrl(m[1], opts);
        work += stash('<a href="' + escapeAttrForMarkdown(safe) + '">' + escapeHtmlForMarkdown(m[1]) + '</a>');
        i += m[0].length; continue;
      }
      m = rest.match(/^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/);
      if (m) {
        work += stash('<a href="mailto:' + escapeAttrForMarkdown(m[1]) + '">' + escapeHtmlForMarkdown(m[1]) + '</a>');
        i += m[0].length; continue;
      }
      work += '<'; i++; continue;
    }

    // image
    if (c === '!' && src[i + 1] === '[') {
      const r = parseLinkOrImage(src, i + 1, true, refs, stash, opts);
      if (r) { work += r.token; i = r.end; continue; }
      work += '!'; i++; continue;
    }

    // link
    if (c === '[') {
      const r = parseLinkOrImage(src, i, false, refs, stash, opts);
      if (r) { work += r.token; i = r.end; continue; }
      work += '['; i++; continue;
    }

    work += c; i++;
  }

  work = escapeHtmlForMarkdown(work);
  work = work.replace(/ {2,}\n/g, '<br>\n');
  work = applyEmphasis(work);
  work = work.replace(/\uE000(\d+)\uE000/g, (_m, d) => tokens[+d]);
  return work;
}

// openIdx points at the '[' (the label opener).
function parseLinkOrImage(src, openIdx, isImage, refs, stash, opts) {
  opts = opts || {};
  const close = matchBracket(src, openIdx);
  if (close < 0) return null;
  const text = src.slice(openIdx + 1, close);
  let j = close + 1;
  let url = null;
  let title = '';

  if (src[j] === '(') {
    const cp = matchParen(src, j);
    if (cp < 0) return null;
    const dest = parseDest(src.slice(j + 1, cp));
    if (dest === null) return null;
    url = dest.url; title = dest.title;
    j = cp + 1;
  } else if (src[j] === '[') {
    const rc = src.indexOf(']', j + 1);
    if (rc < 0) return null;
    let label = src.slice(j + 1, rc).trim();
    if (!label) label = text;
    const def = refs[refKey(label)];
    if (!def) return null;
    url = def.url; title = def.title;
    j = rc + 1;
  } else {
    // shortcut reference [text]
    const def = refs[refKey(text)];
    if (!def) return null;
    url = def.url; title = def.title;
  }

  // Honor the caller's opt-in: data: URLs are allowed only for images AND only when the caller
  // passes opts.allowImage (default off), matching this module's documented contract (#1014-F).
  const safe = sanitizeUrl(url, { allowImage: isImage && opts.allowImage === true });
  const titleAttr = title ? ' title="' + escapeAttrForMarkdown(title) + '"' : '';
  let html;
  if (isImage) {
    html = '<img src="' + escapeAttrForMarkdown(safe) + '" alt="' + escapeAttrForMarkdown(text) + '"' + titleAttr + '>';
  } else {
    html = '<a href="' + escapeAttrForMarkdown(safe) + '"' + titleAttr + '>' + parseInline(text, refs, opts) + '</a>';
  }
  return { token: stash(html), end: j };
}

function applyEmphasis(s) {
  s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]+?)(?<=\S)\1/g, '<strong><em>$2</em></strong>');
  s = s.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\w])__(?=\S)([\s\S]+?)(?<=\S)__(?![\w])/g, '<strong>$1</strong>');
  s = s.replace(/\*(?=\S)([\s\S]+?)(?<=\S)\*/g, '<em>$1</em>');
  s = s.replace(/(?<![\w])_(?=\S)([\s\S]+?)(?<=\S)_(?![\w])/g, '<em>$1</em>');
  s = s.replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '<del>$1</del>');
  return s;
}

// =====================================================================
// Block parser
// =====================================================================

function parseBlocks(lines, refs, opts) {
  refs = refs || {};
  opts = opts || {};
  let out = '';
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // fenced code block
    const fm = line.match(/^( {0,3})(`{3,}|~{3,})[ \t]*([^\n`]*)$/);
    if (fm) {
      const indent = fm[1].length;
      const fenceChar = fm[2][0];
      const fenceLen = fm[2].length;
      const lang = (fm[3] || '').trim().split(/\s+/)[0] || '';
      i++;
      const buf = [];
      while (i < n) {
        const cm = lines[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) { i++; break; }
        buf.push(lines[i].replace(new RegExp('^ {0,' + indent + '}'), ''));
        i++;
      }
      const cls = lang ? ' class="language-' + escapeAttrForMarkdown(lang) + '"' : '';
      out += '<pre><code' + cls + '>' + escapeHtmlForMarkdown(buf.join('\n')) + '\n</code></pre>\n';
      continue;
    }

    // ATX heading
    const hm = line.match(/^ {0,3}(#{1,6})(?:[ \t]+([\s\S]*?))?(?:[ \t]+#+)?[ \t]*$/);
    if (hm && (hm[2] !== undefined || /^ {0,3}#{1,6}[ \t]*$/.test(line))) {
      const level = hm[1].length;
      const txt = (hm[2] || '').trim();
      out += '<h' + level + '>' + parseInline(txt, refs, opts) + '</h' + level + '>\n';
      i++;
      continue;
    }

    // thematic break
    if (isHr(line)) { out += '<hr>\n'; i++; continue; }

    // blockquote
    if (isBlockquote(line)) {
      const inner = [];
      while (i < n) {
        const l = lines[i];
        if (isBlockquote(l)) { inner.push(l.replace(/^ {0,3}> ?/, '')); i++; continue; }
        if (!isBlank(l) && inner.length && !isBlockStart(lines, i)) { inner.push(l); i++; continue; }
        break;
      }
      out += '<blockquote>\n' + parseBlocks(inner, refs, opts) + '</blockquote>\n';
      continue;
    }

    // list
    if (matchListItem(line)) {
      const r = parseList(lines, i, refs, opts);
      out += r.html;
      i = r.end;
      continue;
    }

    // pipe table
    if (line.includes('|') && i + 1 < n && isTableDelimiterRow(lines[i + 1])) {
      const r = parseTable(lines, i, refs, opts);
      if (r) { out += r.html; i = r.end; continue; }
    }

    // indented code block
    if (/^ {4,}\S/.test(line)) {
      const buf = [];
      while (i < n) {
        if (/^ {4,}/.test(lines[i]) && !isBlank(lines[i])) { buf.push(lines[i].slice(4)); i++; continue; }
        if (isBlank(lines[i])) {
          let j = i;
          while (j < n && isBlank(lines[j])) j++;
          if (j < n && /^ {4,}\S/.test(lines[j])) { while (i < j) { buf.push(''); i++; } continue; }
        }
        break;
      }
      while (buf.length && buf[buf.length - 1] === '') buf.pop();
      out += '<pre><code>' + escapeHtmlForMarkdown(buf.join('\n')) + '\n</code></pre>\n';
      continue;
    }

    // paragraph (with setext heading detection)
    const para = [line];
    i++;
    let heading = 0;
    while (i < n) {
      const l = lines[i];
      if (isBlank(l)) break;
      if (para.length) {
        if (/^ {0,3}=+[ \t]*$/.test(l)) { heading = 1; i++; break; }
        if (/^ {0,3}-+[ \t]*$/.test(l)) { heading = 2; i++; break; }
      }
      if (isBlockStart(lines, i)) break;
      para.push(l);
      i++;
    }
    const content = parseInline(para.join('\n'), refs, opts);
    if (heading) out += '<h' + heading + '>' + content + '</h' + heading + '>\n';
    else out += '<p>' + content + '</p>\n';
  }

  return out;
}

function parseList(lines, start, refs, opts) {
  opts = opts || {};
  const n = lines.length;
  const base = matchListItem(lines[start]);
  const ordered = base.ordered;
  const firstMarker = base.marker;
  const firstDelim = base.delimiter;
  const startNum = base.startNum;
  const items = [];
  let loose = false;
  let i = start;

  while (i < n) {
    const m = matchListItem(lines[i]);
    if (!m) break;
    if (m.ordered !== ordered) break;
    if (!ordered && m.marker !== firstMarker) break;
    if (ordered && m.delimiter !== firstDelim) break;

    const contentIndent = m.contentIndent;
    const itemLines = [m.content];
    i++;
    let pendingBlank = false;
    while (i < n) {
      const l = lines[i];
      if (isBlank(l)) { pendingBlank = true; itemLines.push(''); i++; continue; }
      const indent = leadingSpaces(l);
      if (indent >= contentIndent) {
        if (pendingBlank) loose = true;
        pendingBlank = false;
        itemLines.push(l.slice(contentIndent));
        i++;
        continue;
      }
      if (matchListItem(l)) break; // next sibling / new item
      if (!pendingBlank) { itemLines.push(l); i++; continue; } // lazy paragraph continuation
      break;
    }
    // blank line between this item and the next sibling => loose list
    if (pendingBlank && i < n && matchListItem(lines[i])) loose = true;
    while (itemLines.length && itemLines[itemLines.length - 1] === '') itemLines.pop();
    items.push(itemLines);
  }

  let html = ordered
    ? '<ol' + (startNum !== 1 ? ' start="' + startNum + '"' : '') + '>\n'
    : '<ul>\n';
  let hasTask = false;

  for (const itemLines of items) {
    let taskChecked = null;
    const firstIdx = itemLines.findIndex((l) => l !== '');
    if (firstIdx >= 0) {
      const tm = itemLines[firstIdx].match(/^\[([ xX])\][ \t]+([\s\S]*)$/);
      if (tm) {
        taskChecked = tm[1].toLowerCase() === 'x';
        itemLines[firstIdx] = tm[2];
        hasTask = true;
      }
    }
    let inner = parseBlocks(itemLines, refs, opts);
    if (!loose) {
      // tight list: unwrap top-level single paragraphs
      inner = inner.replace(/<p>([\s\S]*?)<\/p>\n/g, '$1\n');
    }
    inner = inner.replace(/\n+$/, '');
    if (taskChecked !== null) {
      const box = '<input type="checkbox" disabled' + (taskChecked ? ' checked' : '') + '> ';
      html += '<li class="task-list-item">' + box + inner + '</li>\n';
    } else {
      html += '<li>' + (inner.includes('\n') ? '\n' + inner + '\n' : inner) + '</li>\n';
    }
  }

  html += ordered ? '</ol>\n' : '</ul>\n';
  if (hasTask) {
    html = html.replace(ordered ? '<ol' : '<ul',
      (ordered ? '<ol' : '<ul') + ' class="contains-task-list"');
  }
  return { html, end: i };
}

function parseTable(lines, start, refs, opts) {
  opts = opts || {};
  const n = lines.length;
  const header = splitTableRow(lines[start]);
  const aligns = splitTableRow(lines[start + 1]).map((cell) => {
    const c = cell.trim();
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  let i = start + 2;
  const rows = [];
  while (i < n) {
    const l = lines[i];
    if (isBlank(l) || !l.includes('|') || isBlockStart(lines, i)) break;
    rows.push(splitTableRow(l));
    i++;
  }

  const cols = header.length;
  const styleFor = (idx) => (aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : '');

  let html = '<table>\n<thead>\n<tr>\n';
  for (let c = 0; c < cols; c++) {
    html += '<th' + styleFor(c) + '>' + parseInline(header[c] || '', refs, opts) + '</th>\n';
  }
  html += '</tr>\n</thead>\n<tbody>\n';
  for (const row of rows) {
    html += '<tr>\n';
    for (let c = 0; c < cols; c++) {
      html += '<td' + styleFor(c) + '>' + parseInline(row[c] || '', refs, opts) + '</td>\n';
    }
    html += '</tr>\n';
  }
  html += '</tbody>\n</table>\n';
  return { html, end: i };
}

// =====================================================================
// Preprocessing + top-level entry point
// =====================================================================

function expandLeadingTabs(line) {
  let out = '';
  let col = 0;
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    if (line[i] === '\t') { const add = 4 - (col % 4); out += ' '.repeat(add); col += add; }
    else { out += ' '; col++; }
    i++;
  }
  return out + line.slice(i);
}

// Pull "[label]: url \"title\"" reference definitions out of the line
// stream; return the map plus the remaining lines.
function extractRefs(lines) {
  const refs = {};
  const kept = [];
  const re = /^ {0,3}\[([^\]]+)\]:[ \t]*(\S+)(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const key = refKey(m[1]);
      if (!(key in refs)) {
        refs[key] = { url: m[2].replace(/^<|>$/g, ''), title: m[3] ?? m[4] ?? m[5] ?? '' };
      }
      continue;
    }
    kept.push(line);
  }
  return { refs, lines: kept };
}

// Collapse runs of blank lines between blocks to a single newline, but NEVER inside a
// <pre>...</pre> region \u2014 code blocks preserve their interior blank lines verbatim (#1014-C).
function collapseBlankLinesOutsidePre(html) {
  // Odd-indexed parts are the captured <pre>...</pre> chunks (left untouched).
  return html
    .split(/(<pre[\s\S]*?<\/pre>)/)
    .map((part, idx) => (idx % 2 === 1 ? part : part.replace(/\n{2,}/g, '\n')))
    .join('');
}

function mdToHtml(src, opts) {
  opts = opts || {};
  const normalized = String(src ?? '').replace(/\uE000/g, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').map(expandLeadingTabs);
  const { refs, lines: kept } = extractRefs(lines);
  const html = collapseBlankLinesOutsidePre(parseBlocks(kept, refs, opts)).trim();
  return html ? html + '\n' : '';
}

export {
  mdToHtml,
  parseInline,
  escapeHtmlForMarkdown,
  escapeAttrForMarkdown,
  sanitizeUrl,
};
// ===== end jbcMarkdown (ES module) =====
