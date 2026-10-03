// ===== Begin jbcCurl (ES module) =====
/*
 * jbcCurl — HTTP-request model, curl/wget command parser, and multi-language
 * code emitter.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module. A POSIX-ish shell tokenizer
 * (tokenizeShell) feeds curl/wget command parsers (parseCurl, parseWget) that
 * normalise a command line into a request model; builders regenerate curl and
 * wget commands (buildCurl, buildWget); and converters emit equivalent code for
 * fetch, Node, Python requests, HTTPie, PowerShell, and Go (toFetch/…/convert).
 * Every function is TOTAL — bad input yields a best-effort result plus a note,
 * never a throw; no eval. Runs on Web-platform globals present in Node 20+
 * (TextEncoder/TextDecoder, btoa/atob) as well as the browser.
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

// ============================================================
// 1. Constants
// ============================================================
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const AUTH_TYPES = ['none', 'basic', 'bearer'];
const BODY_TYPES = ['none', 'raw', 'json', 'form', 'multipart'];
const CONVERT_LANGS = ['fetch', 'node', 'python', 'httpie', 'powershell', 'go'];

// ============================================================
// 2. Model helpers
// ============================================================
function emptyModel() {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none', user: '', pass: '', token: '' },
    body: { type: 'none', raw: '', fields: [], urlencode: false },
    flags: {
      followRedirects: false,
      insecure: false,
      compressed: false,
      timeout: null,
      userAgent: '',
      referer: '',
    },
  };
}

function str(v) { return v == null ? '' : String(v); }

function normalizeModel(raw) {
  const m = emptyModel();
  if (!raw || typeof raw !== 'object') return m;

  if (typeof raw.method === 'string' && raw.method.trim()) m.method = raw.method.trim().toUpperCase();
  m.url = str(raw.url);

  if (Array.isArray(raw.params)) {
    m.params = raw.params
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ key: str(p.key), value: str(p.value) }));
  }
  if (Array.isArray(raw.headers)) {
    m.headers = raw.headers
      .filter((h) => h && typeof h === 'object')
      .map((h) => ({ name: str(h.name), value: str(h.value) }));
  }
  if (raw.auth && typeof raw.auth === 'object') {
    m.auth.type = AUTH_TYPES.includes(raw.auth.type) ? raw.auth.type : 'none';
    m.auth.user = str(raw.auth.user);
    m.auth.pass = str(raw.auth.pass);
    m.auth.token = str(raw.auth.token);
  }
  if (raw.body && typeof raw.body === 'object') {
    m.body.type = BODY_TYPES.includes(raw.body.type) ? raw.body.type : 'none';
    m.body.raw = str(raw.body.raw);
    m.body.urlencode = raw.body.urlencode === true;
    if (Array.isArray(raw.body.fields)) {
      m.body.fields = raw.body.fields
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          key: str(f.key),
          value: str(f.value),
          kind: f.kind === 'file' ? 'file' : 'data',
        }));
    }
  }
  if (raw.flags && typeof raw.flags === 'object') {
    m.flags.followRedirects = raw.flags.followRedirects === true;
    m.flags.insecure = raw.flags.insecure === true;
    m.flags.compressed = raw.flags.compressed === true;
    const t = Number(raw.flags.timeout);
    m.flags.timeout = Number.isFinite(t) && t > 0 ? t : null;
    m.flags.userAgent = str(raw.flags.userAgent);
    m.flags.referer = str(raw.flags.referer);
  }
  return m;
}

// Strip in-memory-only secrets (never persisted). Returns a copy.
function modelWithoutSecrets(model) {
  const m = normalizeModel(model);
  m.auth.user = '';
  m.auth.pass = '';
  m.auth.token = '';
  return m;
}

// ------------------------------------------------------------
// URL <-> params
// ------------------------------------------------------------
function splitUrlParams(url) {
  const s = str(url);
  const qi = s.indexOf('?');
  if (qi === -1) return { base: s, params: [] };
  const base = s.slice(0, qi);
  // A URL #fragment is never sent (curl/browsers strip it), so drop it before splitting the
  // query — otherwise it rides along on the last param value and is re-encoded as %23 (#1014-I).
  let query = s.slice(qi + 1);
  const hi = query.indexOf('#');
  if (hi !== -1) query = query.slice(0, hi);
  const params = [];
  if (query !== '') {
    for (const pair of query.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
      params.push({ key: safeDecode(rawKey), value: safeDecode(rawVal) });
    }
  }
  return { base, params };
}

function safeDecode(s) {
  try { return decodeURIComponent(str(s).replace(/\+/g, ' ')); }
  catch { return str(s); }
}

function applyUrlParams(base, params) {
  const list = (params || []).filter((p) => p && str(p.key) !== '');
  if (list.length === 0) return str(base);
  const qs = list
    .map((p) => `${encodeURIComponent(str(p.key))}=${encodeURIComponent(str(p.value))}`)
    .join('&');
  const b = str(base);
  return b.includes('?') ? `${b}&${qs}` : `${b}?${qs}`;
}

// The full URL a request targets (base + params).
function fullUrl(model) {
  return applyUrlParams(model.url, model.params);
}

// ============================================================
// 3. Quoting / string literals
// ============================================================
const SHELL_SAFE = /^[A-Za-z0-9_@%^+=:,.\/-]+$/;

// POSIX single-quote quoting: wrap in '…', and render embedded ' as '\''.
function shellQuote(s) {
  const v = str(s);
  if (v === '') return "''";
  if (SHELL_SAFE.test(v)) return v;
  return "'" + v.replace(/'/g, "'\\''") + "'";
}

// JS / JSON string literal (double-quoted). Good for fetch & Node.
function jsStr(s) { return JSON.stringify(str(s)); }

// Python string literal — JSON's escaping is valid Python for these cases.
function pyStr(s) { return JSON.stringify(str(s)); }

// Go double-quoted string literal — JSON escaping is compatible.
function goStr(s) { return JSON.stringify(str(s)); }

// PowerShell single-quoted literal ('' escapes a quote); no interpolation.
function psStr(s) { return "'" + str(s).replace(/'/g, "''") + "'"; }

// UTF-8-safe base64 (btoa alone is Latin1-only).
function utf8ToBase64(s) {
  const bytes = new TextEncoder().encode(str(s));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToUtf8(b64) {
  try {
    const bin = atob(str(b64));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch { return ''; }
}
function basicHeaderValue(user, pass) {
  return 'Basic ' + utf8ToBase64(`${str(user)}:${str(pass)}`);
}
function decodeBasic(b64) {
  const decoded = base64ToUtf8(b64);
  const ci = decoded.indexOf(':');
  if (ci === -1) return { user: decoded, pass: '' };
  return { user: decoded.slice(0, ci), pass: decoded.slice(ci + 1) };
}

// ============================================================
// 4. Shell tokenizer
// ============================================================
// Splits a command line into tokens like a POSIX shell would (enough of it
// for curl/wget): unquoted whitespace splits; '…' literal; "…" with
// \"\\\`\$ escaping; backslash escapes outside quotes; $'…' ANSI-C quoting;
// a backslash-newline is a line continuation (removed); adjacent quoted and
// unquoted runs concatenate into ONE token (so -d'x' -> -dx).
function tokenizeShell(input) {
  const s = str(input);
  const tokens = [];
  let cur = '';
  let has = false; // whether cur holds a (possibly empty) token in progress
  let i = 0;
  const n = s.length;

  const push = () => { if (has) { tokens.push(cur); cur = ''; has = false; } };

  while (i < n) {
    const c = s[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      push();
      i++;
      continue;
    }

    if (c === '\\') {
      // Line continuation: backslash + newline -> nothing.
      if (s[i + 1] === '\n') { i += 2; continue; }
      if (s[i + 1] === '\r' && s[i + 2] === '\n') { i += 3; continue; }
      if (i + 1 < n) { cur += s[i + 1]; has = true; i += 2; continue; }
      cur += '\\'; has = true; i++; continue;
    }

    if (c === "'") {
      has = true;
      i++;
      while (i < n && s[i] !== "'") { cur += s[i]; i++; }
      i++; // closing quote (or EOF)
      continue;
    }

    if (c === '$' && s[i + 1] === "'") {
      // ANSI-C quoting.
      has = true;
      i += 2;
      const res = readAnsiC(s, i);
      cur += res.value;
      i = res.next;
      continue;
    }

    if (c === '"') {
      has = true;
      i++;
      while (i < n && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < n) {
          const nx = s[i + 1];
          if (nx === '"' || nx === '\\' || nx === '$' || nx === '`') { cur += nx; i += 2; continue; }
          if (nx === '\n') { i += 2; continue; } // continuation inside dquotes
          cur += '\\'; i++; continue;
        }
        cur += s[i]; i++;
      }
      i++; // closing quote
      continue;
    }

    cur += c; has = true; i++;
  }
  push();
  return tokens;
}

// ANSI-C quoting body reader ($'…'). Returns { value, next } where next is
// the index just past the closing quote.
function readAnsiC(s, i) {
  let out = '';
  const n = s.length;
  while (i < n && s[i] !== "'") {
    if (s[i] === '\\' && i + 1 < n) {
      const nx = s[i + 1];
      switch (nx) {
        case 'n': out += '\n'; i += 2; continue;
        case 't': out += '\t'; i += 2; continue;
        case 'r': out += '\r'; i += 2; continue;
        case 'b': out += '\b'; i += 2; continue;
        case 'f': out += '\f'; i += 2; continue;
        case 'v': out += '\v'; i += 2; continue;
        case 'a': out += '\x07'; i += 2; continue;
        case '\\': out += '\\'; i += 2; continue;
        case "'": out += "'"; i += 2; continue;
        case '"': out += '"'; i += 2; continue;
        case 'x': {
          const m = /^[0-9A-Fa-f]{1,2}/.exec(s.slice(i + 2));
          if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += 2 + m[0].length; continue; }
          out += 'x'; i += 2; continue;
        }
        case 'u': {
          const m = /^[0-9A-Fa-f]{1,4}/.exec(s.slice(i + 2));
          if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += 2 + m[0].length; continue; }
          out += 'u'; i += 2; continue;
        }
        default: out += nx; i += 2; continue;
      }
    }
    out += s[i]; i++;
  }
  return { value: out, next: i + 1 };
}

// ============================================================
// 5. Parse helpers (shared by curl & wget)
// ============================================================
function splitHeader(raw) {
  const s = str(raw);
  const ci = s.indexOf(':');
  if (ci === -1) return { name: s.trim(), value: '' };
  return { name: s.slice(0, ci).trim(), value: s.slice(ci + 1).trim() };
}

// Move Authorization/User-Agent/Referer/Cookie out of the raw header list
// into the structured model (so auth round-trips as auth, UA as a flag …).
function liftSpecialHeaders(model) {
  const kept = [];
  for (const h of model.headers) {
    const lower = h.name.toLowerCase();
    if (lower === 'authorization') {
      const val = h.value;
      if (/^bearer\s+/i.test(val)) {
        model.auth = { type: 'bearer', user: '', pass: '', token: val.replace(/^bearer\s+/i, '') };
        continue;
      }
      if (/^basic\s+/i.test(val)) {
        const { user, pass } = decodeBasic(val.replace(/^basic\s+/i, '').trim());
        model.auth = { type: 'basic', user, pass, token: '' };
        continue;
      }
      kept.push(h); // some other scheme — keep literal
      continue;
    }
    if (lower === 'user-agent') { model.flags.userAgent = h.value; continue; }
    if (lower === 'referer') { model.flags.referer = h.value; continue; }
    kept.push(h);
  }
  model.headers = kept;
}

// Turn accumulated --data pieces into a body (form-urlencoded style).
function dataPiecesToBody(model, pieces, opts) {
  if (pieces.length === 0) return;
  // Each piece may itself be key=value(&key=value). Decide raw vs form:
  // if all pieces look like k=v pairs, model as form fields; else raw.
  const asForm = opts && opts.urlencode;
  const joined = pieces.join('&');
  if (asForm) {
    model.body = { type: 'form', raw: joined, fields: parseFormPairs(joined), urlencode: true };
  } else {
    model.body = { type: 'raw', raw: joined, fields: [], urlencode: false };
  }
}

function parseFormPairs(s) {
  const out = [];
  for (const pair of str(s).split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    out.push({ key: safeDecode(key), value: safeDecode(value), kind: 'data' });
  }
  return out;
}

// Split combined short flags like -sSL or -XPOST. Returns an array of args
// to re-inject: known value-taking short flags stop the run and take the
// remainder as their value.
function expandShortCluster(tok, valueTakers) {
  // tok starts with a single '-' and length>2 and not '--'
  const out = [];
  let j = 1;
  while (j < tok.length) {
    const ch = tok[j];
    const flag = '-' + ch;
    if (valueTakers.has(flag)) {
      const rest = tok.slice(j + 1);
      out.push(flag);
      if (rest !== '') out.push(rest);
      return out;
    }
    out.push(flag);
    j++;
  }
  return out;
}

// ============================================================
// 6. parseCurl
// ============================================================
const CURL_VALUE_SHORTS = new Set(['-X', '-H', '-d', '-F', '-u', '-b', '-A', '-e', '-m', '-o']);

function parseCurl(input) {
  const model = emptyModel();
  const notes = [];
  let tokens = tokenizeShell(input);
  // Drop a leading `curl` (case-insensitive), tolerate leading junk.
  if (tokens.length && /^curl$/i.test(tokens[0])) tokens = tokens.slice(1);

  // Pre-expand combined short clusters (-sSL, -XPOST) into separate args.
  const args = [];
  for (const t of tokens) {
    if (t.length > 2 && t[0] === '-' && t[1] !== '-') {
      for (const a of expandShortCluster(t, CURL_VALUE_SHORTS)) args.push(a);
    } else {
      args.push(t);
    }
  }

  const dataPieces = [];
  let urlencodeData = false;
  let dataIsJson = false;
  let getFlag = false;
  let methodSet = false;
  let sawData = false;

  const next = (idx, flag) => {
    if (idx + 1 >= args.length) { notes.push(`${flag} expected a value but none was given.`); return null; }
    return args[idx + 1];
  };

  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    // Support --flag=value form.
    let inlineVal = null;
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=');
      inlineVal = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const takeVal = (flag) => {
      if (inlineVal !== null) return inlineVal;
      const v = next(i, flag);
      if (v !== null) i++;
      return v;
    };

    switch (a) {
      case '-X': case '--request': {
        const v = takeVal(a); if (v !== null) { model.method = v.toUpperCase(); methodSet = true; }
        break;
      }
      case '-H': case '--header': {
        const v = takeVal(a); if (v !== null) model.headers.push(splitHeader(v));
        break;
      }
      case '-d': case '--data': case '--data-ascii': case '--data-binary': {
        const v = takeVal(a); if (v !== null) { dataPieces.push(v); sawData = true; }
        break;
      }
      case '--data-raw': {
        const v = takeVal(a); if (v !== null) { dataPieces.push(v); sawData = true; }
        break;
      }
      case '--data-urlencode': {
        const v = takeVal(a); if (v !== null) { dataPieces.push(v); sawData = true; urlencodeData = true; }
        break;
      }
      case '--json': {
        const v = takeVal(a);
        if (v !== null) {
          model.body = { type: 'json', raw: v, fields: [], urlencode: false };
          sawData = true; dataIsJson = true;
        }
        break;
      }
      case '-F': case '--form': case '--form-string': {
        const v = takeVal(a);
        if (v !== null) {
          const eq = v.indexOf('=');
          const key = eq === -1 ? v : v.slice(0, eq);
          let value = eq === -1 ? '' : v.slice(eq + 1);
          let kind = 'data';
          if (value.startsWith('@') || value.startsWith('<')) { kind = 'file'; value = value.slice(1); }
          if (model.body.type !== 'multipart') model.body = { type: 'multipart', raw: '', fields: [], urlencode: false };
          model.body.fields.push({ key, value, kind });
          sawData = true;
        }
        break;
      }
      case '-u': case '--user': {
        const v = takeVal(a);
        if (v !== null) {
          const ci = v.indexOf(':');
          model.auth = ci === -1
            ? { type: 'basic', user: v, pass: '', token: '' }
            : { type: 'basic', user: v.slice(0, ci), pass: v.slice(ci + 1), token: '' };
        }
        break;
      }
      case '-b': case '--cookie': {
        const v = takeVal(a); if (v !== null) model.headers.push({ name: 'Cookie', value: v });
        break;
      }
      case '-A': case '--user-agent': {
        const v = takeVal(a); if (v !== null) model.flags.userAgent = v;
        break;
      }
      case '-e': case '--referer': {
        const v = takeVal(a); if (v !== null) model.flags.referer = v.replace(/;auto$/, '');
        break;
      }
      case '--url': {
        const v = takeVal(a);
        if (v !== null) {
          if (!model.url) model.url = v;
          else notes.push(`Extra argument "${v}" ignored (only the first URL is used).`);
        }
        break;
      }
      case '-L': case '--location': model.flags.followRedirects = true; break;
      case '-k': case '--insecure': model.flags.insecure = true; break;
      case '--compressed': model.flags.compressed = true; break;
      case '-G': case '--get': getFlag = true; break;
      case '-m': case '--max-time': {
        const v = takeVal(a); const t = Number(v); if (Number.isFinite(t) && t > 0) model.flags.timeout = t;
        break;
      }
      // Recognized-but-ignored (don't affect the model).
      case '-o': case '--output': { takeVal(a); notes.push(`${a}: output-to-file is ignored (this tool only generates the request).`); break; }
      case '-O': case '--remote-name': notes.push(`${a}: save-as-remote-name is ignored.`); break;
      case '-s': case '--silent': case '-v': case '--verbose': case '-i': case '--include':
      case '-f': case '--fail': case '-#': case '--progress-bar': case '-S': case '--show-error':
        notes.push(`${a}: a display/output flag — ignored (doesn't change the request).`);
        break;
      default: {
        if (a.startsWith('-')) {
          notes.push(`Unrecognized flag ${a}${inlineVal !== null ? '=…' : ''} — left out of the model.`);
          // If it was a --flag value (space form) we can't know it took a value; leave next token as-is.
        } else {
          // positional -> URL
          if (!model.url) model.url = a;
          else notes.push(`Extra argument "${a}" ignored (only the first URL is used).`);
        }
      }
    }
  }

  // Resolve the URL / params.
  if (model.url) {
    const sp = splitUrlParams(model.url);
    model.url = sp.base;
    model.params = sp.params;
  }

  // Resolve data pieces into a body (unless --json/-F already set one).
  if (sawData && !dataIsJson && model.body.type !== 'multipart') {
    dataPiecesToBody(model, dataPieces, { urlencode: urlencodeData });
  }

  // -G: move data into the query string as GET.
  if (getFlag) {
    if (model.body.type === 'form' || model.body.type === 'raw') {
      const pairs = parseFormPairs(model.body.raw);
      for (const p of pairs) model.params.push({ key: p.key, value: p.value });
      model.body = { type: 'none', raw: '', fields: [], urlencode: false };
    }
    if (!methodSet) model.method = 'GET';
  } else if (sawData && !methodSet) {
    model.method = 'POST';
  }

  liftSpecialHeaders(model);
  return { ...model, notes };
}

// ============================================================
// 7. parseWget
// ============================================================
const WGET_VALUE_SHORTS = new Set(['-O', '-U', '-o']);
// wget combo short flags that begin with -n and must not be cluster-split (#1014-L).
const WGET_NO_FLAGS = new Set(['-nv', '-nc', '-nH', '-nd']);

function parseWget(input) {
  const model = emptyModel();
  const notes = [];
  let tokens = tokenizeShell(input);
  if (tokens.length && /^wget$/i.test(tokens[0])) tokens = tokens.slice(1);

  const args = [];
  for (const t of tokens) {
    // wget's -n* flags (-nv/-nc/-nH/-nd) are whole flags, NOT short clusters — don't split them
    // apart (that left their case arms dead and mis-noted "-n" as unrecognized) (#1014-L).
    if (WGET_NO_FLAGS.has(t)) { args.push(t); continue; }
    if (t.length > 2 && t[0] === '-' && t[1] !== '-') {
      for (const a of expandShortCluster(t, WGET_VALUE_SHORTS)) args.push(a);
    } else {
      args.push(t);
    }
  }

  let user = null, pass = null;
  let methodSet = false, sawBody = false;

  const next = (idx, flag) => {
    if (idx + 1 >= args.length) { notes.push(`${flag} expected a value but none was given.`); return null; }
    return args[idx + 1];
  };

  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    let inlineVal = null;
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('='); inlineVal = a.slice(eq + 1); a = a.slice(0, eq);
    }
    const takeVal = (flag) => {
      if (inlineVal !== null) return inlineVal;
      const v = next(i, flag); if (v !== null) i++; return v;
    };

    switch (a) {
      case '--header': { const v = takeVal(a); if (v !== null) model.headers.push(splitHeader(v)); break; }
      case '--method': { const v = takeVal(a); if (v !== null) { model.method = v.toUpperCase(); methodSet = true; } break; }
      case '--post-data': {
        const v = takeVal(a);
        if (v !== null) { model.body = { type: 'form', raw: v, fields: parseFormPairs(v), urlencode: true }; sawBody = true; }
        break;
      }
      case '--body-data': {
        const v = takeVal(a);
        if (v !== null) { model.body = { type: 'raw', raw: v, fields: [], urlencode: false }; sawBody = true; }
        break;
      }
      case '--post-file': case '--body-file': {
        const v = takeVal(a);
        if (v !== null) { model.body = { type: 'raw', raw: '', fields: [], urlencode: false }; notes.push(`${a}=${v}: body is read from a file at runtime — the tool can't inline file contents, so the body is left empty.`); sawBody = true; }
        break;
      }
      case '--user': case '--http-user': { const v = takeVal(a); if (v !== null) user = v; break; }
      case '--password': case '--http-password': { const v = takeVal(a); if (v !== null) pass = v; break; }
      case '-U': case '--user-agent': { const v = takeVal(a); if (v !== null) model.flags.userAgent = v; break; }
      case '--referer': { const v = takeVal(a); if (v !== null) model.flags.referer = v; break; }
      case '--no-check-certificate': model.flags.insecure = true; break;
      case '--compression': { const v = takeVal(a); if (v && v !== 'none') model.flags.compressed = true; break; }
      case '--max-redirect': {
        const v = takeVal(a); const t = Number(v);
        // --max-redirect=0 DISABLES redirects; any positive count (or unparsable) means follow (#1014-L).
        model.flags.followRedirects = !(Number.isFinite(t) && t === 0);
        break;
      }
      case '--timeout': case '--read-timeout': { const v = takeVal(a); const t = Number(v); if (Number.isFinite(t) && t > 0) model.flags.timeout = t; break; }
      case '-O': case '--output-document': { takeVal(a); notes.push(`${a}: output-to-file is ignored (this tool only generates the request).`); break; }
      case '-o': case '--output-file': { takeVal(a); notes.push(`${a}: log-file is ignored.`); break; }
      case '-q': case '--quiet': case '-nv': case '--no-verbose': case '-v': case '--verbose':
      case '-nc': case '--no-clobber': case '-nH': case '--no-host-directories': case '-nd':
      case '-c': case '--continue': case '-N': case '--timestamping':
        notes.push(`${a}: a display/behavior flag — ignored (doesn't change the request).`);
        break;
      default: {
        if (a.startsWith('-')) {
          notes.push(`Unrecognized flag ${a}${inlineVal !== null ? '=…' : ''} — left out of the model.`);
        } else {
          if (!model.url) model.url = a;
          else notes.push(`Extra argument "${a}" ignored (only the first URL is used).`);
        }
      }
    }
  }

  if (user !== null || pass !== null) {
    model.auth = { type: 'basic', user: str(user), pass: str(pass), token: '' };
  }

  if (model.url) {
    const sp = splitUrlParams(model.url);
    model.url = sp.base;
    model.params = sp.params;
  }
  if (sawBody && !methodSet && model.method === 'GET') model.method = 'POST';

  liftSpecialHeaders(model);
  return { ...model, notes };
}

// ============================================================
// 8. Resolved headers & body (shared by builders + converters)
// ============================================================
function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return headers.some((h) => h.name.toLowerCase() === lower);
}

function contentTypeForBody(body) {
  switch (body.type) {
    case 'json': return 'application/json';
    case 'form': return 'application/x-www-form-urlencoded';
    case 'multipart': return 'multipart/form-data';
    // A raw body comes from curl -d / --data(-binary) / wget --post-data, all of which send
    // application/x-www-form-urlencoded by default — so the regenerated request matches (#1014-E).
    case 'raw': return 'application/x-www-form-urlencoded';
    default: return null;
  }
}

// The full ordered header set a request sends: explicit headers, plus a
// derived Content-Type (unless already present), Authorization, User-Agent,
// Referer. `includeContentType` lets a builder that renders CT implicitly
// (curl -d) skip the derived one.
function resolvedHeaders(model, { includeContentType = true, includeAuth = true } = {}) {
  const out = model.headers.map((h) => ({ name: h.name, value: h.value }));
  if (includeContentType && hasBody(model) && model.body.type !== 'multipart') {
    const ct = contentTypeForBody(model.body);
    if (ct && !hasHeader(out, 'content-type')) out.push({ name: 'Content-Type', value: ct });
  }
  if (includeAuth) {
    if (model.auth.type === 'basic') out.push({ name: 'Authorization', value: basicHeaderValue(model.auth.user, model.auth.pass) });
    else if (model.auth.type === 'bearer' && model.auth.token) out.push({ name: 'Authorization', value: `Bearer ${model.auth.token}` });
  }
  if (model.flags.userAgent) out.push({ name: 'User-Agent', value: model.flags.userAgent });
  if (model.flags.referer) out.push({ name: 'Referer', value: model.flags.referer });
  return out;
}

function hasBody(model) {
  const b = model.body;
  if (b.type === 'none') return false;
  if (b.type === 'raw' || b.type === 'json') return b.raw !== '';
  if (b.type === 'form' || b.type === 'multipart') return b.fields.length > 0 || b.raw !== '';
  return false;
}

// form fields -> "k=v&k=v" (URL-encoded).
function encodeForm(fields) {
  return (fields || [])
    .filter((f) => str(f.key) !== '' || str(f.value) !== '')
    .map((f) => `${encodeURIComponent(str(f.key))}=${encodeURIComponent(str(f.value))}`)
    .join('&');
}

// ============================================================
// 9. buildCurl
// ============================================================
function buildCurl(model, opts = {}) {
  const m = normalizeModel(model);
  const long = opts.longFlags === true;
  const multiline = opts.multiline === true;
  const F = (short, longName) => (long ? longName : short);

  const parts = ['curl'];
  const url = fullUrl(m);

  // Method: explicit unless it's a plain GET, or POST implied by a body.
  const bodyPresent = hasBody(m);
  const impliedPost = bodyPresent && m.method === 'POST';
  if (m.method && m.method !== 'GET' && !impliedPost) {
    parts.push(F('-X', '--request'), m.method);
  } else if (m.method === 'GET' && bodyPresent) {
    parts.push(F('-X', '--request'), 'GET');
  }

  parts.push(shellQuote(url));

  // Auth via -u (basic) so it reads naturally; bearer goes as a header.
  if (m.auth.type === 'basic') {
    const cred = m.auth.pass !== '' ? `${m.auth.user}:${m.auth.pass}` : `${m.auth.user}:`;
    parts.push(F('-u', '--user'), shellQuote(cred));
  }

  // Headers (Content-Type derived for json/form; not for multipart — curl
  // sets that with its boundary). Skip Authorization when handled by -u.
  const headers = resolvedHeaders(m, { includeContentType: true, includeAuth: m.auth.type === 'bearer' });
  for (const h of headers) {
    parts.push(F('-H', '--header'), shellQuote(`${h.name}: ${h.value}`));
  }

  // Body.
  if (m.body.type === 'json') {
    parts.push(F('-d', '--data'), shellQuote(m.body.raw));
  } else if (m.body.type === 'raw') {
    if (m.body.raw !== '') parts.push(F('-d', '--data'), shellQuote(m.body.raw));
  } else if (m.body.type === 'form') {
    if (m.body.urlencode && m.body.fields.length) {
      for (const f of m.body.fields) parts.push('--data-urlencode', shellQuote(`${f.key}=${f.value}`));
    } else if (m.body.fields.length) {
      parts.push(F('-d', '--data'), shellQuote(encodeForm(m.body.fields)));
    } else if (m.body.raw !== '') {
      parts.push(F('-d', '--data'), shellQuote(m.body.raw));
    }
  } else if (m.body.type === 'multipart') {
    for (const f of m.body.fields) {
      const val = f.kind === 'file' ? `${f.key}=@${f.value}` : `${f.key}=${f.value}`;
      parts.push(F('-F', '--form'), shellQuote(val));
    }
  }

  // Flags.
  if (m.flags.followRedirects) parts.push(F('-L', '--location'));
  if (m.flags.insecure) parts.push(F('-k', '--insecure'));
  if (m.flags.compressed) parts.push('--compressed');
  if (m.flags.timeout) parts.push(F('-m', '--max-time'), String(m.flags.timeout));

  return joinCmd(parts, multiline);
}

// ============================================================
// 10. buildWget
// ============================================================
function buildWget(model, opts = {}) {
  const m = normalizeModel(model);
  const multiline = opts.multiline === true;
  const notes = [];
  const parts = ['wget'];
  const url = fullUrl(m);

  if (m.method && m.method !== 'GET') parts.push(`--method=${shellQuote(m.method)}`);

  // Headers (include derived Content-Type & auth; wget has no -u shorthand
  // that maps cleanly, so basic auth uses --user/--password).
  const headers = resolvedHeaders(m, { includeContentType: true, includeAuth: m.auth.type === 'bearer' });
  for (const h of headers) parts.push(`--header=${shellQuote(`${h.name}: ${h.value}`)}`);

  if (m.auth.type === 'basic') {
    parts.push(`--user=${shellQuote(m.auth.user)}`);
    if (m.auth.pass !== '') parts.push(`--password=${shellQuote(m.auth.pass)}`);
  }

  // Body.
  if (m.body.type === 'json' || m.body.type === 'raw') {
    if (m.body.raw !== '') parts.push(`--body-data=${shellQuote(m.body.raw)}`);
  } else if (m.body.type === 'form') {
    const data = m.body.fields.length ? encodeForm(m.body.fields) : m.body.raw;
    if (data !== '') parts.push(`--post-data=${shellQuote(data)}`);
  } else if (m.body.type === 'multipart') {
    notes.push('# note: wget has no multipart/form-data support — fields omitted.');
  }

  if (m.flags.insecure) parts.push('--no-check-certificate');
  if (m.flags.compressed) parts.push('--compression=auto');
  if (m.flags.timeout) parts.push(`--timeout=${m.flags.timeout}`);

  parts.push(shellQuote(url));

  let cmd = joinCmd(parts, multiline);
  if (notes.length) cmd = notes.join('\n') + '\n' + cmd;
  return cmd;
}

function joinCmd(parts, multiline) {
  if (!multiline) return parts.join(' ');
  // First token (curl/wget) + url stay on line 1; each flag(+value) on its
  // own continued line. We group value-taking flags with their value.
  const out = [];
  let i = 0;
  // Keep program name and any immediate non-flag (method+url) grouped.
  let head = parts[0];
  i = 1;
  // pull following tokens until the first flag-looking token onto head
  while (i < parts.length && !parts[i].startsWith('-')) { head += ' ' + parts[i]; i++; }
  out.push(head);
  while (i < parts.length) {
    let line = parts[i]; i++;
    // attach a value token (next non-flag) to a flag
    if (line.startsWith('-') && i < parts.length && !parts[i].startsWith('-')) {
      line += ' ' + parts[i]; i++;
    }
    out.push(line);
  }
  return out.join(' \\\n  ');
}

// ============================================================
// 11. Converters
// ============================================================
function bodyDescriptor(model) {
  const b = model.body;
  if (b.type === 'json') return { kind: 'json', raw: b.raw };
  if (b.type === 'raw') return { kind: 'raw', raw: b.raw };
  if (b.type === 'form') return { kind: 'form', fields: b.fields.length ? b.fields : parseFormPairs(b.raw), raw: encodeForm(b.fields.length ? b.fields : parseFormPairs(b.raw)) };
  if (b.type === 'multipart') return { kind: 'multipart', fields: b.fields };
  return { kind: 'none' };
}

// ---- fetch (browser) ----
function toFetch(model) {
  const m = normalizeModel(model);
  const url = fullUrl(m);
  const headers = resolvedHeaders(m);
  const bd = bodyDescriptor(m);
  const lines = [];
  const opt = [];
  opt.push(`  method: ${jsStr(m.method)},`);
  if (headers.length) {
    opt.push('  headers: {');
    for (const h of headers) opt.push(`    ${jsStr(h.name)}: ${jsStr(h.value)},`);
    opt.push('  },');
  }
  if (bd.kind === 'json') opt.push(`  body: ${jsStr(m.body.raw)},`);
  else if (bd.kind === 'raw') opt.push(`  body: ${jsStr(m.body.raw)},`);
  else if (bd.kind === 'form') {
    lines.push('const body = new URLSearchParams();');
    for (const f of bd.fields) lines.push(`body.append(${jsStr(f.key)}, ${jsStr(f.value)});`);
    opt.push('  body,');
  } else if (bd.kind === 'multipart') {
    lines.push('const body = new FormData();');
    for (const f of bd.fields) {
      if (f.kind === 'file') lines.push(`// body.append(${jsStr(f.key)}, fileInput.files[0]); // ${jsStr(f.value)}`);
      else lines.push(`body.append(${jsStr(f.key)}, ${jsStr(f.value)});`);
    }
    opt.push('  body,');
  }
  if (m.flags.followRedirects) opt.push(`  redirect: 'follow',`);
  const optStr = `{\n${opt.join('\n')}\n}`;
  lines.push(`const res = await fetch(${jsStr(url)}, ${optStr});`);
  lines.push('const data = await res.text();');
  lines.push('console.log(res.status, data);');
  let note = '';
  if (m.flags.insecure) note = '// Note: browsers cannot disable TLS verification (-k has no fetch equivalent).\n';
  return note + lines.join('\n');
}

// ---- Node (global fetch, Node 18+) ----
function toNode(model) {
  const m = normalizeModel(model);
  const url = fullUrl(m);
  const headers = resolvedHeaders(m);
  const bd = bodyDescriptor(m);
  const pre = [];
  const opt = [];
  opt.push(`  method: ${jsStr(m.method)},`);
  if (headers.length) {
    opt.push('  headers: {');
    for (const h of headers) opt.push(`    ${jsStr(h.name)}: ${jsStr(h.value)},`);
    opt.push('  },');
  }
  if (bd.kind === 'json' || bd.kind === 'raw') opt.push(`  body: ${jsStr(m.body.raw)},`);
  else if (bd.kind === 'form') {
    pre.push('const body = new URLSearchParams();');
    for (const f of bd.fields) pre.push(`body.append(${jsStr(f.key)}, ${jsStr(f.value)});`);
    opt.push('  body,');
  } else if (bd.kind === 'multipart') {
    pre.push('const body = new FormData();');
    for (const f of bd.fields) {
      if (f.kind === 'file') pre.push(`// body.append(${jsStr(f.key)}, new Blob([...])); // file: ${jsStr(f.value)}`);
      else pre.push(`body.append(${jsStr(f.key)}, ${jsStr(f.value)});`);
    }
    opt.push('  body,');
  }
  if (m.flags.followRedirects) opt.push(`  redirect: 'follow',`);
  if (m.flags.timeout) opt.push(`  signal: AbortSignal.timeout(${m.flags.timeout * 1000}),`);
  let note = '';
  if (m.flags.insecure) note = '// Insecure TLS (-k): set NODE_TLS_REJECT_UNAUTHORIZED=0 or a custom Agent.\n';
  const lines = [];
  lines.push('// Node 18+ (global fetch)');
  pre.forEach((l) => lines.push(l));
  lines.push(`const res = await fetch(${jsStr(url)}, {\n${opt.join('\n')}\n});`);
  lines.push('console.log(res.status, await res.text());');
  return note + lines.join('\n');
}

// ---- Python requests ----
function toPython(model) {
  const m = normalizeModel(model);
  const base = m.url;
  const headers = resolvedHeaders(m, { includeAuth: m.auth.type === 'bearer' });
  const bd = bodyDescriptor(m);
  const lines = ['import requests', ''];
  const call = [`    ${pyStr(m.method)},`, `    ${pyStr(fullUrl(m))},`];

  if (headers.length) {
    lines.push('headers = {');
    for (const h of headers) lines.push(`    ${pyStr(h.name)}: ${pyStr(h.value)},`);
    lines.push('}');
    call.push('    headers=headers,');
  }
  if (m.auth.type === 'basic') call.push(`    auth=(${pyStr(m.auth.user)}, ${pyStr(m.auth.pass)}),`);

  if (bd.kind === 'json') call.push(`    data=${pyStr(m.body.raw)},`);
  else if (bd.kind === 'raw') call.push(`    data=${pyStr(m.body.raw)},`);
  else if (bd.kind === 'form') {
    lines.push('data = {');
    for (const f of bd.fields) lines.push(`    ${pyStr(f.key)}: ${pyStr(f.value)},`);
    lines.push('}');
    call.push('    data=data,');
  } else if (bd.kind === 'multipart') {
    lines.push('files = {');
    for (const f of bd.fields) {
      if (f.kind === 'file') lines.push(`    ${pyStr(f.key)}: open(${pyStr(f.value)}, "rb"),`);
      else lines.push(`    ${pyStr(f.key)}: (None, ${pyStr(f.value)}),`);
    }
    lines.push('}');
    call.push('    files=files,');
  }
  if (m.flags.insecure) call.push('    verify=False,');
  if (m.flags.timeout) call.push(`    timeout=${m.flags.timeout},`);
  if (!m.flags.followRedirects) call.push('    allow_redirects=False,');

  lines.push('');
  lines.push('resp = requests.request(');
  call.forEach((c) => lines.push(c));
  lines.push(')');
  lines.push('print(resp.status_code, resp.text)');
  return lines.join('\n');
}

// ---- HTTPie ----
function toHttpie(model) {
  const m = normalizeModel(model);
  const headers = resolvedHeaders(m, { includeAuth: false, includeContentType: false });
  const bd = bodyDescriptor(m);
  const parts = ['http'];
  if (m.flags.followRedirects) parts.push('--follow');
  if (m.flags.insecure) parts.push('--verify=no');
  if (m.flags.timeout) parts.push(`--timeout=${m.flags.timeout}`);
  if (m.auth.type === 'basic') parts.push('-a', shellQuote(`${m.auth.user}:${m.auth.pass}`));
  if (bd.kind === 'form') parts.push('--form');
  parts.push(m.method);
  parts.push(shellQuote(fullUrl(m)));

  for (const h of headers) parts.push(shellQuote(`${h.name}:${h.value}`));
  if (m.auth.type === 'bearer' && m.auth.token) parts.push(shellQuote(`Authorization:Bearer ${m.auth.token}`));

  if (bd.kind === 'json') {
    return `echo ${shellQuote(m.body.raw)} | ${parts.join(' ')}`;
  } else if (bd.kind === 'raw') {
    return `echo ${shellQuote(m.body.raw)} | ${parts.join(' ')}`;
  } else if (bd.kind === 'form') {
    for (const f of bd.fields) parts.push(shellQuote(`${f.key}=${f.value}`));
  } else if (bd.kind === 'multipart') {
    for (const f of bd.fields) parts.push(shellQuote(`${f.key}${f.kind === 'file' ? '@' : '='}${f.value}`));
  }
  return parts.join(' ');
}

// ---- PowerShell Invoke-WebRequest ----
function toPowerShell(model) {
  const m = normalizeModel(model);
  const headers = resolvedHeaders(m, { includeAuth: true });
  const bd = bodyDescriptor(m);
  const lines = [];
  if (headers.length) {
    lines.push('$headers = @{');
    for (const h of headers) lines.push(`    ${psStr(h.name)} = ${psStr(h.value)}`);
    lines.push('}');
  }
  let bodyArg = '';
  if (bd.kind === 'json' || bd.kind === 'raw') { lines.push(`$body = ${psStr(m.body.raw)}`); bodyArg = ' -Body $body'; }
  else if (bd.kind === 'form') { lines.push(`$body = ${psStr(bd.raw)}`); bodyArg = ' -Body $body'; }
  else if (bd.kind === 'multipart') { lines.push('# multipart/form-data: use -Form @{ ... } (PowerShell 6.1+)'); }

  const args = [`Invoke-WebRequest -Uri ${psStr(fullUrl(m))}`, `-Method ${m.method}`];
  if (headers.length) args.push('-Headers $headers');
  if (bodyArg) args.push(bodyArg.trim());
  if (m.flags.insecure) args.push('-SkipCertificateCheck');
  if (m.flags.timeout) args.push(`-TimeoutSec ${m.flags.timeout}`);
  if (!m.flags.followRedirects) args.push('-MaximumRedirection 0');
  lines.push(args.join(' '));
  return lines.join('\n');
}

// ---- Go net/http ----
function toGo(model) {
  const m = normalizeModel(model);
  const bd = bodyDescriptor(m);
  const headers = resolvedHeaders(m);
  const lines = [];
  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('\t"fmt"');
  lines.push('\t"io"');
  lines.push('\t"net/http"');
  if (bd.kind !== 'none') lines.push('\t"strings"');
  lines.push(')');
  lines.push('');
  lines.push('func main() {');
  let bodyExpr = 'nil';
  if (bd.kind === 'json' || bd.kind === 'raw') { lines.push(`\tbody := strings.NewReader(${goStr(m.body.raw)})`); bodyExpr = 'body'; }
  else if (bd.kind === 'form') { lines.push(`\tbody := strings.NewReader(${goStr(bd.raw)})`); bodyExpr = 'body'; }
  else if (bd.kind === 'multipart') { lines.push('\t// multipart: build with mime/multipart.Writer'); }
  lines.push(`\treq, _ := http.NewRequest(${goStr(m.method)}, ${goStr(fullUrl(m))}, ${bodyExpr})`);
  for (const h of headers) lines.push(`\treq.Header.Set(${goStr(h.name)}, ${goStr(h.value)})`);
  lines.push('\tresp, err := http.DefaultClient.Do(req)');
  lines.push('\tif err != nil { panic(err) }');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('\tout, _ := io.ReadAll(resp.Body)');
  lines.push('\tfmt.Println(resp.Status, string(out))');
  lines.push('}');
  let note = '';
  if (m.flags.insecure) note = '// Insecure TLS (-k): use a custom http.Transport with TLSClientConfig{InsecureSkipVerify:true}.\n';
  return note + lines.join('\n');
}

function convert(model, lang) {
  switch (lang) {
    case 'fetch': return toFetch(model);
    case 'node': return toNode(model);
    case 'python': return toPython(model);
    case 'httpie': return toHttpie(model);
    case 'powershell': return toPowerShell(model);
    case 'go': return toGo(model);
    default: return toFetch(model);
  }
}

export {
  METHODS, AUTH_TYPES, BODY_TYPES, CONVERT_LANGS,
  emptyModel, normalizeModel, modelWithoutSecrets,
  splitUrlParams, applyUrlParams, fullUrl, safeDecode,
  shellQuote, jsStr, pyStr, goStr, psStr,
  utf8ToBase64, base64ToUtf8, basicHeaderValue, decodeBasic,
  tokenizeShell, parseCurl, parseWget,
  buildCurl, buildWget,
  resolvedHeaders, contentTypeForBody, hasBody, encodeForm, parseFormPairs,
  toFetch, toNode, toPython, toHttpie, toPowerShell, toGo, convert,
};
