// =====================================================================
// http-headers — pure, DOM-free engine: parser, knowledge base, security
// checklist, builder, and storage redaction. No DOM, no localStorage, no
// network. Unit-tested directly by tests/unit/*.test.mjs and inlined into
// the shipped index.html by the build.
// =====================================================================

// ---------------------------------------------------------------------
// 1. Knowledge base (a plain data literal — never fetched; file:// safe)
// ---------------------------------------------------------------------
export const CATEGORIES = [
  'caching', 'cors', 'security', 'content', 'negotiation', 'conditional',
  'auth/cookies', 'connection/transport', 'redirect', 'info/disclosure',
  'client-hints', 'misc',
];

// [name, cat, dir, purpose, example, pitfalls, ref, flags?]
// flags: multi (list-valued, repeats are legal), dep (deprecated/obsolete),
//        sec (security-relevant), hdrs (repeats legal but not merge-able, e.g. Set-Cookie)
const KB_ROWS = [
  // ---- caching ----
  ['Cache-Control', 'caching', 'both', 'Directives that tell browsers and shared caches whether and how long a response may be stored and reused.', 'Cache-Control: public, max-age=3600', 'no-cache means "revalidate before reuse", not "do not store" (that is no-store); max-age on a response with Set-Cookie can leak private data via shared caches.', 'RFC 9111 5.2', { multi: true }],
  ['Expires', 'caching', 'res', 'An absolute date after which the response is stale; ignored when Cache-Control max-age or s-maxage is present.', 'Expires: Wed, 21 Oct 2026 07:28:00 GMT', 'An invalid date such as 0 or -1 is treated as already expired; prefer Cache-Control: max-age.', 'RFC 9111 5.3'],
  ['Age', 'caching', 'res', 'Seconds the response has spent in shared caches, added by caches.', 'Age: 24', 'Set by caches, not origins; a large Age against a small max-age means a stale hit.', 'RFC 9111 5.1'],
  ['ETag', 'caching', 'res', 'An opaque validator for the current representation, used for conditional requests.', 'ETag: "33a64df5"', 'Weak validators start with W/; an ETag that changes per server in a pool defeats revalidation.', 'RFC 9110 8.8.3'],
  ['Last-Modified', 'caching', 'res', 'When the origin believes the representation last changed; a weaker validator than ETag.', 'Last-Modified: Tue, 15 Nov 2025 12:45:26 GMT', 'Heuristic freshness (10% of age) applies when no explicit lifetime is given.', 'RFC 9110 8.8.2'],
  ['Vary', 'caching', 'res', 'Lists request headers that influenced the response so caches key on them.', 'Vary: Accept-Encoding, Origin', 'Vary: * defeats caching; Vary: Cookie or User-Agent fragments the cache; a CORS response with a non-wildcard origin needs Vary: Origin.', 'RFC 9110 12.5.5', { multi: true }],
  ['Pragma', 'caching', 'both', 'Legacy HTTP/1.0 cache directive; only "no-cache" is defined and only on requests.', 'Pragma: no-cache', 'Obsolete on responses; use Cache-Control instead.', 'RFC 9111 5.4', { dep: true, multi: true }],
  ['Clear-Site-Data', 'caching', 'res', 'Asks the browser to clear cookies, storage, or cache for the site, typically on logout.', 'Clear-Site-Data: "cache", "cookies", "storage"', 'Directive values must be quoted strings; "*" clears everything.', 'W3C Clear Site Data', { multi: true }],
  // ---- conditional ----
  ['If-None-Match', 'conditional', 'req', 'Makes a request conditional on the current ETag differing from the listed ones; a match yields 304.', 'If-None-Match: "33a64df5"', 'Compared weakly for GET; * matches any existing representation.', 'RFC 9110 13.1.2', { multi: true }],
  ['If-Modified-Since', 'conditional', 'req', 'Asks for the body only if it changed after the given date; otherwise 304.', 'If-Modified-Since: Tue, 15 Nov 2025 12:45:26 GMT', 'Ignored when If-None-Match is also sent.', 'RFC 9110 13.1.3'],
  ['If-Match', 'conditional', 'req', 'Performs the request only if the current ETag matches; used for safe updates (lost-update protection).', 'If-Match: "33a64df5"', 'Uses strong comparison, so weak ETags never match.', 'RFC 9110 13.1.1', { multi: true }],
  ['If-Unmodified-Since', 'conditional', 'req', 'Performs the request only if the resource has not changed since the date.', 'If-Unmodified-Since: Tue, 15 Nov 2025 12:45:26 GMT', 'Ignored when If-Match is present.', 'RFC 9110 13.1.4'],
  ['If-Range', 'conditional', 'req', 'Makes a Range request conditional; if the validator no longer matches, the full body is sent.', 'If-Range: "33a64df5"', 'Only valid alongside a Range header.', 'RFC 9110 13.1.5'],
  // ---- cors ----
  ['Access-Control-Allow-Origin', 'cors', 'res', 'Names the origin allowed to read this response cross-origin (or * for any).', 'Access-Control-Allow-Origin: https://app.example.com', '* cannot be combined with credentials; reflecting the Origin header without an allowlist is unsafe; add Vary: Origin when the value varies.', 'WHATWG Fetch 3.2', { sec: true }],
  ['Access-Control-Allow-Credentials', 'cors', 'res', 'Allows the browser to expose the response to code when the request carried credentials.', 'Access-Control-Allow-Credentials: true', 'The only valid value is the literal true; it requires a specific (non-*) allow-origin.', 'WHATWG Fetch 3.2', { sec: true }],
  ['Access-Control-Allow-Methods', 'cors', 'res', 'Methods allowed on the actual request, sent in a preflight response.', 'Access-Control-Allow-Methods: GET, POST, PUT', 'Wildcard * is not honoured for credentialed requests.', 'WHATWG Fetch 3.2', { multi: true }],
  ['Access-Control-Allow-Headers', 'cors', 'res', 'Request headers allowed on the actual request, sent in a preflight response.', 'Access-Control-Allow-Headers: Content-Type, Authorization', 'Authorization is not covered by * and must be listed explicitly.', 'WHATWG Fetch 3.2', { multi: true }],
  ['Access-Control-Expose-Headers', 'cors', 'res', 'Response headers that cross-origin scripts may read beyond the safelisted ones.', 'Access-Control-Expose-Headers: X-Request-Id', 'Without it, scripts cannot read custom headers such as X-Request-Id.', 'WHATWG Fetch 3.2', { multi: true }],
  ['Access-Control-Max-Age', 'cors', 'res', 'Seconds a preflight result may be cached.', 'Access-Control-Max-Age: 600', 'Browsers cap it (Chromium 2 hours, Firefox 24 hours).', 'WHATWG Fetch 3.2'],
  ['Origin', 'cors', 'req', 'Identifies the origin (scheme, host, port) that initiated the request.', 'Origin: https://app.example.com', 'Sent on cross-origin and on same-origin non-GET requests; the value null appears for sandboxed or file:// pages.', 'RFC 6454 7'],
  ['Access-Control-Request-Method', 'cors', 'req', 'Sent on a preflight to announce the method the actual request will use.', 'Access-Control-Request-Method: PUT', 'Only appears on OPTIONS preflight requests.', 'WHATWG Fetch 3.2'],
  ['Access-Control-Request-Headers', 'cors', 'req', 'Sent on a preflight to announce the headers the actual request will carry.', 'Access-Control-Request-Headers: content-type, authorization', 'The server must echo or allow every listed header.', 'WHATWG Fetch 3.2', { multi: true }],
  ['Timing-Allow-Origin', 'cors', 'res', 'Allows listed origins to read detailed Resource Timing data for this response.', 'Timing-Allow-Origin: *', 'Without it, cross-origin timing entries are mostly zeroed.', 'W3C Resource Timing', { multi: true }],
  // ---- security ----
  ['Strict-Transport-Security', 'security', 'res', 'Tells browsers to use HTTPS only for this host for max-age seconds.', 'Strict-Transport-Security: max-age=63072000; includeSubDomains', 'Ignored over plain HTTP; preload is a long-term commitment; max-age=0 removes the policy.', 'RFC 6797', { sec: true }],
  ['Content-Security-Policy', 'security', 'res', 'Restricts the sources a page may load scripts, styles, frames, and more from, mitigating XSS.', "Content-Security-Policy: default-src 'self'; object-src 'none'", "'unsafe-inline', 'unsafe-eval', bare * and data: in script-src undermine the policy.", 'W3C CSP3', { sec: true, multi: true }],
  ['Content-Security-Policy-Report-Only', 'security', 'res', 'Evaluates a CSP and reports violations without blocking anything.', "Content-Security-Policy-Report-Only: default-src 'self'; report-to csp", 'Does not protect users; it is a rollout aid, not a replacement for the enforcing header.', 'W3C CSP3', { sec: true, multi: true }],
  ['X-Content-Type-Options', 'security', 'res', 'Stops browsers from MIME-sniffing a response away from its declared Content-Type.', 'X-Content-Type-Options: nosniff', 'nosniff is the only defined value; it relies on an accurate Content-Type.', 'WHATWG Fetch 3.4', { sec: true }],
  ['X-Frame-Options', 'security', 'res', 'Controls whether the page may be embedded in a frame (clickjacking defence).', 'X-Frame-Options: DENY', 'ALLOW-FROM is obsolete; CSP frame-ancestors supersedes this header.', 'RFC 7034', { sec: true }],
  ['Referrer-Policy', 'security', 'res', 'Controls how much of the page URL is sent in the Referer header.', 'Referrer-Policy: strict-origin-when-cross-origin', 'unsafe-url and no-referrer-when-downgrade leak full URLs cross-origin.', 'W3C Referrer Policy', { sec: true, multi: true }],
  ['Permissions-Policy', 'security', 'res', 'Enables or disables powerful browser features (camera, geolocation, ...) for the page and its frames.', 'Permissions-Policy: camera=(), microphone=(), geolocation=()', 'Uses structured-field syntax (parentheses), not the old Feature-Policy syntax.', 'W3C Permissions Policy', { sec: true, multi: true }],
  ['Cross-Origin-Opener-Policy', 'security', 'res', 'Isolates the browsing context group from cross-origin popups (needed for cross-origin isolation).', 'Cross-Origin-Opener-Policy: same-origin', 'same-origin breaks window.opener flows such as some OAuth popups.', 'WHATWG HTML 7.1.3', { sec: true }],
  ['Cross-Origin-Embedder-Policy', 'security', 'res', 'Requires embedded cross-origin resources to opt in, enabling cross-origin isolation.', 'Cross-Origin-Embedder-Policy: require-corp', 'Enabling it can break third-party embeds that lack CORP/CORS headers.', 'WHATWG HTML 7.1.4', { sec: true }],
  ['Cross-Origin-Resource-Policy', 'security', 'res', 'Declares who may load this resource cross-origin, blocking no-cors embeds from others.', 'Cross-Origin-Resource-Policy: same-origin', 'same-origin blocks legitimate CDN/image hotlinking by other sites.', 'WHATWG Fetch 3.5', { sec: true }],
  ['X-Permitted-Cross-Domain-Policies', 'security', 'res', 'Controls whether Adobe Flash/PDF clients may load cross-domain policy files.', 'X-Permitted-Cross-Domain-Policies: none', 'Largely irrelevant since Flash EOL; harmless to set to none.', 'OWASP Secure Headers', { sec: true }],
  ['X-XSS-Protection', 'security', 'res', 'Controlled the legacy browser XSS auditor, which has been removed from modern browsers.', 'X-XSS-Protection: 0', 'The auditor itself introduced vulnerabilities; set 0 or omit and rely on CSP.', 'MDN X-XSS-Protection', { dep: true, sec: true }],
  ['Expect-CT', 'security', 'res', 'Opted a site into Certificate Transparency enforcement; no longer needed.', 'Expect-CT: max-age=86400, enforce', 'Deprecated and removed; CT is now mandatory for public certificates.', 'RFC 9163 (obsolete)', { dep: true, sec: true }],
  ['Feature-Policy', 'security', 'res', 'The predecessor of Permissions-Policy.', "Feature-Policy: geolocation 'none'", 'Deprecated; replace with Permissions-Policy.', 'MDN Feature-Policy', { dep: true, sec: true }],
  ['Public-Key-Pins', 'security', 'res', 'HTTP Public Key Pinning (HPKP): pinned certificate keys for the host.', 'Public-Key-Pins: pin-sha256="..."; max-age=5184000', 'Removed from browsers; a bad pin could brick a site. Remove it.', 'RFC 7469 (obsolete)', { dep: true, sec: true }],
  ['Public-Key-Pins-Report-Only', 'security', 'res', 'Report-only variant of HPKP.', 'Public-Key-Pins-Report-Only: pin-sha256="..."', 'Removed from browsers; delete it.', 'RFC 7469 (obsolete)', { dep: true, sec: true }],
  ['P3P', 'security', 'res', 'Platform for Privacy Preferences compact policy; obsolete and ignored by modern browsers.', 'P3P: CP="CAO PSA OUR"', 'Dead since Internet Explorer; remove it.', 'W3C P3P (obsolete)', { dep: true }],
  ['Reporting-Endpoints', 'security', 'res', 'Declares named endpoints that browsers send reports (CSP, COOP, ...) to.', 'Reporting-Endpoints: csp="https://example.com/report"', 'Replaces Report-To; endpoint URLs must be HTTPS.', 'W3C Reporting API', { multi: true }],
  ['Report-To', 'security', 'res', 'Older JSON-based Reporting API endpoint declaration.', 'Report-To: {"group":"csp","max_age":86400,"endpoints":[{"url":"https://example.com/r"}]}', 'Superseded by Reporting-Endpoints.', 'W3C Reporting API (legacy)', { multi: true, dep: true }],
  ['NEL', 'security', 'res', 'Network Error Logging: asks browsers to report connection failures for the origin.', 'NEL: {"report_to":"default","max_age":2592000}', 'Needs a matching Report-To/Reporting-Endpoints group.', 'W3C Network Error Logging'],
  // ---- content ----
  ['Content-Type', 'content', 'both', 'The media type (and optional charset) of the body.', 'Content-Type: text/html; charset=utf-8', 'Missing charset on text/* lets browsers guess; application/json needs no charset; a wrong type plus no nosniff invites sniffing.', 'RFC 9110 8.3'],
  ['Content-Length', 'content', 'both', 'Size of the body in bytes.', 'Content-Length: 1024', 'Must not be sent with Transfer-Encoding; conflicting duplicates enable request smuggling.', 'RFC 9110 8.6'],
  ['Content-Encoding', 'content', 'both', 'Compression or other encoding applied to the body.', 'Content-Encoding: gzip', 'Pair with Vary: Accept-Encoding; encodings are applied in the listed order.', 'RFC 9110 8.4', { multi: true }],
  ['Content-Language', 'content', 'both', 'The natural language(s) of the intended audience of the body.', 'Content-Language: en-US', 'Describes the content, not the request; use Accept-Language to negotiate.', 'RFC 9110 8.5', { multi: true }],
  ['Content-Disposition', 'content', 'res', 'Hints whether to display the body inline or download it, and the suggested filename.', 'Content-Disposition: attachment; filename="report.pdf"', 'Non-ASCII filenames need the filename* (RFC 8187) form; unvalidated filenames enable header injection.', 'RFC 6266'],
  ['Content-Range', 'content', 'res', 'Which part of the full representation a 206 response carries.', 'Content-Range: bytes 0-1023/4096', 'Use */size on 416 responses.', 'RFC 9110 14.4'],
  ['Content-Location', 'content', 'res', 'An alternate URL for the returned representation.', 'Content-Location: /items/42', 'Not a redirect; browsers do not navigate to it.', 'RFC 9110 8.7'],
  ['Transfer-Encoding', 'content', 'both', 'Hop-by-hop encoding used to move the message (chunked).', 'Transfer-Encoding: chunked', 'Together with Content-Length it is a request-smuggling smell; not valid in HTTP/2.', 'RFC 9112 6.1', { multi: true }],
  ['Digest', 'content', 'both', 'Legacy instance digest of the body (RFC 3230).', 'Digest: sha-256=X48E9qOok...', 'Superseded by Content-Digest and Repr-Digest.', 'RFC 3230 (legacy)', { multi: true, dep: true }],
  ['Content-Digest', 'content', 'both', 'A digest of the message content as sent, for integrity checking.', 'Content-Digest: sha-256=:X48E9qOok...:', 'Computed over the encoded content, unlike Repr-Digest.', 'RFC 9530', { multi: true }],
  ['Link', 'content', 'both', 'Typed links to related resources (preload, canonical, next, ...).', 'Link: </style.css>; rel=preload; as=style', 'URI-references go in angle brackets; commas separate links.', 'RFC 8288', { multi: true }],
  // ---- redirect ----
  ['Location', 'redirect', 'res', 'Target URL of a redirect (3xx) or the URL of a newly created resource (201).', 'Location: https://example.com/new', 'Relative references are allowed but must resolve against the request URL.', 'RFC 9110 10.2.2'],
  ['Refresh', 'redirect', 'res', 'Non-standard header that reloads or redirects after a delay.', 'Refresh: 5; url=https://example.com/', 'Not part of the HTTP standards; prefer a real redirect.', 'WHATWG HTML (non-standard)', { dep: true }],
  // ---- negotiation ----
  ['Accept', 'negotiation', 'req', 'Media types the client can handle, with quality weights.', 'Accept: text/html,application/json;q=0.9,*/*;q=0.8', 'Servers may ignore it; always check the response Content-Type.', 'RFC 9110 12.5.1', { multi: true }],
  ['Accept-Encoding', 'negotiation', 'req', 'Content encodings the client can decode.', 'Accept-Encoding: gzip, br', 'A server that compresses must send Vary: Accept-Encoding.', 'RFC 9110 12.5.3', { multi: true }],
  ['Accept-Language', 'negotiation', 'req', 'Preferred natural languages, with quality weights.', 'Accept-Language: en-US,en;q=0.9', 'Contributes to fingerprinting; servers using it must send Vary: Accept-Language.', 'RFC 9110 12.5.4', { multi: true }],
  ['Accept-Charset', 'negotiation', 'req', 'Character sets the client accepts.', 'Accept-Charset: utf-8', 'Obsolete; browsers no longer send it and UTF-8 is the default.', 'RFC 9110 (obsolete)', { dep: true, multi: true }],
  ['Accept-Ranges', 'negotiation', 'res', 'Advertises whether the server supports byte-range requests.', 'Accept-Ranges: bytes', 'none explicitly says ranges are unsupported.', 'RFC 9110 14.3'],
  ['Range', 'negotiation', 'req', 'Requests only part of a representation.', 'Range: bytes=0-1023', 'Servers may ignore it and answer 200 with the full body.', 'RFC 9110 14.2'],
  ['Prefer', 'negotiation', 'req', 'Optional processing preferences (return=minimal, respond-async, ...).', 'Prefer: return=minimal', 'Preferences are hints; honoured ones are echoed in Preference-Applied.', 'RFC 7240', { multi: true }],
  // ---- auth/cookies ----
  ['Authorization', 'auth/cookies', 'req', 'Credentials authenticating the client to the server.', 'Authorization: Bearer <token>', 'Contains secrets: never log, cache-share, or paste it into public tickets.', 'RFC 9110 11.6.2', { sec: true }],
  ['WWW-Authenticate', 'auth/cookies', 'res', 'Authentication challenge accompanying a 401 response.', 'WWW-Authenticate: Bearer realm="api"', 'May repeat, one challenge per scheme; commas inside challenges make parsing tricky.', 'RFC 9110 11.6.1', { hdrs: true }],
  ['Proxy-Authenticate', 'auth/cookies', 'res', 'Authentication challenge from a proxy accompanying a 407.', 'Proxy-Authenticate: Basic realm="proxy"', 'Applies to the next proxy hop only.', 'RFC 9110 11.7.1', { hdrs: true }],
  ['Proxy-Authorization', 'auth/cookies', 'req', 'Credentials for authenticating to a proxy.', 'Proxy-Authorization: Basic dXNlcjpwYXNz', 'Contains secrets; Basic credentials are only base64-encoded, not encrypted.', 'RFC 9110 11.7.2', { sec: true }],
  ['Cookie', 'auth/cookies', 'req', 'Cookies the browser sends back to the server.', 'Cookie: sid=abc123; theme=dark', 'Session cookies are secrets; large cookie headers can exceed server limits.', 'RFC 6265 5.4', { sec: true }],
  ['Set-Cookie', 'auth/cookies', 'res', 'Instructs the browser to store a cookie, with attributes controlling scope and security.', 'Set-Cookie: sid=abc; Secure; HttpOnly; SameSite=Lax; Path=/', 'Send one header per cookie (never merge); SameSite=None requires Secure; __Host- and __Secure- prefixes have enforced rules.', 'RFC 6265bis 4.1', { sec: true, hdrs: true }],
  // ---- connection/transport ----
  ['Connection', 'connection/transport', 'both', 'Connection-specific options (close, keep-alive, upgrade) and the names of hop-by-hop headers.', 'Connection: keep-alive', 'Connection-specific headers are forbidden in HTTP/2 and HTTP/3.', 'RFC 9110 7.6.1', { multi: true }],
  ['Keep-Alive', 'connection/transport', 'both', 'Parameters (timeout, max) for a persistent HTTP/1.1 connection.', 'Keep-Alive: timeout=5, max=1000', 'Advisory only and not valid in HTTP/2.', 'RFC 9112 (informal)', { multi: true }],
  ['Upgrade', 'connection/transport', 'both', 'Proposes switching protocols on the same connection (WebSocket, h2c).', 'Upgrade: websocket', 'Must be paired with Connection: Upgrade.', 'RFC 9110 7.8', { multi: true }],
  ['Host', 'connection/transport', 'req', 'The authority (host[:port]) the request targets, enabling virtual hosting.', 'Host: example.com', 'Required in HTTP/1.1; HTTP/2 uses :authority. Trusting it unvalidated enables host-header attacks.', 'RFC 9110 7.2'],
  ['Date', 'connection/transport', 'both', 'When the message was originated.', 'Date: Tue, 15 Nov 2025 08:12:31 GMT', 'Must be an IMF-fixdate in GMT; clock skew affects freshness calculations.', 'RFC 9110 6.6.1'],
  ['Server', 'info/disclosure', 'res', 'Identifies the origin server software.', 'Server: nginx', 'Version numbers (nginx/1.25.3) help attackers pick exploits; prefer a bare or generic value.', 'RFC 9110 10.2.4', { sec: true }],
  ['Via', 'connection/transport', 'both', 'Records the proxies and gateways a message passed through.', 'Via: 1.1 varnish, 1.1 cloudflare', 'Can reveal internal infrastructure names.', 'RFC 9110 7.6.3', { multi: true }],
  ['Forwarded', 'connection/transport', 'req', 'Standard header carrying information lost by proxies (client IP, proto, host).', 'Forwarded: for=192.0.2.60;proto=https;host=example.com', 'Trust it only from known proxies; clients can forge it.', 'RFC 7239', { multi: true }],
  ['X-Forwarded-For', 'connection/transport', 'req', 'De facto list of client and proxy IPs a request travelled through.', 'X-Forwarded-For: 203.0.113.7, 198.51.100.2', 'Spoofable; only the entries appended by your own proxies can be trusted.', 'MDN X-Forwarded-For (de facto)', { multi: true }],
  ['X-Forwarded-Proto', 'connection/transport', 'req', 'De facto header giving the scheme the client used to reach the proxy.', 'X-Forwarded-Proto: https', 'Needed to detect HTTPS behind TLS-terminating proxies; spoofable if not stripped at the edge.', 'MDN X-Forwarded-Proto (de facto)'],
  ['X-Forwarded-Host', 'connection/transport', 'req', 'De facto header giving the original Host the client requested.', 'X-Forwarded-Host: example.com', 'Trusting it blindly enables cache poisoning and password-reset link poisoning.', 'MDN X-Forwarded-Host (de facto)'],
  ['Alt-Svc', 'connection/transport', 'res', 'Advertises alternative endpoints or protocols (HTTP/3) for the origin.', 'Alt-Svc: h3=":443"; ma=86400', 'Alt-Svc: clear removes previously advertised alternatives.', 'RFC 7838', { multi: true }],
  ['Retry-After', 'connection/transport', 'res', 'How long to wait before retrying (503, 429, or 3xx).', 'Retry-After: 120', 'Either delay-seconds or an HTTP date.', 'RFC 9110 10.2.3'],
  ['Allow', 'connection/transport', 'res', 'Methods supported by the target resource; required on 405.', 'Allow: GET, HEAD, OPTIONS', 'Describes the resource, not CORS permissions.', 'RFC 9110 10.2.1', { multi: true }],
  ['TE', 'connection/transport', 'req', 'Transfer codings the client accepts (and "trailers").', 'TE: trailers', 'In HTTP/2 only "trailers" is permitted.', 'RFC 9110 10.1.4', { multi: true }],
  ['Trailer', 'connection/transport', 'res', 'Announces which header fields will follow the body in the trailer section.', 'Trailer: Expires', 'Many intermediaries drop trailers.', 'RFC 9110 6.6.2', { multi: true }],
  ['Expect', 'connection/transport', 'req', 'Expectations the server must meet before the body is sent (100-continue).', 'Expect: 100-continue', 'Servers that do not understand an expectation must answer 417.', 'RFC 9110 10.1.1'],
  ['User-Agent', 'connection/transport', 'req', 'Identifies the client software.', 'User-Agent: Mozilla/5.0 (...) Chrome/124.0', 'Increasingly frozen or reduced; do not branch features on it.', 'RFC 9110 10.1.5'],
  ['Referer', 'connection/transport', 'req', 'The URL of the page that linked to the request (the misspelling is historical).', 'Referer: https://example.com/page', 'Can leak URLs with tokens; control it with Referrer-Policy.', 'RFC 9110 10.1.3'],
  ['From', 'connection/transport', 'req', 'Email address of the human controlling a robot client.', 'From: webmaster@example.com', 'Rarely used outside crawlers.', 'RFC 9110 10.1.2'],
  ['DNT', 'connection/transport', 'req', 'Legacy Do Not Track signal.', 'DNT: 1', 'Deprecated and widely ignored; see Sec-GPC.', 'W3C Tracking Preference (obsolete)', { dep: true }],
  ['Sec-GPC', 'connection/transport', 'req', 'Global Privacy Control: the user opts out of sale or sharing of their data.', 'Sec-GPC: 1', 'Legally meaningful in some jurisdictions.', 'W3C Global Privacy Control'],
  // ---- fetch metadata / client hints ----
  ['Sec-Fetch-Site', 'client-hints', 'req', 'Browser-set relationship between the request initiator and the target (same-origin, same-site, cross-site, none).', 'Sec-Fetch-Site: cross-site', 'Forbidden header: scripts cannot set it, making it a reliable CSRF signal.', 'W3C Fetch Metadata'],
  ['Sec-Fetch-Mode', 'client-hints', 'req', 'The request mode (navigate, cors, no-cors, same-origin, websocket).', 'Sec-Fetch-Mode: navigate', 'Combine with Sec-Fetch-Site to build a resource-isolation policy.', 'W3C Fetch Metadata'],
  ['Sec-Fetch-Dest', 'client-hints', 'req', 'The destination of the request (document, script, image, ...).', 'Sec-Fetch-Dest: document', 'Useful to reject unexpected embeds, e.g. iframe loads of an API.', 'W3C Fetch Metadata'],
  ['Sec-Fetch-User', 'client-hints', 'req', 'Present (?1) when a navigation was triggered by a user activation.', 'Sec-Fetch-User: ?1', 'Only sent for navigations.', 'W3C Fetch Metadata'],
  ['Sec-CH-UA', 'client-hints', 'req', 'User-Agent Client Hint listing the browser brands and major versions.', 'Sec-CH-UA: "Chromium";v="124", "Not-A.Brand";v="99"', 'Brand lists intentionally include a GREASE entry; do not parse by position.', 'WICG UA Client Hints'],
  ['Sec-CH-UA-Mobile', 'client-hints', 'req', 'Client Hint indicating whether the browser prefers a mobile experience.', 'Sec-CH-UA-Mobile: ?0', 'A structured boolean (?0 / ?1), not "true" or "false".', 'WICG UA Client Hints'],
  ['Sec-CH-UA-Platform', 'client-hints', 'req', 'Client Hint naming the operating system platform.', 'Sec-CH-UA-Platform: "macOS"', 'The value is a quoted string.', 'WICG UA Client Hints'],
  ['Accept-CH', 'client-hints', 'res', 'Asks the browser to send the listed Client Hints on subsequent requests.', 'Accept-CH: Sec-CH-UA-Platform-Version', 'Hints only apply to same-origin requests unless delegated by Permissions-Policy.', 'RFC 8942', { multi: true }],
  ['Upgrade-Insecure-Requests', 'client-hints', 'req', 'Signals that the client prefers an HTTPS upgrade of insecure subresource requests.', 'Upgrade-Insecure-Requests: 1', 'Servers may answer with a redirect to HTTPS; pair with HSTS.', 'W3C Upgrade Insecure Requests'],
  // ---- disclosure ----
  ['X-Powered-By', 'info/disclosure', 'res', 'Non-standard header some frameworks add to name the technology stack.', 'X-Powered-By: Express', 'Leaks the stack and sometimes version; remove it (Express: app.disable("x-powered-by")).', 'MDN X-Powered-By (de facto)', { sec: true }],
  ['X-AspNet-Version', 'info/disclosure', 'res', 'ASP.NET adds the framework version.', 'X-AspNet-Version: 4.0.30319', 'Version disclosure; disable via enableVersionHeader=false.', 'Microsoft ASP.NET (de facto)', { sec: true }],
  ['X-AspNetMvc-Version', 'info/disclosure', 'res', 'ASP.NET MVC adds its version.', 'X-AspNetMvc-Version: 5.2', 'Version disclosure; remove it.', 'Microsoft ASP.NET MVC (de facto)', { sec: true }],
  ['X-Generator', 'info/disclosure', 'res', 'CMSes advertise the generator and version.', 'X-Generator: Drupal 10', 'Version disclosure; remove it.', 'de facto', { sec: true }],
  // ---- misc ----
  ['X-Request-Id', 'misc', 'both', 'Conventional correlation id for tracing a request through logs.', 'X-Request-Id: 7d9a2f1c', 'Non-standard; do not trust client-supplied values for security decisions.', 'de facto'],
  ['X-Requested-With', 'misc', 'req', 'Conventionally "XMLHttpRequest" on Ajax calls from older libraries.', 'X-Requested-With: XMLHttpRequest', 'Not a security control; custom headers do trigger a CORS preflight though.', 'de facto'],
  ['Server-Timing', 'misc', 'res', 'Exposes backend timing metrics to devtools and scripts.', 'Server-Timing: db;dur=53, app;dur=47.2', 'Can leak internals; cross-origin access needs Timing-Allow-Origin.', 'W3C Server Timing', { multi: true }],
  ['Priority', 'misc', 'both', 'Extensible priority signal for HTTP/2 and HTTP/3 (urgency, incremental).', 'Priority: u=1, i', 'Hint only; intermediaries may ignore it.', 'RFC 9218'],
];

export const KB = Object.create(null);
for (const [name, cat, dir, purpose, example, pitfalls, ref, flags = {}] of KB_ROWS) {
  KB[name.toLowerCase()] = { name, cat, dir, purpose, example, pitfalls, ref, ...flags };
}

export function kbLookup(lower) {
  if (KB[lower]) return KB[lower];
  if (lower.startsWith(':')) return PSEUDO[lower] || null;
  if (lower.startsWith('sec-ch-ua')) return { ...KB['sec-ch-ua'], name: lower, purpose: 'A User-Agent Client Hint carrying extra browser/platform detail.', example: `${lower}: "..."` };
  return null;
}

const PSEUDO = {
  ':status': { name: ':status', cat: 'misc', dir: 'res', purpose: 'HTTP/2 and HTTP/3 pseudo-header carrying the response status code.', example: ':status: 200', pitfalls: 'Pseudo-headers must precede regular fields and are lowercase only.', ref: 'RFC 9113 8.3.2' },
  ':method': { name: ':method', cat: 'misc', dir: 'req', purpose: 'HTTP/2 and HTTP/3 pseudo-header carrying the request method.', example: ':method: GET', pitfalls: 'Not a regular header; never sent in HTTP/1.1.', ref: 'RFC 9113 8.3.1' },
  ':path': { name: ':path', cat: 'misc', dir: 'req', purpose: 'HTTP/2 and HTTP/3 pseudo-header carrying the path and query.', example: ':path: /index.html?x=1', pitfalls: 'Must not be empty for http/https URIs.', ref: 'RFC 9113 8.3.1' },
  ':scheme': { name: ':scheme', cat: 'misc', dir: 'req', purpose: 'HTTP/2 and HTTP/3 pseudo-header carrying the URI scheme.', example: ':scheme: https', pitfalls: 'Reflects the scheme of the target URI, not necessarily the transport.', ref: 'RFC 9113 8.3.1' },
  ':authority': { name: ':authority', cat: 'misc', dir: 'req', purpose: 'HTTP/2 and HTTP/3 pseudo-header replacing Host: the target authority.', example: ':authority: example.com', pitfalls: 'If both :authority and Host appear they must agree.', ref: 'RFC 9113 8.3.1' },
};

// Headers whose repeats are legal and which are NOT merged (each line is its own item).
const SET_LIKE = new Set(['set-cookie', 'www-authenticate', 'proxy-authenticate']);
const isListHeader = (lower) => !!(KB[lower] && KB[lower].multi);

const SENSITIVE = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization']);
export const isSensitiveHeader = (name) => SENSITIVE.has(String(name || '').trim().toLowerCase());

// ---------------------------------------------------------------------
// 2. Parser
// ---------------------------------------------------------------------
const TOKEN_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PSEUDO_RE = /^:[a-z][a-z0-9-]*$/;
const RESPONSE_LINE_RE = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/;
const REQUEST_LINE_RE = /^([A-Z]+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/;

function stripVerbosePrefix(line) {
  if (/^[<>](?:\s|$)/.test(line)) return line.slice(2); // "< " / "> " (or bare "<")
  return line;
}
function isCurlNoise(line) {
  if (/^\*(?:\s|$)/.test(line)) return true;                // "* Connected to ..."
  if (/^[{}]\s*(?:\[.*\])?\s*$/.test(line)) return true;    // "{ [5 bytes data]" / "}"
  return false;
}
function startLineKind(line) {
  let m = RESPONSE_LINE_RE.exec(line);
  if (m) return { kind: 'response', startLine: line, status: Number(m[1]), reason: m[2] || '' };
  m = REQUEST_LINE_RE.exec(line);
  if (m) return { kind: 'request', startLine: line, method: m[1], target: m[2] };
  return null;
}

// Parse every message in a paste. Returns an array of blocks:
// { kind, startLine, status?, reason?, method?, target?, headers[], issues[] }
export function parseBlocks(text) {
  const src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const blocks = [];
  let cur = null;
  let afterBlank = false;     // saw a blank line after the current block's headers
  let bodyNoted = false;

  const open = (sl) => {
    cur = { kind: sl ? sl.kind : 'unknown', startLine: sl ? sl.startLine : '', headers: [], issues: [], lastHeader: null };
    if (sl) for (const k of ['status', 'reason', 'method', 'target']) if (sl[k] !== undefined) cur[k] = sl[k];
    blocks.push(cur);
    afterBlank = false;
    bodyNoted = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = stripVerbosePrefix(lines[i]);
    if (isCurlNoise(line)) continue;
    if (line.trim() === '') {
      if (cur && cur.headers.length + (cur.startLine ? 1 : 0) > 0) afterBlank = true;
      continue;
    }
    const sl = startLineKind(line.trim());
    if (sl) {
      if (!cur || afterBlank || cur.headers.length > 0 || cur.startLine) open(sl);
      else open(sl);
      continue;
    }
    if (afterBlank) {
      // Content after the blank line that is not a new start line is the message body.
      if (!bodyNoted) {
        cur.issues.push({ line: lineNo, level: 'info', code: 'body-ignored', msg: `Line ${lineNo}: text after the blank line is treated as the message body and ignored.` });
        bodyNoted = true;
      }
      continue;
    }
    if (!cur) open(null);

    // obs-fold continuation
    if (/^[ \t]/.test(line)) {
      const prev = cur.lastHeader;
      if (prev) {
        prev.value = `${prev.value} ${line.trim()}`.trim();
        prev.raw += `\n${line}`;
        cur.issues.push({ line: lineNo, level: 'warn', code: 'obs-fold', msg: `Line ${lineNo}: obsolete line folding (obs-fold) continues "${prev.name}"; deprecated by RFC 9112 5.2.` });
      } else {
        cur.issues.push({ line: lineNo, level: 'warn', code: 'not-a-header', msg: `Line ${lineNo} is indented but follows no header, so it was ignored.` });
      }
      continue;
    }

    const colon = line.startsWith(':') ? line.indexOf(':', 1) : line.indexOf(':');
    if (colon < 1) {
      cur.issues.push({ line: lineNo, level: 'warn', code: 'not-a-header', msg: `Line ${lineNo} is not a header (no colon): "${line.trim().slice(0, 60)}".` });
      continue;
    }
    const rawName = line.slice(0, colon);
    const name = rawName.trim();
    if (rawName !== rawName.trimEnd()) {
      cur.issues.push({ line: lineNo, level: 'error', code: 'space-before-colon', msg: `Line ${lineNo}: whitespace between "${name}" and the colon; RFC 9112 5.1 says servers MUST reject this.` });
    }
    if (!(TOKEN_RE.test(name) || PSEUDO_RE.test(name))) {
      cur.issues.push({ line: lineNo, level: 'error', code: 'bad-name', msg: `Line ${lineNo}: "${name}" is not a valid header name (token characters only).` });
      cur.lastHeader = null;
      continue;
    }
    const header = { name, lower: name.toLowerCase(), value: line.slice(colon + 1).trim(), line: lineNo, raw: line };
    cur.headers.push(header);
    cur.lastHeader = header;
  }

  for (const b of blocks) {
    delete b.lastHeader;
    if (b.kind === 'unknown') {
      const names = b.headers.map((h) => h.lower);
      if (names.includes(':status')) b.kind = 'response';
      else if (names.some((n) => n === ':method' || n === ':path' || n === ':authority')) b.kind = 'request';
    }
    // Repeated single-valued headers.
    const seen = new Map();
    for (const h of b.headers) {
      const arr = seen.get(h.lower) || [];
      arr.push(h);
      seen.set(h.lower, arr);
    }
    for (const [lower, arr] of seen) {
      if (arr.length < 2 || SET_LIKE.has(lower) || isListHeader(lower) || !KB[lower]) continue;
      b.issues.push({ line: arr[1].line, level: 'warn', code: 'duplicate', msg: `Line ${arr[1].line}: "${arr[0].name}" appears ${arr.length} times; it is a single-valued header, so a recipient may reject or pick one.` });
    }
    b.issues.sort((a, c) => a.line - c.line);
  }
  return blocks;
}

// Parse a paste and return ONE message (default: the last, e.g. the final hop of
// a `curl -i -L` redirect chain). opts.block selects another by index.
export function parseHeaderBlock(text, opts = {}) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return { kind: 'unknown', startLine: '', headers: [], issues: [], blocks: [], blockIndex: -1 };
  }
  let idx = Number.isInteger(opts.block) ? opts.block : blocks.length - 1;
  if (idx < 0 || idx >= blocks.length) idx = blocks.length - 1;
  const b = blocks[idx];
  return {
    ...b,
    blocks: blocks.map((x, i) => ({ index: i, kind: x.kind, startLine: x.startLine, headerCount: x.headers.length })),
    blockIndex: idx,
  };
}

// Group a parsed message by lowercase name (insertion order).
export function groupHeaders(parsed) {
  const map = new Map();
  for (const h of parsed.headers) {
    let g = map.get(h.lower);
    if (!g) { g = { lower: h.lower, name: h.name, values: [], lines: [] }; map.set(h.lower, g); }
    g.values.push(h.value);
    g.lines.push(h.line);
  }
  for (const g of map.values()) {
    g.value = isListHeader(g.lower) ? g.values.filter((v) => v !== '').join(', ') : g.values[g.values.length - 1];
  }
  return map;
}

// ---------------------------------------------------------------------
// 3. Value parsers & per-header validators
// ---------------------------------------------------------------------
export function parseDirectives(value) {
  const out = {};
  for (const part of String(value || '').split(',')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    const k = (eq < 0 ? p : p.slice(0, eq)).trim().toLowerCase();
    const v = eq < 0 ? true : p.slice(eq + 1).trim().replace(/^"|"$/g, '');
    out[k] = v;
  }
  return out;
}

// CSP value -> array of policies, each { directive: [tokens] }.
export function parseCsp(value) {
  return String(value || '').split(',').map((pol) => {
    const d = {};
    for (const part of pol.split(';')) {
      const toks = part.trim().split(/\s+/).filter(Boolean);
      if (!toks.length) continue;
      const k = toks[0].toLowerCase();
      if (!(k in d)) d[k] = toks.slice(1);
    }
    return d;
  }).filter((d) => Object.keys(d).length);
}

// Parse a Set-Cookie value and report structural + hygiene problems.
// problem: { kind:'structure'|'hygiene', level:'error'|'warn', code, msg }
export function parseSetCookie(value) {
  const parts = String(value || '').split(';').map((s) => s.trim());
  const first = parts.shift() || '';
  const problems = [];
  const eq = first.indexOf('=');
  const cookie = { name: eq < 0 ? '' : first.slice(0, eq).trim(), value: eq < 0 ? '' : first.slice(eq + 1).trim(), attrs: {}, problems };
  if (eq < 0 || !cookie.name) {
    problems.push({ kind: 'structure', level: 'error', code: 'cookie-no-pair', msg: 'Cookie has no name=value pair.' });
  }
  for (const p of parts) {
    if (!p) continue;
    const i = p.indexOf('=');
    const k = (i < 0 ? p : p.slice(0, i)).trim().toLowerCase();
    cookie.attrs[k] = i < 0 ? true : p.slice(i + 1).trim();
  }
  const a = cookie.attrs;
  const lowerName = cookie.name.toLowerCase();
  if (lowerName.startsWith('__host-')) {
    if (!a.secure || a.domain !== undefined || a.path !== '/') {
      problems.push({ kind: 'structure', level: 'error', code: 'prefix-host', msg: '__Host- cookies must have Secure, Path=/, and no Domain attribute; browsers will reject this one.' });
    }
  } else if (lowerName.startsWith('__secure-') && !a.secure) {
    problems.push({ kind: 'structure', level: 'error', code: 'prefix-secure', msg: '__Secure- cookies must have the Secure attribute; browsers will reject this one.' });
  }
  const ss = typeof a.samesite === 'string' ? a.samesite.toLowerCase() : null;
  if (a.samesite !== undefined && !['lax', 'strict', 'none'].includes(ss)) {
    problems.push({ kind: 'structure', level: 'warn', code: 'samesite-invalid', msg: `SameSite=${a.samesite === true ? '' : a.samesite} is not Lax, Strict, or None.` });
  }
  if (ss === 'none' && !a.secure) {
    problems.push({ kind: 'structure', level: 'warn', code: 'samesite-none-secure', msg: 'SameSite=None requires Secure; browsers reject the cookie otherwise.' });
  }
  if (a['max-age'] !== undefined && !/^-?\d+$/.test(String(a['max-age']))) {
    problems.push({ kind: 'structure', level: 'warn', code: 'max-age-invalid', msg: `Max-Age=${a['max-age']} is not an integer.` });
  }
  if (typeof a.expires === 'string' && Number.isNaN(Date.parse(a.expires))) {
    problems.push({ kind: 'structure', level: 'warn', code: 'expires-invalid', msg: `Expires=${a.expires} is not a parseable date.` });
  }
  if (!a.secure) problems.push({ kind: 'hygiene', level: 'warn', code: 'missing-secure', msg: 'Missing Secure (cookie can be sent over plain HTTP).' });
  if (!a.httponly) problems.push({ kind: 'hygiene', level: 'warn', code: 'missing-httponly', msg: 'Missing HttpOnly (readable by page scripts; fine only if scripts must read it).' });
  if (a.samesite === undefined) problems.push({ kind: 'hygiene', level: 'warn', code: 'missing-samesite', msg: 'Missing SameSite (browsers default to Lax, but say so explicitly).' });
  cookie.valid = !problems.some((p) => p.kind === 'structure' && p.level === 'error');
  return cookie;
}

const issue = (level, code, msg) => ({ level, code, msg });

// Per-header validators: (value, ctx) -> [{level, code, msg}]
const VALIDATORS = {
  'cache-control': (value) => {
    const d = parseDirectives(value);
    const out = [];
    for (const k of ['max-age', 's-maxage', 'stale-while-revalidate', 'stale-if-error']) {
      if (d[k] !== undefined && !/^\d+$/.test(String(d[k]))) out.push(issue('error', 'cc-numeric', `${k} must be a non-negative integer, got "${d[k]}".`));
    }
    if (d['no-store'] && (d['max-age'] !== undefined || d.public)) out.push(issue('warn', 'cc-conflict', 'no-store conflicts with max-age/public; no-store wins and nothing is cached.'));
    if (d.public && d.private) out.push(issue('warn', 'cc-conflict', 'public and private are contradictory.'));
    if (d['no-cache'] && d.immutable) out.push(issue('info', 'cc-conflict', 'immutable has no effect alongside no-cache.'));
    return out;
  },
  'content-type': (value, ctx) => {
    const m = /^([^\s;\/]+)\/([^\s;]+)\s*(?:;(.*))?$/.exec(value);
    if (!m) return [issue('warn', 'ct-malformed', 'Expected "type/subtype[; params]".')];
    const out = [];
    const type = m[1].toLowerCase();
    const sub = m[2].toLowerCase();
    const hasCharset = /charset\s*=/i.test(m[3] || '');
    if (ctx.kind !== 'request' && type === 'text' && !hasCharset) out.push(issue('info', 'ct-no-charset', 'text/* without a charset leaves encoding detection to the browser; add charset=utf-8.'));
    if (sub === 'json' && type === 'application' && hasCharset) out.push(issue('info', 'ct-json-charset', 'application/json is always UTF-8; the charset parameter is unnecessary.'));
    return out;
  },
  'content-length': (value) => (/^\d+$/.test(value) ? [] : [issue('error', 'cl-numeric', `Content-Length must be digits only, got "${value}".`)]),
  vary: (value) => {
    const toks = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const out = [];
    if (toks.includes('*')) out.push(issue('warn', 'vary-star', 'Vary: * means every request is unique, which defeats caching.'));
    if (toks.includes('cookie') || toks.includes('user-agent')) out.push(issue('info', 'vary-fragment', 'Vary on Cookie or User-Agent fragments the cache into near-per-user entries.'));
    return out;
  },
  expires: (value) => (Number.isNaN(Date.parse(value)) ? [issue('info', 'expires-invalid', 'Not a valid HTTP date; caches treat this as already expired.')] : []),
  date: (value) => (Number.isNaN(Date.parse(value)) ? [issue('warn', 'date-invalid', 'Not a valid HTTP date.')] : []),
  'last-modified': (value) => (Number.isNaN(Date.parse(value)) ? [issue('warn', 'date-invalid', 'Not a valid HTTP date.')] : []),
  'retry-after': (value) => (/^\d+$/.test(value) || !Number.isNaN(Date.parse(value)) ? [] : [issue('warn', 'retry-after-invalid', 'Expected delay-seconds or an HTTP date.')]),
  'set-cookie': (value) => {
    if (value === REDACTED) return [issue('info', 'redacted', 'Value was redacted from saved input; paste again to analyze.')];
    return parseSetCookie(value).problems.filter((p) => p.kind === 'structure').map((p) => issue(p.level, p.code, p.msg));
  },
  'x-frame-options': (value) => (/^(deny|sameorigin)$/i.test(value) ? [] : [issue('warn', 'xfo-value', /^allow-from/i.test(value) ? 'ALLOW-FROM is obsolete and ignored by browsers; use CSP frame-ancestors.' : 'Expected DENY or SAMEORIGIN.')]),
  'access-control-allow-credentials': (value) => (value === 'true' ? [] : [issue('warn', 'acac-value', 'The only valid value is the literal "true"; any other value is ignored.')]),
  'x-content-type-options': (value) => (value.toLowerCase() === 'nosniff' ? [] : [issue('warn', 'xcto-value', 'The only defined value is nosniff.')]),
};

// Issues for a single (grouped) header: deprecation, X- naming, validator output.
export function headerIssues(group, ctx = {}) {
  const out = [];
  const entry = kbLookup(group.lower);
  if (!entry) {
    if (/^x-/.test(group.lower)) out.push(issue('info', 'x-prefix', 'Custom header: the X- naming convention is deprecated (RFC 6648), but it is common.'));
  } else if (entry.dep) {
    out.push(issue('warn', 'deprecated', `${entry.name} is deprecated or obsolete; see the pitfalls note.`));
  }
  const v = VALIDATORS[group.lower];
  if (v) {
    if (SET_LIKE.has(group.lower)) for (const val of group.values) out.push(...v(val, ctx));
    else out.push(...v(group.value, ctx));
  }
  return out;
}

// ---------------------------------------------------------------------
// 4. Security checklist (response-focused)
// ---------------------------------------------------------------------
export const REDACTED = '[redacted]';
const item = (id, header, status, msg, fix = '') => ({ id, header, status, msg, fix });

function checkHsts(g) {
  const h = g.get('strict-transport-security');
  const fix = 'Strict-Transport-Security: max-age=63072000; includeSubDomains';
  if (!h) return item('hsts', 'Strict-Transport-Security', 'fail', 'Missing. Without HSTS browsers can be downgraded to HTTP (note: browsers ignore it over plain HTTP, and headers alone cannot show the scheme).', fix);
  const m = /max-age\s*=\s*"?(\d+)"?/i.exec(h.value);
  if (!m) return item('hsts', h.name, 'fail', 'No valid max-age directive, so the header is ignored.', fix);
  const age = Number(m[1]);
  if (age === 0) return item('hsts', h.name, 'warn', 'max-age=0 deletes the HSTS policy.', fix);
  if (age < 31536000) return item('hsts', h.name, 'warn', `max-age=${age} is under one year (31536000).`, fix);
  const extras = [/includesubdomains/i.test(h.value) && 'includeSubDomains', /preload/i.test(h.value) && 'preload'].filter(Boolean);
  return item('hsts', h.name, 'pass', `max-age=${age} (at least one year)${extras.length ? `; ${extras.join(' + ')} set` : ''}.`);
}

function checkCsp(g) {
  const fix = "Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  const h = g.get('content-security-policy');
  if (!h) {
    if (g.get('content-security-policy-report-only')) return item('csp', 'Content-Security-Policy-Report-Only', 'warn', 'Only a Report-Only policy is present; it reports but does not block.', fix);
    return item('csp', 'Content-Security-Policy', 'fail', 'Missing. A CSP is the main defence-in-depth against XSS.', fix);
  }
  const policies = parseCsp(h.value);
  const restricts = policies.some((p) => p['default-src'] || p['script-src']);
  if (!restricts) return item('csp', h.name, 'warn', 'Present but sets neither default-src nor script-src, so scripts are unrestricted.', fix);
  const bad = new Set();
  for (const p of policies) {
    const toks = (p['script-src'] || p['default-src'] || []).map((t) => t.toLowerCase());
    const hardened = toks.some((t) => t.startsWith("'nonce-") || t.startsWith("'sha256-") || t.startsWith("'sha384-") || t.startsWith("'sha512-"));
    if (toks.includes("'unsafe-inline'") && !hardened) bad.add("'unsafe-inline'");
    if (toks.includes("'unsafe-eval'")) bad.add("'unsafe-eval'");
    if (toks.includes('*')) bad.add('bare *');
    if (toks.includes('data:')) bad.add('data:');
  }
  if (bad.size) return item('csp', h.name, 'warn', `Script sources allow ${[...bad].join(', ')}, which weakens XSS protection.`, fix);
  return item('csp', h.name, 'pass', 'Restricts script sources without unsafe-inline, unsafe-eval, bare *, or data:.');
}

function checkXcto(g) {
  const h = g.get('x-content-type-options');
  if (h && h.value.toLowerCase() === 'nosniff') return item('xcto', h.name, 'pass', 'nosniff set.');
  return item('xcto', 'X-Content-Type-Options', 'warn', h ? `Value "${h.value}" is not nosniff.` : 'Missing; browsers may MIME-sniff responses.', 'X-Content-Type-Options: nosniff');
}

function checkClickjacking(g) {
  const csp = g.get('content-security-policy');
  const hasFA = csp && parseCsp(csp.value).some((p) => 'frame-ancestors' in p);
  const xfo = g.get('x-frame-options');
  if (hasFA) return item('clickjacking', 'Content-Security-Policy', 'pass', 'CSP frame-ancestors controls embedding.');
  if (xfo && /^(deny|sameorigin)$/i.test(xfo.value)) return item('clickjacking', xfo.name, 'pass', `X-Frame-Options ${xfo.value.toUpperCase()}.`);
  if (xfo && /^allow-from/i.test(xfo.value)) return item('clickjacking', xfo.name, 'fail', 'ALLOW-FROM is obsolete and ignored by browsers, so the page is frameable.', 'X-Frame-Options: DENY');
  return item('clickjacking', 'X-Frame-Options', 'warn', 'Neither CSP frame-ancestors nor X-Frame-Options is set, so the page can be framed (clickjacking).', 'X-Frame-Options: DENY');
}

function checkReferrer(g) {
  const h = g.get('referrer-policy');
  const fix = 'Referrer-Policy: strict-origin-when-cross-origin';
  if (!h) return item('referrer', 'Referrer-Policy', 'warn', 'Missing (browsers default to strict-origin-when-cross-origin, but state it explicitly).', fix);
  const toks = h.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const eff = toks[toks.length - 1] || '';
  if (['unsafe-url', 'no-referrer-when-downgrade'].includes(eff)) return item('referrer', h.name, 'warn', `${eff} leaks full URLs cross-origin.`, fix);
  if (['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'origin-when-cross-origin', 'origin'].includes(eff)) return item('referrer', h.name, 'pass', `${eff}.`);
  return item('referrer', h.name, 'warn', `"${eff}" is not a recognised policy token.`, fix);
}

function checkPermissions(g) {
  const h = g.get('permissions-policy');
  if (h) return item('permissions', h.name, 'pass', 'Permissions-Policy present.');
  return item('permissions', 'Permissions-Policy', 'info', 'Missing; low severity. Disable features you do not use.', 'Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

function checkIsolation(g) {
  const coop = g.get('cross-origin-opener-policy');
  const corp = g.get('cross-origin-resource-policy');
  const coep = g.get('cross-origin-embedder-policy');
  const set = [coop && `COOP ${coop.value}`, corp && `CORP ${corp.value}`, coep && `COEP ${coep.value}`].filter(Boolean);
  if (coop && coop.value.toLowerCase() === 'same-origin') return item('isolation', coop.name, 'pass', `${set.join(', ')}.`);
  if (set.length) return item('isolation', 'Cross-Origin-Opener-Policy', 'info', `${set.join(', ')}; COOP same-origin would isolate the window.`, 'Cross-Origin-Opener-Policy: same-origin');
  return item('isolation', 'Cross-Origin-Opener-Policy', 'info', 'COOP/CORP/COEP not set; opt-in isolation, add only if you need it.', 'Cross-Origin-Opener-Policy: same-origin');
}

function checkCookies(g) {
  const h = g.get('set-cookie');
  if (!h) return [];
  const out = [];
  h.values.forEach((val, i) => {
    const id = `cookie:${i}`;
    if (val === REDACTED) { out.push(item(id, 'Set-Cookie', 'info', 'Value was redacted from saved input; paste the response again to check this cookie.')); return; }
    const c = parseSetCookie(val);
    const label = c.name || `cookie ${i + 1}`;
    const structural = c.problems.filter((p) => p.kind === 'structure');
    const hygiene = c.problems.filter((p) => p.kind === 'hygiene');
    const fix = `Set-Cookie: ${c.name || 'id'}=...; Secure; HttpOnly; SameSite=Lax; Path=/`;
    if (structural.some((p) => p.level === 'error')) out.push(item(id, 'Set-Cookie', 'fail', `${label}: ${structural.map((p) => p.msg).join(' ')}`, fix));
    else if (structural.length || hygiene.length) out.push(item(id, 'Set-Cookie', 'warn', `${label}: ${[...structural, ...hygiene].map((p) => p.msg).join(' ')}`, fix));
    else out.push(item(id, 'Set-Cookie', 'pass', `${label}: Secure, HttpOnly, and SameSite all set.`));
  });
  return out;
}

const DEPRECATED_SEC = ['x-xss-protection', 'expect-ct', 'public-key-pins', 'public-key-pins-report-only', 'feature-policy', 'p3p'];
function checkDeprecated(g) {
  const out = [];
  for (const lower of DEPRECATED_SEC) {
    const h = g.get(lower);
    if (!h) continue;
    if (lower === 'x-xss-protection' && h.value.trim() === '0') { out.push(item(`deprecated:${lower}`, h.name, 'pass', 'Explicitly disabled (0), which is the recommended value.')); continue; }
    const fix = lower === 'x-xss-protection' ? 'X-XSS-Protection: 0' : lower === 'feature-policy' ? 'Permissions-Policy: camera=(), microphone=()' : `(remove the ${h.name} header)`;
    out.push(item(`deprecated:${lower}`, h.name, 'warn', `${h.name} is deprecated or removed; ${lower === 'x-xss-protection' ? 'set it to 0 or remove it' : 'remove it'}.`, fix));
  }
  return out;
}

function checkDisclosure(g) {
  const bad = [];
  const server = g.get('server');
  if (server && /\d/.test(server.value)) bad.push(`Server: ${server.value}`);
  for (const k of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) if (g.get(k)) bad.push(`${g.get(k).name}: ${g.get(k).value}`);
  if (bad.length) return item('disclosure', 'Server / X-Powered-By', 'warn', `Discloses stack details: ${bad.join('; ')}.`, 'Remove X-Powered-By and use a generic Server value (e.g. "Server: nginx" with no version).');
  return item('disclosure', 'Server / X-Powered-By', 'pass', 'No version-bearing Server or X-Powered-By headers.');
}

function checkCors(g) {
  const o = g.get('access-control-allow-origin');
  if (!o) return null;
  const cred = g.get('access-control-allow-credentials');
  const credTrue = cred && cred.value.trim().toLowerCase() === 'true';
  if (o.value === '*' && credTrue) return item('cors', o.name, 'fail', 'Access-Control-Allow-Origin: * with Allow-Credentials: true is invalid; browsers refuse the credentialed response.', 'Access-Control-Allow-Origin: https://app.example.com\nVary: Origin');
  if (o.value.toLowerCase() === 'null') return item('cors', o.name, 'warn', 'Allowing the "null" origin lets sandboxed iframes and local files read the response.', 'Access-Control-Allow-Origin: https://app.example.com');
  if (o.value === '*') return item('cors', o.name, 'info', 'Any origin may read this response; fine for public, credential-free resources.');
  const vary = g.get('vary');
  if (!vary || !/\borigin\b/i.test(vary.value)) return item('cors', o.name, 'info', 'Specific origin allowed, but there is no Vary: Origin; shared caches may serve the wrong CORS headers.', 'Vary: Origin');
  return item('cors', o.name, 'pass', `Specific origin ${o.value} with Vary: Origin.`);
}

function checkCacheSensitivity(g) {
  if (!g.get('set-cookie')) return null;
  const cc = g.get('cache-control');
  const d = cc ? parseDirectives(cc.value) : {};
  if (d.private || d['no-store']) return item('cache-sensitivity', cc.name, 'pass', 'Response sets a cookie and is marked private/no-store.');
  return item('cache-sensitivity', 'Cache-Control', 'warn', 'Response sets a cookie but is not marked Cache-Control: private or no-store, so a shared cache could store and replay it (heuristic).', 'Cache-Control: no-store');
}

// Run the security checklist over a parsed message. Returns [] for requests.
export function securityChecklist(parsed, opts = {}) {
  const kind = opts.kind && opts.kind !== 'auto' ? opts.kind : parsed.kind;
  if (kind === 'request') return [];
  const g = groupHeaders(parsed);
  const items = [
    checkHsts(g), checkCsp(g), checkXcto(g), checkClickjacking(g), checkReferrer(g),
    checkPermissions(g), checkIsolation(g), ...checkCookies(g), ...checkDeprecated(g),
    checkDisclosure(g), checkCors(g), checkCacheSensitivity(g),
  ].filter(Boolean);
  return items;
}

export function summarize(items) {
  const s = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const it of items) s[it.status] += 1;
  return s;
}

// Cross-header lint beyond the checklist.
function crossLint(g, kind) {
  const out = [];
  if (g.get('content-length') && g.get('transfer-encoding')) {
    out.push(issue('warn', 'cl-te', 'Content-Length together with Transfer-Encoding is a request-smuggling smell (RFC 9112 6.1); a message must not carry both.'));
  }
  const cl = g.get('content-length');
  if (cl && cl.values.length > 1 && new Set(cl.values.map((v) => v.trim())).size > 1) {
    out.push(issue('error', 'cl-conflict', 'Multiple Content-Length headers with different values; the message must be rejected.'));
  }
  const cc = g.get('cache-control');
  if (cc && g.get('pragma') && kind !== 'request' && !/no-cache|no-store/.test(cc.value)) {
    out.push(issue('info', 'pragma-legacy', 'Pragma is a legacy request header; Cache-Control is authoritative.'));
  }
  return out;
}

// One-call analysis: explain cards + checklist + lint.
export function analyze(parsed, opts = {}) {
  const kind = opts.kind && opts.kind !== 'auto' ? opts.kind : parsed.kind;
  const g = groupHeaders(parsed);
  const cards = [];
  for (const grp of g.values()) {
    const entry = kbLookup(grp.lower);
    const generic = !entry;
    cards.push({
      lower: grp.lower,
      name: entry && !grp.lower.startsWith('sec-ch-ua') ? entry.name : grp.name,
      value: SET_LIKE.has(grp.lower) ? grp.values.join('\n') : grp.value,
      count: grp.values.length,
      known: !generic,
      cat: entry ? entry.cat : (/^x-/.test(grp.lower) ? 'misc' : 'misc'),
      dir: entry ? entry.dir : 'both',
      purpose: entry ? entry.purpose : (/^x-/.test(grp.lower)
        ? 'A non-standard custom header. The X- prefix convention is deprecated (RFC 6648), but still widely used.'
        : 'Not in the built-in reference; it may be a custom, vendor, or newer header.'),
      example: entry ? entry.example : '',
      pitfalls: entry ? entry.pitfalls : '',
      ref: entry ? entry.ref : '',
      deprecated: !!(entry && entry.dep),
      issues: headerIssues(grp, { kind }),
    });
  }
  const checklist = securityChecklist(parsed, opts);
  const lint = [...parsed.issues.map((i) => ({ level: i.level, code: i.code, msg: i.msg })), ...crossLint(g, kind)];
  return { kind, cards, checklist, summary: summarize(checklist), lint };
}

// ---------------------------------------------------------------------
// 5. Builder
// ---------------------------------------------------------------------
const CSP_PRESETS = {
  strict: "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  spa: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  api: "default-src 'none'; frame-ancestors 'none'",
};
const CACHE_PRESETS = {
  immutable: 'public, max-age=31536000, immutable',
  short: 'public, max-age=300',
  revalidate: 'no-cache',
  'no-store': 'no-store',
};
const CONTENT_TYPES = ['text/html; charset=utf-8', 'application/json', 'text/plain; charset=utf-8', 'text/css; charset=utf-8', 'text/javascript; charset=utf-8', 'application/octet-stream', 'application/pdf'];

// Builder option metadata (drives both buildHeaderBlock and the UI).
// type: 'bool' | 'select' | 'text'; the first select option '' means "omit".
export const BUILD_OPTIONS = [
  { id: 'hsts', label: 'Strict-Transport-Security', type: 'bool', header: 'Strict-Transport-Security', value: () => 'max-age=63072000; includeSubDomains' },
  { id: 'csp', label: 'Content-Security-Policy', type: 'select', options: ['', 'strict', 'spa', 'api'], header: 'Content-Security-Policy', value: (v) => CSP_PRESETS[v] },
  { id: 'xcto', label: 'X-Content-Type-Options', type: 'bool', header: 'X-Content-Type-Options', value: () => 'nosniff' },
  { id: 'xfo', label: 'X-Frame-Options', type: 'select', options: ['', 'DENY', 'SAMEORIGIN'], header: 'X-Frame-Options', value: (v) => v },
  { id: 'referrer', label: 'Referrer-Policy', type: 'select', options: ['', 'no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'], header: 'Referrer-Policy', value: (v) => v },
  { id: 'permissions', label: 'Permissions-Policy', type: 'bool', header: 'Permissions-Policy', value: () => 'camera=(), microphone=(), geolocation=()' },
  { id: 'coop', label: 'Cross-Origin-Opener-Policy', type: 'select', options: ['', 'same-origin', 'same-origin-allow-popups'], header: 'Cross-Origin-Opener-Policy', value: (v) => v },
  { id: 'corp', label: 'Cross-Origin-Resource-Policy', type: 'select', options: ['', 'same-origin', 'same-site', 'cross-origin'], header: 'Cross-Origin-Resource-Policy', value: (v) => v },
  { id: 'cache', label: 'Cache-Control', type: 'select', options: ['', 'immutable', 'short', 'revalidate', 'no-store'], header: 'Cache-Control', value: (v) => CACHE_PRESETS[v] },
  { id: 'contentType', label: 'Content-Type', type: 'select', options: ['', ...CONTENT_TYPES], header: 'Content-Type', value: (v) => v },
  { id: 'download', label: 'Download filename (Content-Disposition)', type: 'text', header: 'Content-Disposition', value: (v) => `attachment; filename="${String(v).replace(/["\\\r\n]/g, '_')}"` },
  { id: 'corsOrigin', label: 'CORS: Access-Control-Allow-Origin', type: 'text', header: 'Access-Control-Allow-Origin', value: (v) => v },
  { id: 'corsMethods', label: 'CORS: Allow-Methods', type: 'text', header: 'Access-Control-Allow-Methods', value: (v) => v },
  { id: 'corsHeaders', label: 'CORS: Allow-Headers', type: 'text', header: 'Access-Control-Allow-Headers', value: (v) => v },
  { id: 'corsCredentials', label: 'CORS: Allow-Credentials', type: 'bool', header: 'Access-Control-Allow-Credentials', value: () => 'true' },
  { id: 'corsMaxAge', label: 'CORS: Max-Age (seconds)', type: 'text', header: 'Access-Control-Max-Age', value: (v) => v },
];

export const PRESETS = {
  static: { label: 'Static site', selection: { hsts: true, csp: 'strict', xcto: true, xfo: 'DENY', referrer: 'strict-origin-when-cross-origin', permissions: true, coop: 'same-origin', corp: 'same-origin', cache: 'immutable', contentType: 'text/html; charset=utf-8' } },
  api: { label: 'API / JSON', selection: { hsts: true, csp: 'api', xcto: true, xfo: 'DENY', referrer: 'no-referrer', cache: 'no-store', contentType: 'application/json', corsOrigin: 'https://app.example.com', corsMethods: 'GET, POST, OPTIONS', corsHeaders: 'Content-Type, Authorization', corsMaxAge: '600' } },
  spa: { label: 'SPA', selection: { hsts: true, csp: 'spa', xcto: true, xfo: 'DENY', referrer: 'strict-origin-when-cross-origin', permissions: true, coop: 'same-origin', cache: 'revalidate', contentType: 'text/html; charset=utf-8' } },
  download: { label: 'Download', selection: { hsts: true, csp: 'api', xcto: true, referrer: 'no-referrer', cache: 'no-store', contentType: 'application/octet-stream', download: 'report.pdf', corp: 'same-origin' } },
};

// selection: { [optionId]: bool|string, customHeaders?: [{name,value}] } -> header block text.
export function buildHeaderBlock(selection = {}) {
  const sel = selection || {};
  const lines = [];
  for (const opt of BUILD_OPTIONS) {
    const v = sel[opt.id];
    if (opt.type === 'bool' ? v !== true : (v == null || String(v).trim() === '')) continue;
    const val = opt.value(opt.type === 'bool' ? v : String(v).trim());
    if (val == null || val === '') continue;
    lines.push(`${opt.header}: ${val}`);
  }
  const origin = typeof sel.corsOrigin === 'string' ? sel.corsOrigin.trim() : '';
  if (origin && origin !== '*') lines.push('Vary: Origin');
  for (const row of Array.isArray(sel.customHeaders) ? sel.customHeaders : []) {
    const name = String(row && row.name || '').trim();
    const value = String(row && row.value || '').replace(/[\r\n]+/g, ' ').trim();
    if (name && TOKEN_RE.test(name)) lines.push(`${name}: ${value}`);
  }
  return lines.join('\n');
}

// Snippet formats for server configs. lines = block text.
export const SNIPPET_FORMATS = ['raw', 'nginx', 'apache', 'express'];
export function formatSnippet(block, fmt) {
  const rows = String(block || '').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
  const dq = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const sq = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (fmt === 'nginx') return rows.map(([n, v]) => `add_header ${n} "${dq(v)}" always;`).join('\n');
  if (fmt === 'apache') return rows.map(([n, v]) => `Header always set ${n} "${dq(v)}"`).join('\n');
  if (fmt === 'express') return rows.map(([n, v]) => `res.setHeader('${sq(n)}', '${sq(v)}');`).join('\n');
  return String(block || '');
}

// ---------------------------------------------------------------------
// 6. Persistence hygiene
// ---------------------------------------------------------------------
// Replace the VALUE of Authorization / Cookie / Set-Cookie / Proxy-Authorization
// (including folded continuation lines) before the text is saved locally.
export function redactForStorage(text) {
  const src = String(text == null ? '' : text);
  const parts = src.split(/(\r\n|\r|\n)/); // keep separators
  const out = [];
  let dropping = false;
  const re = /^((?:[<>]\s?)?\s*)(authorization|cookie|set-cookie|proxy-authorization)(\s*:)(.*)$/i;
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const sep = parts[i + 1] || '';
    if (dropping && /^[ \t]/.test(line)) continue; // folded continuation of a redacted header
    dropping = false;
    const m = re.exec(line);
    if (m) {
      out.push(`${m[1]}${m[2]}${m[3]} ${REDACTED}${sep}`);
      dropping = true;
    } else out.push(line + sep);
  }
  return out.join('');
}

// ---------------------------------------------------------------------
// 7. Samples
// ---------------------------------------------------------------------
export const SAMPLES = {
  response: `HTTP/2 200
content-type: text/html
cache-control: public, max-age=3600
etag: "33a64df5"
server: nginx/1.25.3
x-powered-by: Express
x-xss-protection: 1; mode=block
x-content-type-options: nosniff
strict-transport-security: max-age=300
access-control-allow-origin: *
access-control-allow-credentials: true
set-cookie: sid=abc123; Path=/; SameSite=None
set-cookie: theme=dark; Secure; HttpOnly; SameSite=Lax
vary: Accept-Encoding`,
  request: `GET /api/items?limit=10 HTTP/1.1
Host: api.example.com
User-Agent: curl/8.4.0
Accept: application/json
Accept-Encoding: gzip, br
Origin: https://app.example.com
Authorization: Bearer sample-token
Cookie: sid=abc123`,
};
