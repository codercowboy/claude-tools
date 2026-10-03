<!-- tpm-session: 001 · handoff — READ FIRST -->
# Session 001 — handoff — SEALED 2026-09-16

## Where we are
**SHIPPED.** `claude-tools` is public on GitHub (`codercowboy/claude-tools`). This session, from an empty repo:
- Migrated 9 vanilla web tools from `../claude-tools-dev` — qr-generator, color-designer, color-picker, color-converter, base64-tool, cron-builder, inflation-calculator, network-toolkit, uuid-generator — each `npm install` + built + unit + e2e green. Both galleries (this repo + the dev repo) reconciled.
- Copied the baseline: `scripts/`, `src/tools/{jbc-include,test-support,include,source}`, and the root `package.json` (now **v1.0.0**, `bin.ct`, `serve` script, restored `optionalDependencies`) + `LICENSE`.
- Wrote the shippable docs via a dog-food workflow round: root `README.md` + `docs/technical.md` + `docs/alternatives.md` (placed at repo root).
- Built the **`ct` router** — `npx ct build | test | serve | run | install`; `ct build` chains `build-all.mjs` → `build-preview-gif.mjs`.
- Added `docs/images/tools-preview.gif` — 9 tool cards, 600×315, 1s/frame, loops; regenerated on every `ct build` (hand-rolled zero-dep PNG decode + GIF89a encoder).
- In **jason-code**: built `conventions/project-structure/documentation-standards/` (README + 7 per-doc specs + `examples/claude-tpm/`), clarity-passed + reviewed x2 + reflowed one-line-per-paragraph; added `jason-voice-conventions.md` §8 (no hard wrap) + §9 (register by doc type).
- Fixed claude-tpm bugs: truncated `docs/technical.md` + `docs/INSTALL.md` tails; broken `docs/user-guide.md` config-guide links.

## Next
- **#1001** — project docs (mostly satisfied by this round; user-guide deferred).
- **#1003** — vendor/provenance carve-out, incl **#1003.A**: fix refs broken by the vendor move (`include/README.md` → missing `jbc-include/LEDGER.md`; `test-support/README.md` → missing `PROVENANCE.md`; `build-tool.mjs` docstring says `include/` vs the code's `jbc-include/`).
- Cleanup when ready: `tmp/safe-to-delete/` (old migrated tool sources + the `vendor-carveout/` stash).
- Optional: embed `docs/images/tools-preview.gif` as a README banner.

## Do NOT redo
- The 9 tools are migrated + built + tested and both galleries reconciled — do not re-migrate.
- `package.json` is v1.0.0 with `bin.ct`, the `serve` script, and restored `optionalDependencies`. It was **truncated once by the shared volume** — if it ever looks short, it truncated again; restore, don't re-derive.
- The `documentation-standards/` specs are already clarity-passed, reviewed twice, and reflowed to one-line-per-paragraph — do not re-wrap or re-review.
- **⚠️ The `My Shared Files` volume silently TRUNCATED writes twice this session** (claude-tpm's docs, and this repo's `package.json`). Validate / `git diff` after writes on this volume.
- The claude-tpm session-notes tool API shifted **mid-session** (a peer `claude-tpm-dev` session is editing the library): the `resume` verb was replaced by `handoff.md` via `session save` + `punchlist`. This handoff was hand-written because of that churn.
