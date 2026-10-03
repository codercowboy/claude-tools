# Verifier r1 v1 — 01-harness — PASS

## DoD evidence
1. `node --test src/lib/tests/`: tests 8, pass 8, fail 0 (re-run by me).
   `node scripts/test-all.mjs` (run twice): lib runs as the named step `=== src/lib unit tests — node --test src/lib/tests/ ===`, 8/8 green, before the e2e packages. Overall 9/10 suites both times; the failing suite was color-picker e2e each time (see 4).
   `node scripts/build-all.mjs --check`: "Checked 10 tool(s); 0 failed."
2. Coverage quality (good):
   - Vectors are real known answers. I cross-checked every one against Python `zlib.crc32`: ""=0, "123456789"=cbf43926, a=e8b7be43, abc=352441c2, fox=414fa339, [0xff]=ff000000, [0x00]=d202ef8d. All match.
   - Sources are cited in the file header, plus the catalog check value.
   - Input types covered: Uint8Array, plain array, Buffer. Unsigned result is checked via the 0xff000000 vector.
   - crc32Hex gets real checks: padding ('00000000', 'ff000000') and the lowercase 8-char regex.
   - Mutation test, on a scratch copy of the module (source untouched): changing the polynomial gave 5 fail, dropping the final `>>> 0` gave 6 fail, changing the init value gave 7 fail. The tests can fail.
   - Weak spots (concerns, not FAILs): the "large input" test and the determinism test only check self-consistency, with no known-answer vector for 4096 bytes. The range assert in the unsigned test is partly redundant. No error-path test (null or undefined input). `crc32Hex` padding is not mutation-tested: the only vectors with leading zeros are "" and [0,0,0,0], which a padStart mutation would catch, but I did not run that mutation.
3. Wiring: in `scripts/test-all.mjs`, `SKIP_RELDIRS = new Set(['src' + sep + 'lib'])` is still present and still used at line 43. The lib step is a separate explicit spawnSync. `package.json` has `"test:lib"`. `src/lib` contains tests/ plus the pre-existing dirs. I could NOT run `git diff` or `git status` (denied by permissions), so "no src/lib source modified" rests on inspection plus the handoff; mtime checks were inconclusive. The orchestrator should confirm with `git diff HEAD -- src/lib/utils src/lib/components`.
4. Flaky color-picker: it failed in both of my full runs. The first run failed 2 tests, `toHaveValue` and `toHaveText`, different from the handoff's `toHaveCount`. Run alone, `npm run test:e2e` gave 92 passed. The failing assertions are in color-picker UI, unrelated to the pure-Node lib tests, which have no shared state. I judge it flaky under full-suite load and not caused by the lib work. The failure is not stable, though: it moves between tests and fails on every full run, so it deserves its own task, since it makes `test-all` red.
5. Harness fitness: sound. The location, the zero-dependency node:test runner and the README copy recipe are all fine for phases 02–13. Minor gaps:
   - `crc32Hex` is local to CtByteUtil.mjs, and a stale comment mentions a sibling crc32.mjs.
   - The README does not mention that adding a file needs no wiring. The handoff does say this.
   - Later phases should be told that `test-all` shows 9/10 because of the color-picker flake, so the red run is not blamed on them.

## Reproduction
```
node --test src/lib/tests/
node scripts/test-all.mjs
node scripts/build-all.mjs --check
python3 -c "import zlib;print('%08x'%zlib.crc32(b'123456789'))"
# mutation: sed the copied CtByteUtil.mjs in a scratch dir, run the copied tests against it
(cd src/tools/color-picker && npm run test:e2e)
```

PASS: lib tests are green and the vectors are verified real; mutations are caught; wiring keeps SKIP_RELDIRS. Remaining caveats are the unconfirmed "no lib source changed" (git was blocked) and the recurring color-picker flake.
