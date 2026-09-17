# `include/` — claude-tools-specific shared includes

Reserved for shared HTML/CSS/JS that is **specific to claude-tools** and not
general enough to promote to jason-code.

Right now it's empty: every shared asset this repo uses came *from* jason-code,
so those live next door in **[`../jbc-include/`](../jbc-include/)** as vendored
copies (see its `LEDGER.md` for origin, hash, and date).

When a genuinely claude-tools-only shared include appears, it goes here. The
build resolves `<<ct:include NAME>>` tokens against the vendored `jbc-include/`
today; add an `include/`-first lookup when the first local include lands.
