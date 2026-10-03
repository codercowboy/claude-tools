# __TOOL_TITLE__ — PLAN

> Implementation plan. Replace with the real, checkable steps.

## Steps

- [ ] Write the pure engine in `source/logic.mjs` + unit tests in `tests/unit/`.
- [ ] Build the UI in `source/index.template.html` + `source/styles.css`.
- [ ] Wire DOM, persistence, and the Help modal in `source/app.mjs`; expose the
      `window.__<tool>` test hook.
- [ ] `npm run build`, commit `source/` + the generated `index.html`.
- [ ] Flesh out the Playwright e2e suite (desktop + mobile viewport, a11y).
- [ ] Add a ~1200×630 `preview.png` for the Open Graph card.
- [ ] Walk the pre-ship checklist (`html-single-file/pre-ship-checklist.md`).
- [ ] Add the tool's card to the landing gallery.
