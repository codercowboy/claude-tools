// Unit tests for source/logic.mjs (pure, DOM-free). Run: node --test tests/unit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHeaderBlock, parseBlocks, KB, CATEGORIES, kbLookup, analyze, securityChecklist, summarize,
  parseSetCookie, buildHeaderBlock, PRESETS, BUILD_OPTIONS, formatSnippet, redactForStorage,
  isSensitiveHeader, SAMPLES, REDACTED,
} from '../../source/logic.mjs';

const check = (text, opts) => securityChecklist(parseHeaderBlock(text), opts);
const byId = (items, id) => items.find((i) => i.id === id);
const codes = (p) => p.issues.map((i) => i.code);

// ---------------------------------------------------------------- parser
test('parser: status line + CRLF -> response, status 200, 1 header', () => {
  const p = parseHeaderBlock('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n');
  assert.equal(p.kind, 'response');
  assert.equal(p.status, 200);
  assert.equal(p.reason, 'OK');
  assert.equal(p.headers.length, 1);
  assert.equal(p.headers[0].name, 'Content-Type');
  assert.equal(p.headers[0].value, 'text/html');
});

test('parser: obs-fold joins value and warns', () => {
  const p = parseHeaderBlock('Cache-Control: max-age=60,\n  public');
  assert.equal(p.headers.length, 1);
  assert.equal(p.headers[0].value, 'max-age=60, public');
  assert.ok(p.issues.some((i) => i.code === 'obs-fold' && i.level === 'warn'));
});

test('parser: whitespace before colon is an error but header kept', () => {
  const p = parseHeaderBlock('Content-Type : text/html');
  const e = p.issues.find((i) => i.code === 'space-before-colon');
  assert.ok(e); assert.equal(e.level, 'error');
  assert.equal(p.headers[0].name, 'Content-Type');
});

test('parser: bad name and no-colon lines', () => {
  const p = parseHeaderBlock('Bad Name: x\nnot a header line\nGood: 1');
  assert.deepEqual(codes(p).sort(), ['bad-name', 'not-a-header']);
  assert.equal(p.headers.length, 1);
});

test('parser: Set-Cookie repeats kept, no duplicate; Content-Length twice -> duplicate', () => {
  const p = parseHeaderBlock('Set-Cookie: a=b\nSet-Cookie: c=d\nContent-Length: 1\nContent-Length: 1');
  assert.equal(p.headers.filter((h) => h.lower === 'set-cookie').length, 2);
  const dups = p.issues.filter((i) => i.code === 'duplicate');
  assert.equal(dups.length, 1);
  assert.match(dups[0].msg, /Content-Length/);
});

test('parser: list headers repeat legally (no duplicate), merged by analyze', () => {
  const p = parseHeaderBlock('Cache-Control: public\nCache-Control: max-age=5');
  assert.equal(codes(p).includes('duplicate'), false);
  const card = analyze(p).cards.find((c) => c.lower === 'cache-control');
  assert.equal(card.value, 'public, max-age=5');
});

test('parser: curl -i with "< HTTP/2 200" and lowercase names', () => {
  const p = parseHeaderBlock('* Connected\n< HTTP/2 200 \n< content-type: text/html\n< x-a: 1\n<\n{ [5 bytes data]\n');
  assert.equal(p.kind, 'response');
  assert.equal(p.status, 200);
  assert.deepEqual(p.headers.map((h) => h.lower), ['content-type', 'x-a']);
});

test('parser: curl -v request + response blocks; defaults to last, selector picks first', () => {
  const txt = '> GET / HTTP/1.1\n> Host: a.com\n> \n< HTTP/1.1 200 OK\n< Server: x\n< \n';
  const last = parseHeaderBlock(txt);
  assert.equal(last.kind, 'response'); assert.equal(last.blocks.length, 2);
  const first = parseHeaderBlock(txt, { block: 0 });
  assert.equal(first.kind, 'request'); assert.equal(first.method, 'GET'); assert.equal(first.target, '/');
  assert.equal(first.headers[0].name, 'Host');
});

test('parser: redirect chain analyses last response', () => {
  const txt = 'HTTP/1.1 301 Moved\nLocation: /b\n\nHTTP/1.1 200 OK\nServer: z\n\n<html>body: not a header</html>';
  const p = parseHeaderBlock(txt);
  assert.equal(p.blocks.length, 2);
  assert.equal(p.status, 200);
  assert.deepEqual(p.headers.map((h) => h.lower), ['server']);
  assert.ok(codes(p).includes('body-ignored'));
});

test('parser: HTTP/2 pseudo-headers accepted and infer kind', () => {
  const r = parseHeaderBlock(':status: 200\ncontent-type: a/b');
  assert.equal(r.kind, 'response'); assert.equal(r.headers[0].lower, ':status');
  assert.equal(codes(r).length, 0);
  assert.equal(parseHeaderBlock(':method: GET\n:authority: x.com').kind, 'request');
});

test('parser: request start line, LF-only, empty input', () => {
  const p = parseHeaderBlock('POST /x HTTP/1.1\nHost: a');
  assert.equal(p.kind, 'request'); assert.equal(p.method, 'POST');
  const e = parseHeaderBlock('');
  assert.equal(e.kind, 'unknown'); assert.equal(e.headers.length, 0);
});

test('parser: value keeps later colons', () => {
  assert.equal(parseHeaderBlock('Location: https://a.com:8080/x').headers[0].value, 'https://a.com:8080/x');
});

// ---------------------------------------------------------------- KB
test('KB integrity: every entry has name/cat/purpose/ref (+ example/pitfalls/dir)', () => {
  const keys = Object.keys(KB);
  assert.ok(keys.length >= 70, `expected ~70 entries, got ${keys.length}`);
  for (const k of keys) {
    const e = KB[k];
    assert.equal(k, e.name.toLowerCase());
    for (const f of ['name', 'cat', 'purpose', 'ref', 'example', 'pitfalls']) assert.ok(typeof e[f] === 'string' && e[f].length > (f === 'name' || f === 'cat' ? 1 : 3), `${k}.${f}`);
    assert.ok(CATEGORIES.includes(e.cat), `${k} category ${e.cat}`);
    assert.ok(['req', 'res', 'both'].includes(e.dir), `${k}.dir`);
  }
});

test('KB: every MVP-named header is present; lookups work', () => {
  for (const n of ['cache-control', 'vary', 'access-control-allow-origin', 'strict-transport-security', 'content-security-policy', 'set-cookie', 'x-xss-protection', 'sec-fetch-site', 'x-powered-by', 'referer']) assert.ok(KB[n], n);
  assert.equal(kbLookup('sec-ch-ua-arch').cat, 'client-hints');
  assert.equal(kbLookup(':status').cat, 'misc');
  assert.equal(kbLookup('x-nope'), null);
});

test('analyze: unknown X- header gets a custom note; deprecated flagged', () => {
  const a = analyze(parseHeaderBlock('X-Custom: 1\nX-XSS-Protection: 1'));
  const c = a.cards.find((x) => x.lower === 'x-custom');
  assert.equal(c.known, false);
  assert.ok(c.issues.some((i) => i.code === 'x-prefix'));
  assert.ok(a.cards.find((x) => x.lower === 'x-xss-protection').issues.some((i) => i.code === 'deprecated'));
});

test('analyze: validators (Cache-Control, Content-Type, Vary, Content-Length, cross-header)', () => {
  const a = analyze(parseHeaderBlock('Cache-Control: max-age=abc\nContent-Type: text/html\nVary: *\nContent-Length: 12x\nTransfer-Encoding: chunked'));
  const iss = (l) => a.cards.find((c) => c.lower === l).issues.map((i) => i.code);
  assert.ok(iss('cache-control').includes('cc-numeric'));
  assert.ok(iss('content-type').includes('ct-no-charset'));
  assert.ok(iss('vary').includes('vary-star'));
  assert.ok(iss('content-length').includes('cl-numeric'));
  assert.ok(a.lint.some((i) => i.code === 'cl-te'));
});

// ---------------------------------------------------------------- checklist
test('HSTS: absent fail, max-age=0 warn, short warn, 1y pass', () => {
  assert.equal(byId(check('Server: x'), 'hsts').status, 'fail');
  assert.equal(byId(check('strict-transport-security: max-age=0'), 'hsts').status, 'warn');
  assert.equal(byId(check('Strict-Transport-Security: max-age=300'), 'hsts').status, 'warn');
  assert.equal(byId(check('strict-transport-security: max-age=31536000; includeSubDomains'), 'hsts').status, 'pass');
});

test('CORS: * + credentials true -> fail; specific origin + Vary -> pass; null -> warn', () => {
  assert.equal(byId(check('Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true'), 'cors').status, 'fail');
  assert.equal(byId(check('Access-Control-Allow-Origin: https://a.com\nVary: Origin'), 'cors').status, 'pass');
  assert.equal(byId(check('Access-Control-Allow-Origin: null'), 'cors').status, 'warn');
  assert.equal(byId(check('Server: x'), 'cors'), undefined);
});

test('Set-Cookie checklist: SameSite=None without Secure warns; full flags pass; prefixes', () => {
  const warn = check('Set-Cookie: a=b; SameSite=None');
  assert.equal(byId(warn, 'cookie:0').status, 'warn');
  assert.match(byId(warn, 'cookie:0').msg, /SameSite=None requires Secure/);
  assert.equal(byId(check('Set-Cookie: a=b; Secure; HttpOnly; SameSite=Lax'), 'cookie:0').status, 'pass');
  assert.equal(byId(check('Set-Cookie: __Host-x=1; Secure; Path=/'), 'cookie:0').status, 'warn'); // valid structure; hygiene flags only
  assert.equal(parseSetCookie('__Host-x=1; Secure; Path=/').valid, true);
  assert.equal(parseSetCookie('__Host-x=1; Path=/sub; Secure').valid, false);
  assert.equal(byId(check('Set-Cookie: __Host-x=1; Path=/sub; Secure'), 'cookie:0').status, 'fail');
  assert.equal(parseSetCookie('__Secure-y=1').valid, false);
  assert.equal(parseSetCookie('__Host-x=1; Secure; Path=/; Domain=a.com').valid, false);
});

test('Set-Cookie: two cookies produce two checklist items', () => {
  const items = check('Set-Cookie: a=b\nSet-Cookie: c=d; Secure; HttpOnly; SameSite=Strict');
  assert.equal(byId(items, 'cookie:0').status, 'warn');
  assert.equal(byId(items, 'cookie:1').status, 'pass');
});

test('X-XSS-Protection: "1; mode=block" warns, "0" passes', () => {
  assert.equal(byId(check('X-XSS-Protection: 1; mode=block'), 'deprecated:x-xss-protection').status, 'warn');
  assert.equal(byId(check('X-XSS-Protection: 0'), 'deprecated:x-xss-protection').status, 'pass');
});

test('CSP: absent fail, report-only warn, unsafe-inline warn, strict pass, nonce neutralises unsafe-inline', () => {
  assert.equal(byId(check('Server: x'), 'csp').status, 'fail');
  assert.equal(byId(check("Content-Security-Policy-Report-Only: default-src 'self'"), 'csp').status, 'warn');
  assert.equal(byId(check("Content-Security-Policy: script-src 'self' 'unsafe-inline'"), 'csp').status, 'warn');
  assert.equal(byId(check("Content-Security-Policy: script-src 'self' data:"), 'csp').status, 'warn');
  assert.equal(byId(check("Content-Security-Policy: frame-ancestors 'none'"), 'csp').status, 'warn');
  assert.equal(byId(check("Content-Security-Policy: default-src 'self'; object-src 'none'"), 'csp').status, 'pass');
  assert.equal(byId(check("Content-Security-Policy: script-src 'nonce-abc' 'unsafe-inline'"), 'csp').status, 'pass');
});

test('nosniff / clickjacking / referrer / permissions / isolation / disclosure', () => {
  assert.equal(byId(check('X-Content-Type-Options: nosniff'), 'xcto').status, 'pass');
  assert.equal(byId(check('X-Content-Type-Options: other'), 'xcto').status, 'warn');
  assert.equal(byId(check('Server: x'), 'xcto').status, 'warn');
  assert.equal(byId(check('X-Frame-Options: DENY'), 'clickjacking').status, 'pass');
  assert.equal(byId(check("Content-Security-Policy: frame-ancestors 'none'"), 'clickjacking').status, 'pass');
  assert.equal(byId(check('X-Frame-Options: ALLOW-FROM https://a.com'), 'clickjacking').status, 'fail');
  assert.equal(byId(check('Server: x'), 'clickjacking').status, 'warn');
  assert.equal(byId(check('Referrer-Policy: no-referrer'), 'referrer').status, 'pass');
  assert.equal(byId(check('Referrer-Policy: unsafe-url'), 'referrer').status, 'warn');
  assert.equal(byId(check('Server: x'), 'referrer').status, 'warn');
  assert.equal(byId(check('Server: x'), 'permissions').status, 'info');
  assert.equal(byId(check('Permissions-Policy: camera=()'), 'permissions').status, 'pass');
  assert.equal(byId(check('Cross-Origin-Opener-Policy: same-origin'), 'isolation').status, 'pass');
  assert.equal(byId(check('Server: x'), 'isolation').status, 'info');
  assert.equal(byId(check('Server: nginx/1.25'), 'disclosure').status, 'warn');
  assert.equal(byId(check('X-Powered-By: PHP'), 'disclosure').status, 'warn');
  assert.equal(byId(check('Server: nginx'), 'disclosure').status, 'pass');
});

test('cache sensitivity: Set-Cookie without private/no-store warns', () => {
  assert.equal(byId(check('Set-Cookie: a=b'), 'cache-sensitivity').status, 'warn');
  assert.equal(byId(check('Set-Cookie: a=b\nCache-Control: private'), 'cache-sensitivity').status, 'pass');
  assert.equal(byId(check('Server: x'), 'cache-sensitivity'), undefined);
});

test('checklist: skipped for requests (incl. override); summarize counts', () => {
  assert.deepEqual(check('GET / HTTP/1.1\nHost: a'), []);
  assert.deepEqual(check('Server: x', { kind: 'request' }), []);
  assert.ok(check('GET / HTTP/1.1\nHost: a', { kind: 'response' }).length > 0);
  const s = summarize(check(SAMPLES.response));
  assert.equal(s.pass + s.warn + s.fail + s.info, check(SAMPLES.response).length);
  assert.ok(s.fail >= 2 && s.warn >= 3);
});

// ---------------------------------------------------------------- builder
test('builder: deterministic, ordered, skips blanks, sanitises custom rows', () => {
  assert.equal(buildHeaderBlock({}), '');
  const out = buildHeaderBlock({ xcto: true, hsts: true, customHeaders: [{ name: 'X-Ok', value: 'a\r\nInjected: b' }, { name: 'bad name', value: 'x' }, { name: '', value: 'y' }] });
  assert.deepEqual(out.split('\n'), ['Strict-Transport-Security: max-age=63072000; includeSubDomains', 'X-Content-Type-Options: nosniff', 'X-Ok: a Injected: b']);
  assert.match(buildHeaderBlock({ corsOrigin: 'https://a.com' }), /Vary: Origin/);
  assert.doesNotMatch(buildHeaderBlock({ corsOrigin: '*' }), /Vary/);
  assert.match(buildHeaderBlock({ download: 'a"b.pdf' }), /filename="a_b\.pdf"/);
  assert.equal(BUILD_OPTIONS.length, new Set(BUILD_OPTIONS.map((o) => o.id)).size);
});

test('builder round-trip: every preset parses clean and has ZERO fail in analyze()', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    const block = buildHeaderBlock(p.selection);
    const parsed = parseHeaderBlock(block);
    assert.deepEqual(parsed.issues, [], `${name} parse issues`);
    const a = analyze(parsed);
    assert.equal(a.summary.fail, 0, `${name} fails: ${JSON.stringify(a.checklist.filter((i) => i.status === 'fail'))}`);
    assert.equal(a.cards.every((c) => c.known), true, `${name} unknown headers`);
  }
  const s = analyze(parseHeaderBlock(buildHeaderBlock(PRESETS.static.selection)));
  assert.ok(s.summary.pass >= 6);
});

test('snippet formats', () => {
  const b = 'X-A: a"b\nX-B: it\'s';
  assert.equal(formatSnippet(b, 'raw'), b);
  assert.equal(formatSnippet(b, 'nginx').split('\n')[0], 'add_header X-A "a\\"b" always;');
  assert.equal(formatSnippet(b, 'apache').split('\n')[1], 'Header always set X-B "it\'s"');
  assert.equal(formatSnippet(b, 'express').split('\n')[1], "res.setHeader('X-B', 'it\\'s');");
});

// ---------------------------------------------------------------- redaction
test('redactForStorage: strips the four secret headers (values), keeps the rest + line endings', () => {
  const src = 'GET / HTTP/1.1\r\nHost: a.com\r\nAuthorization: Bearer SECRET\r\ncookie: sid=SECRET2\r\nProxy-Authorization: Basic SECRET3\r\nAccept: */*\r\n';
  const out = redactForStorage(src);
  assert.doesNotMatch(out, /SECRET/);
  assert.equal(out, `GET / HTTP/1.1\r\nHost: a.com\r\nAuthorization: ${REDACTED}\r\ncookie: ${REDACTED}\r\nProxy-Authorization: ${REDACTED}\r\nAccept: */*\r\n`);
});

test('redactForStorage: Set-Cookie, curl prefixes, folded continuation lines', () => {
  const out = redactForStorage('< HTTP/2 200\n< Set-Cookie: sid=SECRET;\n   Path=/SECRETPATH\n< set-cookie : b=SECRET\n< Content-Type: text/html');
  assert.doesNotMatch(out, /SECRET/);
  assert.match(out, /< Content-Type: text\/html/);
  assert.match(out, /< Set-Cookie: \[redacted\]/);
  assert.equal(redactForStorage('X-Authorization-Note: keep'), 'X-Authorization-Note: keep');
  assert.equal(redactForStorage(''), '');
  assert.equal(redactForStorage(null), '');
  assert.ok(isSensitiveHeader(' Cookie ') && !isSensitiveHeader('Accept'));
});

test('redacted Set-Cookie value does not produce structural noise', () => {
  const a = analyze(parseHeaderBlock(redactForStorage('HTTP/1.1 200 OK\nSet-Cookie: a=b')));
  assert.equal(byId(a.checklist, 'cookie:0').status, 'info');
  assert.equal(a.cards.find((c) => c.lower === 'set-cookie').issues.every((i) => i.level === 'info'), true);
});

test('samples parse and have the intended shape', () => {
  assert.equal(parseHeaderBlock(SAMPLES.response).kind, 'response');
  assert.equal(parseHeaderBlock(SAMPLES.request).kind, 'request');
  assert.equal(parseBlocks(SAMPLES.response).length, 1);
});
