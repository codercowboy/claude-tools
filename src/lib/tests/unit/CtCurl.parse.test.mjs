// Unit tests for CtCurl.mjs -- PARSE side (Phase 12a): tokenizeShell, parseCurl, parseWget and the
// model / URL / encoding helpers. Zero-dep (node:test + node:assert/strict).
// Run: node --test src/lib/tests/
//
// Strategy: TABLE-DRIVEN. Every CtCurl function is TOTAL -- bad input yields a best-effort model plus a
// `notes` entry and NEVER throws -- so malformed cases assert the ACTUAL model + notes, never an
// exception. Lossy behaviour (e.g. --data-urlencode does not percent-encode, -o is ignored) is pinned
// to what the lib really does. Builders / language generators / output helpers are 12b (not here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METHODS, AUTH_TYPES, BODY_TYPES,
  emptyModel, normalizeModel, modelWithoutSecrets,
  splitUrlParams, applyUrlParams, fullUrl, safeDecode,
  utf8ToBase64, base64ToUtf8, basicHeaderValue, decodeBasic,
  tokenizeShell, parseCurl, parseWget, parseFormPairs,
} from '../../utils/formats/CtCurl.mjs';

// model with `notes` stripped, for whole-model comparisons
const noNotes = (r) => { const { notes, ...m } = r; return m; };
// build an expected model from the empty default + overrides (shallow per top-level key, deep for flags/auth/body)
function expectModel(o = {}) {
  const m = emptyModel();
  if (o.method) m.method = o.method;
  if (o.url !== undefined) m.url = o.url;
  if (o.params) m.params = o.params;
  if (o.headers) m.headers = o.headers;
  if (o.auth) Object.assign(m.auth, o.auth);
  if (o.body) Object.assign(m.body, o.body);
  if (o.flags) Object.assign(m.flags, o.flags);
  return m;
}

// ============================================================
// constants
// ============================================================
test('constants: METHODS / AUTH_TYPES / BODY_TYPES', () => {
  assert.deepEqual(METHODS, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  assert.deepEqual(AUTH_TYPES, ['none', 'basic', 'bearer']);
  assert.deepEqual(BODY_TYPES, ['none', 'raw', 'json', 'form', 'multipart']);
});

// ============================================================
// tokenizeShell
// ============================================================
const TOKENS = [
  ['empty string', '', []],
  ['whitespace only', '  \t \n ', []],
  ['plain words', 'curl -X POST url', ['curl', '-X', 'POST', 'url']],
  ['multiple spaces / tabs / newlines split', 'a  b\tc\nd\r\ne', ['a', 'b', 'c', 'd', 'e']],
  ['single quotes are literal', "'a b' 'c\\d' '\"q\"'", ['a b', 'c\\d', '"q"']],
  ['double quotes keep spaces', '"a b" "c  d"', ['a b', 'c  d']],
  ['dquote escapes \\" \\\\ \\$ \\`', '"a\\"b\\\\c\\$d\\`e"', ['a"b\\c$d`e']],
  ['dquote keeps backslash before other chars', '"a\\nb"', ['a\\nb']],
  ['dquote does NOT expand $VAR', '"$HOME"', ['$HOME']],
  ['backslash escape outside quotes', 'a\\ b c\\"d', ['a b', 'c"d']],
  ['trailing lone backslash kept literally', 'abc\\', ['abc\\']],
  ['line continuation (LF) removed', 'curl \\\n  -X POST \\\n  url', ['curl', '-X', 'POST', 'url']],
  ['line continuation (CRLF) removed', 'curl \\\r\n  url', ['curl', 'url']],
  ['line continuation inside dquotes', '"ab\\\ncd"', ['abcd']],
  ['adjacent quote concatenation', "-d'x' -d\"y\" a'b'\"c\"d", ['-dx', '-dy', 'abcd']],
  ['mixed quoting in one token', `a"b c"'d e'\\ f`, ['ab cd e f']],
  ['empty quotes make an empty token', "'' \"\" x", ['', '', 'x']],
  ['unterminated single quote runs to EOF', "'abc def", ['abc def']],
  ['unterminated double quote runs to EOF', '"abc def', ['abc def']],
  ['ANSI-C $\'..\' escapes', "$'a\\nb\\tc'", ['a\nb\tc']],
  ['ANSI-C hex/unicode/quote escapes', "$'\\x41\\u0042\\'\\\\'", ["AB'\\"]],
  ['ANSI-C unknown escape drops the backslash', "$'\\q'", ['q']],
  ['JSON body in single quotes survives intact', `-d '{"a": "b c", "n": 1}'`, ['-d', '{"a": "b c", "n": 1}']],
  ['non-string input is coerced (null -> no tokens)', null, []],
  ['non-string input is coerced (number)', 42, ['42']],
];
for (const [name, input, expected] of TOKENS) {
  test(`tokenizeShell: ${name}`, () => assert.deepEqual(tokenizeShell(input), expected));
}

// ============================================================
// parseCurl -- flag table (assert the relevant slice, not every default)
// ============================================================
// expect: object of dotted-path -> value, compared with deepEqual against the parsed result.
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const CURL = [
  // ---- URL forms ----
  { name: 'bare URL -> GET, no body', cmd: 'curl https://x.test/a', expect: { method: 'GET', url: 'https://x.test/a', params: [], 'body.type': 'none' } },
  { name: 'leading "curl" is optional', cmd: 'https://x.test/a', expect: { url: 'https://x.test/a', method: 'GET' } },
  { name: 'leading CURL is case-insensitive', cmd: 'CURL https://x.test/', expect: { url: 'https://x.test/' } },
  // --url is a recognised flag (#1014-L): both the space form and the =value form set the URL, no note.
  { name: '--url flag (space form) sets the URL [#1014-L]', cmd: 'curl --url https://x.test/u', expect: { url: 'https://x.test/u', notes: [] } },
  { name: '--url=value form sets the URL [#1014-L]', cmd: 'curl --url=https://x.test/u', expect: { url: 'https://x.test/u', notes: [] } },
  { name: 'URL flag AFTER other flags', cmd: 'curl -L -k https://x.test/z', expect: { url: 'https://x.test/z', 'flags.followRedirects': true, 'flags.insecure': true } },
  { name: 'query string split into params (decoded)', cmd: "curl 'https://x.test/s?q=a%20b&n=1&flag&x=a+b'", expect: { url: 'https://x.test/s', params: [{ key: 'q', value: 'a b' }, { key: 'n', value: '1' }, { key: 'flag', value: '' }, { key: 'x', value: 'a b' }] } },

  // ---- -X / --request ----
  { name: '-X POST', cmd: 'curl -X POST https://x.test/', expect: { method: 'POST' } },
  { name: '--request PUT', cmd: 'curl --request PUT https://x.test/', expect: { method: 'PUT' } },
  { name: '--request=DELETE', cmd: 'curl --request=DELETE https://x.test/', expect: { method: 'DELETE' } },
  { name: '-X is upper-cased', cmd: 'curl -X patch https://x.test/', expect: { method: 'PATCH' } },
  { name: '-X HEAD / OPTIONS pass through', cmd: 'curl -X OPTIONS https://x.test/', expect: { method: 'OPTIONS' } },
  { name: '-X custom verb passes through (not validated)', cmd: 'curl -X PURGE https://x.test/', expect: { method: 'PURGE' } },
  { name: '-XPOST cluster', cmd: 'curl -XPOST https://x.test/', expect: { method: 'POST', url: 'https://x.test/' } },

  // ---- headers ----
  { name: '-H single', cmd: "curl -H 'Accept: application/json' https://x.test/", expect: { headers: [{ name: 'Accept', value: 'application/json' }] } },
  { name: '--header repeated keeps order', cmd: "curl --header 'A: 1' -H 'B: 2' -H 'C:3' https://x.test/", expect: { headers: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }, { name: 'C', value: '3' }] } },
  { name: 'header value keeps inner colons', cmd: "curl -H 'X-Time: 12:30:45' https://x.test/", expect: { headers: [{ name: 'X-Time', value: '12:30:45' }] } },
  { name: 'header name/value trimmed', cmd: "curl -H '  X-A :   v  ' https://x.test/", expect: { headers: [{ name: 'X-A', value: 'v' }] } },
  { name: 'Authorization: Bearer lifted into auth', cmd: "curl -H 'Authorization: Bearer tok123' https://x.test/", expect: { headers: [], 'auth.type': 'bearer', 'auth.token': 'tok123', 'auth.user': '' } },
  { name: 'Authorization: Basic lifted + decoded', cmd: `curl -H 'Authorization: Basic ${Buffer.from('al:pw:x').toString('base64')}' https://x.test/`, expect: { headers: [], 'auth.type': 'basic', 'auth.user': 'al', 'auth.pass': 'pw:x' } },
  { name: 'Authorization: other scheme kept as a header', cmd: "curl -H 'Authorization: Digest abc' https://x.test/", expect: { headers: [{ name: 'Authorization', value: 'Digest abc' }], 'auth.type': 'none' } },
  { name: 'User-Agent header lifted into flags.userAgent', cmd: "curl -H 'User-Agent: Bot/1' https://x.test/", expect: { headers: [], 'flags.userAgent': 'Bot/1' } },
  { name: 'Referer header lifted into flags.referer', cmd: "curl -H 'Referer: https://r.test/' https://x.test/", expect: { headers: [], 'flags.referer': 'https://r.test/' } },

  // ---- data flags + method inference ----
  { name: '-d -> raw body, method inferred POST', cmd: "curl -d 'a=1&b=2' https://x.test/", expect: { method: 'POST', 'body.type': 'raw', 'body.raw': 'a=1&b=2', 'body.fields': [], 'body.urlencode': false } },
  { name: '--data', cmd: "curl --data 'k=v' https://x.test/", expect: { method: 'POST', 'body.type': 'raw', 'body.raw': 'k=v' } },
  { name: '--data-raw (JSON stays raw)', cmd: `curl --data-raw '{"a":1}' https://x.test/`, expect: { method: 'POST', 'body.type': 'raw', 'body.raw': '{"a":1}' } },
  { name: '--data-binary / --data-ascii are treated like -d', cmd: "curl --data-binary @x --data-ascii y https://x.test/", expect: { method: 'POST', 'body.type': 'raw', 'body.raw': '@x&y' } },
  { name: 'repeated -d joined with &', cmd: "curl -d a=1 -d b=2 -d c=3 https://x.test/", expect: { 'body.type': 'raw', 'body.raw': 'a=1&b=2&c=3' } },
  { name: '--data-urlencode -> form body with decoded fields (NOT percent-encoded in raw: lossy)', cmd: "curl --data-urlencode 'name=John Smith' --data-urlencode 'x=1' https://x.test/", expect: { method: 'POST', 'body.type': 'form', 'body.raw': 'name=John Smith&x=1', 'body.urlencode': true, 'body.fields': [{ key: 'name', value: 'John Smith', kind: 'data' }, { key: 'x', value: '1', kind: 'data' }] } },
  { name: 'explicit -X wins over data inference', cmd: "curl -X PUT -d 'a=1' https://x.test/", expect: { method: 'PUT', 'body.raw': 'a=1' } },
  { name: 'explicit -X GET with data stays GET', cmd: "curl -X GET -d 'a=1' https://x.test/", expect: { method: 'GET', 'body.type': 'raw', 'body.raw': 'a=1' } },
  { name: '--json -> json body, method POST', cmd: `curl --json '{"a":1}' https://x.test/`, expect: { method: 'POST', 'body.type': 'json', 'body.raw': '{"a":1}' } },
  { name: '--data-raw=value inline form', cmd: "curl --data-raw=abc https://x.test/", expect: { 'body.raw': 'abc', method: 'POST' } },
  { name: 'no data, no -X -> GET', cmd: 'curl -L https://x.test/', expect: { method: 'GET', 'body.type': 'none' } },

  // ---- -G ----
  { name: '-G lifts -d data into params, forces GET, clears body', cmd: "curl -G -d 'q=hi there' -d 'n=2' https://x.test/s", expect: { method: 'GET', url: 'https://x.test/s', params: [{ key: 'q', value: 'hi there' }, { key: 'n', value: '2' }], 'body.type': 'none', 'body.raw': '' } },
  { name: '--get appends to existing query params', cmd: "curl --get -d 'b=2' 'https://x.test/s?a=1'", expect: { method: 'GET', params: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }], 'body.type': 'none' } },
  { name: '-G with --data-urlencode lifts decoded pairs', cmd: "curl -G --data-urlencode 'q=a b' https://x.test/s", expect: { method: 'GET', params: [{ key: 'q', value: 'a b' }], 'body.type': 'none' } },
  { name: '-G after data flag (any order)', cmd: "curl -d 'a=1' -G https://x.test/s", expect: { method: 'GET', params: [{ key: 'a', value: '1' }] } },
  { name: '-G with explicit -X keeps the explicit method', cmd: "curl -G -X DELETE -d 'a=1' https://x.test/s", expect: { method: 'DELETE', params: [{ key: 'a', value: '1' }], 'body.type': 'none' } },
  { name: '-G without data is just GET', cmd: 'curl -G https://x.test/s', expect: { method: 'GET', params: [], 'body.type': 'none' } },

  // ---- -F multipart ----
  { name: '-F text field', cmd: "curl -F 'name=bob' https://x.test/up", expect: { method: 'POST', 'body.type': 'multipart', 'body.raw': '', 'body.fields': [{ key: 'name', value: 'bob', kind: 'data' }] } },
  { name: '-F @file -> kind file (leading @ stripped)', cmd: "curl -F 'f=@/tmp/a.png' https://x.test/up", expect: { 'body.type': 'multipart', 'body.fields': [{ key: 'f', value: '/tmp/a.png', kind: 'file' }] } },
  { name: '-F <file also kind file', cmd: "curl -F 'f=<note.txt' https://x.test/up", expect: { 'body.fields': [{ key: 'f', value: 'note.txt', kind: 'file' }] } },
  { name: '--form repeated keeps order', cmd: "curl --form a=1 --form b=@x.bin -F c=3 https://x.test/", expect: { 'body.type': 'multipart', 'body.fields': [{ key: 'a', value: '1', kind: 'data' }, { key: 'b', value: 'x.bin', kind: 'file' }, { key: 'c', value: '3', kind: 'data' }] } },
  { name: '--form-string treated as a form field', cmd: "curl --form-string 'k=@notfile' https://x.test/", expect: { 'body.fields': [{ key: 'k', value: 'notfile', kind: 'file' }] } },
  { name: '-F key without = gets empty value', cmd: "curl -F justkey https://x.test/", expect: { 'body.fields': [{ key: 'justkey', value: '', kind: 'data' }] } },
  { name: '-F wins over -d (data ignored once multipart)', cmd: "curl -F a=1 -d 'x=y' https://x.test/", expect: { 'body.type': 'multipart', 'body.fields': [{ key: 'a', value: '1', kind: 'data' }], method: 'POST' } },

  // ---- auth ----
  { name: '-u user:pass', cmd: 'curl -u alice:s3cret https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': 'alice', 'auth.pass': 's3cret', 'auth.token': '' } },
  { name: '--user with colon in password', cmd: "curl --user 'bob:p:w:d' https://x.test/", expect: { 'auth.user': 'bob', 'auth.pass': 'p:w:d' } },
  { name: '-u user only -> empty password', cmd: 'curl -u onlyuser https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': 'onlyuser', 'auth.pass': '' } },
  { name: '-u does not change the method', cmd: 'curl -u a:b https://x.test/', expect: { method: 'GET' } },

  // ---- cookie ----
  { name: '-b becomes a Cookie header', cmd: "curl -b 'sid=abc; t=1' https://x.test/", expect: { headers: [{ name: 'Cookie', value: 'sid=abc; t=1' }] } },
  { name: '--cookie becomes a Cookie header', cmd: "curl --cookie 'a=b' https://x.test/", expect: { headers: [{ name: 'Cookie', value: 'a=b' }] } },

  // ---- simple flags ----
  { name: '--compressed', cmd: 'curl --compressed https://x.test/', expect: { 'flags.compressed': true } },
  { name: '-L', cmd: 'curl -L https://x.test/', expect: { 'flags.followRedirects': true } },
  { name: '--location', cmd: 'curl --location https://x.test/', expect: { 'flags.followRedirects': true } },
  { name: '-k', cmd: 'curl -k https://x.test/', expect: { 'flags.insecure': true } },
  { name: '--insecure', cmd: 'curl --insecure https://x.test/', expect: { 'flags.insecure': true } },
  { name: '-A user agent', cmd: "curl -A 'Mozilla/5.0 (X11)' https://x.test/", expect: { 'flags.userAgent': 'Mozilla/5.0 (X11)' } },
  { name: '--user-agent', cmd: 'curl --user-agent curl-test https://x.test/', expect: { 'flags.userAgent': 'curl-test' } },
  { name: '-e referer', cmd: 'curl -e https://ref.test/ https://x.test/', expect: { 'flags.referer': 'https://ref.test/' } },
  { name: '--referer strips trailing ;auto', cmd: "curl --referer 'https://ref.test/;auto' https://x.test/", expect: { 'flags.referer': 'https://ref.test/' } },
  { name: '--max-time', cmd: 'curl --max-time 30 https://x.test/', expect: { 'flags.timeout': 30 } },
  { name: '-m fractional', cmd: 'curl -m 2.5 https://x.test/', expect: { 'flags.timeout': 2.5 } },
  { name: '--max-time=value', cmd: 'curl --max-time=7 https://x.test/', expect: { 'flags.timeout': 7 } },
  { name: '--max-time non-numeric -> timeout stays null', cmd: 'curl --max-time abc https://x.test/', expect: { 'flags.timeout': null } },
  { name: '--max-time 0 / negative -> timeout stays null', cmd: 'curl --max-time 0 https://x.test/', expect: { 'flags.timeout': null } },

  // ---- combined short clusters ----
  { name: '-sSL cluster: display flags ignored, L honoured', cmd: 'curl -sSL https://x.test/', expect: { 'flags.followRedirects': true, url: 'https://x.test/' } },
  { name: '-sSLk cluster', cmd: 'curl -sSLk https://x.test/', expect: { 'flags.followRedirects': true, 'flags.insecure': true } },
  { name: '-LkG cluster with data', cmd: "curl -LkG -d a=1 https://x.test/", expect: { 'flags.followRedirects': true, 'flags.insecure': true, method: 'GET', params: [{ key: 'a', value: '1' }] } },
  { name: '-sXPOST: value-taker inside cluster takes the remainder', cmd: 'curl -sXPOST https://x.test/', expect: { method: 'POST' } },
  { name: '-H<value> glued', cmd: "curl -HAccept:text/plain https://x.test/", expect: { headers: [{ name: 'Accept', value: 'text/plain' }] } },
  { name: '-d<value> glued', cmd: "curl -dfoo=bar https://x.test/", expect: { method: 'POST', 'body.raw': 'foo=bar' } },
  { name: '-uuser:pass glued', cmd: 'curl -uu:p https://x.test/', expect: { 'auth.user': 'u', 'auth.pass': 'p' } },
  { name: '-L then value-taker in cluster: -LXPUT', cmd: 'curl -LXPUT https://x.test/', expect: { 'flags.followRedirects': true, method: 'PUT' } },

  // ---- flag order independence ----
  { name: 'ORDER A: url first', cmd: "curl https://x.test/a -X PUT -H 'A: 1' -d x=1 -k", expect: { url: 'https://x.test/a', method: 'PUT', headers: [{ name: 'A', value: '1' }], 'body.raw': 'x=1', 'flags.insecure': true } },
  { name: 'ORDER B: url last', cmd: "curl -k -d x=1 -H 'A: 1' -X PUT https://x.test/a", expect: { url: 'https://x.test/a', method: 'PUT', headers: [{ name: 'A', value: '1' }], 'body.raw': 'x=1', 'flags.insecure': true } },
  { name: 'ORDER C: url in the middle', cmd: "curl -X PUT -k https://x.test/a -H 'A: 1' -d x=1", expect: { url: 'https://x.test/a', method: 'PUT', headers: [{ name: 'A', value: '1' }], 'body.raw': 'x=1', 'flags.insecure': true } },

  // ---- multi-line / quoting ----
  { name: 'backslash-continued multi-line command', cmd: "curl -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"a\":1}' \\\n  https://x.test/api", expect: { method: 'POST', url: 'https://x.test/api', headers: [{ name: 'Content-Type', value: 'application/json' }], 'body.raw': '{"a":1}' } },
  { name: 'double-quoted data with escaped quotes', cmd: 'curl -d "{\\"a\\": \\"b\\"}" https://x.test/', expect: { 'body.raw': '{"a": "b"}' } },

  // ---- recognized-but-ignored flags leave the request alone ----
  { name: '-s -v -i -f --fail --silent are ignored', cmd: 'curl -s -v -i -f https://x.test/', expect: { url: 'https://x.test/', method: 'GET', 'flags.followRedirects': false } },
];

for (const c of CURL) {
  test(`parseCurl: ${c.name}`, () => {
    const r = parseCurl(c.cmd);
    for (const [path, want] of Object.entries(c.expect)) {
      assert.deepEqual(get(r, path), want, `${path} for: ${c.cmd}`);
    }
  });
}

// ---- notes emitted for ignored / recognized flags ----
const CURL_NOTES = [
  ['-s', 'curl -s https://x.test/', ["-s: a display/output flag — ignored (doesn't change the request)."]],
  ['-sSL (s and S noted, L is not)', 'curl -sSL https://x.test/', ["-s: a display/output flag — ignored (doesn't change the request).", "-S: a display/output flag — ignored (doesn't change the request)."]],
  ['-o file consumes its value and notes', 'curl -o out.txt https://x.test/', ['-o: output-to-file is ignored (this tool only generates the request).']],
  ['--output= inline', 'curl --output=out.txt https://x.test/', ['--output: output-to-file is ignored (this tool only generates the request).']],
  ['-O', 'curl -O https://x.test/f.zip', ['-O: save-as-remote-name is ignored.']],
  ['clean command has no notes', "curl -X POST -H 'A: 1' -d x=1 https://x.test/", []],
];
for (const [name, cmd, notes] of CURL_NOTES) {
  test(`parseCurl notes: ${name}`, () => assert.deepEqual(parseCurl(cmd).notes, notes));
}

test('parseCurl: -o consumes its value so it is NOT mistaken for the URL', () => {
  const r = parseCurl('curl -o out.txt https://x.test/');
  assert.equal(r.url, 'https://x.test/');
});

// ============================================================
// parseCurl -- real-world one-liners asserted to the FULL model
// ============================================================
test('parseCurl REAL: JSON POST with bearer token (browser "copy as cURL" style, multi-line)', () => {
  const cmd = `curl 'https://api.example.com/v1/users?page=2&per_page=50' \\
  -X POST \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json' \\
  --data-raw '{"name":"Ada Lovelace","email":"ada@example.com"}' \\
  --compressed`;
  const r = parseCurl(cmd);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'POST',
    url: 'https://api.example.com/v1/users',
    params: [{ key: 'page', value: '2' }, { key: 'per_page', value: '50' }],
    headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Accept', value: 'application/json' }],
    auth: { type: 'bearer', token: 'eyJhbGciOiJIUzI1NiJ9.e30.abc' },
    body: { type: 'raw', raw: '{"name":"Ada Lovelace","email":"ada@example.com"}' },
    flags: { compressed: true },
  }));
  assert.deepEqual(r.notes, []);
});

test('parseCurl REAL: quiet follow-redirects basic-auth GET with UA and timeout', () => {
  const r = parseCurl(`curl -sSL -u deploy:hunter2 -A 'ci-bot/2.0' -e https://ci.example.com/ --max-time 15 -k https://registry.example.com/v2/_catalog?n=10`);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'GET',
    url: 'https://registry.example.com/v2/_catalog',
    params: [{ key: 'n', value: '10' }],
    auth: { type: 'basic', user: 'deploy', pass: 'hunter2' },
    flags: { followRedirects: true, insecure: true, timeout: 15, userAgent: 'ci-bot/2.0', referer: 'https://ci.example.com/' },
  }));
  assert.deepEqual(r.notes, [
    "-s: a display/output flag — ignored (doesn't change the request).",
    "-S: a display/output flag — ignored (doesn't change the request).",
  ]);
});

test('parseCurl REAL: multipart file upload', () => {
  const r = parseCurl(`curl -X POST https://up.example.com/upload -F 'title=Holiday' -F 'file=@/home/me/pic.jpg' -H 'X-Api-Key: k_123'`);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'POST',
    url: 'https://up.example.com/upload',
    headers: [{ name: 'X-Api-Key', value: 'k_123' }],
    body: { type: 'multipart', raw: '', fields: [{ key: 'title', value: 'Holiday', kind: 'data' }, { key: 'file', value: '/home/me/pic.jpg', kind: 'file' }] },
  }));
});

test('parseCurl REAL: -G search with --data-urlencode', () => {
  const r = parseCurl(`curl -G https://search.example.com/api --data-urlencode 'q=hello world' --data-urlencode 'lang=en' -H 'Accept: application/json'`);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'GET',
    url: 'https://search.example.com/api',
    params: [{ key: 'q', value: 'hello world' }, { key: 'lang', value: 'en' }],
    headers: [{ name: 'Accept', value: 'application/json' }],
  }));
});

test('parseCurl REAL: login form POST with cookie', () => {
  const r = parseCurl(`curl -i -X POST https://app.example.com/login -b 'session=xyz' -d 'user=al&pass=pw%21'`);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'POST',
    url: 'https://app.example.com/login',
    headers: [{ name: 'Cookie', value: 'session=xyz' }],
    body: { type: 'raw', raw: 'user=al&pass=pw%21' },
  }));
  assert.deepEqual(r.notes, ["-i: a display/output flag — ignored (doesn't change the request)."]);
});

// ============================================================
// parseWget
// ============================================================
const WGET = [
  { name: 'bare URL', cmd: 'wget https://x.test/f', expect: { method: 'GET', url: 'https://x.test/f', 'body.type': 'none' } },
  { name: 'leading wget optional', cmd: 'https://x.test/f', expect: { url: 'https://x.test/f' } },
  { name: 'query string -> params', cmd: "wget 'https://x.test/s?a=1&b=two%20words'", expect: { url: 'https://x.test/s', params: [{ key: 'a', value: '1' }, { key: 'b', value: 'two words' }] } },
  { name: '--header (repeated)', cmd: "wget --header='A: 1' --header 'B: 2' https://x.test/", expect: { headers: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }] } },
  { name: '--method', cmd: 'wget --method=PUT https://x.test/', expect: { method: 'PUT' } },
  { name: '--method upper-cases', cmd: 'wget --method delete https://x.test/', expect: { method: 'DELETE' } },
  { name: '--post-data -> form body, urlencode, POST inferred', cmd: "wget --post-data='a=1&b=x%20y' https://x.test/", expect: { method: 'POST', 'body.type': 'form', 'body.raw': 'a=1&b=x%20y', 'body.urlencode': true, 'body.fields': [{ key: 'a', value: '1', kind: 'data' }, { key: 'b', value: 'x y', kind: 'data' }] } },
  { name: '--body-data -> raw body, POST inferred', cmd: `wget --body-data='{"a":1}' https://x.test/`, expect: { method: 'POST', 'body.type': 'raw', 'body.raw': '{"a":1}', 'body.urlencode': false } },
  { name: '--method wins over body inference', cmd: "wget --method=PUT --post-data='a=1' https://x.test/", expect: { method: 'PUT', 'body.type': 'form' } },
  { name: '--user / --password -> basic auth', cmd: 'wget --user=al --password=pw https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': 'al', 'auth.pass': 'pw' } },
  { name: '--http-user / --http-password', cmd: 'wget --http-user al --http-password pw https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': 'al', 'auth.pass': 'pw' } },
  { name: '--user alone -> basic with empty pass', cmd: 'wget --user=al https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': 'al', 'auth.pass': '' } },
  { name: '--password alone -> basic with empty user', cmd: 'wget --password=pw https://x.test/', expect: { 'auth.type': 'basic', 'auth.user': '', 'auth.pass': 'pw' } },
  { name: '-U / --user-agent', cmd: "wget -U 'agent/1' https://x.test/", expect: { 'flags.userAgent': 'agent/1' } },
  { name: '--user-agent=value', cmd: 'wget --user-agent=agent/2 https://x.test/', expect: { 'flags.userAgent': 'agent/2' } },
  { name: '--referer', cmd: 'wget --referer=https://r.test/ https://x.test/', expect: { 'flags.referer': 'https://r.test/' } },
  { name: '--no-check-certificate -> insecure', cmd: 'wget --no-check-certificate https://x.test/', expect: { 'flags.insecure': true } },
  { name: '--compression=gzip -> compressed', cmd: 'wget --compression=gzip https://x.test/', expect: { 'flags.compressed': true } },
  { name: '--compression=none -> not compressed', cmd: 'wget --compression=none https://x.test/', expect: { 'flags.compressed': false } },
  { name: '--max-redirect -> followRedirects (value consumed)', cmd: 'wget --max-redirect=5 https://x.test/', expect: { 'flags.followRedirects': true, url: 'https://x.test/' } },
  { name: '--max-redirect=0 DISABLES redirects [#1014-L]', cmd: 'wget --max-redirect=0 https://x.test/', expect: { 'flags.followRedirects': false, url: 'https://x.test/' } },
  { name: '--timeout', cmd: 'wget --timeout=20 https://x.test/', expect: { 'flags.timeout': 20 } },
  { name: '--read-timeout', cmd: 'wget --read-timeout 9 https://x.test/', expect: { 'flags.timeout': 9 } },
  { name: '--timeout non-numeric -> null', cmd: 'wget --timeout=abc https://x.test/', expect: { 'flags.timeout': null } },
  { name: 'Authorization: Bearer header lifted', cmd: "wget --header='Authorization: Bearer T' https://x.test/", expect: { headers: [], 'auth.type': 'bearer', 'auth.token': 'T' } },
  { name: 'flags in any order', cmd: "wget https://x.test/ --no-check-certificate --header='A: 1' --post-data=a=1", expect: { url: 'https://x.test/', 'flags.insecure': true, headers: [{ name: 'A', value: '1' }], method: 'POST', 'body.raw': 'a=1' } },
  { name: 'short cluster -qO- style: value-taker -O takes remainder', cmd: 'wget -qO- https://x.test/', expect: { url: 'https://x.test/' } },
  { name: 'backslash-continued', cmd: "wget \\\n --header='A: 1' \\\n https://x.test/", expect: { headers: [{ name: 'A', value: '1' }], url: 'https://x.test/' } },
];
for (const c of WGET) {
  test(`parseWget: ${c.name}`, () => {
    const r = parseWget(c.cmd);
    for (const [path, want] of Object.entries(c.expect)) {
      assert.deepEqual(get(r, path), want, `${path} for: ${c.cmd}`);
    }
  });
}

test('parseWget REAL: authenticated POST one-liner, full model', () => {
  const r = parseWget(`wget -q --no-check-certificate --user=svc --password='p@ss' --header='Content-Type: application/json' --header='X-Trace: 1' --post-data='{"a":1}' --timeout=10 -U 'probe/1.0' 'https://api.example.com/hook?v=2'`);
  assert.deepEqual(noNotes(r), expectModel({
    method: 'POST',
    url: 'https://api.example.com/hook',
    params: [{ key: 'v', value: '2' }],
    headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'X-Trace', value: '1' }],
    auth: { type: 'basic', user: 'svc', pass: 'p@ss' },
    body: { type: 'form', raw: '{"a":1}', urlencode: true, fields: [{ key: '{"a":1}', value: '', kind: 'data' }] },
    flags: { insecure: true, timeout: 10, userAgent: 'probe/1.0' },
  }));
  assert.deepEqual(r.notes, ["-q: a display/behavior flag — ignored (doesn't change the request)."]);
});

const WGET_NOTES = [
  ['-O file', 'wget -O out.html https://x.test/', ['-O: output-to-file is ignored (this tool only generates the request).']],
  ['--output-document=', 'wget --output-document=out https://x.test/', ['--output-document: output-to-file is ignored (this tool only generates the request).']],
  ['-o log', 'wget -o log.txt https://x.test/', ['-o: log-file is ignored.']],
  ['--output-file=', 'wget --output-file=l https://x.test/', ['--output-file: log-file is ignored.']],
  ['-q', 'wget -q https://x.test/', ["-q: a display/behavior flag — ignored (doesn't change the request)."]],
  // `-nv`/`-nc`/`-nH` are whole wget flags (no longer cluster-split), each noted as ignored (#1014-L).
  ['-nv / -nc / -nH / -c / -N', 'wget -nv -nc -nH -c -N https://x.test/', [
    "-nv: a display/behavior flag — ignored (doesn't change the request).",
    "-nc: a display/behavior flag — ignored (doesn't change the request).",
    "-nH: a display/behavior flag — ignored (doesn't change the request).",
    "-c: a display/behavior flag — ignored (doesn't change the request).",
    "-N: a display/behavior flag — ignored (doesn't change the request).",
  ]],
  ['--post-file leaves an empty raw body + note, POST inferred', 'wget --post-file=data.json https://x.test/', ['--post-file=data.json: body is read from a file at runtime — the tool can\'t inline file contents, so the body is left empty.']],
];
for (const [name, cmd, notes] of WGET_NOTES) {
  test(`parseWget notes: ${name}`, () => assert.deepEqual(parseWget(cmd).notes, notes));
}

test('parseWget: --post-file / --body-file -> empty raw body, POST inferred', () => {
  for (const f of ['--post-file', '--body-file']) {
    const r = parseWget(`wget ${f}=d.txt https://x.test/`);
    assert.equal(r.method, 'POST');
    assert.deepEqual(r.body, { type: 'raw', raw: '', fields: [], urlencode: false });
  }
});

test('parseWget: -qO- cluster: -q expanded and noted, -O consumes nothing extra', () => {
  const r = parseWget('wget -qO- https://x.test/');
  // -qO- -> [-q, -O, -]; -O takes "-" as its value
  assert.deepEqual(r.notes, [
    "-q: a display/behavior flag — ignored (doesn't change the request).",
    '-O: output-to-file is ignored (this tool only generates the request).',
  ]);
});

// ============================================================
// Malformed / TOTAL -- best-effort model + notes, never a throw
// ============================================================
test('parseCurl TOTAL: empty / whitespace / null / undefined -> empty model, no notes', () => {
  for (const inp of ['', '   ', '\n', null, undefined, 'curl']) {
    const r = parseCurl(inp);
    assert.deepEqual(noNotes(r), emptyModel(), `input ${JSON.stringify(inp)}`);
    assert.deepEqual(r.notes, []);
  }
});

test('parseWget TOTAL: empty / whitespace / null / undefined -> empty model, no notes', () => {
  for (const inp of ['', '   ', null, undefined, 'wget']) {
    const r = parseWget(inp);
    assert.deepEqual(noNotes(r), emptyModel(), `input ${JSON.stringify(inp)}`);
    assert.deepEqual(r.notes, []);
  }
});

test('parseCurl TOTAL: non-string inputs are coerced, not thrown on', () => {
  assert.equal(parseCurl(12345).url, '12345');
  assert.equal(parseCurl({}).url, '[object'); // String({}) = "[object Object]" -> split on the space
});

test('parseCurl TOTAL: missing URL -> url "" , other flags still parsed, no note', () => {
  const r = parseCurl("curl -X POST -H 'A: 1' -d x=1");
  assert.equal(r.url, '');
  assert.deepEqual(r.params, []);
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.headers, [{ name: 'A', value: '1' }]);
  assert.equal(r.body.raw, 'x=1');
  assert.deepEqual(r.notes, []);
});

test('parseCurl TOTAL: unknown short flag is noted and left out', () => {
  const r = parseCurl('curl -Z https://x.test/');
  assert.equal(r.url, 'https://x.test/');
  assert.deepEqual(r.notes, ['Unrecognized flag -Z — left out of the model.']);
});

test('parseCurl TOTAL: unknown long flag is noted; a following token is NOT swallowed (becomes the URL)', () => {
  const r = parseCurl('curl --frobnicate yes https://x.test/');
  // `yes` is treated as the positional URL (first positional wins); the real URL becomes an "extra argument".
  assert.equal(r.url, 'yes');
  assert.deepEqual(r.notes, [
    'Unrecognized flag --frobnicate — left out of the model.',
    'Extra argument "https://x.test/" ignored (only the first URL is used).',
  ]);
});

test('parseCurl TOTAL: unknown --flag=value notes with =… marker', () => {
  const r = parseCurl('curl --frob=1 https://x.test/');
  assert.equal(r.url, 'https://x.test/');
  assert.deepEqual(r.notes, ['Unrecognized flag --frob=… — left out of the model.']);
});

test('parseCurl TOTAL: second positional URL is ignored with a note (first wins)', () => {
  const r = parseCurl('curl https://a.test/ https://b.test/ ');
  assert.equal(r.url, 'https://a.test/');
  assert.deepEqual(r.notes, ['Extra argument "https://b.test/" ignored (only the first URL is used).']);
});

test('parseCurl TOTAL: value-taking flag at end of input -> note, no throw, nothing set', () => {
  const cases = [
    ['curl https://x.test/ -X', '-X expected a value but none was given.'],
    ['curl https://x.test/ -H', '-H expected a value but none was given.'],
    ['curl https://x.test/ -d', '-d expected a value but none was given.'],
    ['curl https://x.test/ --header', '--header expected a value but none was given.'],
    ['curl https://x.test/ -u', '-u expected a value but none was given.'],
    ['curl https://x.test/ -F', '-F expected a value but none was given.'],
  ];
  for (const [cmd, note] of cases) {
    const r = parseCurl(cmd);
    assert.equal(r.url, 'https://x.test/');
    assert.equal(r.method, 'GET', cmd);
    assert.deepEqual(r.headers, [], cmd);
    assert.equal(r.body.type, 'none', cmd);
    assert.equal(r.auth.type, 'none', cmd);
    assert.deepEqual(r.notes, [note], cmd);
  }
});

test('parseCurl TOTAL: --max-time with no value -> note + no timeout', () => {
  const r = parseCurl('curl https://x.test/ --max-time');
  assert.equal(r.flags.timeout, null);
  assert.deepEqual(r.notes, ['--max-time expected a value but none was given.']);
});

test('parseCurl TOTAL: header without a colon -> name only, empty value', () => {
  const r = parseCurl("curl -H 'X-NoColon' https://x.test/");
  assert.deepEqual(r.headers, [{ name: 'X-NoColon', value: '' }]);
  assert.deepEqual(r.notes, []);
});

test('parseCurl TOTAL: header with empty name (": v") is kept literally', () => {
  const r = parseCurl("curl -H ': v' https://x.test/");
  assert.deepEqual(r.headers, [{ name: '', value: 'v' }]);
});

test('parseCurl TOTAL: duplicate headers are all kept in order (no dedupe)', () => {
  const r = parseCurl("curl -H 'X-A: 1' -H 'X-A: 2' -H 'x-a: 3' https://x.test/");
  assert.deepEqual(r.headers, [{ name: 'X-A', value: '1' }, { name: 'X-A', value: '2' }, { name: 'x-a', value: '3' }]);
});

test('parseCurl TOTAL: duplicate Authorization / User-Agent -> last one wins (lifted in order)', () => {
  const r = parseCurl("curl -H 'Authorization: Bearer one' -H 'Authorization: Bearer two' -H 'User-Agent: a' -A b https://x.test/");
  assert.equal(r.auth.token, 'two');
  assert.equal(r.flags.userAgent, 'a'); // header lifted AFTER -A was applied, so it overrides
  assert.deepEqual(r.headers, []);
});

test('parseCurl TOTAL: -u wins over nothing, but Authorization header lifted afterwards overrides -u', () => {
  const r = parseCurl("curl -u a:b -H 'Authorization: Bearer T' https://x.test/");
  assert.equal(r.auth.type, 'bearer');
  assert.equal(r.auth.token, 'T');
});

test('parseCurl TOTAL: Authorization: Basic with undecodable base64 -> basic with empty creds (lossy)', () => {
  const r = parseCurl("curl -H 'Authorization: Basic !!!notbase64' https://x.test/");
  assert.deepEqual(r.auth, { type: 'basic', user: '', pass: '', token: '' });
  assert.deepEqual(r.headers, []);
});

test('parseCurl TOTAL: "Authorization: Bearer" with no token is NOT lifted (kept as a header)', () => {
  const r = parseCurl("curl -H 'Authorization: Bearer' https://x.test/");
  assert.equal(r.auth.type, 'none');
  assert.deepEqual(r.headers, [{ name: 'Authorization', value: 'Bearer' }]);
});

test('parseCurl TOTAL: unterminated quote runs to EOF, no throw', () => {
  const r = parseCurl("curl -d 'a=1 https://x.test/");
  assert.equal(r.url, '');
  assert.equal(r.body.raw, 'a=1 https://x.test/');
  assert.equal(r.method, 'POST');
});

test('parseCurl TOTAL: garbage text -> first word becomes the "URL", rest are extras', () => {
  const r = parseCurl('hello world');
  assert.equal(r.url, 'hello');
  assert.deepEqual(r.notes, ['Extra argument "world" ignored (only the first URL is used).']);
});

test('parseCurl TOTAL: bad percent-encoding in query falls back to the raw text', () => {
  const r = parseCurl("curl 'https://x.test/?a=%E0%A4%A&b=ok'");
  assert.deepEqual(r.params, [{ key: 'a', value: '%E0%A4%A' }, { key: 'b', value: 'ok' }]);
});

test('parseCurl TOTAL: data + -F: multipart wins, -d data is dropped (lossy)', () => {
  const r = parseCurl("curl -d a=1 -F b=2 https://x.test/");
  assert.equal(r.body.type, 'multipart');
  assert.deepEqual(r.body.fields, [{ key: 'b', value: '2', kind: 'data' }]);
});

test('parseCurl TOTAL: --json wins over -d (data dropped, lossy)', () => {
  const r = parseCurl(`curl -d a=1 --json '{"b":2}' https://x.test/`);
  assert.equal(r.body.type, 'json');
  assert.equal(r.body.raw, '{"b":2}');
  assert.equal(r.method, 'POST');
});

test('parseCurl TOTAL: -G with --json does not lift the json body (stays json, GET)', () => {
  const r = parseCurl(`curl -G --json '{"b":2}' https://x.test/`);
  assert.equal(r.method, 'GET');
  assert.equal(r.body.type, 'json');
  assert.deepEqual(r.params, []);
});

test('parseCurl TOTAL: -G with -F keeps the multipart body (not lifted)', () => {
  const r = parseCurl('curl -G -F a=1 https://x.test/');
  assert.equal(r.method, 'GET');
  assert.equal(r.body.type, 'multipart');
});

test('parseCurl TOTAL: each returned model is independent (no shared mutable state across calls)', () => {
  const a = parseCurl("curl -H 'A: 1' -d x=1 https://x.test/");
  const b = parseCurl('curl https://y.test/');
  assert.deepEqual(b.headers, []);
  assert.equal(b.body.type, 'none');
  a.headers.push({ name: 'Z', value: 'z' });
  assert.deepEqual(emptyModel().headers, []);
});

test('parseWget TOTAL: missing URL / unknown flag / extra URL / dangling value flag', () => {
  let r = parseWget('wget --header="A: 1"');
  assert.equal(r.url, '');
  assert.deepEqual(r.headers, [{ name: 'A', value: '1' }]);
  assert.deepEqual(r.notes, []);

  r = parseWget('wget --bogus https://x.test/');
  assert.equal(r.url, 'https://x.test/');
  assert.deepEqual(r.notes, ['Unrecognized flag --bogus — left out of the model.']);

  r = parseWget('wget --bogus=1 https://x.test/');
  assert.deepEqual(r.notes, ['Unrecognized flag --bogus=… — left out of the model.']);

  r = parseWget('wget https://a.test/ https://b.test/');
  assert.equal(r.url, 'https://a.test/');
  assert.deepEqual(r.notes, ['Extra argument "https://b.test/" ignored (only the first URL is used).']);

  r = parseWget('wget https://x.test/ --header');
  assert.deepEqual(r.headers, []);
  assert.deepEqual(r.notes, ['--header expected a value but none was given.']);

  r = parseWget('wget https://x.test/ --user');
  assert.equal(r.auth.type, 'none');
  assert.deepEqual(r.notes, ['--user expected a value but none was given.']);
});

test('parseWget TOTAL: header without a colon -> name only; duplicate headers kept', () => {
  const r = parseWget("wget --header='Solo' --header='A: 1' --header='A: 2' https://x.test/");
  assert.deepEqual(r.headers, [{ name: 'Solo', value: '' }, { name: 'A', value: '1' }, { name: 'A', value: '2' }]);
});

test('parseWget TOTAL: curl-only flags are unrecognized (noted) and values are not consumed', () => {
  const r = parseWget('wget -X POST https://x.test/');
  // -X unknown; "POST" becomes the first positional ("URL"), real URL is an extra
  assert.equal(r.url, 'POST');
  assert.deepEqual(r.notes, [
    'Unrecognized flag -X — left out of the model.',
    'Extra argument "https://x.test/" ignored (only the first URL is used).',
  ]);
});

// ============================================================
// Helpers: emptyModel / normalizeModel / modelWithoutSecrets
// ============================================================
test('emptyModel: exact shape + fresh instance each call', () => {
  assert.deepEqual(emptyModel(), {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none', user: '', pass: '', token: '' },
    body: { type: 'none', raw: '', fields: [], urlencode: false },
    flags: { followRedirects: false, insecure: false, compressed: false, timeout: null, userAgent: '', referer: '' },
  });
  const a = emptyModel(); a.headers.push({ name: 'x', value: 'y' }); a.flags.insecure = true;
  assert.deepEqual(emptyModel().headers, []);
  assert.equal(emptyModel().flags.insecure, false);
});

test('normalizeModel: non-object input -> empty model', () => {
  for (const v of [null, undefined, 0, 'str', true, 42]) {
    assert.deepEqual(normalizeModel(v), emptyModel(), String(v));
  }
});

test('normalizeModel: empty object -> empty model', () => {
  assert.deepEqual(normalizeModel({}), emptyModel());
});

test('normalizeModel: method is trimmed + upper-cased; blank / non-string ignored', () => {
  assert.equal(normalizeModel({ method: '  post ' }).method, 'POST');
  assert.equal(normalizeModel({ method: '   ' }).method, 'GET');
  assert.equal(normalizeModel({ method: 5 }).method, 'GET');
  assert.equal(normalizeModel({ method: 'purge' }).method, 'PURGE'); // not validated against METHODS
});

test('normalizeModel: url coerced via str(); null -> ""', () => {
  assert.equal(normalizeModel({ url: 'https://x.test/' }).url, 'https://x.test/');
  assert.equal(normalizeModel({ url: null }).url, '');
  assert.equal(normalizeModel({ url: 7 }).url, '7');
});

test('normalizeModel: raw -> canonical for params/headers/fields (coerced, filtered)', () => {
  const m = normalizeModel({
    method: 'put',
    url: 'https://x.test/',
    params: [{ key: 'a', value: 1 }, null, 'bad', { key: null, value: undefined }],
    headers: [{ name: 'H', value: 2 }, 5, { name: 'I' }],
    auth: { type: 'basic', user: 'u', pass: 9, token: null },
    body: { type: 'form', raw: 'a=1', urlencode: true, fields: [{ key: 'k', value: 'v', kind: 'file' }, { key: 'k2', value: 'v2', kind: 'weird' }, null, { key: 'k3' }] },
    flags: { followRedirects: true, insecure: 1, compressed: true, timeout: '12', userAgent: 'UA', referer: null },
  });
  assert.deepEqual(m, {
    method: 'PUT',
    url: 'https://x.test/',
    params: [{ key: 'a', value: '1' }, { key: '', value: '' }],
    headers: [{ name: 'H', value: '2' }, { name: 'I', value: '' }],
    auth: { type: 'basic', user: 'u', pass: '9', token: '' },
    body: {
      type: 'form', raw: 'a=1', urlencode: true,
      fields: [{ key: 'k', value: 'v', kind: 'file' }, { key: 'k2', value: 'v2', kind: 'data' }, { key: 'k3', value: '', kind: 'data' }],
    },
    flags: { followRedirects: true, insecure: false, compressed: true, timeout: 12, userAgent: 'UA', referer: '' },
  });
});

test('normalizeModel: invalid auth/body types fall back to none', () => {
  assert.equal(normalizeModel({ auth: { type: 'digest' } }).auth.type, 'none');
  assert.equal(normalizeModel({ body: { type: 'xml' } }).body.type, 'none');
  assert.equal(normalizeModel({ auth: { type: 'bearer', token: 't' } }).auth.type, 'bearer');
});

test('normalizeModel: urlencode / booleans only true when strictly === true', () => {
  assert.equal(normalizeModel({ body: { type: 'form', urlencode: 'true' } }).body.urlencode, false);
  assert.equal(normalizeModel({ body: { type: 'form', urlencode: true } }).body.urlencode, true);
  assert.equal(normalizeModel({ flags: { followRedirects: 'yes' } }).flags.followRedirects, false);
});

test('normalizeModel: timeout must be finite and > 0, else null', () => {
  const t = (v) => normalizeModel({ flags: { timeout: v } }).flags.timeout;
  assert.equal(t(5), 5);
  assert.equal(t('2.5'), 2.5);
  assert.equal(t(0), null);
  assert.equal(t(-1), null);
  assert.equal(t('abc'), null);
  assert.equal(t(Infinity), null);
  assert.equal(t(null), null);
  assert.equal(t(undefined), null);
});

test('normalizeModel: non-array params/headers/fields are ignored', () => {
  const m = normalizeModel({ params: 'x', headers: {}, body: { type: 'form', fields: 'y' } });
  assert.deepEqual(m.params, []);
  assert.deepEqual(m.headers, []);
  assert.deepEqual(m.body.fields, []);
});

test('normalizeModel: idempotent and does not mutate / alias its input', () => {
  const raw = { method: 'post', url: 'u', headers: [{ name: 'a', value: 'b' }] };
  const snapshot = JSON.stringify(raw);
  const once = normalizeModel(raw);
  assert.deepEqual(normalizeModel(once), once);
  assert.equal(JSON.stringify(raw), snapshot);
  once.headers[0].value = 'changed';
  assert.equal(raw.headers[0].value, 'b');
});

test('normalizeModel: a parseCurl result (with notes) normalizes to the same model minus notes', () => {
  const r = parseCurl("curl -sSL -X POST -H 'A: 1' -d x=1 https://x.test/?q=1");
  const n = normalizeModel(r);
  assert.equal('notes' in n, false);
  assert.deepEqual(n, noNotes(r));
});

test('modelWithoutSecrets: redacts auth user/pass/token but keeps the auth type', () => {
  const m = modelWithoutSecrets({
    method: 'POST', url: 'https://x.test/',
    auth: { type: 'basic', user: 'al', pass: 'pw', token: 'tk' },
    headers: [{ name: 'A', value: '1' }],
  });
  assert.deepEqual(m.auth, { type: 'basic', user: '', pass: '', token: '' });
  assert.equal(m.method, 'POST');
  assert.deepEqual(m.headers, [{ name: 'A', value: '1' }]);
  const b = modelWithoutSecrets({ auth: { type: 'bearer', token: 'secret' } });
  assert.deepEqual(b.auth, { type: 'bearer', user: '', pass: '', token: '' });
});

test('modelWithoutSecrets: returns a copy, original secrets untouched; garbage in -> empty model', () => {
  const src = { auth: { type: 'basic', user: 'al', pass: 'pw' } };
  const out = modelWithoutSecrets(src);
  assert.equal(src.auth.pass, 'pw');
  assert.equal(out.auth.pass, '');
  assert.deepEqual(modelWithoutSecrets(null), emptyModel());
});

test('modelWithoutSecrets: on a parsed curl command (redacts -u creds, leaves the rest)', () => {
  const m = modelWithoutSecrets(parseCurl('curl -u al:pw https://x.test/a'));
  assert.deepEqual(m, expectModel({ url: 'https://x.test/a', auth: { type: 'basic' } }));
});

// ============================================================
// Helpers: URL <-> params
// ============================================================
const SPLIT = [
  ['no query', 'https://x.test/p', { base: 'https://x.test/p', params: [] }],
  ['empty string', '', { base: '', params: [] }],
  ['null', null, { base: '', params: [] }],
  ['trailing ? only', 'https://x.test/p?', { base: 'https://x.test/p', params: [] }],
  ['single pair', 'u?a=1', { base: 'u', params: [{ key: 'a', value: '1' }] }],
  ['multiple pairs', 'u?a=1&b=2&c=3', { base: 'u', params: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }, { key: 'c', value: '3' }] }],
  ['key without =', 'u?flag', { base: 'u', params: [{ key: 'flag', value: '' }] }],
  ['empty value', 'u?a=', { base: 'u', params: [{ key: 'a', value: '' }] }],
  ['value containing =', 'u?a=b=c', { base: 'u', params: [{ key: 'a', value: 'b=c' }] }],
  ['percent + plus decoding', 'u?q=a%20b+c&%6Bey=%C3%A9', { base: 'u', params: [{ key: 'q', value: 'a b c' }, { key: 'key', value: 'é' }] }],
  ['empty segments skipped', 'u?a=1&&b=2&', { base: 'u', params: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] }],
  ['duplicate keys kept in order', 'u?a=1&a=2', { base: 'u', params: [{ key: 'a', value: '1' }, { key: 'a', value: '2' }] }],
  ['only first ? splits; later ? stay in the query', 'u?a=x?y', { base: 'u', params: [{ key: 'a', value: 'x?y' }] }],
  ['fragment is stripped from the query [#1014-I]', 'u?a=1#frag', { base: 'u', params: [{ key: 'a', value: '1' }] }],
  ['malformed escape falls back to raw', 'u?a=%ZZ', { base: 'u', params: [{ key: 'a', value: '%ZZ' }] }],
];
for (const [name, input, expected] of SPLIT) {
  test(`splitUrlParams: ${name}`, () => assert.deepEqual(splitUrlParams(input), expected));
}

const APPLY = [
  ['no params', 'https://x.test/', [], 'https://x.test/'],
  ['undefined params', 'https://x.test/', undefined, 'https://x.test/'],
  ['adds ?', 'https://x.test/', [{ key: 'a', value: '1' }], 'https://x.test/?a=1'],
  ['uses & when base already has ?', 'https://x.test/?z=9', [{ key: 'a', value: '1' }], 'https://x.test/?z=9&a=1'],
  ['percent-encodes key and value', 'u', [{ key: 'a b', value: 'x&y=é' }], 'u?a%20b=x%26y%3D%C3%A9'],
  ['skips entries with empty key', 'u', [{ key: '', value: 'x' }, { key: 'a', value: '1' }], 'u?a=1'],
  ['only empty keys -> no ?', 'u', [{ key: '', value: 'x' }], 'u'],
  ['skips null entries', 'u', [null, { key: 'a', value: '1' }], 'u?a=1'],
  ['empty value kept as k=', 'u', [{ key: 'a', value: '' }], 'u?a='],
  ['null base', null, [{ key: 'a', value: '1' }], '?a=1'],
];
for (const [name, base, params, expected] of APPLY) {
  test(`applyUrlParams: ${name}`, () => assert.equal(applyUrlParams(base, params), expected));
}

test('fullUrl: base + params from a model', () => {
  assert.equal(fullUrl({ url: 'https://x.test/p', params: [{ key: 'a', value: '1 2' }] }), 'https://x.test/p?a=1%202');
  assert.equal(fullUrl({ url: 'https://x.test/p', params: [] }), 'https://x.test/p');
  assert.equal(fullUrl(emptyModel()), '');
});

test('URL-param round-trip: splitUrlParams -> applyUrlParams re-encodes canonically', () => {
  const cases = [
    ['https://x.test/s?a=1&b=2', 'https://x.test/s?a=1&b=2'],
    ['https://x.test/s?q=a%20b', 'https://x.test/s?q=a%20b'],
    ['https://x.test/s?q=a+b', 'https://x.test/s?q=a%20b'], // '+' normalised to %20 (lossy form change)
    ['https://x.test/s?k=%C3%A9', 'https://x.test/s?k=%C3%A9'],
    ['https://x.test/s?a=1&a=2', 'https://x.test/s?a=1&a=2'],
    ['https://x.test/s', 'https://x.test/s'],
    ['https://x.test/s?flag', 'https://x.test/s?flag='], // bare key gains '='
  ];
  for (const [input, want] of cases) {
    const { base, params } = splitUrlParams(input);
    assert.equal(applyUrlParams(base, params), want, input);
  }
});

test('URL-param round-trip: parseCurl model -> fullUrl reproduces the original URL', () => {
  const url = 'https://api.example.com/v1/users?page=2&per_page=50&q=a%20b';
  assert.equal(fullUrl(parseCurl(`curl '${url}'`)), url);
  assert.equal(fullUrl(parseWget(`wget '${url}'`)), url);
});

test('safeDecode', () => {
  assert.equal(safeDecode('a%20b'), 'a b');
  assert.equal(safeDecode('a+b'), 'a b');
  assert.equal(safeDecode('%C3%A9'), 'é');
  assert.equal(safeDecode('%E0%A4%A'), '%E0%A4%A'); // malformed -> unchanged (raw, '+' NOT converted)
  assert.equal(safeDecode('%ZZ+x'), '%ZZ+x');
  assert.equal(safeDecode(''), '');
  assert.equal(safeDecode(null), '');
  assert.equal(safeDecode(undefined), '');
  assert.equal(safeDecode(5), '5');
});

// ============================================================
// Helpers: base64 / basic auth
// ============================================================
const B64 = [
  ['empty', '', ''],
  ['ascii', 'hello', 'aGVsbG8='],
  ['user:pass', 'user:pass', 'dXNlcjpwYXNz'],
  ['unicode (UTF-8, not Latin1)', 'é☃😀', 'w6nimIPwn5iA'],
  ['padding 2', 'a', 'YQ=='],
  ['padding 1', 'ab', 'YWI='],
];
for (const [name, text, b64] of B64) {
  test(`utf8ToBase64 / base64ToUtf8: ${name}`, () => {
    assert.equal(utf8ToBase64(text), b64);
    assert.equal(base64ToUtf8(b64), text);
  });
}

test('utf8ToBase64: null/undefined -> encodes empty string', () => {
  assert.equal(utf8ToBase64(null), '');
  assert.equal(utf8ToBase64(undefined), '');
});

test('base64ToUtf8: invalid base64 -> "" (total, no throw)', () => {
  assert.equal(base64ToUtf8('!!!not base64!!!'), '');
  assert.equal(base64ToUtf8('a'), ''); // length 1 is invalid
  assert.equal(base64ToUtf8(null), '');
});

test('base64ToUtf8: invalid UTF-8 bytes decode to U+FFFD (lossy, no throw)', () => {
  assert.equal(base64ToUtf8(Buffer.from([0xff, 0xfe]).toString('base64')), '��');
});

test('utf8ToBase64 agrees with Node Buffer for a random-ish unicode battery', () => {
  for (const s of ['', 'x', 'Zażółć gęślą jaźń', '日本語のテキスト', 'line1\nline2\ttab', '\u0000\u0001', 'a'.repeat(1000)]) {
    assert.equal(utf8ToBase64(s), Buffer.from(s, 'utf8').toString('base64'));
    assert.equal(base64ToUtf8(Buffer.from(s, 'utf8').toString('base64')), s);
  }
});

test('basicHeaderValue', () => {
  assert.equal(basicHeaderValue('Aladdin', 'open sesame'), 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  assert.equal(basicHeaderValue('user', ''), 'Basic ' + Buffer.from('user:').toString('base64'));
  assert.equal(basicHeaderValue('', ''), 'Basic Og==');
  assert.equal(basicHeaderValue(null, undefined), 'Basic Og==');
});

test('decodeBasic', () => {
  assert.deepEqual(decodeBasic('QWxhZGRpbjpvcGVuIHNlc2FtZQ=='), { user: 'Aladdin', pass: 'open sesame' });
  assert.deepEqual(decodeBasic(utf8ToBase64('u:p:with:colons')), { user: 'u', pass: 'p:with:colons' });
  assert.deepEqual(decodeBasic(utf8ToBase64('nocolon')), { user: 'nocolon', pass: '' });
  assert.deepEqual(decodeBasic(utf8ToBase64('user:')), { user: 'user', pass: '' });
  assert.deepEqual(decodeBasic(utf8ToBase64(':pw')), { user: '', pass: 'pw' });
  assert.deepEqual(decodeBasic('@@@'), { user: '', pass: '' }); // invalid base64 -> empty, total
  assert.deepEqual(decodeBasic(''), { user: '', pass: '' });
});

test('basic-auth round-trip: basicHeaderValue -> decodeBasic', () => {
  const pairs = [['al', 'pw'], ['user name', 'p@ss:w0rd'], ['üser', 'pässwörd☃'], ['u', ''], ['', 'pw'], ['a', 'b:c:d']];
  for (const [u, p] of pairs) {
    const hv = basicHeaderValue(u, p);
    assert.match(hv, /^Basic /);
    assert.deepEqual(decodeBasic(hv.slice('Basic '.length)), { user: u, pass: p }, `${u}/${p}`);
  }
});

test('basic-auth round-trip: a user with a colon is NOT recoverable (documented lossy case)', () => {
  const hv = basicHeaderValue('a:b', 'c');
  assert.deepEqual(decodeBasic(hv.slice(6)), { user: 'a', pass: 'b:c' });
});

test('basic-auth round-trip via parseCurl: -u creds == Authorization: Basic header creds', () => {
  const viaU = parseCurl('curl -u "us er:p:w" https://x.test/').auth;
  const viaH = parseCurl(`curl -H 'Authorization: ${basicHeaderValue('us er', 'p:w')}' https://x.test/`).auth;
  assert.deepEqual(viaU, viaH);
  assert.deepEqual(viaU, { type: 'basic', user: 'us er', pass: 'p:w', token: '' });
});

// ============================================================
// Helpers: parseFormPairs
// ============================================================
const FORM = [
  ['empty', '', []],
  ['null', null, []],
  ['single', 'a=1', [{ key: 'a', value: '1', kind: 'data' }]],
  ['multiple', 'a=1&b=2', [{ key: 'a', value: '1', kind: 'data' }, { key: 'b', value: '2', kind: 'data' }]],
  ['key only', 'flag', [{ key: 'flag', value: '', kind: 'data' }]],
  ['empty value', 'a=', [{ key: 'a', value: '', kind: 'data' }]],
  ['empty key', '=v', [{ key: '', value: 'v', kind: 'data' }]],
  ['value with =', 'a=b=c', [{ key: 'a', value: 'b=c', kind: 'data' }]],
  ['decodes % and +', 'a%20b=c+d&e=%C3%A9', [{ key: 'a b', value: 'c d', kind: 'data' }, { key: 'e', value: 'é', kind: 'data' }]],
  ['skips empty segments', '&a=1&&b=2&', [{ key: 'a', value: '1', kind: 'data' }, { key: 'b', value: '2', kind: 'data' }]],
  ['duplicate keys kept', 'a=1&a=2', [{ key: 'a', value: '1', kind: 'data' }, { key: 'a', value: '2', kind: 'data' }]],
  ['malformed escape stays raw', 'a=%ZZ', [{ key: 'a', value: '%ZZ', kind: 'data' }]],
  ['JSON text is not a form (best-effort split)', '{"a":1}', [{ key: '{"a":1}', value: '', kind: 'data' }]],
];
for (const [name, input, expected] of FORM) {
  test(`parseFormPairs: ${name}`, () => assert.deepEqual(parseFormPairs(input), expected));
}
