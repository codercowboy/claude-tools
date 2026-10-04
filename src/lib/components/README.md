# ct lib — components

The shared UI pieces the claude-tools tools reuse: modal dialogs, a confirm prompt, clipboard-copy, the License footer, and the DOM-wiring helpers that drive segmented controls, tabs, dropzones, and copy buttons. Like the `utils` modules, each is inlined into a tool's single-file `index.html` at build time (`<<ct:module path>>`), so nothing here ships as a runtime dependency. These are browser components — they build and wire real DOM, and each doc states the markup it expects.

Every module has its own reference doc. This is the map; follow a link for the full API.

## Modules

- [`CtModal`](./CtModal.md) — the shared accessible content-modal primitive: one `createModal` call builds a Help / Options / About-style dialog and hands back an open/close handle.
- [`CtConfirm`](./CtConfirm.md) — an accessible, promise-based confirm dialog (a themed, focus-trapped replacement for `window.confirm`).
- [`CtClipboardUtil`](./CtClipboardUtil.md) — copy text to the clipboard (async Clipboard API with an `execCommand` fallback) and flash a button to confirm it.
- [`CtComponents`](./CtComponents.md) — UI-wiring helpers: segmented controls, tabs, dropzones, status banners, an aria-live announcer, and delegated copy buttons.
- [`CtLicense`](./CtLicense.md) — the License modal: importing it wires the footer's "MIT License" link to a dialog showing the project license and any bundled third-party libraries.

## Markup

- `footer.html` — the shared page footer (repo link, credits line, and the "MIT License" trigger `CtLicense` wires up), inlined via `<<ct:lib components/footer.html>>`. `readme-footer.md` is the matching footer snippet for the tools' own README files.

## Styles

The CSS that styles these components (and the tools' base layout, controls, and gallery grid) lives in [`styles/`](./styles/README.md) — palette-agnostic, inlined by the build.
