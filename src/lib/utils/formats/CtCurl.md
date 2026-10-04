# CtCurl

An HTTP-request model with a [curl](https://curl.se/)/[wget](https://www.gnu.org/software/wget/) command parser and a multi-language code emitter.

`src/lib/utils/formats/CtCurl.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

The module turns a command line into a normalized request model and turns that model back into either a regenerated command or equivalent client code in another language. A POSIX-ish shell tokenizer feeds the two command parsers (`parseCurl`, `parseWget`). `buildCurl`/`buildWget` regenerate commands from a model, and `toFetch`/`toNode`/`toPython`/`toHttpie`/`toPowerShell`/`toGo` emit code for [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch), Node, [Python requests](https://requests.readthedocs.io/), [HTTPie](https://httpie.io/), PowerShell [Invoke-WebRequest](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/invoke-webrequest), and [Go net/http](https://pkg.go.dev/net/http). Every exported function is total: bad input yields a best-effort result plus a `notes` array, never a throw, and nothing is `eval`'d. It is DOM-free and runs on the Web-platform globals present in Node 20+ ([`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder)/`TextDecoder`, `btoa`/`atob`) as well as in a browser.

### The request model

Most functions take or return a request model with this shape:

```js
{
  method: 'GET',
  url: '',
  params: [{ key, value }],
  headers: [{ name, value }],
  auth: { type: 'none' | 'basic' | 'bearer', user, pass, token },
  body: {
    type: 'none' | 'raw' | 'json' | 'form' | 'multipart',
    raw: '',
    fields: [{ key, value, kind: 'data' | 'file' }],
    urlencode: false,
  },
  flags: {
    followRedirects, insecure, compressed,
    timeout: null | number,   // seconds
    userAgent, referer,
  },
}
```

A parsed model also carries a `notes` array describing anything the parser could not represent. `url` holds the base URL with the query string split out into `params`.

## API

### `METHODS`, `AUTH_TYPES`, `BODY_TYPES`, `CONVERT_LANGS`

Constant arrays naming the recognized values. `METHODS` is `['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']`. `AUTH_TYPES` is `['none','basic','bearer']`. `BODY_TYPES` is `['none','raw','json','form','multipart']`. `CONVERT_LANGS` is `['fetch','node','python','httpie','powershell','go']`, the `lang` values `convert` accepts.

```js
import { CONVERT_LANGS } from './CtCurl.mjs';
console.log(CONVERT_LANGS); // ['fetch','node','python','httpie','powershell','go']
```

### `emptyModel() → Model`

Returns a fresh default model (`GET`, empty URL, no params/headers/body, `auth.type` `none`). Use it as a starting point to build a request by hand.

```js
import { emptyModel } from './CtCurl.mjs';
const m = emptyModel();
m.url = 'https://example.com';
```

### `normalizeModel(raw) → Model`

Coerces an arbitrary object into a valid model: unknown or missing fields fall back to the defaults, `method` is upper-cased, `auth.type`/`body.type` outside the allowed sets become `none`, and `timeout` keeps only a finite positive number (else `null`). A non-object argument returns `emptyModel()`. The builders and converters all call this first, so they tolerate a partial model.

```js
import { normalizeModel } from './CtCurl.mjs';
normalizeModel({ method: 'post', url: 'https://x.test' }).method; // 'POST'
```

### `modelWithoutSecrets(model) → Model`

Returns a normalized copy with `auth.user`, `auth.pass`, and `auth.token` cleared. Intended for persistence, so credentials never get written out.

```js
import { modelWithoutSecrets } from './CtCurl.mjs';
const safe = modelWithoutSecrets({ auth: { type: 'bearer', token: 'secret' } });
safe.auth.token; // ''
```

### `splitUrlParams(url) → { base, params }`

Splits a URL at the first `?` into a base and an array of `{ key, value }` pairs, URL-decoding each (a `+` becomes a space). A `#fragment` is dropped before splitting, since curl and browsers never send it. No `?` means an empty `params` array.

```js
import { splitUrlParams } from './CtCurl.mjs';
splitUrlParams('https://x.test/p?a=1&b=two%20words#frag');
// { base: 'https://x.test/p', params: [{key:'a',value:'1'}, {key:'b',value:'two words'}] }
```

### `applyUrlParams(base, params) → string`

The inverse: appends `params` (skipping entries with an empty key) to `base` as a URL-encoded query string, choosing `?` or `&` depending on whether `base` already has a `?`.

```js
import { applyUrlParams } from './CtCurl.mjs';
applyUrlParams('https://x.test', [{ key: 'q', value: 'a b' }]); // 'https://x.test?q=a%20b'
```

### `fullUrl(model) → string`

The URL a request actually targets: `applyUrlParams(model.url, model.params)`.

```js
import { fullUrl } from './CtCurl.mjs';
fullUrl({ url: 'https://x.test', params: [{ key: 'id', value: '7' }] }); // 'https://x.test?id=7'
```

### `safeDecode(s) → string`

`decodeURIComponent` with `+` mapped to a space, returning the original string unchanged if it is malformed rather than throwing.

```js
import { safeDecode } from './CtCurl.mjs';
safeDecode('a%2Bb');  // 'a+b'
safeDecode('%');      // '%'  (malformed, returned as-is)
```

### `shellQuote(s)`, `jsStr(s)`, `pyStr(s)`, `goStr(s)`, `psStr(s)` → string

String-literal quoters used by the builders and converters. `shellQuote` produces a POSIX single-quoted token (and leaves a shell-safe run unquoted, returning `''` for the empty string). `jsStr`/`pyStr`/`goStr` are `JSON.stringify` (valid for JS, Python, and Go double-quoted literals). `psStr` is a PowerShell single-quoted literal (`'` doubled to `''`).

```js
import { shellQuote, jsStr } from './CtCurl.mjs';
shellQuote("it's");  // "'it'\\''s'"
jsStr('a\nb');       // '"a\\nb"'
```

### `utf8ToBase64(s) → string` / `base64ToUtf8(b64) → string`

UTF-8-safe Base64 round-trip built on `TextEncoder`/`TextDecoder` plus `btoa`/`atob` (plain `btoa` mangles non-Latin1 text). `base64ToUtf8` returns `''` on invalid input.

```js
import { utf8ToBase64, base64ToUtf8 } from './CtCurl.mjs';
base64ToUtf8(utf8ToBase64('café')); // 'café'
```

### `basicHeaderValue(user, pass) → string` / `decodeBasic(b64) → { user, pass }`

Build and parse an HTTP Basic `Authorization` value. `basicHeaderValue` returns `"Basic " + base64(user:pass)`. `decodeBasic` takes the Base64 part (no `Basic ` prefix) and splits on the first `:`.

```js
import { basicHeaderValue, decodeBasic } from './CtCurl.mjs';
const v = basicHeaderValue('neo', 'pw'); // 'Basic bmVvOnB3'
decodeBasic(v.replace(/^Basic /, '')); // { user: 'neo', pass: 'pw' }
```

### `tokenizeShell(input) → string[]`

Splits a command line into tokens the way a POSIX shell would, covering enough of the grammar for curl/wget. Unquoted whitespace splits tokens. `'…'` is literal. `"…"` honors `\" \\ \` \$` escaping. A backslash escapes the next char outside quotes. [ANSI-C quoting](https://www.gnu.org/software/bash/manual/html_node/ANSI_002dC-Quoting.html) (`$'…'`) decodes `\n`, `\xNN`, and friends. A backslash-newline is a line continuation. Adjacent quoted and unquoted runs concatenate into one token (so `-d'x'` becomes `-dx`).

```js
import { tokenizeShell } from './CtCurl.mjs';
tokenizeShell(`curl -H 'A: b' "https://x.test"`);
// ['curl', '-H', 'A: b', 'https://x.test']
```

### `parseCurl(input) → Model & { notes }`

Parses a curl command line into a request model. It drops a leading `curl`, expands combined short clusters (`-sSL`, `-XPOST`), and handles the common flags: `-X/--request`, `-H/--header`, `-d/--data`(`-ascii`/`-binary`/`-raw`), `--data-urlencode`, `--json`, `-F/--form`, `-u/--user`, `-b/--cookie`, `-A/--user-agent`, `-e/--referer`, `--url`, `-L`, `-k`, `--compressed`, `-G/--get`, and `-m/--max-time`. `--flag=value` is accepted. Data flags with no explicit method imply `POST`. `-G` folds data into the query string as a `GET`. Output/display flags (`-o`, `-s`, `-v`, and so on) are recognized but recorded in `notes` as ignored, and an unknown flag is noted rather than failing. `Authorization`, `User-Agent`, and `Referer` headers are lifted into the structured `auth`/`flags`.

```js
import { parseCurl } from './CtCurl.mjs';
const m = parseCurl(`curl -X POST https://api.test/users -H 'Content-Type: application/json' -d '{"n":1}'`);
m.method;      // 'POST'
m.body.type;   // 'raw'  (-d builds a raw body; only --json sets type 'json')
m.body.raw;    // '{"n":1}'
```

### `parseWget(input) → Model & { notes }`

The wget counterpart. Drops a leading `wget`, keeps wget's `-n*` flags (`-nv`/`-nc`/`-nH`/`-nd`) whole rather than cluster-splitting them, and handles `--header`, `--method`, `--post-data`, `--body-data`, `--post-file`/`--body-file` (body left empty, since file contents cannot be inlined), `--user`/`--http-user`, `--password`/`--http-password`, `-U/--user-agent`, `--referer`, `--no-check-certificate`, `--compression`, `--max-redirect` (0 disables redirects), and `--timeout`/`--read-timeout`. A body with no explicit method implies `POST`.

```js
import { parseWget } from './CtCurl.mjs';
parseWget('wget --method=PUT --body-data=hi https://x.test').method; // 'PUT'
```

### `buildCurl(model, opts?) → string`

Regenerates a curl command from a model. `opts.longFlags` emits long flag names (`--request` instead of `-X`), and `opts.multiline` breaks the command across backslash-continued lines. A plain `GET` and a `POST` implied by a body are emitted without an explicit `-X`. Basic auth goes through `-u`. A bearer token goes as an `Authorization` header. A derived `Content-Type` is added for `json`/`form` bodies (curl sets the multipart boundary itself).

```js
import { buildCurl, emptyModel } from './CtCurl.mjs';
const m = emptyModel(); m.url = 'https://x.test'; m.method = 'DELETE';
buildCurl(m); // 'curl -X DELETE https://x.test'
```

### `buildWget(model, opts?) → string`

Regenerates a wget command. `opts.multiline` is honored. Basic auth uses `--user`/`--password`. A multipart body cannot be expressed, so it is omitted and a `# note:` comment is prepended to the output.

```js
import { buildWget } from './CtCurl.mjs';
buildWget({ url: 'https://x.test', method: 'GET' }); // 'wget https://x.test'
```

### `resolvedHeaders(model, opts?) → [{ name, value }]`

The full ordered header set a request sends: the explicit headers, plus a derived `Content-Type` (when there is a non-multipart body and none is already set), `Authorization` (basic or bearer), `User-Agent`, and `Referer`. `opts.includeContentType` and `opts.includeAuth` (both default `true`) let a builder suppress headers it renders another way.

```js
import { resolvedHeaders } from './CtCurl.mjs';
resolvedHeaders({ headers: [], auth: { type: 'bearer', token: 't' }, body: { type: 'none' }, flags: {} });
// [{ name: 'Authorization', value: 'Bearer t' }]
```

### `contentTypeForBody(body) → string | null`

The default `Content-Type` for a body type: `application/json` for `json`, `application/x-www-form-urlencoded` for `form` and `raw`, `multipart/form-data` for `multipart`, `null` for `none`.

### `hasBody(model) → boolean`

Whether the model carries a non-empty body (a raw/json body with text, or a form/multipart body with fields or raw text).

### `encodeForm(fields) → string`

Joins `{ key, value }` form fields into a URL-encoded `k=v&k=v` string, dropping entries that are empty on both sides.

```js
import { encodeForm } from './CtCurl.mjs';
encodeForm([{ key: 'a', value: '1' }, { key: 'b', value: 'x y' }]); // 'a=1&b=x%20y'
```

### `parseFormPairs(s) → [{ key, value, kind }]`

Splits a `k=v&k=v` string into decoded form fields (each `kind: 'data'`). The inverse shape to `encodeForm`.

### `toFetch(model)`, `toNode(model)`, `toPython(model)`, `toHttpie(model)`, `toPowerShell(model)`, `toGo(model)` → string

Emit equivalent client code for the model. Each normalizes the model first and renders a runnable snippet. `toFetch` uses the browser [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) API (form bodies via [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams), multipart via [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData)). `toNode` targets Node 18+ global fetch and maps a timeout to [`AbortSignal.timeout`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static). `toPython` uses `requests.request`. `toHttpie` builds an `http …` command. `toPowerShell` builds an `Invoke-WebRequest` call. `toGo` builds a `net/http` program. Where a feature has no clean equivalent (a browser cannot disable TLS verification, multipart needs a hand-built body), the output carries an explanatory comment rather than silently dropping it.

```js
import { toFetch, parseCurl } from './CtCurl.mjs';
console.log(toFetch(parseCurl('curl https://x.test')));
// const res = await fetch("https://x.test", { … });
```

### `convert(model, lang) → string`

Dispatches to the matching `to*` function by `lang` (one of `CONVERT_LANGS`), falling back to `toFetch` for an unrecognized language.

```js
import { convert, parseCurl } from './CtCurl.mjs';
convert(parseCurl('curl https://x.test'), 'python'); // Python requests code
```

## Notes

- The parsers never throw. A command they cannot fully represent still returns a model, with the lost detail recorded in `notes`. Check `notes` to surface warnings to a user.
- `--post-file`/`--body-file` leave the body empty, since the module cannot read a file off disk. Multipart requests do not survive a round-trip through `buildWget` (wget has no multipart support), and `toPowerShell`/`toGo` emit a comment instead of a full multipart body.
- Secrets (`auth.user`/`pass`/`token`) live only in memory. Use `modelWithoutSecrets` before persisting a model.
- The module uses `btoa`/`atob` and `TextEncoder`/`TextDecoder`, available in Node 20+ and every current browser.
</content>
</invoke>
