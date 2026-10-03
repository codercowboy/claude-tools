# Verifier r1 v1 verdict: 17-image-util-pure (Phase 13b, final epic round)

## VERDICT: PASS

The 51 tests in `CtImageUtil.test.mjs` pin the pure helpers with exact, independently correct values. 41 of 45 targeted mutations turned the suite red, including every `>`→`>=` limit flip. The 4 survivors are 2 equivalent mutants and 2 real minor boundary gaps (not FAILs). No lib source was touched.

## Evidence per DoD claim

1. **Suite green.** `node --test src/lib/tests/` gave tests 1641, pass 1625, fail 0, todo 16, cancelled 0, exit 0. This matches the builder's numbers exactly. The stack traces at the tail of the output are the CtDiff known-bug todo markers, not failures. `node scripts/build-all.mjs --check` gave "Checked 10 tool(s); 0 failed." (10/10).
2. **`node scripts/test-all.mjs`** ran to completion: lib step 1641/1625/0/0/16, then e2e (41 passed in the last suite), and the final line was `10/10 suites passed.` with exit 0. No e2e suite failed this run, so the color-picker/color-converter flake did not appear and there is nothing to attribute.
3. **No lib source modified.** `git` is blocked, so I relied on mtimes. `CtImageUtil.mjs` is dated Oct 2 21:51. The test file is dated Oct 4 01:02 and is the only file that is new. No non-test `.mjs` or `.js` under `src/lib` is newer than this phase's charter. `build-all --check` is 10/10. After the mutation sweep, `diff` of the real lib file against the pristine scratch copy shows no difference.
4. **No canvas or DOM.** The test imports only `node:test`, `node:assert/strict` and the module. The 3 deferred functions (`loadImageFile`, `canvasToBlob`, `canvasToPngBytes`) need `Image`, `URL` and `canvas`, so deferral is right. The aggregator test checks that they exist as functions without calling them.

## Mutation sweep

I ran it on a scratch copy at `tmp/mut/`, which holds a copy of the lib, `CtByteUtil.mjs` and the test file. The real lib file was never edited. The runner is `tmp/mut.mjs` and the results are in `tmp/mut-results.txt`. 45 mutations ran, 41 RED and 4 GREEN (survived).

- **Limit comparisons, the key risk: every one turned the suite RED.**
  - `b > WARN_FILE_BYTES` to `>=`: RED.
  - `b > MAX_FILE_BYTES` to `>=`: RED.
  - `w > MAX_DIMENSION` to `>=`: RED.
  - `h > MAX_DIMENSION` to `>=`: RED.
  - `pixels > WARN_PIXELS` to `>=`: RED.
  - The strict-threshold claim is genuinely pinned.
- **Limit constants and precedence.** All RED: MAX_DIMENSION 20000→20001, WARN_PIXELS 24M→25M, MAX_FILE 40→41 MB, file-hard check disabled, dim-hard check disabled, dim-hard height arm dropped, warn level returned as error, injected `dimSep` ignored, injected `action` ignored.
- **Fit.** All RED: the coverRect `>`→`<` aspect branch swap, containRect `min`→`max`, the coverRect `/2` centering, the coverSrcRect zoom floor, and the coverSrcRect offset clamp removed.
- **constrainRectToAspect and aspect.** RED for height-driven branch off, n-anchor y using B, 1px floor removed, portrait ignored (both custom and preset paths), and the clampRectToImage 1px floor. The survivors d2 and d4 are explained below.
- **hitTestHandle and gizmo.** RED for `<=`→`<` tolerance, default tol 10→12, inside→'move' removed, tie order reversed, oppositeHandle 'n' wrong, resizeRaw w-edge wrong, and normalizeRect no h-flip. The survivor e4 is explained below.
- **Colour and formats.** RED for hexToRgb 3-digit expansion off, hexToRgb green slice, rgbToHex padding, clampByte round-vs-truncate, parsePalette no clamp, mimeForFormat fallback, and formatSupportsQuality always true. The survivor f4 is explained below.
- **Aggregator.** RED for a nulled static, a swapped static, and the last member dropped.

### Survivors

None is a hollow area. Two are equivalent mutants and two are small, real boundary gaps.

- **d2, d4 (equivalent).** Dropping the explicit `'center'` check in `horiz` makes `'center'` read as `'e'`. Changing the `'e'` anchor to `x = L` has the same effect on the centre case. In the width-driven branch `w` is unchanged, so `R-w` equals `L` equals `(L+R)/2 - w/2`. The results differ only when the 1px floor changes `w`, meaning a rect narrower than 1px with an `e` or `center` anchor. That case is untested. It is a low-value gap, and the `vert` check does keep 'center' from being height-driven.
- **e4 (real, minor).** The right-edge-inclusive test `px <= n.x + n.w` is not pinned. A point exactly on the right edge that is more than tol from any handle (for example `(110, 35)` on GR, which is 15 from `e` and `ne`) should return 'move'. No test hits this. The left, top and bottom edges are also unpinned.
- **f4 (real, minor).** `clampByte` with `v > 255` changed to `v > 256` survives. There are rows at 255.9 and 300 but none at exactly 256. A row `[256, 255]` would kill it.

## Independent re-derivations

I worked these out by hand from the source, then compared them to the asserted literals. All match.

- **coverRect(200,100,100,100).** srcAspect is 2, dstAspect is 1, and 2>1, so crop the sides. sh=100, sw=100·1=100, sx=(200−100)/2=50, sy=0. Result {50,0,100,100}. Asserted as such.
- **containRect(200,100,100,100).** scale=min(0.5,1)=0.5, w=100, h=50, x=0, y=(100−50)/2=25. Result {0,25,100,50}. Asserted as such.
- **Limit thresholds.**
  - 8 MB is 8·1024·1024 = 8388608, and the test asserts that value. Exactly 8 MB is 'ok'. +1 is 'warn'.
  - 40 MB is 41943040. Exactly 40 MB is 'warn' (not error, because it is above 8 MB). +1 is 'error'.
  - Width 20000 with height 1200 is 24,000,000 pixels, which is not above 24M, so 'ok'. Height 1201 gives 24,020,000, which is 'warn'.
  - Width 20001 is 'error'.
  - The pixel warn is 6000×4000=24,000,000 → ok, and 6000×4001 → warn.
  - The strict-`>` claim is correct.
- **constrainRectToAspect anchor case.** For S={10,10,100,100}, ratio 2, anchor 'n': the anchor is n/s, so it is height-driven. w=100·2=200, h=100, x=(10+110)/2−100=−40, y=T=10. Result {−40,10,200,100}. Asserted as such.
- **Other asserted values I spot-checked.** coverSrcRect z=2 gives {75,25,50,50}, hex 'bad' expands to [187,170,221], and the resizeRaw table is right.

## Aggregator

The loop is `for (const k of Object.keys(ns).filter(k !== 'CtImageUtil')) assert.equal(CtImageUtil[k], ns[k], k)` with a pinned length of 28. `assert.equal` is strict (`node:assert/strict`), so it checks identity, and it fails if a static is missing, `null`, or swapped. Mutations g1, g2 and g3 went RED, which confirms it. It is a full loop, not just a spot-check.

## Adjudication of the builder's observations

1. **clampByte truncates (127.9→127).** Defensible and correctly pinned. The lib's own comment says "truncates via |0", and the plan's "round" wording is wrong. The test also pins `15.9→0x0f` in rgbToHex, and the round mutation went RED. Not a bug.
2. **'center' is width-driven.** Defensible. The source comment explicitly says "Corner + horizontal-edge anchors drive by width", and `drivenByHeight` is true only when horiz is 'c' and vert is not 'c'. The test pins it and also checks it differs from 'ne'. Not a bug.
3. **hitTestHandle ties go to the later handle.** This is a consequence of `d <= bestD` and is pinned with a clean 4-way tie that resolves to 'w'. It is an arbitrary but deterministic characterization, and the tie-order mutation went RED. Not a bug. The `<=` also makes the tol boundary inclusive, and that is pinned too.
4. **resizeRaw('move') reads the 'e' in "move" as east.** This is a real but low-severity quirk. `id.includes('e')` matches the substring, and callers pass only the 8 handle ids. The builder left it unasserted and noted it. That is the right call: do not pin buggy behavior. I would log it as an optional hardening item on `resizeRaw` (an exact-match handle lookup). It is not a FAIL.

## Coverage-quality concerns (non-blocking)

- Add a row `[256, 255]` to clampByte (f4).
- Add a right-edge hitTest case such as (110,35) → 'move' (e4).
- Add a sub-1px-width constrain case with an `e` or `center` anchor, to pin `x` relative to `R−w`.
- The tests use `deepEqual` with exact floats in several places. It is stable today, and the author used epsilon comparison where the float division was unstable.
- The aggregator pins `names.length === 28`, so adding an export makes the test fail until it is updated. That is intentional.

## Reproduction

```bash
cd "/Volumes/My Shared Files/claude/tools-workspace/claude-tools"
node --test src/lib/tests/
node scripts/build-all.mjs --check
node scripts/test-all.mjs
# mutation sweep on the scratch copy (tmp/mut = copy of lib + CtByteUtil + test)
node dev/20261003-library-test/17-image-util-pure/tmp/mut.mjs "$PWD/dev/20261003-library-test/17-image-util-pure/tmp/mut"
```

Logs are in `tmp/full.log`, `tmp/testall.log` and `tmp/mut-results.txt`.

## Note on stray processes

`test-all` (the Playwright e2e step) left `chrome-headless-shell` processes running. No `node --test` process is running. I did not kill the Chrome processes, because reaping needs the user's confirmation.

**PASS: 51 exact-value tests, 41 of 45 mutations killed (including every strict `>`→`>=` flip), my hand derivations match, full test-all is 10/10, and no lib source was touched. The 4 survivors are 2 equivalent mutants and 2 minor boundary gaps.**
