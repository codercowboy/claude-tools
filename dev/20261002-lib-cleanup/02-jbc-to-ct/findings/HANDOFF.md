# HANDOFF — 02-jbc-to-ct (jbc→ct lib rename)

> ⚠️ **Provenance note for the verifier.** The original builder subagent was **killed mid-flight**
> (`TaskStop`, VM-resource freeze) and wrote **no** handoff. This file was written by the
> **orchestrator**, which completed the recovery by hand in session 0003. Treat every claim below as
> *to be independently verified* — reproduce the commands yourself; do not trust this summary.

## What was delivered (claims to verify)

**By the killed builder (session 0002, before the stop):**
- All 20 lib modules renamed `Jbc*.mjs` → `Ct*.mjs` under `src/lib/utils/**` + `src/lib/components/**`
  (0 `Jbc*.mjs` remain).
- In-file symbols, markers (`jbcc`→`ctc`, `data-jbc-`→`data-ct-`, `jbc-`→`ct-` except `jbc-include`),
  and `Jbc`→`Ct` applied throughout those two trees.
- Internal import specifiers repointed to the new `Ct*` filenames.
- `jbc-include` / `jbc-include-old` references preserved (not corrupted).

**By the orchestrator (session 0003, recovery — the builder was interrupted before these):**
- Test ripple: repointed `scripts/tests/esm-inline.test.mjs` (8 lines) + `esm-inline-hardening.test.mjs`
  (1 line) — `Jbc`→`Ct` on filenames and the generated bind-symbols (`__ct_utils_JbcByteUtil`
  → `__ct_utils_CtByteUtil`, `__ct_utils_image_JbcDither` → `__ct_utils_image_CtDither`). **Names only;
  assertions unchanged.**
- Comment-only stragglers (out of the DoD grep scope, cleaned for hygiene): `scripts/build-tool.mjs`
  JSDoc (2 lines), `src/lib/test-support/interaction.mjs` (2 comment lines), `src/lib/test-support/shared-ui.mjs`
  (1 comment line) — `Jbc*` → `Ct*`.

## Orchestrator's self-run gate results (reproduce these independently)

| DoD check | Command | Claimed result |
|---|---|---|
| no old identity in lib | `grep -rnE "Jbc\|jbcc\|data-jbc\|jbc-(?!include)" src/lib/utils src/lib/components` (PCRE: `grep -rnP`) | no matches |
| no `Jbc*.mjs` remains | `find src/lib/utils src/lib/components -name 'Jbc*.mjs'` | none (20 `Ct*.mjs`) |
| tests | `node --test scripts/tests/` | 38 pass, 0 fail |
| tool build unaffected | `node scripts/build-all.mjs --check` | 10/10, 0 failed |
| preservation | `grep -rn "jbc-include" src/lib` | present; `src/lib/jbc-include-old/` intact (10 files) |
| diff scope | mtimes (git blocked) | only `src/lib/utils/**`, `src/lib/components/**`, `scripts/tests/esm-inline*.test.mjs`, `scripts/build-tool.mjs` (comment), `src/lib/test-support/{interaction,shared-ui}.mjs` (comments); **NO `src/tools/**`** |

## Known caveats for the verifier
- The orchestrator extended the hygiene cleanup to `src/lib/test-support/**` comments, which is OUTSIDE
  the plan's stated diff scope (`src/lib/utils/**` + `src/lib/components/**` + the 2 test files + optional
  `build-tool.mjs`). These are comment-only edits — flag if you consider them out of scope, but they do
  not affect any gate.
- JSDoc import-example lines inside the renamed lib now read `jbc-include/CtByteUtil.mjs` (hybrid:
  `jbc-include` preserved per the negative-lookahead rule, stem renamed to `Ct`). Pre-existing
  illustrative placeholders; comment-only, no functional effect.

## Verifier round (r1)
VERDICT: PASS. Independently reproduced: grep clean, 0 Jbc files / 20 Ct, all utils import, node --test 38/38, build-all --check 10/10, jbc-include strings preserved (jbc-include-old 10 files intact), renamed modules inline and parse with no surviving export/import, no src/tools edits. Flag: orchestrator's test-support comment edits are outside plan scope (non-blocking). Details: findings/verifier-r1-v1-verdict.md
