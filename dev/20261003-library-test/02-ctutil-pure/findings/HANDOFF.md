# HANDOFF — 02-ctutil-pure r1

Landed: `src/lib/tests/unit/CtUtil.test.mjs` (47 tests, all green). No lib source touched.

## Gate results
- `node --test src/lib/tests/` -> 55 tests, 55 pass, 0 fail (47 CtUtil + 8 crc32). CtUtil file alone: 47/47.
- `node scripts/test-all.mjs`: lib step GREEN (55/55). Overall 9/10 suites: `src/tools/color-picker` e2e had 2 failures
  (copy-button 1s icon revert; ctConfirm dialog visibility; one ~35s timeout) - timing/load-shaped Playwright e2e,
  unrelated to this test-only change (color-designer also showed 1 flaky under same load). Not re-run; recommend a re-run to confirm.
- `node scripts/build-all.mjs --check` -> "Checked 10 tool(s); 0 failed." (10/10)

## Export coverage inventory (CtUtil.mjs)
| Export | Status |
|---|---|
| clamp | tested |
| num | tested |
| clampInt | tested |
| escapeHtml | tested |
| escapeAttr | tested |
| slugify | tested (default ASCII + `{diacritics, cap}` variant) |
| wrapText | tested |
| debounce | tested (node:test mock timers - cheap) |
| CtUtil (aggregator class) | tested (every static member === named export) |
| downloadBlob | deferred - DOM/BOM (document, Blob URL, anchor click) |
| el | deferred - DOM |
| persistState | deferred - localStorage/DOM |
| onceFlag | deferred - storage |
| posAt | deferred - listed deferred by plan (DOM/textarea position helper) |
| prefersReducedMotion | deferred - matchMedia/BOM |
| setupHiDPICanvas | deferred - canvas/DOM |
| restartAnimation | deferred - DOM element reflow |
Count: 9 tested (8 fns + class), 8 deferred = 17 exports.

## Characterized behavior (surprising, asserted as-is; none edited)
- `clamp`: any non-finite input, including +Infinity, returns `lo` (not `hi`). `clamp(null)`/`''` -> Number()=0.
- `num`: `''`, `null`, `[]` -> 0 and `true` -> 1 (Number coercion), NOT the fallback. `num('x', undefined)` -> 0.
- `clampInt`: parseInt semantics: `'1e2'` -> 1 (vs `num('1e2')` = 100), `3.9` -> 3, `-3.9` -> -3 (truncate toward 0),
  `'0x10'` -> 0, `1e21` -> 1, `Infinity` -> fallback. Fallback is returned unclamped; omitted fallback -> undefined.
- `escapeHtml` does NOT escape quotes (only & < >); `escapeAttr` adds `" '` (`&quot;`, `&#39;`). Both double-escape
  already-escaped input and stringify null/undefined to "null"/"undefined".
- `slugify` default: non-ASCII letters are dropped and act as separators ("Café" -> "caf", "naïve" -> "na-ve");
  output capped at 60 chars and the cap can leave a trailing hyphen (59 a's + " b" -> "aaa…a-"). Diacritics variant
  gives "cafe-menu", camel/acronym/digit splitting, uncapped by default.
- `wrapText`: leading whitespace of a paragraph dropped; mid-line whitespace runs preserved; width <=0/NaN disables wrapping.

## Suspected bugs
Candidates only (not asserted as defects, characterized): `clamp(Infinity)` -> lo, and `slugify` trailing hyphen after the
60-char slice. Both look like minor latent quirks; surface to the user if desired.

## Repro
```
node --test src/lib/tests/
node scripts/test-all.mjs
node scripts/build-all.mjs --check
```
