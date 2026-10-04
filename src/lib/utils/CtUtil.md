# CtUtil

Small, dependency-free runtime helpers for single-file tools: a Blob downloader, a debouncer, numeric guards, HTML/attribute escaping, versioned `localStorage` persistence, a hyperscript element factory, [HiDPI canvas](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) setup, and a few pure text helpers (offset-to-line/column, slugify, word-wrap).

`src/lib/utils/CtUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

These are the browser/DOM idioms every tool re-rolled by hand, consolidated into one module. Each helper is a named export, and the `CtUtil` class at the bottom aggregates them as statics that reference the same functions.

The module has no imports, so flattening it into a page never drags another module's top-level names in. Most helpers touch runtime-only surfaces (`document`, `URL`, `localStorage`, `setTimeout`, `window`), but only inside their function bodies. That keeps the module safe to import from Node: the pure helpers (`clamp`/`num`/`clampInt`, `escapeHtml`/`escapeAttr`, `posAt`/`slugify`/`wrapText`) are usable from a unit-tested `logic.mjs`, while the DOM-bound ones go unused there.

Note on what moved out: `getRandomBytes`/`makeId` now live in `CtByteUtil.mjs`, `formatBytes` is the one in `CtByteUtil.mjs`, and `escapeXml` lives in `formats/CtEscaper.mjs`. Reach there for those.

## API

### `downloadBlob(data, filename, mime?) → void`

Triggers a browser file download. Requires the DOM.

- `data` — a [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob), a string, or a `Uint8Array` (anything the `Blob` constructor accepts). A `Blob` is used as-is; anything else is wrapped in a `Blob`, with `mime` as its type when given.
- `filename` — the download name. `null`/`undefined` become `''`.
- `mime` — optional MIME type used only when `data` is not already a `Blob`.

It creates an object URL, clicks a temporary hidden `<a download>`, removes it, then revokes the URL after a 1-second timeout so the download has time to start.

```js
import { downloadBlob } from './CtUtil.mjs';

downloadBlob('hello world', 'note.txt', 'text/plain');
downloadBlob(myUint8Array, 'image.png', 'image/png');
```

### `debounce(fn, ms) → Function`

Returns a trailing-edge debounced wrapper. Repeated calls reset the timer, and `fn` runs once, `ms` after the last call, with the latest arguments and `this`.

- `fn` — the function to debounce.
- `ms` — the quiet-period delay in milliseconds.
- Returns the wrapped function (no return value of its own).

```js
import { debounce } from './CtUtil.mjs';

const onType = debounce(() => render(), 200);
input.addEventListener('input', onType);
```

### `clamp(n, lo, hi) → number`

Coerces `n` to a number and clamps it to `[lo, hi]`.

- `n` — the value, coerced with `Number(n)`.
- `lo`, `hi` — the bounds.
- `NaN` has no position on the number line, so it returns `lo`. `+Infinity` clamps to `hi` and `-Infinity` to `lo` through the normal comparison.

```js
import { clamp } from './CtUtil.mjs';

clamp(12, 0, 10);   // 10
clamp(NaN, 0, 10);  // 0
```

### `num(v, fallback?) → number`

Coerces `v` to a finite number, else returns `fallback`.

- `v` — the value, coerced with `Number(v)`.
- `fallback` — returned when the coercion is non-finite; defaults to `0`.

```js
import { num } from './CtUtil.mjs';

num('3.5');        // 3.5
num('nope', -1);   // -1
```

### `clampInt(v, lo, hi, fallback) → number`

`parseInt(v, 10)`, then clamps to `[lo, hi]`.

- `v` — the value; typically an input element's `.value` for the "read a control" idiom.
- `lo`, `hi` — the bounds.
- `fallback` — returned when `parseInt` yields a non-finite result.

```js
import { clampInt } from './CtUtil.mjs';

clampInt('25', 1, 10, 1);   // 10
clampInt('', 1, 10, 1);     // 1
```

### `escapeHtml(s) → string`

Escapes `&`, `<`, `>` for safe insertion into a text node. Quotes are left as-is.

```js
import { escapeHtml } from './CtUtil.mjs';

escapeHtml('<b> & "x"'); // "&lt;b&gt; &amp; \"x\""
```

### `escapeAttr(s) → string`

`escapeHtml` plus `"` → `&quot;` and `'` → `&#39;`, for use inside an attribute value.

```js
import { escapeAttr } from './CtUtil.mjs';

escapeAttr('a "b" c'); // "a &quot;b&quot; c"
```

### `persistState(key, defaults) → { load, save }`

Versioned, best-effort `localStorage` persistence driven by a `defaults` shape. Put a version in the `key` (e.g. `"mytool:v1"`).

- `key` — the storage key.
- `defaults` — an object whose keys define the schema and whose values define each field's type and default.
- Returns `{ load, save }`:
  - `load()` returns a fresh object: the defaults, overlaid with any stored values, coerced by each default's TYPE (`boolean` via `!!`, `number` via `Number` with non-finite dropped, everything else via `String`).
  - `save(state)` stores ONLY the keys present in `defaults`, so secrets and derived output never leak if they are not in the schema.

All access is `try/catch`-guarded, so private mode or disabled storage degrades silently.

```js
import { persistState } from './CtUtil.mjs';

const store = persistState('mytool:v1', { theme: 'dark', fontSize: 14 });
const state = store.load();       // { theme, fontSize }, defaults overlaid with stored
store.save({ ...state, fontSize: 16 });
```

### `onceFlag(key) → { seen, mark }`

A one-shot "have they seen this?" flag. Used for first-load help auto-open.

- `key` — the storage key.
- Returns `{ seen, mark }`:
  - `seen()` is `true` once `mark()` has run. A storage throw is treated as already-seen, so a blocked-storage visitor is never re-nagged.
  - `mark()` records the flag (best-effort).

```js
import { onceFlag } from './CtUtil.mjs';

const help = onceFlag('mytool:help-seen:v1');
if (!help.seen()) { openHelp(); help.mark(); }
```

### `el(tag, props?, children?) → Element`

Hyperscript element factory. Requires the DOM.

- `tag` — the element tag name.
- `props` — optional. Key handling:
  - `class`/`className` → sets `className`.
  - `text`/`textContent` → sets `textContent`.
  - `html`/`innerHTML` → sets `innerHTML`.
  - any `data-*`/`aria-*` key, plus `role`/`title`/`for`/`type`/`value`/`name`/`href`/`id`/`placeholder` → set as attributes.
  - everything else → assigned as a property.
  - `null`/`undefined` values are skipped.
- `children` — a node, a string/number (becomes a text node), or an array of those. `null`/`false` entries are skipped.
- Returns the created element.

```js
import { el } from './CtUtil.mjs';

const btn = el('button', { class: 'primary', type: 'button', 'aria-pressed': 'false' }, 'Go');
```

### `prefersReducedMotion() → boolean`

Returns `true` when the user asked for [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) via `matchMedia`. Returns `false` when `matchMedia` is unavailable or throws.

```js
import { prefersReducedMotion } from './CtUtil.mjs';

if (!prefersReducedMotion()) playConfetti();
```

### `restartAnimation(elm, cls) → void`

Restarts a CSS animation by removing `cls`, forcing a reflow (`void elm.offsetWidth`), then re-adding `cls`.

- `elm` — the element. A falsy `elm` is a no-op.
- `cls` — the animation class to toggle.

```js
import { restartAnimation } from './CtUtil.mjs';

restartAnimation(banner, 'shake');
```

### `setupHiDPICanvas(canvas, opts?) → { dpr, cssW, cssH, ctx }`

Sizes a [`<canvas>`](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) backing store for crisp rendering on high-DPR displays.

- `canvas` — the canvas element.
- `opts` — optional:
  - `width`/`height` — CSS px for the display size; default is the canvas' current `clientWidth`/`clientHeight`.
  - `maxDpr` — caps `devicePixelRatio`.
  - `style` — `false` to skip setting the CSS pixel size via `style`.
  - `context` — `false` to skip getting the 2d context (returns `ctx: null`).
  - `transform` — `false` to skip applying `setTransform(dpr,0,0,dpr,0,0)`.
- Sets `canvas.width`/`height` to `round(css * dpr)`.
- Returns `{ dpr, cssW, cssH, ctx }`.

The two paths this covers: "size and transform" (draw in CSS px, the transform scales up), and "size only, map coordinates by hand" (pass `transform: false`).

```js
import { setupHiDPICanvas } from './CtUtil.mjs';

const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, { maxDpr: 2 });
ctx.fillRect(0, 0, cssW, cssH);
```

### `posAt(text, index) → { line, column }`

Maps a 0-based character offset into `text` to a 1-based `{ line, column }` position. The readout a parser wants when reporting where an error occurred. Pure.

- `text` — the source string.
- `index` — the 0-based offset, clamped to `text.length`. An offset at or past the end returns the position just after the final character.
- Lines split on `\n`; `column` counts characters from the line start (1-based). Every other character, including `\r` and `\t`, advances the column by one.

```js
import { posAt } from './CtUtil.mjs';

posAt('ab\ncd', 4); // { line: 2, column: 2 }
```

### `slugify(str, opts?) → string`

Turns arbitrary text into a filename-safe [slug](https://en.wikipedia.org/wiki/Clean_URL#Slug). Pure.

Default (no options): the conservative ASCII form. Trim, lowercase, drop straight quotes, collapse every run of non-alphanumeric characters to a single hyphen, strip leading/trailing hyphens, cap at 60 characters (re-stripping a trailing hyphen the cap may leave). `null`/`undefined` become `''`. This does not transliterate accents, so the accented letters are dropped.

Diacritic-aware variant (`{ diacritics: true, cap? }`): [NFKD-normalizes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize) and strips combining diacritical marks (so `é` → `e`), then splits into words with a camelCase/acronym/digit-run-aware splitter (`"HTMLParser"` → `HTML`, `Parser`; `"foo2bar"` → `foo`, `2`, `bar`), lowercases each, and joins with `-`. This is a different word model from the default. `opts.cap` (a number) caps the length; omitted/`null` leaves it uncapped.

```js
import { slugify } from './CtUtil.mjs';

slugify('My Card!');                          // "my-card"
slugify('Café Menu', { diacritics: true });   // "cafe-menu"
```

### `wrapText(text, maxWidth, measure) → string[]`

Greedy word-wrap, returning an array of lines (always at least one, possibly `''`). Pure: the width measurement is injected, so no canvas/DOM dependency lives here.

- `text` — the source. `null`/`undefined` become `''`.
- `maxWidth` — the max line width, coerced to a finite number (non-finite → `0`). A limit of `0` or less disables width-wrapping, so only explicit newlines break the text and `measure` is never called.
- `measure` — a `function(str) => number` the caller supplies. At a canvas call site, pass `s => ctx.measureText(s).width`.
- Explicit newlines are honored as hard breaks first. Within a paragraph, words are packed greedily, and a single word wider than `maxWidth` is kept whole on its own line.

```js
import { wrapText } from './CtUtil.mjs';

// A simple character-count measure for a terminal readout:
wrapText('the quick brown fox', 9, s => s.length);
// ["the quick", "brown fox"]
```

### `class CtUtil`

An aggregator class. Every static member references one of the named functions above: `downloadBlob`, `debounce`, `clamp`, `num`, `clampInt`, `escapeHtml`, `escapeAttr`, `persistState`, `onceFlag`, `el`, `prefersReducedMotion`, `restartAnimation`, `setupHiDPICanvas`, `posAt`, `slugify`, `wrapText`.

```js
import { CtUtil } from './CtUtil.mjs';

CtUtil.slugify('Hello World'); // "hello-world"
CtUtil.clamp(5, 0, 3);         // 3
```

## Notes

- The DOM-bound helpers (`downloadBlob`, `el`, `prefersReducedMotion`, `restartAnimation`, `setupHiDPICanvas`) throw or misbehave under Node. Import only the pure helpers from a `logic.mjs`.
- `persistState.save` writes only schema keys, so anything not in `defaults` (secrets, derived state) stays out of storage by construction.
- The default `slugify` and the `diacritics: true` variant use different word models and the default is capped at 60 while the variant is uncapped unless `cap` is passed. Pick the one whose output you need.
- `formatBytes`, `getRandomBytes`, `makeId` are not here. They live in `CtByteUtil.mjs`. `escapeXml` lives in `formats/CtEscaper.mjs`.
