// Unit tests for CtCurl.mjs -- GENERATE side (Phase 12b): output helpers, buildCurl/buildWget, the six
// language generators, convert/CONVERT_LANGS and build->parse round-trips. Zero-dep (node:test +
// node:assert/strict). Run: node --test src/lib/tests/
//
// Every CtCurl function is TOTAL (never throws); tests assert the ACTUAL output. EXACT snippets are pinned
// for fetch + python (and shell/powershell/go in key spots); node/httpie/powershell/go are otherwise
// asserted STRUCTURALLY (method + url + each header + body + auth present). The parse side is 12a; parseCurl
// is imported here only for the round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERT_LANGS, emptyModel, normalizeModel, parseCurl, basicHeaderValue,
  buildCurl, buildWget, toFetch, toNode, toPython, toHttpie, toPowerShell, toGo, convert,
  shellQuote, jsStr, pyStr, goStr, psStr,
  resolvedHeaders, contentTypeForBody, hasBody, encodeForm,
} from '../../utils/formats/CtCurl.mjs';

const noNotes = (r) => { const { notes, ...m } = r; return m; };
const mk = (o = {}) => normalizeModel(o);
const BASIC = basicHeaderValue('u', 'p'); // "Basic dTpw"

// ---------- shared fixtures ----------
const GET = mk({ url: 'https://x.io/a' });
const POST_JSON = mk({
  method: 'POST', url: 'https://api.example.com/v1/items',
  params: [{ key: 'q', value: 'a b' }],
  headers: [{ name: 'Accept', value: 'application/json' }],
  auth: { type: 'basic', user: 'u', pass: 'p' },
  body: { type: 'json', raw: '{"a":"it\'s"}' },
  flags: { followRedirects: true, timeout: 30 },
});
const BEARER_HDRS = mk({
  method: 'PUT', url: 'https://h.io/r/1',
  headers: [{ name: 'X-One', value: '1' }, { name: 'X-Two', value: 'two words' }],
  auth: { type: 'bearer', token: 'TOK123' },
  body: { type: 'raw', raw: 'plain text' },
});
const FORM = mk({
  method: 'POST', url: 'https://f.io/login',
  body: { type: 'form', fields: [{ key: 'a', value: '1' }, { key: 'b', value: 'x y' }] },
});
const MULTI = mk({
  method: 'POST', url: 'https://x.io/u',
  body: { type: 'multipart', fields: [{ key: 'a', value: '1', kind: 'data' }, { key: 'f', value: '/tmp/f.txt', kind: 'file' }] },
});

// ============================================================
// Output helpers
// ============================================================
test('shellQuote: exact escaping', () => {
  const rows = [
    ['', "''"],
    ['abc', 'abc'],
    ['https://a.com/p-1_2.x@y,z=1%2F+:^', 'https://a.com/p-1_2.x@y,z=1%2F+:^'],
    ['a b', "'a b'"],
    ["it's", "'it'\\''s'"],
    ["''", "''\\'''\\'''"],
    ['a"b', `'a"b'`],
    ['a\\b', "'a\\b'"],
    ['a\nb', "'a\nb'"],
    ['$HOME `x` !', "'$HOME `x` !'"],
    ['a&b;c|d', "'a&b;c|d'"],
    ['q?x=1&y=2', "'q?x=1&y=2'"],
    [null, "''"],
    [undefined, "''"],
    [42, '42'],
  ];
  for (const [i, o] of rows) assert.equal(shellQuote(i), o, JSON.stringify(i));
});

test('jsStr/pyStr/goStr: JSON-style double-quoted escaping', () => {
  const rows = [
    ['', '""'], ['abc', '"abc"'], ['a"b', '"a\\"b"'], ['a\\b', '"a\\\\b"'],
    ['a\nb', '"a\\nb"'], ['a\tb\r', '"a\\tb\\r"'], ["it's", `"it's"`],
    ['\u0001', '"\\u0001"'], ['é☃', '"é☃"'], [null, '""'], [undefined, '""'], [7, '"7"'],
  ];
  for (const fn of [jsStr, pyStr, goStr]) {
    for (const [i, o] of rows) assert.equal(fn(i), o, `${fn.name}(${JSON.stringify(i)})`);
  }
});

test('psStr: single-quoted, quote doubled, no interpolation', () => {
  const rows = [
    ['', "''"], ['abc', "'abc'"], ["it's", "'it''s'"], ["''", "''''''"],
    ['$x `n` "q"', `'$x \`n\` "q"'`], ['a\\b', "'a\\b'"], ['a\nb', "'a\nb'"], [null, "''"], [3, "'3'"],
  ];
  for (const [i, o] of rows) assert.equal(psStr(i), o, JSON.stringify(i));
});

test('encodeForm: urlencoded k=v&k=v', () => {
  assert.equal(encodeForm([]), '');
  assert.equal(encodeForm(null), '');
  assert.equal(encodeForm(undefined), '');
  assert.equal(encodeForm([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]), 'a=1&b=2');
  assert.equal(encodeForm([{ key: 'a b', value: 'x&y=z' }]), 'a%20b=x%26y%3Dz');
  assert.equal(encodeForm([{ key: 'k', value: '' }]), 'k=');
  assert.equal(encodeForm([{ key: '', value: 'v' }]), '=v');
  assert.equal(encodeForm([{ key: '', value: '' }, { key: 'a', value: '1' }]), 'a=1', 'empty pair dropped');
  assert.equal(encodeForm([{ key: 'é', value: '☃' }]), '%C3%A9=%E2%98%83');
  assert.equal(encodeForm([{ key: 'a', value: '1' }, { key: 'a', value: '2' }]), 'a=1&a=2', 'duplicates kept');
  assert.equal(encodeForm([{ key: null, value: 5 }]), '=5');
});

test('hasBody: per body type', () => {
  const b = (body) => hasBody(mk({ body }));
  assert.equal(b({ type: 'none' }), false);
  assert.equal(b({ type: 'raw', raw: '' }), false);
  assert.equal(b({ type: 'raw', raw: 'x' }), true);
  assert.equal(b({ type: 'json', raw: '' }), false);
  assert.equal(b({ type: 'json', raw: '{}' }), true);
  assert.equal(b({ type: 'form', raw: '', fields: [] }), false);
  assert.equal(b({ type: 'form', fields: [{ key: 'a', value: '1' }] }), true);
  assert.equal(b({ type: 'form', raw: 'a=1' }), true);
  assert.equal(b({ type: 'multipart', fields: [{ key: 'a', value: '1', kind: 'data' }] }), true);
  assert.equal(b({ type: 'multipart' }), false);
  assert.equal(hasBody(emptyModel()), false);
  assert.equal(hasBody({ body: { type: 'bogus' } }), false);
});

test('contentTypeForBody: per body type', () => {
  assert.equal(contentTypeForBody({ type: 'json' }), 'application/json');
  assert.equal(contentTypeForBody({ type: 'form' }), 'application/x-www-form-urlencoded');
  assert.equal(contentTypeForBody({ type: 'multipart' }), 'multipart/form-data');
  assert.equal(contentTypeForBody({ type: 'raw' }), 'application/x-www-form-urlencoded'); // #1014-E
  assert.equal(contentTypeForBody({ type: 'none' }), null);
  assert.equal(contentTypeForBody({ type: 'weird' }), null);
});

test('resolvedHeaders: derived Content-Type, auth, UA/Referer, options', () => {
  // none
  assert.deepEqual(resolvedHeaders(emptyModel()), []);
  // json -> derived CT appended after explicit headers
  assert.deepEqual(resolvedHeaders(POST_JSON), [
    { name: 'Accept', value: 'application/json' },
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Authorization', value: BASIC },
  ]);
  // form body reflects the curl -d default Content-Type (12a carry-forward)
  assert.deepEqual(resolvedHeaders(FORM), [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
  ]);
  // multipart: no derived CT (curl supplies the boundary)
  assert.deepEqual(resolvedHeaders(MULTI), []);
  // raw body now reflects curl -d's implicit x-www-form-urlencoded CT (#1014-E)
  assert.deepEqual(resolvedHeaders(BEARER_HDRS), [
    { name: 'X-One', value: '1' }, { name: 'X-Two', value: 'two words' },
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    { name: 'Authorization', value: 'Bearer TOK123' },
  ]);
  // existing Content-Type (any case) is not duplicated or overridden
  const hasCt = mk({ method: 'POST', url: 'u', headers: [{ name: 'content-type', value: 'text/plain' }], body: { type: 'json', raw: '{}' } });
  assert.deepEqual(resolvedHeaders(hasCt), [{ name: 'content-type', value: 'text/plain' }]);
  // options
  assert.deepEqual(resolvedHeaders(POST_JSON, { includeContentType: false }), [
    { name: 'Accept', value: 'application/json' }, { name: 'Authorization', value: BASIC },
  ]);
  assert.deepEqual(resolvedHeaders(POST_JSON, { includeAuth: false }), [
    { name: 'Accept', value: 'application/json' }, { name: 'Content-Type', value: 'application/json' },
  ]);
  assert.deepEqual(resolvedHeaders(POST_JSON, { includeContentType: false, includeAuth: false }), [
    { name: 'Accept', value: 'application/json' },
  ]);
  // bearer with empty token -> no Authorization
  assert.deepEqual(resolvedHeaders(mk({ auth: { type: 'bearer', token: '' } })), []);
  // UA + Referer appended last
  const ua = mk({ headers: [{ name: 'A', value: 'b' }], flags: { userAgent: 'UA/1', referer: 'http://r/' } });
  assert.deepEqual(resolvedHeaders(ua), [
    { name: 'A', value: 'b' }, { name: 'User-Agent', value: 'UA/1' }, { name: 'Referer', value: 'http://r/' },
  ]);
  // does not mutate the model
  const before = JSON.stringify(POST_JSON);
  resolvedHeaders(POST_JSON);
  assert.equal(JSON.stringify(POST_JSON), before);
});

// ============================================================
// buildCurl
// ============================================================
test('buildCurl: exact commands', () => {
  assert.equal(buildCurl(GET), 'curl https://x.io/a');
  assert.equal(
    buildCurl(POST_JSON),
    `curl 'https://api.example.com/v1/items?q=a%20b' -u u:p -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"a":"it'\\''s"}' -L -m 30`,
  );
  assert.equal(
    buildCurl(BEARER_HDRS),
    `curl -X PUT https://h.io/r/1 -H 'X-One: 1' -H 'X-Two: two words' -H 'Content-Type: application/x-www-form-urlencoded' -H 'Authorization: Bearer TOK123' -d 'plain text'`,
  );
  assert.equal(
    buildCurl(FORM),
    `curl https://f.io/login -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1&b=x%20y'`,
  );
  assert.equal(buildCurl(MULTI), 'curl https://x.io/u -F a=1 -F f=@/tmp/f.txt');
});

test('buildCurl: method rules', () => {
  const m = (method, body) => mk({ method, url: 'https://x.io', body });
  assert.equal(buildCurl(m('GET')), 'curl https://x.io');
  assert.equal(buildCurl(m('DELETE')), 'curl -X DELETE https://x.io');
  assert.equal(buildCurl(m('POST')), 'curl -X POST https://x.io', 'POST w/o body is explicit');
  assert.equal(buildCurl(m('POST', { type: 'raw', raw: 'x' })), "curl https://x.io -H 'Content-Type: application/x-www-form-urlencoded' -d x", 'POST implied by body');
  assert.equal(buildCurl(m('PUT', { type: 'raw', raw: 'x' })), "curl -X PUT https://x.io -H 'Content-Type: application/x-www-form-urlencoded' -d x");
  assert.equal(buildCurl(m('GET', { type: 'raw', raw: 'x' })), "curl -X GET https://x.io -H 'Content-Type: application/x-www-form-urlencoded' -d x", 'GET+body is explicit');
});

test('buildCurl: options longFlags / multiline', () => {
  assert.equal(
    buildCurl(POST_JSON, { longFlags: true }),
    `curl 'https://api.example.com/v1/items?q=a%20b' --user u:p --header 'Accept: application/json' --header 'Content-Type: application/json' --data '{"a":"it'\\''s"}' --location --max-time 30`,
  );
  assert.equal(
    buildCurl(POST_JSON, { longFlags: true, multiline: true }),
    [
      `curl 'https://api.example.com/v1/items?q=a%20b' \\`,
      `  --user u:p \\`,
      `  --header 'Accept: application/json' \\`,
      `  --header 'Content-Type: application/json' \\`,
      `  --data '{"a":"it'\\''s"}' \\`,
      `  --location \\`,
      `  --max-time 30`,
    ].join('\n'),
  );
  // multiline output tokenises back to the same single-line command's model
  assert.deepEqual(parseCurl(buildCurl(POST_JSON, { multiline: true })), parseCurl(buildCurl(POST_JSON)));
  assert.equal(buildCurl(GET, { multiline: true }), 'curl https://x.io/a');
});

test('buildCurl: flags and auth', () => {
  const m = mk({ url: 'https://x.io', flags: { followRedirects: true, insecure: true, compressed: true, timeout: 5 } });
  assert.equal(buildCurl(m), 'curl https://x.io -L -k --compressed -m 5');
  assert.equal(buildCurl(m, { longFlags: true }), 'curl https://x.io --location --insecure --compressed --max-time 5');
  const ua = mk({ url: 'https://x.io', flags: { userAgent: 'UA/1', referer: 'http://r/' } });
  assert.equal(buildCurl(ua), "curl https://x.io -H 'User-Agent: UA/1' -H 'Referer: http://r/'");
  assert.equal(buildCurl(mk({ url: 'h', auth: { type: 'basic', user: 'u', pass: '' } })), 'curl h -u u:');
  assert.equal(buildCurl(mk({ url: 'h', auth: { type: 'basic', user: 'a b', pass: "p'q" } })), "curl h -u 'a b:p'\\''q'");
  assert.equal(buildCurl(mk({ url: 'h', auth: { type: 'bearer', token: 'T' } })), "curl h -H 'Authorization: Bearer T'");
});

test('buildCurl: form urlencode uses --data-urlencode; raw-form fallback', () => {
  const f = mk({ method: 'POST', url: 'h', body: { type: 'form', urlencode: true, fields: [{ key: 'a', value: 'x y' }, { key: 'b', value: '2' }] } });
  assert.equal(buildCurl(f), "curl h -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'a=x y' --data-urlencode b=2");
  const r = mk({ method: 'POST', url: 'h', body: { type: 'form', raw: 'k=v&z=1' } });
  assert.equal(buildCurl(r), "curl h -H 'Content-Type: application/x-www-form-urlencoded' -d 'k=v&z=1'");
});

// ============================================================
// buildWget
// ============================================================
test('buildWget: exact commands', () => {
  assert.equal(buildWget(GET), 'wget https://x.io/a');
  assert.equal(
    buildWget(POST_JSON),
    `wget --method=POST --header='Accept: application/json' --header='Content-Type: application/json' --user=u --password=p --body-data='{"a":"it'\\''s"}' --timeout=30 'https://api.example.com/v1/items?q=a%20b'`,
  );
  assert.equal(
    buildWget(BEARER_HDRS),
    `wget --method=PUT --header='X-One: 1' --header='X-Two: two words' --header='Content-Type: application/x-www-form-urlencoded' --header='Authorization: Bearer TOK123' --body-data='plain text' https://h.io/r/1`,
  );
  assert.equal(
    buildWget(FORM),
    `wget --method=POST --header='Content-Type: application/x-www-form-urlencoded' --post-data='a=1&b=x%20y' https://f.io/login`,
  );
});

test('buildWget: flags, multiline, multipart note', () => {
  const m = mk({ url: 'https://x.io', flags: { insecure: true, compressed: true, timeout: 9 } });
  assert.equal(buildWget(m), 'wget --no-check-certificate --compression=auto --timeout=9 https://x.io');
  assert.equal(buildWget(mk({ url: 'h', auth: { type: 'basic', user: 'u', pass: '' } })), 'wget --user=u h');
  assert.equal(
    buildWget(MULTI),
    '# note: wget has no multipart/form-data support — fields omitted.\nwget --method=POST https://x.io/u',
  );
  assert.equal(
    buildWget(BEARER_HDRS, { multiline: true }),
    [
      'wget \\',
      '  --method=PUT \\',
      "  --header='X-One: 1' \\",
      "  --header='X-Two: two words' \\",
      "  --header='Content-Type: application/x-www-form-urlencoded' \\",
      "  --header='Authorization: Bearer TOK123' \\",
      // quirk: the trailing URL is grouped onto the last value-flag line (joinCmd pairs flag + next non-flag)
      "  --body-data='plain text' https://h.io/r/1",
    ].join('\n'),
  );
});

// ============================================================
// Language generators -- EXACT: fetch + python
// ============================================================
test('toFetch: exact snippets', () => {
  assert.equal(toFetch(GET), [
    'const res = await fetch("https://x.io/a", {',
    '  method: "GET",',
    '});',
    'const data = await res.text();',
    'console.log(res.status, data);',
  ].join('\n'));
  assert.equal(toFetch(POST_JSON), [
    'const res = await fetch("https://api.example.com/v1/items?q=a%20b", {',
    '  method: "POST",',
    '  headers: {',
    '    "Accept": "application/json",',
    '    "Content-Type": "application/json",',
    '    "Authorization": "Basic dTpw",',
    '  },',
    '  body: "{\\"a\\":\\"it\'s\\"}",',
    "  redirect: 'follow',",
    '});',
    'const data = await res.text();',
    'console.log(res.status, data);',
  ].join('\n'));
  assert.equal(toFetch(FORM), [
    'const body = new URLSearchParams();',
    'body.append("a", "1");',
    'body.append("b", "x y");',
    'const res = await fetch("https://f.io/login", {',
    '  method: "POST",',
    '  headers: {',
    '    "Content-Type": "application/x-www-form-urlencoded",',
    '  },',
    '  body,',
    '});',
    'const data = await res.text();',
    'console.log(res.status, data);',
  ].join('\n'));
  assert.equal(toFetch(MULTI), [
    'const body = new FormData();',
    'body.append("a", "1");',
    '// body.append("f", fileInput.files[0]); // "/tmp/f.txt"',
    'const res = await fetch("https://x.io/u", {',
    '  method: "POST",',
    '  body,',
    '});',
    'const data = await res.text();',
    'console.log(res.status, data);',
  ].join('\n'));
  assert.ok(toFetch(mk({ url: 'h', flags: { insecure: true } })).startsWith('// Note: browsers cannot disable TLS verification'));
});

test('toPython: exact snippets', () => {
  assert.equal(toPython(GET), [
    'import requests', '', '',
    'resp = requests.request(',
    '    "GET",',
    '    "https://x.io/a",',
    '    allow_redirects=False,',
    ')',
    'print(resp.status_code, resp.text)',
  ].join('\n'));
  assert.equal(toPython(POST_JSON), [
    'import requests', '',
    'headers = {',
    '    "Accept": "application/json",',
    '    "Content-Type": "application/json",',
    '}', '',
    'resp = requests.request(',
    '    "POST",',
    '    "https://api.example.com/v1/items?q=a%20b",',
    '    headers=headers,',
    '    auth=("u", "p"),',
    '    data="{\\"a\\":\\"it\'s\\"}",',
    '    timeout=30,',
    ')',
    'print(resp.status_code, resp.text)',
  ].join('\n'));
  // bearer rides in headers, not auth=
  assert.equal(toPython(BEARER_HDRS), [
    'import requests', '',
    'headers = {',
    '    "X-One": "1",',
    '    "X-Two": "two words",',
    '    "Content-Type": "application/x-www-form-urlencoded",',
    '    "Authorization": "Bearer TOK123",',
    '}', '',
    'resp = requests.request(',
    '    "PUT",',
    '    "https://h.io/r/1",',
    '    headers=headers,',
    '    data="plain text",',
    '    allow_redirects=False,',
    ')',
    'print(resp.status_code, resp.text)',
  ].join('\n'));
  assert.equal(toPython(FORM), [
    'import requests', '',
    'headers = {',
    '    "Content-Type": "application/x-www-form-urlencoded",',
    '}',
    'data = {',
    '    "a": "1",',
    '    "b": "x y",',
    '}', '',
    'resp = requests.request(',
    '    "POST",',
    '    "https://f.io/login",',
    '    headers=headers,',
    '    data=data,',
    '    allow_redirects=False,',
    ')',
    'print(resp.status_code, resp.text)',
  ].join('\n'));
  const mp = toPython(MULTI);
  assert.ok(mp.includes('files = {\n    "a": (None, "1"),\n    "f": open("/tmp/f.txt", "rb"),\n}'));
  assert.ok(mp.includes('    files=files,'));
  const flags = toPython(mk({ url: 'h', flags: { insecure: true, timeout: 4, followRedirects: true } }));
  assert.ok(flags.includes('    verify=False,') && flags.includes('    timeout=4,') && !flags.includes('allow_redirects'));
});

// ============================================================
// Language generators -- STRUCTURAL: node / httpie / powershell / go (+ cross-language field check)
// ============================================================
const langs = { fetch: toFetch, node: toNode, python: toPython, httpie: toHttpie, powershell: toPowerShell, go: toGo };

test('toNode: structure + node-specific lines', () => {
  const s = toNode(POST_JSON);
  assert.ok(s.startsWith('// Node 18+ (global fetch)\n'));
  assert.ok(s.includes('await fetch("https://api.example.com/v1/items?q=a%20b", {'));
  assert.ok(s.includes('  method: "POST",'));
  assert.ok(s.includes('    "Accept": "application/json",'));
  assert.ok(s.includes('    "Authorization": "Basic dTpw",'));
  assert.ok(s.includes('  body: "{\\"a\\":\\"it\'s\\"}",'));
  assert.ok(s.includes("  redirect: 'follow',"));
  assert.ok(s.includes('  signal: AbortSignal.timeout(30000),'));
  assert.ok(s.endsWith('console.log(res.status, await res.text());'));
  assert.ok(toNode(FORM).includes('const body = new URLSearchParams();\nbody.append("a", "1");\nbody.append("b", "x y");'));
  assert.ok(toNode(MULTI).includes('// body.append("f", new Blob([...])); // file: "/tmp/f.txt"'));
  assert.ok(toNode(mk({ url: 'h', flags: { insecure: true } })).startsWith('// Insecure TLS (-k): set NODE_TLS_REJECT_UNAUTHORIZED=0'));
  assert.ok(toNode(GET).includes('  method: "GET",'));
});

test('toHttpie: exact + structure', () => {
  assert.equal(toHttpie(GET), 'http GET https://x.io/a');
  assert.equal(
    toHttpie(POST_JSON),
    `echo '{"a":"it'\\''s"}' | http --follow --timeout=30 -a u:p POST 'https://api.example.com/v1/items?q=a%20b' Accept:application/json`,
  );
  // bearer -> Authorization header item; raw body piped
  assert.equal(
    toHttpie(BEARER_HDRS),
    `echo 'plain text' | http PUT https://h.io/r/1 X-One:1 'X-Two:two words' 'Authorization:Bearer TOK123'`,
  );
  // form -> --form + k=v items; Content-Type header suppressed (httpie derives it)
  assert.equal(toHttpie(FORM), "http --form POST https://f.io/login a=1 'b=x y'");
  assert.equal(toHttpie(MULTI), 'http POST https://x.io/u a=1 f@/tmp/f.txt');
  assert.equal(toHttpie(mk({ url: 'h', flags: { insecure: true } })), 'http --verify=no GET h');
});

test('toPowerShell: exact + structure', () => {
  assert.equal(toPowerShell(GET), "Invoke-WebRequest -Uri 'https://x.io/a' -Method GET -MaximumRedirection 0");
  assert.equal(toPowerShell(POST_JSON), [
    '$headers = @{',
    "    'Accept' = 'application/json'",
    "    'Content-Type' = 'application/json'",
    "    'Authorization' = 'Basic dTpw'",
    '}',
    `$body = '{"a":"it''s"}'`,
    "Invoke-WebRequest -Uri 'https://api.example.com/v1/items?q=a%20b' -Method POST -Headers $headers -Body $body -TimeoutSec 30",
  ].join('\n'));
  const f = toPowerShell(FORM);
  assert.ok(f.includes("'Content-Type' = 'application/x-www-form-urlencoded'"));
  assert.ok(f.includes("$body = 'a=1&b=x%20y'"));
  assert.ok(f.includes('-Method POST') && f.includes('-Body $body'));
  const mp = toPowerShell(MULTI);
  assert.ok(mp.startsWith('# multipart/form-data: use -Form @{ ... } (PowerShell 6.1+)'));
  assert.ok(!mp.includes('-Body'));
  assert.ok(toPowerShell(mk({ url: 'h', flags: { insecure: true } })).includes('-SkipCertificateCheck'));
});

test('toGo: exact + structure', () => {
  assert.equal(toGo(GET), [
    'package main', '',
    'import (', '\t"fmt"', '\t"io"', '\t"net/http"', ')', '',
    'func main() {',
    '\treq, _ := http.NewRequest("GET", "https://x.io/a", nil)',
    '\tresp, err := http.DefaultClient.Do(req)',
    '\tif err != nil { panic(err) }',
    '\tdefer resp.Body.Close()',
    '\tout, _ := io.ReadAll(resp.Body)',
    '\tfmt.Println(resp.Status, string(out))',
    '}',
  ].join('\n'));
  const s = toGo(POST_JSON);
  assert.ok(s.includes('\t"strings"\n'));
  assert.ok(s.includes('\tbody := strings.NewReader("{\\"a\\":\\"it\'s\\"}")'));
  assert.ok(s.includes('\treq, _ := http.NewRequest("POST", "https://api.example.com/v1/items?q=a%20b", body)'));
  assert.ok(s.includes('\treq.Header.Set("Accept", "application/json")'));
  assert.ok(s.includes('\treq.Header.Set("Content-Type", "application/json")'));
  assert.ok(s.includes('\treq.Header.Set("Authorization", "Basic dTpw")'));
  assert.ok(toGo(FORM).includes('strings.NewReader("a=1&b=x%20y")'));
  assert.ok(toGo(MULTI).includes('// multipart: build with mime/multipart.Writer'));
  assert.ok(toGo(mk({ url: 'h', flags: { insecure: true } })).startsWith('// Insecure TLS (-k)'));
});

// Cross-language: every modeled field must be represented in every generator.
function authNeedles(m, lang) {
  if (m.auth.type === 'basic') {
    if (lang === 'python') return [`("${m.auth.user}", "${m.auth.pass}")`];
    if (lang === 'httpie') return [`-a ${m.auth.user}:${m.auth.pass}`];
    return [basicHeaderValue(m.auth.user, m.auth.pass)];
  }
  if (m.auth.type === 'bearer') return [`Bearer ${m.auth.token}`];
  return [];
}
test('all generators represent method + url + headers + body + auth', () => {
  const cases = [
    ['GET', GET, { url: 'https://x.io/a', method: 'GET', body: [] }],
    ['POST json basic', POST_JSON, { url: 'https://api.example.com/v1/items?q=a%20b', method: 'POST', hdr: ['Accept', 'application/json'], body: ['it'] }],
    ['PUT raw bearer', BEARER_HDRS, { url: 'https://h.io/r/1', method: 'PUT', hdr: ['X-One', 'X-Two', 'two words'], body: ['plain text'] }],
    ['POST form', FORM, { url: 'https://f.io/login', method: 'POST', body: ['a', 'x y'] }],
  ];
  for (const [name, m, exp] of cases) {
    for (const [lang, fn] of Object.entries(langs)) {
      const out = fn(m);
      const where = `${name} / ${lang}`;
      assert.ok(out.includes(exp.url), `${where}: url`);
      assert.ok(out.includes(exp.method), `${where}: method`);
      for (const h of exp.hdr || []) assert.ok(out.includes(h), `${where}: header ${h}`);
      for (const b of exp.body) {
        // powershell/go send the form as one pre-encoded string ("x%20y"), not per-field
        const needle = name === 'POST form' && (lang === 'powershell' || lang === 'go') ? b.replace(' ', '%20') : b;
        assert.ok(out.includes(needle), `${where}: body ${b}`);
      }
      for (const a of authNeedles(m, lang)) assert.ok(out.includes(a), `${where}: auth ${a}`);
    }
  }
});

test('all generators represent multipart fields (file as @/comment)', () => {
  for (const [lang, fn] of Object.entries(langs)) {
    const out = fn(MULTI);
    assert.ok(out.includes('https://x.io/u'), lang);
    assert.ok(out.includes('POST'), lang);
    if (lang === 'powershell' || lang === 'go') {
      // lossy by design: emitted as a guidance comment, fields themselves are NOT rendered
      assert.ok(/multipart/.test(out), `${lang}: multipart comment`);
      assert.ok(!out.includes('/tmp/f.txt'), `${lang}: fields omitted`);
    } else {
      assert.ok(out.includes('/tmp/f.txt'), `${lang}: file path`);
      assert.ok(out.includes('"a"') || out.includes('a=1'), `${lang}: text field`);
    }
  }
});

test('User-Agent / Referer flags reach header-based generators', () => {
  const m = mk({ url: 'https://x.io', flags: { userAgent: 'UA/1', referer: 'http://r/' } });
  for (const lang of ['fetch', 'node', 'python', 'powershell', 'go']) {
    const out = langs[lang](m);
    assert.ok(out.includes('UA/1') && out.includes('http://r/'), lang);
  }
  assert.ok(buildCurl(m).includes('UA/1'));
  // httpie renders them as header items
  assert.ok(toHttpie(m).includes('User-Agent:UA/1') && toHttpie(m).includes('Referer:http://r/'));
});

test('special characters survive in each language literal', () => {
  const m = mk({ method: 'POST', url: 'https://x.io', headers: [{ name: 'X-Q', value: 'a"b\\c' }], body: { type: 'raw', raw: 'l1\nl2 "q" \\' } });
  assert.ok(toFetch(m).includes('"X-Q": "a\\"b\\\\c"') && toFetch(m).includes('body: "l1\\nl2 \\"q\\" \\\\"'));
  assert.ok(toPython(m).includes('"X-Q": "a\\"b\\\\c"') && toPython(m).includes('data="l1\\nl2 \\"q\\" \\\\"'));
  assert.ok(toGo(m).includes('NewReader("l1\\nl2 \\"q\\" \\\\")'));
  const ps = toPowerShell(m);
  assert.ok(ps.includes("'X-Q' = 'a\"b\\c'") && ps.includes("$body = 'l1\nl2 \"q\" \\'"));
  assert.ok(buildCurl(m).includes("-d 'l1\nl2 \"q\" \\'"));
});

// ============================================================
// convert / CONVERT_LANGS
// ============================================================
test('CONVERT_LANGS content', () => {
  assert.deepEqual(CONVERT_LANGS, ['fetch', 'node', 'python', 'httpie', 'powershell', 'go']);
});

test('convert dispatches to to<Lang> for every CONVERT_LANGS id', () => {
  const fns = { fetch: toFetch, node: toNode, python: toPython, httpie: toHttpie, powershell: toPowerShell, go: toGo };
  for (const lang of CONVERT_LANGS) {
    for (const m of [GET, POST_JSON, BEARER_HDRS, FORM, MULTI, emptyModel()]) {
      assert.equal(convert(m, lang), fns[lang](m), lang);
    }
  }
});

test('convert: unknown / missing lang falls back to fetch', () => {
  for (const l of ['ruby', '', undefined, null, 'FETCH', 42]) assert.equal(convert(POST_JSON, l), toFetch(POST_JSON), String(l));
});

// ============================================================
// Round-trip: parseCurl(buildCurl(model)) ~ model
// ============================================================
// Compare semantically: effective headers (resolved incl. Content-Type) + body payload text + the rest.
function semantic(m) {
  const n = normalizeModel(m);
  const bodyText = n.body.type === 'form' && n.body.fields.length ? encodeForm(n.body.fields) : n.body.raw;
  return {
    method: n.method, url: n.url, params: n.params,
    headers: resolvedHeaders(n, { includeAuth: false }).filter((h) => !/^(user-agent|referer)$/i.test(h.name)),
    auth: n.auth,
    bodyText: n.body.type === 'multipart' ? n.body.fields.map((f) => `${f.kind}:${f.key}=${f.value}`) : bodyText,
    flags: n.flags,
  };
}
const RT = {
  'plain GET': GET,
  'GET with params': mk({ url: 'https://x.io/s', params: [{ key: 'a', value: '1' }, { key: 'b', value: 'x y' }] }),
  'DELETE': mk({ method: 'DELETE', url: 'https://x.io/r/9' }),
  'POST no body': mk({ method: 'POST', url: 'https://x.io/p' }),
  'POST json + basic': POST_JSON,
  'PUT raw + bearer': BEARER_HDRS,
  'POST form': FORM,
  'POST multipart': MULTI,
  'all flags': mk({ url: 'https://x.io', flags: { followRedirects: true, insecure: true, compressed: true, timeout: 12, userAgent: 'UA/2', referer: 'http://ref/' } }),
  'quotes in header/body': mk({ method: 'POST', url: 'https://x.io', headers: [{ name: 'X-A', value: "it's \"q\"" }], body: { type: 'raw', raw: "it's $HOME `x`\n2nd" } }),
  'basic empty pass': mk({ url: 'https://x.io', auth: { type: 'basic', user: 'solo', pass: '' } }),
  'duplicate headers': mk({ url: 'https://x.io', headers: [{ name: 'X', value: '1' }, { name: 'X', value: '2' }] }),
};
test('round-trip: parseCurl(buildCurl(model)) is semantically equal', () => {
  for (const [name, m] of Object.entries(RT)) {
    for (const opts of [{}, { longFlags: true }, { multiline: true }, { longFlags: true, multiline: true }]) {
      const back = parseCurl(buildCurl(m, opts));
      assert.deepEqual(back.notes, [], `${name} notes`);
      assert.deepEqual(semantic(back), semantic(m), `${name} ${JSON.stringify(opts)}`);
    }
  }
});

test('round-trip: wire-level fields identical (method/url/params/auth/flags)', () => {
  for (const [name, m] of Object.entries(RT)) {
    const b = noNotes(parseCurl(buildCurl(m)));
    assert.equal(b.method, m.method, name);
    assert.equal(b.url, m.url, name);
    assert.deepEqual(b.params, m.params, name);
    assert.deepEqual(b.auth, m.auth, name);
    assert.deepEqual(b.flags, m.flags, name);
  }
});

test('round-trip: -d default Content-Type survives (form) and is explicit in the command', () => {
  const cmd = buildCurl(FORM);
  assert.ok(cmd.includes("-H 'Content-Type: application/x-www-form-urlencoded'"));
  const back = parseCurl(cmd);
  assert.deepEqual(back.headers, [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }]);
  assert.equal(back.method, 'POST');
  // and resolvedHeaders of the parsed-back model adds nothing further (no duplicate CT)
  assert.deepEqual(resolvedHeaders(back), [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }]);
  // parsed back as raw -> raw now derives x-www-form-urlencoded too (#1014-E); resolvedHeaders still
  // de-dupes against the explicit header (asserted above), so no duplicate CT is emitted.
  assert.equal(contentTypeForBody(back.body), 'application/x-www-form-urlencoded');
});

test('round-trip: documented lossy fields', () => {
  // json -> raw (+ explicit Content-Type header); payload text preserved
  const j = parseCurl(buildCurl(POST_JSON));
  assert.equal(j.body.type, 'raw');
  assert.equal(j.body.raw, POST_JSON.body.raw);
  assert.ok(j.headers.some((h) => h.name === 'Content-Type' && h.value === 'application/json'));
  // form fields -> raw urlencoded string, fields[] dropped
  const f = parseCurl(buildCurl(FORM));
  assert.equal(f.body.type, 'raw');
  assert.equal(f.body.raw, 'a=1&b=x%20y');
  assert.deepEqual(f.body.fields, []);
  // multipart text field kind 'data' preserved, file preserved
  const mp = parseCurl(buildCurl(MULTI));
  assert.equal(mp.body.type, 'multipart');
  assert.deepEqual(mp.body.fields.map((x) => [x.key, x.value, x.kind]), [['a', '1', 'data'], ['f', '/tmp/f.txt', 'file']]);
  // '+' in query normalises to %20 and fragment is not modelled separately
  const q = parseCurl(buildCurl(mk({ url: 'https://x.io/s?a=x+y' })));
  assert.equal(q.url, 'https://x.io/s');
  assert.deepEqual(q.params, [{ key: 'a', value: 'x y' }]);
  // bearer comes back as bearer (lifted from the Authorization header), header removed
  const b = parseCurl(buildCurl(BEARER_HDRS));
  assert.deepEqual(b.auth, { type: 'bearer', user: '', pass: '', token: 'TOK123' });
  assert.ok(!b.headers.some((h) => /authorization/i.test(h.name)));
});

test('round-trip: header-supplied User-Agent/Referer are lifted back into flags', () => {
  const back = parseCurl(buildCurl(RT['all flags']));
  assert.equal(back.flags.userAgent, 'UA/2');
  assert.equal(back.flags.referer, 'http://ref/');
  assert.deepEqual(back.headers, []);
});

test('round-trip: wget output is not curl but parses cleanly via its own build (sanity: strings differ)', () => {
  assert.notEqual(buildWget(POST_JSON), buildCurl(POST_JSON));
  assert.ok(buildWget(POST_JSON).startsWith('wget '));
});

// ============================================================
// Edges / TOTAL
// ============================================================
test('TOTAL: empty / null / garbage models never throw and give actual output', () => {
  for (const bad of [undefined, null, {}, 'str', 7, [], { method: 5, headers: 'x', body: 9 }]) {
    for (const fn of [buildCurl, buildWget, toFetch, toNode, toPython, toHttpie, toPowerShell, toGo]) {
      assert.equal(typeof fn(bad), 'string', `${fn.name}(${JSON.stringify(bad)})`);
    }
    for (const l of [...CONVERT_LANGS, 'nope']) assert.equal(typeof convert(bad, l), 'string');
    assert.ok(Array.isArray(resolvedHeaders(normalizeModel(bad))));
  }
  assert.equal(buildCurl({}), "curl ''");
  assert.equal(buildCurl(null), "curl ''");
  assert.equal(buildWget({}), "wget ''");
  assert.equal(toHttpie({}), "http GET ''");
  assert.equal(toPowerShell({}), "Invoke-WebRequest -Uri '' -Method GET -MaximumRedirection 0");
  assert.equal(toFetch(undefined), 'const res = await fetch("", {\n  method: "GET",\n});\nconst data = await res.text();\nconsole.log(res.status, data);');
});

test('TOTAL: builders do not mutate their input model', () => {
  const snap = JSON.stringify(POST_JSON);
  for (const fn of [buildCurl, buildWget, toFetch, toNode, toPython, toHttpie, toPowerShell, toGo]) fn(POST_JSON);
  assert.equal(JSON.stringify(POST_JSON), snap);
});

test('edge: no-body GET has no body in any generator; empty body strings emit nothing', () => {
  assert.ok(!buildCurl(GET).includes('-d'));
  assert.ok(!toFetch(GET).includes('body'));
  assert.ok(!toNode(GET).includes('body'));
  assert.ok(!toPython(GET).includes('data'));
  assert.ok(!toGo(GET).includes('strings'));
  const empty = mk({ method: 'POST', url: 'h', body: { type: 'raw', raw: '' } });
  assert.equal(buildCurl(empty), 'curl -X POST h');
  assert.equal(buildWget(empty), 'wget --method=POST h');
});

test('edge: form with raw only (no fields) is parsed into fields by generators', () => {
  const m = mk({ method: 'POST', url: 'h', body: { type: 'form', raw: 'a=1&b=2' } });
  assert.ok(toFetch(m).includes('body.append("a", "1");') && toFetch(m).includes('body.append("b", "2");'));
  assert.ok(toPython(m).includes('"a": "1",') && toPython(m).includes('"b": "2",'));
  assert.ok(toHttpie(m).includes('a=1') && toHttpie(m).includes('b=2'));
  assert.ok(toPowerShell(m).includes("$body = 'a=1&b=2'"));
  assert.ok(toGo(m).includes('strings.NewReader("a=1&b=2")'));
  assert.equal(buildWget(m), "wget --method=POST --header='Content-Type: application/x-www-form-urlencoded' --post-data='a=1&b=2' h");
});

test('edge: query params are folded into the URL in every generator', () => {
  const m = mk({ url: 'https://x.io/s', params: [{ key: 'a', value: '1' }, { key: 'b c', value: 'd&e' }] });
  const u = 'https://x.io/s?a=1&b%20c=d%26e';
  for (const [lang, fn] of Object.entries(langs)) assert.ok(fn(m).includes(u), lang);
  assert.ok(buildCurl(m).includes(u) && buildWget(m).includes(u));
});

test('edge: basic auth variants', () => {
  const m = mk({ url: 'h', auth: { type: 'basic', user: 'us er', pass: '' } });
  assert.ok(toPython(m).includes('auth=("us er", "")'));
  assert.ok(toHttpie(m).includes("-a 'us er:'"));
  assert.ok(toFetch(m).includes(`"Authorization": "${basicHeaderValue('us er', '')}"`));
  assert.ok(toPowerShell(m).includes(basicHeaderValue('us er', '')));
});

test('raw body derives curl -d\'s implicit x-www-form-urlencoded Content-Type [#1014-E]', () => {
  // Fixed: a raw body (curl -d / wget --post-data) now reports application/x-www-form-urlencoded,
  // so resolvedHeaders and every generator surface the Content-Type the real request sends.
  assert.deepEqual(resolvedHeaders(mk({ method: 'POST', url: 'h', body: { type: 'raw', raw: 'a=1' } })),
    [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }]);
  assert.ok(toFetch(mk({ method: 'POST', url: 'h', body: { type: 'raw', raw: 'a=1' } }))
    .includes('"Content-Type": "application/x-www-form-urlencoded"'));
  // an EMPTY raw body still derives nothing (no spurious Content-Type)
  assert.equal(resolvedHeaders(mk({ method: 'POST', url: 'h', body: { type: 'raw', raw: '' } })).length, 0);
});
