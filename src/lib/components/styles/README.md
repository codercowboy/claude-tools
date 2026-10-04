# ct lib — component styles

The shared CSS the build inlines into a tool's `<style>` block (via the `<<ct:lib components/styles/NAME.css>>` token). All four files are palette-agnostic: they carry structure and sizing, and leave colors to each tool (its own `--accent` / `--border` / `currentColor`). This folder is the single source of truth — edit a file here and run `npm run build` to re-inline it into every tool that uses it.

## The files

- **`base.css`** — universal, palette-agnostic base fixes, inlined near the TOP of every tool's `<style>` so a tool's own later rules can still layer colors on top. It sets [`touch-action: manipulation`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) on `html` (double-tap won't zoom, pinch-zoom and scroll still work), hardens the `[hidden]` attribute against author `display:` rules, provides `.visually-hidden` for screen-reader-only text, and notes the `<select>` chevron gotcha. Every tool gets it.
- **`controls.css`** — shared control conventions for the UTILITY tools (opt-in), placed after `base.css` and before a tool's color rules. It sets the standard single-line control height (`--control-h: 44px`) and the in-field copy-button layout. Sizing and structure only.
- **`gallery.css`** — the landing-gallery card-grid layout plus its palette tokens (`--bg`, `--card`, `--text`, `--muted`, …). It's inlined as the entire contents of a gallery page's `<style>`; each gallery keeps its own `<title>`, headings, and cards inline.
- **`widgets.css`** — shared widget styles that pair with the [`CtComponents`](../CtComponents.md) DOM wiring (`wireDropzone`, `wireSegmented`, `showError`), such as the `.ct-checkerboard` transparency backdrop. Structure plus a few tunable custom properties; colors come from the tool.
