# new-tool-template — the scaffold source

This directory is two things at once:

1. **A copy-me reference tool.** A minimal, end-to-end example of the canonical
   single-file tool: the `source/` four-file set, a standalone `package.json`,
   the two test layers, and the `README`/`DESIGN`/`PLAN` docs. Read it top to
   bottom to see how the pieces fit.
2. **The template the scaffold copies.** `../new-tool.mjs` copies this directory
   into a new tool dir and substitutes the placeholder tokens below.

## Placeholder tokens

Every substitutable value is a `__UPPER_SNAKE__` token, so it's greppable and
never collides with real code. `new-tool.mjs` replaces all occurrences across
every copied file:

| Token | Meaning | Example |
| --- | --- | --- |
| `__TOOL_NAME__` | unscoped package + folder name, kebab-case (also the `localStorage` key prefix) | `color-picker` |
| `__TOOL_TITLE__` | human display title | `Color Picker` |
| `__TOOL_DESC__` | one-line description (used in `<title>`/OG/meta) | `Pick and convert colors` |
| `__TOOL_HOOK__` | the `window` test-hook property name; the scaffold prepends the `__` convention prefix (pass the bare identifier via `--hook`) | `--hook=colorPicker` → `window.__colorPicker` |
| `__TOOL_SCOPE__` | npm scope, including the `@` | `@codercowboy` |
| `__GROUP_ID__` | reverse-DNS group id (`package.json` `groupId`) | `com.codercowboy` |

`{{project.*}}` tokens (e.g. `{{project.name}}` in the footer / README) are **not**
placeholders the scaffold touches — the build fills those from the consuming
repo's `project.json`. Leave them as-is. See `../../README.md`.

## This file is not copied

`new-tool.mjs` skips `TEMPLATE.md` when scaffolding — it documents the template,
not the tool you're creating.
