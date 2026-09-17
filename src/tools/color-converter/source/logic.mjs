  // ===== BEGIN PURE-LOGIC (unit-tested — see tests/unit/extract-inline-module.mjs) =====
  // =====================================================================
  // 3. parseColor + helpers (pure, no DOM)
  // =====================================================================
  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  // Comma form: rgb(r, g, b) / rgba(r, g, b, a) — alpha optional.
  // No `%` support: percentage channels are out of scope (DESIGN.md), so a
  // line like "rgb(50%, 0%, 0%)" simply fails to match and falls through to
  // null rather than being partially parsed.
  const RGB_COMMA_RE =
    /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i;

  // Modern slash form: rgb(r g b / a) — space-separated channels, required
  // alpha after a slash. Mixing comma and slash syntax matches neither regex.
  const RGB_SLASH_RE =
    /^rgba?\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*\)$/i;

  function clampChannel(n) { return Math.round(Math.min(255, Math.max(0, n))); }
  function clampAlpha(n) { return Math.min(1, Math.max(0, n)); }

  function parseHex(digits) {
    const d = digits.toLowerCase();
    if (d.length === 3 || d.length === 4) {
      const r = parseInt(d[0] + d[0], 16);
      const g = parseInt(d[1] + d[1], 16);
      const b = parseInt(d[2] + d[2], 16);
      const a = d.length === 4 ? parseInt(d[3] + d[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    // length 6 or 8
    const r = parseInt(d.slice(0, 2), 16);
    const g = parseInt(d.slice(2, 4), 16);
    const b = parseInt(d.slice(4, 6), 16);
    const a = d.length === 8 ? parseInt(d.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // Shared by both functional-form regexes. alphaGroup is undefined for the
  // comma form with no 4th argument -> alpha defaults to 1.
  function buildRgba(rGroup, gGroup, bGroup, alphaGroup) {
    const rNum = Number(rGroup);
    const gNum = Number(gGroup);
    const bNum = Number(bGroup);
    if (Number.isNaN(rNum) || Number.isNaN(gNum) || Number.isNaN(bNum)) return null;

    let a = 1;
    if (alphaGroup !== undefined) {
      const aNum = Number(alphaGroup);
      if (Number.isNaN(aNum)) return null;
      a = clampAlpha(aNum);
    }

    return {
      r: clampChannel(rNum),
      g: clampChannel(gNum),
      b: clampChannel(bNum),
      a,
    };
  }

  function parseColor(str) {
    const s = String(str ?? '').trim();
    if (s === '') return null;

    const hexMatch = s.match(HEX_RE);
    if (hexMatch) return parseHex(hexMatch[1]);

    const comma = s.match(RGB_COMMA_RE);
    if (comma) return buildRgba(comma[1], comma[2], comma[3], comma[4]);

    const slash = s.match(RGB_SLASH_RE);
    if (slash) return buildRgba(slash[1], slash[2], slash[3], slash[4]);

    return null;
  }

  // =====================================================================
  // 4. Canonical formatters (pure, match color-picker)
  // =====================================================================
  function rgbaString({ r, g, b, a }) {
    const alpha = Number.isInteger(a) ? a : Math.round(a * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function hexString({ r, g, b, a }) {
    const h = (n) => n.toString(16).padStart(2, '0');
    const base = `#${h(r)}${h(g)}${h(b)}`;
    return a < 1 ? `${base}${h(Math.round(a * 255))}` : base;
  }

  export { parseColor, parseHex, buildRgba, clampChannel, clampAlpha, rgbaString, hexString };
  // ===== END PURE-LOGIC =====
