# Cron Builder — PLAN.md

Implementation plan derived from `DESIGN.md`. Build order and the concrete
shape of each `source/` file.

## Files

```
src/tools/cron-builder/
├── source/
│   ├── index.template.html   # page shell, cards, Help modal, build tokens
│   ├── styles.css            # tool styles (cards, field editors, modal)
│   ├── logic.mjs             # pure engine: parseCron/buildCron/describeCron/nextRuns
│   └── app.mjs               # DOM wiring, render, persistence, test hook
├── index.html                # GENERATED — do not edit
├── package.json              # @codercowboy/cron-builder
├── README.md                 # usage + dev section + shared footer
├── DESIGN.md
└── PLAN.md
```

## Step 1 — `source/logic.mjs` (pure)

Data:
- `MONTH_NAMES` (1-indexed), `MONTH_ALIASES` (`JAN`→1 …).
- `DOW_NAMES` (0=Sunday), `DOW_ALIASES` (`SUN`→0 …).
- `FIELD_SPECS`: per field `{ key, label, min, validMax, wildMax, aliases?,
  allowQuestion?, wrap7? }`.
- `MACROS`: `@daily` etc. → 5-field strings.

Functions (all pure, exported):
- `resolveToken(tok, spec)` — name/number → validated integer.
- `parseTerm(str, spec)` — one term → `{type, ...}` (`every|step|stepFrom|
  single|range|rangeStep`), with validation (step ≥ 1, range from ≤ to).
- `expandTerm(term, spec)` — term → normalized value array (`7 → 0` for dow).
- `parseField(text, spec)` — comma list → `{ raw, terms, wildcard, question,
  values, valueSet }`; handles whole-field `?`.
- `serializeTerm` / `buildField` — terms → canonical text.
- `parseCron(expr, { seconds })` — macro-expand, split, count-check, parse each
  field into the model; throw friendly `Error`s.
- `buildCron(model)` — join built fields (seconds first when enabled).
- `isRestricted(field)`, `dayMatches(model, date)` — dom/dow OR rule.
- `nextRuns(model, from, count)` — climbing local-time search, 5-year cap +
  iteration guard.
- `describeCron(model)` — clean `At HH:MM[:SS]` + generic fallback; day clauses;
  month clause; OR-note wording.
- `fieldEditorMode(field)` — picker mode + params for the app.
- `asSingle`, `asStep`, `pad`, `capitalize`, list-join helpers.

Wrapped in `// ===== BEGIN/END PURE-LOGIC =====` sentinels; single `export {}`.

## Step 2 — `source/index.template.html`

- `<head>`: charset, viewport, `<title>`, OG + Twitter meta, `<style>` with
  `:root` light + `@media (prefers-color-scheme: dark)` palettes,
  `<<ct:include base.css>><<ct:inline styles.css>>`.
- `<body>`: header (title + `?`), Expression card (seconds checkbox, raw input +
  copy, error line, presets select), field-editors container, explainer card,
  next-runs card.
- Help overlay/dialog with `.modal-close-x`.
- `<<ct:include footer.html>>`, `<script><<ct:include copy.js>></script>`,
  `<script type="module"><<ct:inline app.mjs>></script>`.

## Step 3 — `source/styles.css`

Reuse dev-converter's palette-driven card styling: `.card`, inputs/selects/
buttons, `button:hover:not(:disabled):not(.ctc-btn)`, `.help-button`,
`.modal-close-x`, help overlay/dialog, `[hidden]{display:none!important}` (also
in base.css), responsive `@media (max-width:640px)`. Add: `.field-grid` (auto-fit
cards), `.field-card`, `.field-body` variants, `.checkbox-grid` (dow/month),
`.runs-list`, `.error`.

## Step 4 — `source/app.mjs`

- `<<ct:inline logic.mjs>>` at top.
- State `{ expr, seconds }`; `STORAGE_KEY='cron-builder:v1'`,
  `HELP_SEEN_KEY='cron-builder:help-seen:v1'`; `saveState`/`loadState`
  (try/catch, default `0 9 * * 1-5`).
- DOM refs; `renderFromRaw({rerenderEditors})`, `renderEditors(model)`,
  `renderExplainer(model)`, `renderNextRuns(model)`.
- `createFieldEditor(uiSpec, field)` → mode select + body per mode, `readText()`
  closure registered in `fieldReaders`; wiring calls `onEditorChange`.
- `assembleExprFromEditors`, `onEditorChange` (rerenderEditors:false),
  raw-input handler (rerenderEditors:true), seconds toggle (adjust field count),
  presets change.
- Delegated copy handler; "Copy all" for runs.
- Help modal (focus trap, Esc, backdrop, ✕, focus return); first-load auto-show.
- `window.__cronBuilder = { parseCron, buildCron, describeCron, nextRuns,
  parseField, buildField, fieldEditorMode, FIELD_SPECS, ...entry points, state }`.

## Step 5 — `package.json` + `README.md`

- `package.json`: `@codercowboy/cron-builder`, `groupId com.codercowboy`, the
  standard base64-tool script block, `@playwright/test` devDep.
- `README.md`: what it is, syntax table, usage, dom/dow OR note, DST note,
  "Developing (build from source)", `window.__cronBuilder`, verbatim
  `readme-footer.md`.

## Step 6 — build & validate

`cd src/tools/cron-builder && npm run build && npm run build:check` (both exit
0). No tests/ suite, no preview.png (out of scope for this builder pass).
