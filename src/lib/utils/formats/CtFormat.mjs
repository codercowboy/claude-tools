// ===== Begin jbcFormat (ES module) =====
/*
 * jbcFormat — structured-data format conversion engine
 * (JSON / CSV / TSV / YAML / .properties / XML).
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module. Each supported format has a
 * parse<Source>(text, opts) -> plain JS value (objects, arrays, strings,
 * numbers, booleans, null) and an emit<Target>(model, opts) -> text; a small
 * PARSERS/EMITTERS registry plus convert(text, from, to, opts) drive the
 * round-trips, and detectFormat(text) auto-detects the source format. YAML and
 * XML use practical hand-written parsers/emitters (a documented subset), so the
 * module carries no runtime dependency. FORMATS is the format registry
 * (id + label) a consuming UI can build its selects from.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs format conversion
 * imports this module directly (so `node --test` can load it); the single-file
 * build inlines this module body into the shipped index.html — stripping each
 * `export` — so the shipped tool stays dependency-free and file://-openable.
 * See the consuming repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// Format metadata for the UI selects.
const FORMATS = [
  { id: 'json', label: 'JSON' },
  { id: 'csv', label: 'CSV' },
  { id: 'tsv', label: 'TSV' },
  { id: 'yaml', label: 'YAML' },
  { id: 'properties', label: '.properties' },
  { id: 'xml', label: 'XML' },
];

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function convertError(msg) {
  return new Error(msg);
}

// Flatten a nested model into [dottedKey, primitiveValue] pairs.
function flattenPairs(value, prefix, out) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix !== '') out.push([prefix, '']);
      return out;
    }
    value.forEach((item, i) => {
      const key = prefix === '' ? String(i) : `${prefix}.${i}`;
      flattenPairs(item, key, out);
    });
  } else if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      if (prefix !== '') out.push([prefix, '']);
      return out;
    }
    for (const k of keys) {
      const key = prefix === '' ? k : `${prefix}.${k}`;
      flattenPairs(value[k], key, out);
    }
  } else {
    out.push([prefix === '' ? '_' : prefix, scalarToString(value)]);
  }
  return out;
}

function scalarToString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

// Un-flatten dotted-key pairs into a nested object/array model.
function unflattenPairs(pairs) {
  const root = {};
  for (const [key, value] of pairs) {
    const segments = key.split('.');
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const last = i === segments.length - 1;
      if (last) {
        node[seg] = value;
      } else {
        if (!isPlainObject(node[seg])) node[seg] = {};
        node = node[seg];
      }
    }
  }
  return arraifyIntegerKeys(root);
}

// Recursively convert objects whose keys are exactly 0..n-1 into arrays.
function arraifyIntegerKeys(node) {
  if (!isPlainObject(node)) return node;
  const keys = Object.keys(node);
  for (const k of keys) node[k] = arraifyIntegerKeys(node[k]);
  if (keys.length === 0) return node;
  const allInts = keys.every((k) => /^(0|[1-9]\d*)$/.test(k));
  if (allInts) {
    const nums = keys.map(Number).sort((a, b) => a - b);
    if (nums[0] === 0 && nums[nums.length - 1] === nums.length - 1) {
      const arr = [];
      for (const n of nums) arr[n] = node[String(n)];
      return arr;
    }
  }
  return node;
}

// ---------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------
function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw convertError(`Invalid JSON: ${err.message}`);
  }
}

function emitJSON(model, opts = {}) {
  const indent = normalizeIndent(opts.indent, 2);
  try {
    return JSON.stringify(model, null, indent);
  } catch (err) {
    throw convertError(`Could not emit JSON: ${err.message}`);
  }
}

function normalizeIndent(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 8) return Math.floor(n);
  return fallback;
}

// ---------------------------------------------------------------------
// CSV / TSV  (tabular <-> array of row objects)
// ---------------------------------------------------------------------
// RFC-4180-ish parser: quoted fields with embedded delimiter/newline/quote.
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false; // any char seen on the current record
  let quoted = false;  // current record contained a quote char (so an empty field is explicit)
  const rowsQuoted = []; // per-row: did it contain a quote?
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    started = true;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true; quoted = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); rowsQuoted.push(quoted); row = [];
      started = false; quoted = false;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw convertError('Unterminated quoted field in delimited input.');
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row); rowsQuoted.push(quoted);
  }
  // Drop a single trailing empty record that came from the file's final newline — but NOT one whose
  // lone field was an explicit quoted empty (`""`), which is a real single-column empty value (#1014-J).
  const last = rows.length - 1;
  if (last >= 0 && rows[last].length === 1 && rows[last][0] === '' && !rowsQuoted[last]) {
    rows.pop();
  }
  return rows;
}

function parseCSV(text, opts = {}) {
  const delimiter = typeof opts.delimiter === 'string' && opts.delimiter.length
    ? opts.delimiter : ',';
  const header = opts.header !== false;
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return [];
  if (!header) return rows;
  const headers = rows[0];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rows[r][c] !== undefined ? rows[r][c] : '';
    }
    out.push(obj);
  }
  return out;
}

function parseTSV(text, opts = {}) {
  return parseCSV(text, { ...opts, delimiter: '\t' });
}

function needsQuoting(value, delimiter) {
  return value.includes(delimiter) || value.includes('"') ||
    value.includes('\n') || value.includes('\r');
}

function csvCell(value, delimiter) {
  let s;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (needsQuoting(s, delimiter)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Join already-formatted cells for one record. A record that is a single empty cell is emitted as
// `""` so it survives the round-trip — an unquoted empty line parses as a dropped blank row (#1014-J).
function joinRow(cells, delimiter) {
  if (cells.length === 1 && cells[0] === '') return '""';
  return cells.join(delimiter);
}

function emitCSV(model, opts = {}) {
  const delimiter = typeof opts.delimiter === 'string' && opts.delimiter.length
    ? opts.delimiter : ',';
  const header = opts.header !== false;

  // Normalize the model into a list of rows.
  let records = model;
  if (isPlainObject(model)) records = [model];
  if (!Array.isArray(records)) {
    throw convertError('CSV/TSV output needs a tabular model: an array of rows (records), not a single value.');
  }
  if (records.length === 0) return '';

  // Array of arrays -> emit as-is (optionally with the first row as header).
  if (records.every((r) => Array.isArray(r))) {
    return records.map((r) => joinRow(r.map((c) => csvCell(c, delimiter)), delimiter)).join('\n');
  }

  // Array of primitives -> single "value" column.
  if (records.every((r) => r === null || typeof r !== 'object')) {
    const lines = [];
    if (header) lines.push(joinRow([csvCell('value', delimiter)], delimiter));
    for (const r of records) lines.push(joinRow([csvCell(r, delimiter)], delimiter));
    return lines.join('\n');
  }

  // Array of objects -> columns = union of keys in first-seen order.
  if (!records.every((r) => isPlainObject(r))) {
    throw convertError('CSV/TSV output needs uniform records: an array of objects (or of arrays, or of primitives).');
  }
  const columns = [];
  const seen = new Set();
  for (const rec of records) {
    for (const k of Object.keys(rec)) {
      if (!seen.has(k)) { seen.add(k); columns.push(k); }
    }
  }
  const lines = [];
  if (header) lines.push(joinRow(columns.map((c) => csvCell(c, delimiter)), delimiter));
  for (const rec of records) {
    lines.push(joinRow(columns.map((c) => csvCell(rec[c], delimiter)), delimiter));
  }
  return lines.join('\n');
}

function emitTSV(model, opts = {}) {
  return emitCSV(model, { ...opts, delimiter: '\t' });
}

// ---------------------------------------------------------------------
// .properties  (flat dotted keys <-> nested model)
// ---------------------------------------------------------------------
function parseProperties(text) {
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = src.split('\n');
  const logical = [];
  // Join continuation lines (odd number of trailing backslashes).
  let buffer = null;
  for (let line of rawLines) {
    let l = buffer !== null ? line.replace(/^\s+/, '') : line;
    if (buffer !== null) l = buffer + l, buffer = null;
    // Skip comments/blank only when not continuing.
    const trimmedStart = l.replace(/^\s+/, '');
    if (buffer === null && (trimmedStart === '' || trimmedStart[0] === '#' || trimmedStart[0] === '!')) {
      continue;
    }
    if (endsWithOddBackslash(l)) {
      buffer = l.replace(/\\$/, '');
      continue;
    }
    logical.push(l);
  }
  if (buffer !== null) logical.push(buffer);

  const pairs = [];
  for (const line of logical) {
    const trimmed = line.replace(/^\s+/, '');
    if (trimmed === '' || trimmed[0] === '#' || trimmed[0] === '!') continue;
    const { key, value } = splitPropertyLine(trimmed);
    pairs.push([unescapeProperties(key), unescapeProperties(value)]);
  }
  return unflattenPairs(pairs);
}

function endsWithOddBackslash(s) {
  let count = 0;
  for (let i = s.length - 1; i >= 0 && s[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function splitPropertyLine(line) {
  // Find first unescaped '=', ':', or whitespace as the key/value separator.
  let i = 0;
  let key = '';
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') { key += ch + (line[i + 1] || ''); i += 2; continue; }
    if (ch === '=' || ch === ':') { i++; break; }
    if (ch === ' ' || ch === '\t' || ch === '\f') {
      // whitespace separator: consume trailing whitespace + optional =/:
      while (i < line.length && (line[i] === ' ' || line[i] === '\t' || line[i] === '\f')) i++;
      if (line[i] === '=' || line[i] === ':') {
        i++;
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
      }
      break;
    }
    key += ch; i++;
  }
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return { key: key.trim(), value: line.slice(i) };
}

function unescapeProperties(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = s[i + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
        continue;
      }
      out += 'u'; i += 1; continue;
    }
    const map = { n: '\n', t: '\t', r: '\r', f: '\f' };
    out += map[next] !== undefined ? map[next] : next;
    i += 1;
  }
  return out;
}

function escapePropertyKey(s) {
  let out = '';
  for (const ch of s) {
    if (ch === '\\' || ch === '=' || ch === ':' || ch === ' ' || ch === '\t') out += '\\' + ch;
    else out += escapeControl(ch);
  }
  return out;
}

function escapePropertyValue(s, escapeUnicode) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\f') out += '\\f';
    else if (ch === ' ' && i === 0) out += '\\ ';
    else if (escapeUnicode && ch.charCodeAt(0) > 0x7e) out += unicodeEscape(ch);
    else out += ch;
  }
  return out;
}

function escapeControl(ch) {
  if (ch === '\n') return '\\n';
  if (ch === '\t') return '\\t';
  if (ch === '\r') return '\\r';
  if (ch === '\f') return '\\f';
  return ch;
}

function unicodeEscape(ch) {
  return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
}

function emitProperties(model, opts = {}) {
  const escapeUnicode = opts.escapeUnicode === true;
  const pairs = flattenPairs(model, '', []);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs
    .map(([k, v]) => `${escapePropertyKey(k)}=${escapePropertyValue(scalarToString(v), escapeUnicode)}`)
    .join('\n');
}

// ---------------------------------------------------------------------
// XML  (element/attribute/text convention)
// ---------------------------------------------------------------------
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    return named[body] !== undefined ? named[body] : m;
  });
}

function encodeEntities(s, isAttr) {
  let out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (isAttr) out = out.replace(/"/g, '&quot;');
  return out;
}

// Tokenize + build an element tree.
function parseXML(text) {
  const src = text;
  let i = 0;
  const len = src.length;

  function skipMisc() {
    while (i < len) {
      if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i); if (e < 0) throw convertError('XML: unterminated processing instruction.'); i = e + 2; }
      else if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); if (e < 0) throw convertError('XML: unterminated comment.'); i = e + 3; }
      else if (src.startsWith('<!', i)) { const e = src.indexOf('>', i); if (e < 0) throw convertError('XML: unterminated declaration.'); i = e + 1; }
      else if (/\s/.test(src[i])) i++;
      else break;
    }
  }

  function parseElement() {
    if (src[i] !== '<') throw convertError('XML: expected an element.');
    i++; // consume '<'
    const name = readName();
    if (!name) throw convertError('XML: malformed opening tag.');
    const attrs = {};
    // attributes
    while (i < len) {
      skipWs();
      if (src[i] === '/' || src[i] === '>') break;
      const attrName = readName();
      if (!attrName) throw convertError(`XML: malformed attribute in <${name}>.`);
      skipWs();
      if (src[i] !== '=') throw convertError(`XML: attribute "${attrName}" is missing a value.`);
      i++; skipWs();
      const q = src[i];
      if (q !== '"' && q !== "'") throw convertError(`XML: attribute "${attrName}" value must be quoted.`);
      i++;
      const end = src.indexOf(q, i);
      if (end < 0) throw convertError(`XML: unterminated attribute value for "${attrName}".`);
      attrs[attrName] = decodeEntities(src.slice(i, end));
      i = end + 1;
    }
    if (src[i] === '/') {
      i++;
      if (src[i] !== '>') throw convertError(`XML: malformed self-closing tag <${name}>.`);
      i++;
      return { name, attrs, children: [], text: '' };
    }
    if (src[i] !== '>') throw convertError(`XML: malformed tag <${name}>.`);
    i++;
    // content
    const children = [];
    let text = '';
    while (i < len) {
      if (src.startsWith('</', i)) {
        i += 2;
        const closeName = readName();
        skipWs();
        if (src[i] !== '>') throw convertError(`XML: malformed closing tag </${closeName}>.`);
        i++;
        if (closeName !== name) throw convertError(`XML: mismatched closing tag </${closeName}> (expected </${name}>).`);
        return { name, attrs, children, text: text.trim() };
      }
      if (src.startsWith('<![CDATA[', i)) {
        const e = src.indexOf(']]>', i);
        if (e < 0) throw convertError('XML: unterminated CDATA section.');
        text += src.slice(i + 9, e);
        i = e + 3;
      } else if (src.startsWith('<!--', i)) {
        const e = src.indexOf('-->', i);
        if (e < 0) throw convertError('XML: unterminated comment.');
        i = e + 3;
      } else if (src.startsWith('<?', i)) {
        const e = src.indexOf('?>', i);
        if (e < 0) throw convertError('XML: unterminated processing instruction.');
        i = e + 2;
      } else if (src[i] === '<') {
        children.push(parseElement());
      } else {
        const nextLt = src.indexOf('<', i);
        const chunk = nextLt < 0 ? src.slice(i) : src.slice(i, nextLt);
        text += decodeEntities(chunk);
        i = nextLt < 0 ? len : nextLt;
      }
    }
    throw convertError(`XML: element <${name}> is never closed.`);
  }

  function readName() {
    const start = i;
    while (i < len && /[^\s/>=]/.test(src[i])) i++;
    return src.slice(start, i);
  }
  function skipWs() { while (i < len && /\s/.test(src[i])) i++; }

  skipMisc();
  if (i >= len || src[i] !== '<') throw convertError('XML: no root element found.');
  const root = parseElement();
  skipMisc();
  return { [root.name]: elementToModel(root) };
}

function elementToModel(el) {
  const attrKeys = Object.keys(el.attrs);
  const hasAttrs = attrKeys.length > 0;
  const hasChildren = el.children.length > 0;

  if (!hasAttrs && !hasChildren) {
    return el.text; // pure text (or '')
  }

  const obj = {};
  for (const k of attrKeys) obj['@' + k] = el.attrs[k];

  // Group children by tag; repeated tags become arrays.
  for (const child of el.children) {
    const value = elementToModel(child);
    if (Object.prototype.hasOwnProperty.call(obj, child.name)) {
      if (!Array.isArray(obj[child.name])) obj[child.name] = [obj[child.name]];
      obj[child.name].push(value);
    } else {
      obj[child.name] = value;
    }
  }
  if (el.text) obj['#text'] = el.text;
  return obj;
}

function emitXML(model, opts = {}) {
  const declaration = opts.declaration !== false;
  const attributesStrategy = opts.attributes === true;
  const indentStr = ' '.repeat(normalizeIndent(opts.indent, 2));

  // Choose a root: an explicit non-default rootName wins; otherwise, if the
  // model is a single-key object, use that key (so parseXML round-trips).
  let rootName = typeof opts.rootName === 'string' && opts.rootName.trim() ? opts.rootName.trim() : '';
  let content = model;
  if (!rootName) {
    if (isPlainObject(model) && Object.keys(model).length === 1) {
      rootName = Object.keys(model)[0];
      content = model[rootName];
    } else {
      rootName = 'root';
    }
  }
  if (!isValidXMLName(rootName)) throw convertError(`XML: "${rootName}" is not a valid element name.`);

  const lines = [];
  if (declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  renderXMLElement(rootName, content, 0);
  return lines.join('\n');

  function renderXMLElement(name, value, depth) {
    const pad = indentStr.repeat(depth);
    if (Array.isArray(value)) {
      for (const item of value) renderXMLElement(name, item, depth);
      return;
    }
    if (!isPlainObject(value)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (text === '') lines.push(`${pad}<${name}/>`);
      else lines.push(`${pad}<${name}>${encodeEntities(text, false)}</${name}>`);
      return;
    }
    // object: split attributes / text / child elements
    const attrParts = [];
    const childEntries = [];
    let textContent = null;
    for (const [k, v] of Object.entries(value)) {
      if (k === '#text') { textContent = v; continue; }
      if (k[0] === '@') {
        attrParts.push(`${k.slice(1)}="${encodeEntities(scalarToString(v), true)}"`);
        continue;
      }
      const isPrimitive = v === null || typeof v !== 'object';
      if (attributesStrategy && isPrimitive) {
        attrParts.push(`${k}="${encodeEntities(scalarToString(v), true)}"`);
      } else {
        childEntries.push([k, v]);
      }
    }
    const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';
    const hasText = textContent !== null && textContent !== undefined && String(textContent) !== '';
    if (childEntries.length === 0 && !hasText) {
      lines.push(`${pad}<${name}${attrStr}/>`);
      return;
    }
    if (childEntries.length === 0 && hasText) {
      lines.push(`${pad}<${name}${attrStr}>${encodeEntities(String(textContent), false)}</${name}>`);
      return;
    }
    lines.push(`${pad}<${name}${attrStr}>`);
    for (const [k, v] of childEntries) renderXMLElement(k, v, depth + 1);
    if (hasText) lines.push(`${indentStr.repeat(depth + 1)}${encodeEntities(String(textContent), false)}`);
    lines.push(`${pad}</${name}>`);
  }
}

function isValidXMLName(name) {
  return /^[A-Za-z_:][A-Za-z0-9._:-]*$/.test(name);
}

// ---------------------------------------------------------------------
// YAML  (practical subset)
// ---------------------------------------------------------------------
function parseYAML(text) {
  if (typeof text !== 'string') throw convertError('YAML input must be text.');
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = src.split('\n');
  const lines = [];
  let docCount = 0;
  for (const raw of rawLines) {
    const stripped = stripYAMLComment(raw);
    const trimmed = stripped.trim();
    if (trimmed === '') continue;
    if (trimmed === '---') { docCount++; if (docCount > 1) throw convertError('YAML: multiple documents are not supported.'); continue; }
    if (trimmed === '...') continue;
    if (/^\t/.test(raw) || /^ *\t/.test(raw.slice(0, raw.length - raw.trimStart().length))) {
      throw convertError('YAML: tabs are not allowed for indentation (use spaces).');
    }
    const indent = stripped.length - stripped.trimStart().length;
    const content = stripped.trim();
    // Reject unsupported constructs loudly.
    rejectUnsupportedYAML(content);
    lines.push({ indent, content });
  }
  if (lines.length === 0) return null;
  const [value] = parseYAMLBlock(lines, 0, lines[0].indent);
  return value;
}

function rejectUnsupportedYAML(content) {
  if (/^<<\s*:/.test(content)) throw convertError('YAML: merge keys (<<) are not supported.');
  if (/^\?\s/.test(content)) throw convertError('YAML: complex mapping keys (?) are not supported.');
  // anchors/aliases/tags detected at value position in scalar parse; a bare
  // alias line is caught here.
  if (/^\*[\w-]+\s*$/.test(content)) throw convertError('YAML: aliases (*) are not supported.');
}

function stripYAMLComment(line) {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function isYAMLSeqEntry(content) {
  return content === '-' || content.startsWith('- ');
}

function isYAMLMapEntry(content) {
  if (isYAMLSeqEntry(content)) return false;
  return splitYAMLKey(content) !== null;
}

// Split "key: value" (colon at end or followed by space), respecting quotes.
function splitYAMLKey(content) {
  let inSingle = false, inDouble = false, inFlow = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') inFlow++;
      else if (ch === ']' || ch === '}') inFlow--;
      else if (ch === ':' && inFlow === 0) {
        const next = content[i + 1];
        if (next === undefined || next === ' ' || next === '\t') {
          const key = content.slice(0, i).trim();
          const rest = content.slice(i + 1).trim();
          return { key: parseYAMLScalar(key, true), rest };
        }
      }
    }
  }
  return null;
}

function parseYAMLBlock(lines, i, indent) {
  if (i >= lines.length) return [null, i];
  if (isYAMLSeqEntry(lines[i].content)) return parseYAMLSequence(lines, i, indent);
  if (isYAMLMapEntry(lines[i].content)) return parseYAMLMapping(lines, i, indent);
  // Neither a mapping nor a sequence at this level: a bare scalar or a flow
  // collection ([ … ] / { … }) standing on its own (a top-level scalar
  // document, or a value written on the line below its key). Without this the
  // block would fall through to an empty mapping and the value would be lost.
  return [parseYAMLScalar(lines[i].content, false), i + 1];
}

function parseYAMLSequence(lines, i, indent) {
  const arr = [];
  while (i < lines.length && lines[i].indent === indent && isYAMLSeqEntry(lines[i].content)) {
    const rest = lines[i].content === '-' ? '' : lines[i].content.slice(2).trim();
    if (rest === '') {
      const j = i + 1;
      if (j < lines.length && lines[j].indent > indent) {
        const [v, ni] = parseYAMLBlock(lines, j, lines[j].indent);
        arr.push(v); i = ni;
      } else { arr.push(null); i = j; }
    } else if (isBlockScalarIndicator(rest)) {
      const [v, ni] = parseYAMLBlockScalar(lines, i + 1, indent, rest);
      arr.push(v); i = ni;
    } else if (isYAMLMapEntry(rest)) {
      // inline map as a sequence item; its keys align at indent+2.
      const childIndent = indent + 2;
      lines[i] = { indent: childIndent, content: rest };
      const [v, ni] = parseYAMLMapping(lines, i, childIndent);
      arr.push(v); i = ni;
    } else {
      arr.push(parseYAMLScalar(rest, false));
      i++;
    }
  }
  return [arr, i];
}

function parseYAMLMapping(lines, i, indent) {
  const obj = {};
  while (i < lines.length && lines[i].indent === indent && isYAMLMapEntry(lines[i].content)) {
    const split = splitYAMLKey(lines[i].content);
    const key = String(split.key);
    const rest = split.rest;
    if (rest === '') {
      const j = i + 1;
      if (j < lines.length && (lines[j].indent > indent ||
          (lines[j].indent === indent && isYAMLSeqEntry(lines[j].content)))) {
        const childIndent = lines[j].indent;
        const [v, ni] = parseYAMLBlock(lines, j, childIndent);
        obj[key] = v; i = ni;
      } else { obj[key] = null; i = j; }
    } else if (isBlockScalarIndicator(rest)) {
      const [v, ni] = parseYAMLBlockScalar(lines, i + 1, indent, rest);
      obj[key] = v; i = ni;
    } else {
      obj[key] = parseYAMLScalar(rest, false);
      i++;
    }
  }
  return [obj, i];
}

function isBlockScalarIndicator(s) {
  return /^[|>][-+]?\d*\s*$/.test(s);
}

function parseYAMLBlockScalar(lines, i, parentIndent, indicator) {
  const folded = indicator[0] === '>';
  const chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
  const collected = [];
  let blockIndent = null;
  while (i < lines.length && lines[i].indent > parentIndent) {
    if (blockIndent === null) blockIndent = lines[i].indent;
    collected.push(' '.repeat(lines[i].indent - blockIndent) + lines[i].content);
    i++;
  }
  let value;
  if (folded) value = collected.join(' ');
  else value = collected.join('\n');
  if (chomp === 'strip') value = value.replace(/\n+$/, '');
  else if (chomp === 'clip' && collected.length) value = value + '\n';
  return [value, i];
}

// Parse a scalar or flow collection. isKey suppresses type inference.
function parseYAMLScalar(s, isKey) {
  const t = s.trim();
  if (t === '') return isKey ? '' : null;
  if (t[0] === '[' || t[0] === '{') return parseYAMLFlow(t);
  if (t[0] === '"') return parseYAMLDoubleQuoted(t);
  if (t[0] === "'") return parseYAMLSingleQuoted(t);
  if (!isKey) {
    if (t[0] === '&') throw convertError('YAML: anchors (&) are not supported.');
    if (t[0] === '*') throw convertError('YAML: aliases (*) are not supported.');
    if (t[0] === '!') throw convertError('YAML: tags (!) are not supported.');
  }
  if (isKey) return t;
  return inferYAMLScalar(t);
}

function inferYAMLScalar(t) {
  if (t === 'null' || t === '~' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (/^[-+]?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t) && /[.eE]/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return t;
}

function parseYAMLDoubleQuoted(t) {
  if (t[t.length - 1] !== '"' || t.length < 2) throw convertError('YAML: unterminated double-quoted string.');
  const inner = t.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = inner[i + 1];
    const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', b: '\b', f: '\f' };
    if (next === 'u') {
      const hex = inner.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 5; continue; }
    }
    out += map[next] !== undefined ? map[next] : next;
    i += 1;
  }
  return out;
}

function parseYAMLSingleQuoted(t) {
  if (t[t.length - 1] !== "'" || t.length < 2) throw convertError('YAML: unterminated single-quoted string.');
  return t.slice(1, -1).replace(/''/g, "'");
}

// Minimal flow-collection parser for [ ... ] and { ... }.
function parseYAMLFlow(s) {
  let i = 0;
  const parsed = parseFlowValue();
  skipFlowWs();
  if (i < s.length) throw convertError('YAML: could not parse flow collection.');
  return parsed;

  function skipFlowWs() { while (i < s.length && /\s/.test(s[i])) i++; }

  function parseFlowValue() {
    skipFlowWs();
    const ch = s[i];
    if (ch === '[') return parseFlowSeq();
    if (ch === '{') return parseFlowMap();
    if (ch === '"' || ch === "'") return parseFlowQuoted();
    return parseFlowScalar();
  }

  function parseFlowSeq() {
    i++; // [
    const arr = [];
    skipFlowWs();
    if (s[i] === ']') { i++; return arr; }
    while (i < s.length) {
      arr.push(parseFlowValue());
      skipFlowWs();
      if (s[i] === ',') { i++; skipFlowWs(); if (s[i] === ']') { i++; return arr; } continue; }
      if (s[i] === ']') { i++; return arr; }
      throw convertError('YAML: malformed flow sequence.');
    }
    throw convertError('YAML: unterminated flow sequence.');
  }

  function parseFlowMap() {
    i++; // {
    const obj = {};
    skipFlowWs();
    if (s[i] === '}') { i++; return obj; }
    while (i < s.length) {
      skipFlowWs();
      const key = (s[i] === '"' || s[i] === "'") ? parseFlowQuoted() : parseFlowMapKey();
      skipFlowWs();
      if (s[i] !== ':') throw convertError('YAML: flow mapping key missing ":".');
      i++;
      obj[String(key)] = parseFlowValue();
      skipFlowWs();
      if (s[i] === ',') { i++; skipFlowWs(); if (s[i] === '}') { i++; return obj; } continue; }
      if (s[i] === '}') { i++; return obj; }
      throw convertError('YAML: malformed flow mapping.');
    }
    throw convertError('YAML: unterminated flow mapping.');
  }

  function parseFlowQuoted() {
    const q = s[i];
    let j = i + 1, out = '';
    if (q === "'") {
      while (j < s.length) {
        if (s[j] === "'") { if (s[j + 1] === "'") { out += "'"; j += 2; continue; } break; }
        out += s[j]; j++;
      }
      if (s[j] !== "'") throw convertError('YAML: unterminated quoted string in flow.');
      i = j + 1; return out;
    }
    while (j < s.length && s[j] !== '"') {
      if (s[j] === '\\') { out += s[j] + (s[j + 1] || ''); j += 2; continue; }
      out += s[j]; j++;
    }
    if (s[j] !== '"') throw convertError('YAML: unterminated quoted string in flow.');
    i = j + 1;
    return parseYAMLDoubleQuoted('"' + out + '"');
  }

  function parseFlowScalar() {
    const start = i;
    while (i < s.length && !',[]{}:'.includes(s[i])) i++;
    return inferYAMLScalar(s.slice(start, i).trim());
  }
  function parseFlowMapKey() {
    const start = i;
    while (i < s.length && s[i] !== ':' && !',[]{}'.includes(s[i])) i++;
    return s.slice(start, i).trim();
  }
}

// ---- YAML emit ----
function emitYAML(model, opts = {}) {
  const indent = normalizeIndent(opts.indent, 2) || 2;
  const lines = [];
  emitYAMLValue(model, 0, lines, indent);
  return lines.join('\n');
}

function emitYAMLValue(value, depth, lines, indent) {
  const pad = ' '.repeat(depth * indent);
  if (Array.isArray(value)) {
    if (value.length === 0) { lines.push(`${pad}[]`); return; }
    for (const item of value) {
      if (isPlainObject(item) && Object.keys(item).length > 0) {
        lines.push(`${pad}-`);
        emitYAMLValue(item, depth + 1, lines, indent);
      } else if (Array.isArray(item) && item.length > 0) {
        lines.push(`${pad}-`);
        emitYAMLValue(item, depth + 1, lines, indent);
      } else {
        lines.push(`${pad}- ${emitYAMLScalar(item)}`);
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) { lines.push(`${pad}{}`); return; }
    for (const k of keys) {
      const v = value[k];
      const keyStr = emitYAMLKey(k);
      if ((isPlainObject(v) && Object.keys(v).length > 0) ||
          (Array.isArray(v) && v.length > 0)) {
        lines.push(`${pad}${keyStr}:`);
        emitYAMLValue(v, depth + 1, lines, indent);
      } else {
        lines.push(`${pad}${keyStr}: ${emitYAMLScalar(v)}`);
      }
    }
    return;
  }
  // top-level scalar
  lines.push(`${pad}${emitYAMLScalar(value)}`);
}

function emitYAMLKey(k) {
  const s = String(k);
  if (yamlNeedsQuoting(s)) return JSON.stringify(s);
  return s;
}

function emitYAMLScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  if (Array.isArray(v)) return '[]';
  if (isPlainObject(v)) return '{}';
  const s = String(v);
  if (yamlNeedsQuoting(s)) return JSON.stringify(s);
  return s;
}

function yamlNeedsQuoting(s) {
  if (s === '') return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/[:#\[\]{}&*!|>'"%@`,]/.test(s)) return true;
  if (/^[-?]/.test(s)) return true;
  if (/[\n\t]/.test(s)) return true;
  // Would re-parse as a non-string scalar
  const inferred = inferYAMLScalar(s);
  if (typeof inferred !== 'string') return true;
  return false;
}

// ---------------------------------------------------------------------
// Auto-detect
// ---------------------------------------------------------------------
function detectFormat(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;

  if (/^<\?xml/i.test(trimmed) || /^<[A-Za-z_!]/.test(trimmed)) return 'xml';

  const first = trimmed[0];
  if (first === '{' || first === '[' || first === '"') {
    try { JSON.parse(trimmed); return 'json'; } catch { /* fall through */ }
  }

  const lines = trimmed.split('\n').filter((l) => {
    const t = l.trim();
    return t !== '' && t[0] !== '#' && t[0] !== '!';
  });
  if (lines.length === 0) return null;

  // TSV: a tab in the first line, consistent-ish columns.
  if (lines[0].includes('\t')) return 'tsv';

  // Count signal lines for properties vs yaml.
  let eqLines = 0, mapLines = 0, seqLines = 0, commaLines = 0;
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith('- ') || t === '-') { seqLines++; continue; }
    if (/^[^:=\s][^=]*=/.test(t)) eqLines++;
    if (/^[^:#]+:(\s|$)/.test(t)) mapLines++;
    if (l.includes(',')) commaLines++;
  }
  if (/^---/.test(trimmed) || seqLines > 0) return 'yaml';
  if (eqLines > mapLines && eqLines > 0) return 'properties';
  if (mapLines > 0) return 'yaml';
  // A line starting with `[` or `{` is a JSON/flow structure, never a CSV record — don't let
  // truncated JSON (e.g. `[1,`) fall through to the comma heuristic and parse to a silent [] (#1014-M).
  if (commaLines === lines.length && lines[0].includes(',') && first !== '[' && first !== '{') return 'csv';
  if (eqLines > 0) return 'properties';
  return null;
}

// ---------------------------------------------------------------------
// Top-level convert
// ---------------------------------------------------------------------
const PARSERS = {
  json: (t) => parseJSON(t),
  csv: (t, o) => parseCSV(t, o.csv || {}),
  tsv: (t, o) => parseTSV(t, o.tsv || {}),
  yaml: (t) => parseYAML(t),
  properties: (t) => parseProperties(t),
  xml: (t) => parseXML(t),
};
const EMITTERS = {
  json: (m, o) => emitJSON(m, o.json || {}),
  csv: (m, o) => emitCSV(m, o.csv || {}),
  tsv: (m, o) => emitTSV(m, o.tsv || {}),
  yaml: (m, o) => emitYAML(m, o.yaml || {}),
  properties: (m, o) => emitProperties(m, o.properties || {}),
  xml: (m, o) => emitXML(m, o.xml || {}),
};

function convert(text, from, to, opts = {}) {
  let source = from;
  if (from === 'auto') {
    source = detectFormat(text);
    if (!source) throw convertError('Could not auto-detect the input format — pick a source format.');
  }
  const parser = PARSERS[source];
  if (!parser) throw convertError(`Unknown source format: ${source}`);
  const emitter = EMITTERS[to];
  if (!emitter) throw convertError(`Unknown target format: ${to}`);
  const model = parser(text, opts);
  return { output: emitter(model, opts), detected: source, model };
}

export {
  FORMATS,
  parseJSON, emitJSON,
  parseYAML, emitYAML,
  parseCSV, emitCSV,
  parseTSV, emitTSV,
  parseProperties, emitProperties,
  parseXML, emitXML,
  detectFormat,
  convert,
};
