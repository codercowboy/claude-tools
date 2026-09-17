  // ===== BEGIN PURE-LOGIC (unit-tested — see tests/unit/extract-inline-module.mjs) =====
  // =====================================================================
  // 9. Color formatting (pure functions — the primary unit-test surface)
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

  export { rgbaString, hexString };
  // ===== END PURE-LOGIC =====
