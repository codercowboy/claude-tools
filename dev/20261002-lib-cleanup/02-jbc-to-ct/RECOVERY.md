# ⚠️ Phase 3b (jbc→ct rename) — RECOVERY NOTES for the next session

**Written:** 2026-10-02, just before a user-initiated VM reboot. The 3b builder subagent
was STOPPED mid-flight (`TaskStop`, status: killed). Read this BEFORE touching the lib.

## The situation in one paragraph

Phase 3a (ESM-inliner) is DONE and verifier-PASS — don't touch it. Phase 3b was renaming
the new lib `Jbc*`→`Ct*` when it was stopped. On disk RIGHT NOW: **all 20 lib modules are
renamed to `Ct*.mjs` (0 `Jbc*.mjs` remain; 27 files under `src/lib` were modified), BUT the
Phase-3a tests were NOT repointed and NOTHING was verified.** The tree is therefore
**INCONSISTENT and UNTRUSTED** — treat the rename as *in progress*, not done.

## What is known vs unknown (as of the stop)

- ✅ KNOWN: `find src/lib/utils src/lib/components -name 'Jbc*.mjs'` → 0; `-name 'Ct*.mjs'` → 20. So file RENAMES happened for all 20.
- ❓ UNKNOWN / UNVERIFIED (the builder was interrupted — do not assume any of this is correct or complete):
  - Whether every **internal import specifier** was updated (`'./JbcByteUtil.mjs'` → `'./CtByteUtil.mjs'`, `'../JbcByteUtil.mjs'`, etc.). A missed one = broken import.
  - Whether **symbols** (`class JbcByteUtil`→`CtByteUtil`, `export { … }` lists, `JbcComponents`/`JbcConfirm`/`JbcLicense`/`JbcModal`, etc.) were fully renamed inside every file, or a file was left half-edited.
  - Whether the lowercase **markers** (`jbcc-*`→`ctc-*`, `data-jbc-*`→`data-ct-*`, `jbc-*`→`ct-*` except `jbc-include`) were done in the `.mjs` + `.css`.
  - Whether any `jbc-include` / `jbc-include-old` reference was ACCIDENTALLY corrupted (it must be PRESERVED).
- ❌ NOT DONE: `scripts/tests/esm-inline.test.mjs` + `esm-inline-hardening.test.mjs` still reference `Jbc*` filenames/symbols → `node --test scripts/tests/` will currently FAIL (missing `JbcByteUtil.mjs` etc.).
- ✅ UNAFFECTED: `node scripts/build-all.mjs --check` should still be 10/10 (the 9 tools consume `src/lib/jbc-include-old/`, NOT the new lib).

## First thing to do on resume (assess before acting)

Run these read-only checks (cheap; safe after reboot):
```
cd "<repo root>"
find src/lib/utils src/lib/components -name 'Jbc*.mjs'            # expect NONE
find src/lib/utils src/lib/components -name 'Ct*.mjs' | sort      # expect 20
grep -rnE "Jbc|jbcc|data-jbc|jbc-(?!include)" src/lib/utils src/lib/components   # leftover old identity?
grep -rn "jbc-include" src/lib/utils src/lib/components           # these MUST still be present (preserved)
node scripts/build-all.mjs --check                               # expect 10/10 (tools unaffected)
node --test scripts/tests/ 2>&1 | tail -5                        # EXPECTED TO FAIL until tests repointed
```
That tells you how far the builder actually got.

## Two recovery options

**Option A (recommended) — re-run the 02-jbc-to-ct builder to FINISH its own work.**
The round is fully scaffolded and the prompts are composed + linted + marked:
- `dev/20261002-lib-cleanup/02-jbc-to-ct/plan.md` (the full surgical spec)
- `dev/20261002-lib-cleanup/02-jbc-to-ct/spawn-prompt-builder-r1.md` (ready; has the gate marker)
- `dev/20261002-lib-cleanup/02-jbc-to-ct/spawn-prompt-verifier-r1.md` (ready)
Tell the re-spawned builder it is RESUMING a half-done rename: files already renamed to `Ct*`,
so its job is to (1) verify/repair internal imports + symbols + markers, (2) do the test ripple,
(3) pass the gates. **Gate B is per-session** — the prior spawn token is gone after reboot, so you
MUST re-confirm Gate B with the user before respawning (hook-enforced).

**Option B — finish by hand** (if avoiding another subagent): complete the surgical rename
checks above, repoint the two test files (`Jbc*`→`Ct*` filenames + asserted symbol names, changing
ONLY names, not assertions), then run the gates.

## The surgical rename spec (the rules, whichever option)

Apply in THIS order; NEVER a blanket `jbc→ct`:
1. `jbcc` → `ctc`
2. `data-jbc-` → `data-ct-`
3. `jbc-` → `ct-` **EXCEPT `jbc-include`** (`jbc-(?!include)`) — PRESERVE `jbc-include`/`jbc-include-old`
4. `Jbc` → `Ct` (case-sensitive; symbols + filename stems; safe in PROVENANCE/JSDoc)
5. filenames `JbcX.mjs`→`CtX.mjs` (done already) + every internal import specifier updated
6. ripple: `scripts/tests/esm-inline*.test.mjs` — repoint `Jbc*` filenames + asserted symbols only.

## Definition of done (gates — ALL must hold)

- `grep -rnE "Jbc|jbcc|data-jbc|jbc-(?!include)" src/lib/utils src/lib/components` → no matches
- no `Jbc*.mjs` under the lib (already true)
- `node --test scripts/tests/` → **38 pass, 0 fail**
- `node scripts/build-all.mjs --check` → **10/10, 0 failed**
- every `jbc-include` / `jbc-include-old` string byte-unchanged
- diff touches only `src/lib/utils/**`, `src/lib/components/**`, `scripts/tests/esm-inline*.test.mjs` (+ optional `scripts/build-tool.mjs` comment); NO `src/tools/**` edits
- then run the VERIFIER for an independent PASS.

## Alternative: discard and restart cleanly
If the partial state looks messy, the user has git backups (they said so earlier). Since `git` is
BLOCKED in-session, the USER can `git checkout`/`git stash` the lib to pristine and 3b restarts from
a clean base. Do NOT attempt git yourself; ask the user. (`rm` is also blocked — move, don't delete.)

## Pointers
- Epic plan + phase map: `dev/20261002-lib-cleanup/00-epic-plan/epic-plan.md`
- Full roadmap (3a done, 3b here, 3c USER-gate, 3d pilot, 3e fan-out, 3f retire): `dev/20261002-lib-cleanup/execution-plan.md`
- Phase 3a design + verdict (the inliner this builds on): `dev/20261002-lib-cleanup/01-esm-inliner/findings/`
- Session handoff + punchlist (#2.5 is this partial state): `.claude/claude-tpm/sessions/session-0002/`
