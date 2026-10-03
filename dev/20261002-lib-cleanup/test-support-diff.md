# test-support-old vs test-support — dropped-code safety check (task #1008)

Scope: `src/lib/test-support-old/` (retired, still wired into 9 tools) vs `src/lib/test-support/` (new, from jason-code). Report only; nothing modified.

## TL;DR
- **No exported API in -old is missing from the new dir.** `loadLogic`, `toolUrl`, `helpSeenKey`, `seedHelpSeen`, `assertLicenseModal` and the default config export all exist with identical names and signatures. The code diff is limited to comments plus ONE config difference.
- **One behavioral drop (the only real risk):** `playwright.base.config.mjs`. -old pins `workers: 1` and `fullyParallel: false` (serial, added Oct 2 to fix flaky timing/focus tests). The new one has `fullyParallel: true` and no `workers`, so a port would silently reintroduce parallel flakiness. Fix: backport the two lines and the explanatory comment into the new file.
- Everything else is additive (new helpers).

## 1. File inventory
| File | old | new |
|---|---|---|
| playwright.base.config.mjs | yes | yes (differs) |
| setup.mjs | yes | yes (identical) |
| shared-ui.mjs | yes | yes (1 comment line differs) |
| unit.mjs | yes | yes (identical) |
| README.md | yes | yes (new = old + 17 added lines) |
| binary.mjs, clipboard.mjs, files.mjs, interaction.mjs, layout.mjs, storage.mjs | no | yes (new-only) |
| PROVENANCE.md | no | yes (new-only) |
| tests/ (files-binary, interaction, storage-layout-clipboard `.test.mjs`) | no | yes (new-only) |

**Old-only files: none.**

## 2. Diffs of files present in both
- **setup.mjs** — byte-identical. Exports `toolUrl(importMetaUrl)`, `helpSeenKey(toolName)` (`${tool}:help-seen:v1`), `seedHelpSeen(page, key)`.
- **unit.mjs** — byte-identical. Exports `loadLogic(importMetaUrl)` (memoized import of `../../source/logic.mjs`).
- **shared-ui.mjs** — only a comment changed: "footer.html + `license.js`" became "footer.html + `JbcLicense.mjs`". Code is identical. `assertLicenseModal(page)` still targets testids `footer-license-link`, `license-overlay`, `license-modal`, `license-close-x`. These testids are emitted by `src/lib/components/JbcLicense.mjs` (confirmed present) and are used in the tools' built `index.html` files (e.g. inflation-calculator, qr-generator, uuid-generator). The old `jbc-include-old/license.js` is the legacy emitter, so there is no coupling problem as long as tools are on the new components.
- **playwright.base.config.mjs** — real differences:
  | | old | new |
  |---|---|---|
  | `fullyParallel` | `false` | `true` |
  | `workers` | `1` (with a long rationale comment: copy-icon revert ~1s, hover states, modal focus return flake under contention; "don't re-raise workers") | not set (Playwright default = parallel) |
  | doc-comment import path | `../../../lib/test-support/...` | `../../test-support/...` (comment only; wrong for tools at `src/tools/<t>/tests/`, where the correct relative path is `../../../lib/test-support/...`) |
  | doc-comment override example | `{ ...base, timeout: 30000 }` | `{ ...base, workers: 1, timeout: 30000 }` |
  Unchanged: `testDir: '.'`, `testMatch: '**/*.e2e.mjs'`, `reporter: 'list'`, `use.permissions: ['clipboard-read','clipboard-write']`.
- **README.md** — new = old plus added sections for `interaction.mjs` and `files.mjs`/`binary.mjs`. Nothing removed.

## 3. Old export / option to new equivalent
| -old item | new equivalent | status |
|---|---|---|
| `setup.mjs: toolUrl` | same name, same signature | OK |
| `setup.mjs: helpSeenKey` | same | OK |
| `setup.mjs: seedHelpSeen` | same | OK |
| `unit.mjs: loadLogic` | same | OK |
| `shared-ui.mjs: assertLicenseModal` | same | OK |
| base config `testDir/testMatch/reporter/use.permissions` | same | OK |
| base config `fullyParallel: false` | now `true` | **DROPPED / CHANGED** |
| base config `workers: 1` | absent | **DROPPED** |

Verified consumers (grep of `src/tools/*/tests`): every import from `test-support-old` uses only `loadLogic` (also aliased `loadSharedLogic`), `toolUrl`, `helpSeenKey`, `seedHelpSeen` (aliased `seedHelpSeenKey` in one file), `assertLicenseModal`, and the default config `base`. All exist in the new dir under the same names, so the swap is a pure path change.

## 4. Net-new in test-support (gained)
- `interaction.mjs`: `waitForToolReady`, `trackPageErrors`, `assertHookShape`/`driveHook`, `assertModalA11y`, `assertHelpAutoShows` (inverse of `seedHelpSeen`), `assertConfirmDialog`, `assertDropDispatch`, `assertRovingTabs`, `TINY_PNG_B64`.
- `files.mjs`: `captureDownload`, `readDownloadBytes`, `downloadBytes`, `MAGIC`/`sniffType`/`expectMagic`, `uploadFile`, `canvasSignature`/`canvasPixels`/`countChangedPixels`.
- `binary.mjs`: `makePng`, `pngChunk`, `noisePaint`, `TINY_PNG_BUFFER`, `crc32`/`refCrc32`, `u16le`/`u32le`/`ascii`, `readStoreZip`.
- `clipboard.mjs`, `layout.mjs`, `storage.mjs` (storage/layout/clipboard assertions), plus `PROVENANCE.md` and 3 node:test unit suites in `tests/` (`node --test tests/`).

## 5. Reconciliation recommendation for #1008
1. **Backport the serial config to new `playwright.base.config.mjs` BEFORE switching tools**: set `fullyParallel: false`, `workers: 1`, and copy the rationale comment. Alternatively, make every tool's config pass `workers: 1` explicitly, but putting it in the base is safer (matches current behavior and the "don't re-raise workers" note). Note the old file was last edited Oct 2 (newer than the new copy, Sep 15), so this is a case of -old being ahead, which is why the migration missed it.
2. **Import paths**: in each of the 9 tools, sed `lib/test-support-old/` to `lib/test-support/`. Depth is unchanged (`../../../lib/` from `tests/`, `../../../../lib/` from `tests/unit/`). No renamed or re-signed imports.
3. Fix the new config's doc comment path (`../../test-support/` should be `../../../lib/test-support/`) — cosmetic.
4. Keep the `JbcLicense.mjs` footer testids as the source of truth; confirm each tool's built `index.html` includes them (already true for the ones grepped; run each tool's e2e after the swap).
5. Optional follow-ups after the swap: adopt `waitForToolReady`/`trackPageErrors` to replace per-tool preambles; `tests/` in the new dir is a `node --test` suite and is not picked up by Playwright (`testMatch` is `*.e2e.mjs`).
6. After the port and a green run, `test-support-old/` can be deleted (its README is a strict subset of the new README).
